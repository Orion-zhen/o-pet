mod platform;
mod renderer;

#[cfg(target_os = "linux")]
fn main() -> gtk::glib::ExitCode {
    platform::linux::run()
}

#[cfg(target_os = "macos")]
fn main() {
    platform::macos::run();
}

#[cfg(target_os = "windows")]
fn main() {
    platform::windows::run();
}

#[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
fn main() {
    eprintln!("o-pet 不支持当前平台");
    std::process::exit(1);
}
