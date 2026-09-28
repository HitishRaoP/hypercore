mod machine_info;
mod sse;
mod tools;

use machine_info::{collect_metrics, MachineInfo};
use serde::{Deserialize, Serialize};
use sse::SseConfig;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager};
pub use tools::ToolchainStatus;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RegistrationResponse {
    status: String,
    node_id: String,
    session_token: String,
    assigned_region: String,
    heartbeat_interval_secs: u64,
}

/// Tracks the active SSE worker so re-registering swaps the stream
/// instead of leaking duplicate scheduler connections.
static SSE_WORKER: OnceLock<Mutex<Option<tauri::async_runtime::JoinHandle<()>>>> =
    OnceLock::new();

fn set_sse_worker(handle: tauri::async_runtime::JoinHandle<()>) {
    let slot = SSE_WORKER.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = slot.lock() {
        if let Some(previous) = guard.take() {
            previous.abort();
        }
        *guard = Some(handle);
    }
}

fn connect_to_scheduler(app: &tauri::AppHandle, coordinator_url: String, machine_id: String) {
    let config = SseConfig {
        coordinator_url,
        machine_id,
        tools_dir: bundled_tools_dir(app),
    };
    let handle = tauri::async_runtime::spawn(async move {
        sse::start_worker(config).await;
    });
    set_sse_worker(handle);
}

/// Where the bundled `esbuild`/`javy` helpers live in an installed app:
/// `<resource_dir>/tools` (see `bundle.resources` in tauri.conf.json).
/// `tools::resolve_tool` additionally probes the exe directory and `PATH`,
/// so dev (`tauri dev`) and bare-PATH setups keep working.
fn bundled_tools_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path()
        .resource_dir()
        .map(|dir| dir.join("tools"))
        .ok()
}

#[tauri::command]
fn get_toolchain_status(app: tauri::AppHandle) -> ToolchainStatus {
    tools::toolchain_status(bundled_tools_dir(&app).as_deref())
}

#[tauri::command]
fn get_machine_info() -> Result<MachineInfo, String> {
    Ok(MachineInfo::collect())
}

#[tauri::command]
async fn register_node(
    app: tauri::AppHandle,
    coordinator_url: String,
) -> Result<RegistrationResponse, String> {
    let coordinator_url = coordinator_url.trim().trim_end_matches('/').to_owned();
    if coordinator_url.is_empty() {
        return Err("A coordinator URL is required.".to_owned());
    }
    if reqwest::Url::parse(&coordinator_url).is_err() {
        return Err("That coordinator URL does not look valid.".to_owned());
    }

    let machine = MachineInfo::collect();
    let url = format!("{coordinator_url}/api/v1/nodes/register");

    // Best-effort coordinator registration; fall back to a local stub so
    // the UI still works against a coordinator that has no registry yet.
    let registration = match reqwest::Client::new()
        .post(&url)
        .json(&serde_json::json!({ "machine": machine }))
        .send()
        .await
    {
        Ok(response) if response.status().is_success() => response
            .json::<RegistrationResponse>()
            .await
            .map_err(|error| format!("Invalid coordinator response: {error}"))?,
        _ => RegistrationResponse {
            status: "success".to_owned(),
            node_id: format!("node_{}", &machine.machine_id[..8.min(machine.machine_id.len())]),
            session_token: "sess_local_stub".to_owned(),
            assigned_region: "local".to_owned(),
            heartbeat_interval_secs: 5,
        },
    };

    // The agent opens an outbound SSE stream to the scheduler.
    // No broker credentials are read, stored, or required.
    connect_to_scheduler(&app, coordinator_url, machine.machine_id);

    let _ = app.emit("node_registered", &registration);
    Ok(registration)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "Show HyperCore Worker", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "Hide window", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit HyperCore Worker", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hide, &quit])?;
            TrayIconBuilder::with_id("HyperCore-tray")
                .icon(
                    app.default_window_icon()
                        .ok_or("missing application icon")?
                        .clone(),
                )
                .tooltip("HyperCore Worker Node")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;
            let handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(2));
                loop {
                    interval.tick().await;
                    let _ = handle.emit("metrics_tick", collect_metrics());
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_machine_info,
            register_node,
            get_toolchain_status
        ])
        .run(tauri::generate_context!())
        .expect("error while running HyperCore worker agent");
}
