use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{Manager, State};

#[derive(Clone, Default, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase", default)]
pub struct DesktopPreferences {
    pub protect_content: bool,
    pub close_to_tray: bool,
    pub require_unlock: bool,
}
#[derive(Default)]
pub struct DesktopState {
    preferences: Mutex<DesktopPreferences>,
    warning: Mutex<Option<String>>,
    pub tray_available: AtomicBool,
    pub locked: AtomicBool,
    saving: Mutex<()>,
}
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopPreferenceStatus {
    preferences: DesktopPreferences,
    can_protect_content: bool,
    can_close_to_tray: bool,
    can_app_lock: bool,
    locked: bool,
    warning: Option<String>,
}
fn config_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join("desktop-window-preferences.json"))
}
pub fn initialize(app: &tauri::AppHandle) {
    let state = app.state::<DesktopState>();
    let loaded = (|| -> Result<DesktopPreferences, String> {
        let path = config_path(app)?;
        if !path.exists() {
            return Ok(DesktopPreferences::default());
        }
        if std::fs::metadata(&path)
            .map_err(|error| error.to_string())?
            .len()
            > 16384
        {
            return Err("Desktop preferences are too large.".into());
        }
        serde_json::from_slice(&std::fs::read(path).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())
    })();
    let preferences = match loaded {
        Ok(value) => value,
        Err(_) => {
            *state.warning.lock().unwrap() = Some(
                "Saved window preferences couldn’t be read. Review and save your choices again."
                    .into(),
            );
            DesktopPreferences {
                protect_content: cfg!(any(target_os = "windows", target_os = "macos")),
                close_to_tray: false,
                require_unlock: cfg!(target_os = "windows"),
            }
        }
    };
    if let Some(window) = app.get_webview_window("main") {
        if window
            .set_content_protected(preferences.protect_content)
            .is_err()
            && preferences.protect_content
        {
            *state.warning.lock().unwrap() =
                Some("This system couldn’t apply screen capture protection.".into());
        }
    }
    state
        .locked
        .store(preferences.require_unlock, Ordering::Release);
    *state.preferences.lock().unwrap() = preferences;
}
pub fn keep_running(state: &DesktopState) -> bool {
    state.tray_available.load(Ordering::Acquire) && state.preferences.lock().unwrap().close_to_tray
}
#[tauri::command]
pub fn get_desktop_preferences(state: State<'_, DesktopState>) -> DesktopPreferenceStatus {
    snapshot(&state)
}
fn snapshot(state: &DesktopState) -> DesktopPreferenceStatus {
    DesktopPreferenceStatus {
        preferences: state.preferences.lock().unwrap().clone(),
        can_protect_content: cfg!(any(target_os = "windows", target_os = "macos")),
        can_close_to_tray: state.tray_available.load(Ordering::Acquire),
        can_app_lock: cfg!(target_os = "windows"),
        locked: state.locked.load(Ordering::Acquire),
        warning: state.warning.lock().unwrap().clone(),
    }
}
#[tauri::command]
pub async fn set_desktop_preferences(
    window: tauri::WebviewWindow,
    preferences: DesktopPreferences,
) -> Result<DesktopPreferenceStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let app = window.app_handle().clone();
        let state = app.state::<DesktopState>();
        let _saving = state
            .saving
            .lock()
            .map_err(|_| "Window settings are busy.".to_string())?;
        let previous = state.preferences.lock().unwrap().clone();
        if preferences.require_unlock != previous.require_unlock {
            verify(&window)?;
        } else if state.locked.load(Ordering::Acquire) {
            return Err("Unlock your reading room before changing its preferences.".into());
        }
        apply_preferences(window, &state, preferences)
    })
    .await
    .map_err(|_| "Window preference worker stopped.".to_string())?
}
fn apply_preferences(
    window: tauri::WebviewWindow,
    state: &DesktopState,
    preferences: DesktopPreferences,
) -> Result<DesktopPreferenceStatus, String> {
    if preferences.protect_content && !cfg!(any(target_os = "windows", target_os = "macos")) {
        return Err("Screen capture protection isn’t supported by this desktop build.".into());
    }
    if preferences.close_to_tray && !state.tray_available.load(Ordering::Acquire) {
        return Err(
            "A tray icon is required before keeping the library open in the background.".into(),
        );
    }
    let previous = state.preferences.lock().unwrap().clone();
    if cfg!(any(target_os = "windows", target_os = "macos")) {
        window
            .set_content_protected(preferences.protect_content)
            .map_err(|_| "The system couldn’t confirm screen capture protection.".to_string())?;
    }
    let saved = (|| -> Result<(), String> {
        use std::io::Write;
        let path = config_path(window.app_handle())?;
        std::fs::create_dir_all(path.parent().ok_or("The settings folder is unavailable.")?)
            .map_err(|error| error.to_string())?;
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_nanos();
        let temporary = path.with_extension(format!("{}.{}.pending", std::process::id(), stamp));
        let bytes = serde_json::to_vec(&preferences).map_err(|error| error.to_string())?;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|error| error.to_string())?;
        file.write_all(&bytes)
            .and_then(|_| file.sync_all())
            .map_err(|error| error.to_string())?;
        drop(file);
        if std::fs::read(&temporary).map_err(|error| error.to_string())? != bytes {
            return Err("Window preferences could not be verified.".into());
        }
        std::fs::rename(&temporary, &path).map_err(|error| error.to_string())?;
        Ok(())
    })();
    if let Err(error) = saved {
        let _ = window.set_content_protected(previous.protect_content);
        return Err(format!("Window preferences weren’t saved: {error}"));
    }
    *state.preferences.lock().unwrap() = preferences;
    state.locked.store(false, Ordering::Release);
    *state.warning.lock().unwrap() = None;
    Ok(snapshot(state))
}
fn verify(window: &tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let owner = window
        .hwnd()
        .map_err(|_| "The app window is unavailable.".to_string())?
        .0 as isize;
    #[cfg(not(target_os = "windows"))]
    let owner = {
        let _ = window;
        0
    };
    crate::desktop_lock::verify(owner)
}
pub fn lock_when_away(window: &tauri::Window) {
    let state = window.app_handle().state::<DesktopState>();
    if state.preferences.lock().unwrap().require_unlock {
        state.locked.store(true, Ordering::Release);
        use tauri::Emitter;
        let _ = window.emit("yomikura-window-locked", ());
    }
}
#[tauri::command]
pub async fn unlock_reading_room(window: tauri::WebviewWindow) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = window.app_handle().state::<DesktopState>();
        if !state.preferences.lock().unwrap().require_unlock {
            return Ok(());
        }
        verify(&window)?;
        state.locked.store(false, Ordering::Release);
        Ok(())
    })
    .await
    .map_err(|_| "Windows verification worker stopped.".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn closing_can_only_hide_a_window_when_a_tray_was_created() {
        let state = DesktopState::default();
        state.preferences.lock().unwrap().close_to_tray = true;
        assert!(!keep_running(&state));
        state.tray_available.store(true, Ordering::Release);
        assert!(keep_running(&state));
        state.preferences.lock().unwrap().close_to_tray = false;
        assert!(!keep_running(&state));
    }
    #[test]
    fn older_preferences_keep_authentication_opt_in() {
        let preferences: DesktopPreferences =
            serde_json::from_str(r#"{"protectContent":true,"closeToTray":false}"#).unwrap();
        assert!(preferences.protect_content);
        assert!(!preferences.require_unlock);
    }
}
