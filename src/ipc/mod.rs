mod endpoint;
mod protocol;

use std::{
    io,
    io::Read,
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::Duration,
};

use interprocess::local_socket::{
    GenericFilePath, ListenerOptions, Stream, ToFsName as _, traits::Listener as _,
};

#[cfg(unix)]
use interprocess::local_socket::traits::Stream as _;
#[cfg(unix)]
use std::fs;

use crate::coordinator::{AnimationUpdate, Coordinator};
use protocol::{ClientMessage, LineDecoder, parse_message};

pub use endpoint::resolve_endpoint;
pub use protocol::MAX_LINE_BYTES;

const POLL_INTERVAL: Duration = Duration::from_millis(10);
#[cfg(unix)]
const READ_TIMEOUT: Duration = Duration::from_millis(50);

type AnimationSink = Arc<dyn Fn(AnimationUpdate) + Send + Sync>;

pub struct Server {
    shutdown: Arc<AtomicBool>,
    accept_thread: Option<JoinHandle<()>>,
}

impl Server {
    pub fn bind(
        endpoint: impl Into<PathBuf>,
        sink: impl Fn(AnimationUpdate) + Send + Sync + 'static,
    ) -> io::Result<Self> {
        let endpoint = endpoint.into();
        endpoint::prepare_parent(&endpoint)?;
        let listener = create_listener(&endpoint)?;
        let shutdown = Arc::new(AtomicBool::new(false));
        let thread_shutdown = Arc::clone(&shutdown);
        let sink: AnimationSink = Arc::new(sink);
        let accept_thread = thread::Builder::new()
            .name("o-pet-ipc-listener".into())
            .spawn(move || accept_connections(listener, thread_shutdown, sink))?;
        Ok(Self {
            shutdown,
            accept_thread: Some(accept_thread),
        })
    }

    pub fn shutdown(mut self) {
        self.stop();
    }

    fn stop(&mut self) {
        self.shutdown.store(true, Ordering::Release);
        if let Some(thread) = self.accept_thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.stop();
    }
}

fn create_listener(endpoint: &Path) -> io::Result<interprocess::local_socket::Listener> {
    let name = endpoint.as_os_str().to_fs_name::<GenericFilePath>()?;
    let listener = match listener_options(name)?.create_sync() {
        Ok(listener) => listener,
        #[cfg(unix)]
        Err(error) if error.kind() == io::ErrorKind::AddrInUse => {
            reclaim_stale_socket(endpoint, error)?
        }
        Err(error) => return Err(error),
    };
    #[cfg(unix)]
    secure_socket_permissions(endpoint)?;
    Ok(listener)
}

#[cfg(unix)]
fn secure_socket_permissions(endpoint: &Path) -> io::Result<()> {
    use std::os::unix::fs::PermissionsExt;

    fs::set_permissions(endpoint, fs::Permissions::from_mode(0o600))
}

fn listener_options(name: interprocess::local_socket::Name<'_>) -> io::Result<ListenerOptions<'_>> {
    use interprocess::local_socket::ListenerNonblockingMode;

    let options = ListenerOptions::new()
        .name(name)
        .nonblocking(ListenerNonblockingMode::Accept);
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

fn accept_connections(
    listener: interprocess::local_socket::Listener,
    shutdown: Arc<AtomicBool>,
    sink: AnimationSink,
) {
    let coordinator = Arc::new(Mutex::new(Coordinator::default()));
    let mut readers: Vec<JoinHandle<()>> = Vec::new();
    let mut next_connection_id = 1_u64;

    while !shutdown.load(Ordering::Acquire) {
        match listener.accept() {
            Ok(stream) => {
                let connection_id = next_connection_id;
                next_connection_id += 1;
                coordinator
                    .lock()
                    .expect("coordinator mutex poisoned")
                    .connect(connection_id);
                let reader_shutdown = Arc::clone(&shutdown);
                let reader_coordinator = Arc::clone(&coordinator);
                let reader_sink = Arc::clone(&sink);
                readers.push(thread::spawn(move || {
                    read_connection(
                        stream,
                        connection_id,
                        reader_shutdown,
                        reader_coordinator,
                        reader_sink,
                    );
                }));
            }
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                thread::sleep(POLL_INTERVAL);
            }
            Err(error) => {
                eprintln!("o-pet 接受 IPC 连接失败: {error}");
                thread::sleep(POLL_INTERVAL);
            }
        }
        reap_finished(&mut readers);
    }

    for reader in readers {
        let _ = reader.join();
    }
}

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

fn read_connection(
    mut stream: Stream,
    connection_id: u64,
    shutdown: Arc<AtomicBool>,
    coordinator: Arc<Mutex<Coordinator>>,
    sink: AnimationSink,
) {
    #[cfg(unix)]
    if let Err(error) = stream.set_recv_timeout(Some(READ_TIMEOUT)) {
        eprintln!("o-pet 设置 IPC 读取超时失败: {error}");
        disconnect(connection_id, &coordinator, &sink);
        return;
    }

    let mut hello_received = false;
    let mut decoder = LineDecoder::default();
    let mut buffer = [0_u8; 8192];
    'connection: while !shutdown.load(Ordering::Acquire) {
        #[cfg(windows)]
        match windows_stream_has_input(&stream) {
            Ok(true) => {}
            Ok(false) => {
                thread::sleep(POLL_INTERVAL);
                continue;
            }
            Err(_) => break,
        }
        match stream.read(&mut buffer) {
            Ok(0) => break,
            Ok(length) => {
                let batch = decoder.push(&buffer[..length]);
                for line in batch.lines {
                    match parse_message(&line) {
                        ClientMessage::Hello { .. } if !hello_received => {
                            hello_received = true;
                        }
                        ClientMessage::Event(event) if hello_received => {
                            publish_change(
                                coordinator
                                    .lock()
                                    .expect("coordinator mutex poisoned")
                                    .event(connection_id, event),
                                &sink,
                            );
                        }
                        ClientMessage::Goodbye => break 'connection,
                        ClientMessage::Hello { .. }
                        | ClientMessage::Event(_)
                        | ClientMessage::Ignore => {}
                    }
                }
                if batch.oversized {
                    break;
                }
            }
            Err(error)
                if matches!(
                    error.kind(),
                    io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut
                ) => {}
            Err(_) => break,
        }
    }
    disconnect(connection_id, &coordinator, &sink);
}

#[cfg(windows)]
fn windows_stream_has_input(stream: &Stream) -> io::Result<bool> {
    use std::os::windows::io::AsRawHandle;

    use windows::Win32::{Foundation::HANDLE, System::Pipes::PeekNamedPipe};

    let Stream::NamedPipe(stream) = stream;
    let handle = HANDLE(stream.inner().as_raw_handle());
    let mut available = 0;
    unsafe { PeekNamedPipe(handle, None, 0, None, Some(&mut available), None) }
        .map_err(io::Error::other)?;
    Ok(available != 0)
}

fn disconnect(connection_id: u64, coordinator: &Mutex<Coordinator>, sink: &AnimationSink) {
    publish_change(
        coordinator
            .lock()
            .expect("coordinator mutex poisoned")
            .disconnect(connection_id),
        sink,
    );
}

fn publish_change(update: Option<AnimationUpdate>, sink: &AnimationSink) {
    if let Some(update) = update {
        sink(update);
    }
}
