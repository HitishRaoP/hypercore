# 04 - Data Model

Every table, every column, every stored file, and every status value.

- **Where the code is:** `packages/db/src`
- **What it is:** PostgreSQL, reached through Drizzle ORM
- **How to change it:** `packages/db/drizzle.config.ts` generates migrations from
  the schema files

---

## Contents

1. [The connection](#1-the-connection)
2. [A map of the tables](#2-a-map-of-the-tables)
3. [The application tables](#3-the-application-tables) — machines, deployments, invocations
4. [The authentication tables](#4-the-authentication-tables) — user, session, account, verification, passkey
5. [Stored files in Cloudflare R2](#5-stored-files-in-cloudflare-r2)
6. [What lives in memory, not in the database](#6-what-lives-in-memory-not-in-the-database)
7. [Relationships](#7-relationships)
8. [Indexes](#8-indexes)
9. [Writing a query](#9-writing-a-query)

---

## 1. The connection

### `packages/db/src/lib/env.ts`

```ts
const envSchema = z.object({ DATABASE_URL: z.url() });
export const env = envSchema.parse(process.env);
```

One variable, validated at import time. `z.url()` checks the shape, so a
malformed connection string crashes the process immediately instead of failing
on the first query.

### `packages/db/src/db.ts`

```ts
const client = postgres(env.DATABASE_URL, { prepare: false });
export const db = drizzle({ client });
```

`postgres` is a small, fast PostgreSQL driver. `drizzle` wraps it and gives
TypeScript the schema.

**Why `prepare: false`.** The driver caches prepared statements per
connection. Behind a connection pooler such as PgBouncer or Supabase's pooler,
the session can change between the prepare and the execute, and the cached plan
belongs to a session that no longer exists. Disabling the cache is the
documented fix and costs a negligible amount of performance at this scale.

`db` is exported as a singleton, so every part of the system shares one
connection pool rather than opening its own.

### `drizzle.config.ts`

Points the migration tooling at the schema folder and the connection string.
Run through the `db` package's scripts.

---

## 2. A map of the tables

```text
┌──────────┐        ┌──────────────┐        ┌─────────────┐
│  user    │──1:N──▶│   session    │        │ invocations │
└────┬─────┘        └──────────────┘        └──────┬──────┘
     │                                            │ N:1
     ├──1:N──▶ account                            ▼
     ├──1:N──▶ passkey                    ┌──────────────┐
     │                                    │ deployments  │
     └──1:N──▶ verification               └──────────────┘
                                                      │ N:1
                                                      ▼
                                               ┌────────────┐
                                               │  machines  │
                                               └────────────┘
```

The application tables are `machines`, `deployments` and `invocations`. The
authentication tables — `user`, `session`, `account`, `verification`,
`passkey` — are managed by better-auth and are covered more briefly.

Note the two tables that are **not** joined by a foreign key:

| Tables | Relationship | Why there is no foreign key |
|--------|--------------|----------------------------|
| `deployments` → `machines` | A deployment targets a node | A node's record is created by the agent, a deployment by a person. Forcing the order would make a deploy fail because of an unrelated node lifecycle |
| `invocations` → `machines` | A call ran on a node | Same reason. A node may be deleted while its history is still wanted |

Both are deliberate. An invocation history that disappears because someone
uninstalled an agent would be much worse than an orphaned ID.

---

## 3. The application tables

### 3.1 `machines` — the registered nodes

`packages/db/src/schema/machines.ts`

| Column | Type | Rules | Meaning |
|--------|------|-------|---------|
| `machine_id` | text | **primary key** | Stable ID for this computer |
| `hostname` | text | not null | The computer's name |
| `os_name` | text | not null | e.g. `Windows` |
| `os_version` | text | not null | e.g. `10.0.19045` |
| `kernel_version` | text | not null | Kernel or build string |
| `arch` | text | not null | e.g. `x86_64` |
| `cpu_logical_cores` | integer | not null | Cores including hyper-threading |
| `cpu_physical_cores` | integer | not null | Real physical cores |
| `cpu_brand` | text | not null | e.g. `AMD Ryzen 7 5800X` |
| `total_memory_mb` | integer | not null | Total RAM |
| `used_memory_mb` | integer | not null | RAM in use at registration |
| `total_disk_mb` | integer | not null | Total disk across volumes |
| `available_disk_mb` | integer | not null | Free disk at registration |
| `local_ip` | text | not null | LAN address |
| `first_seen_at` | timestamp | not null, defaults to now | When it first registered |
| `last_seen_at` | timestamp | not null, defaults to now | Last registration |

Column names are `snake_case` in the database; the TypeScript properties are
`camelCase`. The schema file's comment records why: the table mirrors the
agent's Rust `MachineInfo`, which serialises as camelCase, and mapping it to
conventional SQL column names keeps the database readable to anyone using
`psql`.

#### Why the primary key is a text ID

`machine_id` is the operating system's machine ID when available, otherwise a
UUID persisted to `~/.HyperCore/machine_id`. Either way it is stable for the
life of the computer, which is what makes registration an **upsert** rather
than an insert.

Without stability, every agent restart would create a new row, and a user
would accumulate duplicate nodes in their dashboard.

#### What the upsert does

`registerMachine` runs:

```ts
db.insert(machines)
  .values({ machineId, ...specs })
  .onConflictDoUpdate({
    target: machines.machineId,
    set: { ...specs, lastSeenAt: new Date() },
  })
```

| Situation | Result |
|-----------|--------|
| New machine | Inserted. `first_seen_at` and `last_seen_at` both set to now |
| Known machine | Every spec refreshed, `last_seen_at` bumped |
| Known machine, specs unchanged | Still an update. `last_seen_at` moves |

`first_seen_at` is deliberately **not** in the update set, so it keeps the
original registration time forever. That is what lets the dashboard show "first
seen in March, last seen 2 minutes ago".

#### What is not stored here

| Missing | Why |
|---------|-----|
| Online status | A live fact. Lives in the scheduler's map, not the database |
| The coordinator URL | Not needed server-side; each deployment records its machine |
| Capacity over time | Only the reading at registration and at each re-registration is kept |

`used_memory_mb` and `available_disk_mb` are therefore **the values at the last
registration**, not live. The live values come from the agent's own
`metrics_tick` push, which never leaves the machine. A user looking at a node
in the dashboard is looking at the last registration's figures, and the node's
own Insights page is the only place with live numbers.

#### `MachineRow` and `NewMachineRow`

```ts
export type MachineRow = typeof machines.$inferSelect;
export type NewMachineRow = typeof machines.$inferInsert;
```

Two types inferred from the table. `MachineRow` is a full row as it comes back
from the database. `NewMachineRow` is what may be inserted, so its defaulted
columns are optional. Nothing is written by hand, so the types cannot drift
from the schema.

---

### 3.2 `deployments` — one built version of a function

`packages/db/src/schema/deployments.ts`

| Column | Type | Rules | Meaning |
|--------|------|-------|---------|
| `id` | text | **primary key** | The deployment ID, a UUID from the server |
| `user_id` | text | nullable | The owner. No foreign key |
| `worker_name` | text | not null, **unique** | The short public name |
| `machine_id` | text | not null | The target node |
| `entrypoint` | text | not null, defaults to `index.ts` | Which file to build |
| `files` | jsonb | not null | The file manifest |
| `status` | text | not null, defaults to `uploaded` | Where it is in its life |
| `artifact_key` | text | nullable | Where the built WebAssembly lives |
| `created_at` | timestamp | not null, defaults to now | When the deploy started |
| `updated_at` | timestamp | not null, defaults to now, auto-updates | Last change |

#### The `files` column

A JSON array, typed as:

```ts
{ name: string; key: string; size: number; contentType?: string }[]
```

| Field | Meaning |
|-------|---------|
| `name` | The file name as it will be on disk, already sanitised |
| `key` | The storage key, `raw/<deploymentId>/<name>` |
| `size` | Bytes |
| `contentType` | The upload's MIME type |

**Why the manifest is stored rather than derived.** The agent needs to know
every file to download, and it is given that list in the deployment event. If
the list were derived from storage, the agent would have to list a bucket
prefix on every deploy. Storing it means the event carries everything the
agent needs.

**Why the full source is not in the database.** Source files are the big,
rarely-queried data. They belong in object storage where listing and reading
are cheap, and they are reachable by prefix.

#### The `worker_name` uniqueness

**Globally unique across every user, forever.** Not per user.

That is a strong rule, and it buys a clean public address: `/w/my-function`
resolves to exactly one function in the whole system. It is the reason
`isWorkerNameTaken` and `isUniqueViolation` exist at all, and the reason a
409 can be produced from three different places.

The trade-off is that names are a shared global resource. Two users cannot
both have `api`, and there is no way to release a name.

#### The status column

Plain text, no database enum. Nothing at the database level stops a typo.

| Status | Set by | Means |
|--------|--------|-------|
| `uploaded` | `createDeployment` | Files are in storage. Nothing has been sent anywhere |
| `routed` | `uploadCode` | The build job was written into an open agent stream |
| `offline` | `uploadCode` | No open stream. **The job was not queued** |
| `building` | `acknowledgeDeployment` | The agent acknowledged, no artifact yet |
| `built` | `markDeploymentBuilt` | The artifact is in storage. Callable |
| `failed` | `acknowledgeDeployment` | The agent could not build it |

`offline` deserves attention: because there is no broker, nothing is waiting.
The deployment exists and can be seen in the dashboard, but nothing will
happen until someone re-routes it. The status makes that visible.

**Three places must be updated when a status is added:**

1. This table in the schema's comment, if it helps.
2. `DeploymentStatus` in `apps/agent/src/types/index.ts`.
3. `deploymentVariant` in `apps/agent/src/lib/activity.ts`.

Missing the third means the badge falls through to the default colour.

#### The `artifact_key` column

Null until the build finishes. Its presence is what makes a deployment
callable:

- `getLatestBuiltDeployment` returns nothing when it is null.
- `serve` answers `409` when it is null.

So this single nullable column is the gate between "exists" and "works".

#### `updated_at`

`.$onUpdate(() => new Date())` means Drizzle sets it on every update, without
the application having to remember. Nothing in the API reads it today, but it
makes "when did this last change" answerable without adding a column later.

---

### 3.3 `invocations` — one call

`packages/db/src/schema/invocations.ts`

| Column | Type | Rules | Meaning |
|--------|------|-------|---------|
| `id` | text | **primary key** | A fresh UUID per call |
| `user_id` | text | nullable | The caller's owner, from the deployment |
| `deployment_id` | text | not null, **references `deployments.id`** | Which deployment ran |
| `worker_name` | text | not null | Denormalised from the deployment |
| `machine_id` | text | not null | Denormalised from the deployment |
| `method` | text | not null | The caller's HTTP method |
| `path` | text | not null | The path the function saw |
| `status` | text | not null, defaults to `running` | The outcome |
| `exit_code` | integer | nullable | The function's exit code |
| `duration_ms` | integer | nullable | How long it took |
| `stdout_preview` | text | nullable | The first 2000 characters of output |
| `error` | text | nullable | Why it failed |
| `created_at` | timestamp | not null, defaults to now | When the call started |
| `finished_at` | timestamp | nullable | When it ended |

#### The only real foreign key

`deployment_id` references `deployments.id`. This one **is** enforced, and it
is the right place to enforce it: an invocation without a deployment has no
meaning. No cascade, so deleting a deployment with history is blocked by the
database rather than silently deleting the audit trail.

#### Why `worker_name` and `machine_id` are copied

Both are already on the deployment row. Copying them onto every invocation
means the log query needs **one** table and **no join**:

```ts
db.select().from(invocations).where(eq(invocations.userId, userId))
```

A deployment's name and machine cannot change — `worker_name` is unique and
`machine_id` is fixed at creation — so the copies cannot go stale. The
denormalisation is safe and it is what makes the log page fast.

#### Why `stdout_preview` is only 2000 characters

A function can print 4 MB. Storing all of it for every call would bloat the
table enormously, and nobody reads 4 MB in a table cell.

The **full** output still goes to the original caller — the preview is only
for history. `previewStdout` in the invocation service does the truncation,
and the 2000-character limit is the `STDOUT_PREVIEW_LIMIT` constant.

The base64 is decoded before truncating, so the 2000 characters are real
characters and not a third of them.

#### The status column

| Status | Set when | `exit_code` | `error` |
|--------|----------|-------------|---------|
| `running` | The row is inserted, before the event is dispatched | null | null |
| `done` | The function exited 0 | `0` | null |
| `failed` | Non-zero exit | the code | the agent's message, or `Exited with code N` |
| `failed` | The node was offline | null | `Node is offline (no open SSE stream)` |
| `timeout` | Neither the agent nor the server's timer fired | null | `Node did not respond in time` |

**Offline is recorded as `failed`, not as its own status.** There are four
statuses and "the node was not there" is a failure to deliver. The
distinguishing information is in `error`, which says exactly what happened.

#### A known gap: rows stuck at `running`

If the API process restarts between `recordStarted` and `recordFinished`, the
in-memory waiter is gone but the row stays at `running` forever. Nothing
reconciles it.

A sweep would fix it — update rows older than a few minutes with a `running`
status to `timeout` — but it does not exist today. If you see old `running`
rows in a dashboard, that is why.

#### Both writes are best-effort

`recordStarted` and `recordFinished` are each wrapped in `try`/`catch` and only
log on failure. A database problem never breaks a function call.

| Failure | Result |
|---------|--------|
| The insert fails | The call proceeds normally, no history row |
| The update fails | The caller gets their answer, the row stays at `running` |

That is a deliberate trade. A function call that is answered is worth far more
than a complete history.

---

## 4. The authentication tables

Managed by **better-auth**. These tables are not written by any Hypercore code
— better-auth writes them through its Drizzle adapter. They are documented
here so the shape is not a surprise.

`packages/db/src/schema/auth.ts`

### `user`

| Column | Type | Rules |
|--------|------|-------|
| `id` | text | primary key |
| `name` | text | not null |
| `email` | text | not null, **unique** |
| `email_verified` | boolean | not null, defaults false |
| `image` | text | nullable |
| `created_at` | timestamp | not null, defaults now |
| `updated_at` | timestamp | not null, auto-updates |

### `session`

| Column | Type | Rules |
|--------|------|-------|
| `id` | text | primary key |
| `expires_at` | timestamp | not null |
| `token` | text | not null, **unique** |
| `created_at` | timestamp | not null, defaults now |
| `updated_at` | timestamp | not null, auto-updates |
| `ip_address` | text | nullable |
| `user_agent` | text | nullable |
| `user_id` | text | not null, references `user.id`, **cascade delete** |

This is the table `requireUser` reads through `auth.api.getSession()`. The
cookie sent by the browser holds the session token; better-auth looks it up
here and returns the user.

### `account`

| Column | Type | Rules |
|--------|------|-------|
| `id` | text | primary key |
| `account_id` | text | not null |
| `provider_id` | text | not null |
| `user_id` | text | not null, references `user.id`, **cascade delete** |
| `access_token` / `refresh_token` / `id_token` | text | nullable |
| `access_token_expires_at` / `refresh_token_expires_at` | timestamp | nullable |
| `scope` | text | nullable |
| `password` | text | nullable — the **hash**, not the password |
| `created_at` / `updated_at` | timestamp | |

One row per linked sign-in method. The `password` column holds a hash.
Passwords are never stored or logged in plain text anywhere in this system.

### `verification`

| Column | Type | Rules |
|--------|------|-------|
| `id` | text | primary key |
| `identifier` | text | not null — usually the email |
| `value` | text | not null — the token |
| `expires_at` | timestamp | not null |
| `created_at` / `updated_at` | timestamp | |

Used for password resets and email verification. `expiresAt` is what makes a
reset link stop working.

### `passkey`

| Column | Type | Rules |
|--------|------|-------|
| `id` | text | primary key |
| `name` | text | nullable |
| `public_key` | text | not null |
| `user_id` | text | not null, references `user.id`, **cascade delete** |
| `credential_id` | text | not null |
| `counter` | integer | not null — detects cloned authenticators |
| `device_type` | text | not null |
| `backed_up` | boolean | not null |
| `transports` | text | nullable |
| `created_at` | timestamp | nullable |
| `aaguid` | text | nullable |

Enabled by the `passkey()` plugin in `packages/auth/src/auth.ts`. The
`counter` is the interesting column: if a passkey's counter goes **backwards**,
the authenticator has probably been cloned, and better-auth can refuse it.

### The relations

Five `relations()` declarations wire the tables together for Drizzle's query
builder. `user` has `many` sessions, accounts and passkeys; each of those has
`one` user. Nothing in the API uses them today — every query is a plain
`select` on one table — but they are available for a future relational query.

---

## 5. Stored files in Cloudflare R2

R2 holds exactly two kinds of object, under two fixed prefixes.

```text
hypercore/  (the bucket)
├── raw/
│   └── <deploymentId>/
│       ├── index.ts
│       ├── package.json
│       └── bun.lock
└── artifacts/
    └── <deploymentId>/
        └── worker.wasm
```

| Prefix | What it holds | Key built by | Written by | Read by |
|--------|---------------|--------------|-----------|----------|
| `raw/` | The uploaded source files | `rawKeyFor(id, name)` | `storeRawFiles` | The agent, via `GET /code-upload/file` |
| `artifacts/` | The compiled WebAssembly | `artifactKeyFor(id)` | `uploadArtifact` | The agent, via the same proxy |

### Why only these two prefixes

`assertReadableKey` refuses any key that does not start with `raw/` or
`artifacts/`. The API holds storage credentials, so without that check the
download proxy would be an open reader for the entire bucket. The two
prefixes are the complete set of things the system ever writes, so allowing
exactly those is both necessary and sufficient.

### Who can reach a file

Nobody directly. The agent has no storage credentials, and the dashboard has
none either. Every read goes through `GET /code-upload/file?key=…` on the
API, which checks the prefix and then streams the object out.

The path a file takes:

```text
R2  ──▶  API  ──▶  Agent
        (proxy)
```

and in the other direction:

```text
Agent  ──▶  API  ──▶  R2
       (upload)
```

That is the whole reason the installer can be a plain download with nothing
secret inside it.

### Why the file name is fixed for artifacts

The agent always produces exactly one `worker.wasm` per deployment and looks
for exactly that path at call time. A fixed name means the agent can find its
artifact with `work_dir/<id>/worker.wasm` and a storage key it builds itself,
with no lookup.

### What is never stored

| Not stored | Why |
|-------------|-----|
| Function output | It goes straight to the caller and 2000 characters go to the database |
| Logs from the agent | The agent prints to its own console |
| Built bundles other than the wasm | Only the final artifact is kept |

---

## 6. What lives in memory, not in the database

Two things are deliberately not persisted, both inside the API process.

### The scheduler's agent map

```ts
// apps/api/src/lib/scheduler.ts
const agents = new Map<string, { res: Response; heartbeat: Timeout }>();
```

| Question it answers | Can a database answer it? |
|---------------------|--------------------------|
| Is this agent connected right now? | No. A connection is not a fact about a row |
| Push work to it | No. A push needs the live socket |

**What is lost on restart:** every agent appears offline until it reconnects.
In practice that is seconds, because `start_worker` retries within one second
and re-registers from the saved file. The loss is only visible if you are
running two API processes behind a load balancer, where an agent connected to
process A is invisible to process B. Sticky routing fixes that.

### The invocation `pending` map

```ts
// apps/api/src/services/invocation.service.ts
const pending = new Map<string, { timer, settle }>();
```

Holds the resolver of every in-flight call so the agent's result can release
the waiting HTTP response.

**What is lost on restart:** every waiting caller gets a timeout after
`INVOKE_TIMEOUT_MS + 5000`, and the corresponding database rows stay at
`running` forever. There is no reconciliation sweep. This is the sharpest edge
in the system and it is worth knowing about before you debug a "stuck" log
entry.

### Why these are in memory at all

| Alternative | Why it was not chosen |
|-------------|----------------------|
| A database table of connections | A connection cannot be stored. A row would have to point at a socket, and a socket is memory |
| A message broker for results | The whole SSE design replaced the broker to keep credentials out of the installer. Reintroducing one for the results would undo that |
| Polling from the agent | The agent would need to ask "do I have work?" on a timer. A push is simpler and faster |

---

## 7. Relationships

| From | To | Cardinality | Enforced? | Why |
|------|----|-------------|-----------|-----|
| `user` → `session` | one to many | yes, cascade delete | A session without a user is meaningless |
| `user` → `account` | one to many | yes, cascade delete | Same |
| `user` → `passkey` | one to many | yes, cascade delete | Same |
| `invocations` → `deployments` | many to one | **yes** | A call with no deployment has no meaning |
| `deployments` → `machines` | many to one | **no** | A node's row is created by the agent. Forcing the order would let an unrelated node lifecycle break a deploy |
| `invocations` → `machines` | many to one | **no** | History must survive a node being removed |
| `deployments` → `user` | many to one | **no** | `user_id` is nullable. A deployment can outlive its owner's session, and a legacy row may predate the column |

Only four foreign keys exist, and every one of them is in the
authentication set. The application tables are connected by plain text IDs
and joined by the application when needed.

That is a deliberate choice: it keeps the tables independent, and it means
deleting a node or a user never silently destroys history.

---

## 8. Indexes

Five indexes, each on a column that is genuinely filtered or sorted on.

### `deployments_user_id_idx`

```sql
CREATE INDEX deployments_user_id_idx ON deployments (user_id);
```

Serves `listDeploymentsByUser` — the dashboard's deployments page. Without it,
that query scans every deployment in the system.

### `invocations_machine_id_created_idx`

```sql
CREATE INDEX invocations_machine_id_created_idx ON invocations (machine_id, created_at);
```

Serves `listInvocationsByMachine` — the agent's activity feed. It is a
**two-column** index because the query filters on `machine_id` *and* sorts by
`created_at` descending. A single-column index would find the rows and then
sort them separately; this one finds them already in the right order.

### `invocations_user_id_created_idx`

```sql
CREATE INDEX invocations_user_id_created_idx ON invocations (user_id, created_at);
```

The same shape for the dashboard's log page, which filters by owner and sorts
by time.

### `session_userId_idx` and `passkey_userId_idx` / `passkey_credentialID_idx`

Written by better-auth's own requirements, for session lookups during sign-in
and passkey verification.

### What is **not** indexed, and why that is fine

| Column | Query | Acceptable? |
|--------|-------|-------------|
| `worker_name` | `getLatestBuiltDeployment`, `isWorkerNameTaken` | Yes — it has a **unique constraint**, which PostgreSQL backs with an index automatically |
| `deployments.id` | `getDeploymentById` | Yes — it is the **primary key**, which is also indexed |
| `invocations.id` | The result update | Yes — primary key |
| `machines.machine_id` | `getMachineById` | Yes — primary key |
| `deployments.machine_id` | `listDeploymentsByMachine` | **No index.** It scans. Fine for tens of rows per node |
| `deployments.artifact_key` | Never queried | No index needed |
| `invocations.status` | Never filtered by status in SQL — filtering happens in the agent's window | No index needed |

If the node count grows a lot, `deployments.machine_id` is the first index to
add. `listDeploymentsByMachine` is the only query that would need it.

---

## 9. Writing a query

Three patterns, all used in the API.

### Read one row

```ts
import { db } from "@hypercore/db";
import { deployments } from "@hypercore/db/schema/deployments";
import { eq } from "drizzle-orm";

const [row] = await db
  .select()
  .from(deployments)
  .where(eq(deployments.id, deploymentId))
  .limit(1);
return row;   // may be undefined
```

Destructure the first element. It is `undefined` when nothing matched, and
callers handle that explicitly with a `404`.

### Read a list

```ts
return db
  .select()
  .from(deployments)
  .where(eq(deployments.userId, userId))
  .orderBy(desc(deployments.createdAt))
  .limit(safeLimit);
```

Clamp `safeLimit` in the **service**, not only the controller. A limit that
reaches the database unvalidated would let a caller ask for a million rows.

### Read one column only

```ts
const [row] = await db
  .select({ id: deployments.id })
  .from(deployments)
  .where(eq(deployments.workerName, workerName))
  .limit(1);
return row !== undefined;
```

When the answer is a yes or a no, fetch one column. This is `isWorkerNameTaken`,
and it is on a hot path — the dashboard calls it while the user types.

### Write

```ts
await db
  .update(deployments)
  .set({ status: "built", artifactKey })
  .where(eq(deployments.id, deploymentId));
```

`updatedAt` refreshes automatically through the schema's `$onUpdate`.

### Insert and read back

```ts
const [row] = await db
  .insert(deployments)
  .values({ /* … */ })
  .returning();
```

`returning()` gives the complete row including the defaulted timestamps, so
there is no second query.

### Handle a duplicate

```ts
try {
  await db.insert(deployments).values({ /* … */ });
} catch (error) {
  if (isUniqueViolation(error)) throw new WorkerNameTakenError(workerName);
  throw error;
}
```

`isUniqueViolation` checks for Postgres code `23505` and for the words
`"duplicate key"` and `"unique constraint"`, walking up to four `.cause` levels
because Drizzle wraps driver errors.

---

## Next

- The journeys these tables record:
  [05 - End-to-End Flows](./05-end-to-end-flows.md)
- Environment variables and migrations:
  [06 - Setup and Runbook](./06-setup-and-runbook.md)
