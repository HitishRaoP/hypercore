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
* Routing deployment requests to agents via the in-process scheduler (SSE)

#### Storage

* **PostgreSQL** stores metadata such as users, functions, machines, versions, and deployments.
* **Cloudflare R2** stores TypeScript source files and deployment artifacts.

---

### Message Plane

The message plane handles communication between the control plane and execution machines.

It is an **in-process scheduler with Server-Sent Events (SSE)** — no external
broker, so the installable agent needs no RabbitMQ credentials.

Each execution machine opens one outbound SSE stream:

```text
GET /agents/events?machineId=<machine-id>
```

The scheduler keeps that stream open and routes each deployment or function
request to the selected machine by writing an event into its stream:

```text
event: deployment
data: {"deploymentId":"...","machineId":"...","objectKey":"..."}
```

The scheduler:

1. Receives a deployment or function request.
2. Selects an available execution machine.
3. Routes the request down that machine's open SSE stream.

Agents acknowledge over plain HTTP (`POST /deployment/:id/ack`).
This allows multiple machines to process workloads independently.

---

### Execution Plane

The execution plane consists of computers running the **Hypercore Agent**.

The agent is responsible for:

* Opening an outbound SSE stream to the scheduler (no broker credentials)
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
* The scheduler selects an available execution machine and routes the
  deployment down its open SSE stream (`POST /deployment`).
* The Hypercore Agent receives the deployment event.
* The agent downloads the source files from R2.
* TypeScript is built into JavaScript.
* Javy converts the JavaScript into WebAssembly.
* The resulting WASM module is deployed on the execution machine.

### 3. Invoke

After deployment:

* An invocation request is sent to the control plane.
* The scheduler selects an available machine running the deployed function.
* The request is routed down that machine's SSE stream.
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
