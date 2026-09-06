use std::process::{Child, Command};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::menu::{MenuBuilder, MenuItem};
use tauri::path::BaseDirectory;
use tauri::tray::TrayIconBuilder;
use tauri::Emitter;
use tauri::WindowEvent;
use tauri::{Manager, State};

#[derive(serde::Serialize)]
struct DownloadedPage {
    bytes: Vec<u8>,
    content_type: String,
}

struct BackendState {
    backend: Mutex<Option<RunningBackend>>,
}

struct RunningBackend {
    child: Child,
    port: u16,
    data_path: std::path::PathBuf,
}

const SUWAYOMI_JAR_NAME: &str = "Suwayomi-Server-v2.3.2243.jar";
const SUWAYOMI_JAR_URL: &str =
    "https://github.com/Suwayomi/Suwayomi-Server/releases/download/v2.3.2243/Suwayomi-Server-v2.3.2243.jar";
const SUWAYOMI_JAR_MIN_BYTES: u64 = 50_000_000;
const SUWAYOMI_JAR_SHA256: &str =
    "821141b32e170d4a02d3cbdfed577ed8f07bd22383ff5f4132ebb5ae40e98dd5";
const MANAGED_STORAGE_MARKER: &str = ".yomikura-managed-storage";
const MANAGED_STORAGE_MARKER_CONTENT: &str = "YOMIKURA_MANAGED_STORAGE_V1";
const MANAGED_STORAGE_RECORD: &str = "managed-storage-path.txt";
const BACKEND_PID_RECORD: &str = "backend.pid";
const MAX_PAGE_DOWNLOAD_BYTES: u64 = 32 * 1024 * 1024;

#[tauri::command]
async fn fetch_local_page(url: String, server_base_url: String) -> Result<DownloadedPage, String> {
    let requested =
        reqwest::Url::parse(&url).map_err(|_| "The requested page URL is invalid.".to_string())?;
    let server = reqwest::Url::parse(&server_base_url)
        .map_err(|_| "The configured Suwayomi server URL is invalid.".to_string())?;

    if !matches!(requested.scheme(), "http" | "https")
        || !requested.username().is_empty()
        || requested.password().is_some()
        || requested.origin() != server.origin()
    {
        return Err(
            "Offline pages may only be fetched from the configured Suwayomi server.".to_string(),
        );
    }

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|err| format!("Could not initialize the local page client: {err}"))?;
    let response = client
        .get(requested)
        .send()
        .await
        .map_err(|err| format!("Could not fetch the page from Suwayomi: {err}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Suwayomi returned HTTP {} while fetching a page.",
            response.status()
        ));
    }
    if response
        .content_length()
        .is_some_and(|size| size > MAX_PAGE_DOWNLOAD_BYTES)
    {
        return Err("A page exceeds Yomikura's 32 MB safety limit.".to_string());
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();
    let bytes = response
        .bytes()
        .await
        .map_err(|err| format!("Could not read the downloaded page: {err}"))?;
    if bytes.len() as u64 > MAX_PAGE_DOWNLOAD_BYTES {
        return Err("A page exceeds Yomikura's 32 MB safety limit.".to_string());
    }
    Ok(DownloadedPage {
        bytes: bytes.to_vec(),
        content_type,
    })
}

fn backend_pid_path(app_handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join(BACKEND_PID_RECORD))
}

fn record_backend_pid(app_handle: &tauri::AppHandle, pid: u32) -> Result<(), String> {
    let path = backend_pid_path(app_handle)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, pid.to_string()).map_err(|e| e.to_string())
}

fn clear_backend_pid(app_handle: &tauri::AppHandle) {
    if let Ok(path) = backend_pid_path(app_handle) {
        let _ = std::fs::remove_file(path);
    }
}

