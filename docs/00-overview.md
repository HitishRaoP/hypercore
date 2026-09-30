# 00 - Overview

## 1. What Hypercore is

Hypercore is a system that runs TypeScript functions on real computers.

Most software that runs code for its users sends that work to a big shared
cloud data centre. Those data centres are expensive, and every customer shares
the same machines. Hypercore takes a different route: it lets **any computer
join in** and run the work, and the control plane decides which computer should
handle which job.

The result is a system with three clear jobs:

1. **Manage** functions — write them, save them, list them, know who owns them.
2. **Route** work — get a job from the person who asked for it to the right
   computer.
3. **Execute** work — turn TypeScript into something runnable, run it, and
   return the answer.

Keeping those three jobs in separate places makes the whole system easier to
reason about, and it is the single most important idea in this codebase.

---

## 2. The big picture

```text
            ┌──────────────────────────────────────────────┐
            │            1. CONTROL PLANE                   │
            │                                              │
   Person ──▶  Dashboard (browser)  ──▶  API server        │
            │                            ├─ PostgreSQL     │
            │                            │  (what exists)  │
            │                            └─ Cloudflare R2  │
            │                               (the files)    │
            └──────────────────────────────────────────────┘
                              │
                              │  2. MESSAGE PLANE
                              │  one live connection per computer
                              ▼
            ┌──────────────────────────────────────────────┐
            │            3. EXECUTION PLANE                │
            │                                              │
            │   Agent on Computer A   Agent on Computer B  │
            │   ├ reads its live      ├ reads its live     │
            │   │  connection         │  connection       │
            │   ├ downloads code     ├ downloads code     │
            │   ├ TypeScript → JS    ├ TypeScript → JS    │
            │   ├ JS → WebAssembly   ├ JS → WebAssembly   │
            │   └ runs the code      └ runs the code      │
            └──────────────────────────────────────────────┘
```

---

## 3. The three planes, in plain words

### 3.1 Control Plane — "the office that keeps the books"

This is the **API server** plus the **dashboard** people use to talk to it.

The control plane is responsible for:

- Storing who the users are and who is signed in.
- Storing the source code of every function.
- Storing which function has been deployed, and where.
- Keeping a list of every computer that has joined, with its specs.
- Answering the question "is this computer online right now?"

It **never** runs user code. If a customer writes a function that loops
forever, this plane is not the thing that hangs.

| Part | Technology | Where the code lives |
|------|-----------|----------------------|
| Dashboard | Next.js | `apps/dashboard` |
| API server | Express 5 on Node | `apps/api` |
| Metadata store | PostgreSQL | reached through `packages/db` |
| File store | Cloudflare R2 | reached through `apps/api/src/lib/s3.ts` |

### 3.2 Message Plane — "the walkie-talkie that stays open"

This is how the server tells a computer that work is waiting.

There are no queues to install and no passwords to hand out. Instead, **each
computer opens one long-lived connection to the server and keeps it open.**
The server holds that connection in memory and writes messages into it as
work arrives. The computer reads those messages and does the work.

The technology used for this is called **Server-Sent Events (SSE)**. You can
think of it as a one-way phone line: the computer listens, the server talks.

| Direction | How it works |
|-----------|--------------|
| Computer → server | One `GET /agents/events` request that never ends |
| Server → computer | The server writes lines into that same open response |

Because the computer only ever *makes* an outbound request, it works fine on a
home network with no router setup, and no broker credentials have to be
shipped inside the installer.

### 3.3 Execution Plane — "the machines doing the work"

This is the **Hypercore Agent** — a small desktop application that a person
installs on their own computer.

The agent is responsible for:

- Holding its connection to the server open and reconnecting if it drops.
- Downloading the function's source files when a deploy job arrives.
- Turning TypeScript into plain JavaScript using a tool called **esbuild**.
- Turning that JavaScript into **WebAssembly** using a tool called **Javy**.
- Handing the finished WebAssembly file back to the server.
- Running the WebAssembly file later when somebody calls the function.
- Sending the result back to the server.

| Part | Technology | Where the code lives |
|------|-----------|----------------------|
| Desktop shell | Tauri 2 | `apps/agent/src-tauri` |
| Window UI | React 19 | `apps/agent/src` |
| Code runner | wasmtime (WASI) | `apps/agent/src-tauri/src/executor.rs` |

---

## 4. What happens when someone calls a function

This is the heart of the product. Read it slowly — every one of these steps is
documented in detail in [05 - End-to-End Flows](./05-end-to-end-flows.md).

```text
1. Someone opens  https://api.example.com/invoke/<deployment-id>

2. The API server looks up that deployment in PostgreSQL.
   ├─ not found              → 404
   └─ wasm not built yet    → 409 "still compiling"

3. The API server writes an "invoke" event into the agent's open connection.

4. The agent receives it, loads the WebAssembly file from its disk cache
   (or downloads it again if the agent restarted), and runs it.

5. The agent POSTs the result back to the API server.

6. Step 5 releases the HTTP request that was waiting in step 1.

7. The caller receives the function's output as plain text.
```

