use std::path::Path;
use std::process::Command;

fn java_version(output: &str) -> Option<[u32; 4]> {
    let version = output.lines().find_map(|line| {
        let line = line.trim_start();
        let remainder = line
            .strip_prefix("openjdk version \"")
            .or_else(|| line.strip_prefix("java version \""))?;
        remainder.split_once('"').map(|(value, _)| value)
    })?;
    let (numbers, build) = version.split_once('+').unwrap_or((version, ""));
    if numbers.contains('-') || build.split('-').any(|part| part == "ea" || part == "internal") {
        return None;
    }
    let mut parsed = [0; 4];
    for (index, value) in numbers.split('.').enumerate() {
        *parsed.get_mut(index)? = value.parse().ok()?;
    }
    Some(parsed)
}

fn supported_java_version(output: &str) -> bool {
    // Use the LTS lines with published patches for CVE-2026-114938.
    matches!(java_version(output), Some(version) if
        (version[0] == 21 && version >= [21, 0, 13, 1]) ||
        (version[0] == 25 && version >= [25, 0, 5, 1]))
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
    supported_java_version(&version)
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
    use super::supported_java_version;

    #[test]
    fn requires_a_patched_lts_runtime_for_the_managed_server() {
        for version in ["21.0.13.1", "21.0.14", "25.0.5.1", "25.0.5.1+2-LTS"] {
            assert!(
                supported_java_version(&format!("openjdk version \"{version}\"")),
                "{version}"
            );
        }
        for version in [
            "1.8.0_202", "17.0.21.1", "21.0.12.1", "21.0.13", "25.0.5", "25.0.6-ea", "26",
            "25.invalid",
        ] {
            assert!(
                !supported_java_version(&format!("java version \"{version}\"")),
                "{version}"
            );
        }
        assert!(!supported_java_version("not a Java runtime"));
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
