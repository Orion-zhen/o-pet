use std::{error::Error, io};

use objc2::MainThreadMarker;
use objc2_app_kit::{
    NSColor, NSFloatingWindowLevel, NSWindow, NSWindowCollectionBehavior, NSWindowStyleMask,
};
use tao::{
    event_loop::EventLoop,
    monitor::MonitorHandle,
    platform::macos::{
        ActivationPolicy, EventLoopExtMacOS, MonitorHandleExtMacOS, WindowBuilderExtMacOS,
        WindowExtMacOS,
    },
    window::{Window, WindowBuilder},
};

pub(crate) fn run() {
    if let Err(error) = super::desktop::run() {
        eprintln!("无法启动 o-pet macOS 后端: {error}");
        std::process::exit(1);
    }
}

pub(super) fn configure_event_loop<T: 'static>(event_loop: &mut EventLoop<T>) {
    event_loop.set_activation_policy(ActivationPolicy::Accessory);
    event_loop.set_dock_visibility(false);
    event_loop.set_activate_ignoring_other_apps(false);
}

pub(super) fn window_builder(builder: WindowBuilder) -> WindowBuilder {
    builder
        .with_focusable(false)
        .with_titlebar_hidden(true)
        .with_titlebar_buttons_hidden(true)
        .with_has_shadow(false)
        .with_movable_by_window_background(false)
        .with_automatic_window_tabbing(false)
}

pub(super) fn configure_window(window: &Window) -> Result<(), Box<dyn Error>> {
    let _main_thread = MainThreadMarker::new().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::Unsupported,
            "AppKit 窗口必须在 macOS 主线程配置",
        )
    })?;
    let ns_window = unsafe { window.ns_window().cast::<NSWindow>().as_ref() }
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "Tao 未提供 NSWindow"))?;

    ns_window.setStyleMask(NSWindowStyleMask::Borderless | NSWindowStyleMask::NonactivatingPanel);
    ns_window.setLevel(NSFloatingWindowLevel);
    ns_window.setCollectionBehavior(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::FullScreenAuxiliary
            | NSWindowCollectionBehavior::IgnoresCycle,
    );
    ns_window.setHidesOnDeactivate(false);
    ns_window.setCanHide(false);
    ns_window.setExcludedFromWindowsMenu(true);
    ns_window.setOpaque(false);
    ns_window.setBackgroundColor(Some(&NSColor::clearColor()));
    ns_window.setHasShadow(false);
    Ok(())
}

pub(super) fn monitor_id(monitor: &MonitorHandle) -> String {
    monitor.native_id().to_string()
}
