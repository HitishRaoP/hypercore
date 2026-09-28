use futures_util::StreamExt;
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio_util::io::StreamReader;

/// One file reference inside a deployment (R2 key + original name).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentFileRef {
    pub name: String,
    pub key: String,
}

/// Payload the scheduler routes down the agent's SSE stream.
/// Same shape as POST /deployment on the API. `object_key` is kept for
/// backwards compatibility (it points at the entrypoint file); newer
/// servers also send `files`, `worker_name` and `entrypoint`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentRequest {
    pub deployment_id: String,
    pub machine_id: String,
    pub object_key: String,
    #[serde(default)]
    pub worker_name: Option<String>,
    #[serde(default)]
    pub entrypoint: Option<String>,
    #[serde(default)]
    pub files: Option<Vec<DeploymentFileRef>>,
}

/// Payload the scheduler forwards per URL hit down the agent's SSE stream:
/// `event: invoke`. The agent runs the deployment's wasm locally and POSTs
/// the result to `/invocations/:invocationId/result`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InvokeRequest {
    pub invocation_id: String,
    pub deployment_id: String,
    #[serde(default)]
    pub worker_name: Option<String>,
    pub machine_id: String,
    #[serde(default)]
    pub artifact_key: Option<String>,
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub query: String,
    #[serde(default)]
    pub body_b64: Option<String>,
    #[serde(default = "default_invoke_timeout")]
    pub timeout_ms: u64,
}

fn default_invoke_timeout() -> u64 {
    8_000
}

#[derive(Debug, Clone)]
pub struct SseConfig {
    /// e.g. "http://127.0.0.1:8080" — the only thing the user configures.
    /// No RabbitMQ URL / credentials are needed.
    pub coordinator_url: String,
    pub machine_id: String,
    /// Directory holding the bundled `esbuild`/`javy` helpers
    /// (Tauri `bundle.resources`, i.e. `<resource_dir>/tools`).
    /// When `None`, helpers resolve from the exe directory or `PATH`.
    pub tools_dir: Option<PathBuf>,
}

fn stream_url(config: &SseConfig) -> String {
    format!(
        "{}/agents/events?machineId={}",
        config.coordinator_url.trim_end_matches('/'),
        config.machine_id
    )
}

fn base_url(config: &SseConfig) -> String {
    config.coordinator_url.trim_end_matches('/').to_owned()
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
        base_url(config),
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

fn work_dir(deployment_id: &str) -> PathBuf {
    dirs::cache_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("hypercore")
        .join("deployments")
        .join(deployment_id)
}

/// Download one R2 object *through* the coordinator (the agent holds no R2
/// credentials): GET /code-upload/file?key=<r2-key>.
async fn download_file(
    client: &reqwest::Client,
    config: &SseConfig,
    key: &str,
    dest: &Path,
) -> Result<u64, String> {
    let url = format!("{}/code-upload/file?key={}", base_url(config), key);
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("download request failed for {key}: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("download rejected for {key}: {}", response.status()));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("download body failed for {key}: {e}"))?;
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("mkdir failed: {e}"))?;
    }
    tokio::fs::write(dest, &bytes)
        .await
        .map_err(|e| format!("write {} failed: {e}", dest.display()))?;
    Ok(bytes.len() as u64)
}

