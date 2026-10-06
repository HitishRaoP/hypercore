# 01 - Architecture

This document explains how the pieces of Hypercore fit together, why they are
split this way, and the decisions behind the design.

---

## 1. The monorepo layout

One repository holds every piece. A tool called **Turborepo** (configured in
`turbo.json`) runs the same commands across all of them at once.

```text
hypercore/
├── apps/
│   │
│   ├── dashboard/                     Next.js 16 web application
│   │   ├── app/
│   │   │   ├── (auth)/                Sign in, sign up, password reset
│   │   │   ├── (protected)/           Pages that need a session
│   │   │   │   ├── (sidebar)/         Home, deployments, logs, machines, settings
│   │   │   │   └── (grid)/            The function editor + deploy flow
│   │   │   ├── (public)/download/     Agent download page
│   │   │   ├── layout.tsx             Root layout
│   │   │   └── page.tsx               Landing page
│   │   ├── modules/                   One folder per feature
│   │   │   ├── auth/
│   │   │   ├── create/                Editor, upload, target-node pick, success card
│   │   │   ├── deployments/
│   │   │   ├── logs/
│   │   │   ├── download/
│   │   │   ├── header/
│   │   │   └── landing/
│   │   ├── components/                Shell pieces (sidebar, header)
│   │   ├── hooks/                     Shared React hooks
│   │   └── lib/                       api.ts, auth-client.ts, env.ts, format.ts
│   │
│   ├── api/                           Express 5 server  ← DOCUMENTED IN 02
│   │   └── src/
│   │       ├── index.ts               Boots the HTTP listener
│   │       ├── app.ts                 Wires middleware and routers, in order
│   │       ├── routers/               URL → handler
│   │       ├── controllers/           HTTP request/response handling
│   │       ├── services/              Business rules + database work
│   │       └── lib/                   Shared infrastructure
│   │
│   └── agent/                         Tauri 2 desktop app ← DOCUMENTED IN 03
│       ├── src/                       React window
│       │   ├── components/            Sidebar, cards, forms, titlebar
│       │   ├── pages/                 Machine, logs, deployments, insights, settings
│       │   ├── hooks/                 use-activity, use-updater, use-media-query
│       │   ├── lib/activity.ts        Display formatting helpers
│       │   ├── types/index.ts         Shared TypeScript shapes
│       │   ├── App.tsx                Root component, owns app state
│       │   └── main.tsx               React entry point
│       ├── src-tauri/                 Rust backend
│       │   ├── src/
│       │   │   ├── main.rs            Binary entry point
│       │   │   ├── lib.rs             Tauri commands, tray, persistence
│       │   │   ├── sse.rs             The live connection + build pipeline
│       │   │   ├── executor.rs        Runs the WebAssembly module
│       │   │   ├── tools.rs           Finds esbuild and javy on disk
│       │   │   └── machine_info.rs    Reads this computer's specs
│       │   ├── tauri.conf.json        Window, bundling, auto-update config
│       │   └── capabilities/          Which frontend calls are allowed
│       └── scripts/                   fetch-tools, version sync
│
└── packages/                          Shared code, published to the apps
    ├── db/                            Database connection + all table definitions
    │   └── src/
    │       ├── db.ts                  The shared Drizzle client
    │       ├── lib/env.ts             Validates DATABASE_URL
    │       └── schema/
    │           ├── auth.ts            user, session, account, verification, passkey
    │           ├── machines.ts        Registered computers
    │           ├── deployments.ts     One row per built function version
    │           └── invocations.ts     One row per function call
    ├── auth/                          better-auth setup, email+password, passkeys
    ├── transactional/                 React-email templates + sendMail()
    ├── ui/                            Shared React components (button, card, table…)
    ├── typescript-config/             base.json, nextjs.json, react-library.json
    └── eslint-config/                 Shared lint rules
```

### Why a monorepo

The API, the agent and the database types have to agree with each other
perfectly. A change to the `deployments` table shape touches the API, the
dashboard and the agent at the same time. Keeping them in one repository means
one commit, one review, and no version drift.

---

## 2. The API server, layer by layer

The API is the most important piece to understand, so this section goes deep.
Every route in the API follows the same four-layer path. Knowing these four
names makes the whole codebase easy to navigate.

