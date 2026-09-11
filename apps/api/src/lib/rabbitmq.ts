import amqp, { type Channel, type ChannelModel } from "amqplib";
import { env } from "./env";

const RABBITMQ_URL = env.CLOUDAMQP_URL

const RABBITMQ_EXCHANGE = process.env.RABBITMQ_EXCHANGE

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

export async function connectRabbitMQ() {
  if (channel) {
    return channel;
  }

  console.log("Connecting to RabbitMQ...");

  connection = await amqp.connect(RABBITMQ_URL);

  connection.on("error", (error) => {
    console.error("RabbitMQ connection error:", error);
  });

  connection.on("close", () => {
    console.log("RabbitMQ connection closed");

    connection = null;
    channel = null;
  });

  channel = await connection.createChannel();

  /*
   * Create the exchange if it doesn't already exist.
   *
   * "direct" means RabbitMQ routes messages based on
   * an exact routing-key match.
   */
  await channel.assertExchange(
    env.RABBITMQ_EXCHANGE,
    "direct",
    {
      durable: true,
    },
  );

  console.log("Connected to RabbitMQ");
  console.log(`Exchange: ${RABBITMQ_EXCHANGE}`);

  return channel;
}

export interface DeploymentRequest {
  deploymentId: string;
  machineId: string;
  objectKey: string;
}

export async function sendDeployment(
  request: DeploymentRequest,
) {
  const channel = await connectRabbitMQ();

  const message = Buffer.from(
    JSON.stringify(request),
  );

  /*
   * machineId is the routing key.
   *
   * RabbitMQ will send this message to the queue
   * bound with this exact machineId.
   */
  const published = channel.publish(
    env.RABBITMQ_EXCHANGE,
    request.machineId,
    message,
    {
      persistent: true,
      contentType: "application/json",
    },
  );

  if (!published) {
    console.warn(
      "RabbitMQ write buffer is full",
    );
  }

  console.log("Deployment request sent:");
  console.log(request);
}