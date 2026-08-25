use std::{error::Error, io};

use o_pet::{
    coordinator::{Activity, AnimationUpdate},
    ipc,
};

use crate::config::{Config, RendererPreferences};
use serde::Deserialize;
use tao::{
    dpi::{LogicalSize, PhysicalPosition},
    event::{Event, StartCause, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder, EventLoopWindowTarget},
    monitor::MonitorHandle,
    window::{Window, WindowBuilder},
};
use tray_icon::{
    Icon, MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent,
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
};
use wry::{NewWindowResponse, PermissionResponse, WebView, WebViewBuilder};

#[cfg(target_os = "macos")]
use super::macos as native;
use super::position::{MonitorGeometry, PlacementStore, WindowPlacement};
#[cfg(target_os = "windows")]
use super::windows as native;

const NATIVE_BRIDGE: &str = r#"
Object.defineProperty(window, "oPetNative", {
    configurable: false,
    value: Object.freeze({
        postDrag(message) {
            window.ipc.postMessage(JSON.stringify({ type: "drag", ...message }));
        },
        ready() {
            window.ipc.postMessage('{"type":"ready"}');
        },
    }),
    writable: false,
});
"#;

#[derive(Debug)]
enum UserEvent {
    Animation(AnimationUpdate),
    Menu(MenuEvent),
    Page(PageMessage),
    Tray(TrayIconEvent),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TrayCommand {
    Show,
    Hide,
    Quit,
}

const SHOW_MENU_ID: &str = "o-pet.show";
const HIDE_MENU_ID: &str = "o-pet.hide";
const QUIT_MENU_ID: &str = "o-pet.quit";

struct SystemTray {
    _icon: TrayIcon,
}

impl SystemTray {
    fn new() -> Result<Self, Box<dyn Error>> {
        let show = MenuItem::with_id(SHOW_MENU_ID, "显示桌宠", true, None);
        let hide = MenuItem::with_id(HIDE_MENU_ID, "隐藏桌宠", true, None);
        let separator = PredefinedMenuItem::separator();
        let quit = MenuItem::with_id(QUIT_MENU_ID, "退出", true, None);
        let menu = Menu::with_items(&[&show, &hide, &separator, &quit])?;
        let icon = super::icon::load_tray_icon()?;
        let icon = Icon::from_rgba(icon.pixels, icon.width, icon.height)?;
        let icon = TrayIconBuilder::new()
            .with_tooltip("o-pet")
            .with_icon(icon)
            .with_menu(Box::new(menu))
            .with_menu_on_left_click(false)
            .build()?;
        Ok(Self { _icon: icon })
    }