fn jar_looks_valid(path: &std::path::Path) -> bool {
    let Ok(meta) = path.metadata() else {
        return false;
    };
    if meta.len() < SUWAYOMI_JAR_MIN_BYTES {
        return false;
    }

    let Ok(mut file) = std::fs::File::open(path) else {
        return false;
    };
    let mut header = [0u8; 4];
    std::io::Read::read_exact(&mut file, &mut header).is_ok()
        && header == [0x50, 0x4B, 0x03, 0x04]
        && sha256_file(path)
            .map(|hash| hash == SUWAYOMI_JAR_SHA256)
            .unwrap_or(false)
}

fn sha256_file(path: &std::path::Path) -> Result<String, String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;

    let file = std::fs::File::open(path)
        .map_err(|e| format!("Failed to open file for SHA-256 verification: {e}"))?;
    let mut reader = std::io::BufReader::with_capacity(1024 * 1024, file);
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; 1024 * 1024];
    loop {
        let bytes_read = reader
            .read(&mut buffer)
            .map_err(|e| format!("Failed to read file for SHA-256 verification: {e}"))?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn verify_sha256(path: &std::path::Path, expected: &str) -> Result<(), String> {
    let actual = sha256_file(path)?;
    if actual == expected {
        Ok(())
    } else {
        Err(format!(
            "Download integrity check failed. Expected {expected}, received {actual}."
        ))
    }
}

fn log_tail(path: &std::path::Path, max_lines: usize) -> String {
    std::fs::read_to_string(path)
        .map(|contents| {
            let lines: Vec<_> = contents.lines().collect();
            lines[lines.len().saturating_sub(max_lines)..].join("\n")
        })
        .unwrap_or_else(|_| "No backend log output was written.".to_string())
}

fn storage_marker_path(data_dir: &std::path::Path) -> std::path::PathBuf {
    data_dir.join(MANAGED_STORAGE_MARKER)
}

fn has_valid_storage_marker(data_dir: &std::path::Path) -> bool {
    std::fs::read_to_string(storage_marker_path(data_dir))
        .map(|content| content.trim() == MANAGED_STORAGE_MARKER_CONTENT)
        .unwrap_or(false)
}

fn is_legacy_yomikura_storage(data_dir: &std::path::Path) -> bool {
    data_dir.join("server.conf").is_file()
        && (data_dir.join("database.mv.db").is_file()
            || data_dir.join("database.mv.db.mv.db").is_file())
}

fn prepare_managed_storage(
    app_handle: &tauri::AppHandle,
    data_dir: &std::path::Path,
) -> Result<(), String> {
    if data_dir.exists() && !data_dir.is_dir() {
        return Err(format!(
            "Selected storage path is not a directory: {}",
            data_dir.display()
        ));
    }

    if data_dir.exists()
        && !has_valid_storage_marker(data_dir)
        && !is_legacy_yomikura_storage(data_dir)
    {
        let has_entries = std::fs::read_dir(data_dir)
            .map_err(|e| format!("Failed to inspect selected storage folder: {}", e))?
            .next()
            .is_some();
        if has_entries {
            return Err(
                "Selected storage folder is not empty. Choose an empty folder or an existing Yomikura storage folder."
                    .to_string(),
            );
        }
    }

    std::fs::create_dir_all(data_dir)
        .map_err(|e| format!("Failed to create storage directory: {}", e))?;

    let marker = storage_marker_path(data_dir);
    std::fs::write(&marker, MANAGED_STORAGE_MARKER_CONTENT)
        .map_err(|e| format!("Failed to mark Yomikura storage directory: {}", e))?;

    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to resolve app config directory: {}", e))?;
    std::fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create app config directory: {}", e))?;
    let record_path = config_dir.join(MANAGED_STORAGE_RECORD);
    let existing_records = std::fs::read_to_string(&record_path).unwrap_or_default();
    let current_record = data_dir.to_string_lossy();
    if !existing_records.lines().any(|line| line == current_record) {
        let mut records = existing_records.trim_end().to_string();
        if !records.is_empty() {
            records.push('\n');
        }
        records.push_str(&current_record);
        std::fs::write(&record_path, records)
            .map_err(|e| format!("Failed to record Yomikura storage directory: {}", e))?;
    }

    Ok(())
}

fn download_file_with_curl(
    url: &str,
    dest: &std::path::Path,
    expected_sha256: &str,
) -> Result<(), String> {
    let part_path = dest.with_extension("part");
    if part_path.exists() {
        let _ = std::fs::remove_file(&part_path);
    }

    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let mut cmd = Command::new("curl");
    #[cfg(windows)]
    {
        cmd.creation_flags(0x08000000);
        cmd.arg("--ssl-no-revoke");
    }

    let output = cmd
        .arg("-fL")
        .arg("--retry")
        .arg("3")
        .arg("--connect-timeout")
        .arg("30")
        .arg("--max-time")
        .arg("1200")
        .arg("-A")
        .arg("Yomikura/1.0")
        .arg("-o")
        .arg(&part_path)
        .arg(url)
        .output()
        .map_err(|e| format!("Failed to run curl: {}", e))?;

    if !output.status.success() {
        let _ = std::fs::remove_file(&part_path);
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("curl download failed: {}", stderr.trim()));
    }

    if let Err(error) = verify_sha256(&part_path, expected_sha256) {
        let _ = std::fs::remove_file(&part_path);
        return Err(error);
    }

    if dest.exists() {
        let _ = std::fs::remove_file(dest);
    }

    std::fs::rename(&part_path, dest)
        .map_err(|e| format!("Failed to finalize verified download: {}", e))
}