```text
  HTTP request
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ LAYER 1 — lib/  (shared infrastructure, no HTTP knowledge)    │
│   env.ts     – reads and checks environment variables         │
│   s3.ts      – talks to Cloudflare R2                          │
│   auth.ts    – checks who is signed in                         │
│   errors.ts  – the error types every layer shares              │
│   scheduler.ts – the live connections to the agents            │
│   urls.ts    – builds the public URLs handed to users          │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ LAYER 2 — routers/  (URL → function)                          │
│   One file per group of URLs.                                 │
│   Owns: path patterns, body parsers, file upload limits,      │
│         and which routes need a signed-in user.               │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ LAYER 3 — controllers/  (one function per endpoint)            │
│   Owns: reading the request, choosing a status code,          │
│         shaping the response, catching errors.                │
│         Does NOT touch the database directly.                 │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│ LAYER 4 — services/  (business rules + data)                  │
│   Owns: every database query, every business rule,            │
│         converting database rows into plain JSON objects.     │
│         Does NOT know that HTTP exists.                       │
└──────────────────────────────────────────────────────────────┘
```

### Why this split

| Benefit | Explanation |
|---------|-------------|
| Easy to test | A service function takes plain arguments and returns data. No HTTP needed. |
| Easy to read | You know exactly which file to open: URL problem → router, request problem → controller, data problem → service. |
| Hard to break | A service can never accidentally send a half-built HTTP response, because it has no access to the response object. |
| Easy to reuse | The agent activity feed and the dashboard deployment list both call the same `toDeploymentDto` mapper, so they cannot drift apart. |

### Reading a request through the layers

Take `GET /activity?machineId=abc`:

```text
apps/api/src/app.ts
  app.use("/activity", activityRouter)          ← LAYER 1 decides the prefix
        │
apps/api/src/routers/activity.router.ts
  router.get("/", getActivityByMachine)         ← LAYER 2 matches the path
        │
apps/api/src/controllers/activity.controller.ts
  getActivityByMachine(req, res)               ← LAYER 3 checks the query
    → throws HttpError(400) if machineId is missing
    → clamps limit to between 1 and 100
        │
apps/api/src/services/activity.service.ts
  getActivity(machineId, limit)                 ← LAYER 4 does the work
    → Promise.all of two database reads
    → asks scheduler.isAgentOnline() for liveness
    → maps rows to JSON-safe objects
```

---

## 3. Request routing order matters

`apps/api/src/app.ts` mounts things in a deliberate order. Two orderings carry
real meaning.

### 3.1 The raw-body group mounts before the JSON parser

```ts
app.use("/invoke", invokeRouter);      // ← raw bytes
app.use("/w", workerRouter);           // ← raw bytes
…
app.use(express.json());               // ← JSON parsing starts HERE
app.use("/code-upload", codeUploadRouter);
app.use("/deployment", deploymentRouter);
```

`/invoke` and `/w` forward the caller's body straight through to the function
as its standard input. If `express.json()` ran first, a body would be parsed
into an object and the original bytes would be lost. So those two routers are
mounted first and install their own `express.raw()` parser.

The invocations router — which receives the agent's *result* — is mounted
before the JSON parser too, but it installs its own larger `express.json({limit:
"10mb"})`, because results travel as base64 text and get big.

The nodes router (`POST /api/v1/nodes/register`) is in the same position for
a different reason: the global parser cannot move above `/invoke`, `/w` or
`better-auth`, so `nodes.router.ts` installs its own plain `express.json()`.
Without it `req.body` is `undefined`, registration always `400`s with an
empty field list, and the agent still opens its SSE stream — the log shows
`agent connected:` while no `machines` row is written.

### 3.2 Literal paths are declared before parameterised paths

In `code-upload.router.ts`:

```ts
router.get("/file", proxyFile);                    // literal — must come first
router.get("/:deploymentId/files", getDeploymentFiles);   // parameter — would match "file"
```

Express matches in declaration order. If `/:deploymentId/files` were declared
first, a request for `/file` would be read as *deploymentId = "file"*. The
comment in the source says exactly this.

The same idea appears in the agent, where `run_deployment` falls back to
"whichever `.ts` file is on disk" if the named entrypoint did not download.

