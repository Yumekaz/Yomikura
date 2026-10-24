use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::State;
use super::{has_valid_storage_marker, BackendState, RunningBackend};

const MAX_FILE_BYTES: usize = 128 * 1024 * 1024;
const MAX_BATCH_BYTES: usize = 256 * 1024 * 1024;
#[derive(serde::Deserialize)]
pub(crate) struct ImportArchive { name: String, bytes: Vec<u8> }
#[derive(serde::Serialize)]
pub(crate) struct ImportResult { imported: Vec<String>, error: Option<String> }

fn valid_component(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or("").to_uppercase();
    !name.is_empty() && name.len() <= 180 && name != "." && name != ".."
        && !name.ends_with(['.', ' '])
        && !name.chars().any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
        && !matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$")
        && !(stem.len() == 4 && (stem.starts_with("COM") || stem.starts_with("LPT")) && stem.as_bytes()[3].is_ascii_digit())
}
fn reject_link(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            #[cfg(windows)]
            { use std::os::windows::fs::MetadataExt; if metadata.file_attributes() & 0x400 != 0 { return Err("Import destinations cannot contain reparse points.".into()); } }
            if metadata.file_type().is_symlink() { return Err("Import destinations cannot contain symbolic links.".into()); }
            Ok(())
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("Could not inspect the import destination: {error}")),
    }
}
fn owns_endpoint(server: &str, port: u16) -> bool {
    reqwest::Url::parse(server).is_ok_and(|url| url.scheme() == "http" && matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]" | "::1"))
        && url.port_or_known_default() == Some(port) && url.path() == "/" && url.username().is_empty() && url.password().is_none() && url.query().is_none() && url.fragment().is_none())
}
fn verified_target(running: &mut RunningBackend, server: &str, reported: &str) -> Result<Option<PathBuf>, String> {
    if !owns_endpoint(server, running.port) || running.child.try_wait().map_err(|error| error.to_string())?.is_some() || !has_valid_storage_marker(&running.data_path) { return Ok(None); }
    if reported.trim().is_empty() { return Ok(None); }
    let local = running.data_path.join("local");
    reject_link(&local)?;
    let expected = local.canonicalize().map_err(|error| format!("Managed Local source is not ready: {error}"))?;
    let actual = Path::new(reported).canonicalize().map_err(|error| format!("Server Local directory could not be verified: {error}"))?;
    let root = running.data_path.canonicalize().map_err(|error| error.to_string())?;
    if actual != expected || expected.parent() != Some(root.as_path()) { return Ok(None); }
    Ok(Some(expected))
}
fn validate_archives(directory: &Path, title: &str, archives: &[ImportArchive]) -> Result<PathBuf, String> {
    if !valid_component(title) { return Err("Choose a title without reserved names, path separators or trailing dots/spaces.".into()); }
    if archives.is_empty() { return Err("Choose at least one supported archive.".into()); }
    reject_link(directory)?;
    let manga = directory.join(title); reject_link(&manga)?;
    if manga.try_exists().map_err(|error| error.to_string())? && !manga.is_dir() { return Err("The title destination is not a directory.".into()); }
    let mut names = HashSet::new(); let mut total = 0usize;
    for archive in archives {
        if !valid_component(&archive.name) || !names.insert(archive.name.to_lowercase()) { return Err("Archive names must be valid and unique, including letter case.".into()); }
        let extension = Path::new(&archive.name).extension().and_then(|value| value.to_str()).unwrap_or("").to_lowercase();
        let supported = match extension.as_str() {
            "cbz" | "zip" | "epub" => archive.bytes.starts_with(b"PK\x03\x04") || archive.bytes.starts_with(b"PK\x05\x06"),
            "cbr" | "rar" => archive.bytes.starts_with(b"Rar!\x1a\x07"),
            _ => false,
        };
        if !supported { return Err(format!("{} is not a supported ZIP/CBZ, RAR/CBR or EPUB archive. PDF is not supported.", archive.name)); }
        total = total.checked_add(archive.bytes.len()).ok_or("Import size overflow.")?;
        if archive.bytes.len() > MAX_FILE_BYTES || total > MAX_BATCH_BYTES { return Err("Import supports up to 128 MiB per archive and 256 MiB per batch.".into()); }
        if manga.join(&archive.name).try_exists().map_err(|error| format!("Could not check for an existing archive: {error}"))? { return Err(format!("{} already exists. Rename the incoming file; existing files are never overwritten.", archive.name)); }
    }
    Ok(manga)
}
fn copy_archives(directory: &Path, title: &str, archives: Vec<ImportArchive>) -> Result<ImportResult, String> {
    let manga = validate_archives(directory, title, &archives)?;
    if !manga.try_exists().map_err(|error| error.to_string())? { fs::create_dir(&manga).map_err(|error| format!("Could not create the title folder: {error}"))?; }
    reject_link(&manga)?;
    let mut imported = Vec::new();
    for archive in archives {
        let target = manga.join(&archive.name);
        let result = (|| {
            let mut file = OpenOptions::new().write(true).create_new(true).open(&target).map_err(|error| format!("Could not create {}: {error}", archive.name))?;
            file.write_all(&archive.bytes).and_then(|_| file.sync_all()).map_err(|error| format!("Could not finish {}: {error}", archive.name))?;
            drop(file);
            let retained = fs::read(&target).map_err(|error| format!("Could not verify {}: {error}", archive.name))?;
            if retained != archive.bytes { return Err(format!("Readback failed for {}. The partial copy was retained for inspection.", archive.name)); }
            Ok::<_, String>(())
        })();
        if let Err(error) = result { return Ok(ImportResult { imported, error: Some(error) }); }
        imported.push(archive.name);
    }
    Ok(ImportResult { imported, error: None })
}
#[tauri::command]
pub(crate) fn get_local_import_target(state: State<'_, BackendState>, server_base_url: String, reported_path: String) -> Result<Option<String>, String> {
    let mut lock = state.backend.lock().map_err(|_| "Local engine state is unavailable.")?;
    match lock.as_mut() { Some(running) => Ok(verified_target(running, &server_base_url, &reported_path)?.map(|path| path.to_string_lossy().into_owned())), None => Ok(None) }
}
#[tauri::command]
pub(crate) fn import_local_archives(state: State<'_, BackendState>, server_base_url: String, reported_path: String, title: String, archives: Vec<ImportArchive>) -> Result<ImportResult, String> {
    let mut lock = state.backend.lock().map_err(|_| "Local engine state is unavailable.")?;
    let running = lock.as_mut().ok_or("Start the managed local engine before importing.")?;
    let target = verified_target(running, &server_base_url, &reported_path)?.ok_or("This server/destination is not owned by the running local engine. Use server-side copy instructions.")?;
    copy_archives(&target, &title, archives)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn root() -> PathBuf { use std::time::{SystemTime, UNIX_EPOCH}; let path = std::env::temp_dir().join(format!("yomi-import-{}-{}", std::process::id(), SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos())); fs::create_dir(&path).unwrap(); path }
    fn archive(name: &str) -> ImportArchive { ImportArchive { name: name.into(), bytes: b"PK\x03\x04fixture".to_vec() } }
    #[test] fn rejects_remote_and_unowned_loopback_endpoints() { assert!(owns_endpoint("http://127.0.0.1:4567", 4567)); for url in ["http://server.example:4567", "http://127.0.0.1:4568", "http://user@localhost:4567", "http://localhost:4567/path", "https://localhost:4567"] { assert!(!owns_endpoint(url, 4567)); } }
    #[test] fn validates_the_entire_batch_before_writing() { let root = root(); assert!(copy_archives(&root, "Title", vec![archive("good.cbz"), archive("bad.pdf")]).is_err()); assert!(!root.join("Title").exists()); }
    #[test] fn rejects_path_and_windows_reserved_components() { for name in ["", "..", "../other", "C:\\other", "CON", "nul.cbz", "trailing.", "trailing "] { assert!(!valid_component(name), "{name}"); } assert!(valid_component("漫画 Chapter 1.cbz")); }
    #[test] fn verifies_copied_bytes_and_preserves_colliding_originals() { let root = root(); let first = archive("Chapter 1.cbz"); let expected = first.bytes.clone(); assert!(copy_archives(&root, "Title", vec![first]).unwrap().error.is_none()); assert!(copy_archives(&root, "Title", vec![archive("Chapter 1.cbz")]).is_err()); assert_eq!(fs::read(root.join("Title/Chapter 1.cbz")).unwrap(), expected); }
    #[test] fn rejects_case_collisions_before_creating_a_title() { let root = root(); assert!(copy_archives(&root, "Title", vec![archive("chapter.cbz"), archive("CHAPTER.CBZ")]).is_err()); assert!(!root.join("Title").exists()); }
    #[test] fn refuses_a_file_where_a_directory_is_required() { let root = root(); fs::write(root.join("Title"), b"original").unwrap(); assert!(copy_archives(&root, "Title", vec![archive("one.cbz")]).is_err()); assert_eq!(fs::read(root.join("Title")).unwrap(), b"original"); }
}
