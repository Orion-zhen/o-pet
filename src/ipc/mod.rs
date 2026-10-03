mod connection;
mod endpoint;
mod protocol;
#[cfg(unix)]
mod readiness;
#[cfg(windows)]
mod windows;

#[cfg(windows)]
pub use windows::Server;

use std::{io, sync::Arc};

use interprocess::local_socket::ListenerOptions;
#[cfg(unix)]
use interprocess::local_socket::{GenericFilePath, Stream, ToFsName as _, traits::Listener as _};

#[cfg(unix)]
use interprocess::local_socket::traits::Stream as _;
#[cfg(unix)]
use std::{
    fs,
    io::Read,
    os::{fd::AsFd, unix::net::UnixStream},
    path::{Path, PathBuf},
    sync::Mutex,
    thread::{self, JoinHandle},
    time::Duration,
};

use crate::coordinator::AnimationUpdate;
#[cfg(unix)]
use crate::coordinator::Coordinator;
#[cfg(unix)]
use connection::Connection;

pub use endpoint::resolve_endpoint;
pub use protocol::MAX_LINE_BYTES;

#[cfg(unix)]
const ACCEPT_ERROR_DELAY: Duration = Duration::from_millis(10);

type AnimationSink = Arc<dyn Fn(AnimationUpdate) + Send + Sync>;

#[cfg(unix)]
pub struct Server {
    accept_thread: Option<JoinHandle<()>>,
    cancel_writer: Option<UnixStream>,
}

#[cfg(unix)]
impl Server {
    pub fn bind(
        endpoint: impl Into<PathBuf>,
        sink: impl Fn(AnimationUpdate) + Send + Sync + 'static,
    ) -> io::Result<Self> {
        let endpoint = endpoint.into();
        endpoint::prepare_parent(&endpoint)?;
        let listener = create_listener(&endpoint)?;
        let sink: AnimationSink = Arc::new(sink);
        let (cancel_writer, cancel_reader) = UnixStream::pair()?;
        let accept_thread = thread::Builder::new()
            .name("o-pet-ipc-listener".into())
            .spawn(move || accept_connections(listener, sink, Arc::new(cancel_reader)))?;
        Ok(Self {
            accept_thread: Some(accept_thread),
            cancel_writer: Some(cancel_writer),
        })
    }

    pub fn shutdown(mut self) {
        self.stop();
    }

    fn stop(&mut self) {
        drop(self.cancel_writer.take());
        if let Some(thread) = self.accept_thread.take() {
            let _ = thread.join();
        }
    }
}

#[cfg(unix)]
impl Drop for Server {
    fn drop(&mut self) {
        self.stop();
    }
}

#[cfg(unix)]
fn create_listener(endpoint: &Path) -> io::Result<interprocess::local_socket::Listener> {
    let name = endpoint.as_os_str().to_fs_name::<GenericFilePath>()?;
    let listener = match listener_options(name)?.create_sync() {
        Ok(listener) => listener,
        Err(error) if error.kind() == io::ErrorKind::AddrInUse => {
            reclaim_stale_socket(endpoint, error)?
        }
        Err(error) => return Err(error),
    };
    secure_socket_permissions(endpoint)?;
    Ok(listener)
}

#[cfg(unix)]
fn secure_socket_permissions(endpoint: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    fs::set_permissions(endpoint, fs::Permissions::from_mode(0o600))
}

