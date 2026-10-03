use std::{
    path::PathBuf,
    thread,
    time::{Duration, Instant},
};

#[cfg(unix)]
use std::{fs, os::unix::fs::PermissionsExt};

use interprocess::local_socket::{GenericFilePath, Stream, ToFsName as _, traits::Stream as _};
use o_pet::ipc::Server;

#[cfg(unix)]
fn process_cpu_seconds() -> f64 {
    let mut usage = std::mem::MaybeUninit::<libc::rusage>::uninit();
    // getrusage 在成功时初始化整个输出结构.
    assert_eq!(
        unsafe { libc::getrusage(libc::RUSAGE_SELF, usage.as_mut_ptr()) },
        0
    );
    let usage = unsafe { usage.assume_init() };
    (usage.ru_utime.tv_sec + usage.ru_stime.tv_sec) as f64
        + (usage.ru_utime.tv_usec + usage.ru_stime.tv_usec) as f64 / 1_000_000.0
}

#[cfg(windows)]
fn process_cpu_seconds() -> f64 {
    use windows::Win32::{
        Foundation::FILETIME,
        System::Threading::{GetCurrentProcess, GetProcessTimes},
    };
    let mut created = FILETIME::default();
    let mut exited = FILETIME::default();
    let mut kernel = FILETIME::default();
    let mut user = FILETIME::default();
    unsafe {
        GetProcessTimes(
            GetCurrentProcess(),
            &mut created,
            &mut exited,
            &mut kernel,
            &mut user,
        )
    }
    .expect("process CPU times");
    let ticks =
        |time: FILETIME| (u64::from(time.dwHighDateTime) << 32) | u64::from(time.dwLowDateTime);
    (ticks(kernel) + ticks(user)) as f64 / 10_000_000.0
}

fn test_endpoint(directory: &tempfile::TempDir) -> PathBuf {
    #[cfg(unix)]
    {
        directory.path().join("o-pet.sock")
    }
    #[cfg(windows)]
    {
        let unique = directory
            .path()
            .file_name()
            .expect("temporary directory name")
            .to_string_lossy();
        PathBuf::from(format!(
            r"\\.\pipe\o-pet-idle-{}-{unique}",
            std::process::id()
        ))
    }
}

#[test]
#[ignore = "单独运行 IPC 空闲 CPU 对比，避免与其他测试混合计量"]
fn idle_connections_do_not_spin() {
    let directory = tempfile::tempdir().expect("temporary directory");
    #[cfg(unix)]
    fs::set_permissions(directory.path(), fs::Permissions::from_mode(0o700))
        .expect("private endpoint directory");
    for count in [0, 3] {
        let endpoint = test_endpoint(&directory);
        let server = Server::bind(&endpoint, |_| {}).expect("server");
        let clients: Vec<_> = (0..count)
            .map(|_| {
                let name = endpoint
                    .as_os_str()
                    .to_fs_name::<GenericFilePath>()
                    .expect("endpoint name");
                Stream::connect(name).expect("client")
            })
            .collect();
        thread::sleep(Duration::from_millis(200));
        let mut cpu_fractions = Vec::new();
        for _ in 0..3 {
            let start = Instant::now();
            let cpu_before = process_cpu_seconds();
            thread::sleep(Duration::from_secs(2));
            let cpu = process_cpu_seconds() - cpu_before;
            cpu_fractions.push(cpu / start.elapsed().as_secs_f64());
        }
        cpu_fractions.sort_by(f64::total_cmp);
        let median = cpu_fractions[1];
        eprintln!(
            "{count} idle clients: median CPU = {:.4}% of one core",
            median * 100.0
        );
        // 阈值仅用于检测空闲读取忙循环, 不代表整机能耗目标.
        assert!(
            median < 0.05,
            "idle IPC must not consume a CPU core: {median}"
        );
        server.shutdown();
        drop(clients);
    }
}