    fn command(event: &MenuEvent) -> Option<TrayCommand> {
        match event.id.as_ref() {
            SHOW_MENU_ID => Some(TrayCommand::Show),
            HIDE_MENU_ID => Some(TrayCommand::Hide),
            QUIT_MENU_ID => Some(TrayCommand::Quit),
            _ => None,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum PageMessage {
    Ready,
    Drag { phase: DragPhase },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum DragPhase {
    Start,
    Move,
    End,
}

struct MonitorChoice {
    id: String,
    geometry: MonitorGeometry,
}

pub(super) fn run() -> Result<(), Box<dyn Error>> {
    let config = Config::load().map_err(|error| {
        io::Error::new(
            error.kind(),
            format!("无法读取 ~/.config/o-pet/config.toml: {error}"),
        )
    })?;
    let endpoint = ipc::resolve_endpoint().map_err(|error| {
        io::Error::new(error.kind(), format!("无法确定 o-pet IPC 端点: {error}"))
    })?;
    let mut event_loop_builder = EventLoopBuilder::<UserEvent>::with_user_event();
    #[cfg(target_os = "windows")]
    native::configure_event_loop_builder(&mut event_loop_builder);
    #[allow(unused_mut)]
    let mut event_loop = event_loop_builder.build();
    #[cfg(target_os = "macos")]
    native::configure_event_loop(&mut event_loop);
    let monitors = available_monitors(&event_loop)?;
    let primary = primary_monitor(&event_loop, &monitors)?;
    let store = PlacementStore::for_application()?;
    let mut placement = load_placement(&store, primary, config.size);
    let selected = monitors
        .iter()
        .find(|monitor| monitor.id == placement.monitor)
        .unwrap_or(primary);
    if selected.id != placement.monitor {
        placement = WindowPlacement::default_for(selected.id.clone(), config.size);
    }
    let (monitor_width, monitor_height) = selected.geometry.logical_size();
    placement.clamp_to(monitor_width, monitor_height);
    let (window_x, window_y) = placement.physical_origin(selected.geometry);

    let proxy = event_loop.create_proxy();
    let server = ipc::Server::bind(&endpoint, move |update| {
        let _ = proxy.send_event(UserEvent::Animation(update));
    })
    .map_err(|error| endpoint_error(&endpoint, error))?;

    let window = native::window_builder(
        WindowBuilder::new()
            .with_title("o-pet")
            .with_inner_size(LogicalSize::new(
                f64::from(placement.width),
                f64::from(placement.height),
            ))
            .with_position(PhysicalPosition::new(window_x, window_y))
            .with_resizable(false)
            .with_decorations(false)
            .with_transparent(true)
            .with_always_on_top(true)
            .with_focused(false)
            .with_visible(false)
            .with_visible_on_all_workspaces(true),
    )
    .build(&event_loop)?;
    native::configure_window(&window)?;

    let page_proxy = event_loop.create_proxy();
    let webview = WebViewBuilder::new()
        .with_transparent(true)
        .with_background_color((0, 0, 0, 0))
        .with_initialization_script(NATIVE_BRIDGE)
        .with_ipc_handler(move |request| {
            if let Ok(message) = serde_json::from_str::<PageMessage>(request.body()) {
                let _ = page_proxy.send_event(UserEvent::Page(message));
            }
        })
        .with_navigation_handler(|uri| is_internal_document_uri(&uri))
        .with_new_window_req_handler(|_, _| NewWindowResponse::Deny)
        .with_download_started_handler(|_, _| false)
        .with_permission_handler(|_| PermissionResponse::Deny)
        .with_hotkeys_zoom(false)
        .with_accept_first_mouse(true)
        .with_devtools(false)
        .with_html(crate::renderer::PAGE)
        .build(&window)?;
    window.set_visible(true);

    let tray_proxy = event_loop.create_proxy();
    TrayIconEvent::set_event_handler(Some(move |event| {
        let _ = tray_proxy.send_event(UserEvent::Tray(event));
    }));
    let menu_proxy = event_loop.create_proxy();
    MenuEvent::set_event_handler(Some(move |event| {
        let _ = menu_proxy.send_event(UserEvent::Menu(event));
    }));

    let preferences = config.renderer;
    let mut latest_update = AnimationUpdate::steady(Activity::Idle);
    let mut page_ready = false;
    let mut server = Some(server);
    let mut tray = None;
    event_loop.run(move |event, target, control_flow| {
        *control_flow = ControlFlow::Wait;
        match event {
            Event::NewEvents(StartCause::Init) => match SystemTray::new() {
                Ok(system_tray) => tray = Some(system_tray),
                Err(error) => {
                    eprintln!("无法创建 o-pet 托盘图标: {error}");
                    *control_flow = ControlFlow::Exit;
                }
            },
            Event::UserEvent(UserEvent::Animation(update)) => {
                latest_update = update;
                if page_ready {
                    send_update(&webview, update);
                }
            }
            Event::UserEvent(UserEvent::Menu(event)) => match SystemTray::command(&event) {
                Some(TrayCommand::Show) => window.set_visible(true),
                Some(TrayCommand::Hide) => window.set_visible(false),
                Some(TrayCommand::Quit) => *control_flow = ControlFlow::Exit,
                None => {}
            },
            Event::UserEvent(UserEvent::Tray(
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
                | TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                },
            )) => window.set_visible(true),
            Event::UserEvent(UserEvent::Tray(_)) => {}
            Event::UserEvent(UserEvent::Page(PageMessage::Ready)) => {
                page_ready = true;
                send_preferences(&webview, &preferences);
                send_update(&webview, latest_update);
            }
            Event::UserEvent(UserEvent::Page(PageMessage::Drag {
                phase: DragPhase::Start,
            })) => {
                if let Err(error) = window.drag_window() {
                    eprintln!("无法拖动 o-pet 窗口: {error}");
                }
            }
            Event::UserEvent(UserEvent::Page(PageMessage::Drag {
                phase: DragPhase::Move | DragPhase::End,
            })) => {}
            Event::Reopen { .. } => window.set_visible(true),
            Event::WindowEvent {
                window_id,
                event: WindowEvent::CloseRequested,
                ..
            } if window_id == window.id() => {
                *control_flow = ControlFlow::Exit;
            }
            Event::WindowEvent {
                window_id,
                event: WindowEvent::Moved(_) | WindowEvent::Resized(_),
                ..
            } if window_id == window.id() => {
                update_and_save_placement(&window, target, &mut placement, &store);
            }
            Event::WindowEvent {
                window_id,
                event:
                    WindowEvent::ScaleFactorChanged {
                        scale_factor,
                        new_inner_size,
                    },
                ..
            } if window_id == window.id() => {
                *new_inner_size =
                    LogicalSize::new(f64::from(placement.width), f64::from(placement.height))
                        .to_physical(scale_factor);
            }
            Event::LoopDestroyed => {
                tray.take();
                update_and_save_placement(&window, target, &mut placement, &store);
                if let Some(server) = server.take() {
                    server.shutdown();
                }
            }
            _ => {}
        }
    });
}

fn available_monitors(
    target: &EventLoopWindowTarget<UserEvent>,
) -> Result<Vec<MonitorChoice>, Box<dyn Error>> {
    target
        .available_monitors()
        .map(|monitor| {
            Ok(MonitorChoice {
                id: native::monitor_id(&monitor),
                geometry: monitor_geometry(&monitor)?,
            })
        })
        .collect()
}

fn primary_monitor<'a>(
    target: &EventLoopWindowTarget<UserEvent>,
    monitors: &'a [MonitorChoice],
) -> Result<&'a MonitorChoice, Box<dyn Error>> {
    let primary_id = target
        .primary_monitor()
        .map(|monitor| native::monitor_id(&monitor));
    primary_id
        .as_deref()
        .and_then(|id| monitors.iter().find(|monitor| monitor.id == id))
        .or_else(|| monitors.first())
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "没有可用的显示器").into())
}

