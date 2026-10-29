use windows::core::{HRESULT, HSTRING};
use windows::Win32::Foundation::{ERROR_CANCELLED, HWND};
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER,
    COINIT_APARTMENTTHREADED,
};
use windows::Win32::UI::Shell::{
    FileOpenDialog, IFileOpenDialog, FOS_FORCEFILESYSTEM, FOS_NOCHANGEDIR, FOS_PICKFOLDERS,
    SIGDN_FILESYSPATH,
};

struct Apartment;
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe {
            CoUninitialize();
        }
    }
}

/** Run on the dialog worker. Its COM apartment and returned path allocation have one owner. */
pub(crate) fn choose(title: &str, owner: isize) -> Result<Option<String>, String> {
    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED)
            .ok()
            .map_err(|error| format!("The folder chooser could not start: {error}"))?;
        let _apartment = Apartment;
        let dialog: IFileOpenDialog = CoCreateInstance(&FileOpenDialog, None, CLSCTX_INPROC_SERVER)
            .map_err(|error| error.to_string())?;
        dialog
            .SetOptions(
                dialog.GetOptions().map_err(|error| error.to_string())?
                    | FOS_PICKFOLDERS
                    | FOS_FORCEFILESYSTEM
                    | FOS_NOCHANGEDIR,
            )
            .map_err(|error| error.to_string())?;
        dialog
            .SetTitle(&HSTRING::from(title))
            .map_err(|error| error.to_string())?;
        if let Err(error) = dialog.Show(Some(HWND(owner as *mut core::ffi::c_void))) {
            if error.code() == HRESULT::from_win32(ERROR_CANCELLED.0) {
                return Ok(None);
            }
            return Err(format!("The folder chooser could not open: {error}"));
        }
        let selected = dialog
            .GetResult()
            .map_err(|error| error.to_string())?
            .GetDisplayName(SIGDN_FILESYSPATH)
            .map_err(|error| error.to_string())?;
        let path = selected.to_string().map_err(|error| error.to_string());
        CoTaskMemFree(Some(selected.0.cast()));
        Ok(Some(path?))
    }
}
