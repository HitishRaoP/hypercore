# 02 - API Reference

Everything in `apps/api`, explained function by function.

This is the Express 5 server written in TypeScript. It is the control plane
and the message plane. It never runs user code — it stores, routes and
relays.

- **Where the code is:** `apps/api/src`
- **How to run it:** `bun run dev` inside `apps/api` (starts `tsx watch src/index.ts`)
- **Default port:** 8080

---

## How to use this document

1. [The full endpoint list](#1-the-full-endpoint-list) — every URL, who calls it, what it returns.
2. [The layers](#2-the-four-layers) — what belongs where.
3. [lib/ — shared infrastructure](#3-lib--shared-infrastructure) — 6 files, 21 functions.
4. [routers/ — URL matching](#4-routers--url-matching) — 7 files, no logic.
5. [controllers/ — HTTP handling](#5-controllers--http-handling) — 7 files, 20 functions.
6. [services/ — business rules](#6-services--business-rules-and-data) — 5 files, 28 functions.
7. [app.ts and index.ts](#7-appts-and-indexts--the-wiring) — the boot sequence.
8. [A function lookup table](#8-every-function-in-one-table) — find any function fast.

---

## 1. The full endpoint list

Fifteen endpoints, in the order they are mounted.

| # | Method | Path | Needs sign-in | Purpose | Handler |
|---|--------|------|--------------|---------|---------|
| 1 | any | `/invoke/:deploymentId` | no | Run one specific deployment | `invokeByDeploymentId` |
| 2 | any | `/invoke/:deploymentId/*rest` | no | Same, with a sub-path | `invokeByDeploymentId` |
| 3 | any | `/w/:workerName` | no | Run the newest built deployment of a worker | `invokeByWorkerName` |
| 4 | any | `/w/:workerName/*rest` | no | Same, with a sub-path | `invokeByWorkerName` |
| 5 | `GET` | `/invocations` | **yes** | List the caller's invocation history | `listMyInvocations` |
| 6 | `POST` | `/invocations/:invocationId/result` | no | Agent reports a result | `postInvocationResult` |
| 7 | `GET` | `/agents/events` | no | The long-lived live connection | `streamEvents` |
| 8 | `GET` | `/agents/online` | no | Which agents hold a connection | `listOnline` |
| 9 | `GET` | `/agents/status` | no | Is one specific agent online | `getStatus` |
| 10 | `GET` | `/activity` | no | One node's deployments and calls | `getActivityByMachine` |
| 11 | `POST` | `/api/v1/nodes/register` | no | Agent registers itself | `registerNode` |
| 12 | `GET` | `/api/v1/nodes` | no | All registered nodes | `listNodes` |
| 13 | `GET` | `/api/v1/nodes/:machineId` | no | One registered node | `getNode` |
| 14 | any | `/api/auth/*` | — | Sign-in, sign-up, passkeys | better-auth, not our code |
| 15 | `GET` | `/code-upload/template` | no | The starter template | `getTemplate` |
| 16 | `GET` | `/code-upload/check-name` | no | Is this worker name free | `checkWorkerNameAvailability` |
| 17 | `POST` | `/code-upload` | **yes** | Upload a function and deploy it | `uploadCode` |
| 18 | `GET` | `/code-upload/file` | no | Read one stored file | `proxyFile` |
| 19 | `GET` | `/code-upload/:deploymentId/files` | no | A deployment's file manifest | `getDeploymentFiles` |
| 20 | `POST` | `/deployment` | no | Route a pre-staged deployment | `routeDeployment` |
| 21 | `POST` | `/deployment/:deploymentId/artifact` | no | Agent uploads built WebAssembly | `uploadArtifact` |
| 22 | `POST` | `/deployment/:deploymentId/ack` | no | Agent confirms build result | `acknowledgeDeployment` |
| 23 | `GET` | `/deployment` | **yes** | List the caller's deployments | `listMyDeployments` |
| 24 | `GET` | `/` | no | Health check | inline in `app.ts` |

### Who is allowed where

There are three audiences, and the code treats them differently.

| Audience | Examples | How they are identified | Why they are open |
|----------|----------|------------------------|-------------------|
| **People** (dashboard) | Upload, list my deployments, list my calls | Session cookie, checked by `requireUser` | They are browsing their own data |
| **Agents** | Register, live connection, upload artifact, report result, ack | Just their `machineId` | A desktop app has no browser session |
| **Callers** | `/invoke/…`, `/w/…` | Nothing | A function's whole point is to be callable by anyone |

This is a deliberate trade-off. Agent endpoints are unauthenticated, so anyone
who can reach the server can open a stream with any `machineId` and receive
work meant for that machine. Section 3 (`addAgent`) and section 5
(`runDeployment`) explain the exposure honestly.

### Status codes used across the API

| Code | Meaning here |
|------|--------------|
| `200` | Success with a body |
| `201` | A file was newly stored |
| `202` | Accepted and forwarded to an agent. Work still has to happen |
| `400` | The caller sent something invalid |
| `401` | No valid session |
| `404` | No record with that ID |
| `409` | Conflict — the worker name is taken, or the function is not built yet |
| `500` | Something unexpected. Logged with detail, answered generically |
| `502` | The function ran and failed |
| `503` | The target node is offline |
| `504` | The node did not answer in time |

---

## 2. The four layers

```
apps/api/src/
├── index.ts      Boot: start listening
├── app.ts        Wire everything, in the right order
├── lib/          6 files — infrastructure with no HTTP knowledge
├── routers/      7 files — URL patterns only
├── controllers/  7 files — one function per endpoint
└── services/     5 files — business rules and every database query
```

| Layer | Files | May touch | Must not touch |
|-------|-------|-----------|----------------|
| `lib/` | 6 | environment, storage, scheduler map, sessions | the request or response objects (except the scheduler, which owns a response) |
| `routers/` | 7 | path patterns, parsers, upload limits, auth guards | business logic, the database |
| `controllers/` | 7 | `req` and `res`, status codes | the database directly |
| `services/` | 5 | the database, other services | `req` and `res` |

---

## 3. lib/ — shared infrastructure

### 3.1 `lib/env.ts`

Reads the process environment once at import time and checks it. If anything
is missing or wrong, the process refuses to start. That is better than
discovering the problem on the first request.

#### `envSchema`

A Zod object describing every variable the server needs.

| Variable | Type | Default | Required | Used for |
|----------|------|---------|----------|----------|
| `PORT` | number | `8080` | no | Which port to listen on |
| `CLOUDFLARE_ACCOUNT_ID` | string | — | **yes** | Builds the storage endpoint address |
| `CLOUDFLARE_ACCESS_KEY_ID` | string | — | **yes** | Storage login |
| `CLOUDFLARE_SECRET_ACCESS_KEY` | string | — | **yes** | Storage password |
| `R2_BUCKET` | string | `hypercore` | no | Which bucket to use |
| `DATABASE_URL` | string | — | **yes** | The PostgreSQL connection string |
| `PUBLIC_URL` | string | none | no | The address handed to users in links |
| `INVOKE_TIMEOUT_MS` | number | `10000` | no | Wall-clock cap on one function call |

Three details worth knowing:

- `z.coerce.number()` turns the text `"8080"` from a `.env` file into the
  number `8080`.
- `DATABASE_URL` is required on purpose. The comment in the source says the
  server "fails fast at boot without it instead of silently running on
  memory."
- `PUBLIC_URL` is optional. Without it, links fall back to
  `http://localhost:<port>`, which is right in development and wrong in
  production.

#### `env`

`envSchema.parse(process.env)`. The single validated object every other file
imports. Parsing happens once, at import, so a missing variable crashes the
process before it starts listening.

---

### 3.2 `lib/s3.ts`

The storage connection, plus the two key formats.

#### `S3`

An `S3Client` pointed at Cloudflare R2.

```ts
new S3Client({
  region: "auto",
  endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
})
```

| Setting | Why |
|---------|-----|
| `region: "auto"` | R2 ignores regions but the SDK insists on a value |
| `endpoint` | R2 is reached through an address built from the account ID, not AWS |
| `credentials` | The key pair from the environment |

R2 speaks the same protocol as Amazon S3, so the standard AWS SDK works
unchanged. That means the rest of the code never mentions "Cloudflare".

#### `R2_BUCKET`

The bucket name from the environment, re-exported so callers import it from
one place.

#### `rawKeyFor(deploymentId, filename)`

Builds the key for an uploaded source file.

```ts
rawKeyFor("abc-123", "index.ts")  //  "raw/abc-123/index.ts"
```

**Why this shape:** grouping by deployment first means every file for one
version of a function lives under one folder. Deleting or listing a single
deployment's files is a prefix operation. The two fixed prefixes — `raw/` and
`artifacts/` — are also what `assertReadableKey` checks, which is how the
download proxy is kept inside a safe area.

#### `artifactKeyFor(deploymentId)`

Builds the key for a built WebAssembly file.

```ts
artifactKeyFor("abc-123")  //  "artifacts/abc-123/worker.wasm"
```

The file name is fixed because the agent always uploads exactly one artifact
per deployment, and the agent looks for exactly this path.

---

### 3.3 `lib/urls.ts`

Builds the public addresses shown to users.

#### `publicBase()`

The base address without a trailing slash.

```ts
publicBase()  //  env.PUBLIC_URL ?? "http://localhost:" + env.PORT
```

The trailing slashes are stripped because `PUBLIC_URL` in a `.env` file very
often has one, and a doubled slash in every generated link looks broken.

#### `invokeUrlFor(deploymentId)`

```ts
invokeUrlFor("abc-123")  //  "https://api.example.com/invoke/abc-123"
```

The **deployment URL**. Immutable — always this exact build, forever. Use it
when you need to reproduce a result.

#### `workerUrlFor(workerName)`

```ts
workerUrlFor("my-function")  //  "https://api.example.com/w/my-function"
```

The **worker URL**. Always serves the newest deployment that has finished
building. This is the one to share. The name is URL-encoded so a name with a
space or a slash cannot break the path.

---

### 3.4 `lib/errors.ts`

The error vocabulary the whole server shares.

#### `HttpError`

An error that knows which HTTP status it should become.

```ts
class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string)
}
```

Services throw these. Controllers turn them into responses. Because the
status travels with the error, a service can say "this is a 409" without
importing anything from Express. `HttpError extends Error`, so `instanceof`
works and normal `try`/`catch` works.

#### `WorkerNameTakenError`

A specialised `HttpError` that is always a `409`.

```ts
throw new WorkerNameTakenError("my-function")
// message: workerName "my-function" is already taken
```

It exists as its own class so two very different places can produce the same
error: the friendly pre-check in `uploadCode`, and the raw database
constraint race in `createDeployment`. Both end up as a clean 409 instead of
one being a 409 and the other a 500.

#### `sendError(res, error)`

The controller safety net. Called in the `catch` of almost every handler.

| What was thrown | What the caller gets |
|-----------------|----------------------|
| `HttpError` (or a subclass) | that error's status, with its message |
| Anything else | `500` and the message `"Internal server error"` |

The unknown case logs the full error to the console and returns a generic
message. Internal details — stack traces, database strings, file paths — never
reach the caller. This is the only place the server decides what a stranger
is allowed to learn about a failure.

---

### 3.5 `lib/auth.ts`

The sign-in check.

#### `AuthedRequest`

A `Request` that is known to carry a signed-in user.

```ts
interface AuthedRequest extends Request {
  userId: string;
}
```

This exists because TypeScript cannot know that a middleware ran. Handlers
behind `requireUser` re-declare the request type and can then read
`req.userId` without a cast or a null check.

#### `requireUser(req, res, next)`

An Express middleware. Registered on a route, it runs before the handler.

```ts
router.get("/", requireUser, listMyDeployments);
```

What it does, in order:

1. Reads the `cookie` header, or an empty string.
2. Asks better-auth to resolve that cookie into a session
   (`fromNodeHeaders` converts Node's header object into the Web `Headers`
   object better-auth expects).
3. If there is no session or no user:
   - Logs a warning with the method, the path, the origin, and the **names**
     of the cookies present — never their values.
   - Answers `401` with `error: "Sign in required"` and a `reason`:
     - `"missing-cookie"` — no cookie was sent at all
     - `"invalid-session"` — a cookie was sent but it is not valid
4. Otherwise writes `userId` onto the request and calls `next()`.

The cookie names are logged because of a real production problem: it is hard
to tell "the browser never sent a cookie" from "the cookie was sent but the
session had expired", and the fix is completely different in each case.

If the session lookup itself throws, the answer is `401` with reason
`lookup-failed`. Sign-in problems never produce a 500.

---

### 3.6 `lib/scheduler.ts`

The heart of the message plane. Holds the live connections and writes into
them.

#### Types

`DeploymentFileRef` — one file: its display `name` and its storage `key`.

`DeploymentPayload` — everything the agent needs to start a build:

| Field | Required | Meaning |
|-------|----------|---------|
| `deploymentId` | yes | Which deployment this is |
| `machineId` | yes | Which computer should get it |
| `objectKey` | yes | Storage key of the entrypoint. Kept for older agents |
| `workerName` | no | The short public name |
| `entrypoint` | no | Which uploaded file to build. Defaults to `index.ts` |
| `files` | no | Every file in the bundle |

The three optional fields exist so an older agent that only understands
`objectKey` still receives something it can act on.

`AgentConnection` — the internal shape stored per machine: the live
`Response` and the heartbeat `Timeout` handle.

#### `const agents = new Map<string, AgentConnection>()`

The whole scheduler. One map, keyed by `machineId`, living in the API
process's memory.

| Operation | Cost |
|-----------|------|
| Register an agent | Instant |
| Check if one is online | Instant |
| List all online | Instant |
| Push a message | Instant |
| Know who is online after a restart | **Impossible — the map is empty** |

That last row is the real limit of the design. It is stated here so nobody
discovers it in production.

#### `sseWrite(res, event, data)`

Writes one event into an open stream. Two lines, then a blank line:

```text
event: deployment
data: {"deploymentId":"…","machineId":"…","objectKey":"…"}
                        ← the blank line ends the event
```

If `data` is already a string it is written as-is. Anything else is converted
with `JSON.stringify`.

#### `addAgent(machineId, res)`

Registers a live connection. Called by `streamEvents` right after the headers
are flushed.

1. Calls `removeAgent(machineId)` first. This is the **one stream per
   machine** rule: on reconnect, the old entry is discarded rather than left
   behind, so a machine can never hold two entries and never accumulate stale
   responses.
2. Sets up a heartbeat every 25 seconds. The heartbeat's first job is
   **self-cleaning**: if the socket is already destroyed or finished, it clears
   itself and removes the agent.
3. Wraps the write in `try`/`catch`. A write into a dead socket throws, and an
   uncaught error in a timer callback takes the whole process down. The source
   comment says this used to happen, and it surfaced as a `502` at the proxy
   while the server restarted.
4. Stores `{ res, heartbeat }` in the map.
5. Logs the connect and the new online count.

The heartbeat writes `: heartbeat` — a comment line. Comment lines keep
proxies and load balancers from idling a connection out, and the agent's
reader explicitly ignores anything starting with `:`.

25 seconds is chosen to sit comfortably under the 30–60 second idle timeouts
that most proxies use.

#### `removeAgent(machineId)`

The single exit point for every disconnection. Clears the heartbeat, deletes
the map entry, logs. Safe to call for a machine that is not in the map — it
just returns. Every path that can end a connection funnels through here, so
there is exactly one place that cleans up.

#### `isAgentOnline(machineId)`

`agents.has(machineId)`. One map lookup. Used by the node list, the activity
feed, and the agent's own status check.

#### `listOnlineAgents()`

`[...agents.keys()]` — every connected `machineId`. Used by
`GET /agents/online`, which the dashboard calls to fill its target-node picker
with only the nodes that can actually accept work.

#### `pushEvent(machineId, event, data)`

Sends one event to exactly one agent. Returns `true` if it landed, `false` if
the agent has no open stream or the write failed.

```ts
export function pushEvent(machineId: string, event: string, data: unknown)
```

| Result | What the caller does with it |
|--------|-----------------------------|
| `true` | Report success (202) |
| `false`, no entry | Report offline (503) |
| `false`, write failed | Same 503, and the agent is dropped so the next attempt reconnects |

This is the single function every routing decision goes through —
deployments and invocations both use it.

#### `pushDeployment(payload)`

A named wrapper over `pushEvent` for the deployment case. It sends
`event: deployment` to `payload.machineId` and logs the route on success.

It exists so the log line reads `[scheduler] routed deployment <id> -> <machine>`,
which is the first thing anyone looks for when a deploy seems to do nothing.

---

## 4. routers/ — URL matching

Routers do four things and nothing else: declare a path, attach middleware,
and hand off. No business logic, no database.

### 4.1 `routers/invoke.router.ts`

Two routers for the two kinds of function address.

```ts
const rawBody = express.raw({ type: "*/*", limit: "1mb" });
```

A body parser that accepts **any** content type and keeps the bytes exactly as
they arrived, up to 1 MB. The bytes become the function's standard input, so
they must not be parsed. 1 MB is the same limit the server waits with.

#### `invokeRouter`

```ts
invokeRouter.use(rawBody);
invokeRouter.all(["/:deploymentId", "/:deploymentId/*rest"], invokeByDeploymentId);
```

`all` means every HTTP method — a function might want to be a GET endpoint or
handle a POST. The second pattern captures anything after the ID, so a function
can have sub-paths like `/invoke/abc/report/monthly`. The `*rest` part is
handed to the function as its path.

#### `workerRouter`

The same, mounted at `/w`, using `:workerName` instead of `:deploymentId`. Same
parser, same body limit, same handler shape.

### 4.2 `routers/agents.router.ts`

```ts
router.get("/events", streamEvents);
router.get("/online", listOnline);
router.get("/status", getStatus);
```

Three read-only endpoints. `/events` is the live connection; the other two are
introspection for the dashboard and the agent's own UI.

### 4.3 `routers/activity.router.ts`

```ts
router.get("/", getActivityByMachine);
```

One endpoint, no middleware. `machineId` arrives as a query parameter, not in
the path, because the dashboard's activity link is a plain URL.

### 4.4 `routers/nodes.router.ts`

```ts
router.post("/register", registerNode);
router.get("/", listNodes);
router.get("/:machineId", getNode);
```

The node registry. `register` is declared first only for readability — the
methods differ, so there is no ambiguity with `/:machineId`.

### 4.5 `routers/invocations.router.ts`

```ts
router.use(express.json({ limit: "10mb" }));
router.get("/", requireUser, listMyInvocations);
router.post("/:invocationId/result", postInvocationResult);
```

The 10 MB limit is the important part. The agent sends the function's output as
base64, which is about 33% larger than the original. A 4 MB output becomes
roughly 5.4 MB of text, so the default limit would reject valid results. The
`10mb` figure is that 5.4 MB with headroom.

### 4.6 `routers/code-upload.router.ts`

```ts
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5*1024*1024, files: 10 } });

router.get("/template", getTemplate);
router.get("/check-name", checkWorkerNameAvailability);
router.post("/", requireUser, upload.array("files", 10), uploadCode);
router.get("/file", proxyFile);
router.get("/:deploymentId/files", getDeploymentFiles);
```

**Why `memoryStorage`.** Multer normally streams uploads straight to disk or
to storage. Here they are held in memory and then written one by one with the
storage SDK, because that gives the code full control over key names and
content types. The comment notes that the storage-direct multer plugin only
handles a single file and hides the key from the application. The cost is
memory: up to 10 files of 5 MB each, so 50 MB per request.

**Route order matters here.** `/file` is declared before `/:deploymentId/files`.
Express matches in order, so the reverse declaration would read a request for
`/file` as *deploymentId = "file"*. The source comment says exactly this.

**`requireUser` only on the POST.** The GETs are called by agents, which have
no session.

### 4.7 `routers/deployment.router.ts`

```ts
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25*1024*1024 } });

router.get("/", requireUser, listMyDeployments);
router.post("/", routeDeployment);
router.post("/:deploymentId/artifact", upload.single("wasm"), uploadArtifact);
router.post("/:deploymentId/ack", acknowledgeDeployment);
```

The 25 MB limit here is much larger than the 5 MB on source uploads, because
this endpoint receives compiled WebAssembly, which is binary and much larger
than the TypeScript it came from.

`upload.single("wasm")` expects exactly one file in a field called `wasm`.

---

## 5. controllers/ — HTTP handling

### 5.1 `controllers/agents.controller.ts`

#### `streamEvents(req, res)` — `GET /agents/events`

Opens the live connection. This is the most important function in the message
plane.

| Step | What happens | Why |
|------|--------------|-----|
| 1 | Read `machineId` from the query string, trimmed | Identifies which stream this is |
| 2 | If empty, answer `400` | Refuse rather than open an anonymous stream |
| 3 | `writeHead(200, { Content-Type: text/event-stream, Cache-Control: no-cache, no-transform, Connection: keep-alive, X-Accel-Buffering: no })` | Tell the agent this is an event stream. `no-transform` stops proxies compressing it. `X-Accel-Buffering: no` is an nginx hint to stop buffering, which would otherwise hold every event |
| 4 | `res.flushHeaders()` | Send the headers now, so the agent knows it is subscribed instead of waiting |
| 5 | Write a `connected` event with `{ machineId, online: true }` | Immediate confirmation |
| 6 | `addAgent(machineId, res)` | Register the stream with the scheduler |
| 7 | Attach `cleanup` to `req.close`, `req.error` and `res.error` | Remove the agent the moment the socket dies |
| 8 | **Return without ending the response** | This is the point — the response stays open for hours |

Step 7 is the subtle one. A dead socket produces a write failure on the next
heartbeat, and an `error` event with no listener throws all the way to
`uncaughtException` and kills the process. Attaching the same `cleanup`
function to all three events means the agent is removed immediately and no
error is ever unhandled. The source comment records that this was a real
crash.

The function never returns a value and never calls `res.end()`. The request
handler is complete the moment the stream is registered; everything after
that is the scheduler writing into the same response object.

#### `listOnline(_req, res)` — `GET /agents/online`

```ts
res.json({ online, count: online.length })
```

Returns every `machineId` that currently holds a stream. The dashboard calls
this to offer only the nodes that can accept work right now. The parameter is
named `_req` because Express passes three arguments and the unused one has to
be skipped — it cannot just be left out.

#### `getStatus(req, res)` — `GET /agents/status`

```ts
GET /agents/status?machineId=abc  →  { machineId: "abc", online: true }
```

The convenience probe the agent's own window uses after registering. Missing
`machineId` gives `400`.

### 5.2 `controllers/invoke.controller.ts`

The serving plane. Three helpers and two entrypoints.

#### `subPath(req, stripPrefix)`

Works out the path **as the function should see it**.

```ts
GET /invoke/abc/report/monthly   →   "/report/monthly"
GET /w/my-function/orders         →   "/orders"
GET /invoke/abc                   →   "/"
```

Logic:

1. Take `req.originalUrl` and cut off anything after `?`.
2. If Express captured the `*rest` wildcard, use that. Express can hand it
   over as an array when the path had multiple segments, so it is joined with
   `/` first, and a leading `/` is added.
3. Otherwise, strip the router's own prefix with the passed-in regular
   expression.
4. An empty result becomes `"/"`.

This is what lets one function serve several sub-paths from a single
deployment URL.

#### `decodeStdout(result)`

Turns the agent's output into a `Buffer`.

| Agent sent | Result |
|-----------|--------|
| `stdoutB64` and it decodes | Those bytes, exactly |
| `stdoutB64` but it does not decode | Falls back to the plain-text field |
| Only `stdout` | Those bytes as UTF-8 |

Base64 is tried first because it is the only one that survives arbitrary
bytes. The plain-text field exists for older agents. The function never
throws — a bad encoding degrades to a best-effort read rather than failing
the call.

#### `serve(record, functionPath, req, res)`

The shared body of both invoke endpoints. This is where a call is turned into
work for a node.

**Step 1 — refuse if not built.**

```ts
if (!record.artifactKey) → 409
```

with a message that explains the wait:
`"wasm artifact not built yet — the agent is still compiling (TS -> JS -> wasm)"`,
plus the current status, the deployment ID and the worker name. A `409` is
used rather than `404` because the deployment genuinely exists — it just is
not ready.

**Step 2 — gather what the function needs.**

| Passed on | From | Limit |
|-----------|------|-------|
| `method` | `req.method` | — |
| `path` | `subPath()` | first 2000 characters |
| `query` | everything after `?` in the original URL | first 2000 characters |
| `bodyB64` | the raw request body, base64-encoded | the router's 1 MB |
| `artifactKey` | the deployment record | — |
| `timeoutMs` | computed inside the service | — |

Path and query are truncated to 2000 characters each so a pathological URL
cannot produce a huge event and break the stream. The body is base64-encoded
here because SSE is a text format; binary cannot be written into it directly.

**Step 3 — hand it to the agent and wait.**

`invokeOnAgent(...)` returns one of three shapes: not delivered, timed out, or
a result. See section 6.3.

**Step 4 — set response headers before deciding the status.**

```text
x-hypercore-deployment  the deployment that ran
x-hypercore-worker      the worker name
x-hypercore-node        the machine that ran it
x-hypercore-exit-code   "0"  (only on success)
```

These are set unconditionally so a failing call still says *which* deployment
and *which node* produced the error. That is the single most useful piece of
information when debugging a function.

**Step 5 — map the outcome to a response.**

| Outcome | Status | Body |
|---------|--------|------|
| No open stream | `503` | `"Node is offline (no open SSE stream)"` with the machine and deployment IDs |
| Timed out | `504` | `"Node did not respond in time"` |
| Function failed | `502` | the error, plus up to 1000 characters of stdout and the stderr |
| Success | `200` | the decoded stdout, as `text/plain` |

The success case is `res.type("text/plain").send(buffer)`. Functions return
bytes, not JSON, so the caller gets exactly what was printed.

`502` is the right code here: the caller's request was fine, the upstream
function was not. `504` is reserved for the node not answering at all.

#### `invokeByDeploymentId(req, res)` — `/invoke/:deploymentId`

1. `getDeploymentById(deploymentId)` — one indexed lookup.
2. Not found → `404 {"error": "Unknown deployment"}`.
3. Found → `serve(record, subPath(req, /^/invoke/<id>/), req, res)`.
4. Any throw → `sendError`.

#### `invokeByWorkerName(req, res)` — `/w/:workerName`

1. `getLatestBuiltDeployment(workerName)`.
2. Not found → `404 {"error": "No built deployment for this worker yet"}`. The
   wording matters: it covers both "no such worker" and "worker exists but has
   not finished building", and the second case is far more common.
3. Found → `serve(record, subPath(req, /^/w/<encoded name>/), req, res)`.
4. Any throw → `sendError`.

The strip expression uses `encodeURIComponent(workerName)` because
`workerUrlFor` encodes the name. They have to match exactly, or a name
containing a space would strip incorrectly.

### 5.3 `controllers/deployment.controller.ts`

#### `routeDeployment(req, res)` — `POST /deployment`

The older, explicit routing entrypoint. The dashboard now uses
`POST /code-upload`, but this one is kept for compatibility and for scripted
use.

Body: `{ deploymentId, machineId, objectKey, workerName?, entrypoint?, files? }`

| Step | Behaviour |
|------|-----------|
| 1 | Any of `deploymentId`, `machineId`, `objectKey` missing → `HttpError(400)` |
| 2 | If `workerName` is present, load the deployment. If the stored name differs **and** the name is taken → `WorkerNameTakenError` (409) |
| 3 | `pushDeployment(...)` |
| 4 | Not delivered → `503` with `status: "offline"` and a message that says no stream is open |
| 5 | Delivered → `202 { status: "routed", deploymentId, machineId }` |

Step 2's condition is subtle and deliberate: it only rejects when the
deployment does **not** already own that name. Re-routing an existing
deployment with its own name must not fail.

Step 4's comment explains the reasoning: failing loudly beats silently
queueing into a broker the agent never reads. With SSE there is no queue at
all, so a `503` is the truth.

`202` rather than `200` because the work has been *accepted and forwarded*,
not done. The build still has to run on the node.

#### `uploadArtifact(req, res)` — `POST /deployment/:deploymentId/artifact`

Where the agent sends its finished WebAssembly. This is the other half of
"the agent holds no storage credentials" — the agent hands the bytes to the
server and the server writes them.

| Step | Behaviour | On failure |
|------|-----------|------------|
| 1 | Get the file. Tries `req.file` (the `wasm` field), then the first entry of `req.files` for clients that use a `file` field name | No file → `HttpError(400)` |
| 2 | `getDeploymentById` | Not found → `HttpError(404)` |
| 3 | `S3.send(new PutObjectCommand({ Bucket, Key: artifactKeyFor(id), Body: file.buffer, ContentType: "application/wasm" }))` | Propagates → `500` |
| 4 | `markDeploymentBuilt(deploymentId, key)` — sets status `built` and stores the key | Propagates → `500` |
| 5 | Log size and the two public URLs | — |
| 6 | `201 { status: "stored", deploymentId, artifactKey, size, invokeUrl, workerUrl }` | — |

The step 1 alias exists because some HTTP client libraries name the field
`file` rather than `wasm`. Both are accepted.

The deployment lookup in step 2 means an upload for an unknown deployment is a
clean `404` instead of an orphaned file nobody can reach.

Answering `201` says "a new file was created", which is true and more precise
than `200`.

#### `listMyDeployments(req, res)` — `GET /deployment`

1. Read `userId` from the request (guaranteed present — `requireUser` ran).
2. Clamp `limit`: `Math.min(Math.max(Number(limit ?? 50) || 50, 1), 100)`. A
   missing, zero, negative, non-numeric or over-100 value all end up in range.
3. `listDeploymentsByUser(userId, limit)`.
4. `res.json({ deployments: rows.map(toDeploymentDto) })`.

`toDeploymentDto` converts the database row into JSON: `id` becomes
`deploymentId`, and the timestamp becomes an ISO string. One mapper means the
dashboard, the agent's file manifest and the activity feed can never disagree
about a deployment's shape.

#### `acknowledgeDeployment(req, res)` — `POST /deployment/:deploymentId/ack`

The agent reporting the outcome of a build. Body:
`{ machineId, status, message? }`.

| `status` sent | What happens |
|---------------|--------------|
| `"failed"` | `updateDeploymentStatus(id, "failed")` |
| `"done"` | Load the deployment. If it already has an artifact, set `built`. Otherwise set `building` |
| anything else | Just log it. The deployment keeps whatever status it had |

The `"done"` branch is careful: the artifact upload sets `built` on its own, so
by the time the ack arrives the status is usually already `built`. Loading the
record and checking means the ack can never move a finished deployment
backwards to `building`.

Answers `200 { status: "acknowledged", deploymentId }` in every case. This
endpoint has no `try`/`catch` and is not wrapped in `requireUser` — it is
called by the agent, and a failure here should surface in the agent's own
logs rather than be swallowed.

### 5.4 `controllers/code-upload.controller.ts`

The modern deploy path. One request does everything: validate, store, record,
and route.

#### `getTemplate(_req, res)` — `GET /code-upload/template`

Returns the `HELLO_WORLD` constant. No database, no validation. The dashboard
loads it to pre-fill the editor, and anyone can `curl` it to get a working
starting point. It is a single object holding three files: `index.ts`,
`package.json`, and `bun.lock`.

#### `checkWorkerNameAvailability(req, res)` — `GET /code-upload/check-name`

```ts
GET /code-upload/check-name?workerName=my-fn  →  { workerName: "my-fn", taken: false }
```

1. Read and trim `workerName`. Empty → `400`.
2. `isWorkerNameTaken(workerName)`.
3. Answer with both the echoed name and the boolean.

The dashboard calls this while the user types, so it needs to be cheap — one
indexed existence check. It is only a **hint**: the real check happens again
inside `uploadCode`, and again in the database itself.

#### `uploadCode(req, res)` — `POST /code-upload`

The main deploy endpoint. Body fields arrive as multipart text parts;
`files` arrive as up to ten uploaded files.

| # | Step | Detail | Failure |
|---|------|--------|---------|
| 1 | Read `workerName` | from the body, trimmed | empty → `validateUploadInput` throws 400 |
| 2 | Read `machineId` | from the body, trimmed | empty → 400, message says "pick a target node" |
| 3 | Read `entrypoint` | defaults to `"index.ts"` if absent or blank | — |
| 4 | Read `files` | the uploaded array | — |
| 5 | `validateUploadInput(workerName, machineId, files)` | Returns the sanitized names | 400 with a specific message |
| 6 | `isWorkerNameTaken(workerName)` | Friendly pre-check | Taken → `WorkerNameTakenError` → 409 |
| 7 | `deploymentId = uuidv4()` | Generated here, not by the database | — |
| 8 | `storeRawFiles(deploymentId, files, names)` | Writes each file to `raw/<id>/<name>` | Storage failure → 500 |
| 9 | `resolveEntrypoint(names, entrypoint)` | Confirms the entrypoint really arrived | 400 |
| 10 | Find the entry in the stored list | Sanity check | 500 `"Failed to resolve entrypoint"` |
| 11 | `createDeployment({...})` | Writes the row with status `uploaded` | Duplicate name → 409 |
| 12 | `pushDeployment({...})` | Sends the build job down the agent's stream | Returns `false` if offline |
| 13 | `updateDeploymentStatus(id, delivered ? "routed" : "offline")` | Records what actually happened | — |
| 14 | Answer `202` | See below | — |

The response:

```json
{
  "status": "routed",
  "deploymentId": "…", "workerName": "…", "machineId": "…",
  "entrypoint": "index.ts",
  "files": [ { "name": "index.ts", "key": "raw/…/index.ts" } ],
  "invokeUrl": "https://…/invoke/…",
  "workerUrl": "https://…/w/…"
}
```

When the node is offline, `status` is `"offline"` and an `error` field is added
explaining that there was no open stream. Still `202` — the files are stored
and the record exists; only the build could not start.

**Three separate uniqueness checks** guard the worker name, and each catches
something the others miss:

| Check | Where | Catches |
|-------|-------|---------|
| `isWorkerNameTaken` (step 6) | Before any file is written | The normal case, cheaply, with a friendly message |
| Unique constraint (step 11) | In the database | Two people uploading at the same instant — the pre-check passes for both, the constraint rejects one |
| Column definition | The schema | Anything that ever bypasses the service layer |

The source comment on step 11 says the race surfaces as
`WorkerNameTakenError` → 409, which is exactly what `createDeployment`'s
`isUniqueViolation` check arranges.

#### `proxyFile(req, res)` — `GET /code-upload/file`

The other half of "the agent holds no storage credentials". The agent asks the
server for files rather than talking to storage itself.

| Step | Behaviour |
|------|-----------|
| 1 | Read `key` from the query string |
| 2 | `assertReadableKey(key)` — must start with `raw/` or `artifacts/` |
| 3 | `fetchRawObject(key)` — reads from storage; any failure becomes `HttpError(404)` |
| 4 | Copy `Content-Type`, `Content-Length` and `ETag` onto the response |
| 5 | If the body is a Node stream, `body.pipe(res)` — the response streams straight through with no buffering |
| 6 | Otherwise try `transformToByteArray()` — the newer SDK returns a web stream or bytes instead |
| 7 | If neither shape works, `HttpError(500, "Unreadable R2 object")` |

Step 2 is the security boundary. Without it, `key=../../something` or any other
prefix could read objects the system never meant to expose. Only two prefixes
are ever allowed, and both are ones the system itself writes.

Step 4 matters for the agent: the artifact it downloads carries
`Content-Type: application/wasm` and an `ETag`, so the download is correctly
typed and can be cached.

Step 5 is why a large file does not sit in the API's memory. It flows from
storage to the agent through the response.

#### `getDeploymentFiles(req, res)` — `GET /code-upload/:deploymentId/files`

1. `getDeploymentById(req.params.deploymentId)`.
2. Not found → `404`.
3. `res.json(toDeploymentDto(record))`.

The manifest an agent pulls for a deployment: every file with its name and
storage key, the entrypoint, the status, and the artifact key if one exists.
It goes through `toDeploymentDto`, the same mapper the dashboard and the
activity feed use, so all three see identical field names.

This function has no `try`/`catch` and therefore no `sendError`. An unexpected
failure becomes Express's default `500`. For a read-only manifest endpoint
that is acceptable, and it keeps the function to four lines.

### 5.5 `controllers/invocations.controller.ts`

#### `postInvocationResult(req, res)` — `POST /invocations/:invocationId/result`

The other half of the serving-plane relay. The agent posts here after running
a function.

1. `resolveInvocation(invocationId, req.body ?? {})` — hands the result to the
   waiting caller.
2. `false` means nobody is waiting under that ID, which happens if the server
   timed out first or restarted. Answer `404 {"error": "Unknown or expired invocationId"}`.
3. Otherwise `200 {"status": "received", invocationId}`.

`resolveInvocation` returns a plain boolean rather than throwing, because
"too late" is an expected outcome here, not an error. The database write
happens separately, inside the settle callback, and is best-effort — so this
function stays synchronous and instant. The agent is not held waiting on a
database round trip.

The router gives this endpoint a 10 MB body limit because the output travels as
base64.

#### `listMyInvocations(req, res)` — `GET /invocations`

Structurally identical to `listMyDeployments`:

1. `userId` from the request.
2. Clamp `limit` to 1–100, default 50.
3. `listInvocationsByUser(userId, limit)`.
4. `res.json({ invocations: rows.map(toInvocationDto) })`.

`toInvocationDto` turns the row into `invocationId` (not `id`) and renders
`createdAt` as `startedAt`, which is what the dashboard's log table expects.

### 5.6 `controllers/nodes.controller.ts`

#### `registerNode(req, res)` — `POST /api/v1/nodes/register`

Body: `{ machine: <MachineInfo> }`.

`res.json(await registerMachine(req.body?.machine))` — the whole function is
one call, because the service owns the validation, the write and the reply
shape. The controller just forwards the body and maps errors.

#### `listNodes(_req, res)` — `GET /api/v1/nodes`

```ts
res.json({ nodes: (await listMachines()).map(toMachineDto) })
```

Every registered node, most recently seen first. `toMachineDto` adds a live
`online` field by asking the scheduler, so the dashboard can grey out nodes
that cannot accept work. The list is **not** scoped to a user — anyone can see
every node in the network. That is intentional: a node is a shared resource
and knowing what exists is not sensitive.

#### `getNode(req, res)` — `GET /api/v1/nodes/:machineId`

1. `getMachineById(machineId)`.
2. Not found → `404 {"error": "Unknown machineId"}`.
3. `res.json(toMachineDto(row))`.

### 5.7 `controllers/activity.controller.ts`

#### `getActivityByMachine(req, res)` — `GET /activity`

The one-node feed the agent's own window polls.

```ts
GET /activity?machineId=abc&limit=50
```

1. Read and trim `machineId`. Empty → `HttpError(400)`.
2. Clamp `limit` to 1–100, default 50.
3. `getActivity(machineId, limit)`.
4. Answer with the result.

Everything is in the service. `source` is hard-coded to `"postgres"`, which is
the honest answer now that the in-memory store is gone — the agent's type
still allows `"memory"` for compatibility with older servers.

---

## 6. services/ — business rules and data

### 6.1 `services/upload.service.ts`

#### `HELLO_WORLD`

The starter template: `entrypoint: "index.ts"` plus three files.

| File | Purpose |
|------|---------|
| `index.ts` | Exports a `handler()` that returns `"Hello, World!"`, then calls `console.log(handler())` |
| `package.json` | Marks the file as an ES module and records the esbuild build command |
| `bun.lock` | An empty lockfile, so the bundle has a complete file set |

The `console.log` at the bottom is the important line and the comment above it
explains why. A WebAssembly module needs a side effect at its root, because
that is what the runtime calls on load. A function that is only *exported* and
never *called* produces a module that instantiates cleanly and prints nothing
— so a brand-new user would see an empty response and think it was broken.

`HELLO_WORLD` is the single source of truth for the template. The dashboard
keeps its own copy for the editor, and the two are expected to stay in step.

#### `ALLOWED_RE`

```ts
/^(index|function|worker)\.ts$|^package\.json$|^bun\.lockb?$|^.+\.ts$/i
```

A whitelist of acceptable upload names. It accepts any `.ts` file, plus
`package.json`, plus `bun.lock` or `bun.lockb`. The named alternatives at the
front are redundant with the general `.ts` rule but document intent.

This is a **whitelist, not a blacklist**. Anything not matching is rejected,
so a new dangerous file type is refused by default. The upload is a
development convenience, not a general file host.

#### `sanitizeFileName(name)`

```ts
sanitizeFileName("../../etc/passwd")  //  "passwd"
sanitizeFileName("my file!.ts")       //  "my_file_.ts"
```

Three steps:

1. Turn backslashes into forward slashes, so Windows and Unix paths are
   treated the same.
2. Split on `/` and keep only the **last** piece. This is what kills path
   traversal — no matter how many `../` segments arrive, only the final name
   survives.
3. Replace every character that is not a letter, digit, dot, underscore or
   hyphen with an underscore.

Step 2 means a caller cannot influence where a file lands. Step 3 means a
crafted name cannot contain characters that break a storage key or a
filesystem path.

#### `validateUploadInput(workerName, machineId, files)`

Checks the bundle and returns the sanitized names. Throws `HttpError(400)`
with a specific message for each problem.

| Check | Message when it fails |
|-------|----------------------|
| `workerName` present | `"workerName is required"` |
| `machineId` present | `"machineId is required (pick a target node)"` |
| At least one file | `"files[] is required (ts entrypoint + package.json + bun.lock)"` |
| At least one `.ts` file | `"A .ts function file (e.g. index.ts) is required"` |
| `package.json` included | `"package.json is required"` |
| Every name allowed | `"File not allowed: <name>. Upload a .ts entrypoint, package.json and bun.lock[b]."` |

The `machineId` message deliberately says "pick a target node", because the
real mistake is usually not typing an ID but forgetting to choose one in the
dashboard.

All names are sanitized first, then the checks run against the sanitized
values — so a file named `../../index.ts` passes the `.ts` check and is
stored as `index.ts`.

#### `resolveEntrypoint(names, requested)`

```ts
resolveEntrypoint(["index.ts", "handler.ts"], "handler.ts")  //  "handler.ts"
resolveEntrypoint(["index.ts", "handler.ts"], "index.ts")    //  "index.ts"
resolveEntrypoint(["index.ts", "handler.ts"], "nope.ts")     //  "index.ts"  (fallback)
```

1. Sanitize the requested name — an empty value becomes `index.ts`.
2. If it is in the uploaded list, use it.
3. Otherwise use the first `.ts` file in the list.
4. If there is no `.ts` file at all, throw `HttpError(400)`.

The fallback means a dashboard that forgets to send the entrypoint still
deploys something sensible instead of failing for an avoidable reason.

#### `storeRawFiles(deploymentId, files, names)`

Writes every uploaded file to storage and returns what it wrote.

For each file, in order:

1. `key = rawKeyFor(deploymentId, name)` → `raw/<id>/<name>`
2. `S3.send(new PutObjectCommand({ Bucket, Key, Body: file.buffer, ContentType: file.mimetype || "application/octet-stream" }))`
3. Push `{ name, key, size, contentType }` onto the result

The content type comes from the upload's own MIME type, falling back to
`application/octet-stream` for anything the client did not label. The files
are **not** deleted if a later one fails — a partial bundle leaves partial
objects. That is harmless: the deployment row is only written after this
function returns, so a failed upload never produces a half-recorded
deployment.

#### `assertReadableKey(key)`

```ts
assertReadableKey("raw/abc/index.ts")       // ok
assertReadableKey("artifacts/abc/worker.wasm")  // ok
assertReadableKey("")                      // 400
assertReadableKey("secrets/api-key")       // 400
```

Throws `HttpError(400, "key must start with raw/ or artifacts/")` for anything
else, including an empty string.

This is the whole security model of the download proxy in one function. The
API holds storage credentials, so without this check the proxy would be an
open reader for the entire bucket. Only the two prefixes the system itself
writes are ever readable.

#### `fetchRawObject(key)`

```ts
return await S3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
```

A thin wrapper with one addition: **any** failure becomes
`HttpError(404, "Object not found in R2")`.

Collapsing a permissions error into a 404 is a small honesty trade-off in
exchange for not leaking which objects exist. The caller does not need to
distinguish "missing" from "unreadable" — both mean the same thing to the
agent.

### 6.2 `services/deployment.service.ts`

PostgreSQL is the source of truth. `worker_name` is globally unique.

#### `CreateDeploymentInput`

The input shape for `createDeployment`:

| Field | Meaning |
|-------|---------|
| `deploymentId` | Generated by the caller, not the database |
| `userId` | The owner, from the session |
| `workerName` | The short public name |
| `machineId` | The target node |
| `entrypoint` | Which file to build |
| `files` | The manifest that was stored |

#### `isUniqueViolation(error)`

Detects a database uniqueness failure.

It walks up to **four** levels of `.cause` looking for either:

- a `code` property equal to `"23505"` — Postgres's unique-violation code, or
- a message containing `"duplicate key"` or `"unique constraint"`

Why the walk: Drizzle wraps driver failures in its own `DrizzleQueryError`
with the original Postgres error on `.cause`, and the exact nesting depth
depends on the driver version. Looking four levels deep and also checking the
message text means the check survives a layer being added or removed.

Returns a plain boolean and never throws.

#### `createDeployment(input)`

Inserts a row with `status: "uploaded"`.

1. `db.insert(deployments).values({...}).returning()`.
2. If the insert returned no row → throw `"Deployment insert returned no row"`.
3. On any error: if `isUniqueViolation(error)` → throw
   `WorkerNameTakenError(input.workerName)` (a 409). Otherwise re-throw
   unchanged.

Step 3 is the whole reason this function is more than a one-liner: it turns a
raw database race into the same clean 409 the friendly pre-check produces, so
the caller cannot tell the difference and the user sees one clear message.

`returning()` fetches the row the database created, including the defaulted
`createdAt` — so the caller has a complete record without a second query.

#### `getDeploymentById(deploymentId)`

```ts
db.select().from(deployments).where(eq(deployments.id, id)).limit(1)
```

Returns the row, or `undefined`. Callers handle the undefined case explicitly
and answer `404`; a missing deployment is an expected outcome, not an error.

This is the most-called function in the API — used by both invoke endpoints,
the artifact upload, the file manifest, the ack handler, and the legacy
routing endpoint.

#### `getLatestBuiltDeployment(workerName)`

```ts
const [row] = db.select().from(deployments).where(eq(workerName)).limit(1);
if (!row || !row.artifactKey) return undefined;
return row;
```

Returns the deployment behind a worker URL, but **only if it has been built**.

This is the entire "the worker URL always serves the newest working version"
guarantee, and it is a single `artifactKey` check. An unbuilt deployment is
treated as if it did not exist, so a half-finished deploy never breaks the
public address.

The name says "latest" but there is no ordering — `worker_name` is unique, so
there is exactly one deployment per worker. The function name is slightly
misleading; the uniqueness is what makes it correct.

#### `updateDeploymentStatus(deploymentId, status)`

```ts
db.update(deployments).set({ status }).where(eq(id))
```

The generic status setter. The `status` type is taken straight from the row
type, so an invalid status is a compile error rather than a runtime surprise.

Used by `uploadCode` (`routed` / `offline`) and `acknowledgeDeployment`
(`failed` / `built` / `building`).

#### `markDeploymentBuilt(deploymentId, artifactKey)`

```ts
db.update(deployments).set({ status: "built", artifactKey })
```

Both halves in one statement, so a deployment can never be marked built
without its artifact key. The `updatedAt` column refreshes automatically
through the schema's `$onUpdate`.

#### `isWorkerNameTaken(workerName)`

```ts
const [row] = db.select({ id: deployments.id }).from(deployments).where(eq(workerName)).limit(1);
return row !== undefined;
```

Selects **only the ID** rather than the whole row. The answer is a yes or no,
so fetching fifteen columns would be wasted work on a hot path — this is
called while a user types in the dashboard.

#### `listDeploymentsByMachine(machineId, limit)`

```ts
db.select().from(deployments).where(eq(machineId)).orderBy(desc(createdAt)).limit(safeLimit)
```

Every deployment targeted at one node, newest first. Feeds the agent's
activity view.

`safeLimit` is clamped to 1–100 **in the service**, not only in the
controller. A limit that reaches the database unvalidated would let a caller
ask for a million rows.

#### `listDeploymentsByUser(userId, limit)`

The same, filtered by owner. Because `worker_name` is unique and each deploy
creates a new row, one user can have several deployments sharing nothing —
each with a distinct name — and this returns all of theirs, newest first.

Uses the `deployments_user_id_idx` index on `user_id`.

### 6.3 `services/invocation.service.ts`

The serving plane's coordination. This module has two jobs that are
deliberately kept apart.

**Job 1 — Postgres.** The `invocations` table records every lifecycle
transition, permanently.

**Job 2 — memory.** The `pending` map holds only in-flight waits. It is
inherently temporary and dies with the process.

| State | Lives in | Survives a restart |
|-------|----------|--------------------|
| History | Postgres | yes |
| "someone is waiting right now" | `pending` map | no |
| "is this agent online" | scheduler map | no |

#### Types

`InvocationStatus` — `"running" | "done" | "failed" | "timeout"`.

`AgentInvokeResult` — what the agent posts back:

| Field | Meaning |
|-------|---------|
| `machineId` | Which node answered |
| `ok` | Did the function succeed |
| `code` | Exit code, if there was one |
| `stdoutB64` | Output as base64. **Preferred** — binary-safe |
| `stdout` | Output as plain text. Fallback for older agents |
| `stderr` | Error text the function wrote |
| `error` | A human-readable failure description |
| `timedOut` | Did the agent's own timeout fire |

`InvokeDispatch` — everything the agent needs for one call: `machineId`,
`userId`, `deploymentId`, `workerName`, `artifactKey`, `method`, `path`,
`query`, and `bodyB64`.

`InvokeOutcome` — the three possible results, as a closed union:

```ts
type InvokeOutcome =
  | { delivered: false }                          // no stream
  | { delivered: true; timeout: true }            // nobody answered
  | { delivered: true; timeout?: false; result: AgentInvokeResult };
```

Modelling this as a union rather than a pile of optional fields means
TypeScript will not let a caller treat "delivered" as true and "result" as
missing. Every combination that can actually occur is one branch.

#### `const pending = new Map<string, PendingWaiter>()`

`invocationId` → `{ timer, settle }`. `settle` is the resolver of the Promise
that `invokeOnAgent` handed back. One entry per in-flight call. Entries are
removed the moment they settle, so the map stays the size of current traffic,
not total traffic.

#### `trackWaiter(invocationId, settle, waitMs)`

Registers a waiter and arms its timeout.

```ts
const timer = setTimeout(() => {
  pending.delete(invocationId);
  settle({ delivered: true, timeout: true });
}, waitMs);
timer.unref?.();
pending.set(invocationId, { timer, settle });
```

Two details:

- The timeout callback **deletes the entry first**, then settles. If it
  settled first, the settle path would try to clear a timer that is currently
  firing.
- `timer.unref?.()` tells Node this timer should not by itself keep the process
  alive. A single pending call should not stop a clean shutdown.

#### `settleWaiter(invocationId, outcome)`

Finds the waiter, removes it, cancels its timer, and calls `settle`.

Returns `false` when the ID is unknown or already expired — that is, when the
result arrived too late. It is a normal return value, not an exception.

Every path out of a wait goes through here: the agent's result, the timeout,
and the offline case. One function means one place that cleans up.

#### `resolveInvocation(invocationId, result)`

The agent's callback, wrapped in the `InvokeOutcome` shape:

```ts
return settleWaiter(invocationId, { delivered: true, result });
```

Returns `true` if a caller was waiting, `false` if the ID was unknown or
expired. Called by `postInvocationResult`.

#### `listInvocationsByMachine(machineId, limit)`

```ts
db.select().from(invocations).where(eq(machineId)).orderBy(desc(createdAt)).limit(safeLimit)
```

One node's call history, newest first. Uses the
`invocations_machine_id_created_idx` index, which is built on `(machine_id,
created_at)` — exactly the columns being filtered and sorted, so the database
can use the index for both.

#### `listInvocationsByUser(userId, limit)`

The same for one owner, using `invocations_user_id_created_idx`. Feeds the
dashboard's log page.

#### `invokeOnAgent(dispatch)`

The main entry point. Returns a Promise that settles with the outcome.

| Step | What happens |
|------|--------------|
| 1 | `invocationId = uuidv4()` — a fresh ID for this single call |
| 2 | `startedMs = Date.now()` — for the duration measurement |
| 3 | `agentTimeoutMs = Math.max(1000, env.INVOKE_TIMEOUT_MS - 2000)` — the agent's budget |
| 4 | `serverWaitMs = env.INVOKE_TIMEOUT_MS + 5000` — this server's budget |
| 5 | `await recordStarted({...})` — **write the row before dispatching** |
| 6 | Return a Promise. Inside: build `settle`, call `trackWaiter`, then `pushEvent` |
| 7 | If `pushEvent` returns `false`, settle immediately with `{ delivered: false }` |

**Step 3 in numbers.** With the default `INVOKE_TIMEOUT_MS` of 10,000, the
agent gets 8,000 ms and the server waits 15,000 ms. The agent is deliberately
given 2 seconds less, so a function that runs too long produces a real error
message from the agent (`"function timed out"`) rather than a bare server
timeout. The `Math.max(1000, …)` floor means even a tiny configured timeout
still gives the agent a second.

The server waits 5 seconds **more** so that the agent's answer always wins the
race. The two numbers are derived from one setting, so changing
`INVOKE_TIMEOUT_MS` keeps them consistent.

**Step 5 ordering is load-bearing.** The row is written *before* the event
goes out, because a fast agent can run a trivial function and post the result
before a slow database write would have finished. If the write came after the
dispatch, the result callback would land first and the final update would
overwrite nothing — leaving the history permanently stuck at `running`.

**Step 6's `settle` wrapper** does the database write as a side effect and only
resolves the caller's Promise once that write settles:

```ts
const settle = (outcome) => {
  void recordFinished(invocationId, outcome, Date.now() - startedMs)
    .finally(() => resolve(outcome));
};
```

`finally` guarantees the caller is released even if the write fails, and
`recordFinished` never rejects anyway. The caller should never wait on a
database.

#### `recordStarted(row)`

```ts
await db.insert(invocations).values({ ...row, status: "running" }).onConflictDoNothing();
```

Wrapped in `try`/`catch`. On failure it logs
`"[db] invocation persist skipped: <message>"` and continues.

`onConflictDoNothing` means a retried ID is silently ignored rather than
crashing the call.

This is the first of the two best-effort writes. The reasoning is stated in
the module header: **a database blip must not break request serving.** A
function call that is answered is worth far more than a complete history.

#### `recordFinished(invocationId, outcome, durationMs)`

The matching update:

```ts
await db.update(invocations)
  .set({ ...toFinishedUpdate(outcome, durationMs), finishedAt: new Date() })
  .where(eq(invocations.id, invocationId));
```

Also `try`/`catch` with the same log line. Called from inside `settle`, so
`finishedAt` is as close to the real finish moment as possible.

#### `toFinishedUpdate(outcome, durationMs)`

Turns an outcome into the columns to write. Four branches:

| Outcome | `status` | `exitCode` | `stdoutPreview` | `error` |
|---------|----------|------------|-----------------|---------|
| Not delivered | `failed` | `null` | `null` | `"Node is offline (no open SSE stream)"` |
| Timed out | `timeout` | `null` | `null` | `"Node did not respond in time"` |
| Ran, exited 0 | `done` | `0` | first 2000 chars | `null` |
| Ran, exited non-zero | `failed` | the code | first 2000 chars | the agent's message, or `"Exited with code N"` |

`failed` is computed as `!result.ok || result.code !== 0`, so an agent that
reports `ok: true` with a non-zero code is still treated as a failure.

Offline is recorded as `failed` rather than a separate status. There are only
four statuses, and "the node was not there" is a failure to deliver. The
distinctive part is the `error` text, which says exactly what happened.

#### `previewStdout(result)`

Extracts a short, plain-text preview of the output for the history list.

Base64 is decoded and truncated; if that fails it falls back to the plain
field, truncated the same way. `STDOUT_PREVIEW_LIMIT` is **2000**
characters.

The limit is why this exists at all. A function can print 4 MB. Nobody reads
4 MB in a table cell, and storing it for every call would bloat the table
quickly. The full output still goes to the original caller — only the history
preview is cut.

### 6.4 `services/nodes.service.ts`

The execution-node registry.

#### `machinePayloadSchema`

A Zod schema describing the agent's `MachineInfo`. It exists because the
agent's Rust struct could change, or someone could post anything.

| Field | Type | Rule |
|-------|------|------|
| `machineId` | string | at least 1 character |
| `hostname` | string | required |
| `osName` | string | required |
| `osVersion` | string | required |
| `kernelVersion` | string | required |
| `arch` | string | required |
| `cpuLogicalCores` | number | whole, not negative |
| `cpuPhysicalCores` | number | whole, not negative |
| `cpuBrand` | string | required |
| `totalMemoryMb` | number | whole, not negative |
| `usedMemoryMb` | number | whole, not negative |
| `totalDiskMb` | number | whole, not negative |
| `availableDiskMb` | number | whole, not negative |
| `localIp` | string | required |

Every number is `.int().nonnegative()`. A negative RAM figure means a broken
sender, and letting it through would corrupt every capacity calculation
downstream.

This schema mirrors the Rust `MachineInfo` in
`apps/agent/src-tauri/src/machine_info.rs` field for field. The Rust struct is
serialised in camelCase and these are camelCase.

#### `RegistrationResult`

What the agent parses back:

| Field | Value | Meaning |
|-------|-------|---------|
| `status` | `"success"` | Always, when the request succeeds |
| `nodeId` | the machine ID | Echoed back so the agent can confirm |
| `sessionToken` | a fresh UUID | Returned but not yet used for anything |
| `assignedRegion` | `"local"` | A fixed placeholder |
| `heartbeatIntervalSecs` | `5` | Currently unused; the agent has no heartbeat request |

Three of these five are placeholders for a future multi-region design. They are
returned anyway so the agent's response shape is already correct if they ever
become real.

#### `registerMachine(payload)`

1. `machinePayloadSchema.safeParse(payload)`.
2. On failure → `HttpError(400, "Invalid machine payload: <fields>")`. The
   message joins the failing field paths, so the agent's developer sees
   exactly which field was wrong.
3. Build `specs` — every column except the ID and the two timestamps. Written
   field by field rather than spread, so nothing outside `specs` can be
   injected by the payload.
4. **Upsert:**
   ```ts
   db.insert(machines)
     .values({ machineId, ...specs })
     .onConflictDoUpdate({ target: machines.machineId, set: { ...specs, lastSeenAt: new Date() } })
   ```
   A new machine is inserted. An existing one has its specs refreshed and its
   `lastSeenAt` bumped. `firstSeenAt` is deliberately **not** in the update
   set, so it keeps the original registration time.
5. Return the `RegistrationResult`.

This is an upsert rather than an insert-then-catch because agents re-register
freely — on every app start, and any time someone types the coordinator URL
again. A plain insert would fail every time after the first.

`machineId` is the key because the agent derives it from a stable per-host
value, so the same computer always produces the same ID. That is what makes
the upsert meaningful.

#### `getMachineById(machineId)`

One row, or `undefined`. Same pattern as `getDeploymentById`.

#### `listMachines()`

```ts
db.select().from(machines).orderBy(desc(machines.lastSeenAt))
```

Every registered node, most recently seen first — which puts the ones most
likely to be online at the top of the dashboard's list. There is no limit,
because a network is expected to have tens of nodes, not thousands.

#### `toMachineDto(row)`

Copies every column, converts both timestamps to ISO strings, and adds one
live field:

```ts
online: isAgentOnline(row.machineId)
```

The database knows a machine *exists*; only the scheduler knows if it is
*connected right now*. The DTO is the join of the two facts, which is why
every consumer of a machine gets `online` without asking the scheduler
themselves.

### 6.5 `services/activity.service.ts`

The feed the agent's window polls. Two read paths and two mappers.

#### DTOs

`DeploymentDto` and `InvocationDto` are JSON-safe versions of the database
rows. The changes are always the same two kinds:

1. `id` becomes `deploymentId` or `invocationId` — clearer at the call site.
2. `Date` objects become ISO strings — a `Date` serialises to JSON as a string
   anyway, but doing it explicitly means the type is honest about what the
   caller receives.

`ActivityResult` is the whole response:

| Field | Meaning |
|-------|---------|
| `source` | Always `"postgres"` |
| `online` | From the scheduler, live |
| `deployments` | Up to `limit` rows, newest first |
| `invocations` | Up to `limit` rows, newest first |

#### `getActivity(machineId, limit)`

1. Clamp `limit` to 1–100.
2. `Promise.all([listDeploymentsByMachine, listInvocationsByMachine])` — both
   queries run **concurrently**. Two sequential round trips would double the
   response time for no benefit; they do not depend on each other.
3. Map both result sets through the DTO mappers.
4. Add `online: isAgentOnline(machineId)`.

The `Promise.all` is the one place in the API that genuinely benefits from
concurrency, and the comment above it marks it as deliberate.

#### `toDeploymentDto(row)`

`id → deploymentId`, everything else copied, `createdAt → createdAt` as ISO.

**This one mapper is used in four places:** `listMyDeployments`,
`getDeploymentFiles`, and indirectly `getActivity`. That is the point. Four
call sites cannot drift, because there is only one definition.

#### `toInvocationDto(row)`

`id → invocationId`, `createdAt → startedAt`, `finishedAt` as ISO or `null`.
`startedAt` is the friendlier name for the same column, and it pairs with
`finishedAt` in a way `createdAt` does not.

---

## 7. app.ts and index.ts — the wiring

### 7.1 `index.ts`

Eleven lines, and the comment at the bottom is the important part.

```ts
const server = app.listen(env.PORT, () => {
  console.log(`Server is running on port ${env.PORT}`);
});
server.requestTimeout = 0;
```

`server.requestTimeout = 0` **disables the request timeout entirely.**

Node's default is 5 minutes. Agent connections stay open for hours by
definition. Without this line, every long-lived stream would be killed at the
5-minute mark and the agent would reconnect every 5 minutes forever.

The comment explains why it is safe: the 25-second SSE heartbeats already keep
proxies and load balancers from deciding a connection is idle, so the safety
net they would normally provide is already in place.

### 7.2 `app.ts`

#### `import "dotenv/config"`

The very first line, before anything else. It loads the `.env` file into
`process.env` so that `lib/env.ts` — and therefore `lib/s3.ts` and
`packages/db` — can read the variables at import time.

#### CORS and origins

##### `DEFAULT_ORIGINS`

```ts
[
  "http://tauri.localhost",   // Windows / WebView2
  "tauri://localhost",        // macOS + Linux
  "http://localhost:3000",    // dashboard dev server
  "http://localhost:1420",    // agent dev server
]
```

A Tauri app reports a **different origin on every platform for the same
bundle**. The comment above the constant records the bug this fixed: the list
previously held only `https://tauri.localhost`, which matches no real WebView,
so Windows agents were dropped by a CORS error while macOS ones worked fine.

`tauri dev` uses neither scheme — it loads the Vite dev server on port 1420,
which is why that is in the list.

##### `normalizeOrigin(origin)`

```ts
origin.trim().replace(/\/+$/, "").toLowerCase()
```

`trim` removes surrounding whitespace, `replace(/\/+$/, "")` removes trailing
slashes, `toLowerCase` lowercases.

Browsers always send an origin as `scheme://host[:port]` with no trailing
slash and no path. But a human writing `DASHBOARD_URL` into a `.env` file very
often adds a trailing slash, and `cors` compares by **exact string**. Without
this, a dashboard URL with a slash silently never matches and every request is
blocked. This one function prevents that whole class of bug.

##### `resolveCorsOrigins()`

Builds the final allowlist.

1. Split `CORS_ORIGINS` on commas, normalize each piece, drop the empty ones.
2. If any entry is `*`, return `"*"` immediately and ignore the rest.
3. Start a `Set` with the defaults.
4. Add everything from `CORS_ORIGINS`.
5. Add `DASHBOARD_URL`, normalized — the comment notes it is "often written
   with a trailing slash in .env".
6. Add a **regular expression**: `/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/`.
7. Return the array.

Step 6 allows any loopback address on any port. The reasoning in the comment:
a loopback origin cannot be spoofed by a remote page and cannot be reached from
the public internet, so allowing every dev-server port is safe. This matters
because Vite and Next.js both pick a free port when 1420 or 3000 is busy, and a
developer should not have to restart the API every time that happens.

Adding a tunnel host or a LAN dev box is a change to `CORS_ORIGINS` and an API
restart — **not a code change**. That is the whole reason the list is
configurable.

#### The `cors` middleware

```ts
app.use(cors({ origin: corsOrigins, credentials: !allowAnyOrigin }));
```

`credentials` is set to `false` **only** when the origin is `*`, because the
browser forbids sending cookies with a wildcard origin. When an explicit list
is in use, credentials are on, which is what lets the dashboard's session
cookie reach the API.

The allowed origins are logged at boot. When that line is the reason a
browser call is failing, the answer is already in the server's output.

#### The mount order

```ts
app.use("/invoke", invokeRouter);              // raw body
app.use("/w", workerRouter);                   // raw body
app.use("/invocations", invocationsRouter);    // 10mb JSON, installed by the router
app.use("/agents", agentsRouter);
app.use("/activity", activityRouter);
app.use("/api/v1/nodes", nodesRouter);
app.all('/api/auth/{*any}', toNodeHandler(auth));

app.use(express.json());                       // ← JSON parsing starts HERE

app.use("/code-upload", codeUploadRouter);
app.use("/deployment", deploymentRouter);
app.get("/", (req, res) => { res.json({ message: "Hypercore api is up!" }); });
```

| Position | Why |
|----------|-----|
| `/invoke` and `/w` first | Their bodies must stay raw bytes. They install `express.raw()` themselves. If `express.json()` ran first, a request body would be parsed into an object and the function would lose its standard input |
| `/invocations` before the JSON parser | It installs its own `express.json({limit:"10mb"})` for base64 results. Mounting it here means that limit applies to results without loosening the global one |
| `/api/auth/{*any}` | better-auth handles sign-in, sign-up, sessions and passkeys. The `{*any}` wildcard matches every path after the prefix |
| `express.json()` here | Everything below it may assume a JSON body |
| `/code-upload` and `/deployment` last | They use multipart uploads, so a JSON parser does nothing for them and the routers install their own multer middleware |

`toNodeHandler(auth)` is better-auth's adapter from its Web-standard handler
to Express. The auth logic lives in `packages/auth`; the API only hosts it.

#### `export { app }`

`app` is exported rather than only listened on, so tests can import it and
drive it without binding a port.

---

## 8. Every function in one table

Find anything fast.

### lib/

| Function | File:line | What it does | Called by |
|----------|-----------|--------------|-----------|
| `envSchema` | `lib/env.ts:3` | Zod description of every environment variable | `env` |
| `env` | `lib/env.ts:18` | The validated environment, parsed once | 6 files |
| `S3` | `lib/s3.ts:4` | The R2 client | `upload.service`, `deployment.controller` |
| `R2_BUCKET` | `lib/s3.ts:13` | The bucket name | 2 files |
| `rawKeyFor` | `lib/s3.ts:15` | `raw/<id>/<name>` | `storeRawFiles` |
| `artifactKeyFor` | `lib/s3.ts:18` | `artifacts/<id>/worker.wasm` | `uploadArtifact` |
| `publicBase` | `lib/urls.ts:4` | Base address, no trailing slash | the two below |
| `invokeUrlFor` | `lib/urls.ts:9` | The immutable deployment URL | 2 controllers |
| `workerUrlFor` | `lib/urls.ts:12` | The stable worker URL | 2 controllers |
| `HttpError` | `lib/errors.ts:4` | An error that knows its HTTP status | 3 services |
| `WorkerNameTakenError` | `lib/errors.ts:15` | Always a 409 | 2 services, 1 controller |
| `sendError` | `lib/errors.ts:23` | Error → response, generically for unknowns | 12 controllers |
| `AuthedRequest` | `lib/auth.ts:5` | A request known to have a user | 4 controllers |
| `requireUser` | `lib/auth.ts:10` | Session-cookie guard | 4 routes |
| `sseWrite` | `lib/scheduler.ts:47` | Writes one SSE event | `pushEvent` |
| `addAgent` | `lib/scheduler.ts:52` | Registers a stream, starts its heartbeat | `streamEvents` |
| `removeAgent` | `lib/scheduler.ts:78` | The one cleanup path | 4 call sites |
| `isAgentOnline` | `lib/scheduler.ts:86` | One map lookup | 3 services, 1 controller |
| `listOnlineAgents` | `lib/scheduler.ts:90` | Every connected machine | `listOnline` |
| `pushEvent` | `lib/scheduler.ts:98` | Send one event to one agent | `pushDeployment`, `invokeOnAgent` |
| `pushDeployment` | `lib/scheduler.ts:115` | `pushEvent` for deployments, plus logging | 2 controllers |

### routers/

| File | Lines | Owns |
|------|-------|------|
| `invoke.router.ts` | 16 | Two routers, one raw parser, 4 routes |
| `agents.router.ts` | 10 | 3 routes |
| `activity.router.ts` | 8 | 1 route |
| `nodes.router.ts` | 10 | 3 routes |
| `invocations.router.ts` | 19 | 2 routes, a 10 MB JSON limit |
| `code-upload.router.ts` | 30 | 5 routes, upload limits, route ordering |
| `deployment.router.ts` | 20 | 4 routes, a 25 MB limit |

### controllers/

| Function | File:line | Endpoint | Auth |
|----------|-----------|----------|------|
| `streamEvents` | `agents.controller.ts:10` | `GET /agents/events` | no |
| `listOnline` | `agents.controller.ts:43` | `GET /agents/online` | no |
| `getStatus` | `agents.controller.ts:49` | `GET /agents/status` | no |
| `subPath` | `invoke.controller.ts:18` | — | helper |
| `decodeStdout` | `invoke.controller.ts:28` | — | helper |
| `serve` | `invoke.controller.ts:39` | — | helper |
| `invokeByDeploymentId` | `invoke.controller.ts:93` | `/invoke/:id` | no |
| `invokeByWorkerName` | `invoke.controller.ts:104` | `/w/:name` | no |
| `routeDeployment` | `deployment.controller.ts:22` | `POST /deployment` | no |
| `uploadArtifact` | `deployment.controller.ts:58` | `POST /deployment/:id/artifact` | no |
| `listMyDeployments` | `deployment.controller.ts:100` | `GET /deployment` | **yes** |
| `acknowledgeDeployment` | `deployment.controller.ts:112` | `POST /deployment/:id/ack` | no |
| `getTemplate` | `code-upload.controller.ts:29` | `GET /code-upload/template` | no |
| `checkWorkerNameAvailability` | `code-upload.controller.ts:34` | `GET /code-upload/check-name` | no |
| `uploadCode` | `code-upload.controller.ts:49` | `POST /code-upload` | **yes** |
| `proxyFile` | `code-upload.controller.ts:105` | `GET /code-upload/file` | no |
| `getDeploymentFiles` | `code-upload.controller.ts:132` | `GET /code-upload/:id/files` | no |
| `postInvocationResult` | `invocations.controller.ts:15` | `POST /invocations/:id/result` | no |
| `listMyInvocations` | `invocations.controller.ts:23` | `GET /invocations` | **yes** |
| `registerNode` | `nodes.controller.ts:14` | `POST /api/v1/nodes/register` | no |
| `listNodes` | `nodes.controller.ts:23` | `GET /api/v1/nodes` | no |
| `getNode` | `nodes.controller.ts:32` | `GET /api/v1/nodes/:id` | no |
| `getActivityByMachine` | `activity.controller.ts:6` | `GET /activity` | no |

### services/

| Function | File:line | What it does | Writes? |
|----------|-----------|--------------|---------|
| `HELLO_WORLD` | `upload.service.ts:15` | The starter template | no |
| `sanitizeFileName` | `upload.service.ts:39` | Strips paths and unsafe characters | no |
| `validateUploadInput` | `upload.service.ts:48` | Checks the bundle, returns clean names | no |
| `resolveEntrypoint` | `upload.service.ts:75` | Picks the entry file, with a fallback | no |
| `storeRawFiles` | `upload.service.ts:94` | Writes every file to R2 | **R2** |
| `assertReadableKey` | `upload.service.ts:121` | The proxy's security boundary | no |
| `fetchRawObject` | `upload.service.ts:127` | Reads one object, 404 on any failure | no |
| `isUniqueViolation` | `deployment.service.ts:27` | Detects a duplicate-name race | no |
| `createDeployment` | `deployment.service.ts:42` | Inserts, maps the race to a 409 | **DB** |
| `getDeploymentById` | `deployment.service.ts:64` | One deployment | no |
| `getLatestBuiltDeployment` | `deployment.service.ts:74` | One built deployment for a worker | no |
| `updateDeploymentStatus` | `deployment.service.ts:86` | Sets the status | **DB** |
| `markDeploymentBuilt` | `deployment.service.ts:93` | Sets status and artifact key together | **DB** |
| `isWorkerNameTaken` | `deployment.service.ts:100` | Existence check on the name only | no |
| `listDeploymentsByMachine` | `deployment.service.ts:109` | One node's deployments | no |
| `listDeploymentsByUser` | `deployment.service.ts:123` | One owner's deployments | no |
| `resolveInvocation` | `invocation.service.ts:97` | Delivers the agent's result to the waiter | no |
| `listInvocationsByMachine` | `invocation.service.ts:105` | One node's calls | no |
| `listInvocationsByUser` | `invocation.service.ts:119` | One owner's calls | no |
| `invokeOnAgent` | `invocation.service.ts:137` | Dispatch and wait | **DB** |
| `trackWaiter` | `invocation.service.ts:76` | Registers a waiter, arms its timer | no |
| `settleWaiter` | `invocation.service.ts:87` | The one exit from a wait | no |
| `recordStarted` | `invocation.service.ts:182` | Inserts the `running` row, best-effort | **DB** |
| `recordFinished` | `invocation.service.ts:190` | Updates the row, best-effort | **DB** |
| `toFinishedUpdate` | `invocation.service.ts:205` | Outcome → columns | no |
| `previewStdout` | `invocation.service.ts:244` | 2000-character output preview | no |
| `machinePayloadSchema` | `nodes.service.ts:24` | Validates the agent's payload | no |
| `registerMachine` | `nodes.service.ts:79` | Upsert, returns the registration reply | **DB** |
| `getMachineById` | `nodes.service.ts:118` | One machine | no |
| `listMachines` | `nodes.service.ts:127` | All machines | no |
| `toMachineDto` | `nodes.service.ts:135` | Row + live `online` field | no |
| `getActivity` | `activity.service.ts:54` | One node's whole feed, concurrently | no |
| `toDeploymentDto` | `activity.service.ts:72` | Row → JSON-safe object | no |
| `toInvocationDto` | `activity.service.ts:85` | Row → JSON-safe object | no |

---

## 9. Next

- The matching agent functions: [03 - Agent Reference](./03-agent-reference.md)
- The tables these queries hit: [04 - Data Model](./04-data-model.md)
- How to run it, and how to debug it: [06 - Setup and Runbook](./06-setup-and-runbook.md)
