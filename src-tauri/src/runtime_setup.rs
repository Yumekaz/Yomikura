use std::path::Path;
use std::process::Command;

fn java_major_version(output: &str) -> Option<u32> {
    let version = output.lines().find_map(|line| {
        let (_, remainder) = line.split_once("version \"")?;
        remainder.split('"').next()
    })?;
    let mut parts = version.split(['.', '-', '+']);
    let first = parts.next()?.parse::<u32>().ok()?;
    if first == 1 {
        parts.next()?.parse().ok()
    } else {
        Some(first)
    }
}

pub(crate) fn compatible_java(binary: &Path) -> bool {
    let mut command = Command::new(binary);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command.arg("-version");
    let Ok(output) = command.output() else {
        return false;
    };
    if !output.status.success() {
        return false;
    }
    let version = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout)
    );
    java_major_version(&version).is_some_and(|major| major >= 21)
}

#[cfg(windows)]
pub(crate) fn extract_verified_java_archive(
    archive: &Path,
    destination: &Path,
) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    // PowerShell -Command does not bind trailing native arguments to $args.
    // Both paths stay literal, including spaces, apostrophes and metacharacters.
    let literal = |path: &Path| format!("'{}'", path.to_string_lossy().replace('\'', "''"));
    let script = format!(
        "$ErrorActionPreference = 'Stop'; Expand-Archive -LiteralPath {} -DestinationPath {} -Force",
        literal(archive), literal(destination)
    );
    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command"])
        .arg(script)
        .creation_flags(0x08000000)
        .output()
        .map_err(|error| format!("Failed to extract verified JRE archive: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "Failed to extract verified JRE archive: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::java_major_version;

    #[test]
    fn recognizes_current_and_legacy_java_versions() {
        assert_eq!(
            java_major_version("openjdk version \"21.0.12.1\" 2026-10-20"),
            Some(21)
        );
        assert_eq!(java_major_version("java version \"1.8.0_202\""), Some(8));
        assert_eq!(java_major_version("openjdk version \"17.0.10\""), Some(17));
        assert_eq!(java_major_version("openjdk version \"25-ea\""), Some(25));
        assert_eq!(java_major_version("not a Java runtime"), None);
    }

    #[cfg(windows)]
    #[test]
    fn extracts_runtime_archive_with_literal_windows_paths() {
        let temp = std::env::temp_dir();
        let root = temp.join(format!(
            "yomikura-runtime's-$()-[probe]-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let archive = root.join("reading essentials [1].zip");
        std::fs::write(
            &archive,
            include_bytes!("../tests/fixtures/runtime-sample.zip"),
        )
        .unwrap();
        let destination = root.join("private runtime's [1]");
        super::extract_verified_java_archive(&archive, &destination).unwrap();
        assert_eq!(
            std::fs::read_to_string(destination.join("runtime probe.txt")).unwrap(),
            "runtime extraction probe"
        );
        assert!(root.starts_with(&temp));
        std::fs::remove_dir_all(root).unwrap();
    }
}
