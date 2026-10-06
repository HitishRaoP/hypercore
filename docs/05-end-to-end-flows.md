# 05 - End-to-End Flows

Every real journey through the system, step by step, with the function names at
each hop.

Use this document when something is not working. Each flow has a
**When it goes wrong** section that names the exact log line to look for.

---

## Contents

1. [Flow A — Register an agent](#flow-a--register-an-agent)
2. [Flow B — Deploy a function](#flow-b--deploy-a-function)
3. [Flow C — Call a function](#flow-c--call-a-function)
4. [Flow D — Read the activity feed](#flow-d--read-the-activity-feed)
5. [Flow E — Restart the agent](#flow-e--restart-the-agent)
6. [Flow F — The server restarts](#flow-f--the-server-restarts)
7. [Failure catalogue](#failure-catalogue)
8. [Where to look when something is wrong](#where-to-look-when-something-is-wrong)

Legend: **→** a network request, **⇒** a local call, **DB** a database write,
**R2** a storage write.

---

## Flow A — Register an agent

**What happens:** a person installs the agent, types in a coordinator address,
and the node appears in the dashboard as available.

```text
PERSON              RUST (lib.rs)                API                     POSTGRESQL
  │
  │ types a URL
  ├───────────────────▶
  │                    │ register_node(app, url)
  │                    │  ① trim, reject empty
  │                    │  ② reqwest::Url::parse
  │                    │  ③ MachineInfo::collect()
  │                    │
  │                    │  ④ POST /api/v1/nodes/register
  │                    ├──────────────────────────────────────▶ registerNode
  │                    │                                        ⇒ registerMachine
  │                    │                                          ⑤ zod validate
  │                    │                                          ⑥ upsert
  │                    │                                          ⑦ reply
  │                    │◀──────────────────────────────────────┤
  │                    │
  │                    │  ⑧ connect_to_scheduler(...)
  │                    │     ⇒ sse::start_worker  (runs forever)
  │                    │        GET /agents/events?machineId=…
  │                    ├──────────────────────────────────────▶ streamEvents
  │                    │                                        ⇒ addAgent
  │                    │  ⑨ save_registration_to_disk
  │                    │  ⑩ emit("node_registered")
  │◀───────────────────┤
```

### Step by step

| # | Where | What happens |
|---|-------|--------------|
| 1 | `RegistrationForm` | The person types a coordinator URL and submits |
| 2 | `App.register()` | Calls the Tauri command `register_node` |
| 3 | `register_node` | Trims the URL. Empty → `"A coordinator URL is required."` |
| 4 | `register_node` | Parses it. Invalid → `"That coordinator URL does not look valid."` |
| 5 | `MachineInfo::collect()` | Reads this computer's specs. Every field has a fallback |
| 6 | `register_node` | `POST /api/v1/nodes/register` with `{ machine: … }` |
| 7 | `registerNode` | `res.json(await registerMachine(req.body.machine))` |
| 8 | `registerMachine` | Zod validation. A bad field → `400` naming the field |
| 9 | `registerMachine` | Upsert. New node inserted, known node's specs and `last_seen_at` refreshed |
| 10 | `registerMachine` | Replies `{ status, nodeId, sessionToken, assignedRegion, heartbeatIntervalSecs }` |
| 11 | `register_node` | On **any** failure, falls back to a local stub response so the UI still works |
| 12 | `register_node` | `connect_to_scheduler` — spawns `start_worker` and registers the handle |
| 13 | `start_worker` | Opens `GET /agents/events?machineId=…` |
| 14 | `streamEvents` | Writes the `connected` event, then `addAgent` puts the response in the map |
| 15 | `register_node` | Writes `~/.HyperCore/registration.json` |
| 16 | `register_node` | Emits `node_registered` to the window |
| 17 | `App` | Sets `registration` and `coordinatorUrl`; the full UI appears |

### Timing

| Step | Typical |
|------|---------|
| 3–5 (spec collection) | 100–500 ms. `sysinfo` reads every process |
| 6–10 (registration) | One HTTP round trip |
| 13–14 (stream opens) | One HTTP round trip |
| Total | Usually under two seconds |

### When it goes wrong

| Symptom | Cause | Where to look |
|---------|-------|---------------|
| "A coordinator URL is required." | Empty field | The form |
| "That coordinator URL does not look valid." | Not a URL. Usually a missing `https://` | The form |
| `400 Invalid machine payload: …` | The agent and API disagree on the shape | Compare Rust `MachineInfo` with `machinePayloadSchema` |
| `400 Invalid machine payload:` (empty field list) + `agent connected:` in API log, but no row in `machines` | `req.body` was `undefined` — the nodes router lost its `express.json()` (the global parser mounts after `/api/v1/nodes`) | Restore `router.use(express.json())` in `nodes.router.ts`; then re-register the agent |
| The UI completes but no work ever arrives | The stream failed after the stub response | Look for `SSE connect failed` in the agent console |
| The node appears twice in the dashboard | `machine_uid` changed, so a new `machine_id` was generated | Check `~/.HyperCore/machine_id` |
| The registration succeeds but `/agents/online` is empty | The stream is not open | Check the API log for `agent connected:` |

**A note on the fallback at step 11.** If registration fails for any reason,
the agent still opens its stream and still saves the file. That is deliberate —
a developer pointing the agent at a half-built server should still see the
whole UI. The trade-off is that a failed registration looks successful in the
UI. The `connected`/`Unreachable` badge in the header is the honest signal.

---

## Flow B — Deploy a function

**What happens:** a person writes TypeScript in the dashboard, picks a target
node, and clicks deploy. By the end, a WebAssembly file exists and the
function is callable.

This is the longest flow. It crosses three processes and both data stores.

```text
PERSON         DASHBOARD        API                    AGENT              R2    DB
  │ write code     │              │                      │                 │     │
  │ pick a node    │              │                      │                 │     │
  │ click Deploy   │              │                      │                 │     │
  ├───────────────▶│              │                      │                 │     │
  │                │ POST /code-upload (multipart)     │                 │     │
  │                ├─────────────▶│ uploadCode           │                 │     │
  │                │              │  ① validateUploadInput              │     │
  │                │              │  ② isWorkerNameTaken                │     │
  │                │              │  ③ uuidv4() ───────────────────────┼────▶│
  │                │              │  ④ storeRawFiles                    │     │
  │                │              ├─────────────────────────────────────┼────▶│
  │                │              │  ⑤ resolveEntrypoint                │     │
  │                │              │  ⑥ createDeployment ─────────────────┼────▶│
  │                │              │  ⑦ pushDeployment                   │     │
  │                │              ├─────────────────────────────────────▶│     │
  │                │              │  ⑧ updateDeploymentStatus("routed")┼────▶│
  │                │◀─────────────┤ 202 { invokeUrl, workerUrl }       │     │
  │                │              │                      │              │     │
  │                │              │   event: deployment  │              │     │
  │                │              ├─────────────────────▶│ handle_routing │     │
  │                │              │                      │  ⑨ download_file│     │
  │                │              │◀─────────────────────┤    GET /code-upload/file
  │                │              ├─────────────────────────────────────┼────▶│
  │                │              │                      │  ⑩ bundle_ts_to_js      │
  │                │              │                      │  ⑪ compile_js_to_wasm  │
  │                │              │                      │  ⑫ upload_artifact     │
  │                │              │◀─────────────────────┤    POST /deployment/:id/artifact
  │                │              │ uploadArtifact      │              │     │
  │                │              │  ⑬ S3.put ──────────────────────────┼────▶│
  │                │              │  ⑭ markDeploymentBuilt ────────────┼────▶│
  │                │              │                      │  ⑮ ack "done"          │
  │                │              │◀─────────────────────┤    POST /deployment/:id/ack
  │                │              │ acknowledgeDeployment                 │
  │                │              │  ⑯ status = "built" ─────────────────┼────▶│
```

### Part 1 — The dashboard

| # | Function | What happens |
|---|----------|--------------|
| 1 | `helloWorldFiles()` | Builds the starter `File` objects |
| 2 | `checkWorkerNameTaken(name)` | `GET /code-upload/check-name`. Returns `true`, `false`, or `null` if the API is unreachable |
| 3 | `generateAvailableWorkerSlug()` | Tries up to 8 random names, stopping at the first free one |
| 4 | `fetchNodes()` | `GET /api/v1/nodes` — the target-node list |
| 5 | the upload form | `POST /code-upload` with `workerName`, `machineId`, `entrypoint` and `files[]` |

`generateAvailableWorkerSlug` returns the first slug even when **all 8** checks
fail to reach the API — the server validates again on upload, so a bad name
surfaces there with a proper error rather than blocking the user.

### Part 2 — The API validates and stores

| # | Function | What happens | On failure |
|---|----------|--------------|------------|
| 1 | `validateUploadInput` | Sanitises every name, checks `.ts` present, `package.json` present, every name allowed | `400` with a specific message |
| 2 | `isWorkerNameTaken` | One indexed existence check | Taken → `409` |
| 3 | `uuidv4()` | The deployment ID. Generated by the API, not the database | — |
| 4 | `storeRawFiles` | One `PutObject` per file to `raw/<id>/<name>` | Storage error → `500` |
| 5 | `resolveEntrypoint` | Confirms the entrypoint arrived. Falls back to the first `.ts` | No `.ts` at all → `400` |
| 6 | `createDeployment` | Inserts with status `uploaded` | Duplicate → `409` via `isUniqueViolation` |
| 7 | `pushDeployment` | Writes `event: deployment` into the agent's open stream | No stream → `false` |
| 8 | `updateDeploymentStatus` | `routed` if delivered, `offline` if not | — |
| 9 | response | `202` with the file manifest and both public URLs | — |

### Part 3 — The agent builds

| # | Function | What happens |
|---|----------|--------------|
| 1 | `start_worker` dispatch | Parses the `deployment` event into a `DeploymentRequest` |
| 2 | `handle_routing` | Wrong machine? Ack `ignored` and stop |
| 3 | banner | Prints the deployment ID, worker, entrypoint, object key |
| 4 | `run_deployment` | The pipeline below |
| 5 | `acknowledge` | `POST /deployment/:id/ack` with `status: "done"` and the summary |

**Inside `run_deployment`:**

| # | Function | What happens |
|---|----------|--------------|
| 1 | `work_dir` | `<cache>/hypercore/deployments/<id>` |
| 2 | `download_file` × N | One `GET /code-upload/file?key=…` per file |
| 3 | entrypoint on disk | Use the named file, else scan for the first `.ts` |
| 4 | `bundle_ts_to_js` | Bundled esbuild → `esbuild` → `npx esbuild` → `bun build` → copy |
| 5 | `compile_js_to_wasm` | `javy build bundle.js -o worker.wasm`. **Fatal on failure** |
| 6 | `upload_artifact` | `POST /deployment/:id/artifact`, multipart field `wasm` |

### Part 4 — The API stores the artifact

| # | Function | What happens |
|---|----------|--------------|
| 1 | `upload.single("wasm")` | Receives the file. Limit 25 MB |
| 2 | `getDeploymentById` | Unknown ID → `404` |
| 3 | `S3.put` | `artifacts/<id>/worker.wasm`, type `application/wasm` |
| 4 | `markDeploymentBuilt` | Sets `status: "built"` and `artifact_key` in one statement |
| 5 | `acknowledgeDeployment` | `status: "done"` → the record already has an artifact, so it stays `built` |
| 6 | response | `201` with `invokeUrl` and `workerUrl` |

### When it goes wrong

| Symptom | Cause | What to check |
|---------|-------|---------------|
| `400 files[] is required` | No files in the form | The editor |
| `400 A .ts function file is required` | No TypeScript file | `index.ts` must be present |
| `400 File not allowed: <name>` | Something other than a `.ts`, `package.json` or lock file | The upload list |
| `400 machineId is required (pick a target node)` | No target chosen | The dashboard picker |
| `409 workerName "x" is already taken` | The name is used | `generateAvailableWorkerSlug` should have avoided this |
| `503 Target agent is not connected` | The node has no open stream | `GET /agents/online` |
| `202` with `status: "offline"` | Same, but the row was still created | Re-routing is needed; nothing is queued |
| Agent: `SSE read error` then nothing | The build failed silently | Check the agent's console |
| Agent: `esbuild unavailable (...)` | No toolchain found, copied the file | The function may still work; check the next line |
| Agent: `javy (path) failed (<reason>)` | Javy could not compile | **The function is invalid JavaScript** after the TS→JS step |
| Agent: `javy not runnable (<e>); searched [...]` | Javy is not installed | `get_toolchain_status`, then reinstall |
| Agent: `no .ts entrypoint found after download` | Every download failed | Check the API's file proxy |
| Deployment stuck at `building` | The artifact upload failed after the ack | The API log |
| Call returns `409` after a successful deploy | `artifact_key` is null | The artifact upload never landed |

**The `409` after a successful deploy is the most confusing symptom**, and the
message is written to explain it:
`"wasm artifact not built yet — the agent is still compiling (TS -> JS -> wasm)"`.
If it persists, the artifact upload failed — look for `artifact rejected` in
the agent's console.

---

## Flow C — Call a function

**What happens:** someone hits a function's web address and gets output back.

This is the flow the whole product exists for, and the one that crosses three
processes twice.

```text
CALLER                API                             AGENT              DB
  │                      │                               │                 │
  │ GET /invoke/<id>     │                               │                 │
  ├─────────────────────▶│ invokeByDeploymentId          │                 │
  │                      │  ① getDeploymentById ─────────┼────────────────▶│
  │                      │  ② no artifactKey? → 409       │                 │
  │                      │  ③ invokeOnAgent               │                 │
  │                      │     ④ recordStarted ───────────┼────────────────▶│
  │                      │     ⑤ pending[id] = waiter      │                 │
  │                      │     ⑥ pushEvent "invoke"       │                 │
  │                      ├───────────────────────────────▶│ run_invocation  │
  │                      │                               │  ⑦ worker.wasm? │
  │                      │                               │  ⑧ stdin = body  │
  │                      │                               │  ⑨ execute()     │
  │                      │                               │                 │
  │                      │◀── POST /invocations/<id>/result                 │
  │                      │ postInvocationResult          │                 │
  │                      │  ⑩ resolveInvocation ──┐       │                 │
  │                      │     ⑪ recordFinished ──┼───────┼────────────────▶│
  │◀──── 200 text/plain ─┤     ⑫ settle → the awaiting request resumes     │
```

### Part 1 — The API receives

| # | Function | What happens |
|---|----------|--------------|
| 1 | `express.raw({ type: "*/*", limit: "1mb" })` | The body stays raw bytes, up to 1 MB |
| 2 | `getDeploymentById` | One indexed lookup. Not found → `404` |
| 3 | `serve` → the `artifactKey` check | Null → `409` with an explanation |
| 4 | `subPath` | Works out the path the function will see |
| 5 | `invokeOnAgent` | Dispatch and wait |

**The three pieces of request context the function receives:**

| Passed | Limit | Why the limit |
|--------|-------|---------------|
| `method` | — | — |
| `path` | 2000 characters | A pathological URL cannot produce a huge event |
| `query` | 2000 characters | Same |
| `bodyB64` | 1 MB from the router | Base64 of the raw body |
| `timeoutMs` | `INVOKE_TIMEOUT_MS - 2000` | Computed inside the service |

### Part 2 — The dispatch

`invokeOnAgent` does five things in a careful order.

| # | Step | Why the order matters |
|---|------|-----------------------|
| 1 | Generate `invocationId` | Fresh per call |
| 2 | `agentTimeoutMs = max(1000, INVOKE_TIMEOUT_MS - 2000)` | The agent gives up first |
| 3 | `serverWaitMs = INVOKE_TIMEOUT_MS + 5000` | The server waits longer, so the agent's answer wins |
| 4 | **`await recordStarted(...)`** | **Before** dispatching. A fast agent can answer before a slow write finishes |
| 5 | `trackWaiter` then `pushEvent` | Register the waiter *before* pushing, so a fast result cannot arrive first |

With the default 10,000 ms: the agent gets 8,000 ms, the server waits
15,000 ms.

### Part 3 — The agent runs

| # | Function | What happens |
|---|----------|--------------|
| 1 | `start_worker` dispatch | `invoke` events are **spawned**, not awaited |
| 2 | `run_invocation` | The whole run |
| 3 | `spawn_blocking(executor::execute)` | Because `execute` is CPU-heavy and blocking |
| 4 | `handle_invoke` | POSTs the result |

**Inside `run_invocation`:**

| # | Step | On failure |
|---|------|------------|
| 1 | Check `machine_id` matches | `"belongs to machine <id>"` |
| 2 | `work_dir/<id>/worker.wasm` exists? | — |
| 3 | Not there → download `artifact_key` | `"artifact download failed"` |
| 4 | No artifact key either | `"no wasm artifact for this deployment"` |
| 5 | Decode `body_b64` into stdin | `"bad request body"` |
| 6 | Build `HC_METHOD`, `HC_PATH`, `HC_QUERY` | — |
| 7 | `executor::execute` | Mapped into an `InvokeOutcome` |

### Part 4 — The sandbox runs the function

Inside `executor::execute`, in order:

| # | Step | Failure message |
|---|------|-----------------|
| 1 | Check for the 8-byte placeholder | `"artifact is an empty placeholder wasm…"` |
| 2 | `consume_fuel(true)`, `epoch_interruption(true)` | — |
| 3 | `Engine::new` | `"engine: …"` |
| 4 | `Module::new` — **compile** | `"compile: …"` |
| 5 | `preview1::add_to_linker_sync` — **link** | `"link wasi: …"` |
| 6 | Output pipes: 4 MB stdout, 64 KB stderr | — |
| 7 | `WasiCtxBuilder` with stdin, pipes, env | — |
| 8 | `set_fuel(2_000_000_000)` | `"fuel: …"` |
| 9 | `set_epoch_deadline(1)` | — |
| 10 | Spawn the timeout thread | — |
| 11 | `instantiate` | `"instantiate: …"` |
| 12 | `get_typed_func::<(), ()>("_start")` | `"missing _start: …"` |
| 13 | `func.call()` — **run** | Classified below |
| 14 | `drop(store)` then read both pipes | — |

**Classifying the result:**

| `call` returned | Reported as |
|-----------------|-------------|
| `Ok(())` | `ok: true`, `code: 0` |
| `I32Exit(n)` | `ok: false`, `code: n` — an explicit exit is a *result* |
| The timeout flag is set | `error: "function timed out"`, `timedOut: true` |
| The message mentions fuel | `error: "function exhausted its fuel (possible infinite loop)"` |
| Anything else | `error: "trap: <message>"` |

### Part 5 — The result comes back

| # | Function | What happens |
|---|----------|--------------|
| 1 | `handle_invoke` | POSTs `{ machineId, ok, code, stdoutB64, stderr, error, timedOut }` |
| 2 | `express.json({ limit: "10mb" })` | 10 MB because 4 MB of output becomes 5.4 MB of base64 |
| 3 | `resolveInvocation` | Finds the waiter, settles it, returns `true` |
| 4 | `recordFinished` | Runs on a best-effort basis. A failure is only logged |
| 5 | the awaiting `serve` resumes | The `pending` entry is already gone |
| 6 | `serve` sets headers | `x-hypercore-deployment`, `x-hypercore-worker`, `x-hypercore-node` |
| 7 | `decodeStdout` | Base64 → bytes, falling back to plain text |
| 8 | `res.type("text/plain").send(buffer)` | Plus `x-hypercore-exit-code: 0` |

### The outcome table

| Outcome | HTTP | Body | `status` column | `exit_code` |
|---------|------|------|-----------------|-------------|
| Function ran, exit 0 | `200` | The output as `text/plain` | `done` | `0` |
| Function ran, exit 3 | `502` | The error, up to 1000 chars of stdout, and stderr | `failed` | `3` |
| Function trapped | `502` | `trap: <message>` | `failed` | null |
| Function timed out | `502` | `"function timed out"` | `failed` | null |
| Fuel exhausted | `502` | `"function exhausted its fuel…"` | `failed` | null |
| Node offline | `503` | `"Node is offline (no open SSE stream)"` | `failed` | null |
| Nobody answered | `504` | `"Node did not respond in time"` | `timeout` | null |
| No artifact | `409` | The "still compiling" message | unchanged | — |
| Unknown deployment | `404` | `"Unknown deployment"` | — | — |

### The headers

Set on **every** response, including failures:

```text
x-hypercore-deployment:  the deployment that ran
x-hypercore-worker:      the worker name
x-hypercore-node:        the machine that ran it
x-hypercore-exit-code:   "0"  (success only)
```

When a call fails, these four headers are usually the fastest way to find
which function and which node were involved.

### When it goes wrong

| Symptom | Likely cause | Where to look |
|---------|--------------|---------------|
| `404 Unknown deployment` | A bad ID | The URL |
| `409 … still compiling` | No artifact yet, or the upload failed | The deployment's status |
| `404 No built deployment for this worker yet` | On a worker URL: the name is wrong, or nothing is built under it | `GET /deployment` |
| `503 Node is offline` | The agent's stream dropped | Agent console; `GET /agents/online` |
| `504 Node did not respond` | The function outlasted both budgets | `INVOKE_TIMEOUT_MS` |
| `502 … exited with code 1` | The function threw or called `process.exit(1)` | The function's `stderr` in the response |
| `502 trap: … out of fuel` | An infinite loop with no checkpoint | The function |
| `502 missing _start` | A module with no entry point | Usually an eight-byte placeholder; redeploy |
| The status stays `running` forever | The server restarted mid-call | [Flow F](#flow-f--the-server-restarts) |
| `bad request body` | The base64 in the event was corrupt | Unlikely; a network or version mismatch |

**Timeouts are not interchangeable.** `502` means the function ran and failed —
that is your code. `504` means the function never answered in time — that is
your code being slow. `503` means the node was not there — that is
infrastructure.

---

## Flow D — Read the activity feed

**What happens:** the agent's window shows this node's deployments and calls,
refreshing every three seconds.

```text
App.tsx  →  useActivity  →  GET /activity?machineId=…&limit=50
                              │
                              ▼
                        getActivityByMachine
                              │ clamps limit to 1–100
                              ▼
                        getActivity(machineId, limit)
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
   listDeploymentsByMachine        listInvocationsByMachine
   (Promise.all — concurrent)      (Promise.all — concurrent)
              │                               │
              └───────────────┬───────────────┘
                              ▼
                    toDeploymentDto × N
                    toInvocationDto × N
                              │
                    online: isAgentOnline(…)   ← the scheduler's map
```

| # | Function | What happens |
|---|----------|--------------|
| 1 | `useActivity` | Fetches on mount, then every 3,000 ms |
| 2 | `getActivityByMachine` | `machineId` required, `limit` clamped to 1–100, default 50 |
| 3 | `getActivity` | Runs both queries **concurrently** with `Promise.all` |
| 4 | `isAgentOnline` | The one piece of data that does not come from the database |
| 5 | `toDeploymentDto` / `toInvocationDto` | Rows become JSON-safe objects |
| 6 | `useActivity` | Sets `data`, `updatedAt`, and clears `error` |

**Three distinct states** are surfaced, and they mean different things:

| Badge | Meaning |
|-------|---------|
| **Connected** | The server says the node is online |
| **Unreachable** | The window cannot reach the server at all |
| **Idle** | The server is reachable, but the node is not registered |

Conflating the last two would make a network problem look like a registration
problem, so the header distinguishes them.

**`useActivity` polls with `enabled: registered && live`.** Polling before
registration would return an empty feed forever, and the live toggle stops it
when the user wants to read a snapshot.

**Output is truncated to 2,000 characters** in the history, while the caller
still receives all 4 MB. `previewStdout` decodes the base64 first and then
truncates, so the limit is real characters.

---

## Flow E — Restart the agent

**What happens:** the person quits the app and opens it again. Nothing to
retype.

```text
Window mounts
     │
     ▼
App.tsx useEffect
     │
     ▼
invoke("get_saved_registration")
     │
     ├─► load_saved_registration()
     │       └─► read ~/.HyperCore/registration.json
     │              ├─ absent  → None → show the scan screen
     │              └─ corrupt → None → show the scan screen
     │
     ├─► connect_to_scheduler(...)      ← reconnects immediately
     │       └─► sse::start_worker      GET /agents/events
     │
     └─► setRegistration, setCoordinatorUrl, setRestoredMachineId
            └─► the full UI appears, no scan, no registration
```

Three outcomes worth knowing:

| Situation | Result |
|-----------|--------|
| The file is absent | `None`. The scan and register screens appear |
| The file is corrupt | `None`. Same — treated as a first launch |
| The coordinator is unreachable | The stream retries with backoff up to 30 s. The UI still shows, and the badge says `Unreachable` |

**Deployment artifacts survive a restart by accident, and recover on
purpose.** The scratch folder is in the *cache* directory, so the operating
system may clear it. When that happens, `run_invocation` finds no
`worker.wasm` and re-downloads it from `artifact_key`. A restart never
permanently breaks a deployed function.

**Unregistering is different.** `unregister_node` aborts the connection and
**deletes the file**, so the next launch shows the scan screen. That is the
"forget this coordinator" action.

---

## Flow F — The server restarts

**What happens:** the API process dies and comes back. Here is exactly what
each side notices.

```text
The API process dies
     │
     ├── The scheduler map is empty. Every agent is now "offline".
     │      GET /agents/online → []
     │      toMachineDto(online) → false for every node
     │
     ├── Every pending invocation waiter is gone.
     │      The awaiting HTTP requests get no result…
     │      …they wait INVOKE_TIMEOUT_MS + 5000, then get 504.
     │      Their database rows stay at status "running" forever.
     │
     └── The agents notice within ~1 second:
            start_worker sees the stream end
            → eprintln!("SSE stream closed by scheduler. Reconnecting...")
            → sleeps 1 second (backoff was reset on the last success)
            → reconnects
            → addAgent puts them back in the map
```

### What recovers

| Thing | Recovers? | How |
|-------|-----------|-----|
| Online status | Yes, in about a second | The agent reconnects |
| Function calls in progress | **No** | The waiter is gone. The caller gets `504` |
| Invocation history | Yes, except the `running` rows | Everything already written is safe |
| A row stuck at `running` | **No** | Nothing reconciles it |
| Deployments and their artifacts | Yes | All in the database and in storage |

### The `running` rows

This is the sharpest edge in the system, and it is worth being precise about:

| What happened | What the row says | What actually happened |
|---------------|-------------------|-----------------------|
| `recordStarted` wrote the row | `running` | Correct at the time |
| The process died before `recordFinished` | `running` forever | The caller got a `504` |

There is no sweep. If you see old `running` rows, this is why. A fix would be
a periodic job that updates rows older than a few minutes to `timeout`.

### Recovery time

| Step | Typical |
|------|---------|
| Agent notices the stream closed | Under 1 second |
| Agent reconnects | 1 second (backoff was reset) |
| `addAgent` fires | Immediately on connect |
| Online status is correct | About 2 seconds total |

---

## Failure catalogue

Every error message the system can produce, what it means, and what to do.

### From the API

| Message | Status | Cause | Fix |
|---------|--------|-------|-----|
| `workerName is required` | 400 | The form sent an empty name | Fill it in |
| `machineId is required (pick a target node)` | 400 | No target node chosen | Pick one in the dashboard |
| `files[] is required (ts entrypoint + package.json + bun.lock)` | 400 | No files uploaded | Add files |
| `A .ts function file (e.g. index.ts) is required` | 400 | No TypeScript file | Add `index.ts` |
| `package.json is required` | 400 | Missing | Add it |
| `File not allowed: <name>. Upload a .ts entrypoint, package.json and bun.lock[b].` | 400 | A disallowed file type | Remove it |
| `workerName "x" is already taken` | 409 | The name is used globally | Pick another |
| `Invalid machine payload: <fields>` | 400 | The agent's payload failed validation | Compare the Rust struct and the Zod schema |
| `key must start with raw/ or artifacts/` | 400 | A storage proxy request with a bad prefix | Use a real key |
| `Sign in required` + `missing-cookie` | 401 | No cookie sent | Sign in |
| `Sign in required` + `invalid-session` | 401 | The session expired | Sign in again |
| `Sign in required` + `lookup-failed` | 401 | The session lookup threw | Check the database |
| `Unknown deployment` | 404 | No such deployment ID | Check the URL |
| `No built deployment for this worker yet` | 404 | Wrong name, or nothing built | Check `GET /deployment` |
| `Unknown or expired invocationId` | 404 | The result arrived after the timeout | Expected occasionally |
| `wasm artifact not built yet — the agent is still compiling (TS -> JS -> wasm)` | 409 | No artifact yet | Wait, or check the deploy |
| `Node is offline (no open SSE stream)` | 503 | No open stream | Start or reconnect the agent |
| `Node did not respond in time` | 504 | The function outlasted the budget | Raise `INVOKE_TIMEOUT_MS` |
| `Target agent is not connected (no open SSE stream)` | 503 | On a deploy | Pick an online node |
| `Internal server error` | 500 | Anything unexpected | The API log has the detail |

### From the agent — build stage

| Message | Cause | Fix |
|---------|-------|-----|
| `esbuild unavailable (<e>); copied TS as JS fallback` | No bundler found | Check `get_toolchain_status`; the build may still work |
| `esbuild failed (<e>) and fallback copy failed: <e>` | No bundler and the copy failed | Install a toolchain |
| `javy (<path>) failed (<reason>); check the agent's toolchain status…` | **The JavaScript is invalid** | Fix the TypeScript |
| `javy not runnable (<e>); searched [<paths>] and PATH` | Javy is missing | `bun run fetch:tools`, or reinstall |
| `no .ts entrypoint found after download` | Every download failed | Check the file proxy |
| `mkdir failed: <e>` | The cache directory is not writable | Check permissions |
| `artifact rejected: <status>` | The API refused the upload | Check the API log |
| `download rejected for <key>: <status>` | The proxy refused | Check `assertReadableKey` |
| `workdir failed: <e>` | The scratch folder could not be created | Check disk and permissions |

### From the agent — invocation stage

| Message | Cause |
|---------|-------|
| `belongs to machine <id>` | Addressed to the wrong node |
| `artifact download failed: <e>` | The re-download after a restart failed |
| `no wasm artifact for this deployment` | No artifact and no key to fetch one with |
| `bad request body: <e>` | The base64 was corrupt |
| `read wasm failed: <e>` | The artifact file is unreadable |
| `artifact is an empty placeholder wasm (the build toolchain was unavailable when it was deployed); redeploy the function` | An old agent uploaded 8 bytes. **Redeploy** |
| `function timed out` | The wall-clock limit fired |
| `function exhausted its fuel (possible infinite loop)` | The instruction budget ran out |
| `missing _start: <e>` | The module has no entry point |
| `trap: <message>` | The function crashed |
| `executor task failed: <e>` | The blocking thread itself failed |
| `compile: <e>` | The module did not compile |
| `instantiate: <e>` | The module could not start |
| `engine: <e>` / `link wasi: <e>` / `fuel: <e>` | The runtime could not be set up |

### From the agent — connection stage

| Message | Cause | Fix |
|---------|-------|-----|
| `SSE connect failed: <e>. Retrying in <d>…` | The coordinator is unreachable | Check the URL and the network |
| `SSE rejected (<status>). Retrying…` | The server refused the stream | Check the CORS allowlist |
| `SSE read error: <e>` | The stream broke mid-read | It reconnects on its own |
| `SSE stream closed by scheduler. Reconnecting...` | The server restarted or the network dropped | Nothing. It reconnects |
| `Invalid deployment event: <e>` | The payload did not parse | A version mismatch between the agent and the API |
| `Invalid invoke event: <e>` | Same, for an invoke | Same |
| `Ack failed for <id>: <e>` | The status ping did not arrive | Nothing. The build still happened |
| `Ack rejected (<status>): <id>` | The server refused the ack | Check the API log |

---

## Where to look when something is wrong

In order. Each step tells you which side the problem is on.

### Step 1 — Is the node online?

```bash
curl http://localhost:8080/agents/online
```

| Result | Meaning |
|--------|---------|
| `{"online": ["abc"], "count": 1}` | The node is connected. Move on |
| `{"online": [], "count": 0}` | The node is not connected. Go to step 2 |

### Step 2 — The agent's console

Look for, in order:

| Log line | Meaning |
|----------|---------|
| `Connecting to scheduler SSE: <url>` | It is trying. Watch the URL |
| `Connected to scheduler. Waiting for deployment requests...` | **It is working.** If you see this, the problem is elsewhere |
| `SSE connect failed: …` | The coordinator is unreachable |
| `SSE rejected (403)` | The CORS allowlist does not include the agent's origin |

`Connected to scheduler` is the single most useful line in the agent. Its
absence means the problem is in the connection, not in the build or the call.

### Step 3 — The API's console

| Log line | Meaning |
|----------|---------|
| `[scheduler] agent connected: <id> (online: N)` | The stream opened |
| `[scheduler] agent disconnected: <id> (online: N)` | The stream closed |
| `[scheduler] routed deployment <id> -> <id>` | The deploy event was delivered |
| `[scheduler] ack deployment=<id> machine=<id> status=done` | The build finished |
| `[deployments] artifact stored deployment=<id> key=<key> bytes=<n>` | The artifact landed |
| `[deployments] live at <invokeUrl> (worker: <workerUrl>)` | It is callable |
| `[db] invocation persist skipped: <e>` | The database is unhappy but calls still work |
| `[cors] allowed origins: <list>` | Printed at boot. Check it if the browser is complaining |
| `[auth] denied <method> <url> origin=<o> cookies=[<names>]` | A sign-in problem, with the cookie **names** only |

### Step 4 — The database

```sql
-- What happened to this deployment?
SELECT id, worker_name, status, artifact_key, created_at, updated_at
FROM deployments ORDER BY created_at DESC LIMIT 10;

-- The last calls, with their outcomes
SELECT id, worker_name, method, path, status, exit_code, duration_ms, error
FROM invocations ORDER BY created_at DESC LIMIT 20;

-- Anything stuck?
SELECT id, status, created_at FROM invocations
WHERE status = 'running' ORDER BY created_at DESC;
```

The third query finds rows stuck at `running`, which always means a server
restart or a process death mid-call. See [Flow F](#flow-f--the-server-restarts).

### Step 5 — Call it and read the headers

```bash
curl -i http://localhost:8080/invoke/<deploymentId>
```

The `x-hypercore-*` headers tell you which deployment, worker and node were
involved, **even on a failure**. That is usually enough to find the problem
without opening any log.

### Step 6 — The agent's Insights page

Shows two things the logs do not:

| Shown | Answers |
|-------|---------|
| Live CPU and memory | Is the node overloaded? |
| Toolchain status | Are esbuild and Javy actually found? |

If Javy is missing, no deploy can succeed. That page answers it in one glance.

---

## Next

- Environment variables, local setup, migrations:
  [06 - Setup and Runbook](./06-setup-and-runbook.md)
- The tables these flows write:
  [04 - Data Model](./04-data-model.md)
