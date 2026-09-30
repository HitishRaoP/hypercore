# 07 - Dashboard and Shared Packages

The parts of Hypercore that are neither the API nor the agent, at architecture
level.

This document is intentionally shorter than
[02 - API Reference](./02-api-reference.md) and
[03 - Agent Reference](./03-agent-reference.md). It explains what each piece is
for, how it connects, and where to look — enough to navigate and change
things, without repeating every component's props.

---

## Contents

1. [The dashboard](#1-the-dashboard)
2. [How the three apps fit together](#2-how-the-three-apps-fit-together)
3. [The shared packages](#3-the-shared-packages)
4. [Configuration packages](#4-configuration-packages)
5. [A file map](#5-a-file-map)

---

## 1. The dashboard

**Where the code is:** `apps/dashboard`
**What it is:** Next.js 16.3.0 with the App Router, React 19, Tailwind CSS 4
**Runs on:** `http://localhost:3000` (the port is pinned in the `dev` script)

The dashboard is where a person writes TypeScript, picks a target node, and
watches their functions run. It is a **pure client** — it holds no database
connection and no storage credentials. Everything goes through the API.

### The route structure

Next.js App Router, using route groups. The parentheses in `(auth)` and
`(protected)` organise files **without** affecting the URL.

```text
app/
├── layout.tsx                      Root layout: fonts, providers
├── page.tsx                        Landing page
├── (auth)/                         Sign in, sign up, password reset
│   ├── sign-in/page.tsx
│   ├── sign-up/page.tsx
│   ├── forgot-password/page.tsx
│   └── reset-password/page.tsx
├── (protected)/                    Needs a session
│   ├── (sidebar)/
│   │   ├── layout.tsx              Wraps children in ProtectedShell
│   │   ├── page.tsx                Home / console overview
│   │   ├── deployments/
│   │   │   ├── page.tsx            The deployments list
│   │   │   └── [deploymentId]/page.tsx   One deployment
│   │   ├── logs/page.tsx           The call history
│   │   ├── machines/page.tsx       Every registered node
│   │   └── settings/page.tsx
│   └── (grid)/
│       ├── layout.tsx              The full-width editor layout
│       └── create/
│           ├── page.tsx            Write, upload, deploy
├── (public)/
│   └── download/page.tsx           Agent downloads, read from GitHub releases
```

| Group | What it holds |
|-------|--------------|
| `(auth)` | Unauthenticated screens. No session needed |
| `(protected)/(sidebar)` | The console. Wrapped in `ProtectedShell` |
| `(protected)/(grid)` | The editor and deploy flow, full width, no sidebar |
| `(public)` | Genuinely public pages |

### The feature module pattern

Next to `app/`, there is a `modules/` folder. Each feature gets its own folder
holding its views and components, so a feature can be understood in one place
rather than scattered across `app/`.

| Module | What it does |
|--------|--------------|
| `auth/` | Sign in, sign up, forgot and reset password views |
| `create/` | The whole deploy flow — editor, upload, node picker, success card |
| `deployments/` | The list and the detail panel |
| `logs/` | The call history and its detail panel |
| `download/` | The agent download page |
| `header/` | The top bar |
| `landing/` | The marketing page |

Inside `create/` the split is:

| File | Responsibility |
|------|----------------|
| `create-view.tsx` | The page's state and layout |
| `create-layout.tsx` | The editor chrome |
| `components/code-editor.tsx` | The code editing surface |
| `components/upload-code.tsx` | The file list and upload |
| `components/target-node-select.tsx` | Picking the node |
| `components/worker-name-field.tsx` | The name, with live availability checking |
| `components/create-options.tsx` | Entrypoint and other options |
| `components/hw-template.tsx` | The starter template |
| `components/deploy-success.tsx` | The success card with both URLs |
| `lib/deploy.ts` | All the API calls and name generation |
| `passkey-gate.tsx` | The passkey check before deploying |

### The API calls

Two files hold every call to the API.

#### `lib/api.ts`

Three list functions and one private helper.

| Function | Calls | Returns |
|----------|-------|---------|
| `fetchNodes()` | `GET /api/v1/nodes` | `MachineNode[]` |
| `fetchMyDeployments()` | `GET /deployment` | `Deployment[]` |
| `fetchMyInvocations()` | `GET /invocations` | `Invocation[]` |

The shared helper is:

```ts
async function getJson<T>(url: string): Promise<T | null>
```

`fetch` with `cache: "no-store"` and `credentials: "include"` — the second
option is what sends the session cookie. A non-OK status or any thrown error
returns `null` rather than propagating, and each caller substitutes an empty
array. **A dashboard page renders "no data" rather than crashing** when the API
is down.

The three list functions mirror the API's three "list" endpoints, and the
interfaces in this file are the TypeScript twins of the server's DTOs.

#### `modules/create/lib/deploy.ts`

Everything the deploy flow needs.

| Function | What it does |
|----------|--------------|
| `helloWorldFiles(indexTsContent?)` | Builds the three starter `File` objects |
| `fetchOnlineAgents()` | `GET /agents/online` — the live online list |
| `fetchNodes()` | `GET /api/v1/nodes` — the full registry |
| `generateWorkerSlug()` | A random name like `brave-fox-3588` |
| `generateAvailableWorkerSlug(attempts = 8)` | Generates and checks until one is free |
| `checkWorkerNameTaken(name)` | `GET /code-upload/check-name` |

`checkWorkerNameTaken` returns three values, not two:

| Return | Meaning |
|--------|---------|
| `true` | Taken |
| `false` | Free |
| `null` | **The API could not be reached** |

`null` is a distinct third state because it is not the same as "free". The
caller cannot tell the user the name is available when it does not know, so it
lets the attempt through and the server validates again on upload. The
function's own comment says the server will still validate.

`generateAvailableWorkerSlug` tries up to eight times and returns the first
free name — **or the last one tried if every check failed**, so a network
problem never blocks the user.

The three starter-file constants are a duplicate of the API's `HELLO_WORLD`.
They are kept here so the editor can show the source as text and let a person
edit it before uploading, while the API's copy serves `curl` users. The two are
expected to stay in step.

### Authentication

#### `lib/auth-client.ts`

```ts
export const authClient = createAuthClient({
  baseURL: env.API_URL,
  plugins: [passkeyClient()],
});
export const { useSession, signIn, signUp, signOut } = authClient;
```

A better-auth React client pointed at the API, with the passkey plugin. The
four hooks are re-exported so components import them from one place.

The dashboard never talks to the auth tables directly. better-auth's client
calls `/api/auth/*` on the API, and the session cookie is what identifies the
user on every other call.

### Environment

#### `lib/env.ts`

```ts
const API_URL = raw.NEXT_PUBLIC_API_URL ?? raw.BACKEND_SERVER_URL ?? "http://localhost:8080";
```

Three sources, in order: the public variable, the server variable, then
localhost. Both are optional, so the dashboard starts with nothing configured
and still points somewhere sensible.

| Exported | Used by |
|----------|---------|
| `env.API_URL` | The browser |
| `env.BACKEND_SERVER_URL` | Server-side code |

The split exists because a `NEXT_PUBLIC_` variable is visible to the browser
while a plain one is not.

### `ProtectedShell`

`components/protected-shell.tsx` wraps every protected page in the sidebar
chrome and derives a page title from the URL:

| Path starts with | Title |
|------------------|-------|
| `/deployments/` | Deployment Details |
| `/deployments` | Deployments |
| `/machines` | Machines |
| `/logs` | Logs |
| `/create` | Create |
| `/settings` | Settings |
| anything else | Console |

The deployment-detail check comes **first** and uses `startsWith("/deployments/")`
with a trailing slash, so a detail page does not show the generic
"Deployments" title.

Note that this component does not itself verify the session — the session check
happens server-side in the `(protected)` layout, and the shell only handles
presentation.

### Other pieces

| Path | What it does |
|------|--------------|
| `components/dashboard-sidebar.tsx` | The navigation |
| `lib/format.ts` | Display formatting helpers |
| `hooks/use-media-query.ts` | Responsive layout, the same hook as the agent's |
| `modules/header/header-view.tsx` | The top bar |
| `modules/download/download-view.tsx` | Reads the GitHub release for agent downloads |
| `next.config.ts` | Next.js configuration. One line: `transpilePackages` |

### The dependencies that shape the UI

| Package | What it drives |
|---------|----------------|
| `@monaco-editor/react` | The code editor in `create/`. A full IDE component, embedded in the page |
| `@tanstack/react-form` | Form state and validation in the deploy flow |
| `unique-names-generator` | `generateWorkerSlug` — the adjective-animal-number names |
| `axios` | Available for calls that need more than a plain GET |
| `@better-auth/passkey` | Passkey sign-in, mirroring the server's plugin |
| `lucide-react` | Icons, the same set the agent uses |

The workspace is named `@hypercore/web`, not `@hypercore/dashboard`.

---

## 2. How the three apps fit together

```text
                       ┌──────────────────────────┐
                       │      PostgreSQL          │
                       │  (via @hypercore/db)     │
                       └───────────▲──────────────┘
                                   │
┌─────────────┐   HTTP    ┌────────┴────────┐
│  DASHBOARD  │──────────▶│      API       │
│  :3000      │◀──────────│      :8080     │──▶ Cloudflare R2
└─────────────┘           └────────▲────────┘
                                   │ SSE (long-lived)
                          ┌────────┴────────┐
                          │     AGENT       │
                          │  on any computer│
                          └─────────────────┘
```

| From | To | How | Carries |
|------|----|-----|---------|
| Dashboard | API | HTTP, with a session cookie | Uploads, deploys, listings |
| Agent | API | HTTP | Registration, artifacts, results |
| API | Agent | **SSE down an open stream** | Deployment and invoke events |
| API | PostgreSQL | Drizzle | Everything durable |
| API | R2 | The S3 SDK | Source files and artifacts |
| Agent | R2 | **never** | — the API proxies every file |

**The agent and the dashboard never talk to each other.** They only share the
API, and only the API has storage credentials or a database connection.

### The three audiences

| App | Identified by | Reaches |
|-----|---------------|---------|
| Dashboard | A session cookie, checked by `requireUser` | Only the signed-in user's data |
| Agent | Its `machineId` | Its own registrations, artifacts and results |
| Anyone | Nothing | `/invoke/*` and `/w/*`, by design |

### Where the shared contracts live

The same shape appears in three or four places. This is the thing to watch
when changing a payload.

| Shape | Server | Agent Rust | Agent window | Dashboard |
|-------|--------|-----------|--------------|-----------|
| Machine info | `machinePayloadSchema`, `MachineDto` | `MachineInfo` | `MachineInfo` | `MachineNode` |
| Registration reply | `RegistrationResult` | `RegistrationResponse` | `RegistrationResponse` | — |
| Deployment event | `DeploymentPayload` | `DeploymentRequest` | — | — |
| Invoke event | `InvokeDispatch` | `InvokeRequest` | — | — |
| Invoke result | `AgentInvokeResult` | built in `handle_invoke` | `ActivityInvocation` | `Invocation` |
| Activity feed | `ActivityResult` | — | `ActivityResponse` | — |
| Deployment | `DeploymentDto` | — | `ActivityDeployment` | `Deployment` |

Nothing enforces that these stay in step at compile time across the Rust
boundary, so a change to any payload needs a deliberate pass over all of them.

---

## 3. The shared packages

Five packages, each with one job.

### `@hypercore/db` — the database

**Where:** `packages/db`
**What it exports:** `db`, and the schema files

| File | What it holds |
|------|---------------|
| `src/db.ts` | The shared Drizzle client |
| `src/lib/env.ts` | Validates `DATABASE_URL` |
| `src/schema/auth.ts` | user, session, account, verification, passkey |
| `src/schema/machines.ts` | `machines` |
| `src/schema/deployments.ts` | `deployments` |
| `src/schema/invocations.ts` | `invocations` |
| `drizzle.config.ts` | Migration configuration |

Each schema file exports the table, a `…Row` type for reads, and a
`New…Row` type for writes — all inferred from the table, so nothing is written
by hand and the types cannot drift.

Full detail: [04 - Data Model](./04-data-model.md).

### `@hypercore/auth` — sign-in

**Where:** `packages/auth`
**What it exports:** `auth`, the configured better-auth instance

```ts
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  trustedOrigins: [env.DASHBOARD_URL],
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    sendResetPassword: async ({ user, url, token }) => { /* emails a link */ },
    onPasswordReset: async ({ user }) => { /* emails a confirmation */ },
  },
  plugins: [passkey()],
});
```

| Setting | Why |
|---------|-----|
| `drizzleAdapter` with the same `db` | One connection pool, and the auth tables live beside the application tables |
| `trustedOrigins: [DASHBOARD_URL]` | Only the dashboard may make auth requests |
| `autoSignIn: true` | No separate "please sign in" step after registering |
| `sendResetPassword` | Builds a link to `<DASHBOARD_URL>/reset-password?token=…` and emails it |
| `passkey()` | Enables passkey sign-in |

The API hosts this at `/api/auth/*` with `toNodeHandler(auth)`, so the auth
logic lives in the package and the API only provides the endpoint.

**Three details worth knowing.**

| Detail | Why it matters |
|--------|----------------|
| The email subjects say **"Cursent"**, not Hypercore | A leftover from an earlier product name. Worth fixing before launch |
| Both mail sends are `void`-ed | A mail failure never fails the auth request. A user would rather have a working account and no email than a failed sign-up |
| `auth:generate` regenerates the schema | `bun run auth:generate` overwrites `packages/db/src/schema/auth.ts` from better-auth's own definition. Do not hand-edit that file — regenerate it |

### `@hypercore/transactional` — email

**Where:** `packages/transactional`
**What it exports:** `sendMail`, and two React email templates

| File | What it is |
|------|------------|
| `src/send-mail.ts` | `sendMail(email, subject, react)` — sends a React component as the body |
| `src/lib/env.ts` | `RESEND_API_KEY`, `FROM_EMAIL` and `DASHBOARD_URL` |
| `emails/forgot-password.tsx` | The password-reset email |
| `emails/reset-password.tsx` | The "your password changed" email |

`sendMail` takes a **React element** as the body rather than an HTML string:

```ts
export const sendMail = async (email, subject, react: React.ReactNode) => {
  await resend.emails.send({ from: env.FROM_EMAIL, to: email, subject, react });
};
```

Templates are real components, so they get normal tooling, can share layout
pieces, and are type-checked. Delivery is through **Resend**.

There is deliberately **no `import 'dotenv/config'`** in this package. The
comment at the top of `src/lib/env.ts` explains why: the package is bundled to
ESM for Node consumers, and dotenv's CommonJS `require('fs')` cannot survive
that transform. Loading `.env` is the application's job, and `apps/api/src/app.ts`
does it on its first line.

### `@hypercore/ui` — shared components

**Where:** `packages/ui`
**What it is:** 21 components, one hook and one utility, on Tailwind 4 and Radix

| Category | Components |
|----------|-----------|
| Layout | `sidebar`, `sheet`, `separator`, `collapsible` |
| Forms | `button`, `input`, `label`, `field`, `checkbox`, `switch`, `select` |
| Display | `card`, `badge`, `avatar`, `table`, `skeleton`, `spinner`, `breadcrumb` |
| Overlays | `dropdown-menu`, `tooltip` |
| Utility | `lib/utils.ts` — the `cn()` class-name helper |
| Hook | `hooks/use-mobile.ts` |

Both apps import from here, which is why the dashboard and the agent look like
the same product.

**It is consumed as source, not as a build.** The package's `exports` map points
straight at the `.tsx` files, and both consuming apps list it in
`transpilePackages` (Next.js) or let Vite process it. That is why there is no
`build` script and why the dashboard's `next.config.ts` contains exactly one
line:

```ts
const nextConfig = { transpilePackages: ["@hypercore/ui"] };
```

| Export path | Resolves to |
|-------------|-------------|
| `@hypercore/ui/components/*` | `src/components/*.tsx` |
| `@hypercore/ui/hooks/*` | `src/hooks/*.ts` |
| `@hypercore/ui/lib/*` | `src/lib/*.ts` |
| `@hypercore/ui/styles/*` and `/globals.css` | The stylesheet entry points |
| `@hypercore/ui/postcss.config` | The PostCSS config |

`generate:component` scaffolds a new component through Turborepo's generator,
so a new one follows the same conventions automatically.

---

## 4. Configuration packages

Two packages that contain no runtime code.

### `@hypercore/typescript-config`

Three presets, extended by the workspaces:

| File | For |
|------|-----|
| `base.json` | Everything else. Strict mode, sensible defaults |
| `nextjs.json` | Next.js projects. Adds the Next.js plugin and JSX settings |
| `react-library.tsx` | React component libraries like `@hypercore/ui` |

TypeScript is pinned to exactly `5.9.2` in the root `package.json`. Pinning
rather than using a range means every developer and every CI run compiles
against the same compiler.

### `@repo/eslint-config`

Shared lint rules. Note the package is named `@repo/eslint-config`, not
`@hypercore/…` like the others — the workspaces import it under that name.

| Export | For |
|--------|-----|
| `@repo/eslint-config/base` | Plain TypeScript projects |
| `@repo/eslint-config/next-js` | Next.js projects. Adds the Next.js plugin |
| `@repo/eslint-config/react-internal` | React component packages like `@hypercore/ui` |

Notable plugins: `typescript-eslint`, `eslint-plugin-react`,
`eslint-plugin-react-hooks`, `eslint-plugin-turbo`, and
`eslint-plugin-only-warn` — which turns every rule into a **warning** rather
than an error, so `--max-warnings 0` still fails the build.

---

## 5. A file map

Everything, by workspace, for quick reference.

```text
apps/
├── dashboard/                    Next.js web app
│   ├── app/
│   │   ├── layout.tsx            Root layout
│   │   ├── page.tsx              Landing page
│   │   ├── (auth)/               sign-in, sign-up, forgot, reset
│   │   ├── (protected)/
│   │   │   ├── (sidebar)/        layout, home, deployments, logs, machines, settings
│   │   │   └── (grid)/           layout, create
│   │   └── (public)/download/    Agent downloads
│   ├── components/               dashboard-sidebar, protected-shell
│   ├── hooks/                    use-media-query
│   ├── lib/                      api, auth-client, env, format
│   ├── modules/                  auth, create, deployments, logs, download, header, landing
│   ├── next.config.ts
│   └── package.json
│
├── api/                          Express server       → see document 02
│   └── src/
│       ├── index.ts              Boot
│       ├── app.ts                Wiring, in order
│       ├── lib/                  env, s3, urls, auth, errors, scheduler
│       ├── routers/              7 files
│       ├── controllers/          7 files
│       └── services/             5 files
│
└── agent/                        Tauri app           → see document 03
    ├── src/
    │   ├── main.tsx, App.tsx
    │   ├── components/           app-sidebar, MachineDetailsCard, RegistrationForm, titlebar
    │   ├── pages/                machine, logs, log-detail-panel, deployments, insights, settings
    │   ├── hooks/                use-activity, use-updater, use-media-query
    │   ├── lib/activity.ts       6 formatting helpers
    │   └── types/index.ts        10 shared shapes
    ├── src-tauri/
    │   ├── src/                  main, lib, sse, executor, tools, machine_info
    │   ├── tauri.conf.json
    │   ├── capabilities/default.json
    │   └── Cargo.toml
    └── scripts/                  fetch-tools, sync-agent-version

packages/
├── db/                           Connection + 5 schema files
├── auth/                         better-auth setup
├── transactional/                send-mail + 2 email templates
├── ui/                           21 components + use-mobile + cn()
├── typescript-config/            base, nextjs, react-library
└── eslint-config/                Shared rules
```

---

## Where to go next

| You want to | Read |
|-------------|------|
| The whole system in one page | [00 - Overview](./00-overview.md) |
| How the pieces connect and why | [01 - Architecture](./01-architecture.md) |
| Every server function | [02 - API Reference](./02-api-reference.md) |
| Every agent function | [03 - Agent Reference](./03-agent-reference.md) |
| The tables and columns | [04 - Data Model](./04-data-model.md) |
| A specific journey, including failures | [05 - End-to-End Flows](./05-end-to-end-flows.md) |
| Running it locally | [06 - Setup and Runbook](./06-setup-and-runbook.md) |
| Back to the start | [INDEX](./INDEX.md) |
