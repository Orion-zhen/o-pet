use std::{
    io::Write,
    path::{Path, PathBuf},
    sync::mpsc::{self, Receiver},
    time::Duration,
};

#[cfg(unix)]
use std::os::unix::{fs::PermissionsExt, net::UnixListener};

use interprocess::local_socket::{GenericFilePath, Stream, ToFsName as _, traits::Stream as _};
use o_pet::{
    coordinator::{Activity, AnimationUpdate, Cue},
    ipc::{MAX_LINE_BYTES, Server},
};

const WAIT: Duration = Duration::from_secs(2);

#[test]
fn switches_between_clients_and_falls_back_when_connections_close() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let endpoint = test_endpoint(&directory);
    let (server, activities) = start_server(&endpoint);
    let mut first = connect(&endpoint);
    send(
        &mut first,
        b"{\"type\":\"hello\",\"clientId\":\"one\",\"sessionId\":\"s1\"}\n\
          {\"type\":\"event\",\"event\":{\"type\":\"tool_started\",\"toolCallId\":\"read-1\",\"toolName\":\"read\"}}\n",
    );
    assert_eq!(
        receive(&activities),
        AnimationUpdate::steady(Activity::Searching)
    );

    let mut second = connect(&endpoint);
    send(
        &mut second,
        b"{\"type\":\"hello\",\"clientId\":\"two\",\"sessionId\":\"s2\"}\n\
          {\"type\":\"event\",\"event\":{\"type\":\"tool_started\",\"toolCallId\":\"write-1\",\"toolName\":\"write\"}}\n",
    );
    assert_eq!(
        receive(&activities),
        AnimationUpdate::steady(Activity::Coding)
    );

    send(
        &mut first,
        b"{\"type\":\"event\",\"event\":{\"type\":\"tool_started\",\"toolCallId\":\"bash-1\",\"toolName\":\"bash\"}}\n",
    );
    assert_eq!(
        receive(&activities),
        AnimationUpdate::steady(Activity::Terminal)
    );
    drop(first);
    assert_eq!(
        receive(&activities),
        AnimationUpdate::steady(Activity::Coding)
    );
    drop(second);
    assert_eq!(
        receive(&activities),
        AnimationUpdate::steady(Activity::Idle)
    );

    server.shutdown();
    assert!(!endpoint.exists());
}

#[test]
fn malformed_and_unknown_lines_do_not_change_state_and_later_lines_recover() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let endpoint = test_endpoint(&directory);
    let (server, activities) = start_server(&endpoint);
    let mut client = connect(&endpoint);
    send(
        &mut client,
        concat!(
            "{\"type\":\"hello\",\"clientId\":\"one\",\"sessionId\":\"s1\"}\n",
            "{bad json\n",
            "{\"type\":\"future\",\"event\":{\"type\":\"turn_started\"}}\n",
            "{\"type\":\"event\",\"event\":{\"type\":\"dancing\"}}\n",
            "{\"type\":\"event\"}\n",
            "{\"type\":\"event\",\"event\":{\"type\":\"turn_started\"}}\n",
        )
        .as_bytes(),
    );
    assert_eq!(
        receive(&activities),
        AnimationUpdate::steady(Activity::Thinking)
    );
    send(
        &mut client,
        b"{\"type\":\"event\",\"event\":{\"type\":\"still_unknown\"}}\n",
    );
    assert!(activities.recv_timeout(Duration::from_millis(100)).is_err());
    send(&mut client, b"{\"type\":\"goodbye\"}\n");
    assert_eq!(
        receive(&activities),
        AnimationUpdate::steady(Activity::Idle)
    );
    server.shutdown();
}

#[test]
fn oversized_line_closes_only_that_connection_and_bounds_the_decoder() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let endpoint = test_endpoint(&directory);
    let (server, activities) = start_server(&endpoint);
    let mut oversized = connect(&endpoint);
    let mut input = b"{\"type\":\"hello\",\"clientId\":\"one\",\"sessionId\":\"s1\"}\n".to_vec();
    let fixture = include_bytes!("../protocol/fixtures/oversized.jsonl");
    assert_eq!(fixture.len(), MAX_LINE_BYTES + 1);
    input.extend_from_slice(fixture);
    let _ = oversized.write_all(&input);
    drop(oversized);

    let mut valid = connect(&endpoint);
    send(
        &mut valid,
        b"{\"type\":\"hello\",\"clientId\":\"two\",\"sessionId\":\"s2\"}\n\
          {\"type\":\"event\",\"event\":{\"type\":\"agent_settled\",\"outcome\":\"success\",\"durationMs\":1000}}\n",
    );
    assert_eq!(
        receive(&activities),
        AnimationUpdate {
            activity: Activity::Idle,
            cue: Some(Cue::CompletedQuick),
        }
    );
    server.shutdown();
}

#[cfg(unix)]
#[test]
fn protects_socket_and_reclaims_only_a_confirmed_stale_socket() {
    let directory = tempfile::tempdir().expect("temporary directory");
    let endpoint = test_endpoint(&directory);
    let stale = UnixListener::bind(&endpoint).expect("stale socket fixture");
    drop(stale);

    let (server, _activities) = start_server(&endpoint);
    let mode = endpoint
        .metadata()
        .expect("socket metadata")
        .permissions()
        .mode();
    assert_eq!(mode & 0o077, 0);

    let error = Server::bind(&endpoint, |_| {})
        .err()
        .expect("active endpoint must fail");
    assert_eq!(error.kind(), std::io::ErrorKind::AddrInUse);
    assert!(endpoint.exists());
    server.shutdown();
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
            r"\\.\pipe\o-pet-test-{}-{unique}",
            std::process::id()
        ))
    }
}

fn start_server(endpoint: &Path) -> (Server, Receiver<AnimationUpdate>) {
    #[cfg(unix)]
    std::fs::set_permissions(
        endpoint.parent().expect("endpoint parent"),
        std::fs::Permissions::from_mode(0o700),
    )
    .expect("private endpoint directory");
    let (sender, receiver) = mpsc::channel();
    let server = Server::bind(endpoint, move |activity| {
        sender
            .send(activity)
            .expect("activity receiver should remain open");
    })
    .expect("server should bind");
    (server, receiver)
}

fn connect(endpoint: &Path) -> Stream {
    let name = endpoint
        .as_os_str()
        .to_fs_name::<GenericFilePath>()
        .expect("valid local socket path");
    Stream::connect(name).expect("client should connect")
}

fn send(stream: &mut Stream, bytes: &[u8]) {
    stream
        .write_all(bytes)
        .expect("client should write message");
}

fn receive(receiver: &Receiver<AnimationUpdate>) -> AnimationUpdate {
    receiver
        .recv_timeout(WAIT)
        .expect("server should publish activity")
}
