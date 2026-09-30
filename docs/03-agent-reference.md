# 03 - Agent Reference

Everything in `apps/agent`, explained function by function.

The agent is the desktop app a person installs on their own computer. It does
three things: it listens for work, it builds functions, and it runs them.

- **Where the code is:** `apps/agent`
- **Rust backend:** `apps/agent/src-tauri/src` (5 files)
- **React window:** `apps/agent/src` (14 files)
- **How to run it in development:** `bun run tauri dev` inside `apps/agent`
- **How to build an installer:** `bun run build:installer`

---

## How to use this document

1. [The two halves](#1-the-two-halves) — how the Rust and React sides talk.
2. [sse.rs — the live connection and the build pipeline](#3-ssers--the-live-connection-and-the-build-pipeline) — the most important file.
3. [executor.rs — running the code](#4-executorrs--running-the-code) — the sandbox.
4. [lib.rs — Tauri commands](#5-librs--tauri-commands-and-persistence)
5. [tools.rs and machine_info.rs](#6-toolsrs--finding-the-build-tools) and [machine_info.rs](#7-machine_infors--reading-this-computer)
6. [The React window](#8-the-react-window)
7. [A function lookup table](#10-every-agent-function-in-one-table)

---

## 1. The two halves

Tauri apps have a Rust half and a web half. They are separate programs in one
window.

```text
┌─────────────────────── apps/agent/src (React 19 + Vite) ────────────────────┐
│                                                                            │
│  App.tsx           all UI state lives here                                 │
│    ├── invoke<T>("get_machine_info")          ─────┐                       │
│    ├── invoke<T>("register_node", {url})            │                       │
│    ├── invoke<T>("get_saved_registration")         ├── Tauri IPC          │
│    ├── invoke("unregister_node")                   │  (local, not HTTP)  │
│    └── invoke<T>("get_toolchain_status")      ─────┘                       │
│                                                                            │
│  useActivity   polls GET /activity over real HTTP                          │
│  useUpdater    asks the updater plugin for a newer version                 │
│  useMediaQuery responds to window width                                    │
│                                                                            │
│  pages/  Machine · Logs · Deployments · Insights · Settings                │
└────────────────────────────────────────────────────────────────────────────┘
```

Three different kinds of communication, and it matters which is which:

| Channel | Direction | Used for |
|---------|-----------|----------|
| **Tauri IPC** | React → Rust, one call at a time | Reading local facts: machine specs, tool locations, saved registration |
| **Rust events** | Rust → React, pushed | `metrics_tick` every 2 seconds, `node_registered` after registering |
| **Real HTTP** | Rust → API server | Everything about the product: the live stream, file downloads, build uploads, results |

The React window never talks to the API about deployments or invocations
through Rust. It reads its history with a plain `fetch` to `GET /activity`,
which keeps the Rust side out of the picture for read-only display.

### The permission list

Rust functions the window can call must be registered in two places:

1. `invoke_handler(tauri::generate_handler![…])` in `lib.rs`
2. `capabilities/default.json` — the permission file

Missing either one means the call fails at runtime with a permission error.
This is why the window cannot, for example, run a shell command: no such
command is registered.

---

## 2. `machine_info.rs` — reading this computer

A short file with two responsibilities: describe the computer once, and report
live resource usage repeatedly.

### `MachineInfo`

The static description sent to the server at registration.

| Rust field | JSON name | Meaning |
|-----------|-----------|---------|
| `machine_id` | `machineId` | Stable ID for this host |
| `hostname` | `hostname` | The computer's name |
| `os_name` | `osName` | e.g. `Windows` |
| `os_version` | `osVersion` | e.g. `10.0.19045` |
| `kernel_version` | `kernelVersion` | The kernel or OS build string |
| `arch` | `arch` | e.g. `x86_64` |
| `cpu_logical_cores` | `cpuLogicalCores` | Cores including hyper-threading |
| `cpu_physical_cores` | `cpuPhysicalCores` | Real physical cores |
| `cpu_brand` | `cpuBrand` | e.g. `AMD Ryzen 7 5800X` |
| `total_memory_mb` | `totalMemoryMb` | Total RAM |
| `used_memory_mb` | `usedMemoryMb` | RAM in use |
| `total_disk_mb` | `totalDiskMb` | Total disk across all volumes |
| `available_disk_mb` | `availableDiskMb` | Free disk |
| `local_ip` | `localIp` | The LAN address |

`#[serde(rename_all = "camelCase")]` on the struct is what makes the Rust
snake_case fields appear as camelCase in JSON. Without it every field would
need a manual rename. This is the first half of the contract with
`machinePayloadSchema` in the API.

The matching TypeScript interface lives in
`apps/agent/src/types/index.ts` as `MachineInfo`, and the same shape is
validated server-side by `machinePayloadSchema`. Three places, one shape.

### `MetricsTick`

The live reading pushed to the window every two seconds.

| Field | Meaning |
|-------|---------|
| `cpu_percent` | Average CPU use, 0 to 100 per core, averaged across cores |
| `used_memory_mb` | RAM in use right now |
| `total_memory_mb` | Total RAM |

Much smaller than `MachineInfo` on purpose: this is pushed continuously, so it
carries only what changes.

### `fallback_machine_id()`

Finds a stable ID for this computer, and persists it.

1. Look for `~/.HyperCore/machine_id` (Windows and macOS) or the equivalent
   home directory.
2. If the file exists and is not empty, return its contents.
3. Otherwise generate a fresh UUID, create the directory, write the UUID, and
   return it.

**Why persist it at all.** The primary source is the operating system's own
machine ID, which comes from `machine_uid`. That is stable on almost every
system, but it is not available everywhere — some containers and some locked
down Windows installs refuse to return it. The persisted UUID is the safety
net, and it is generated exactly once.

The persistence is what makes the ID stable. If it were regenerated on every
launch, the server would treat each launch as a brand new node, and a user
would accumulate dozens of duplicate nodes in their dashboard.

The `let _ =` prefixes are deliberate: a failure to read or write the file is
ignored, because failing to identify the machine is better than refusing to
run.

### `MachineInfo::collect()`

Builds the full description. Called by the `get_machine_info` Tauri command
and by `register_node`.

| Step | How |
|------|-----|
| 1 | `System::new_all()` then `refresh_all()` — reads every CPU, memory and process fact |
| 2 | `Disks::new_with_refreshed_list()` — every mounted volume |
| 3 | Sum `total_space()` across all disks, and `available_space()` across all disks, then divide by 1024 twice to get megabytes |
| 4 | CPU brand from the first entry of `system.cpus()`, or `"Unknown CPU"` |
| 5 | `machine_uid::get()`, falling back to `fallback_machine_id()` |
| 6 | Everything else from `System` or `std::env::consts::ARCH` |
| 7 | `local_ip()` from the `local_ip_address` crate, or `"Unavailable"` |

**Summing across all volumes** is a choice worth flagging. A Windows machine
with a C: drive, a D: data drive and a network mount reports the sum. That
over-states local capacity if a network drive is counted, and the API stores
it as-is. The alternative — only the system drive — would understate a machine
that keeps its work on a second drive.

**Every field has a fallback.** No call can produce an empty description, even
on a locked-down system. The schema on the server requires all fourteen
fields, so a `None` anywhere would fail validation and block registration.

### `collect_metrics()`

The live reading, called every two seconds by a task in `lib.rs`.

```rust
let mut system = System::new_all();
system.refresh_cpu_usage();
std::thread::sleep(Duration::from_millis(150));
system.refresh_cpu_usage();
```

**The 150 ms sleep is necessary, not a performance mistake.** CPU usage is
measured as the difference between two readings. The first `refresh_cpu_usage`
after creating a fresh `System` has no previous value to compare against, so
it returns nothing useful. Sleeping briefly and reading again gives the
library a baseline and a comparison point. Without it, `cpu_percent` would
always be zero.

Then the average across cores, and the two memory figures. An empty CPU list
yields `0.0` rather than dividing by zero.

---

## 3. `sse.rs` — the live connection and the build pipeline

The largest and most important file in the agent. It holds the connection
loop, the download-and-build pipeline, and the invocation runner.

### 3.1 The data shapes

All three use `#[serde(rename_all = "camelCase")]`, matching the TypeScript
side exactly.

#### `DeploymentFileRef`

| Field | Meaning |
|-------|---------|
| `name` | The file name to write on disk, e.g. `index.ts` |
| `key` | The storage key to read it from |

#### `DeploymentRequest`

What arrives as `event: deployment`.

| Field | Required | Meaning |
|-------|----------|---------|
| `deployment_id` | yes | Which deployment |
| `machine_id` | yes | Which computer should get it |
| `object_key` | yes | Storage key of the entrypoint. **Kept for older agents** |
| `worker_name` | no | The short public name |
| `entrypoint` | no | Which file to build. Defaults to `index.ts` |
| `files` | no | Every file in the bundle |

`object_key` is the only key an older agent understands, so it is never
removed. The optional fields all carry `#[serde(default)]`, so a payload
without them parses cleanly and the fields become `None`. That is what makes
one Rust struct handle both the old three-field shape and the new one.

#### `InvokeRequest`

What arrives as `event: invoke`.

| Field | Meaning |
|-------|---------|
| `invocation_id` | The ID to report the result under |
| `deployment_id` | Which deployment to run |
| `worker_name` | Its short name |
| `machine_id` | Which computer owns it — checked before running |
| `artifact_key` | Where the WebAssembly file lives in storage |
| `method` | The caller's HTTP method |
| `path` | The path the function sees |
| `query` | The query string |
| `body_b64` | The request body, base64 |
| `timeout_ms` | How long the agent may run it |

#### `default_invoke_timeout()`

```rust
fn default_invoke_timeout() -> u64 { 8_000 }
```

The `#[serde(default = "...")]` fallback for `timeout_ms`. If an older server
omits the field, the agent uses 8 seconds rather than 0 — and 0 would mean
"no time at all", failing every call instantly.

### 3.2 The configuration

#### `SseConfig`

| Field | Meaning |
|-------|---------|
| `coordinator_url` | The API address. **The only thing the user types in.** No broker URL, no credentials |
| `machine_id` | Which stream to open |
| `tools_dir` | Where the bundled esbuild and javy live. `None` means "search the executable's folder and PATH" |

The comment on `coordinator_url` is the design in one line: it is the only
setting a user has to provide, and it is a plain web address.

### 3.3 URL helpers

#### `stream_url(config)`

```rust
format!("{}/agents/events?machineId={}", coordinator_url.trim_end_matches('/'), machine_id)
```

The one address the agent holds open. Trailing slashes are stripped so a URL
typed with one does not produce a doubled slash in the path.

#### `base_url(config)`

The coordinator address with trailing slashes removed. Used by every other
call the agent makes.

Both helpers do the same trimming, which is why they exist: six functions
build URLs and none of them should repeat the trimming.

### 3.4 The filesystem

#### `work_dir(deployment_id)`

```rust
dirs::cache_dir().unwrap_or(std::env::temp_dir)
    .join("hypercore").join("deployments").join(deployment_id)
```

The per-deployment scratch folder. Typically
`%LOCALAPPDATA%\hypercore\deployments\<id>` on Windows.

Putting it in the **cache** directory is deliberate: the operating system is
allowed to clear it when disk space is needed, and everything in it can be
fetched again from storage. A deployment that loses its scratch folder still
works — the agent re-downloads the artifact at call time. Storing it in a
permanent location would just accumulate files nobody cleans up.

`unwrap_or(std::env::temp_dir)` means the agent still works if the cache
directory cannot be determined.

### 3.5 Talking to the API

#### `acknowledge(client, config, request, status, message)`

Tells the API how a build went.

```
POST /deployment/<deploymentId>/ack
{ "machineId": "…", "status": "done", "message": "…" }
```

| `status` sent | When |
|---------------|------|
| `"done"` | The build succeeded |
| `"failed"` | The build failed |
| `"ignored"` | The deployment was addressed to a different machine |

Both outcomes are logged if the request fails, but neither is fatal. A lost
ack means the server's status display is briefly wrong; failing the whole
deployment over a status ping would be much worse.

#### `download_file(client, config, key, dest)`

Fetches one file from storage **through the API**.

```
GET /code-upload/file?key=<storage-key>
```

| Step | Behaviour | On failure |
|------|-----------|------------|
| 1 | Build the URL from the storage key | — |
| 2 | `client.get(url).send()` | `Err` → `"download request failed for <key>: <e>"` |
| 3 | Check the status is a success | Non-success → `"download rejected for <key>: <status>"` |
| 4 | `response.bytes()` | `Err` → `"download body failed for <key>: <e>"` |
| 5 | `create_dir_all` on the parent folder | `Err` → `"mkdir failed: <e>"` |
| 6 | `tokio::fs::write` | `Err` → `"write <path> failed: <e>"` |
| 7 | Return the byte count | — |

**Every failure message names the key.** A build with twelve files that fails
on the ninth needs to say which one. The byte count comes back so `run_deployment`
can print `pulled <key> (<n> bytes) -> <path>`.

**Why the API proxies this.** The agent holds no storage credentials. This is
the security property that lets the installer be a plain download with nothing
secret inside it. The cost is one extra network hop, which the
`assertReadableKey` check on the server side keeps safe.

#### `upload_artifact(client, config, request, wasm_path)`

Sends the finished WebAssembly file back **through the API**.

| Step | Behaviour | On failure |
|------|-----------|------------|
| 1 | Read the file | `Err` → `"read wasm failed: <e>"` |
| 2 | Build a multipart part named `worker.wasm`, type `application/wasm` | `Err` on the MIME type → `"mime failed: <e>"` |
| 3 | `POST /deployment/<id>/artifact` with the form | `Err` → `"artifact upload failed: <e>"` |
| 4 | Check the status | Non-success → `"artifact rejected: <status>"` |
| 5 | Return the response text | — |

The returned text is the server's receipt, including both public URLs.
`run_deployment` prints it, so the agent's own console shows the deployment's
live addresses.

The `multipart` feature and a fixed field name of `wasm` are the contract with
`upload.single("wasm")` in the API's router. Both sides must agree on the field
name.

### 3.6 Building the code

#### `bundle_ts_to_js(entry, out_js, tools_dir)`

Turns one TypeScript file into one JavaScript file. Tries four tools in order.

The arguments every attempt shares:

```text
<tool> <entry> --bundle --format=esm --platform=neutral --outfile=<out.js>
```

`--format=esm` because Javy needs a module. `--platform=neutral` because the
code will not run on the local machine. `--bundle` so the output is a single
file with no imports to resolve.

The four attempts, in order:

| # | Tool | Where it comes from | Why this order |
|---|------|---------------------|----------------|
| 1 | Bundled esbuild | `tools::resolve_tool` finds the copy inside the installer | Deterministic. The user needs nothing installed |
| 2 | `esbuild` | Whatever is on `PATH` | A developer machine usually has it |
| 3 | `npx --yes esbuild` | Downloads on demand | Works with only Node installed |
| 4 | `bun build <entry> --outfile <out>` | Bun's own bundler | A machine that has Bun but not esbuild |

Each attempt runs and is checked. A non-zero exit keeps the error text as
`last_err` and moves to the next. A missing binary is recorded as
`"<bin> not found: <e>"`.

On the first success it returns `"bundled with <bin>"`, and `run_deployment`
prints `ts->js: bundled with <path>`.

**The final fallback.** If every attempt fails, the file is copied to
`out_js` as-is and the function returns:

```
"esbuild unavailable (<last error>); copied TS as JS fallback"
```

The copy succeeds when the input is valid TypeScript that is also valid
JavaScript, which is common — type annotations are the usual difference, and a
file without them compiles unchanged. When it does not compile, Javy will fail
in the next step with a real error, and the deployment fails visibly.

The alternative — failing here — would break every deploy on a machine with no
JavaScript tooling, even for code that needed no transformation at all.

#### `compile_js_to_wasm(js, out_wasm, tools_dir)`

Turns JavaScript into WebAssembly.

```rust
javy build <bundle.js> -o <worker.wasm>
```

| Outcome | Returns | Why |
|---------|---------|-----|
| Exit 0 | `"compiled with javy (<path>)"` | Success |
| Non-zero exit | `Err` with javy's stderr and a message pointing at the toolchain status screen, reinstalling, or `bun run fetch:tools` for development | The real error is passed on |
| Binary not runnable | `Err` naming **every location searched**, then `PATH` | The user needs to know where it looked |

**A Javy failure is fatal, and the comment above the function explains why.**
Uploading a stand-in artifact would let the deployment report "done", and then
every single call would fail with `missing _start`. That is far harder to
diagnose than a build that refused to finish. Contrast this with
`bundle_ts_to_js`, which does have a fallback — the difference is that a
missing esbuild produces a *plausible* JavaScript file, while a missing Javy
produces no WebAssembly at all.

The binary comes from `tools::resolve_tool`, falling back to the bare name
`javy` so the operating system's own lookup runs.

#### `run_deployment(client, config, request)`

The whole Execution-Plane pipeline in one function.

| # | Step | Detail |
|---|------|--------|
| 1 | `create_dir_all(work_dir(deployment_id))` | Fails → `"workdir failed: <e>"` |
| 2 | Decide the entrypoint name | `request.entrypoint`, or `index.ts` |
| 3 | Build the file list | `request.files` if present; otherwise a single entry pointing at `object_key` |
| 4 | Download every file in order | `download_file` per reference. Prints `pulled <key> (<n> bytes) -> <path>` |
| 5 | Find the TypeScript file on disk | Use the entrypoint name if it is there; otherwise scan the folder for the first `.ts` |
| 6 | `bundle_ts_to_js` | Prints `ts->js: <via>` |
| 7 | `compile_js_to_wasm` | Prints `js->wasm: <via>` |
| 8 | `upload_artifact` | Prints `wasm uploaded via server: <receipt>` |
| 9 | Return a summary string | The agent acks this as the `message` |

**Step 3 is the compatibility bridge.** When `files` is missing, the agent
treats `object_key` as if it were the entrypoint. An older server that only
knows three fields still produces a working build.

**Step 5 is the same pattern as `resolveEntrypoint` on the server, in reverse.**
The server picks the entrypoint when it can; the agent re-checks on disk
because a file could have failed to download. The fallback scans the folder
for the first `.ts`. If there is none, it returns
`"no .ts entrypoint found after download"`.

Step 8 goes through the server rather than straight to storage — the same
reason downloads do. The agent has no storage key.

### 3.7 Running a function

#### `InvokeOutcome`

The internal result shape, matching the API's `AgentInvokeResult`:

| Field | Meaning |
|-------|---------|
| `ok` | Did the function succeed |
| `code` | The exit code, if there was one |
| `stdout_b64` | Output as base64 |
| `stderr` | The error output |
| `error` | A description, for the user |
| `timed_out` | Did the agent's own limit fire |

#### `run_invocation(client, config, request)`

Runs one call locally. Returns an `InvokeOutcome` — it never returns an error,
because an error is part of the outcome the server expects.

| # | Step | On failure |
|---|------|------------|
| 1 | **Check the machine matches.** `request.machine_id != config.machine_id` | `"belongs to machine <id>"` |
| 2 | Look for `work_dir(<id>)/worker.wasm` on disk | — |
| 3 | If missing, and `artifact_key` is present, download it. Prints `artifact not cached, pulling <key>` | `"artifact download failed: <e>"` |
| 4 | If missing and no `artifact_key` | `"no wasm artifact for this deployment"` |
| 5 | Read the file | `"read wasm failed: <e>"` |
| 6 | Decode `body_b64` into stdin | `"bad request body: <e>"` |
| 7 | Build three environment variables | — |
| 8 | Run through `executor::execute` on a blocking thread | Mapped into the outcome below |

**Step 1 is a safety check.** If a stream is somehow addressed to the wrong
machine, the agent refuses rather than running someone else's function.

**Step 3 is the restart recovery path.** The deploy pipeline leaves
`worker.wasm` in the work folder. If the agent restarted, the cache may be
gone. Rather than failing, the agent re-downloads the artifact through the
same proxy the sources came from. This is why `artifact_key` is in the invoke
payload at all.

**Step 6** — `None` becomes an empty `Vec`, so a GET with no body works.

**Step 7** — the three variables a function can read:

```rust
("HC_METHOD", request.method)
("HC_PATH",   request.path)
("HC_QUERY",  request.query)
```

This is the whole request context a function receives, alongside stdin. Three
variables and some bytes — a deliberately small surface.

**Step 8** uses `tokio::task::spawn_blocking`, because `executor::execute` is
a blocking, CPU-heavy call. Running it directly on the async runtime would
block the thread that also has to read the SSE stream, so a slow function
would stall every other event. `spawn_blocking` moves it to a thread pool
worker, which is what it is designed for.

The four outcomes:

| What came back | `InvokeOutcome` |
|----------------|-----------------|
| `Ok(Ok(output))` | `ok: output.code == 0`, `stdout_b64` set, `stderr` set, `error: None` if the code is 0 |
| `Ok(Ok(output))` with a non-zero code | `ok: false`, `error: "function exited with code N"` |
| `Ok(Err(ExecError::TimedOut))` | `ok: false`, `error: "function timed out"`, `timed_out: true` |
| `Ok(Err(other))` | `ok: false`, `error: the ExecError's message` |
| `Err(join error)` | `ok: false`, `error: "executor task failed: <e>"` |

`stdout_b64` uses `B64.encode(&output.stdout)`, which is binary-safe — a
function printing raw bytes comes back intact. The last row means the blocking
thread itself panicked or was cancelled, which the agent reports as a failure
rather than losing the call.

#### `handle_invoke(client, config, request)`

Wraps `run_invocation` and reports the result.

| Step | Behaviour |
|------|-----------|
| 1 | `println!("invoke <id>: <METHOD> <path> (deployment <id>)")` |
| 2 | `run_invocation(...)` |
| 3 | Build the URL `POST /invocations/<invocationId>/result` |
| 4 | POST `{ machineId, ok, code, stdoutB64, stderr, error, timedOut }` |
| 5 | Success → `println!("invoke <id> reported: ok=<ok>")` |
| 6 | Rejected → `eprintln!` with the status |
| 7 | Transport failure → `eprintln!` |

**Why stdout is base64 again here.** The result travels as JSON over HTTP, and
JSON cannot carry arbitrary bytes. Encoding it means a function's binary output
survives. The server decodes it with `decodeStdout`, and the HTTP limit is 10 MB
to accommodate the roughly 33% expansion.

**Failures are never fatal.** A rejected or undeliverable result leaves the
caller waiting until the server's own timer fires. The agent logs it and moves
on rather than retrying — a retry would be a second copy of the same work.

#### `handle_routing(request, expected_machine)`

```rust
if request.machine_id != expected_machine { return Err(...) }
Ok(())
```

One comparison. A deployment addressed to a different machine is acknowledged
as `"ignored"` rather than run, so the misrouted job is visible in the server
log instead of silently vanishing.

### 3.8 The connection loop

#### `start_worker(config)`

The longest-running function in the agent. Runs for as long as the app is
open, and never returns.

**Setup**

```rust
let client = reqwest::Client::new();
let mut backoff = Duration::from_secs(1);
```

**The outer loop — connecting**

| Step | Behaviour | On failure |
|------|-----------|------------|
| 1 | `GET <stream_url>` with `Accept: text/event-stream` | `Err` → log, sleep `backoff`, double it (max 30s), continue |
| 2 | Check the status is a success | Not success → same retry |
| 3 | `println!("Connected to scheduler. Waiting for deployment requests...")` | — |
| 4 | **Reset `backoff` to 1 second** | — |
| 5 | Wrap `response.bytes_stream()` in a `StreamReader`, then a `BufReader` reading lines | — |
| 6 | Enter the inner loop | — |

Step 4 is why a healthy connection recovers quickly. A connection that drops
once waits 1 second; a server that is genuinely down backs off to 30 seconds
and stays there.

**The inner loop — reading**

| Line | Action |
|------|--------|
| `Err` on the read | Log, break out of the inner loop |
| `None` (stream ended) | `eprintln!("SSE stream closed by scheduler. Reconnecting...")`, break |
| Empty line | **Dispatch.** Handle the accumulated event, then clear both buffers |
| Starts with `:` | Ignore. Comments and heartbeats |
| Starts with `event:` | Remember the name |
| Starts with `data:` | Append to the data buffer, joining multiple lines with `\n` |

**The dispatch, on an empty line**

| Event | Action |
|-------|--------|
| `deployment` with non-empty data | `serde_json::from_str` into a `DeploymentRequest` |
| `invoke` with non-empty data | `serde_json::from_str` into an `InvokeRequest` |
| anything else | Ignored, buffers cleared |

A deployment is handled **inline**, in order:

1. `handle_routing` — wrong machine? Ack `"ignored"` with the reason.
2. Otherwise print a banner: deployment ID, worker name, entrypoint, object
   key.
3. `run_deployment(...)` — the whole build.
4. On success: print the summary, ack `"done"` with it.
5. On failure: `eprintln!`, ack `"failed"` with the error.

An `invoke` is handled **in a new task**:

```rust
tokio::spawn(async move { handle_invoke(task_client, task_config, request).await });
```

This asymmetry is the important design point, and the comment above it says why.
Deployments run in sequence because two builds writing into the same tools
directory would fight each other. Invocations run concurrently because a slow
function must never block the next event from being read — otherwise one
function taking nine seconds would delay a deployment behind it.

**After the inner loop**

```rust
tokio::time::sleep(backoff).await;
backoff = (backoff * 2).min(Duration::from_secs(30));
```

Then the outer loop reconnects. The delay grows on every failure and resets to
1 second on every success. The 30-second ceiling keeps a permanently
unreachable server from producing a busy loop.

**This function is what makes the agent resilient.** A server restart, a
network drop, a laptop lid, a NAT timeout — all produce a reconnect, not a
reinstall and not a re-registration. The saved registration on disk means the
agent comes back on its own.

---

## 4. `executor.rs` — running the code

One function, and it is the only place user code actually runs.

### The constants

#### `MAX_STDOUT_BYTES = 4_000_000`

The hard cap on captured output. A function that prints forever fills memory
up to this point and is then truncated.

4 MB is chosen to match the transport budget: base64 expands by about a third,
so 4 MB becomes roughly 5.4 MB of JSON, which fits inside the 10 MB limit on
`/invocations/:id/result`. If the agent captured more, the server would reject
the result and the caller would see a timeout instead of a real answer.

#### `FUEL = 2_000_000_000`

A fuel budget. Wasmtime counts fuel as the runtime executes instructions, and
a program that exhausts its fuel is trapped.

This is the **backstop** behind the wall-clock timeout, and the comment says so.
The timeout handles a function that waits; fuel handles a function that spins
without ever reaching a safe interruption point. Two different failure modes
need two different guards.

#### `PLACEHOLDER_WASM`

```rust
const PLACEHOLDER_WASM: [u8; 8] = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
```

Eight bytes: the WebAssembly magic number `\0asm` plus the version 1.

Older agent builds uploaded exactly these eight bytes as `worker.wasm` when
Javy was unavailable at deploy time. The module **compiles fine** and then
fails with `missing _start`, because it has no exported function at all.

Comparing against this exact byte pattern turns an obscure runtime error into
an actionable one: *"the artifact is an empty placeholder wasm (the build
toolchain was unavailable when it was deployed); redeploy the function"*.

### The types

#### `ExecInput`

| Field | Meaning |
|-------|---------|
| `wasm` | The module bytes |
| `stdin` | What the function reads as standard input |
| `env` | Key-value pairs for the function's environment |
| `timeout_ms` | The wall-clock limit |

#### `ExecOutput`

| Field | Meaning |
|-------|---------|
| `code` | The exit code. 0 means success |
| `stdout` | Captured output, as raw bytes |
| `stderr` | Captured error output, as a string |

`stdout` is `Vec<u8>` and not `String` on purpose. A function can print
anything, and forcing it through UTF-8 would corrupt binary output or fail
outright. The base64 encoding happens later, in `run_invocation`.

#### `ExecError`

| Variant | Displayed as | Means |
|---------|--------------|-------|
| `TimedOut` | `function timed out` | The wall-clock limit fired |
| `FuelExhausted` | `function exhausted its fuel (possible infinite loop)` | The instruction budget ran out |
| `Failed(String)` | the message | Anything else: compile, link, instantiate, trap |

`Failed` carries a message because the causes are many and the messages are
the only thing that makes them distinguishable.

### `execute(input) -> Result<ExecOutput, ExecError>`

**This function blocks. The doc comment says to call it from
`spawn_blocking`,** and `run_invocation` does exactly that.

| # | Step | Failure |
|---|------|---------|
| 1 | Compare against `PLACEHOLDER_WASM` | Match → `Failed("artifact is an empty placeholder wasm…")` |
| 2 | `Config::new()`, `consume_fuel(true)`, `epoch_interruption(true)` | — |
| 3 | `Engine::new(&config)` | `Failed("engine: <e>")` |
| 4 | `Module::new(&engine, &input.wasm)` — **compile** the module | `Failed("compile: <e>")` |
| 5 | `Linker::new`, then `preview1::add_to_linker_sync` — **link** the WASI imports | `Failed("link wasi: <e>")` |
| 6 | Build the output pipes: 4 MB stdout, 64 KB stderr | — |
| 7 | `WasiCtxBuilder`: stdin from the input bytes, the two output pipes, then each `env` pair | — |
| 8 | `Store::new(&engine, wasi_ctx)` | — |
| 9 | `store.set_fuel(FUEL)` | `Failed("fuel: <e>")` |
| 10 | `store.set_epoch_deadline(1)` | — |
| 11 | Spawn the timeout thread | — |
| 12 | `linker.instantiate(&mut store, &module)` | `Failed("instantiate: <e>")` |
| 13 | `get_typed_func::<(), ()>(&mut store, "_start")` | `Failed("missing _start: <e>")` |
| 14 | `func.call(&mut store, ())` — **run it** | Handled in the final match |
| 15 | `drop(store)` then read both pipes | — |
| 16 | Classify the result | See below |

#### Step 2 — the two guards

`consume_fuel(true)` turns on instruction counting.
`epoch_interruption(true)` allows the runtime to be interrupted at a safe
checkpoint.

#### Step 11 — how the timeout works

```rust
let expired = Arc::new(AtomicBool::new(false));
let engine_clone = engine.clone();
std::thread::spawn(move || {
    std::thread::sleep(timeout);
    expired_clone.store(true, Ordering::SeqCst);
    engine_clone.increment_epoch();
});
```

A helper thread sleeps for the timeout, flips a shared flag, and **increments
the runtime's epoch**. The running module is suspended at its next
instruction checkpoint, which unwinds the call as an error.

This is more reliable than killing the thread, and it is why the flag is
needed: a trapped call looks like any other trap, so the flag is how the
timeout is told apart from a genuine error.

`Arc` and `Ordering::SeqCst` are used because two threads share the flag — the
helper writes it, `execute` reads it.

#### Step 15 — reading output after the trap

`drop(store)` comes **before** reading the pipes. Dropping the store tears down
the sandbox and flushes the output, so the captured bytes are complete even
when the function was trapped. Reading before the drop can miss the last
buffer.

#### Step 16 — classifying the result

| What `call` returned | Result |
|---------------------|--------|
| `Ok(())` | `Ok(ExecOutput { code: 0, stdout, stderr })` |
| `Err` that downcasts to `I32Exit(n)` | `Ok(ExecOutput { code: n, stdout, stderr })` — an explicit exit is a *result*, not a failure |
| `Err` and the `expired` flag is set | `Err(ExecError::TimedOut)` |
| `Err` and the message mentions fuel | `Err(ExecError::FuelExhausted)` |
| `Err` otherwise | `Err(ExecError::Failed(format!("trap: {message}")))` |

**The `I32Exit` branch is the one that matters most.** WASI lets a program call
`proc_exit(n)`. Wasmtime surfaces that as an error, but it is not a crash — it
is a program that chose to exit with a code. Treating it as success-with-a-code
is what lets a function return a non-zero status on purpose.

**The ordering of the checks** is deliberate: `I32Exit` first, then the
timeout flag, then the fuel message, then everything else. Each check would
otherwise be ambiguous — a timeout trap is also an error, and a fuel trap is
also a generic error.

**Detecting fuel exhaustion by message text** is not elegant, but it is
reliable, and the alternative — inspecting the structured trap type — was not
worth the complexity. The `FUEL` constant's comment notes fuel is a *backstop*,
so this path should be rare.

### The test

```rust
#[test] fn runs_hello_world_wasm()
```

An end-to-end test: compile a one-line JavaScript file with the fetched Javy,
run it through `execute`, and assert the output is `"Hello, World!\n"` with
exit code 0.

It **skips gracefully** when Javy has not been fetched — it prints a `SKIP`
note and returns. That is what lets `cargo test` pass on a machine without the
toolchain, while still being a real end-to-end check on one that has it.

The test also notes something useful: plain `console.log` is valid JavaScript
and Javy accepts it **without esbuild**. So this one test covers the executor
without needing the TypeScript step.

---

## 5. `lib.rs` — Tauri commands and persistence

The glue layer: what the window can ask for, where the registration is saved,
and how the app is assembled.

### The two stored types

#### `RegistrationResponse`

What the server sends back. Rust field names are snake_case; `camelCase`
renaming makes the wire format match TypeScript.

| Field | Meaning |
|-------|---------|
| `status` | `"success"` |
| `node_id` | The node's ID |
| `session_token` | A token, currently unused |
| `assigned_region` | `"local"` |
| `heartbeat_interval_secs` | `5` |

#### `SavedRegistration`

What the agent writes to disk so it can skip registration next time.

| Field | Meaning |
|-------|---------|
| `coordinator_url` | Which coordinator to reconnect to |
| `machine_id` | Which stream to open |
| `registration` | The full response, so the window can render it |

### Persistence

#### `registration_file_path()`

```rust
dirs::home_dir().unwrap_or(std::env::temp_dir)
    .join(".HyperCore").join("registration.json")
```

A hidden folder in the user's home directory. It sits next to the `machine_id`
file from `machine_info.rs`, so all the agent's local state is in one place
that is easy to find, back up, and delete.

The fallback to the temp directory means the agent still works if the home
directory cannot be determined.

#### `load_saved_registration() -> Option<SavedRegistration>`

Reads the file and parses it.

Both failures return `None`:
- `fs::read_to_string` fails — no file yet, which is the normal first launch.
- `serde_json::from_str` fails — the file is corrupt, so it is treated as
  absent.

Returning `None` is not an error. The window responds by showing the scan and
register steps, exactly as a first launch would.

#### `save_registration_to_disk(value)`

The mirror image. `create_dir_all` on the parent, then
`serde_json::to_string_pretty` and `fs::write`.

Pretty-printed so a user who opens the file can read it. Every result is
discarded with `let _` — if the disk is full or read-only, the agent should
still work for this session. It just registers again next time.

### The SSE worker slot

#### `static SSE_WORKER: OnceLock<Mutex<Option<JoinHandle<()>>>>`

A single global slot holding the handle of the running connection task.

`OnceLock` means the slot is created on first use and never moves, which is
what makes it safe to share across the app. `Mutex` makes access safe from
Tauri's several threads. `Option` because there may be no task running.

#### `set_sse_worker(handle)`

Stores a new handle, and **aborts the previous one if there was one**:

```rust
if let Some(previous) = guard.take() { previous.abort(); }
*guard = Some(handle);
```

This is the answer to "how do we replace the connection?" — you cannot
register twice, because `abort` cancels the task before the new one starts.
Without it, re-registering to a different coordinator would leave the old
connection alive, and the machine would appear online twice.

The comment above the static says exactly this: *"Tracks the active SSE worker
so re-registering swaps the stream instead of leaking duplicate scheduler
connections."*

#### `clear_sse_worker()`

Aborts whatever is in the slot and leaves it empty. Called by
`unregister_node`. The same `take`-then-`abort` pattern, with nothing to
replace it.

### Connecting

#### `bundled_tools_dir(app)`

Finds where the installer put the build tools.

Tries `<resource_dir>/tools` and `<resource_dir>/resources/tools`, returning
the first that exists, and falling back to the first path regardless.

The two candidates exist because Tauri behaves differently across installers:
some preserve the `resources/` prefix from the bundle configuration and some
flatten it. Probing both is more reliable than assuming either. The doc
comment on the function spells this out.

If the resource directory cannot be determined at all, the function returns
`None` and `tools::resolve_tool` takes over — it searches the executable's
folder and `PATH`.

#### `connect_to_scheduler(app, coordinator_url, machine_id)`

Starts the live connection.

1. Build an `SseConfig` from the URL, the machine ID, and `bundled_tools_dir`.
2. `tauri::async_runtime::spawn(async move { sse::start_worker(config).await })`.
3. `set_sse_worker(handle)`.

Three lines, and they define the whole lifetime of a connection. `start_worker`
never returns, so the task runs until it is aborted — by a re-registration or
by an unregistration.

### The five Tauri commands

Every one of these must also be listed in `capabilities/default.json` to be
callable from the window.

#### `get_toolchain_status(app) -> ToolchainStatus`

```rust
tools::toolchain_status(bundled_tools_dir(&app).as_deref())
```

Answers "can this machine build anything?" by finding esbuild and Javy. The
Insights page shows the result, and Settings points at the reinstall command
when either is missing.

#### `get_machine_info() -> Result<MachineInfo, String>`

```rust
Ok(MachineInfo::collect())
```

Reads this computer's specs. Called by the window's "Scan Machine Specs" button
and again on startup.

It never actually fails — `MachineInfo::collect` has a fallback for every
field — but the `Result` is in the signature because Tauri commands return one
and the future may not be so forgiving.

#### `get_saved_registration(app) -> Option<SavedRegistration>`

1. `load_saved_registration()`.
2. `None` → return `None` and change nothing.
3. Otherwise **reconnect immediately** using the saved URL and machine ID.
4. Return the saved value.

**Step 3 is what makes a restart invisible.** The window calls this once on
mount. If a registration is found, the connection is re-established before the
user has looked at the screen, so the agent is back online without anyone
retyping a URL or clicking a button.

#### `unregister_node() -> Result<(), String>`

1. `clear_sse_worker()` — abort the connection, so the server sees the
   disconnect immediately instead of waiting for a heartbeat to fail.
2. If the registration file exists, delete it.
3. `Err` from the delete → `Err(format!("Could not clear registration: {error}"))`.

Called by the sidebar's "Disconnect". After it succeeds the window clears its
state and shows the scan/register screens again.

#### `register_node(app, coordinator_url) -> Result<RegistrationResponse, String>`

The big one. Seven steps.

| # | Step | Detail |
|---|------|--------|
| 1 | Trim the URL and its trailing slash | — |
| 2 | Reject an empty URL | `Err("A coordinator URL is required.")` |
| 3 | Validate it parses as a URL | `Err("That coordinator URL does not look valid.")` |
| 4 | `MachineInfo::collect()` | — |
| 5 | `POST <coordinator>/api/v1/nodes/register` with `{ "machine": machine }` | See below |
| 6 | `connect_to_scheduler(...)` | — |
| 7 | `save_registration_to_disk(...)`, `app.emit("node_registered", …)`, return | — |

**Step 3 uses `reqwest::Url::parse`.** A person typing a URL is the most
common source of bad input, and failing here with a clear message is much
better than a confusing connection error later.

**Step 5's fallback is the interesting part.** If the request fails for *any*
reason — the coordinator is down, the route does not exist yet, the network is
down — the agent does not fail. It builds a local stub:

```rust
RegistrationResponse {
    status: "success",
    node_id: format!("node_{}", &machine.machine_id[..8.min(machine.machine_id.len())]),
    session_token: "sess_local_stub",
    assigned_region: "local",
    heartbeat_interval_secs: 5,
}
```

The doc comment explains the intent: *"Best-effort coordinator registration;
fall back to a local stub so the UI still works against a coordinator that has
no registry yet."* Someone testing the agent against a half-built server can
still see the full UI rather than a wall of errors. Note the safe slicing on
the machine ID — `8.min(len)` because a slice beyond the length panics.

A non-success HTTP status also takes the fallback branch, because the match
guard is `Ok(response) if response.status().is_success()`.

**Step 6 runs whether or not registration succeeded.** Even with the stub, the
agent opens its stream. A coordinator with a working `/agents/events` but no
registry still routes work.

**Step 7 persists, then announces.** The order matters: if the process dies
between connecting and saving, the agent would reconnect on every launch and
never remember. The `node_registered` event lets the window react even if it
was not the caller.

### `run()`

The application entry point, called from `main.rs`.

**Plugins**

| Plugin | Why |
|--------|-----|
| `tauri_plugin_opener` | Open links and folders |
| `tauri_plugin_process` | Relaunch after an update |
| `tauri_plugin_updater` | Check for and install a newer agent |

**The tray icon**

A `TrayIconBuilder` with a three-item menu:

| Item | Action |
|------|--------|
| Show HyperCore Worker | `window.show()` then `set_focus()` |
| Hide window | `window.hide()` |
| Quit HyperCore Worker | `app.exit(0)` |

`show_menu_on_left_click(false)` means a left click shows the window rather
than opening the menu. The `on_tray_icon_event` handler restores the window on
a left click release, which is the expected behaviour on Windows.

**The metrics task**

```rust
tauri::async_runtime::spawn(async move {
    let mut interval = tokio::time::interval(Duration::from_secs(2));
    loop {
        interval.tick().await;
        let _ = handle.emit("metrics_tick", collect_metrics());
    }
});
```

A `tokio` interval fires immediately on the first tick and then every two
seconds. `handle` is a cloned `AppHandle`, moved into the task so it outlives
`setup`. Every two seconds it collects usage and emits it to the window, which
is what makes the Insights page live.

**Window close behaviour**

```rust
if let tauri::WindowEvent::CloseRequested { api, .. } = event {
    api.prevent_close();
    let _ = window.hide();
}
```

Closing the window **hides it instead of quitting**. The agent keeps its
connection and keeps working. To actually quit, the user uses the tray menu.
The comment on `main.rs` — *"Prevents additional console window on Windows in
release"* — explains the separate `windows_subsystem` attribute: in a release
build, no console window appears behind the app.

**The command registration**

```rust
.invoke_handler(tauri::generate_handler![
    get_machine_info, register_node, get_saved_registration,
    unregister_node, get_toolchain_status
])
```

Exactly five commands. A function not in this list is invisible to the window.

---

## 6. `tools.rs` — finding the build tools

The agent must find esbuild and Javy without knowing where the installer put
them. This file is the search.

### `ToolchainStatus`

```rust
pub struct ToolchainStatus {
    pub esbuild: Option<String>,
    pub javy: Option<String>,
}
```

Each field is the absolute path found, or `None`. `Option` rather than an
empty string because "not found" and "found an empty path" are different
answers. The window shows the path when present and an install hint when not.

### `exe_name(base)`

```rust
if cfg!(windows) { format!("{base}.exe") } else { base.to_owned() }
```

Appends `.exe` on Windows. The search is done in Rust rather than by trying
both names, so the diagnostic messages are accurate.

### `candidate_dirs(explicit_tools_dir) -> Vec<PathBuf>`

Builds the list of folders to search, in priority order. This is the messiest
function in the file, and the comment above it explains exactly why each entry
exists.

| # | Candidate | Why |
|---|-----------|-----|
| 1 | The explicit `tools_dir` | The normal installed case |
| 2 | Its parent | Some installers flatten away the `tools/` level |
| 3 | `<exe_dir>/tools` | The binary sits next to its tools |
| 4 | `<exe_dir>/resources/tools` | Installs that keep the `resources/` prefix from the bundle configuration |
| 5 | `<exe_dir>` itself | Flat installs with the binaries alongside |
| 6 | `<exe_dir>/../Resources/tools` | The macOS app bundle layout |
| 7 | `<exe_dir>/../Resources` | The macOS layout without the `tools/` level |
| 8 | The first of 8 ancestors containing `src-tauri/resources/tools` | The **development checkout** |

Entries 3 through 7 are only added when `std::env::current_exe()` succeeds.
Entry 8 walks up to eight levels looking for the development folder.

**Entry 8 is what makes development work at all**, and it comes with a real
trap. In a development checkout the executable lives deep inside
`target/debug/`, and the *installed* layout is `<install>/resources/tools` —
which is the same relative shape. So during development, entry 4 can match a
stale copy in the build output and mask the real one. The test
`candidate_dirs_cover_install_layouts` exists specifically to make sure every
layout is actually probed rather than accidentally satisfied.

`Vec<PathBuf>` rather than a `HashSet` because **order matters**: the first
match wins, and duplicates are harmless to check twice.

### `find_on_path(name)`

Walks the `PATH` environment variable, splitting it the way the operating
system does, and returns the first directory containing a real file with that
name.

`is_file()` rather than `exists()` so a directory with a matching name is not
mistaken for a binary. An empty segment in `PATH` means "the current
directory" on some systems, and it is skipped.

### `searched_locations(explicit_tools_dir, base)`

The same candidate list, each joined with the binary name. Returns every path
that **would** be checked.

It exists purely for error messages. When Javy cannot be run,
`compile_js_to_wasm` calls this and shows the user the complete list of places
that were searched. "javy not found" is unhelpful; "searched
`C:\...\resources\tools\javy.exe`, `C:\...\tools\javy.exe`, … and PATH" tells
the user exactly what to fix.

### `resolve_tool(explicit_tools_dir, base) -> Option<PathBuf>`

The main search.

1. `exe_name(base)` — add `.exe` on Windows.
2. For each candidate directory, check whether `dir/javy.exe` (or `javy`) is
   a file. First hit wins.
3. If nothing matched, `find_on_path(name)`.

Bundled copies always beat `PATH`. That is the point: a shipped, known-good
version beats whatever happens to be installed, and a user's broken global
esbuild cannot break deploys.

### `toolchain_status(explicit_tools_dir) -> ToolchainStatus`

```rust
ToolchainStatus {
    esbuild: resolve_tool(dir, "esbuild").map(...),
    javy: resolve_tool(dir, "javy").map(...),
}
```

Runs the search for both tools and reports the paths. The window calls this on
mount to show whether this machine can deploy at all.

Both fields can be `None` on a machine where the tools were never fetched, and
the Settings page responds with the exact command to fix it.

### The test

`candidate_dirs_cover_install_layouts` asserts that the candidate list really
contains the explicit directory, its parent, `<exe_dir>/tools` and
`<exe_dir>/resources/tools`, and that `searched_locations` produces the full
file paths. It is a regression test for the flat-versus-prefixed installer
layouts, with a comment noting that a development checkout masks the problem
via entry 8.

---

## 7. `machine_info.rs` — reading this computer

Already covered in [section 2](#2-machine_infors--reading-this-computer).

---

## 8. The React window

Fifteen files. `App.tsx` owns all the state, the hooks fetch data, and the
pages render it.

### 8.1 `main.tsx`

Mounts `<App />` into the document. Nothing else.

### 8.2 `App.tsx`

The root component and the only stateful parent. Nine pieces of state:

| State | Type | Purpose |
|-------|------|---------|
| `info` | `MachineInfo \| null` | This computer's specs. `null` means "not scanned yet" |
| `registration` | `RegistrationResponse \| null` | Set once registered |
| `restoredMachineId` | `string` | The machine ID from a restored registration, before `info` loads |
| `restoring` | `boolean` | True while checking for a saved registration. Gates the first paint |
| `metrics` | `MetricsTick` | Live CPU and memory, pushed from Rust |
| `loading` / `error` | | The scan/register in-flight state |
| `toolchain` | `ToolchainStatus \| null` | Whether esbuild and Javy were found |
| `coordinatorUrl` | `string` | Which coordinator this node is joined to |
| `page` | `AgentPage` | Which screen is showing |
| `live` | `boolean` | Whether the activity feed is polling |

Derived values:

| Value | How |
|-------|-----|
| `machineId` | `info?.machineId ?? restoredMachineId` — either source works |
| `registered` | `Boolean(registration && machineId)` |
| `runningCount` | Invocations with `status === "running"` |
| `deploymentCount` | The number of deployments in the feed |

#### The three-step first run

```text
1. Scan Machine Specs   →  get_machine_info     →  shows MachineDetailsCard
2. Register Node        →  register_node(url)   →  shows the full app
3. (later)              →  get_saved_registration skips both
```

`if (restoring) return <spinner>` is the very first check, so nothing flashes
before the saved-registration lookup finishes. `if (!registered || !registration)`
renders steps 1 and 2. Otherwise the full sidebar layout appears.

**The three `useEffect` hooks on mount:**

1. `get_toolchain_status` — one call, cached into `toolchain`.
2. `get_saved_registration` — if one exists, set `registration`,
   `coordinatorUrl` and `restoredMachineId`, then try `get_machine_info`.
   Every step is inside `try`/`catch`, because a failed restore simply means
   "show the scan screen". A `cancelled` flag prevents setting state after
   unmount.
3. `listen<MetricsTick>("metrics_tick", …)` — subscribes to the two-second
   push. The returned unsubscribe function is captured and called on cleanup,
   so the listener does not outlive the component.

#### Page persistence

```ts
useEffect(() => { localStorage.setItem("hypercore-agent-page", page); }, [page]);
```

and on mount, `localStorage.getItem("hypercore-agent-page")` is read back
**through an explicit allowlist** — only the five known page names are
accepted. Anything else falls through to `"machine"`. Writing arbitrary text
into a state variable that drives rendering is not worth the risk, and the
`try`/`catch` around it covers storage being unavailable.

#### `scan()` and `register()`

`scan` calls `get_machine_info` and sets either `info` or `error`.

`register(url)` calls `register_node`, then mirrors the result into
`coordinatorUrl` and `restoredMachineId`. It **re-throws** after setting the
error, so `RegistrationForm` can also react, and it keeps the scanned machine
ID in sync because the Rust side persists the registration independently.

`unregister()` calls `unregister_node`, clears `registration`,
`coordinatorUrl` and `restoredMachineId`, and navigates to `"logs"`.

#### The live badge

```tsx
<Badge variant={activity.data?.online ? "success" : "secondary"}>
  {activity.data?.online ? "Connected" : activity.error ? "Unreachable" : "Idle"}
</Badge>
```

Three distinct states, which matters when something is wrong: **Connected**
(the server says so), **Unreachable** (the window cannot reach the server at
all), and **Idle** (reachable, but the node is not registered). Conflating the
last two would make a network problem look like a registration problem.

The update button appears whenever `update.phase === "available"`, and
clicking it navigates to Settings rather than installing directly.

### 8.3 `hooks/use-activity.ts`

#### `useActivity(coordinatorUrl, machineId, opts?)`

Polls the API for this node's history.

| Option | Default | Meaning |
|--------|---------|---------|
| `intervalMs` | `3000` | How often to poll |
| `enabled` | `true` | Whether to poll at all |

Returns `{ data, updatedAt, error, refreshing, refresh }`.

**`load`** is wrapped in `useCallback` with `[coordinatorUrl, machineId]` as
dependencies — the two values that change the URL. It builds
`<coordinatorUrl without trailing slashes>/activity?machineId=<encoded>&limit=50`,
and on a non-OK response throws with the status in the message. The error state
includes the coordinator address, because "could not reach coordinator" is far
more useful as "could not reach http://…".

**The polling effect** loads immediately and then on an interval, clearing the
timer on cleanup. It depends on `load`, `enabled` and `intervalMs`.

`App.tsx` passes `enabled: registered && live`, so polling stops when the node
is unregistered and whenever the user turns live mode off. Polling an endpoint
the node is not registered against would return empty data forever.

**`refresh`** sets `refreshing`, awaits `load`, and clears the flag in a
`finally`. The flag drives a spinner on the refresh button.

Three seconds is chosen to feel live without being noisy: the feed changes
when the agent does work, and the agent's own results take at least a
round trip to post.

### 8.4 `hooks/use-updater.ts`

#### `UpdatePhase`

Eight states: `idle`, `checking`, `available`, `downloading`, `installing`,
`installed`, `up-to-date`, `error`. Modelling this as a union rather than
several booleans means impossible combinations cannot be represented — you
cannot be `downloading` and `error` at the same time.

#### `UpdaterState`

`phase`, `version`, `notes`, `progress` (0 to 1, or `null` when the server
sends no content length), `downloadedBytes`, `totalBytes`, `error`.

`progress` being nullable matters: without a `Content-Length` there is no
honest percentage, and showing a fake one is worse than showing nothing.

#### `useUpdater(opts?)`

| Function | What it does |
|----------|--------------|
| `check` / `runCheck` | Asks the updater plugin whether a newer version exists |
| `install` | Downloads and installs it, reporting progress |

**`runCheck` has a re-entry guard.** A `checking` ref makes a second
concurrent check return immediately. It also **closes the previous `Update`
handle first**, because the plugin holds a file handle alive and a check
behind a closed window is a leak. The comment above that ref says so.

`Update` objects are held in a **ref**, not state. The reason is in the
comment: the object is not serialisable and must not trigger re-renders, so it
lives outside React until the user actually installs.

| `check()` returned | State |
|--------------------|-------|
| An update | `available`, with version and release notes |
| `null` | `up-to-date` |
| Threw | `error`, with the message |

**Failures are never fatal.** The comment explains that dev builds and offline
machines land in the error branch, and the agent has to keep working against
its coordinator regardless. A settings screen that blocks the app would be
worse than a missing update button.

There is a cleanup effect that closes the pending handle when the window goes
away, so a closed webview does not leave a check running.

**`install`** reports progress through the plugin's event callback:

| Event | Effect |
|-------|--------|
| `Started` | Record `totalBytes` from the content length, `progress: 0` |
| `Progress` | Add `chunkLength` to the running total, recompute `progress` |
| `Finished` | `installing`, `progress: 1` |

Then `installed`. A failure sets `error` while keeping the version, so the
user can retry without checking again.

**The background check** is skipped in two cases, both deliberate:

- `import.meta.env.DEV` — `tauri dev` runs an unbundled binary the updater
  refuses to touch, so the poll would be pure noise. The manual button still
  works and surfaces the plugin's error, which is useful for testing.
- A 4-second `setTimeout` — so the check never competes with the registration
  restore and machine scan happening on first paint.

The file's header comment notes that Windows installers kill the running
process during install, so the `installed` state is the last thing the UI ever
renders there, and the relaunch below only matters on macOS and Linux.

### 8.5 `hooks/use-media-query.ts`

#### `useMediaQuery(query)`

A standard responsive-layout hook. Initial state is read from
`matchMedia(query).matches`, then an effect re-subscribes whenever the query
changes, and the listener is removed on cleanup.

`LogsPage` uses it with `"(min-width: 1280px)"` to decide between a wide table
and a stacked layout.

### 8.6 `lib/activity.ts`

Six display helpers. No data fetching, no state — pure formatting, which makes
them trivially testable.

#### `timeAgo(iso)`

Converts a timestamp into `"just now"`, `"42s ago"`, `"7m ago"`, `"3h ago"` or
`"2d ago"`.

```ts
const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
```

`Math.max(0, …)` protects against a clock skew that would make a future
timestamp produce `"-3s ago"`. The thresholds are deliberately coarse: at a
three-second polling interval, "42s ago" is about as precise as anyone needs.

#### `formatDuration(ms)`

`undefined` or `null` → `"—"` (an em dash, meaning "no value"). Under 1000 ms
→ `"847ms"`. Otherwise → `"2.4s"` with one decimal.

The dash rather than `"0ms"` matters: a null duration means the call never
finished, which is different from finishing instantly.

#### `shortId(id)`

```ts
id.length > 13 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id
```

`8chars…4chars`. UUIDs are 36 characters, which is far too wide for a sidebar
row. The length check means a short ID is shown in full rather than mangled.

#### `formatLogTime(iso)`

`"SEP 30 14:23:05.12"` — month in capitals, zero-padded day, hours, minutes,
seconds, and hundredths.

| Part | Why |
|------|-----|
| `MONTHS` array of uppercase names | Compact, and no locale surprises |
| `pad(n, 2)` | Zero-padded so columns line up |
| `Math.floor(ms / 10)` | Two decimal places, not three — enough to order events that land in the same millisecond |
| `Number.isNaN` guard | Returns the input unchanged if the date will not parse |

The NaN guard matters because a malformed timestamp from an older server would
otherwise render `"NaN NaN NaN:NaN:NaN.NaN"`.

#### `invocationVariant(status)`

Maps an invocation status to a badge colour.

| Status | Colour | Reading |
|--------|--------|---------|
| `running` | `info` | In progress |
| `done` | `success` | Fine |
| `failed` | `danger` | Broke |
| `timeout` | `danger` | Ran too long |

#### `deploymentVariant(status)`

Maps a deployment status to a badge colour.

| Status | Colour | Reading |
|--------|--------|---------|
| `routed` | `success` | Sent to the node |
| `built` | `success` | Working |
| `building` | `info` | Compiling |
| `failed` | `danger` | Broke |
| `uploaded` | `warning` | Stored, not yet sent |
| `offline` | `warning` | The node was not connected |

The `default` branches cover `uploaded` and `offline` explicitly even though
they are also listed, so a future status added to the type gets a sensible
colour instead of falling through to nothing.

`uploaded` and `offline` are warnings rather than successes on purpose — the
deployment is stuck, and nothing is going to happen until someone acts.

### 8.7 `types/index.ts`

The shapes the window uses. Each one has a twin on the server or in Rust.

| Type | Matches |
|------|---------|
| `MachineInfo` | Rust `MachineInfo`; validated by `machinePayloadSchema` |
| `RegistrationResponse` | `RegistrationResult`; Rust `RegistrationResponse` |
| `SavedRegistration` | Rust `SavedRegistration` |
| `MetricsTick` | Rust `MetricsTick` |
| `ToolchainStatus` | Rust `ToolchainStatus` |
| `InvocationStatus` | The `status` column of `invocations` |
| `DeploymentStatus` | The `status` column of `deployments` |
| `ActivityInvocation` | `InvocationDto` |
| `ActivityDeployment` | `DeploymentDto` |
| `ActivityResponse` | `ActivityResult` |

`ActivityResponse.source` is `"postgres" | "memory"`, but the server only ever
returns `"postgres"` now. `"memory"` is kept for compatibility with an older
server.

The two status unions are the contract that has to be updated whenever a status
is added. Miss one and TypeScript will not catch it, because the value comes
over the network as a plain string.

### 8.8 `components/`

#### `AppSidebar` — `components/app-sidebar.tsx`

Exports `AgentPage` (the five screen names), `AGENT_PAGE_TITLES` (the display
names), and `AppSidebar`.

The navigation is driven by one `NAV` array of `{ id, icon }` pairs, so adding
a screen means adding one entry and one title. The `badgeFor` helper shows a
count on **Logs** (running calls) and **Deployments** (total), and nothing on
the other three.

The footer shows a `Hashvatar` generated from the machine ID, the hostname, the
shortened ID, and a menu with **Copy machine ID** and **Disconnect**.
`copyId` uses the clipboard and flips a `copied` flag for 1500 ms; a clipboard
failure is swallowed, because a copy button that throws is worse than one that
quietly does nothing.

#### `Titlebar` — `components/titlebar.tsx`

A custom window titlebar, because the window is configured with
`"decorations": false` — no native frame.

`inTauri()` checks for `__TAURI_INTERNALS__` on `window`, so the component
renders sensibly in a plain browser during development. The window buttons
only render when that returns true.

| Function | What it does |
|----------|--------------|
| `minimize` | `getCurrentWindow().minimize()` |
| `close` | `getCurrentWindow().close()` — and `close` is *hidden*, not quit, because of the `CloseRequested` handler in `lib.rs` |
| `toggleMaximize` | Toggles, then re-reads `isMaximized()` to keep the button label right |

`data-tauri-drag-region` on the header makes the empty space draggable, and
`onDoubleClick` toggles maximize — both standard desktop behaviour the native
frame would otherwise provide.

Every call has a `catch` and an `if (!tauri) return` guard, so the component
never throws in a browser.

#### `MachineDetailsCard` — `components/MachineDetailsCard.tsx`

Renders one `MachineInfo` as a grid of labelled rows: OS, kernel,
architecture, CPU brand and core counts, memory, disk, and local IP. Purely
presentational. Used in three places: the scan step, the Machine page, and
again after registration.

#### `RegistrationForm` — `components/RegistrationForm.tsx`

The "Register this node" card. One text field for the coordinator URL, one
submit button, both disabled while the request is in flight.

The button label changes to `"Negotiating handshake…"` while submitting, and
the default value is the production coordinator address. The card description
is explicit about the design: *"No API keys or broker credentials needed — the
agent opens an outbound event stream to the coordinator."*

### 8.9 `pages/`

Five pages, all presentational. `App.tsx` holds the state and passes it down.

#### `MachinePage` — `pages/machine-page.tsx`

Props: `info`, `registration`, `coordinatorUrl`.

Shows the machine ID in monospace with a copy button that flips to a check mark
for 1500 ms, the node ID, the assigned region, the coordinator URL, and then
`MachineDetailsCard`. The machine ID needs to be copyable because it is what
someone selects in the dashboard's target-node picker.

#### `LogsPage` — `pages/logs-page.tsx`

Props: `invocations`, `deployments`, `coordinatorUrl`, `hostname`, `machineId`,
`region`, `nodeId`, `updatedAt`, `error`, `refreshing`, `onRefresh`, `live`,
`onLiveChange`, `online`.

The most feature-rich page. It owns four filters — a text query, a method
filter, a status filter, and a failed-only toggle — and a `useMemo` that applies
them to the invocation list. It shows the last-updated time, a live toggle, a
manual refresh, and the connectivity badge.

A local `hostOf(coordinatorUrl)` extracts just the hostname via `new URL`,
falling back to the raw string if it will not parse, and shows it in the table.

`useMediaQuery("(min-width: 1280px)")` picks a wide table or a stacked layout.

#### `LogDetailPanel` / `LogDetailSheet` — `pages/log-detail-panel.tsx`

Exports the `LogDetailProps` type and two components.

`LogDetailContent` is the shared body. It shows the full invocation, prints
the captured output, and has a **Copy summary** button that assembles a plain
text report: method and status, time, request ID, host, worker, duration, exit
code when there is one, and the deployment ID when it is known. The optional
lines are filtered out before joining, so there are no empty lines.

`LogDetailPanel` and `LogDetailSheet` are the same content in a side panel and
in a bottom sheet, so the wide and narrow layouts can both show it.

#### `DeploymentsPage` — `pages/deployments-page.tsx`

Props: `deployments`, `updatedAt`, `error`, `refreshing`, `onRefresh`.

A read-only table of this node's deployments: worker name, entrypoint, status
badge, artifact key when present, and creation time. Plus the same refresh
affordances as Logs.

#### `InsightsPage` — `pages/insights-page.tsx`

Props: `metrics`, `info`, `toolchain`, `online`.

The health page. Shows live CPU and memory from the two-second push, the
machine's static specs, and **the toolchain status** — the resolved esbuild
and Javy paths, or a clear "not found" with a hint to reinstall. This is the
page that answers "why will my deploy fail?".

#### `SettingsPage` — `pages/settings-page.tsx`

Props: `registration`, `coordinatorUrl`, `machineId`, `update`, `onCheckUpdate`,
`onInstallUpdate`, `onUnregister`.

Shows the version via `getVersion()`, the coordinator URL with a copy button,
the machine ID, and the **Agent updates** card: release notes, download
progress, a check button, and an install button. Also offers **Disconnect**.

Two local helpers:

| Helper | What it does |
|--------|--------------|
| `Row` | A label-and-value line, optionally in monospace |
| `formatBytes(bytes)` | `"0 B"`, `"512 KB"`, `"4.2 MB"` |

`PHASE_LABEL` is a partial map turning `checking`, `downloading` and
`installing` into human text; the other phases are implied by the button state.
`Partial<Record<…>>` means a new phase does not force a new label.

---

## 9. Configuration files

### `tauri.conf.json`

| Setting | Value | Why |
|---------|-------|-----|
| `identifier` | `com.hypercore.agent` | The app's unique ID, used for install paths and the updater |
| `version` | `0.2.1` | Must match `package.json` and `Cargo.toml` |
| `devUrl` | `http://localhost:1420` | The Vite dev server |
| `frontendDist` | `../dist` | The built React output |
| `decorations` | `false` | No native frame — `Titlebar` draws one |
| `maximized` | `true` | Opens filling the screen |
| `security.csp` | `null` | **No Content Security Policy.** The window loads only local content, but this is a real hardening gap worth revisiting before shipping widely |
| `bundle.resources` | `["resources/tools"]` | Ships esbuild and Javy inside the installer |
| `createUpdaterArtifacts` | `true` | Produces the signed files the updater needs |
| `plugins.updater.pubkey` | A committed public key | Verifies downloaded updates |
| `plugins.updater.endpoints` | The GitHub latest-release URL | Where updates are fetched from |
| `installMode` | `passive` | Windows updates without a visible prompt |

### `capabilities/default.json`

Lists which Tauri calls the window may make. `updater:default` and
`process:allow-restart` are what make self-update possible. A call missing from
this file fails at runtime.

### `Cargo.toml`

The Rust dependencies, and what each is for:

| Crate | Purpose |
|-------|---------|
| `tauri` (+ `tray-icon`) | The desktop framework |
| `tauri-plugin-updater` | Self-update |
| `tauri-plugin-process` | Relaunch after installing |
| `tauri-plugin-opener` | Open links |
| `serde` / `serde_json` | The camelCase wire format |
| `sysinfo` | CPU, memory, disk, OS facts |
| `machine-uid` | The stable per-host ID, with a fallback |
| `local-ip-address` | The LAN address |
| `tokio` | The async runtime, timers, processes, filesystem |
| `reqwest` (+ `json`, `stream`, `multipart`) | All HTTP: the stream, the downloads, the uploads |
| `uuid` | Machine ID generation |
| `dirs` | Home, cache and temp directories |
| `futures-util` | `StreamExt::map_err` on the response stream |
| `tokio-util` | `StreamReader` for the line-by-line SSE parse |
| `wasmtime` (+ `wasmtime-wasi` `preview1`) | Running the function |
| `base64` | Binary-safe output and request bodies |

### The version sync

The version appears in three files — `package.json`, `tauri.conf.json` and
`Cargo.toml` — and the updater compares against it. `bun ./scripts/sync-agent-version.mjs
0.3.0` updates all three from one argument, which is why the release process
uses it. A version that disagrees across the three would break the updater.

---

## 10. Every agent function in one table

### Rust — `sse.rs`

| Function | Line | What it does |
|----------|------|--------------|
| `default_invoke_timeout` | 58 | The 8-second fallback for a missing `timeout_ms` |
| `stream_url` | 74 | Builds `/agents/events?machineId=…` |
| `base_url` | 82 | The coordinator address, trailing slashes trimmed |
| `acknowledge` | 86 | POSTs the build result to `/deployment/:id/ack` |
| `work_dir` | 113 | The per-deployment scratch folder in the cache directory |
| `download_file` | 123 | Fetches one file through the API |
| `bundle_ts_to_js` | 156 | TypeScript → JavaScript, with four attempts and a copy fallback |
| `compile_js_to_wasm` | 223 | JavaScript → WebAssembly. A failure is fatal |
| `upload_artifact` | 260 | Sends the WebAssembly file back through the API |
| `run_deployment` | 294 | The whole build pipeline |
| `handle_invoke` | 363 | Runs one call and reports the result |
| `run_invocation` | 396 | Locates, loads and runs the WebAssembly module |
| `handle_routing` | 490 | Rejects a deployment addressed to another machine |
| `start_worker` | 500 | The connection loop, forever |

### Rust — `executor.rs`

| Item | Line | What it does |
|------|------|--------------|
| `MAX_STDOUT_BYTES` | 16 | 4 MB output cap |
| `FUEL` | 18 | 2 billion instruction budget |
| `PLACEHOLDER_WASM` | 23 | The 8-byte header, detected for a better error |
| `ExecInput` | 25 | What one run needs |
| `ExecOutput` | 32 | What one run produces |
| `ExecError` | 39 | `TimedOut` / `FuelExhausted` / `Failed` |
| `execute` | 57 | Compiles, sandboxes, runs, classifies |

### Rust — `lib.rs`

| Function | Line | What it does |
|----------|------|--------------|
| `registration_file_path` | 34 | `~/.HyperCore/registration.json` |
| `load_saved_registration` | 41 | Reads and parses it. `None` if absent or corrupt |
| `save_registration_to_disk` | 47 | Writes it, ignoring failures |
| `set_sse_worker` | 62 | Stores the connection handle, aborting the previous one |
| `clear_sse_worker` | 72 | Aborts whatever is running |
| `connect_to_scheduler` | 81 | Builds the config and spawns `start_worker` |
| `bundled_tools_dir` | 98 | Finds the installer's tools folder |
| `get_toolchain_status` | 109 | **Tauri command.** Where esbuild and Javy are |
| `get_machine_info` | 114 | **Tauri command.** This computer's specs |
| `get_saved_registration` | 119 | **Tauri command.** Restores and reconnects |
| `unregister_node` | 132 | **Tauri command.** Disconnect and forget |
| `register_node` | 142 | **Tauri command.** Register, connect, save |
| `run` | 194 | **Entry point.** Plugins, tray, metrics, commands |

### Rust — `machine_info.rs`

| Function | Line | What it does |
|----------|------|--------------|
| `fallback_machine_id` | 34 | Reads or creates the persisted UUID |
| `MachineInfo::collect` | 55 | Builds the full description |
| `collect_metrics` | 95 | The live CPU and memory reading |

### Rust — `tools.rs`

| Function | Line | What it does |
|----------|------|--------------|
| `exe_name` | 11 | Adds `.exe` on Windows |
| `candidate_dirs` | 27 | Every folder searched, in priority order |
| `find_on_path` | 61 | Walks `PATH` |
| `searched_locations` | 76 | The list, for error messages |
| `resolve_tool` | 87 | The main search. Bundled first, then `PATH` |
| `toolchain_status` | 98 | Runs it for both tools |

### React — `src`

| Function | File | What it does |
|----------|------|--------------|
| `App` | `App.tsx` | Root component. All state, the three-step first run, page routing |
| `useActivity` | `hooks/use-activity.ts` | Polls `/activity` for this node's history |
| `useUpdater` | `hooks/use-updater.ts` | The auto-update state machine |
| `useMediaQuery` | `hooks/use-media-query.ts` | Responsive layout |
| `timeAgo` | `lib/activity.ts` | `"3m ago"` |
| `formatDuration` | `lib/activity.ts` | `"847ms"` or `"2.4s"` |
| `shortId` | `lib/activity.ts` | `8chars…4chars` |
| `formatLogTime` | `lib/activity.ts` | `"SEP 30 14:23:05.12"` |
| `invocationVariant` | `lib/activity.ts` | Status → badge colour |
| `deploymentVariant` | `lib/activity.ts` | Status → badge colour |
| `AppSidebar` | `components/app-sidebar.tsx` | Navigation, counts, copy ID, disconnect |
| `Titlebar` | `components/titlebar.tsx` | Minimize, maximize, close |
| `MachineDetailsCard` | `components/MachineDetailsCard.tsx` | Renders the machine specs |
| `RegistrationForm` | `components/RegistrationForm.tsx` | The coordinator URL form |
| `MachinePage` | `pages/machine-page.tsx` | Identity and hardware |
| `LogsPage` | `pages/logs-page.tsx` | Call history with filters |
| `LogDetailPanel` | `pages/log-detail-panel.tsx` | One call in detail |
| `LogDetailSheet` | `pages/log-detail-panel.tsx` | The same, as a bottom sheet |
| `DeploymentsPage` | `pages/deployments-page.tsx` | This node's deployments |
| `InsightsPage` | `pages/insights-page.tsx` | Live metrics and toolchain health |
| `SettingsPage` | `pages/settings-page.tsx` | Version, URL, updates, disconnect |

---

## 11. Next

- The tables the server writes when the agent acks:
  [04 - Data Model](./04-data-model.md)
- The full journeys, including the ones that fail:
  [05 - End-to-End Flows](./05-end-to-end-flows.md)
- Building, signing and releasing:
  [06 - Setup and Runbook](./06-setup-and-runbook.md)
