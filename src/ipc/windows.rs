use std::{
    io,
    path::PathBuf,
    sync::{Arc, Mutex},
    thread::{self, JoinHandle},
};

use interprocess::local_socket::{
    GenericFilePath, ToFsName as _,
    tokio::{Listener, Stream},
    traits::tokio::Listener as _,
};
use tokio::{io::AsyncReadExt, runtime::Builder, sync::watch, task::JoinSet};

use super::{AnimationSink, connection::Connection, listener_options};
use crate::coordinator::{AnimationUpdate, Coordinator};

pub struct Server {
    shutdown: Option<watch::Sender<()>>,
    accept_thread: Option<JoinHandle<()>>,
}

impl Server {
    pub fn bind(
        endpoint: impl Into<PathBuf>,
        sink: impl Fn(AnimationUpdate) + Send + Sync + 'static,
    ) -> io::Result<Self> {
        let endpoint = endpoint.into();
        let runtime = Builder::new_current_thread().enable_io().build()?;
        let listener = {
            let _guard = runtime.enter();
            let name = endpoint.as_os_str().to_fs_name::<GenericFilePath>()?;
            listener_options(name)?.create_tokio()?
        };
        let (shutdown, cancellation) = watch::channel(());
        let sink: AnimationSink = Arc::new(sink);
        let accept_thread = thread::Builder::new()
            .name("o-pet-ipc-listener".into())
            .spawn(move || runtime.block_on(accept_connections(listener, cancellation, sink)))?;
        Ok(Self {
            shutdown: Some(shutdown),
            accept_thread: Some(accept_thread),
        })
    }

    pub fn shutdown(mut self) {
        self.stop();
    }

    fn stop(&mut self) {
        // 关闭唯一发送端同时唤醒监听任务和所有读取任务, 不需要轮询退出标志.
        drop(self.shutdown.take());
        if let Some(thread) = self.accept_thread.take() {
            thread.join().expect("IPC listener thread panicked");
        }
    }
}

impl Drop for Server {
    fn drop(&mut self) {
        self.stop();
    }
}

async fn accept_connections(
    listener: Listener,
    mut cancellation: watch::Receiver<()>,
    sink: AnimationSink,
) {
    let coordinator = Arc::new(Mutex::new(Coordinator::default()));
    let mut readers = JoinSet::new();
    let mut next_connection_id = 1_u64;
    loop {
        tokio::select! {
            biased;
            _ = cancellation.changed() => break,
            result = readers.join_next(), if !readers.is_empty() => {
                result.expect("reader set must not be empty").expect("IPC reader task panicked");
            }
            result = listener.accept() => {
                let stream = match result {
                    Ok(stream) => stream,
                    Err(error) => {
                        eprintln!("o-pet 接受 IPC 连接失败: {error}");
                        break;
                    }
                };
                let connection = Connection::new(
                    next_connection_id,
                    Arc::clone(&coordinator),
                    Arc::clone(&sink),
                );
                next_connection_id += 1;
                readers.spawn(read_connection(stream, connection, cancellation.clone()));
            }
        }
    }
    drop(listener);
    // 监听失败时也需要释放仍在等待读取的连接. 等待取消完成后再销毁运行时.
    readers.abort_all();
    while let Some(result) = readers.join_next().await {
        if let Err(error) = result {
            assert!(error.is_cancelled(), "IPC reader task panicked: {error}");
        }
    }
}

async fn read_connection(
    mut stream: Stream,
    mut connection: Connection,
    mut cancellation: watch::Receiver<()>,
) {
    let mut buffer = [0_u8; 8192];
    loop {
        let result = tokio::select! {
            biased;
            _ = cancellation.changed() => break,
            result = stream.read(&mut buffer) => result,
        };
        match result {
            Ok(0) => break,
            Ok(length) => {
                if !connection.receive(&buffer[..length]) {
                    break;
                }
            }
            Err(error) if error.kind() == io::ErrorKind::Interrupted => {}
            Err(_) => break,
        }
    }
}
