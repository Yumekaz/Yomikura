/// Return a client size only when the restored window would exceed the monitor's
/// usable area. Account for both display scaling and native window decorations.
fn bounded_client_size(
    inner: (u32, u32),
    outer: (u32, u32),
    work: (u32, u32),
    scale: f64,
) -> Option<(u32, u32)> {
    if work.0 == 0 || work.1 == 0 || outer.0 <= work.0 && outer.1 <= work.1 {
        return None;
    }
    let margin = (16.0 * scale.clamp(1.0, 4.0)).round() as u32 * 2;
    let decoration = (
        outer.0.saturating_sub(inner.0),
        outer.1.saturating_sub(inner.1),
    );
    Some((
        inner
            .0
            .min(work.0.saturating_sub(decoration.0 + margin).max(1)),
        inner
            .1
            .min(work.1.saturating_sub(decoration.1 + margin).max(1)),
    ))
}

pub fn fit_initial_window(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    if window.is_maximized()? || window.is_fullscreen()? {
        return Ok(());
    }
    let Some(monitor) = window.current_monitor()?.or(window.primary_monitor()?) else {
        return Ok(());
    };
    let inner = window.inner_size()?;
    let outer = window.outer_size()?;
    let work = monitor.work_area();
    if let Some((width, height)) = bounded_client_size(
        (inner.width, inner.height),
        (outer.width, outer.height),
        (work.size.width, work.size.height),
        monitor.scale_factor(),
    ) {
        window.set_size(tauri::PhysicalSize::new(width, height))?;
        let decorated_width = width + outer.width.saturating_sub(inner.width);
        let decorated_height = height + outer.height.saturating_sub(inner.height);
        window.set_position(tauri::PhysicalPosition::new(
            work.position.x + (work.size.width.saturating_sub(decorated_width) / 2) as i32,
            work.position.y + (work.size.height.saturating_sub(decorated_height) / 2) as i32,
        ))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::bounded_client_size;

    #[test]
    fn smaller_displays_keep_the_whole_decorated_window_above_the_taskbar() {
        let size = bounded_client_size((1280, 900), (1296, 939), (1280, 752), 1.0).unwrap();
        assert!(size.0 + 16 + 32 <= 1280);
        assert!(size.1 + 39 + 32 <= 752);
    }
    #[test]
    fn high_dpi_uses_physical_work_area_and_scaled_margins() {
        let size = bounded_client_size((1920, 1350), (1944, 1408), (1920, 1128), 1.5).unwrap();
        assert!(size.0 + 24 + 48 <= 1920);
        assert!(size.1 + 58 + 48 <= 1128);
    }
    #[test]
    fn a_fitting_saved_window_keeps_its_size() {
        assert_eq!(
            bounded_client_size((800, 600), (816, 639), (1280, 752), 1.0),
            None
        );
    }
    #[test]
    fn unavailable_monitor_dimensions_do_not_resize_the_window() {
        assert_eq!(
            bounded_client_size((800, 600), (816, 639), (0, 0), 1.0),
            None
        );
    }
}
