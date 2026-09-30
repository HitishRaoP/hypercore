# Hypercore Documentation

Welcome. This folder explains how the whole Hypercore system is built and how
every single function works.

**Who this is for:** anyone who joins the team — new engineers, reviewers,
people onboarding a customer, or a curious person who wants to understand the
product end to end.

**How to read it:** start at [00 - Overview](./00-overview.md), then
[01 - Architecture](./01-architecture.md). After that, jump to whichever app
you are working on. Every document is written in plain language, and every
function lists where it lives, what it does, and who calls it.

---

## The documents

| # | Document | What you will learn | Read it when |
|---|----------|---------------------|-------------|
| 00 | [Overview](./00-overview.md) | What Hypercore is, in plain words. The three planes and the one big idea. | First day. Start here. |
| 01 | [Architecture](./01-architecture.md) | How the pieces connect. The request journey, the data stores, the design decisions and why they were made. | Before changing anything. |
| 02 | [API Reference](./02-api-reference.md) | Every HTTP route and every function in `apps/api`, explained line by line. | Working on the server. |
| 03 | [Agent Reference](./03-agent-reference.md) | Every function in `apps/agent` — the Rust backend and the React window. | Working on the node agent. |
| 04 | [Data Model](./04-data-model.md) | Every database table, every column, every stored file, and every status value. | Writing queries or migrations. |
| 05 | [End-to-End Flows](./05-end-to-end-flows.md) | The five real journeys through the system, step by step, with who calls whom. | Debugging a failed run. |
| 06 | [Setup and Runbook](./06-setup-and-runbook.md) | How to run everything locally, every environment variable, and how to fix common problems. | Setting up or fixing. |
| 07 | [Dashboard and Packages](./07-dashboard-and-shared-packages.md) | The web dashboard and the five shared packages, summarised. | Working outside the API or agent. |

---

## The repository at a glance

```text
hypercore/
├── apps/
│   ├── dashboard/      Next.js web app — where people write and manage functions
│   ├── api/            Express server — the control plane and message plane
│   └── agent/          Tauri desktop app — runs on a customer's computer
│
├── packages/
│   ├── db/             Database connection + table definitions (Drizzle)
│   ├── auth/           Sign-in, sessions, passkeys (better-auth)
│   ├── transactional/  Email templates and mail sending
│   ├── ui/             Shared React components
│   ├── typescript-config/  Shared TypeScript settings
│   └── eslint-config/  Shared linting rules
│
└── turbo.json          Build tool that runs tasks across all workspaces
```

---

## The one-paragraph summary

Hypercore lets people run TypeScript functions on ordinary computers instead
of on a cloud server. A person writes a function in a web dashboard, picks a
computer to run it on, and clicks deploy. The server saves the code, tells the
chosen computer about the job over a live connection, and that computer turns
the code into WebAssembly and keeps it on disk. Later, anyone can call the
function through a normal web address. The server forwards the call to that
same computer, the computer runs the function, and the answer travels back to
the caller. The server never runs user code — only the nodes do.

---

## Conventions used in these documents

- **Plain words first.** A technical term is only used after it has been
  explained once.
- **Every function has a home.** The path is always given as
  `file/path.ts` and the function name, so you can jump straight to it.
- **Plain-text diagrams.** No special tooling needed to read them.
- **Honest about limits.** Where the code has sharp edges or known trade-offs,
  the document says so.

---

## Quick links

- The original product overview written by the team: [`../README.md`](../README.md)
- Agent build, signing and release notes: [`../apps/agent/README.md`](../apps/agent/README.md)
- Package manager and build commands: [`../package.json`](../package.json)
- Agent build toolchain notes: [`../apps/agent/README.md`](../apps/agent/README.md)
