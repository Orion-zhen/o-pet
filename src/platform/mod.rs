#[cfg(any(target_os = "macos", target_os = "windows"))]
mod desktop;
#[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
mod icon;
#[cfg(target_os = "linux")]
pub(crate) mod linux;
#[cfg(target_os = "macos")]
pub(crate) mod macos;
#[cfg(any(target_os = "linux", target_os = "macos", target_os = "windows"))]
mod position;
#[cfg(target_os = "windows")]
pub(crate) mod windows;
