use std::{
    env, io,
    path::{Path, PathBuf},
};

#[cfg(unix)]
use std::fs;

#[cfg(windows)]
use std::ffi::OsString;

const ENDPOINT_ENV: &str = "O_PET_ENDPOINT";

pub fn resolve_endpoint() -> io::Result<PathBuf> {
    if let Some(endpoint) = env::var_os(ENDPOINT_ENV).filter(|value| !value.is_empty()) {
        return Ok(PathBuf::from(endpoint));
    }
    default_endpoint()
}

#[cfg(target_os = "linux")]
fn default_endpoint() -> io::Result<PathBuf> {
    let runtime_directory = env::var_os("XDG_RUNTIME_DIR")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "o-pet 需要 XDG_RUNTIME_DIR"))?;
    Ok(PathBuf::from(runtime_directory).join("o-pet.sock"))
}

#[cfg(target_os = "macos")]
fn default_endpoint() -> io::Result<PathBuf> {
    let uid = unsafe { libc::getuid() };
    Ok(env::temp_dir()
        .join(format!("o-pet-{uid}"))
        .join("o-pet.sock"))
}

#[cfg(windows)]
fn default_endpoint() -> io::Result<PathBuf> {
    use std::fmt::Write as _;

    use sha2::{Digest, Sha256};

    let username = required_environment("USERNAME")?;
    let home = required_environment("USERPROFILE")?;
    let mut digest = Sha256::new();
    digest.update(username.to_string_lossy().as_bytes());
    digest.update([0]);
    digest.update(home.to_string_lossy().as_bytes());
    let digest = digest.finalize();
    let mut identity = String::with_capacity(16);
    for byte in &digest[..8] {
        write!(&mut identity, "{byte:02x}").expect("writing to a String cannot fail");
    }
    Ok(PathBuf::from(format!(r"\\.\pipe\o-pet-{identity}")))
}

#[cfg(not(any(target_os = "linux", target_os = "macos", windows)))]
fn default_endpoint() -> io::Result<PathBuf> {
    Err(io::Error::new(
        io::ErrorKind::Unsupported,
        "o-pet 不支持当前平台",
    ))
}

#[cfg(windows)]
fn required_environment(name: &str) -> io::Result<OsString> {
    env::var_os(name)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, format!("缺少环境变量 {name}")))
}

#[cfg(unix)]
pub fn prepare_parent(endpoint: &Path) -> io::Result<()> {
    use std::os::unix::fs::{DirBuilderExt, MetadataExt, PermissionsExt};

    let parent = endpoint
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "o-pet 端点必须包含父目录"))?;
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true).mode(0o700).create(parent)?;
    let metadata = fs::metadata(parent)?;
    if !metadata.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "o-pet 端点父路径不是目录",
        ));
    }
    if metadata.uid() != unsafe { libc::geteuid() } {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "o-pet 端点目录属于其他用户",
        ));
    }
    if metadata.permissions().mode() & 0o077 != 0 {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "o-pet 端点目录必须仅允许当前用户访问",
        ));
    }
    Ok(())
}

#[cfg(windows)]
pub fn prepare_parent(_endpoint: &Path) -> io::Result<()> {
    Ok(())
}