### 3.3 Everything else is alphabetical by intent

Routers are mounted grouped by purpose: invoke, worker, invocations, agents,
activity, nodes, auth, then code-upload and deployment.

---

## 4. The message plane in detail

### 4.1 The idea

Every agent opens exactly one long-lived HTTP request:

```text
GET /agents/events?machineId=<id>
```

The server never sends the response. It holds the socket and writes into it
whenever it has something to say. This is Server-Sent Events, and it is
deliberately the simplest thing that works.

### 4.2 What the server stores

One JavaScript `Map` in memory, in `apps/api/src/lib/scheduler.ts`:

```ts
const agents = new Map<string, AgentConnection>();
//                                  └─ { res: Response, heartbeat: NodeJS.Timeout }
```

Keyed by `machineId`. A value is either a live HTTP response or nothing.

### 4.3 What can be sent down it

| Event name | Sent by | Carries | Agent does |
|-----------|---------|---------|-----------|
| `connected` | server, on subscribe | `{ machineId, online: true }` | Nothing — it is a confirmation |
| `deployment` | `pushDeployment()` | `DeploymentPayload` | Downloads, builds, uploads, acks |
| heartbeat | server, every 25s | `: heartbeat` comment line | Nothing — it is a keep-alive |

The heartbeat is a **comment line** (`:` prefix), which is the SSE way of
saying "I am still here" without delivering a message.

### 4.4 How the agent parses the stream

`start_worker` in `apps/agent/src-tauri/src/sse.rs` reads the response body
line by line and keeps two pieces of state:

```rust
let mut current_event = String::new();
let mut current_data  = String::new();
```

Its rules are simple:

| Line it reads | What it does |
|---------------|--------------|
| Starts with `:` | Ignore. It is a comment or heartbeat. |
| Starts with `event:` | Remember the event name. |
| Starts with `data:` | Append to the data buffer. Multiple `data:` lines are joined with a newline. |
| Blank line | The event is complete. Act on it, then clear both buffers. |

### 4.5 Reconnection

If the stream closes — server restart, network blip, laptop lid — the agent
does not need reinstalling or re-registering. `start_worker` loops forever and
retries with a growing delay:

```text
1s → 2s → 4s → 8s → 16s → 30s → 30s → …
```

The delay resets to 1s as soon as a connection succeeds. The bound is 30
seconds.

### 4.6 One stream per machine

`addAgent` calls `removeAgent(machineId)` *before* registering. If the same
agent reconnects, the old entry is dropped rather than left behind — otherwise
`agents.size` would climb forever and a stale response would keep receiving
events nobody reads.

### 4.7 Why not a message broker

The previous design used RabbitMQ. A broker means the installer has to carry a
broker URL and credentials, and the customer's machine needs a working
RabbitMQ client. Replacing it with SSE means the only thing a user types in is
a web address. The trade-off is stated plainly: **online state and in-flight
call results live in one process's memory.** Running two API servers behind a
load balancer would need sticky routing. This is documented in
[06 - Setup and Runbook](./06-setup-and-runbook.md).

---

## 5. The execution plane in detail

### 5.1 The agent's anatomy