fn resolve_jar_path(
    app_handle: &tauri::AppHandle,
    data_dir: &std::path::Path,
) -> Result<std::path::PathBuf, String> {
    let local_jar = data_dir.join(SUWAYOMI_JAR_NAME);
    if jar_looks_valid(&local_jar) {
        return Ok(local_jar);
    }
    if local_jar.exists() {
        let _ = std::fs::remove_file(&local_jar);
    }

    let bundled_jar = app_handle
        .path()
        .resolve(
            format!("../suwayomi-server/{}", SUWAYOMI_JAR_NAME),
            BaseDirectory::Resource,
        )
        .map_err(|e| format!("Failed to resolve bundled JAR: {}", e))?;

    if jar_looks_valid(&bundled_jar) {
        return Ok(bundled_jar);
    }

    Err(
        "Suwayomi server JAR not found. Download it on first launch or place it in your data folder."
            .to_string(),
    )
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

    // Check the layouts produced by the pinned Temurin archives before doing
    // any recursive walk. In CI the JDK is exposed through a directory
    // junction; recursively traversing that junction can take minutes.
    let direct_candidate = dir.join("bin").join(target_name);
    if direct_candidate.is_file() {
        return Some(direct_candidate);
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            let child_candidate = entry_path.join("bin").join(target_name);
            if child_candidate.is_file() {
                return Some(child_candidate);
            }
            let macos_candidate = entry_path
                .join("Contents")
                .join("Home")
                .join("bin")
                .join(target_name);
            if macos_candidate.is_file() {
                return Some(macos_candidate);
            }
        }
    }

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
async fn download_and_install_jre(
    app_handle: tauri::AppHandle,
    data_path: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        download_and_install_jre_sync(app_handle, data_path)
    })
    .await
    .map_err(|e| format!("JRE installation task failed: {}", e))?
}

