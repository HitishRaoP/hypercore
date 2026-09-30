<p align="center">
    <img src="https://github.com/HitishRaoP/hypercore/blob/main/apps/agent/src-tauri/icons/hypercore.png" height="96">

</p>

# Hypercore

Hypercore is a distributed runtime for executing **TypeScript functions** on available computers instead of relying entirely on centralized cloud compute.

The system separates function management, message routing, and function execution into three planes.

## Documentation

Full technical documentation lives in [`docs/`](./docs/INDEX.md):

| Document | Contents |
|----------|----------|
| [00 - Overview](./docs/00-overview.md) | What Hypercore is, the three planes, the function lifecycle, a glossary |
| [01 - Architecture](./docs/01-architecture.md) | How the pieces connect, the API's four layers, the SSE message plane, design decisions and trade-offs |
| [02 - API Reference](./docs/02-api-reference.md) | Every HTTP route and every function in `apps/api` |
| [03 - Agent Reference](./docs/03-agent-reference.md) | Every function in `apps/agent` — the Rust backend and the React window |
| [04 - Data Model](./docs/04-data-model.md) | Every table, column, index, stored file, and status value |
| [05 - End-to-End Flows](./docs/05-end-to-end-flows.md) | Six real journeys step by step, plus a failure catalogue and a debugging order |
| [06 - Setup and Runbook](./docs/06-setup-and-runbook.md) | Local setup, every environment variable, migrations, releasing the agent, troubleshooting |
| [07 - Dashboard and Packages](./docs/07-dashboard-and-shared-packages.md) | The dashboard and the five shared packages |