fn listener_options(name: interprocess::local_socket::Name<'_>) -> io::Result<ListenerOptions<'_>> {
    let options = ListenerOptions::new().name(name);
    #[cfg(unix)]
    let options = options.nonblocking(interprocess::local_socket::ListenerNonblockingMode::Both);
    platform_listener_options(options)
}

#[cfg(target_os = "linux")]
fn platform_listener_options(options: ListenerOptions<'_>) -> io::Result<ListenerOptions<'_>> {
    use interprocess::os::unix::local_socket::ListenerOptionsExt;
    Ok(options.mode(0o600))
}

#[cfg(all(unix, not(target_os = "linux")))]
fn platform_listener_options(options: ListenerOptions<'_>) -> io::Result<ListenerOptions<'_>> {
    Ok(options)
}

#[cfg(windows)]
fn platform_listener_options(options: ListenerOptions<'_>) -> io::Result<ListenerOptions<'_>> {
    use interprocess::os::windows::{
        local_socket::ListenerOptionsExt, security_descriptor::SecurityDescriptor,
    };
    use widestring::U16CString;

    // 受保护 DACL 只授权对象所有者和 LocalSystem，避免其他本地用户写入管道。
    let sddl = U16CString::from_str_truncate("D:P(A;;GA;;;OW)(A;;GA;;;SY)");
    let descriptor = SecurityDescriptor::deserialize(&sddl)?;
    Ok(options.security_descriptor(descriptor))
}

#[cfg(unix)]
fn reclaim_stale_socket(
    endpoint: &Path,
    address_in_use: io::Error,
) -> io::Result<interprocess::local_socket::Listener> {
    use std::os::unix::fs::{FileTypeExt, MetadataExt};

    let name = endpoint.as_os_str().to_fs_name::<GenericFilePath>()?;
    match Stream::connect(name) {
        Ok(_) => return Err(address_in_use),
        Err(error) if error.kind() == io::ErrorKind::ConnectionRefused => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            let retry_name = endpoint.as_os_str().to_fs_name::<GenericFilePath>()?;
            return listener_options(retry_name)?.create_sync();
        }
        Err(error) => return Err(error),
    }

    let metadata = fs::symlink_metadata(endpoint)?;
    if !metadata.file_type().is_socket() || metadata.uid() != unsafe { libc::geteuid() } {
        return Err(address_in_use);
    }
    fs::remove_file(endpoint)?;
    let retry_name = endpoint.as_os_str().to_fs_name::<GenericFilePath>()?;
    listener_options(retry_name)?.create_sync()
}

#[cfg(unix)]
fn accept_connections(
    listener: interprocess::local_socket::Listener,
    sink: AnimationSink,
    cancellation: Arc<UnixStream>,
) {
    let coordinator = Arc::new(Mutex::new(Coordinator::default()));
    let mut readers: Vec<JoinHandle<()>> = Vec::new();
    let mut next_connection_id = 1_u64;

    loop {
        {
            let interprocess::local_socket::Listener::UdSocket(socket) = &listener;
            match readiness::wait_for_input(socket.as_fd(), &cancellation) {
                Ok(true) => {}
                Ok(false) => break,
                Err(error) => {
                    eprintln!("o-pet 等待 IPC 连接失败: {error}");
                    break;
                }
            }
        }
        match listener.accept() {
            Ok(stream) => {
                let connection_id = next_connection_id;
                next_connection_id += 1;
                let connection =
                    Connection::new(connection_id, Arc::clone(&coordinator), Arc::clone(&sink));
                let reader_cancellation = Arc::clone(&cancellation);
                readers.push(thread::spawn(move || {
                    read_connection(stream, connection, reader_cancellation);
                }));
            }
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {}
            Err(error) => {
                eprintln!("o-pet 接受 IPC 连接失败: {error}");
                thread::sleep(ACCEPT_ERROR_DELAY);
            }
        }
        reap_finished(&mut readers);
    }

    for reader in readers {
        let _ = reader.join();
    }
}

#[cfg(unix)]
fn reap_finished(readers: &mut Vec<JoinHandle<()>>) {
    let mut index = 0;
    while index < readers.len() {
        if readers[index].is_finished() {
            let reader = readers.swap_remove(index);
            let _ = reader.join();
        } else {
            index += 1;
        }
    }
}

#[cfg(unix)]
fn read_connection(mut stream: Stream, mut connection: Connection, cancellation: Arc<UnixStream>) {
    let mut buffer = [0_u8; 8192];
    loop {
        {
            let Stream::UdSocket(socket) = &stream;
            match readiness::wait_for_input(socket.as_fd(), &cancellation) {
                Ok(true) => {}
                Ok(false) => break,
                Err(error) => {
                    eprintln!("o-pet 等待 IPC 数据失败: {error}");
                    break;
                }
            }
        }
        match stream.read(&mut buffer) {
            Ok(0) => break,
            Ok(length) => {
                if !connection.receive(&buffer[..length]) {
                    break;
                }
            }
            Err(error)
                if matches!(
                    error.kind(),
                    io::ErrorKind::WouldBlock | io::ErrorKind::Interrupted
                ) => {}
            Err(_) => break,
        }
    }
}

fn publish_change(update: Option<AnimationUpdate>, sink: &AnimationSink) {
    if let Some(update) = update {
        sink(update);
    }
}