fn monitor_geometry(monitor: &MonitorHandle) -> Result<MonitorGeometry, Box<dyn Error>> {
    let size = monitor.size();
    let position = monitor.position();
    let scale_factor = monitor.scale_factor();
    if size.width == 0 || size.height == 0 || !scale_factor.is_finite() || scale_factor <= 0.0 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "显示器几何信息无效").into());
    }
    Ok(MonitorGeometry {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
        scale_factor,
    })
}

fn load_placement(
    store: &PlacementStore,
    primary: &MonitorChoice,
    configured_size: i32,
) -> WindowPlacement {
    match store.load() {
        Ok(Some(mut placement)) => {
            placement.width = configured_size;
            placement.height = configured_size;
            placement
        }
        Ok(None) => WindowPlacement::default_for(primary.id.clone(), configured_size),
        Err(error) => {
            eprintln!("无法读取 o-pet 窗口位置，将使用默认位置: {error}");
            WindowPlacement::default_for(primary.id.clone(), configured_size)
        }
    }
}

fn update_and_save_placement(
    window: &Window,
    target: &EventLoopWindowTarget<UserEvent>,
    placement: &mut WindowPlacement,
    store: &PlacementStore,
) {
    if let Err(error) = update_placement(window, target, placement) {
        eprintln!("无法更新 o-pet 窗口位置: {error}");
        return;
    }
    if let Err(error) = store.save(placement) {
        eprintln!("无法保存 o-pet 窗口位置: {error}");
    }
}

