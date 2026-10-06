//! Function execution: run a deployment's wasm artifact locally with wasmtime.
//!
//! The server forwards URL hits to this agent over SSE (`event: invoke`);
//! the wasm (built earlier by the deploy pipeline, or re-downloaded from R2
//! via the coordinator) runs here on the node — never on the server.

use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::Duration;
use wasmtime::{Config, Engine, Linker, Module, Store};
use wasmtime_wasi::pipe::{MemoryInputPipe, MemoryOutputPipe};
use wasmtime_wasi::preview1::{self, WasiP1Ctx};
use wasmtime_wasi::{I32Exit, WasiCtxBuilder};

/// Upper bound on captured stdout (HTTP bodies shouldn't be unbounded).
pub const MAX_STDOUT_BYTES: usize = 4_000_000;
/// Fuel backstop against runaway compute (wall-clock epoch is the primary guard).
const FUEL: u64 = 2_000_000_000;
/// Bare wasm header with no exports. Older agent builds uploaded this as
/// `worker.wasm` when javy was unavailable at deploy time; it compiles but
/// has no `_start`. Detect it exactly so invocations fail with an actionable
/// message instead of `missing _start`.
const PLACEHOLDER_WASM: [u8; 8] = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];

pub struct ExecInput {
    pub wasm: Vec<u8>,
    pub stdin: Vec<u8>,
    pub env: Vec<(String, String)>,
    pub timeout_ms: u64,
}

pub struct ExecOutput {
    pub code: i32,
    pub stdout: Vec<u8>,
    pub stderr: String,
}

#[derive(Debug)]
pub enum ExecError {
    TimedOut,
    FuelExhausted,
    Failed(String),
}

/// One process-wide engine; compiling is per-module below.
static ENGINE: LazyLock<Engine> = LazyLock::new(|| {
    let mut config = Config::new();
    config.consume_fuel(true);
    config.epoch_interruption(true);
    Engine::new(&config).expect("wasmtime engine")
});

struct CachedModule {
    wasm_len: usize,
    module: Module,
}

/// Content-addressed compile cache: a fresh `Engine` + Cranelift compile per
/// hit cost ~18s for Javy/QuickJS artifacts (past the server's wait window,
/// so every invoke 504'd while the agent later reported done). Hits skip it.
static MODULE_CACHE: LazyLock<Mutex<HashMap<u64, CachedModule>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// Bound RSS on nodes serving many workers; eviction is a whole-cache clear
/// (next hit for each worker recompiles once).
const MAX_CACHED_MODULES: usize = 128;

fn wasm_hash(bytes: &[u8]) -> u64 {
    let mut hasher = DefaultHasher::new();
    bytes.hash(&mut hasher);
    hasher.finish()
}

/// Compile `wasm` into the shared cache without running it. Best-effort:
/// pre-warms after deploy and at startup so the first invoke stays fast.
pub fn precache(wasm: Vec<u8>) {
    if wasm == PLACEHOLDER_WASM {
        return;
    }
    match compiled_module(&wasm) {
        Ok(_) => println!("warmed module cache ({} bytes)", wasm.len()),
        Err(error) => eprintln!("cache warm failed: {error}"),
    }
}

/// Return the cached module for these exact bytes, compiling on miss.
/// The lock is held across the compile on purpose: concurrent misses for the
/// same bytes serialize (single-flight) instead of running two Cranelift
/// compiles in parallel and slowing each other down. Hits hold it for µs.
fn compiled_module(wasm: &[u8]) -> Result<Module, ExecError> {
    let hash = wasm_hash(wasm);
    let mut cache = MODULE_CACHE
        .lock()
        .map_err(|error| ExecError::Failed(format!("cache lock: {error}")))?;
    if let Some(hit) = cache.get(&hash) {
        if hit.wasm_len == wasm.len() {
            return Ok(hit.module.clone());
        }
    }
    let started = std::time::Instant::now();
    let module =
        Module::new(&*ENGINE, wasm).map_err(|e| ExecError::Failed(format!("compile: {e}")))?;
    println!(
        "compiled wasm ({} bytes) in {}ms",
        wasm.len(),
        started.elapsed().as_millis()
    );
    if cache.len() >= MAX_CACHED_MODULES {
        cache.clear();
    }
    cache.insert(
        hash,
        CachedModule {
            wasm_len: wasm.len(),
            module: module.clone(),
        },
    );
    Ok(module)
}

impl std::fmt::Display for ExecError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ExecError::TimedOut => write!(f, "function timed out"),
            ExecError::FuelExhausted => write!(f, "function exhausted its fuel (possible infinite loop)"),
            ExecError::Failed(msg) => write!(f, "{msg}"),
        }
    }
}