fn download_and_install_jre_sync(
    app_handle: tauri::AppHandle,
    data_path: String,
) -> Result<(), String> {
    let (url, expected_sha256) = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => (
            "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jre_x64_windows_hotspot_21.0.12.1_1.zip",
            "d35f31e712f0fcf6ac5a093edc90204fbff22f720ba3950bd09d331d5e621636",
        ),
        ("linux", "x86_64") => (
            "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jre_x64_linux_hotspot_21.0.12.1_1.tar.gz",
            "2413149700df0f7d440500a84a8f764c535f21e5a5e87d38328b64eec2c5b500",
        ),
        ("linux", "aarch64") => (
            "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jre_aarch64_linux_hotspot_21.0.12.1_1.tar.gz",
            "14be1f35ebdbd1f6e8d57eb911a3ffb74d6d9aa255abc5daf2b1302002cf2cf2",
        ),
        ("macos", "x86_64") => (
            "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jre_x64_mac_hotspot_21.0.12.1_1.tar.gz",
            "6717ec641fd9ce0bb209ca083ee23b42202ac68cb6fcc5753496e0e4a0f41989",
        ),
        ("macos", "aarch64") => (
            "https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jre_aarch64_mac_hotspot_21.0.12.1_1.tar.gz",
            "dec50fc6f9fcd4fe3ae8cabf5a5fa68f6afc48841f7698e468e9aa5d54beed84",
        ),
        (os, arch) => return Err(format!("No verified Java runtime is available for {os}/{arch}. Install Java 21 or newer manually.")),
    };

    let data_dir = std::path::PathBuf::from(&data_path);
    prepare_managed_storage(&app_handle, &data_dir)?;

    let jre_dir = data_dir.join("jre");

    if jre_dir.exists() {
        if let Some(java_bin) = find_java_binary(&jre_dir) {
            if java_bin.exists() {
                return Ok(());
            }
        }
        let _ = std::fs::remove_dir_all(&jre_dir);
    }

    std::fs::create_dir_all(&jre_dir)
        .map_err(|e| format!("Failed to create JRE directory: {e}"))?;

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let archive_path = data_dir.join("jre.zip");
        download_file_with_curl(url, &archive_path, expected_sha256)?;
        let output = Command::new("powershell")
            .arg("-NoProfile")
            .arg("-Command")
            .arg("Expand-Archive -LiteralPath $args[0] -DestinationPath $args[1] -Force")
            .arg(&archive_path)
            .arg(&jre_dir)
            .creation_flags(0x08000000)
            .output()
            .map_err(|e| format!("Failed to extract verified JRE archive: {e}"))?;
        if !output.status.success() {
            return Err(format!(
                "Failed to extract verified JRE archive: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        let _ = std::fs::remove_file(&archive_path);
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        let archive_path = data_dir.join("jre.tar.gz");
        download_file_with_curl(url, &archive_path, expected_sha256)?;
        let output = Command::new("tar")
            .arg("-xzf")
            .arg(&archive_path)
            .arg("-C")
            .arg(&jre_dir)
            .output()
            .map_err(|e| format!("Failed to extract verified JRE archive: {e}"))?;
        if !output.status.success() {
            return Err(format!(
                "Failed to extract verified JRE archive: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ));
        }
        let _ = std::fs::remove_file(&archive_path);
    }

    if find_java_binary(&jre_dir).is_some() {
        Ok(())
    } else {
        Err("The verified Java archive did not contain a runnable Java binary.".to_string())
    }
}

#[tauri::command]
fn start_backend(
    app_handle: tauri::AppHandle,
    state: State<'_, BackendState>,
    data_path: String,
) -> Result<u16, String> {
    let data_dir = std::path::PathBuf::from(&data_path);
    let mut lock = state.backend.lock().unwrap();

    if let Some(existing) = lock.as_mut() {
        match existing.child.try_wait() {
            Ok(None) if existing.data_path == data_dir => return Ok(existing.port),
            Ok(None) => {
                return Err(format!(
                    "A local Suwayomi server is already running from '{}'. Stop it before changing the storage location.",
                    existing.data_path.display()
                ));
            }
            Ok(Some(_)) | Err(_) => {
                // The child has exited (or can no longer be queried), so it is safe to start a replacement.
                *lock = None;
            }
        }
    }
    drop(lock);

    prepare_managed_storage(&app_handle, &data_dir)?;
    let jar_path = resolve_jar_path(&app_handle, &data_dir)?;

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

    cmd.arg(format!(
        "-Dsuwayomi.tachidesk.config.server.rootDir={}",
        data_dir.to_string_lossy()
    ))
    .arg(format!("-Dsuwayomi.tachidesk.config.server.port={}", port))
    // Yomikura supplies its own WebView UI. Suwayomi's optional KCEF provider
    // downloads a separate ~260 MB Chromium runtime on first launch and can
    // hold backend readiness behind that download. Sources which require an
    // interactive WebView are not supported by the local-engine integration.
    .arg("-Dsuwayomi.tachidesk.config.server.kcefEnabled=false")
    .arg("-jar")
    .arg(jar_path)
    .stdout(std::process::Stdio::from(log_file.try_clone().unwrap()))
    .stderr(std::process::Stdio::from(log_file));

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start Suwayomi process: {}", e))?;
    if let Err(err) = record_backend_pid(&app_handle, child.id()) {
        let _ = child.kill();
        let _ = child.wait();
        return Err(format!("Failed to record Suwayomi process: {}", err));
    }
    {
        let mut backend = state.backend.lock().unwrap();
        *backend = Some(RunningBackend {
            child,
            port,
            data_path: data_dir,
        });
    }

    let deadline = Instant::now() + Duration::from_secs(75);
    loop {
        let process_status = {
            let mut backend = state.backend.lock().unwrap();
            match backend.as_mut() {
                Some(running) => running.child.try_wait(),
                None => return Err("Suwayomi startup was cancelled.".to_string()),
            }
        };
        match process_status {
            Ok(Some(status)) => {
                *state.backend.lock().unwrap() = None;
                clear_backend_pid(&app_handle);
                return Err(format!(
                    "Suwayomi exited before it became ready ({status}).\n\nRecent log output:\n{}",
                    log_tail(&log_path, 18)
                ));
            }
            Err(err) => {
                clear_backend_pid(&app_handle);
                return Err(format!("Could not monitor Suwayomi startup: {err}"));
            }
            Ok(None) => {}
        }

        if std::net::TcpStream::connect_timeout(
            &std::net::SocketAddr::from(([127, 0, 0, 1], port)),
            Duration::from_millis(250),
        )
        .is_ok()
        {
            return Ok(port);
        }

        if Instant::now() >= deadline {
            if let Some(mut running) = state.backend.lock().unwrap().take() {
                let _ = running.child.kill();
                let _ = running.child.wait();
            }
            clear_backend_pid(&app_handle);
            return Err(format!(
                "Suwayomi did not open port {port} within 75 seconds.\n\nRecent log output:\n{}",
                log_tail(&log_path, 18)
            ));
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

#[tauri::command]
fn stop_backend(
    app_handle: tauri::AppHandle,
    state: State<'_, BackendState>,
) -> Result<(), String> {
    let mut lock = state.backend.lock().unwrap();
    if let Some(mut backend) = lock.take() {
        if let Ok(None) = backend.child.try_wait() {
            backend
                .child
                .kill()
                .map_err(|e| format!("Failed to stop backend process: {}", e))?;
            let _ = backend.child.wait();
        }
    }
    clear_backend_pid(&app_handle);
    Ok(())
}

#[tauri::command]
fn get_backend_status(state: State<'_, BackendState>) -> String {
    let mut lock = state.backend.lock().unwrap();
    if let Some(ref mut backend) = *lock {
        match backend.child.try_wait() {
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
fn wipe_all_data(
    app_handle: tauri::AppHandle,
    state: State<'_, BackendState>,
) -> Result<(), String> {
    let mut lock = state.backend.lock().unwrap();
    if let Some(mut backend) = lock.take() {
        let _ = backend.child.kill();
        std::thread::sleep(std::time::Duration::from_millis(500));
    }

    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|e| e.to_string())?;
    let data_dir = app_handle
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?;

    if config_dir.exists() {
        std::fs::remove_dir_all(&config_dir).map_err(|e| e.to_string())?;
    }
    if data_dir.exists() {
        std::fs::remove_dir_all(&data_dir).map_err(|e| e.to_string())?;
    }

    app_handle.restart()
}

#[tauri::command]
async fn download_suwayomi_jar(
    app_handle: tauri::AppHandle,
    data_path: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || download_suwayomi_jar_sync(app_handle, data_path))
        .await
        .map_err(|e| format!("Suwayomi download task failed: {}", e))?
}

fn download_suwayomi_jar_sync(
    app_handle: tauri::AppHandle,
    data_path: String,
) -> Result<String, String> {
    let data_dir = std::path::PathBuf::from(&data_path);
    prepare_managed_storage(&app_handle, &data_dir)?;

    let dest = data_dir.join(SUWAYOMI_JAR_NAME);
    if jar_looks_valid(&dest) {
        return Ok(dest.to_string_lossy().to_string());
    }
    if dest.exists() {
        let _ = std::fs::remove_file(&dest);
    }

    download_file_with_curl(SUWAYOMI_JAR_URL, &dest, SUWAYOMI_JAR_SHA256)?;

    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
fn get_portable_data_path() -> Result<String, String> {
    let exe =
        std::env::current_exe().map_err(|e| format!("Failed to resolve executable: {}", e))?;
    let parent = exe
        .parent()
        .ok_or_else(|| "Executable has no parent directory.".to_string())?;
    let portable = parent.join("YomikuraPortable");
    std::fs::create_dir_all(&portable)
        .map_err(|e| format!("Failed to create portable folder: {}", e))?;
    Ok(portable.to_string_lossy().replace('\\', "/"))
}

#[tauri::command]
fn open_logs_folder(data_path: String) -> Result<(), String> {
    let data_dir = std::path::PathBuf::from(&data_path);
    if !data_dir.exists() {
        return Err("Storage directory does not exist.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(data_dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(data_dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(data_dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .manage(BackendState {
            backend: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            wipe_all_data,
            select_directory,
            check_java_installed,
            start_backend,
            stop_backend,
            get_backend_status,
            download_and_install_jre,
            download_suwayomi_jar,
            get_portable_data_path,
            open_logs_folder,
            fetch_local_page
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        // Development logging must not make the desktop app depend on a
                        // writable per-user log directory. This is especially important
                        // when testing an installed build and a debug build side by side.
                        .targets([tauri_plugin_log::Target::new(
                            tauri_plugin_log::TargetKind::Stderr,
                        )])
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

            app.on_menu_event(|app_handle, event| match event.id().as_ref() {
                "quit_menu" => {
                    let state: State<'_, BackendState> = app_handle.state();
                    let mut lock = state.backend.lock().unwrap();
                    if let Some(mut backend) = lock.take() {
                        let _ = backend.child.kill();
                    }
                    clear_backend_pid(app_handle);
                    app_handle.exit(0);
                }
                "check_updates" => {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.emit("menu-check-updates", ());
                    }
                }
                _ => {}
            });

            if let Some(icon) = app.default_window_icon() {
                let _tray = TrayIconBuilder::new()
                    .icon(icon.clone())
                    .menu(&menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            let state: State<'_, BackendState> = app.state();
                            let mut lock = state.backend.lock().unwrap();
                            if let Some(mut backend) = lock.take() {
                                let _ = backend.child.kill();
                            }
                            clear_backend_pid(app);
                            app.exit(0);
                        }
                        _ => {}
                    })
                    .build(app)?;
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                let state: State<'_, BackendState> = window.app_handle().state();
                let mut lock = state.backend.lock().unwrap();
                if let Some(mut backend) = lock.take() {
                    let _ = backend.child.kill();
                    let _ = backend.child.wait();
                }
                clear_backend_pid(window.app_handle());
                window.app_handle().exit(0);
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            let state: State<'_, BackendState> = app_handle.state();
            let mut lock = state.backend.lock().unwrap();
            if let Some(mut backend) = lock.take() {
                let _ = backend.child.kill();
            }
            clear_backend_pid(app_handle);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::sha256_file;

    #[test]
    fn sha256_file_matches_known_digest() {
        let path = std::env::temp_dir().join(format!(
            "yomikura-sha256-{}-{}.txt",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock should be after Unix epoch")
                .as_nanos()
        ));
        std::fs::write(&path, b"abc").expect("test file should be writable");

        let digest = sha256_file(&path).expect("digest should be calculated");
        let _ = std::fs::remove_file(&path);

        assert_eq!(
            digest,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
