#[cfg(target_os = "windows")]
const ES_CONTINUOUS: u32 = 0x8000_0000;
#[cfg(target_os = "windows")]
const ES_DISPLAY_REQUIRED: u32 = 0x0000_0002;

#[cfg(target_os = "windows")]
#[link(name = "kernel32")]
extern "system" {
    fn SetThreadExecutionState(flags: u32) -> u32;
}

#[cfg(any(target_os = "windows", test))]
#[derive(Default)]
struct WakeLeases(std::collections::HashMap<String, std::time::Instant>);
#[cfg(any(target_os = "windows", test))]
impl WakeLeases {
    fn update(&mut self, owner: String, enabled: bool, now: std::time::Instant) {
        if enabled {
            self.0.insert(owner, now);
        } else {
            self.0.remove(&owner);
        }
    }
    fn active(&mut self, now: std::time::Instant) -> bool {
        self.0.retain(|_, renewed| {
            now.saturating_duration_since(*renewed) < std::time::Duration::from_secs(75)
        });
        !self.0.is_empty()
    }
}

/// Windows execution state belongs to the requesting thread. Keep one worker
/// for both acquire and release instead of depending on an invoke pool thread.
#[tauri::command]
pub fn set_reader_keep_awake(
    window: tauri::WebviewWindow,
    owner: String,
    enabled: bool,
) -> Result<(), String> {
    if owner.is_empty() || owner.len() > 128 {
        return Err("Invalid reader wake owner.".into());
    }
    #[cfg(target_os = "windows")]
    {
        let enabled = enabled
            && window.is_visible().unwrap_or(false)
            && !window.is_minimized().unwrap_or(true);
        use std::sync::{mpsc, OnceLock};
        type Request = (String, bool, mpsc::SyncSender<Result<(), String>>);
        static WORKER: OnceLock<Result<mpsc::Sender<Request>, String>> = OnceLock::new();
        let worker = WORKER.get_or_init(|| {
            let (sender, receiver) = mpsc::channel::<Request>();
            std::thread::Builder::new()
                .name("yomikura-reader-wake".into())
                .spawn(move || {
                    let mut owners = WakeLeases::default();
                    loop {
                        let request =
                            match receiver.recv_timeout(std::time::Duration::from_secs(15)) {
                                Ok((owner, enabled, reply)) => {
                                    owners.update(owner, enabled, std::time::Instant::now());
                                    Some(reply)
                                }
                                Err(mpsc::RecvTimeoutError::Timeout) => None,
                                Err(mpsc::RecvTimeoutError::Disconnected) => break,
                            };
                        let flags = ES_CONTINUOUS
                            | if owners.active(std::time::Instant::now()) {
                                ES_DISPLAY_REQUIRED
                            } else {
                                0
                            };
                        // SAFETY: documented kernel32 call with constant flags,
                        // always on this owned worker. No pointers cross FFI.
                        let previous = unsafe { SetThreadExecutionState(flags) };
                        if let Some(reply) = request {
                            let _ = reply.send(if previous == 0 {
                                Err("Windows could not keep the screen awake.".into())
                            } else {
                                Ok(())
                            });
                        }
                    }
                    // SAFETY: clear only the execution state of this worker.
                    unsafe { SetThreadExecutionState(ES_CONTINUOUS) };
                })
                .map_err(|error| format!("Reader wake worker could not start: {error}"))?;
            Ok(sender)
        });
        let worker = worker.as_ref().map_err(Clone::clone)?;
        let (reply, response) = mpsc::sync_channel(1);
        worker
            .send((owner, enabled, reply))
            .map_err(|_| "Reader wake worker stopped.".to_string())?;
        response
            .recv_timeout(std::time::Duration::from_secs(2))
            .map_err(|_| "Reader wake request timed out.".to_string())?
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (enabled, owner, window);
        Err("Use the screen wake capability supplied by this system's WebView.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::WakeLeases;
    use std::time::{Duration, Instant};
    #[test]
    fn releasing_one_reader_keeps_another_readers_lease() {
        let now = Instant::now();
        let mut leases = WakeLeases::default();
        leases.update("first".into(), true, now);
        leases.update("second".into(), true, now);
        leases.update("first".into(), false, now);
        assert!(leases.active(now));
        leases.update("second".into(), false, now);
        assert!(!leases.active(now));
    }
    #[test]
    fn abandoned_readers_expire_but_recent_renewals_remain_active() {
        let now = Instant::now();
        let mut leases = WakeLeases::default();
        leases.update("abandoned".into(), true, now);
        leases.update("active".into(), true, now + Duration::from_secs(60));
        assert!(leases.active(now + Duration::from_secs(80)));
        leases.update("active".into(), false, now);
        assert!(!leases.active(now + Duration::from_secs(80)));
    }
}
