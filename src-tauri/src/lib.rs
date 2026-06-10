use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::path::BaseDirectory;
use tauri::{Manager, State};
use tauri::menu::{MenuBuilder, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::WindowEvent;

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

fn find_java_binary(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    if !dir.exists() || !dir.is_dir() {
        return None;
    }
    
    let target_name = if cfg!(windows) { "java.exe" } else { "java" };

    let mut stack = vec![dir.to_path_buf()];
    while let Some(path) = stack.pop() {
        if let Ok(entries) = std::fs::read_dir(path) {
            for entry in entries.flatten() {
                let entry_path = entry.path();
                if entry_path.is_dir() {
                    stack.push(entry_path);
                } else if entry_path.is_file() {
                    if let Some(file_name) = entry_path.file_name() {
                        if file_name == target_name {
                            return Some(entry_path);
                        }
                    }
                }
            }
        }
    }
    None
}

#[tauri::command]
fn check_java_installed(data_path: Option<String>) -> bool {
    if let Some(path) = data_path {
        let data_dir = std::path::PathBuf::from(&path);
        let jre_dir = data_dir.join("jre");
        if let Some(java_bin) = find_java_binary(&jre_dir) {
            if java_bin.exists() {
                return true;
            }
        }
    }

    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let mut cmd = Command::new("java");
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    cmd.arg("-version");

    cmd.output().is_ok()
}

#[tauri::command]
fn download_and_install_jre(data_path: String) -> Result<(), String> {
    let os = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "mac"
    } else if cfg!(target_os = "linux") {
        "linux"
    } else {
        return Err("Unsupported OS".to_string());
    };

    let arch = if cfg!(target_arch = "x86_64") {
        "x64"
    } else if cfg!(target_arch = "aarch64") {
        "aarch64"
    } else {
        return Err("Unsupported architecture".to_string());
    };

    let url = format!(
        "https://api.adoptium.net/v3/binary/latest/17/ga/{}/{}/jre/hotspot/normal/eclipse",
        os, arch
    );

    let data_dir = std::path::PathBuf::from(&data_path);
    std::fs::create_dir_all(&data_dir).map_err(|e| format!("Failed to create storage directory: {}", e))?;

    let jre_dir = data_dir.join("jre");
    
    if jre_dir.exists() {
        if let Some(java_bin) = find_java_binary(&jre_dir) {
            if java_bin.exists() {
                return Ok(());
            }
        }
        let _ = std::fs::remove_dir_all(&jre_dir);
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        
        let zip_path = data_dir.join("jre.zip");
        let zip_str = zip_path.to_string_lossy().replace("\\", "/");
        let jre_str = jre_dir.to_string_lossy().replace("\\", "/");

        // Download JRE zip
        let download_script = format!(
            "$webclient = New-Object System.Net.WebClient; $webclient.DownloadFile('{}', '{}')",
            url, zip_str
        );
        let download_output = Command::new("powershell")
            .arg("-NoProfile")
            .arg("-Command")
            .arg(&download_script)
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| format!("Failed to download JRE: {}", e))?;

        if !download_output.status.success() {
            let stderr = String::from_utf8_lossy(&download_output.stderr);
            return Err(format!("PowerShell JRE download failed: {}", stderr));
        }

        // Unzip
        let unzip_script = format!(
            "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
            zip_str, jre_str
        );
        let unzip_output = Command::new("powershell")
            .arg("-NoProfile")
            .arg("-Command")
            .arg(&unzip_script)
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| format!("Failed to unzip JRE: {}", e))?;

        let _ = std::fs::remove_file(&zip_path);

        if !unzip_output.status.success() {
            let stderr = String::from_utf8_lossy(&unzip_output.stderr);
            return Err(format!("PowerShell JRE unzip failed: {}", stderr));
        }
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let tar_path = data_dir.join("jre.tar.gz");
        let tar_str = tar_path.to_string_lossy().to_string();
        let jre_str = jre_dir.to_string_lossy().to_string();

        std::fs::create_dir_all(&jre_dir).map_err(|e| format!("Failed to create JRE directory: {}", e))?;

        let download_output = Command::new("curl")
            .arg("-L")
            .arg("-o")
            .arg(&tar_str)
            .arg(&url)
            .output()
            .map_err(|e| format!("Failed to download JRE via curl: {}", e))?;

        if !download_output.status.success() {
            return Err("curl JRE download failed".to_string());
        }

        let extract_output = Command::new("tar")
            .arg("-xzf")
            .arg(&tar_str)
            .arg("-C")
            .arg(&jre_str)
            .output()
            .map_err(|e| format!("Failed to extract JRE via tar: {}", e))?;

        let _ = std::fs::remove_file(&tar_path);

        if !extract_output.status.success() {
            return Err("tar JRE extraction failed".to_string());
        }
    }

    Ok(())
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

    let jre_dir = data_dir.join("jre");
    let java_program = if let Some(local_bin) = find_java_binary(&jre_dir) {
        local_bin
    } else {
        std::path::PathBuf::from("java")
    };

    let mut cmd = Command::new(java_program);
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
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(BackendState {
            child: Mutex::new(Option::None),
        })
        .invoke_handler(tauri::generate_handler![
            wipe_all_data,
            select_directory,
            check_java_installed,
            start_backend,
            stop_backend,
            get_backend_status,
            download_and_install_jre
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Set up System Tray Menu
            let show_i = MenuItem::with_id(app, "show", "Show Yomikura", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit Yomikura", true, None::<&str>)?;
            
            let menu = MenuBuilder::new(app)
                .item(&show_i)
                .separator()
                .item(&quit_i)
                .build()?;

            if let Some(icon) = app.default_window_icon() {
                let _tray = TrayIconBuilder::new()
                    .icon(icon.clone())
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| {
                        match event.id().as_ref() {
                            "show" => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                            "quit" => {
                                let state: State<'_, BackendState> = app.state();
                                let mut lock = state.child.lock().unwrap();
                                if let Some(mut child) = lock.take() {
                                    let _ = child.kill();
                                }
                                app.exit(0);
                            }
                            _ => {}
                        }
                    })
                    .build(app)?;
            }

            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                let _ = window.hide();
                api.prevent_close();
            }
            _ => {}
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
