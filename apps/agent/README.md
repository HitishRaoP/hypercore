# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Build toolchain (esbuild + javy, bundled)

Deployments compile on the node: `index.ts → esbuild → bundle.js → javy → worker.wasm`
(`apps/agent/src-tauri/src/sse.rs`). Both helpers ship **inside the installer**
via `src-tauri/tauri.conf.json > bundle.resources` (`resources/tools/`).

Pinned versions: javy `9.1.0` (bytecodealliance/javy releases), esbuild `0.28.2`
(`@esbuild/<platform>` npm tarball). See `scripts/fetch-tools.mjs`.

```sh
cd apps/agent
bun run fetch:tools          # download native binaries for this machine
bun run fetch:tools:check    # verify only (CI gate)
bun run build:installer      # fetch + tauri build (ships the tools)
```

At runtime the agent resolves helpers in order: `<resource_dir>/tools` →
exe-adjacent → dev checkout (`src-tauri/resources/tools`) → `PATH`
(`src-tauri/src/tools.rs`). The UI shows status via the
`get_toolchain_status` command. Binaries are git-ignored; each per-OS
release job runs `fetch:tools` on its own runner before `tauri build`.

## Function execution (on this node)

URL hits arrive as SSE `invoke` events; the agent runs the deployment's
`worker.wasm` locally with the `wasmtime` crate (`src/executor.rs`, WASI
preview1) and POSTs the result to `/invocations/:id/result`. Timeouts use
epoch interruption (wall clock) plus a fuel backstop; stdout is capped at
4MB. `cargo test --lib executor` covers this end-to-end using the fetched
javy (skips gracefully when the toolchain isn't fetched).

## Releasing the agent

Installers are built and published automatically by
`.github/workflows/release.yml`:

```sh
cd apps/agent
bun ./scripts/sync-agent-version.mjs 0.2.0  # sync package.json, tauri.conf.json, Cargo.toml
git add -A && git commit -m "chore: release agent v0.2.0"
git tag v0.2.0 && git push origin v0.2.0
```

Pushing the `v*` tag builds the Windows agent installer and attaches it to
the GitHub Release. You can also trigger the
workflow manually from the Actions tab with a version input (it creates and
pushes the tag for you). The dashboard download page
(`apps/dashboard/app/download`) reads that release to offer per-OS downloads.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
