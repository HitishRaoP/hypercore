# 06 - Setup and Runbook

How to run everything locally, every environment variable, and how to fix
common problems.

---

## Contents

1. [What you need](#1-what-you-need)
2. [Package manager](#2-package-manager)
3. [Setting up the database](#3-setting-up-the-database)
4. [Setting up object storage](#4-setting-up-object-storage)
5. [Environment variables, all of them](#5-environment-variables-all-of-them)
6. [Running everything](#6-running-everything)
7. [Building an agent installer](#7-building-an-agent-installer)
8. [Database migrations](#8-database-migrations)
9. [Build and quality commands](#9-build-and-quality-commands)
10. [A quick test of the whole system](#10-a-quick-test-of-the-whole-system)
11. [Troubleshooting](#11-troubleshooting)
12. [Production notes](#12-production-notes)

---

## 1. What you need

| Tool | Version | Why |
|------|---------|-----|
| [Bun](https://bun.sh) | 1.2.5 or newer | The package manager and script runner |
| Node.js | 18 or newer | Runs the API and the dashboard |
| PostgreSQL | 14 or newer | The metadata and history store |
| Rust | Stable | Builds the agent |
| A C toolchain | Platform-specific | Needed by some Rust dependencies |
| A Cloudflare account | — | R2 object storage |

The repository pins Bun in `package.json` under `devEngines`, and TypeScript at
exactly `5.9.2`.

### Only the API

If you only need the server, you need Bun, Node and PostgreSQL. The dashboard
and the agent are separate workspaces and are not needed.

### Only the agent

The agent needs Bun, Node (for the Vite dev server), Rust and the C toolchain.
It does **not** need PostgreSQL or a storage account to *build*. It does need a
reachable coordinator to do anything useful.

---

## 2. Package manager

Bun is the package manager for this repository.

```bash
bun install
```

Installs every workspace. There is no need to `cd` into each package — Bun
workspaces handle the whole tree from the root.

`bun.lock` is committed. **Run `bun install`, never `npm install` or
`yarn install`** — they would produce a different lockfile and different
resolution.

---

## 3. Setting up the database

### Create a database

```sql
CREATE DATABASE hypercore;
```

### Apply the schema

```bash
cd packages/db
bun run db:push     # development — applies the schema directly
```

`db:push` is right for local work. It reconciles the database with the schema
files without producing migration files, so iterating on the schema is fast.

For anything shared, use migrations instead — see
[section 8](#8-database-migrations).

### Connection string

```
DATABASE_URL=postgres://user:password@localhost:5432/hypercore
```

`packages/db/src/lib/env.ts` validates it with `z.url()`, so a malformed
string crashes the process immediately rather than on the first query.

### If you are using a pooler

Add `?prepare=false`… or rather, **the pooler caveat is already handled**: the
code sets `{ prepare: false }` in `postgres()` because a cached prepared
statement can belong to a session the pooler has already replaced. So any
Postgres connection string works, pooled or not.

---

## 4. Setting up object storage

Hypercore uses **Cloudflare R2**, which speaks the same protocol as Amazon S3,
so the standard AWS SDK is used unchanged and the code never mentions
Cloudflare by name in the storage calls.

### Create a bucket

Any name works. The default is `hypercore`.

### Create an access key

In the Cloudflare dashboard: R2 → Manage API tokens → Create an API token.
Grant **Object Read & Write** for the bucket.

You get three values:

| Value | Environment variable |
|-------|----------------------|
| Account ID | `CLOUDFLARE_ACCOUNT_ID` |
| Access Key ID | `CLOUDFLARE_ACCESS_KEY_ID` |
| Secret Access Key | `CLOUDFLARE_SECRET_ACCESS_KEY` |

The endpoint is built from the account ID, so nothing else is needed:

```
https://<accountId>.r2.cloudflarestorage.com
```

### The bucket layout

Nothing needs creating in advance. The system writes two prefixes:

```text
raw/<deploymentId>/<fileName>            the uploaded sources
artifacts/<deploymentId>/worker.wasm     the compiled function
```

### Never give these keys to the agent or the dashboard

The agent and the dashboard both reach storage **through the API**. The API is
the only component that holds credentials. This is what lets the agent
installer be a plain download with nothing secret inside it, and it is enforced
by `assertReadableKey`, which only allows the two prefixes above.

---

## 5. Environment variables, all of them

### `apps/api` — `apps/api/src/lib/env.ts`

| Variable | Required | Default | Example |
|----------|----------|---------|---------|
| `PORT` | no | `8080` | `8080` |
| `CLOUDFLARE_ACCOUNT_ID` | **yes** | — | `abc123def456` |
| `CLOUDFLARE_ACCESS_KEY_ID` | **yes** | — | `7f2b…` |
| `CLOUDFLARE_SECRET_ACCESS_KEY` | **yes** | — | `a1b2c3…` |
| `R2_BUCKET` | no | `hypercore` | `hypercore` |
| `DATABASE_URL` | **yes** | — | `postgres://…` |
| `PUBLIC_URL` | no | `http://localhost:<PORT>` | `https://api.example.com` |
| `INVOKE_TIMEOUT_MS` | no | `10000` | `30000` |
| `CORS_ORIGINS` | no | — | `https://my-tunnel.example.com` |
| `DASHBOARD_URL` | no | — | `https://app.example.com` |
| `BACKEND_SERVER_URL` | no | — | Used by `turbo.json` for dev caching |

**`PUBLIC_URL`** matters in production. Without it, every URL the system
generates points at `http://localhost:8080`, which is useless to a real user.

**`INVOKE_TIMEOUT_MS`** is the whole timing budget. It derives two other
numbers:

| Derived | Formula | Default value |
|---------|---------|---------------|
| The agent's budget | `max(1000, INVOKE_TIMEOUT_MS - 2000)` | 8,000 ms |
| The server's wait | `INVOKE_TIMEOUT_MS + 5000` | 15,000 ms |

The agent is always given less time so its own error message wins the race. See
[Flow C](./05-end-to-end-flows.md#flow-c--call-a-function).

**`CORS_ORIGINS`** is comma-separated. Add a tunnel host, a public dashboard or
a LAN dev box here and restart the API — **no code change is needed**. A `*`
anywhere in the list turns credentials off entirely.

**`DASHBOARD_URL`** is normalised through the same function as
`CORS_ORIGINS`, so a trailing slash is fine.

### `packages/auth` — `packages/auth/src/lib/env.ts`

| Variable | Required | Default |
|----------|----------|---------|
| `BETTER_AUTH_URL` | **yes** | — |
| `BETTER_AUTH_SECRET` | **yes** | — |
| `DASHBOARD_URL` | no | `http://localhost:3000` |

`BETTER_AUTH_URL` must be the address the **browser** uses to reach the auth
endpoints. `DASHBOARD_URL` is the trusted origin and the base for password
reset links.

`BETTER_AUTH_SECRET` signs session cookies. Changing it signs every user out.

### `packages/db` — `packages/db/src/lib/env.ts`

| Variable | Required |
|----------|----------|
| `DATABASE_URL` | **yes** |

### `packages/transactional` — `packages/transactional/src/lib/env.ts`

| Variable | Required | Notes |
|----------|----------|-------|
| `RESEND_API_KEY` | **yes** | The mail delivery key |
| `FROM_EMAIL` | **yes** | Must be a valid address. The sender on every email |
| `DASHBOARD_URL` | **yes** | Used to build links inside the emails |

`@hypercore/auth` depends on this package, so these three are needed for
password reset to work. They are validated in the auth package's own
`process.env`, so the API's environment must carry them.

### `apps/dashboard` — `apps/dashboard/lib/env.ts`

| Variable | Meaning |
|----------|---------|
| `NEXT_PUBLIC_API_URL` | The API address the browser calls |

It is `NEXT_PUBLIC_`, so it is visible to the browser by design. It is an
address, not a secret.

### `apps/agent` — the build toolchain

The agent has **no environment variables at runtime**. It needs one thing from
the user: the coordinator URL, typed into the window and saved to
`~/.HyperCore/registration.json`.

For **signing a release build** locally:

| Variable | Meaning |
|----------|---------|
| `TAURI_SIGNING_PRIVATE_KEY` | The contents of the `.key` file |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The key's password, if it has one |

Set these in your shell, not in a `.env` file — the bundler ignores `.env`
files for this purpose.

### A complete local `.env`

```bash
# ── API ──────────────────────────────────────────────────────────────
PORT=8080
DATABASE_URL=postgres://postgres:postgres@localhost:5432/hypercore
CLOUDFLARE_ACCOUNT_ID=your-account-id
CLOUDFLARE_ACCESS_KEY_ID=your-key-id
CLOUDFLARE_SECRET_ACCESS_KEY=your-secret
R2_BUCKET=hypercore
PUBLIC_URL=http://localhost:8080
INVOKE_TIMEOUT_MS=10000
CORS_ORIGINS=
DASHBOARD_URL=http://localhost:3000

# ── Auth ─────────────────────────────────────────────────────────────
BETTER_AUTH_URL=http://localhost:8080
BETTER_AUTH_SECRET=generate-a-long-random-string
DASHBOARD_URL=http://localhost:3000

# ── Transactional email ──────────────────────────────────────────────
RESEND_API_KEY=re_your_key
FROM_EMAIL=Hypercore <noreply@example.com>
DASHBOARD_URL=http://localhost:3000

# ── Dashboard ────────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:8080
```

`dotenv/config` is imported on the first line of `apps/api/src/app.ts`, so the
API reads this file automatically. The dashboard needs `NEXT_PUBLIC_` values
in `apps/dashboard/.env.local`.

---

## 6. Running everything

### Development, all at once

```bash
bun run dev
```

`turbo run dev` starts every workspace that has a `dev` script, in dependency
order, with a live-reloading terminal interface.

| Address | What |
|---------|------|
| `http://localhost:3000` | The dashboard |
| `http://localhost:8080` | The API |
| `http://localhost:1420` | The agent's window (only under `tauri dev`) |

### One workspace at a time

```bash
cd apps/api   && bun run dev     # tsx watch src/index.ts
cd apps/dashboard && bun run dev # Next.js
cd apps/agent && bun run tauri dev
```

`tsx watch` restarts the API on every file change, which is what you want
while working on the server.

### The agent in development

```bash
cd apps/agent
bun run fetch:tools     # once, to get esbuild and javy
bun run tauri dev
```

**`fetch:tools` is required before the agent can build anything.** It downloads
the two native binaries into `apps/agent/src-tauri/resources/tools/`. Without
them, every deploy fails with `javy not runnable`.

`bun run fetch:tools:check` verifies without downloading, which is what CI
uses.

### Verifying a development agent is ready

Open the agent, go to **Insights**. It should show a resolved path for both
esbuild and Javy. If either says "not found", run `fetch:tools` again.

---

## 7. Building an agent installer

```bash
cd apps/agent
bun run fetch:tools      # download the binaries for THIS platform
bun run build:installer  # fetch + tauri build
```

`build:installer` runs `fetch:tools` and then `tauri build`, and produces an
installer in `src-tauri/target/release/bundle/`.

**The tools are bundled**, via `bundle.resources` in `tauri.conf.json`. This is
essential: a customer with no Node, npm or Bun installed can still deploy,
because the agent carries its own build tools. The binaries are git-ignored and
each release job fetches them for its own operating system before building.

### Signed builds

The updater verifies downloads against a public key committed in
`tauri.conf.json`. The private key lives **outside the repository** and only in
CI:

```bash
# once
bunx tauri signer generate -w ~/.tauri/hypercore-agent.key

# to build locally with signing
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/hypercore-agent.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
bun run build:installer
```

In CI, add two repository secrets:

| Secret | Contents |
|--------|----------|
| `TAURI_SIGNING_PRIVATE_KEY` | The whole `.key` file |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Its password, if any |

**Back the private key up somewhere safe.** If it is lost, existing installs
can never be updated again.

### Releasing

```bash
cd apps/agent
bun ./scripts/sync-agent-version.mjs 0.3.0   # all three version files
git add -A && git commit -m "chore: release agent v0.3.0"
git tag v0.3.0 && git push origin v0.3.0
```

The version appears in **three** files — `package.json`, `tauri.conf.json` and
`Cargo.toml` — and the updater compares against it. `sync-agent-version.mjs`
updates all three from one argument. A mismatch would break the updater.

Pushing the `v*` tag builds the Windows installer and attaches it to the Git
Hub release. The workflow can also be triggered manually from the Actions tab
with a version input, and it creates and pushes the tag for you.

### Known installer limitations

| Limitation | Consequence |
|------------|-------------|
| A copied `agent.exe` cannot self-update | Auto-update only works for machines that used the installer |
| The Windows installer terminates the running app | In-flight invocations are dropped. The coordinator re-dispatches when the node returns |
| An unsigned build cannot self-update | Sign every release |

---

## 8. Database migrations

`db:push` is for local iteration. For anything shared, use migrations.

```bash
cd packages/db
bun run db:generate   # create a migration file from the schema changes
bun run db:migrate    # apply pending migrations
bun run db:push       # apply the schema directly, no migration file
bun run db:studio     # a browser UI for browsing the data
```

`drizzle.config.ts` holds the connection string and the schema folder. It also
sets `schemaFilter: ["public"]`, so generated migrations only cover the
`public` schema.

The package exports two entry points: `@hypercore/db` for the client, and
`@hypercore/db/schema/*` for the tables and their types. That is why the API
imports `db` and the schema from two separate paths.

### When you change a table

1. Edit the file in `packages/db/src/schema/`.
2. `bun run db:generate` — read the generated SQL before committing.
3. `bun run db:migrate` locally.
4. Commit both the schema change and the migration file.

Generated migration files are committed. They are the record of what changed
and when.

### Adding a status value

A status is plain text, not a database enum, so **no migration is needed**. But
three places must be updated or the change is incomplete:

1. `apps/agent/src/types/index.ts` — the `DeploymentStatus` union
2. `apps/agent/src/lib/activity.ts` — `deploymentVariant`, the colour mapping
3. The list of statuses in [04 - Data Model](./04-data-model.md)

---

## 9. Build and quality commands

All run from the repository root through Turborepo.

| Command | What it does |
|---------|--------------|
| `bun run build` | Builds every workspace, in dependency order |
| `bun run dev` | Runs every `dev` script, live-reloading |
| `bun run lint` | Lints every workspace |
| `bun run check-types` | Type-checks without emitting |
| `bun run format` | Formats every `.ts`, `.tsx` and `.md` with Prettier |

### About Turborepo

`turbo.json` defines the task graph. `build` depends on the builds of its
dependencies, and `outputs` lists `.next/**` while excluding the cache and dev
directories, so a build result is cached and restored rather than rebuilt.

`dev` is `persistent: true` and `cache: false` — a long-running server is never
cached.

**Read the installed Turborepo's own documentation before changing any of
this.** Versions differ. To find it:

```bash
node -p "require.resolve('turbo/package.json')"
```

then read `docs/README.md` inside that package, and the relevant pages in its
`docs/` directory. Heed any deprecation notices there. The bundled docs match
the installed version and need no network access.

### Agent Rust checks

```bash
cd apps/agent/src-tauri
cargo test --lib executor    # the end-to-end execution test
cargo test --lib tools       # the installer-layout test
cargo check                  # type-check
cargo clippy                 # lints
```

Both tests **skip gracefully** when the toolchain has not been fetched, so
`cargo test` passes on a bare machine. With the tools present they are real
end-to-end checks.

### Agent-specific scripts

| Script | What it does |
|--------|--------------|
| `bun run fetch:tools` | Download the build binaries for this platform |
| `bun run fetch:tools:check` | Verify without downloading. The CI gate |
| `bun run build:installer` | `fetch:tools` then `tauri build` |
| `bun run postinstall` | `fetch:tools --tolerant` — runs automatically, failures ignored |

---

## 10. A quick test of the whole system

Confirming every part works, in order. About five minutes.

### 1. The API is up

```bash
curl http://localhost:8080/
# {"message":"Hypercore api is up!"}
```

### 2. The database is reachable

```bash
curl http://localhost:8080/api/v1/nodes
# {"nodes":[]}
```

An empty array means the query worked. A `500` means `DATABASE_URL` is wrong
or the schema was never applied.

### 3. The starter template is served

```bash
curl http://localhost:8080/code-upload/template
```

Should return three files: `index.ts`, `package.json`, `bun.lock`.

### 4. Register an agent

Start the agent, type `http://localhost:8080`, click **Register Node**.

```bash
curl http://localhost:8080/agents/online
# {"online":["<machine-id>"],"count":1}
```

If the count is 0, the stream is not open. Check the agent's console for
`Connected to scheduler`.

### 5. Deploy without the dashboard

This exercises upload, storage, the database, routing, the build pipeline and
the artifact upload — all of it.

```bash
curl http://localhost:8080/code-upload/check-name?workerName=my-first-fn
# {"workerName":"my-first-fn","taken":false}
```

```bash
curl -X POST http://localhost:8080/code-upload \
  -F workerName=my-first-fn \
  -F machineId=<the-machine-id-from-step-4> \
  -F entrypoint=index.ts \
  -F "files=@index.ts" \
  -F "files=@package.json"
```

Note: this needs a session cookie, because the route is behind `requireUser`.
The dashboard is the supported path. For a quick test, temporarily call the
service from a script instead, or use the legacy endpoint:

```bash
curl -X POST http://localhost:8080/deployment \
  -H "Content-Type: application/json" \
  -d '{"deploymentId":"test-1","machineId":"<machine-id>","objectKey":"raw/x/index.ts"}'
```

Watch the agent's console. You should see:

```text
Received deployment (SSE)
Deployment : <id>
Worker     : my-first-fn
Entrypoint : index.ts
Object Key : raw/…/index.ts
  pulled raw/… (n bytes) -> …/index.ts
  ts->js: bundled with …
  js->wasm: compiled with javy (…)
  wasm uploaded via server: {"status":"stored",…}
Deployment <id> finished: …
```

And the API's console:

```text
[scheduler] routed deployment <id> -> <machine>
[deployments] artifact stored deployment=<id> key=artifacts/<id>/worker.wasm bytes=<n>
[deployments] live at http://localhost:8080/invoke/<id> (worker: http://localhost:8080/w/my-first-fn)
[scheduler] ack deployment=<id> machine=<id> status=done
```

### 6. Call it

```bash
curl -i http://localhost:8080/invoke/test-1
```

```text
HTTP/1.1 200 OK
x-hypercore-deployment: test-1
x-hypercore-worker: my-first-fn
x-hypercore-node: <machine-id>
x-hypercore-exit-code: 0
Content-Type: text/plain; charset=utf-8

Hello, World!
```

And through the stable worker URL:

```bash
curl http://localhost:8080/w/my-first-fn
# Hello, World!
```

### 7. Check the history

```bash
curl "http://localhost:8080/activity?machineId=<machine-id>"
```

Should show one deployment with `status: "built"` and one invocation with
`status: "done"`, `exitCode: 0`, and `stdoutPreview: "Hello, World!\n"`.

If all seven steps pass, the whole system works.

---

## 11. Troubleshooting

### The API will not start

| Message | Cause | Fix |
|---------|-------|-----|
| `CLOUDFLARE_ACCOUNT_ID is required` | Missing from the environment | Add it |
| `DATABASE_URL is required` | Missing. This is deliberate — the server refuses to run on memory | Add it |
| `Invalid url` | `DATABASE_URL` is not a URL | Check the scheme: `postgres://`, not `postgresql+driver://` |
| `ECONNREFUSED` | Postgres is not running | Start it |
| `relation "deployments" does not exist` | The schema was never applied | `bun run db:push` in `packages/db` |

### The agent connects, then the browser blocks it

A CORS error in the browser console. Check the API's boot log:

```text
[cors] allowed origins: http://tauri.localhost, tauri://localhost, …
```

Each platform's Tauri window reports a **different** origin for the same
bundle:

| Platform | Origin |
|----------|--------|
| Windows (WebView2) | `http://tauri.localhost` |
| macOS and Linux | `tauri://localhost` |
| Development | `http://localhost:1420` |

If yours is missing, add it to `CORS_ORIGINS` and restart the API. Loopback
addresses on any port are already allowed by a regular expression.

### The agent deploys but calls return `409`

The message says it: the artifact was never stored. In order of likelihood:

| Check | How |
|-------|-----|
| Did the artifact upload reach the API? | `artifact rejected` or `artifact upload failed` in the agent console |
| Is the API's storage key valid? | The API log's `artifact stored` line |
| Is the file over 25 MB? | The `upload.single("wasm")` limit |

### Deploys fail with `javy not runnable`

The build toolchain is not on the machine.

| Situation | Fix |
|-----------|-----|
| Development | `cd apps/agent && bun run fetch:tools` |
| An installed agent | Reinstall — the installer carries the tools |
| Neither works | The error message lists **every location searched**. Look for a path that is wrong on this machine |

Confirm in the agent's **Insights** page, which shows the resolved paths for
both tools.

### Deploys fail with `javy (…) failed`

**Javy ran and rejected the JavaScript.** This is your code, not the
toolchain. Javy embeds the QuickJS engine, which is a full but small JavaScript
runtime — many npm packages will not work in it.

Common causes:

| Cause | Fix |
|-------|-----|
| An import of a package not designed for QuickJS | Remove it |
| Modern syntax QuickJS does not support | Simplify, or check esbuild's target |
| A top-level `await` | Wrap it, or use a `.then()` chain |

To see the real error, look at the agent's console at the `js->wasm:` line and
re-read the deploy in the dashboard's log view.

### Calls always return `503`

No open SSE stream. In order:

```bash
curl http://localhost:8080/agents/online
```

| Result | Meaning |
|--------|---------|
| The machine is listed | The stream is open but the deployment targets a different machine |
| Empty | The agent is not connected |

Then check the agent's console for `Connected to scheduler`. If that line is
missing, the problem is the connection, not the call.

### Calls return `504`

The function outlasted the budget. The default gives the agent 8 seconds.

| Option | Effect |
|--------|--------|
| Raise `INVOKE_TIMEOUT_MS` | More time per call, on both sides |
| Fix the function | Usually better — a call that takes 8 seconds is usually the problem |

Raising it also raises the server's wait, so a hung function ties up a
connection for longer.

### The dashboard shows nothing

| Check | How |
|-------|-----|
| `NEXT_PUBLIC_API_URL` | Must be set in `apps/dashboard/.env.local`, and the prefix is required |
| Are you signed in? | Deployment and invocation lists need a session |
| Is the API's CORS list including the dashboard? | The API's boot log |

### Deployments are stuck at `building`

The agent acked, but no artifact arrived.

| Check | Where |
|-------|-------|
| Did the agent's build actually finish? | Its console |
| Did the upload succeed? | `artifact rejected` in the agent console |
| Did the API accept it? | `[deployments] artifact stored` in the API log |

`acknowledgeDeployment` sets `building` when the ack arrives and no artifact
exists yet. It is a transient state — if it persists, the upload failed.

### Invocations are stuck at `running`

The API process restarted or died between the start and finish writes. Nothing
reconciles these, and nothing should: see
[Flow F](./05-end-to-end-flows.md#flow-f--the-server-restarts).

The caller got a `504`; the row is simply never closed.

### The agent will not update

| Cause | Fix |
|-------|-----|
| The app was copied rather than installed | Auto-update needs an installer |
| The build was unsigned | Sign it. See [section 7](#7-building-an-agent-installer) |
| The three version files disagree | Run `sync-agent-version.mjs` |
| It is a development build | Expected. `useUpdater` skips the background poll under `import.meta.env.DEV` |

### Everything works in development but not when deployed

| Cause | Check |
|-------|-----|
| `PUBLIC_URL` is unset | Links point at `localhost:8080` |
| The agent's origin is not in `CORS_ORIGINS` | The API's boot log |
| A proxy is buffering the SSE stream | Disable buffering for `/agents/events`. `X-Accel-Buffering: no` is already sent for nginx |
| A proxy has an idle timeout under 25 s | The heartbeat is 25 s, so keep the proxy above that |
| Node's request timeout killed the stream | Already handled. `server.requestTimeout = 0` in `index.ts` |

---

## 12. Production notes

### The single-process requirement

**The scheduler map and the invocation waiter map live in the API process's
memory.** That has three consequences:

| Consequence | Why |
|-------------|-----|
| One API process is the supported topology | Two processes do not share online state or waiting callers |
| With a load balancer, use sticky routing | An agent connected to process A is invisible to process B |
| A restart drops in-flight calls | The callers get `504`; history rows stay at `running` |

This is the accepted trade-off of replacing a message broker with SSE. The
gain is that the agent installer carries no credentials. See
[01 - Architecture](./01-architecture.md#9-design-decisions-and-their-trade-offs).

### Reverse proxy requirements

If the API sits behind nginx, Caddy, or a cloud load balancer:

| Requirement | Why |
|-------------|-----|
| Disable response buffering for `/agents/events` | Otherwise events sit in a buffer until the connection closes. `X-Accel-Buffering: no` is already sent |
| Idle timeout above 25 seconds | The heartbeat is 25 s. A shorter timeout kills the stream |
| No response compression on the event stream | `Cache-Control: no-transform` is set, but not every proxy honours it |
| A large request body limit | `10mb` for `/invocations/:id/result`, `25mb` for the artifact upload |

Node's own request timeout is already disabled in `index.ts`.

### Body limits, all four

| Route | Limit | Why |
|-------|-------|-----|
| `/invoke/*`, `/w/*` | 1 MB | The function's standard input |
| `/code-upload` | 5 MB per file, 10 files | TypeScript source |
| `/deployment/:id/artifact` | 25 MB | Compiled WebAssembly |
| `/invocations/:id/result` | 10 MB | Base64 output — 4 MB of output becomes 5.4 MB |

Your proxy must be at least as generous as the largest of these.

### Secrets checklist

| Secret | Where it lives | Who needs it |
|--------|----------------|--------------|
| `DATABASE_URL` | API environment | The API only |
| `CLOUDFLARE_*` | API environment | The API only |
| `BETTER_AUTH_SECRET` | Auth package environment | The API only |
| `TAURI_SIGNING_PRIVATE_KEY` | CI secrets, plus a backup off-machine | Release CI only |
| The storage key | **nowhere else** | Never ship it to an agent or the dashboard |

### Health check

```bash
curl http://localhost:8080/
# {"message":"Hypercore api is up!"}
```

That is the only unauthenticated liveness endpoint. It does not touch the
database, so for a readiness check that also confirms the database, call
`GET /api/v1/nodes` and expect a JSON array.

### Backups

| What | How it is protected |
|------|--------------------|
| PostgreSQL | Your own backups. Deployments and invocation history are the only things irreplaceable here |
| R2 objects | Cloudflare's durability. An artifact can always be rebuilt by redeploying |

Nothing critical lives only in memory. The worst outcome of losing both is
losing history, not losing the product.

---

## Next

- The dashboard and the shared packages:
  [07 - Dashboard and Packages](./07-dashboard-and-shared-packages.md)
- Back to the top: [INDEX](./INDEX.md)