/// TS -> JS via the bundled esbuild first, then `PATH` (`esbuild`,
/// `npx esbuild`, `bun build`). Falls back to a byte copy (renamed to .js)
/// so the pipeline still produces an artifact on machines without a toolchain.
async fn bundle_ts_to_js(
    entry: &Path,
    out_js: &Path,
    tools_dir: Option<&Path>,
) -> Result<String, String> {
    let entry_str = entry.to_string_lossy().to_string();
    let out_str = out_js.to_string_lossy().to_string();
    let bundle_args = || {
        vec![
            entry_str.clone(),
            "--bundle".into(),
            "--format=esm".into(),
            "--platform=neutral".into(),
            format!("--outfile={out_str}"),
        ]
    };

    let mut attempts: Vec<Vec<String>> = Vec::new();
    // Bundled helper shipped inside the installer — deterministic, no
    // Node/bun required on the user's machine.
    if let Some(bundled) = crate::tools::resolve_tool(tools_dir, "esbuild") {
        let mut args = vec![bundled.to_string_lossy().to_string()];
        args.extend(bundle_args());
        attempts.push(args);
    }
    attempts.push({
        let mut args = vec!["esbuild".to_owned()];
        args.extend(bundle_args());
        args
    });
    attempts.push({
        let mut args = vec!["npx".to_owned(), "--yes".into(), "esbuild".into()];
        args.extend(bundle_args());
        args
    });
    attempts.push(vec![
        "bun".into(),
        "build".into(),
        entry_str.clone(),
        "--outfile".into(),
        out_str.clone(),
    ]);

    let mut last_err = String::new();
    for args in attempts {
        let (bin, rest) = args.split_first().expect("non-empty");
        match tokio::process::Command::new(bin).args(rest).output().await {
            Ok(out) if out.status.success() => {
                return Ok(format!("bundled with {}", bin));
            }
            Ok(out) => {
                last_err = String::from_utf8_lossy(&out.stderr).trim().to_owned();
            }
            Err(e) => last_err = format!("{bin} not found: {e}"),
        }
    }

    // Fallback: plain copy so javy still has an input.
    match tokio::fs::copy(entry, out_js).await {
        Ok(_) => Ok(format!("esbuild unavailable ({last_err}); copied TS as JS fallback")),
        Err(e) => Err(format!("esbuild failed ({last_err}) and fallback copy failed: {e}")),
    }
}

/// JS -> wasm via the bundled javy (`javy build bundle.js -o worker.wasm`).
/// A javy failure is fatal for the deployment: uploading a stand-in artifact
/// would report "done" yet fail every invocation with `missing _start`.
async fn compile_js_to_wasm(
    js: &Path,
    out_wasm: &Path,
    tools_dir: Option<&Path>,
) -> Result<String, String> {
    let javy = crate::tools::resolve_tool(tools_dir, "javy")
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "javy".to_owned());
    let out = tokio::process::Command::new(&javy)
        .args(["build", &js.to_string_lossy(), "-o", &out_wasm.to_string_lossy()])
        .output()
        .await;

    match out {
        Ok(o) if o.status.success() => Ok(format!("compiled with javy ({javy})")),
        Ok(o) => {
            let reason = String::from_utf8_lossy(&o.stderr).trim().to_owned();
            Err(format!(
                "javy ({javy}) failed ({reason}); check the agent's toolchain status, then reinstall the agent or run `bun run fetch:tools` (dev)"
            ))
        }
        Err(e) => {
            let searched = crate::tools::searched_locations(tools_dir, "javy")
                .iter()
                .map(|p| p.display().to_string())
                .collect::<Vec<_>>()
                .join(", ");
            Err(format!(
                "javy not runnable ({e}); searched [{searched}] and PATH; check the agent's toolchain status, then reinstall the agent or run `bun run fetch:tools` (dev)"
            ))
        }
    }
}

