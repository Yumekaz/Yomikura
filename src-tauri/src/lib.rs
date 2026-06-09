use tauri::Manager;

#[tauri::command]
fn wipe_all_data(app_handle: tauri::AppHandle) -> Result<(), String> {
    let config_dir = app_handle.path().app_config_dir().map_err(|e| e.to_string())?;
    let data_dir = app_handle.path().app_local_data_dir().map_err(|e| e.to_string())?;

    if config_dir.exists() {
        std::fs::remove_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }
    if data_dir.exists() {
        std::fs::remove_dir_all(&data_dir).map_err(|e| e.to_string())?;
    }

    app_handle.restart();
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![wipe_all_data])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