```text
┌──────────────────────── React window (apps/agent/src) ───────────────────────┐
│                                                                            │
│  App.tsx ─ owns all app state                                               │
│    ├── get_toolchain_status  ─┐                                            │
│    ├── get_saved_registration ├── Rust commands (Tauri)                    │
│    ├── get_machine_info      ─┤                                            │
│    ├── register_node         ─┤                                            │
│    └── unregister_node      ─┘                                            │
│                                                                            │
│  useActivity ── polls GET /activity every 3s for the node's own history    │
│  useUpdater  ── checks for a newer agent version                          │
│  useMediaQuery ── responsive layout                                        │
│                                                                            │
│  pages/  Machine · Logs · Deployments · Insights · Settings                │
└────────────────────────────────┬───────────────────────────────────────────┘
                                 │  Tauri IPC (not HTTP)
┌────────────────────────────────▼───────────────────────────────────────────┐
│                      Rust backend (apps/agent/src-tauri/src)                 │
│                                                                            │
│  lib.rs      Tauri commands, tray icon, registration file on disk          │
│  machine_info.rs  reads CPU, RAM, disk, OS, machine id                     │
│  tools.rs    finds esbuild and javy on disk                                │
│  sse.rs      live connection + the whole build pipeline                     │
│  executor.rs runs a WebAssembly module with wasmtime                       │
└────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 The two processes in one app

Tauri is a desktop app with a Rust half and a web half. They talk over a
special local channel, not the network. The web half can only call the
functions listed in two places:

1. `invoke_handler(tauri::generate_handler![…])` in `lib.rs`
2. `capabilities/default.json` — the permission list

This is why the agent UI can read the machine's specs but cannot, for example,
run an arbitrary shell command.

### 5.3 The build pipeline

When a `deployment` event arrives, `run_deployment` does this:

```text
   raw/…/index.ts        (downloaded from R2 through the API)
   raw/…/package.json
   raw/…/bun.lock
          │
          │  ① download_file()  — one HTTP GET per file
          ▼
   local work dir
          │
          │  ② bundle_ts_to_js()  — tries, in order:
          │       bundled esbuild  →  `esbuild`  →  `npx esbuild`  →  `bun build`
          │       (last resort: copy the file and rename it to .js)
          ▼
   bundle.js
          │
          │  ③ compile_js_to_wasm()  — `javy build bundle.js -o worker.wasm`
          ▼
   worker.wasm
          │
          │  ④ upload_artifact()  — multipart POST through the API
          ▼
   R2: artifacts/<deploymentId>/worker.wasm
          │
          │  ⑤ acknowledge()  — POST /deployment/<id>/ack  { status: "done" }
          ▼
   API sets the deployment status to "built"
```

**Why the API proxies the files.** The agent deliberately holds no storage
credentials. It asks the API for files, and it hands finished files back to
the API. That means the installer never ships a storage key, and a compromised
node cannot read another tenant's bucket.

**Why the esbuild fallbacks.** A customer may not have Node, npm or Bun on
their machine. Shipping a copy of esbuild inside the installer is the
reliable path. The other attempts are conveniences. If all of them fail, the
file is copied as-is so that Javy still has something to compile — the
function may not work, but the pipeline still produces an artifact and the
failure is visible in the logs.

**Why a Javy failure is fatal.** If Javy fails, the deployment fails. It does
not upload a stand-in file. A stand-in would report "done" and then fail every
single call with `missing _start`, which is far harder to diagnose than an
explicit build failure.

### 5.4 The sandbox

`executor.rs` runs the module with **wasmtime** using the **WASI preview 1**
standard. The function cannot see the filesystem, the network, or the agent's
memory outside its own sandbox. It gets exactly three things:

| The function gets | Comes from |
|-------------------|-----------|
| Standard input | The body of the caller's HTTP request, as raw bytes |
| Three variables | `HC_METHOD`, `HC_PATH`, `HC_QUERY` |
| Standard output | Becomes the HTTP response body the caller receives |
| Standard error | Logged and stored with the invocation record |

Two limits protect the node:

| Limit | Value | What it prevents |
|-------|-------|------------------|
| Wall-clock timeout | `INVOKE_TIMEOUT_MS` minus 2s, sent to the agent per call | One function running forever |
| Fuel | 2,000,000,000 units | A function that never yields, even inside a tight loop |
| Captured output | 4 MB | A function printing forever filling the disk |

The timeout works by *epoch interruption*: a helper thread sleeps for the
timeout, then tells the runtime "now is a checkpoint". The running code stops
at its next safe point and the call is abandoned. This is more reliable than
killing the thread, because it lets captured output still be read.

### 5.5 Where the file comes from at call time

```text
Deployment happens  →  worker.wasm is already in the node's work folder
Node restarts        →  folder is gone, so the agent re-downloads it
                       from artifacts/<deploymentId>/worker.wasm