/// Upload the built wasm *through* the coordinator:
/// POST /deployment/:id/artifact (multipart `wasm`). The server PUTs it to
/// R2 with the S3 SDK under artifacts/{deploymentId}/worker.wasm.
async fn upload_artifact(
    client: &reqwest::Client,
    config: &SseConfig,
    request: &DeploymentRequest,
    wasm_path: &Path,
) -> Result<String, String> {
    let bytes = tokio::fs::read(wasm_path)
        .await
        .map_err(|e| format!("read wasm failed: {e}"))?;
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name("worker.wasm")
        .mime_str("application/wasm")
        .map_err(|e| format!("mime failed: {e}"))?;
    let form = reqwest::multipart::Form::new().part("wasm", part);
    let url = format!("{}/deployment/{}/artifact", base_url(config), request.deployment_id);
    let body = serde_json::json!({ "machineId": config.machine_id });
    // machineId travels as query-independent field; server reads deploymentId from path.
    let _ = body;
    let response = client
        .post(&url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("artifact upload failed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("artifact rejected: {}", response.status()));
    }
    let text = response.text().await.unwrap_or_default();
    Ok(text)
}

/// Full Execution-Plane pipeline:
/// pull files from R2 (via server) -> esbuild TS->JS -> javy JS->wasm
/// -> upload wasm to R2 (via server) -> ack.
async fn run_deployment(
    client: &reqwest::Client,
    config: &SseConfig,
    request: &DeploymentRequest,
) -> Result<String, String> {
    let dir = work_dir(&request.deployment_id);
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("workdir failed: {e}"))?;

    // Resolve the file list: prefer the scheduler's `files`, else fall back
    // to the single legacy `object_key` (treated as the entrypoint).
    let entry_name = request
        .entrypoint
        .clone()
        .unwrap_or_else(|| "index.ts".to_owned());
    let refs: Vec<DeploymentFileRef> = request.files.clone().unwrap_or_else(|| vec![DeploymentFileRef {
        name: entry_name.clone(),
        key: request.object_key.clone(),
    }]);

    for file_ref in &refs {
        let dest = dir.join(&file_ref.name);
        let n = download_file(client, config, &file_ref.key, &dest).await?;
        println!("  pulled {} ({} bytes) -> {}", file_ref.key, n, dest.display());
    }

    // Find the TS entrypoint on disk.
    let entry_disk = dir.join(&entry_name);
    let entry_disk = if tokio::fs::try_exists(&entry_disk).await.unwrap_or(false) {
        entry_disk
    } else {
        // Fall back to the first .ts file pulled.
        let mut entries = tokio::fs::read_dir(&dir).await.map_err(|e| format!("readdir failed: {e}"))?;
        let mut found: Option<PathBuf> = None;
        while let Ok(Some(e)) = entries.next_entry().await {
            if e.path().extension().and_then(|x| x.to_str()) == Some("ts") {
                found = Some(e.path());
                break;
            }
        }
        found.ok_or_else(|| "no .ts entrypoint found after download".to_owned())?
    };

    let bundle_js = dir.join("bundle.js");
    let via = bundle_ts_to_js(&entry_disk, &bundle_js, config.tools_dir.as_deref()).await?;
    println!("  ts->js: {via}");

    let worker_wasm = dir.join("worker.wasm");
    let via = compile_js_to_wasm(&bundle_js, &worker_wasm, config.tools_dir.as_deref()).await?;
    println!("  js->wasm: {via}");

    let receipt = upload_artifact(client, config, request, &worker_wasm).await?;
    println!("  wasm uploaded via server: {receipt}");

    Ok(format!("deployed {} -> wasm", entry_disk.display()))
}

struct InvokeOutcome {
    ok: bool,
    code: Option<i32>,
    stdout_b64: Option<String>,
    stderr: Option<String>,
    error: Option<String>,
    timed_out: bool,
}

/// Run one URL-hit invocation locally (wasmtime) and report the result back
/// to the coordinator, which relays it to the waiting HTTP response.
async fn handle_invoke(client: reqwest::Client, config: SseConfig, request: InvokeRequest) {
    println!(
        "invoke {}: {} {} (deployment {})",
        request.invocation_id, request.method, request.path, request.deployment_id
    );
    let outcome = run_invocation(&client, &config, &request).await;
    let url = format!(
        "{}/invocations/{}/result",
        base_url(&config),
        request.invocation_id
    );
    let body = serde_json::json!({
        "machineId": config.machine_id,
        "ok": outcome.ok,
        "code": outcome.code,
        "stdoutB64": outcome.stdout_b64,
        "stderr": outcome.stderr,
        "error": outcome.error,
        "timedOut": outcome.timed_out,
    });
    match client.post(&url).json(&body).send().await {
        Ok(response) if response.status().is_success() => {
            println!("invoke {} reported: ok={}", request.invocation_id, outcome.ok);
        }
        Ok(response) => {
            eprintln!("invoke {} result rejected: {}", request.invocation_id, response.status());
        }
        Err(error) => {
            eprintln!("invoke {} result post failed: {error}", request.invocation_id);
        }
    }
}

