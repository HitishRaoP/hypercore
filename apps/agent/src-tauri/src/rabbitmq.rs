use futures_util::StreamExt;

use lapin::{
    options::{
        BasicAckOptions, BasicConsumeOptions, BasicNackOptions, BasicQosOptions,
        ExchangeDeclareOptions, QueueBindOptions, QueueDeclareOptions,
    },
    types::FieldTable,
    Connection, ConnectionProperties, ExchangeKind,
};
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentRequest {
    pub deployment_id: String,
    pub machine_id: String,
    pub object_key: String,
}

pub async fn start_worker(
    machine_id: String,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let rabbitmq_url = env::var("RABBITMQ_URL")?;

    let exchange =
        env::var("RABBITMQ_EXCHANGE").unwrap_or_else(|_| "hypercore.deployments".to_owned());

    let queue_prefix =
        env::var("DEPLOYMENT_QUEUE_PREFIX").unwrap_or_else(|_| "hypercore.agent.".to_owned());

    /*
     * The machine ID uniquely identifies this HC Agent.
     *
     * Example:
     *
     * machine_id = "550e8400-e29b-41d4-a716-446655440000"
     *
     * queue =
     * "hypercore.agent.550e8400-e29b-41d4-a716-446655440000"
     */
    let queue_name = format!("{queue_prefix}{machine_id}");

    println!("Connecting to RabbitMQ...");

    let connection = Connection::connect(
        &rabbitmq_url,
        ConnectionProperties::default().enable_auto_recover(),
    )
    .await?;

    println!("Connected to RabbitMQ");

    let channel = connection.create_channel().await?;

    /*
     * Process only one deployment at a time.
     */
    channel
        .basic_qos(1, BasicQosOptions { global: false })
        .await?;

    /*
     * Create deployment exchange.
     */
    channel
        .exchange_declare(
            exchange.clone().into(),
            ExchangeKind::Direct,
            ExchangeDeclareOptions {
                durable: true,
                ..Default::default()
            },
            FieldTable::default(),
        )
        .await?;

    /*
     * Create this machine's queue.
     */
    channel
        .queue_declare(
            queue_name.clone().into(),
            QueueDeclareOptions {
                durable: true,
                exclusive: false,
                auto_delete: false,
                ..Default::default()
            },
            FieldTable::default(),
        )
        .await?;

    /*
     * Bind this machine's queue using the machine_id
     * as the RabbitMQ routing key.
     *
     * Example:
     *
     * routing_key = "550e8400-e29b-41d4-a716-446655440000"
     */
    channel
        .queue_bind(
            queue_name.clone().into(),
            exchange.clone().into(),
            machine_id.clone().into(),
            QueueBindOptions::default(),
            FieldTable::default(),
        )
        .await?;

    println!("Machine ID: {machine_id}");
    println!("Queue: {queue_name}");
    println!("Waiting for deployment requests...");

    let mut consumer = channel
        .basic_consume(
            queue_name.clone().into(),
            format!("worker-{machine_id}").into(),
            BasicConsumeOptions {
                no_ack: false,
                ..Default::default()
            },
            FieldTable::default(),
        )
        .await?;

    while let Some(delivery) = consumer.next().await {
        let delivery = match delivery {
            Ok(delivery) => delivery,
            Err(error) => {
                eprintln!("RabbitMQ consumer error: {error}");
                continue;
            }
        };

        let request: DeploymentRequest = match serde_json::from_slice(&delivery.data) {
            Ok(request) => request,
            Err(error) => {
                eprintln!("Invalid deployment request: {error}");

                delivery
                    .nack(BasicNackOptions {
                        requeue: false,
                        multiple: false,
                    })
                    .await?;

                continue;
            }
        };

        /*
         * Make sure this deployment belongs to this machine.
         */
        if request.machine_id != machine_id {
            eprintln!(
                "Ignoring deployment {} because it belongs to machine {}",
                request.deployment_id, request.machine_id
            );

            delivery.ack(BasicAckOptions::default()).await?;

            continue;
        }

        println!("========================================");
        println!("Received deployment request");
        println!("Deployment ID : {}", request.deployment_id);
        println!("Machine ID    : {}", request.machine_id);
        println!("Object Key    : {}", request.object_key);
        println!("========================================");

        /*
         * TODO:
         *
         * Implement the actual deployment pipeline:
         *
         * 1. Download the ZIP from R2 using object_key.
         * 2. Unzip the project.
         * 3. Convert TypeScript -> JavaScript.
         * 4. Compile/build WebAssembly.
         * 5. Execute/deploy the generated application.
         * 6. Report deployment status back to the coordinator.
         *
         * For now, we only print the deployment request.
         */

        delivery.ack(BasicAckOptions::default()).await?;

        println!("Deployment request acknowledged");
    }

    Ok(())
}