Artifact key missing →  the agent reports "no wasm artifact" and the call fails
```

This is handled by `run_invocation` in `sse.rs`. The check is a single
`Path::is_file()`.

---

## 6. Data flow for a function call

Here is the full relay, with the function names at each hop.

```text
CALLER                      API SERVER                        AGENT
  │                             │                               │
  │ GET /invoke/<id>            │                               │
  ├────────────────────────────▶│                               │
  │                             │ getDeploymentById(id)          │
  │                             │   (deployments table)         │
  │                             │                               │
  │                             │ invokeOnAgent({…})            │
  │                             │   recordStarted()  ──▶ Postgres
  │                             │   pushEvent(id, "invoke", {…}) │
  │                             ├──────────────────────────────▶│
  │                             │                               │ run_invocation()
  │                             │                               │   execute()  ◀── wasmtime
  │                             │                               │
  │                             │◀── POST /invocations/<id>/result
  │                             │   resolveInvocation(id, body) │
  │                             │   recordFinished() ──▶ Postgres
  │                             │                               │
  │◀── 200 text/plain           │                               │
  │  x-hypercore-* headers      │                               │
```

**The waiting mechanism.** The API cannot just `await` the agent, because the
agent talks over a *different* connection. So `invokeOnAgent` returns a
Promise and stores its resolver in a `Map` called `pending`, keyed by a fresh
invocation ID:

```ts
pending: Map<invocationId, { timer, settle }>
```

When the agent posts the result, `resolveInvocation` looks up that ID, calls
`settle`, and the waiting `await` in the original request continues. If the
agent never answers, a timer fires after `INVOKE_TIMEOUT_MS + 5000` and settles
with a timeout instead.

**Why the agent gets less time than the server.** The agent is told to give up
2 seconds before the server does. That way a slow function produces a real
error message from the agent rather than a bare timeout on the server.

---

## 7. Security model

| Concern | How it is handled |
|---------|-------------------|
| Who may call management endpoints | `requireUser` checks the session cookie on dashboard-only routes |
| Who may call agent endpoints | Open by design — the agent has no session. It is identified by its `machineId` |
| Who may read stored files | `assertReadableKey` only allows keys starting with `raw/` or `artifacts/` |
| What may be uploaded | `ALLOWED_RE` in `upload.service.ts` limits uploads to TypeScript, `package.json` and lock files |
| Path traversal in file names | `sanitizeFileName` reduces every name to a bare, safe file name |
| Cross-origin calls | An explicit allowlist, because each platform's Tauri window reports a different origin |
| Where user code runs | Only inside wasmtime on the node, with a wall-clock limit and a fuel limit |
| Storage credentials | Only the API has them. Neither the agent nor the dashboard ever sees them |
| Database failures during a call | Logged and ignored, so a database hiccup never breaks serving traffic |

### The CORS subtlety

A Tauri app reports a *different* origin on every platform, even for the same
installer:

| Platform | Origin |
|----------|--------|
| Windows (WebView2) | `http://tauri.localhost` |
| macOS and Linux | `tauri://localhost` |
| Development | `http://localhost:1420` |

