use std::{error::Error, ffi::c_void, io};

use tao::{
    event_loop::EventLoopBuilder,
    monitor::MonitorHandle,
    platform::windows::{
        EventLoopBuilderExtWindows, MonitorHandleExtWindows, WindowBuilderExtWindows,
        WindowExtWindows,
    },
    window::{Window, WindowBuilder},
};
use windows::Win32::{
    Foundation::HWND,
    UI::WindowsAndMessaging::{
        GWL_EXSTYLE, GetWindowLongPtrW, HWND_TOPMOST, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE,
        SWP_NOOWNERZORDER, SWP_NOSIZE, SetWindowLongPtrW, SetWindowPos, WS_EX_APPWINDOW,
        WS_EX_TOOLWINDOW,
    },
};

pub(crate) fn run(action: Option<String>) {
    if let Err(error) = super::desktop::run(action) {
        eprintln!("无法启动 o-pet Windows 后端: {error}");
        std::process::exit(1);
    }
}

pub(super) fn configure_event_loop_builder<T: 'static>(builder: &mut EventLoopBuilder<T>) {
    builder.with_dpi_aware(true);
}

pub(super) fn window_builder(builder: WindowBuilder) -> WindowBuilder {
    builder
        .with_skip_taskbar(true)
        .with_undecorated_shadow(false)
        .with_drag_and_drop(false)
}

pub(super) fn configure_window(window: &Window) -> Result<(), Box<dyn Error>> {
    window.set_skip_taskbar(true)?;
    window.set_undecorated_shadow(false);
    window.set_always_on_top(true);

    let hwnd = HWND(window.hwnd() as *mut c_void);
    let original_style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) } as u32;
    let tool_style = (original_style | WS_EX_TOOLWINDOW.0) & !WS_EX_APPWINDOW.0;
    unsafe {
        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, tool_style as isize);
    }
    let applied_style = unsafe { GetWindowLongPtrW(hwnd, GWL_EXSTYLE) } as u32;
    if applied_style & WS_EX_TOOLWINDOW.0 == 0 || applied_style & WS_EX_APPWINDOW.0 != 0 {
        return Err(io::Error::other("无法应用 Windows Tool Window 样式").into());
    }
    unsafe {
        SetWindowPos(
            hwnd,
            Some(HWND_TOPMOST),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_FRAMECHANGED,
        )
    }?;
    Ok(())
}

pub(super) fn monitor_id(monitor: &MonitorHandle) -> String {
    monitor.native_id()
}