async fn run_invocation(
    client: &reqwest::Client,
    config: &SseConfig,
    request: &InvokeRequest,
) -> InvokeOutcome {
    let fail = |error: String| InvokeOutcome {
        ok: false,
        code: None,
        stdout_b64: None,
        stderr: None,
        error: Some(error),
        timed_out: false,
    };
    if request.machine_id != config.machine_id {
        return fail(format!("belongs to machine {}", request.machine_id));
    }

    // The deploy pipeline left worker.wasm in the deployment work dir; if the
    // agent restarted since, re-pull the artifact through the coordinator
    // (the agent never holds R2 credentials).
    let wasm_path = work_dir(&request.deployment_id).join("worker.wasm");
    if !wasm_path.is_file() {
        match request.artifact_key.clone() {
            Some(key) => {
                println!("  artifact not cached, pulling {key}");
                if let Err(error) = download_file(client, config, &key, &wasm_path).await {
                    return fail(format!("artifact download failed: {error}"));
                }
            }
            None => return fail("no wasm artifact for this deployment".to_owned()),
        }
    }
    let wasm = match tokio::fs::read(&wasm_path).await {
        Ok(bytes) => bytes,
        Err(error) => return fail(format!("read wasm failed: {error}")),
    };
    let stdin = match &request.body_b64 {
        Some(encoded) => match B64.decode(encoded) {
            Ok(bytes) => bytes,
            Err(error) => return fail(format!("bad request body: {error}")),
        },
        None => Vec::new(),
    };
    let env = vec![
        ("HC_METHOD".to_owned(), request.method.clone()),
        ("HC_PATH".to_owned(), request.path.clone()),
        ("HC_QUERY".to_owned(), request.query.clone()),
    ];
    let input = crate::executor::ExecInput {
        wasm,
        stdin,
        env,
        timeout_ms: request.timeout_ms,
    };
    match tokio::task::spawn_blocking(move || crate::executor::execute(input)).await {
        Ok(Ok(output)) => InvokeOutcome {
            ok: output.code == 0,
            code: Some(output.code),
            stdout_b64: Some(B64.encode(&output.stdout)),
            stderr: Some(output.stderr),
            error: if output.code == 0 {
                None
            } else {
                Some(format!("function exited with code {}", output.code))
            },
            timed_out: false,
        },
        Ok(Err(crate::executor::ExecError::TimedOut)) => InvokeOutcome {
            ok: false,
            code: None,
            stdout_b64: None,
            stderr: None,
            error: Some("function timed out".to_owned()),
            timed_out: true,
        },
        Ok(Err(error)) => InvokeOutcome {
            ok: false,
            code: None,
            stdout_b64: None,
            stderr: None,
            error: Some(error.to_string()),
            timed_out: false,
        },
        Err(error) => InvokeOutcome {
            ok: false,
            code: None,
            stdout_b64: None,
            stderr: None,
            error: Some(format!("executor task failed: {error}")),
            timed_out: false,
        },
    }
}

fn handle_routing(request: &DeploymentRequest, expected_machine: &str) -> Result<(), String> {
    if request.machine_id != expected_machine {
        return Err(format!("belongs to machine {}", request.machine_id));
    }
    Ok(())
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
                            if let Err(reason) = handle_routing(&request, &config.machine_id) {
                                acknowledge(&client, &config, &request, "ignored", Some(reason)).await;
                            } else {
                                println!("========================================");
                                println!("Received deployment (SSE)");
                                println!("Deployment : {}", request.deployment_id);
                                println!("Worker     : {}", request.worker_name.as_deref().unwrap_or("-"));
                                println!("Entrypoint : {}", request.entrypoint.as_deref().unwrap_or("-"));
                                println!("Object Key : {}", request.object_key);
                                println!("========================================");
                                match run_deployment(&client, &config, &request).await {
                                    Ok(summary) => {
                                        println!("Deployment {} finished: {summary}", request.deployment_id);
                                        acknowledge(&client, &config, &request, "done", Some(summary)).await;
                                    }
                                    Err(error) => {
                                        eprintln!("Deployment {} failed: {error}", request.deployment_id);
                                        acknowledge(&client, &config, &request, "failed", Some(error)).await;
                                    }
                                }
                            }
                        }
                        Err(error) => eprintln!("Invalid deployment event: {error}"),
                    }
                } else if current_event == "invoke" && !current_data.trim().is_empty() {
                    // URL hits run concurrently so one slow function never
                    // head-of-line blocks deployments or other invocations.
                    match serde_json::from_str::<InvokeRequest>(&current_data) {
                        Ok(request) => {
                            let task_client = client.clone();
                            let task_config = config.clone();
                            tokio::spawn(async move {
                                handle_invoke(task_client, task_config, request).await;
                            });
                        }
                        Err(error) => eprintln!("Invalid invoke event: {error}"),
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