An earlier version of the allowlist only had the macOS one, so Windows agents
were blocked by the browser while macOS agents worked. All of them are listed
now, plus any extra origins from `CORS_ORIGINS`, plus the dashboard URL, plus a
rule that allows any loopback port. Full details in
[02 - API Reference](./02-api-reference.md#cors-and-origins).

---

## 8. Status values and what they mean

Two state machines run through the system. Both are plain text in the
database, so knowing them makes every log readable.

### 8.1 Deployment status

```text
uploaded ──▶ routed ──▶ building ──▶ built
    │           │           │
    └───────────┴───────────┴──▶ failed
                │
                └──▶ offline
```

| Status | Set by | Means |
|--------|--------|-------|
| `uploaded` | `createDeployment` | Files are in storage, nothing has been sent anywhere |
| `routed` | `uploadCode` | The deployment event was written into an open agent stream |
| `offline` | `uploadCode` | The target agent had no open connection. The job was **not** queued |
| `building` | `acknowledgeDeployment` | The agent acknowledged, but no artifact exists yet |
| `built` | `markDeploymentBuilt` | The WebAssembly file is in storage. The function can be called |
| `failed` | `acknowledgeDeployment` | The agent could not build the function |

### 8.2 Invocation status

```text
running ──▶ done
       ├──▶ failed      (function errored, or the node was offline)
       └──▶ timeout     (the agent did not answer in time)
```

| Status | Meaning |
|--------|---------|
| `running` | The event was sent; the agent has not reported back yet |
| `done` | The function ran and exited with code 0 |
| `failed` | The function ran and exited non-zero, or the node was offline |
| `timeout` | Neither the agent nor the server's timer fired in time |

`offline` is recorded as `failed` with the error message
`"Node is offline (no open SSE stream)"`.

---

## 9. Design decisions and their trade-offs

A list of every notable decision, what it buys, and what it costs.

| # | Decision | Buys | Costs |
|---|----------|------|-------|
| 1 | SSE instead of a message broker | Installer carries no credentials; works behind home routers | Online state and in-flight results live in one process's memory |
| 2 | The API proxies all files to and from storage | Node and dashboard never hold storage keys | Extra hops; the API becomes a bandwidth bottleneck for large files |
| 3 | The agent builds code, not the server | Server never runs untrusted code; true edge execution | First deploy is slower; the build toolchain must ship inside the installer |
| 4 | Javy failure is fatal, not papered over | Honest, debuggable errors | A node without the toolchain cannot deploy at all |
| 5 | The deployment URL is immutable, the worker URL moves | Reproducible testing; a stable public address | Two URLs per function to explain |
| 6 | Worker names are globally unique | A clean, memorable public address | Names are a shared global resource; 409s happen |
| 7 | Two layers of uniqueness checking for worker names | A friendly 409 instead of a raw database error | Two database round trips on every deploy |
| 8 | Database writes during a call are best-effort | A database blip never breaks serving traffic | An invocation can be missing from history |
| 9 | stdout travels as base64 | Binary-safe; no encoding damage | Roughly 33% larger; needs a larger request limit |
| 10 | The agent gets 2 seconds less than the server | Real error messages instead of bare timeouts | A little less work time per call |
| 11 | One SSE stream per machine, old one dropped | No duplicate delivery, no unbounded growth | Only the newest connection receives work |
| 12 | Uploads held in memory, then written one by one | Full control over keys and metadata | Server memory spikes for large bundles |
| 13 | Close hides the window instead of quitting | A tray-resident agent feels native | Users must use the tray to fully exit |
| 14 | Metrics pushed every 2 seconds | Live charts with no polling | A tiny constant background cost |

---

## 10. Things to know before you change anything

**The router order in `app.ts` is load-bearing.** Moving `express.json()`
above `/invoke` silently breaks stdin forwarding. Section 3 explains why.
Routers mounted before the global parser (`invocations`, `nodes`) must
install their own body parser — removing `router.use(express.json())` from
either one silently breaks its POST endpoints while its GET/SSE endpoints
keep working.

**`/invoke` and `/w` must be the only raw-body routes.** Any new route that
forwards a body to user code must mount before `express.json()` and install
`express.raw()`.

**Route order inside a router matters.** Declare literal paths before
parameterised ones.

**Deployment status is plain text, not an enum.** Nothing at the database
level stops a typo. If you add a status, update the agent's
`DeploymentStatus` type and the colour mapping in
`apps/agent/src/lib/activity.ts`.

**The request and result shapes are duplicated in three places** — TypeScript
on the server, Rust on the agent, and TypeScript in the agent's window. A
change to any payload needs all three updated. They are:

| Payload | Server type | Rust type | Agent UI type |
|---------|-------------|-----------|---------------|
| Machine info | `machinePayloadSchema`, `MachineDto` | `MachineInfo` | `MachineInfo` |
| Registration reply | `RegistrationResult` | `RegistrationResponse` | `RegistrationResponse` |
| Deployment event | `DeploymentPayload` | `DeploymentRequest` | — |
| Invoke event | `InvokeDispatch` | `InvokeRequest` | — |
| Invoke result | `AgentInvokeResult` | body built in `handle_invoke` | `ActivityInvocation` |
| Activity feed | `ActivityResult` | — | `ActivityResponse` |

**Do not add comments to the code from this documentation task.** These
documents are deliberately separate from the source. If the code and a
document disagree, the code is right and the document is out of date.

---

## 11. Next

- Every server function: [02 - API Reference](./02-api-reference.md)
- Every agent function: [03 - Agent Reference](./03-agent-reference.md)
- Tables and columns: [04 - Data Model](./04-data-model.md)
