use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::path::BaseDirectory;
use tauri::{Manager, State};

struct BackendState {
    child: Mutex<Option<Child>>,
}

fn get_available_port(start_port: u16) -> u16 {
    let mut port = start_port;
    while port < 65535 {
        if std::net::TcpListener::bind(format!("127.0.0.1:{}", port)).is_ok() {
            return port;
        }
        port += 1;
    }
    start_port
}

#[tauri::command]
fn select_directory() -> Result<Option<String>, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let output = Command::new("powershell")
            .arg("-NoProfile")
            .arg("-Command")
            .arg("Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.ShowNewFolderButton = $true; if ($f.ShowDialog() -eq 'OK') { $f.SelectedPath }")
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output();

        match output {
            Ok(out) => {
                if out.status.success() {
                    let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if path.is_empty() {
                        Ok(None)
                    } else {
                        Ok(Some(path))
                    }
                } else {
                    Ok(None)
                }
            }
            Err(e) => Err(format!("Failed to open folder browser: {}", e)),
        }
    }

    #[cfg(target_os = "macos")]
    {
        let output = Command::new("osascript")
            .arg("-e")
            .arg("POSIX path of (choose folder with prompt \"Select Storage Folder\")")
            .output();

        match output {
            Ok(out) => {
                if out.status.success() {
                    let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if path.is_empty() {
                        Ok(None)
                    } else {
                        Ok(Some(path))
                    }
                } else {
                    Ok(None)
                }
            }
            Err(_) => Ok(None),
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(out) = Command::new("zenity")
            .arg("--file-selection")
            .arg("--directory")
            .arg("--title=Select Storage Folder")
            .output()
        {
            if out.status.success() {
                let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if !path.is_empty() {
                    return Ok(Some(path));
                }
            }
        }
        Ok(None)
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    Ok(None)
}

#[tauri::command]
fn check_java_installed() -> bool {
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let mut cmd = Command::new("java");
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    cmd.arg("-version");

    cmd.output().is_ok()
}

#[tauri::command]
fn start_backend(
    app_handle: tauri::AppHandle,
    state: State<'_, BackendState>,
    data_path: String,
) -> Result<u16, String> {
    let mut lock = state.child.lock().unwrap();
    if lock.is_some() {
        return Ok(4567);
    }

    let jar_path = app_handle
        .path()
        .resolve(
            "../suwayomi-server/Suwayomi-Server-v2.2.2100.jar",
            BaseDirectory::Resource,
        )
        .map_err(|e| format!("Failed to resolve server JAR resource: {}", e))?;

    if !jar_path.exists() {
        return Err("Bundled Suwayomi JAR file not found in resources.".to_string());
    }

    let data_dir = std::path::PathBuf::from(&data_path);
    std::fs::create_dir_all(&data_dir).map_err(|e| format!("Failed to create data directory: {}", e))?;

    let port = get_available_port(4567);

    let log_path = data_dir.join("suwayomi.log");
    let log_file = std::fs::File::create(&log_path)
        .map_err(|e| format!("Failed to create log file: {}", e))?;

    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let mut cmd = Command::new("java");
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    cmd.arg("-Djavax.net.ssl.trustStore=NONE")
        .arg("-Djavax.net.ssl.trustStoreType=Windows-ROOT")
        .arg(format!("-Dsuwayomi.tachidesk.config.server.rootDir={}", data_dir.to_string_lossy()))
        .arg(format!("-Dsuwayomi.tachidesk.config.server.port={}", port))
        .arg("-jar")
        .arg(jar_path)
        .stdout(std::process::Stdio::from(log_file.try_clone().unwrap()))
        .stderr(std::process::Stdio::from(log_file));

    match cmd.spawn() {
        Ok(child) => {
            *lock = Some(child);
            Ok(port)
        }
        Err(e) => Err(format!("Failed to start Suwayomi process: {}", e)),
    }
}

#[tauri::command]
fn stop_backend(state: State<'_, BackendState>) -> Result<(), String> {
    let mut lock = state.child.lock().unwrap();
    if let Some(mut child) = lock.take() {
        child.kill().map_err(|e| format!("Failed to kill backend process: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn get_backend_status(state: State<'_, BackendState>) -> String {
    let mut lock = state.child.lock().unwrap();
    if let Some(ref mut child) = *lock {
        match child.try_wait() {
            Ok(None) => "running".to_string(),
            Ok(Some(status)) => {
                *lock = None;
                format!("exited: {}", status)
            }
            Err(_) => {
                *lock = None;
                "error".to_string()
            }
        }
    } else {
        "stopped".to_string()
    }
}

#[tauri::command]
fn wipe_all_data(app_handle: tauri::AppHandle, state: State<'_, BackendState>) -> Result<(), String> {
    let mut lock = state.child.lock().unwrap();
    if let Some(mut child) = lock.take() {
        let _ = child.kill();
        std::thread::sleep(std::time::Duration::from_millis(500));
    }

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
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .manage(BackendState {
            child: Mutex::new(Option::None),
        })
        .invoke_handler(tauri::generate_handler![
            wipe_all_data,
            select_directory,
            check_java_installed,
            start_backend,
            stop_backend,
            get_backend_status
        ])
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
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            let state: State<'_, BackendState> = app_handle.state();
            let mut lock = state.child.lock().unwrap();
            if let Some(mut child) = lock.take() {
                let _ = child.kill();
            }
        }
    });
}
