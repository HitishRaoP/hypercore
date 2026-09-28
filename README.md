<p align="center">
    <img src="https://github.com/HitishRaoP/hypercore/blob/main/apps/agent/src-tauri/icons/hypercore.png" height="96">

</p>

# Hypercore

Hypercore is a distributed runtime for executing **TypeScript functions** on available computers instead of relying entirely on centralized cloud compute.

The system separates function management, message routing, and function execution into three planes.

## Architecture

### Control Plane

The control plane manages users, functions, deployments, metadata, and source files.

#### Client

Built with **Next.js**.

Responsible for:

* Creating and editing TypeScript functions
* Managing function versions
* Creating deployments
* Invoking functions

#### Server

Built with **Express.js**.

Responsible for:

* Handling API requests
* Managing function metadata
* Managing deployments
* Registering execution machines
* Uploading source files
* Sending messages to RabbitMQ

#### Storage

* **PostgreSQL** stores metadata such as users, functions, machines, versions, and deployments.
* **Cloudflare R2** stores TypeScript source files and deployment artifacts.

---

### Message Plane

The message plane handles communication between the control plane and execution machines.

**RabbitMQ** is used as the message broker.

Each execution machine has a unique `machineId` and an associated queue.

The scheduler:

1. Receives a deployment or function request.
2. Selects an available execution machine.
3. Routes the request to that machine's queue.

This allows multiple machines to process workloads independently.

---

### Execution Plane

The execution plane consists of computers running the **Hypercore Agent**.

The agent is responsible for:

* Consuming messages from RabbitMQ
* Downloading function files from R2
* Building TypeScript
* Converting JavaScript to WebAssembly using **Javy**
* Executing the WebAssembly module
* Returning execution results

Execution machines provide the compute resources for running functions. They do not need to belong to the user who created the function.

## Function Lifecycle

### 1. Create

When a user creates or updates a function:

* The source code is sent to the server.
* Function metadata is stored in PostgreSQL.
* Source files are stored in R2.

The function is **not built or deployed at this stage**.

### 2. Deploy

When the user deploys a function:

* A deployment is created.
* Deployment metadata is stored in PostgreSQL.
* A deployment request is sent to RabbitMQ.
* The scheduler selects an available execution machine.
* The Hypercore Agent receives the deployment request.
* The agent downloads the source files from R2.
* TypeScript is built into JavaScript.
* Javy converts the JavaScript into WebAssembly.
* The resulting WASM module is deployed on the execution machine.

### 3. Invoke

After deployment:

* An invocation request is sent to the control plane.
* The scheduler selects an available machine running the deployed function.
* The request is routed through RabbitMQ.
* The Hypercore Agent executes the function.
* The result is returned to the caller.

## Data Storage

### PostgreSQL

Stores structured data including:

* Users
* Functions
* Function versions
* Execution machines
* Deployments
* Deployment status
* Machine IDs

### Cloudflare R2

Stores:

* TypeScript source files
* Function bundles
* Deployment artifacts

Execution machines retrieve the required files from R2 when deploying a function.

## Execution Nodes

An execution node is a computer running the **Hypercore Agent**.

A node registers with the control plane and becomes available for workloads.

Multiple execution nodes can operate simultaneously, allowing function workloads to be distributed across available computers.

The control plane is responsible for coordination and storage, while execution nodes provide the compute resources required to build, deploy, and execute TypeScript functions.