Two things to notice:

- **The server is just a relay.** It reads a request, passes it on, and waits.
  It does not execute anything.
- **The result travels by a second HTTP call.** The agent cannot answer the
  original request directly, because the original request was made by the
  caller, not by the agent. So the agent posts the result to the server, and
  the server hands it to whoever is still waiting.

---

## 5. The function lifecycle

A function moves through three stages in its life.

### Stage 1 — Write

The person writes TypeScript in the dashboard and uploads it. The server:

- Saves the files into Cloudflare R2.
- Saves the metadata into PostgreSQL.
- Does **not** build anything yet.

### Stage 2 — Deploy

The person picks a target computer and clicks deploy. The server:

1. Creates a deployment record.
2. Sends a `deployment` event down that computer's open connection.
3. Sets the record's status to `routed`.

Then the agent takes over:

1. Downloads each source file through the server (it has no storage
   credentials of its own).
2. Runs `esbuild` to turn TypeScript into one JavaScript file.
3. Runs `javy` to turn that JavaScript into a WebAssembly file.
4. Uploads the WebAssembly file back through the server into R2.
5. Tells the server "done", and the server sets the status to `built`.

### Stage 3 — Invoke

Now the function has a web address. Calling it runs the whole relay described
in section 4.

---

## 6. The two kinds of web address

Once a function is built, it is reachable at two addresses.

| Address | Example | Behaviour |
|---------|---------|-----------|
| **Deployment URL** | `/invoke/9f2c-…` | Always runs *this exact* deployment. Never changes. |
| **Worker URL** | `/w/my-function` | Always runs the newest deployment that has finished building. |

The worker URL is the one people usually share, because it survives every
redeploy.

---

## 7. Where state is kept

| What | Where | Why |
|------|-------|-----|
| Users, sessions, passkeys | PostgreSQL, tables `user` / `session` / `account` / `verification` / `passkey` | Needs to survive restarts and be queryable |
| Function metadata, deploy history | PostgreSQL, tables `deployments` and `invocations` | Needs to be searched and listed per user |
| Known computers | PostgreSQL, table `machines` | Needs to survive agent restarts |
| Function source files | Cloudflare R2, under `raw/<deployment-id>/` | Big text files, rarely read by the database |
| Built WebAssembly files | Cloudflare R2, under `artifacts/<deployment-id>/worker.wasm` | Binary blobs the database should not hold |
| Which computers are online | **In memory**, in the API process | A live fact that is true only right now |
| In-flight call results | **In memory**, in the API process | Waiting for an answer, gone after a restart |

That last row matters: if the API server restarts while a function is running,
the caller gets a timeout, and the database row stays at `running`. This is a
known trade-off, documented in
[04 - Data Model](./04-data-model.md).

---

## 8. Where to go next

- Want the full picture with diagrams and design decisions?
  → [01 - Architecture](./01-architecture.md)
- Want to know what every server function does?
  → [02 - API Reference](./02-api-reference.md)
- Want to know what every agent function does?
  → [03 - Agent Reference](./03-agent-reference.md)
- Want to know what the tables look like?
  → [04 - Data Model](./04-data-model.md)
- Want to debug something?
  → [05 - End-to-End Flows](./05-end-to-end-flows.md), then
  [06 - Setup and Runbook](./06-setup-and-runbook.md)

---

## 9. Glossary

Words the codebase uses, defined once so the rest of the docs can be short.

| Word | Meaning |
|------|---------|
| **Agent** | The desktop app installed on a customer's computer. Also called a node. |
| **Node** | The same thing as an agent. The word used in URLs and in the database. |
| **Machine** | Another word for the same thing. Used for the computer's own ID. |
| **Deployment** | One specific version of a function, built and pointed at one node. |
| **Worker** | The short, user-chosen name of a function, e.g. `my-function`. Globally unique. |
| **Entrypoint** | Which uploaded file is the one to build, e.g. `index.ts`. |
| **Artifact** | The finished WebAssembly file a build produces. |
| **Invocation** | One single call to a function. One URL hit equals one invocation. |
| **Coordinator** | The API server, from the agent's point of view. Same thing, different vantage point. |
| **Control plane** | The part that stores data and manages functions. |
| **Message plane** | The part that routes work to nodes. |
| **Execution plane** | The part that actually runs the code. |
| **SSE (Server-Sent Events)** | A plain HTTP connection that stays open so the server can push lines into it. |
| **WASM / WebAssembly** | A portable compiled binary format that many languages can target and that runs in a sandbox. |
| **WASI** | The small standard interface that lets a WebAssembly program read input and write output. |
| **esbuild** | The tool that turns TypeScript into JavaScript. |
| **Javy** | The tool that turns JavaScript into a WebAssembly module. |
| **wasmtime** | The Rust library that runs a WebAssembly module. The agent uses it. |
| **Drizzle** | The library that maps database tables to TypeScript types. |
| **R2** | Cloudflare's object storage. Stands in for "the files". |
