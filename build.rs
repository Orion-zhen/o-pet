fn main() {
    println!("cargo:rerun-if-changed=assets/app-icon.ico");

    #[cfg(target_os = "windows")]
    winresource::WindowsResource::new()
        .set_icon("assets/app-icon.ico")
        .compile()
        .expect("无法嵌入 Windows 应用图标");
}
