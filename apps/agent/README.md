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

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