fn update_placement(
    window: &Window,
    target: &EventLoopWindowTarget<UserEvent>,
    placement: &mut WindowPlacement,
) -> Result<(), Box<dyn Error>> {
    let saved_monitor_available = target
        .available_monitors()
        .any(|monitor| native::monitor_id(&monitor) == placement.monitor);
    if !saved_monitor_available {
        return reset_to_primary(window, target, placement);
    }

    if let Some(monitor) = window.current_monitor() {
        let monitor_id = native::monitor_id(&monitor);
        let geometry = monitor_geometry(&monitor)?;
        let position = window.outer_position()?;
        let size = window.outer_size();
        placement.update_from_physical(
            monitor_id,
            geometry,
            position.x,
            position.y,
            size.width,
            size.height,
        );
        return Ok(());
    }

    reset_to_primary(window, target, placement)
}

fn reset_to_primary(
    window: &Window,
    target: &EventLoopWindowTarget<UserEvent>,
    placement: &mut WindowPlacement,
) -> Result<(), Box<dyn Error>> {
    let monitor = target
        .primary_monitor()
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "没有可用的显示器"))?;
    let geometry = monitor_geometry(&monitor)?;
    let configured_size = placement.width;
    *placement = WindowPlacement::default_for(native::monitor_id(&monitor), configured_size);
    let (monitor_width, monitor_height) = geometry.logical_size();
    placement.clamp_to(monitor_width, monitor_height);
    let origin = placement.physical_origin(geometry);
    window.set_outer_position(PhysicalPosition::new(origin.0, origin.1));
    Ok(())
}

fn endpoint_error(endpoint: &std::path::Path, error: io::Error) -> io::Error {
    if error.kind() == io::ErrorKind::AddrInUse {
        io::Error::new(
            error.kind(),
            format!(
                "IPC 端点 {} 已被使用，另一个实例可能正在运行",
                endpoint.display()
            ),
        )
    } else {
        io::Error::new(error.kind(), format!("无法启动 o-pet IPC 服务: {error}"))
    }
}

fn send_preferences(webview: &WebView, preferences: &RendererPreferences) {
    let payload = serde_json::to_string(preferences).expect("renderer preferences must serialize");
    if let Err(error) = webview.evaluate_script(&format!("window.oPet.setPreferences({payload})")) {
        eprintln!("无法向渲染页面发送配置: {error}");
    }
}

fn send_update(webview: &WebView, update: AnimationUpdate) {
    let payload = serde_json::to_string(&update).expect("animation update must serialize");
    if let Err(error) = webview.evaluate_script(&format!("window.oPet.update({payload})")) {
        eprintln!("无法向渲染页面发送状态: {error}");
    }
}

fn is_internal_document_uri(uri: &str) -> bool {
    uri == "about:blank"
        || uri.starts_with("about:blank#")
        || uri.starts_with("data:text/html;charset=utf-8;base64,")
}

#[cfg(test)]
mod tests {
    use super::{
        HIDE_MENU_ID, QUIT_MENU_ID, SHOW_MENU_ID, SystemTray, TrayCommand, is_internal_document_uri,
    };
    use tray_icon::menu::MenuEvent;

    #[test]
    fn permits_renderer_document_and_rejects_external_navigation() {
        for uri in [
            "about:blank",
            "about:blank#renderer",
            "data:text/html;charset=utf-8;base64,PGh0bWw+PC9odG1sPg==",
        ] {
            assert!(is_internal_document_uri(uri), "应允许 {uri}");
        }
        for uri in [
            "https://example.com",
            "data:text/html,<html></html>",
            "data:text/plain;charset=utf-8;base64,dGVzdA==",
            "about:srcdoc",
        ] {
            assert!(!is_internal_document_uri(uri), "应拒绝 {uri}");
        }
    }

    #[test]
    fn maps_tray_menu_events_to_window_commands() {
        for (id, expected) in [
            (SHOW_MENU_ID, Some(TrayCommand::Show)),
            (HIDE_MENU_ID, Some(TrayCommand::Hide)),
            (QUIT_MENU_ID, Some(TrayCommand::Quit)),
            ("other", None),
        ] {
            assert_eq!(SystemTray::command(&MenuEvent { id: id.into() }), expected);
        }
    }
}
