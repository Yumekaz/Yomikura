/** Only web source pages may leave the application through this command. */
fn web_url(value: &str) -> Result<String, String> {
    if value.chars().any(char::is_control) {
        return Err("The source website address is invalid.".to_string());
    }
    let url = reqwest::Url::parse(value)
        .map_err(|_| "The source website address is invalid.".to_string())?;
    if !matches!(url.scheme(), "https" | "http")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(
            "Only HTTP or HTTPS source websites without embedded credentials can be opened."
                .to_string(),
        );
    }
    Ok(url.to_string())
}

#[tauri::command]
pub(crate) fn open_source_website(url: String) -> Result<(), String> {
    let url = web_url(&url)?;
    #[cfg(target_os = "windows")]
    {
        use windows::core::{w, HSTRING, PCWSTR};
        use windows::Win32::UI::Shell::ShellExecuteW;
        use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
        // No command shell or argument interpolation: hand the validated URL
        // directly to Windows' registered HTTP(S) browser association.
        let result = unsafe {
            ShellExecuteW(
                None,
                w!("open"),
                &HSTRING::from(url),
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };
        if result.0 as isize <= 32 {
            return Err("Your browser could not open the source website. Copy the book link and open it in your browser.".to_string());
        }
    }
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        #[cfg(target_os = "macos")]
        let launcher = "/usr/bin/open";
        #[cfg(target_os = "linux")]
        let launcher = "xdg-open";
        let status = std::process::Command::new(launcher)
            .arg(url)
            .status()
            .map_err(|_| "Your browser could not open the source website. Copy the book link and open it in your browser.".to_string())?;
        if !status.success() {
            return Err("Your browser could not open the source website. Copy the book link and open it in your browser.".to_string());
        }
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        let _ = url;
        return Err("Opening source websites is not supported on this platform.".to_string());
    }
    #[allow(unreachable_code)]
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::web_url;

    #[test]
    fn keeps_web_query_parameters_as_url_data() {
        assert_eq!(
            web_url("https://example.com/series/story?chapter=5&view=full").unwrap(),
            "https://example.com/series/story?chapter=5&view=full"
        );
        assert_eq!(
            web_url("http://example.com").unwrap(),
            "http://example.com/"
        );
    }

    #[test]
    fn refuses_non_web_links_credentials_and_hidden_controls() {
        for value in [
            "javascript:alert(1)",
            "file:///C:/Windows/System32/cmd.exe",
            "data:text/html,hello",
            "mailto:someone@example.com",
            "https://user:password@example.com/series",
            "https://user@example.com/series",
            "https://exam\nple.com/series",
            "https://example.com/series\0",
            "/series/story",
            "",
        ] {
            assert!(
                web_url(value).is_err(),
                "Unexpected accepted URL: {value:?}"
            );
        }
    }
}
