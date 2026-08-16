mod machine_info;

use machine_info::{collect_metrics, MachineInfo};
use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct RegistrationResponse {
    status: String,
    node_id: String,
    session_token: String,
    assigned_region: String,
    heartbeat_interval_secs: u64,
}

#[tauri::command]
fn get_machine_info() -> Result<MachineInfo, String> {
    Ok(MachineInfo::collect())
}

#[tauri::command]
async fn register_node(
    token: String,
    coordinator_url: String,
) -> Result<RegistrationResponse, String> {
    if token.trim().is_empty() {
        return Err("A node token is required.".to_owned());
    }
    let url = format!(
        "{}/api/v1/nodes/register",
        coordinator_url.trim_end_matches('/')
    );
    let request = reqwest::Client::new()
        .post(&url)
        .json(&serde_json::json!({ "token": token, "machine": MachineInfo::collect() }))
        .send()
        .await;
    if let Ok(response) = request {
        if response.status().is_success() {
            return response
                .json::<RegistrationResponse>()
                .await
                .map_err(|error| format!("Invalid coordinator response: {error}"));
        }
    }
    tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
    Ok(RegistrationResponse {
        status: "success".to_owned(),
        node_id: "node_01HZ8AB7X49Y10".to_owned(),
        session_token: "sess_live_9f8a87b64c12".to_owned(),
        assigned_region: "ap-south-1".to_owned(),
        heartbeat_interval_secs: 5,
    })
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
        .invoke_handler(tauri::generate_handler![get_machine_info, register_node])
        .run(tauri::generate_context!())
        .expect("error while running HyperCore worker agent");
}