/// Execute one invocation synchronously. Call from `spawn_blocking` — this
/// blocks the calling thread for the duration of the run.
pub fn execute(input: ExecInput) -> Result<ExecOutput, ExecError> {
    if input.wasm == PLACEHOLDER_WASM {
        return Err(ExecError::Failed(
            "artifact is an empty placeholder wasm (the build toolchain was unavailable when it was deployed); redeploy the function".to_owned(),
        ));
    }
    let engine: &Engine = &ENGINE;
    let module = compiled_module(&input.wasm)?;

    let mut linker: Linker<WasiP1Ctx> = Linker::new(engine);
    preview1::add_to_linker_sync(&mut linker, |t| t)
        .map_err(|e| ExecError::Failed(format!("link wasi: {e}")))?;

    let stdout_pipe = MemoryOutputPipe::new(MAX_STDOUT_BYTES);
    let stderr_pipe = MemoryOutputPipe::new(64 * 1024);
    let mut builder = WasiCtxBuilder::new();
    builder.stdin(MemoryInputPipe::new(input.stdin));
    builder.stdout(stdout_pipe.clone());
    builder.stderr(stderr_pipe.clone());
    for (key, value) in &input.env {
        builder.env(key, value);
    }
    let wasi_ctx = builder.build_p1();

    let mut store = Store::new(engine, wasi_ctx);
    store
        .set_fuel(FUEL)
        .map_err(|e| ExecError::Failed(format!("fuel: {e}")))?;
    store.set_epoch_deadline(1);

    // Wall-clock timeout: bump the epoch past the deadline from a helper thread.
    let expired = Arc::new(AtomicBool::new(false));
    {
        let engine_clone = engine.clone();
        let expired_clone = expired.clone();
        let timeout = Duration::from_millis(input.timeout_ms.max(1));
        std::thread::spawn(move || {
            std::thread::sleep(timeout);
            expired_clone.store(true, Ordering::SeqCst);
            engine_clone.increment_epoch();
        });
    }

    let instance = linker
        .instantiate(&mut store, &module)
        .map_err(|e| ExecError::Failed(format!("instantiate: {e}")))?;
    let func = instance
        .get_typed_func::<(), ()>(&mut store, "_start")
        .map_err(|e| ExecError::Failed(format!("missing _start: {e}")))?;
    let call_result = func.call(&mut store, ());

    drop(store);
    let stdout = stdout_pipe.contents().to_vec();
    let stderr = String::from_utf8_lossy(&stderr_pipe.contents()).into_owned();

    match call_result {
        Ok(()) => Ok(ExecOutput { code: 0, stdout, stderr }),
        Err(error) => {
            if let Some(exit) = error.downcast_ref::<I32Exit>() {
                return Ok(ExecOutput { code: exit.0, stdout, stderr });
            }
            if expired.load(Ordering::SeqCst) {
                return Err(ExecError::TimedOut);
            }
            let message = error.to_string();
            if message.contains("fuel") {
                return Err(ExecError::FuelExhausted);
            }
            Err(ExecError::Failed(format!("trap: {message}")))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// End-to-end: compile hello-world with the fetched javy and run it.
    /// Skips gracefully when the toolchain hasn't been fetched.
    #[test]
    fn runs_hello_world_wasm() {
        let tools = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/tools");
        let javy = tools.join(if cfg!(windows) { "javy.exe" } else { "javy" });
        if !javy.is_file() {
            eprintln!("SKIP: javy not fetched (run `bun run fetch:tools` in apps/agent)");
            return;
        }
        let dir = std::env::temp_dir().join(format!("hc-exec-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        // Plain `console.log` is valid JS — javy accepts it without esbuild.
        std::fs::write(dir.join("hello.js"), "console.log(\"Hello, World!\");\n").unwrap();
        let wasm_out = dir.join("hello.wasm");
        let build = std::process::Command::new(&javy)
            .args(["build"])
            .arg(dir.join("hello.js"))
            .args(["-o"])
            .arg(&wasm_out)
            .output()
            .unwrap();
        assert!(
            build.status.success(),
            "javy failed: {}",
            String::from_utf8_lossy(&build.stderr)
        );

        let wasm = std::fs::read(&wasm_out).unwrap();
        let output = execute(ExecInput {
            wasm,
            stdin: Vec::new(),
            env: vec![("HC_METHOD".to_owned(), "GET".to_owned())],
            timeout_ms: 15_000,
        })
        .expect("execute failed");

        assert_eq!(output.code, 0);
        assert_eq!(String::from_utf8_lossy(&output.stdout), "Hello, World!\n");
    }
}
