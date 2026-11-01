#[cfg(target_os = "windows")]
pub fn verify(owner: isize) -> Result<(), String> {
    use windows::core::HSTRING;
    use windows::Security::Credentials::UI::{
        UserConsentVerificationResult, UserConsentVerifier, UserConsentVerifierAvailability,
    };
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::WinRT::{
        IUserConsentVerifierInterop, RoGetActivationFactory, RoInitialize, RoUninitialize,
        RO_INIT_MULTITHREADED,
    };
    struct Apartment;
    impl Drop for Apartment {
        fn drop(&mut self) {
            unsafe { RoUninitialize() };
        }
    }
    // This owned worker initializes its own WinRT apartment and only passes the
    // current app HWND. Windows handles credentials; no secret enters WebView.
    unsafe {
        RoInitialize(RO_INIT_MULTITHREADED)
            .map_err(|_| "Windows verification couldn’t start.".to_string())?;
        let _apartment = Apartment;
        let available = UserConsentVerifier::CheckAvailabilityAsync()
            .and_then(|operation| operation.get())
            .map_err(|_| "Windows Hello availability couldn’t be checked.".to_string())?;
        if available != UserConsentVerifierAvailability::Available {
            return Err(
                "Set up Windows Hello in Windows settings before enabling app lock.".into(),
            );
        }
        let factory: IUserConsentVerifierInterop = RoGetActivationFactory(&HSTRING::from(
            "Windows.Security.Credentials.UI.UserConsentVerifier",
        ))
        .map_err(|_| "Windows Hello couldn’t open for this app.".to_string())?;
        let operation: windows_future::IAsyncOperation<UserConsentVerificationResult> = factory
            .RequestVerificationForWindowAsync(
                HWND(owner as *mut core::ffi::c_void),
                &HSTRING::from("Unlock your Yomikura reading room"),
            )
            .map_err(|_| "Windows verification couldn’t open.".to_string())?;
        match operation
            .get()
            .map_err(|_| "Windows verification wasn’t confirmed.".to_string())?
        {
            UserConsentVerificationResult::Verified => Ok(()),
            _ => Err(
                "Windows verification wasn’t completed. Your reading room remains locked.".into(),
            ),
        }
    }
}
#[cfg(not(target_os = "windows"))]
pub fn verify(_owner: isize) -> Result<(), String> {
    Err("Device authentication isn’t supported by this desktop build.".into())
}
