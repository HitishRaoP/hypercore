use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio_util::io::StreamReader;

/// Payload the scheduler routes down the agent's SSE stream.
/// Same shape as POST /deployment on the API.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentRequest {
    pub deployment_id: String,
    pub machine_id: String,
    pub object_key: String,
}

#[derive(Debug, Clone)]
pub struct SseConfig {
    /// e.g. "http://127.0.0.1:8080" — the only thing the user configures.
    /// No RabbitMQ URL / credentials are needed.
    pub coordinator_url: String,
    pub machine_id: String,
}

fn stream_url(config: &SseConfig) -> String {
    format!(
        "{}/agents/events?machineId={}",
        config.coordinator_url.trim_end_matches('/'),
        config.machine_id
    )
}

async fn acknowledge(
    client: &reqwest::Client,
    config: &SseConfig,
    request: &DeploymentRequest,
    status: &str,
    message: Option<String>,
) {
    let url = format!(
        "{}/deployment/{}/ack",
        config.coordinator_url.trim_end_matches('/'),
        request.deployment_id
    );
    let body = serde_json::json!({
        "machineId": config.machine_id,
        "status": status,
        "message": message,
    });
    match client.post(&url).json(&body).send().await {
        Ok(response) => {
            if !response.status().is_success() {
                eprintln!("Ack rejected ({}): {}", response.status(), request.deployment_id);
            }
        }
        Err(error) => eprintln!("Ack failed for {}: {error}", request.deployment_id),
    }
}

fn handle_deployment(request: &DeploymentRequest, expected_machine: &str) -> (String, Option<String>) {
    if request.machine_id != expected_machine {
        return (
            "ignored".to_owned(),
            Some(format!("belongs to machine {}", request.machine_id)),
        );
    }

    println!("========================================");
    println!("Received deployment request (SSE)");
    println!("Deployment ID : {}", request.deployment_id);
    println!("Machine ID    : {}", request.machine_id);
    println!("Object Key    : {}", request.object_key);
    println!("========================================");

    /*
     * TODO:
     *
     * Same pipeline as before, unchanged by the transport swap:
     *
     * 1. Download the ZIP from R2 using object_key.
     * 2. Unzip the project.
     * 3. Convert TypeScript -> JavaScript (esbuild).
     * 4. Compile/build WebAssembly (javy).
     * 5. Execute/deploy the generated application.
     * 6. Ack result back to the coordinator (done below).
     */

    ("done".to_owned(), None)
}

/// Minimal SSE reader over reqwest's byte stream.
/// Reconnects with backoff so a scheduler restart / network blip
/// does not require reinstalling or re-credentialing the agent.
pub async fn start_worker(config: SseConfig) {
    let client = reqwest::Client::new();
    let mut backoff = Duration::from_secs(1);

    loop {
        let url = stream_url(&config);
        println!("Connecting to scheduler SSE: {url}");

        let response = client
            .get(&url)
            .header("Accept", "text/event-stream")
            .send()
            .await;

        let response = match response {
            Ok(response) => response,
            Err(error) => {
                eprintln!("SSE connect failed: {error}. Retrying in {backoff:?}...");
                tokio::time::sleep(backoff).await;
                backoff = (backoff * 2).min(Duration::from_secs(30));
                continue;
            }
        };

        if !response.status().is_success() {
            eprintln!(
                "SSE rejected ({}). Retrying in {backoff:?}...",
                response.status()
            );
            tokio::time::sleep(backoff).await;
            backoff = (backoff * 2).min(Duration::from_secs(30));
            continue;
        }

        println!("Connected to scheduler. Waiting for deployment requests...");
        backoff = Duration::from_secs(1);

        let byte_stream = response
            .bytes_stream()
            .map(|chunk| chunk.map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error)));
        let reader = StreamReader::new(byte_stream);
        let mut lines = BufReader::new(reader).lines();

        let mut current_event = String::new();
        let mut current_data = String::new();

        loop {
            let line = match lines.next_line().await {
                Ok(line) => line,
                Err(error) => {
                    eprintln!("SSE read error: {error}");
                    break;
                }
            };

            let Some(line) = line else {
                eprintln!("SSE stream closed by scheduler. Reconnecting...");
                break;
            };

            if line.is_empty() {
                // Blank line = dispatch accumulated event.
                if current_event == "deployment" && !current_data.trim().is_empty() {
                    match serde_json::from_str::<DeploymentRequest>(&current_data) {
                        Ok(request) => {
                            let (status, message) =
                                handle_deployment(&request, &config.machine_id);
                            if status != "ignored" {
                                println!("Deployment {} finished: {status}", request.deployment_id);
                            }
                            acknowledge(&client, &config, &request, &status, message).await;
                        }
                        Err(error) => eprintln!("Invalid deployment event: {error}"),
                    }
                }
                current_event.clear();
                current_data.clear();
                continue;
            }

            if line.starts_with(':') {
                continue; // heartbeat / comment
            }

            if let Some(event) = line.strip_prefix("event:") {
                current_event = event.trim().to_owned();
            } else if let Some(data) = line.strip_prefix("data:") {
                if !current_data.is_empty() {
                    current_data.push('\n');
                }
                current_data.push_str(data.trim());
            }
        }

        tokio::time::sleep(backoff).await;
        backoff = (backoff * 2).min(Duration::from_secs(30));
    }
}
