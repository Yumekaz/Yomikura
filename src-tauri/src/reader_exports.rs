use std::collections::HashSet;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(serde::Deserialize)]
pub(crate) struct ExportPage {
    name: String,
    bytes: Vec<u8>,
}
#[derive(serde::Serialize)]
pub(crate) struct ExportResult {
    saved: Vec<String>,
    error: Option<String>,
}
fn valid_component(name: &str) -> bool {
    let stem = name.split('.').next().unwrap_or("").to_uppercase();
    !name.is_empty()
        && name.len() <= 180
        && name != "."
        && name != ".."
        && !name.ends_with(['.', ' '])
        && !name
            .chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
        && !matches!(
            stem.as_str(),
            "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
        )
        && !(stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.as_bytes()[3].is_ascii_digit())
}
fn directory(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("Choose an absolute export folder.".into());
    }
    for part in path.ancestors() {
        let metadata = fs::symlink_metadata(part)
            .map_err(|error| format!("The export folder is unavailable: {error}"))?;
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 {
                return Err(
                    "Choose an export folder without linked or redirected directories.".into(),
                );
            }
        }
        if metadata.file_type().is_symlink() {
            return Err("Choose an export folder without symbolic links.".into());
        }
    }
    if !path.is_dir() {
        return Err("The export destination is not a folder.".into());
    }
    path.canonicalize().map_err(|error| error.to_string())
}
fn configuration(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|error| error.to_string())?
        .join("reader-export-directory.json"))
}
#[tauri::command]
pub(crate) fn get_reader_export_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let file = configuration(&app)?;
    if !file.exists() {
        return Ok(None);
    }
    let path: PathBuf = serde_json::from_slice(&fs::read(file).map_err(|error| error.to_string())?)
        .map_err(|error| error.to_string())?;
    Ok(Some(directory(&path)?.to_string_lossy().into_owned()))
}
#[tauri::command]
pub(crate) async fn select_reader_export_directory(
    app: tauri::AppHandle,
) -> Result<Option<String>, String> {
    let owner = super::folder_dialog_owner(&app);
    let selected = tauri::async_runtime::spawn_blocking(move || {
        super::select_directory_sync("Choose your export folder", owner)
    })
    .await
    .map_err(|error| error.to_string())??;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = directory(Path::new(&selected))?;
    let file = configuration(&app)?;
    fs::create_dir_all(file.parent().ok_or("Export preferences are unavailable")?)
        .map_err(|error| error.to_string())?;
    fs::write(
        file,
        serde_json::to_vec(&path).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())?;
    Ok(Some(path.to_string_lossy().into_owned()))
}
fn image_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("png")
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some("jpg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("gif")
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        Some("webp")
    } else if bytes.get(4..8) == Some(b"ftyp")
        && matches!(bytes.get(8..12), Some(b"avif" | b"avis"))
    {
        Some("avif")
    } else {
        None
    }
}
fn validate(
    title: Option<&str>,
    archive: Option<&str>,
    pages: &[ExportPage],
) -> Result<(), String> {
    if title.is_some_and(|value| !valid_component(value))
        || archive
            .is_some_and(|value| !valid_component(value) || !value.to_lowercase().ends_with(".cbz"))
    {
        return Err("Choose valid export names without reserved names or path separators.".into());
    }
    if pages.is_empty() || pages.len() > 2000 {
        return Err("Choose between 1 and 2,000 pages to export.".into());
    }
    let mut names = HashSet::new();
    let mut total = 0usize;
    for page in pages {
        let extension = image_extension(&page.bytes)
            .ok_or("Only verified PNG, JPEG, WebP, GIF or AVIF pages can be exported.")?;
        if !valid_component(&page.name)
            || !names.insert(page.name.to_lowercase())
            || Path::new(&page.name)
                .extension()
                .and_then(|value| value.to_str())
                != Some(extension)
        {
            return Err("Page filenames must be unique and match their image format.".into());
        }
        total += page.bytes.len();
        if page.bytes.len() > 80 * 1024 * 1024 || total > 256 * 1024 * 1024 {
            return Err("This export exceeds the 256 MB batch or 80 MB page limit.".into());
        }
    }
    Ok(())
}
fn create_file(folder: &Path, name: &str) -> Result<(PathBuf, File), String> {
    let original = Path::new(name);
    let stem = original
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or("Invalid filename")?;
    let extension = original
        .extension()
        .and_then(|value| value.to_str())
        .ok_or("Invalid extension")?;
    for number in 0..1000 {
        let filename = if number == 0 {
            name.to_owned()
        } else {
            format!("{stem} ({number}).{extension}")
        };
        let path = folder.join(filename);
        match OpenOptions::new()
            .write(true)
            .read(true)
            .create_new(true)
            .open(&path)
        {
            Ok(file) => return Ok((path, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("The export could not be written: {error}")),
        }
    }
    Err("Too many exports share this name. Choose another folder.".into())
}
fn write_export(
    root: &Path,
    title: Option<&str>,
    archive: Option<&str>,
    pages: &[ExportPage],
) -> Result<Vec<String>, String> {
    validate(title, archive, pages)?;
    let mut folder = directory(root)?;
    if let Some(title) = title {
        let child = folder.join(title);
        match fs::create_dir(&child) {
            Ok(()) => (),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => (),
            Err(error) => return Err(error.to_string()),
        }
        let canonical = directory(&child)?;
        if canonical.parent() != Some(folder.as_path()) {
            return Err("The title folder leaves the chosen export folder.".into());
        }
        folder = canonical;
    }
    let mut saved = Vec::new();
    if let Some(archive) = archive {
        let (path, file) = create_file(&folder, archive)?;
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);
        for page in pages {
            zip.start_file(&page.name, options)
                .map_err(|error| error.to_string())?;
            zip.write_all(&page.bytes)
                .map_err(|error| error.to_string())?;
        }
        zip.finish()
            .map_err(|error| error.to_string())?
            .sync_all()
            .map_err(|error| error.to_string())?;
        let mut verified =
            zip::ZipArchive::new(File::open(&path).map_err(|error| error.to_string())?)
                .map_err(|error| error.to_string())?;
        if verified.len() != pages.len() {
            return Err("The exported archive could not be verified.".into());
        }
        for (index, page) in pages.iter().enumerate() {
            use std::io::Read;
            let mut entry = verified
                .by_index(index)
                .map_err(|error| error.to_string())?;
            let mut bytes = Vec::new();
            entry
                .read_to_end(&mut bytes)
                .map_err(|error| error.to_string())?;
            if entry.name().map_err(|error| error.to_string())? != page.name || bytes != page.bytes
            {
                return Err("The exported archive did not match its pages.".into());
            }
        }
        saved.push(path.to_string_lossy().into_owned());
    } else {
        for page in pages {
            let (path, mut file) = create_file(&folder, &page.name)?;
            file.write_all(&page.bytes)
                .and_then(|()| file.sync_all())
                .map_err(|error| error.to_string())?;
            if fs::read(&path).map_err(|error| error.to_string())? != page.bytes {
                return Err("The saved page did not match the original.".into());
            }
            saved.push(path.to_string_lossy().into_owned());
        }
    }
    Ok(saved)
}
#[derive(serde::Deserialize)]
struct ExportMetadata {
    title: Option<String>,
    name: String,
    archive: bool,
}
fn archive_pages(bytes: Vec<u8>) -> Result<Vec<ExportPage>, String> {
    use std::io::Read;
    let mut archive =
        zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|error| error.to_string())?;
    if archive.is_empty() || archive.len() > 2000 {
        return Err("Choose between 1 and 2,000 pages to export.".into());
    }
    let mut pages = Vec::new();
    let mut total = 0u64;
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|error| error.to_string())?;
        total += entry.size();
        if entry.size() > 80 * 1024 * 1024 || total > 256 * 1024 * 1024 {
            return Err("The archive exceeds the export size limit.".into());
        }
        let name = entry
            .name()
            .map_err(|error| error.to_string())?
            .into_owned();
        if !valid_component(&name) {
            return Err("The archive contains an invalid page name.".into());
        }
        let mut bytes = Vec::new();
        entry
            .take(80 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|error| error.to_string())?;
        pages.push(ExportPage { name, bytes });
    }
    Ok(pages)
}
#[tauri::command]
pub(crate) async fn save_reader_export(
    app: tauri::AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Result<ExportResult, String> {
    let header = request
        .headers()
        .get("x-yomikura-export")
        .and_then(|value| value.to_str().ok())
        .filter(|value| value.len() <= 8192)
        .ok_or("The export description is invalid")?;
    let metadata: ExportMetadata =
        serde_json::from_str(header).map_err(|error| error.to_string())?;
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(bytes) if bytes.len() <= 256 * 1024 * 1024 => bytes.clone(),
        _ => return Err("The export data is invalid or too large.".into()),
    };
    let folder = get_reader_export_directory(app)?
        .ok_or("Choose an export folder in Reader settings first.")?;
    // No caller-supplied filesystem path is accepted. A native folder choice grants this destination.
    tauri::async_runtime::spawn_blocking(move || {
        let archive = metadata.archive.then_some(metadata.name.clone());
        let pages = if metadata.archive { archive_pages(bytes) } else { Ok(vec![ExportPage { name: metadata.name, bytes }]) }?;
        Ok(match write_export(Path::new(&folder), metadata.title.as_deref(), archive.as_deref(), &pages) {
        Ok(saved) => ExportResult { saved, error: None },
        Err(error) => ExportResult { saved: vec![], error: Some(format!("{error} Any files already written are retained; existing files were not overwritten.")) },
    }) }).await.map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn root() -> PathBuf {
        let folder = std::env::temp_dir().join(format!(
            "yomikura-export-check-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir(&folder).unwrap();
        folder
    }
    fn page() -> ExportPage {
        ExportPage {
            name: "001.png".into(),
            bytes: b"\x89PNG\r\n\x1a\nexport-fixture".to_vec(),
        }
    }
    #[test]
    fn rejects_traversal_reserved_names_duplicates_and_format_mismatches() {
        for name in ["../outside", "CON", "folder/child", "trailing."] {
            assert!(validate(Some(name), None, &[page()]).is_err());
        }
        assert!(validate(None, None, &[page(), page()]).is_err());
        assert!(validate(None, Some("file.zip"), &[page()]).is_err());
        assert!(validate(
            None,
            None,
            &[ExportPage {
                name: "001.jpg".into(),
                ..page()
            }]
        )
        .is_err());
        assert!(validate(
            None,
            None,
            &[ExportPage {
                name: "001.png".into(),
                bytes: b"<html>not an image</html>".to_vec()
            }]
        )
        .is_err());
    }
    #[test]
    fn exports_verified_pages_without_overwriting_a_collision() {
        let root = root();
        let first = write_export(&root, Some("Comic"), None, &[page()]).unwrap();
        let second = write_export(&root, Some("Comic"), None, &[page()]).unwrap();
        assert_ne!(first, second);
        assert_eq!(fs::read(&first[0]).unwrap(), page().bytes);
        assert_eq!(fs::read(&second[0]).unwrap(), page().bytes);
    }
    #[test]
    fn validates_every_page_before_creating_a_title_folder() {
        let root = root();
        assert!(write_export(
            &root,
            Some("Comic"),
            None,
            &[
                page(),
                ExportPage {
                    name: "bad.png".into(),
                    bytes: vec![0]
                }
            ]
        )
        .is_err());
        assert!(!root.join("Comic").exists());
    }
    #[test]
    fn exports_cbz_in_page_order_with_original_bytes_and_collision_safety() {
        let root = root();
        let second = ExportPage {
            name: "002.png".into(),
            bytes: b"\x89PNG\r\n\x1a\nsecond".to_vec(),
        };
        let paths = write_export(
            &root,
            Some("Comic"),
            Some("Chapter 1.cbz"),
            &[page(), second],
        )
        .unwrap();
        let mut archive = zip::ZipArchive::new(File::open(&paths[0]).unwrap()).unwrap();
        assert_eq!(archive.len(), 2);
        assert_eq!(archive.by_index(0).unwrap().name(), "001.png");
        assert_eq!(archive.by_index(1).unwrap().name(), "002.png");
        assert_ne!(
            paths,
            write_export(&root, Some("Comic"), Some("Chapter 1.cbz"), &[page()]).unwrap()
        );
    }
}
