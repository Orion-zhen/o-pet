use std::{
    io,
    os::{
        fd::{AsRawFd, BorrowedFd},
        unix::net::UnixStream,
    },
};

pub(super) fn wait_for_input(fd: BorrowedFd<'_>, cancellation: &UnixStream) -> io::Result<bool> {
    let mut descriptors = [
        libc::pollfd {
            fd: fd.as_raw_fd(),
            events: libc::POLLIN,
            revents: 0,
        },
        libc::pollfd {
            fd: cancellation.as_raw_fd(),
            events: libc::POLLIN,
            revents: 0,
        },
    ];
    loop {
        // 两个描述符在等待期间保持打开. 关闭取消通道的写端会唤醒所有等待者,
        // 无需读取或消耗通知, 因而监听线程和所有读取线程都能观察到退出.
        let result = unsafe { libc::poll(descriptors.as_mut_ptr(), descriptors.len() as _, -1) };
        if result < 0 {
            let error = io::Error::last_os_error();
            if error.kind() == io::ErrorKind::Interrupted {
                continue;
            }
            return Err(error);
        }
        if descriptors[1].revents != 0 {
            return Ok(false);
        }
        if descriptors[0].revents & libc::POLLNVAL != 0 {
            return Err(io::Error::from_raw_os_error(libc::EBADF));
        }
        return Ok(true);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::Write,
        os::fd::AsFd,
        sync::{Arc, mpsc},
        thread,
        time::Duration,
    };

    #[test]
    fn wakes_for_input_and_peer_disconnect() {
        let (mut writer, reader) = UnixStream::pair().unwrap();
        let (_cancel_writer, cancel_reader) = UnixStream::pair().unwrap();
        writer.write_all(b"event").unwrap();
        assert!(wait_for_input(reader.as_fd(), &cancel_reader).unwrap());

        let (writer, reader) = UnixStream::pair().unwrap();
        drop(writer);
        assert!(wait_for_input(reader.as_fd(), &cancel_reader).unwrap());
    }

    #[test]
    fn cancellation_wakes_every_waiter_and_future_waits() {
        let (cancel_writer, cancel_reader) = UnixStream::pair().unwrap();
        let cancellation = Arc::new(cancel_reader);
        let (sender, receiver) = mpsc::channel();
        let mut threads = Vec::new();
        for _ in 0..4 {
            let cancellation = Arc::clone(&cancellation);
            let sender = sender.clone();
            threads.push(thread::spawn(move || {
                let (_writer, reader) = UnixStream::pair().unwrap();
                sender
                    .send(wait_for_input(reader.as_fd(), &cancellation).unwrap())
                    .unwrap();
            }));
        }
        assert!(receiver.recv_timeout(Duration::from_millis(50)).is_err());
        drop(cancel_writer);
        for _ in 0..4 {
            assert!(!receiver.recv_timeout(Duration::from_secs(2)).unwrap());
        }
        for thread in threads {
            thread.join().unwrap();
        }
        let (mut writer, reader) = UnixStream::pair().unwrap();
        writer.write_all(b"ready too").unwrap();
        assert!(!wait_for_input(reader.as_fd(), &cancellation).unwrap());
    }
}
