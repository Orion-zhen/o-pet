use std::{
    cell::{Cell, RefCell},
    io,
    rc::Rc,
};

use super::position::{PlacementStore, WindowPlacement};
use gtk::{gdk, prelude::*};
use gtk4_layer_shell::{Edge, KeyboardMode, Layer, LayerShell};
use ksni::blocking::TrayMethods;
use o_pet::{
    coordinator::{Activity, AnimationUpdate},
    ipc,
};
use serde::Deserialize;
use webkit6::prelude::{PolicyDecisionExt, WebViewExt};

use crate::config::{Config, RendererPreferences};
use webkit6::{
    NavigationPolicyDecision, PolicyDecisionType, URISchemeRequest, UserContentInjectedFrames,
    UserContentManager, UserScript, UserScriptInjectionTime, WebContext, WebView,
};

const ANIMATION_QUEUE_CAPACITY: usize = 256;

const NATIVE_BRIDGE: &str = r#"
Object.defineProperty(window, "oPetNative", {
    configurable: false,
    value: Object.freeze({
        postDrag(message) {
            window.webkit.messageHandlers.drag.postMessage(message);
        },
        ready() {
            window.webkit.messageHandlers.ready.postMessage(null);
        },
    }),
    writable: false,
});
"#;

#[derive(Deserialize)]
#[serde(tag = "phase", rename_all = "lowercase")]
enum DragMessage {
    Start,
    Move { dx: f64, dy: f64 },
    End,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum TrayCommand {
    Show,
    Hide,
    Reload,
    Quit,
}

struct SystemTray {
    commands: async_channel::Sender<TrayCommand>,
    icon: ksni::Icon,
}

impl SystemTray {
    fn new(commands: async_channel::Sender<TrayCommand>) -> io::Result<Self> {
        let mut icon = super::icon::load_tray_icon()?;
        for pixel in icon.pixels.as_chunks_mut::<4>().0 {
            pixel.rotate_right(1);
        }
        Ok(Self {
            commands,
            icon: ksni::Icon {
                width: i32::try_from(icon.width)
                    .map_err(|_| io::Error::other("托盘图标宽度超出范围"))?,
                height: i32::try_from(icon.height)
                    .map_err(|_| io::Error::other("托盘图标高度超出范围"))?,
                data: icon.pixels,
            },
        })
    }

    fn send(&self, command: TrayCommand) {
        let _ = self.commands.try_send(command);
    }
}

impl ksni::Tray for SystemTray {
    fn id(&self) -> String {
        "o-pet".into()
    }

    fn title(&self) -> String {
        "o-pet".into()
    }

    fn icon_pixmap(&self) -> Vec<ksni::Icon> {
        vec![self.icon.clone()]
    }

    fn activate(&mut self, _x: i32, _y: i32) {
        self.send(TrayCommand::Show);
    }

    fn menu(&self) -> Vec<ksni::MenuItem<Self>> {
        use ksni::menu::StandardItem;

        let show = self.commands.clone();
        let hide = self.commands.clone();
        let reload = self.commands.clone();
        let quit = self.commands.clone();
        vec![
            StandardItem {
                label: "显示桌宠".into(),
                activate: Box::new(move |_| {
                    let _ = show.try_send(TrayCommand::Show);
                }),
                ..Default::default()
            }
            .into(),
            StandardItem {
                label: "隐藏桌宠".into(),
                activate: Box::new(move |_| {
                    let _ = hide.try_send(TrayCommand::Hide);
                }),
                ..Default::default()
            }
            .into(),
            StandardItem {
                label: "重新加载桌宠".into(),
                icon_name: "view-refresh".into(),
                activate: Box::new(move |_| {
                    let _ = reload.try_send(TrayCommand::Reload);
                }),
                ..Default::default()
            }
            .into(),
            ksni::MenuItem::Separator,
            StandardItem {
                label: "退出".into(),
                icon_name: "application-exit".into(),
                activate: Box::new(move |_| {
                    let _ = quit.try_send(TrayCommand::Quit);
                }),
                ..Default::default()
            }
            .into(),
        ]
    }
}

#[derive(Default)]
struct DragSession {
    active: bool,
    residual_x: f64,
    residual_y: f64,
}

impl DragSession {
    fn start(&mut self) {
        self.active = true;
        self.residual_x = 0.0;
        self.residual_y = 0.0;
    }

    fn delta(&mut self, dx: f64, dy: f64) -> Option<(i32, i32)> {
        if !self.active || !dx.is_finite() || !dy.is_finite() {
            return None;
        }
        self.residual_x += dx;
        self.residual_y += dy;
        let whole_x = self.residual_x.round() as i32;
        let whole_y = self.residual_y.round() as i32;
        self.residual_x -= f64::from(whole_x);
        self.residual_y -= f64::from(whole_y);
        Some((whole_x, whole_y))
    }

    fn end(&mut self) -> bool {
        std::mem::replace(&mut self.active, false)
    }
}

struct MonitorChoice {
    id: String,
    monitor: gdk::Monitor,
}

pub(crate) fn run(action: Option<String>) -> gtk::glib::ExitCode {
    let config = match Config::load() {
        Ok(config) => config,
        Err(error) => {
            eprintln!("无法读取 ~/.config/o-pet/config.toml: {error}");
            return 1.into();
        }
    };
    let (sender, receiver) = async_channel::bounded(ANIMATION_QUEUE_CAPACITY);
    let overflow_receiver = receiver.clone();
    let server = if action.is_none() {
        let endpoint = match ipc::resolve_endpoint() {
            Ok(endpoint) => endpoint,
            Err(error) => {
                eprintln!("无法确定 o-pet IPC 端点: {error}");
                return 1.into();
            }
        };
        match ipc::Server::bind(&endpoint, move |update| {
            if sender.try_send(update).is_err() {
                let _ = overflow_receiver.try_recv();
                let _ = sender.try_send(update);
            }
        }) {
            Ok(server) => Some(server),
            Err(error) => {
                if error.kind() == io::ErrorKind::AddrInUse {
                    eprintln!(
                        "无法启动 o-pet: IPC 端点 {} 已被使用，另一个实例可能正在运行",
                        endpoint.display()
                    );
                } else {
                    eprintln!("无法启动 o-pet IPC 服务: {error}");
                }
                return 1.into();
            }
        }
    } else {
        None
    };

    let (tray_sender, tray_receiver) = async_channel::unbounded();
    let tray = match SystemTray::new(tray_sender).and_then(|tray| {
        tray.spawn()
            .map_err(|error| io::Error::other(error.to_string()))
    }) {
        Ok(tray) => tray,
        Err(error) => {
            eprintln!("无法创建 o-pet 托盘图标: {error}");
            if let Some(server) = server {
                server.shutdown();
            }
            return 1.into();
        }
    };

    let application = gtk::Application::builder()
        .application_id("works.earendil.o-pet")
        .flags(gtk::gio::ApplicationFlags::NON_UNIQUE)
        .build();
    let startup_failed = Rc::new(Cell::new(false));
    let failed = Rc::clone(&startup_failed);
    application.connect_activate(move |application| {
        if !gtk4_layer_shell::is_supported() {
            eprintln!("无法启动 o-pet: 当前 Wayland compositor 不支持 wlr-layer-shell");
            failed.set(true);
            application.quit();
            return;
        }
        if let Err(error) = build_window(
            application,
            receiver.clone(),
            tray_receiver.clone(),
            &config,
            action.clone(),
        ) {
            eprintln!("无法创建 o-pet Linux 窗口: {error}");
            failed.set(true);
            application.quit();
        }
    });
    let exit_code = application.run_with_args(&["o-pet"]);
    tray.shutdown().wait();
    if let Some(server) = server {
        server.shutdown();
    }
    if startup_failed.get() {
        1.into()
    } else {
        exit_code
    }
}

fn build_window(
    application: &gtk::Application,
    updates: async_channel::Receiver<AnimationUpdate>,
    tray_commands: async_channel::Receiver<TrayCommand>,
    config: &Config,
    action: Option<String>,
) -> io::Result<()> {
    let display = gdk::Display::default()
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "没有可用的 GDK display"))?;
    let monitor_model = display.monitors();
    let monitors = available_monitors(&monitor_model);
    let primary = monitors
        .first()
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "没有可用的显示器"))?;
    let store = Rc::new(PlacementStore::for_application()?);
    let mut placement = match store.load() {
        Ok(Some(mut placement)) => {
            placement.width = config.size;
            placement.height = config.size;
            placement
        }
        Ok(None) => WindowPlacement::default_for(primary.id.clone(), config.size),
        Err(error) => {
            eprintln!("无法读取 o-pet 窗口位置，将使用默认位置: {error}");
            WindowPlacement::default_for(primary.id.clone(), config.size)
        }
    };
    let selected = monitors
        .iter()
        .find(|choice| choice.id == placement.monitor)
        .unwrap_or(primary);
    if selected.id != placement.monitor {
        placement = WindowPlacement::default_for(selected.id.clone(), config.size);
    }
    clamp_to_monitor(&mut placement, &selected.monitor);
    let placement = Rc::new(RefCell::new(placement));

    let window = gtk::ApplicationWindow::builder()
        .application(application)
        .title("o-pet")
        .default_width(placement.borrow().width)
        .default_height(placement.borrow().height)
        .decorated(false)
        .resizable(false)
        .focusable(false)
        .build();

    configure_layer_surface(&window, &selected.monitor, &placement.borrow());
    window.remove_css_class("background");

    let web_context = WebContext::new();
    web_context.register_uri_scheme(crate::renderer::PROTOCOL, respond_renderer_asset);
    if let Some(security_manager) = web_context.security_manager() {
        security_manager.register_uri_scheme_as_secure(crate::renderer::PROTOCOL);
    }

    let content_manager = UserContentManager::new();
    assert!(
        content_manager.register_script_message_handler("drag", None),
        "拖拽消息处理器名称必须唯一"
    );
    assert!(
        content_manager.register_script_message_handler("ready", None),
        "就绪消息处理器名称必须唯一"
    );
    content_manager.add_script(&UserScript::new(
        NATIVE_BRIDGE,
        UserContentInjectedFrames::TopFrame,
        UserScriptInjectionTime::Start,
        &[],
        &[],
    ));
    connect_drag_handler(
        &content_manager,
        &window,
        &monitor_model,
        Rc::clone(&placement),
        Rc::clone(&store),
    );

    let web_view = WebView::builder()
        .web_context(&web_context)
        .user_content_manager(&content_manager)
        .build();
    restrict_navigation(&web_view);
    if let Some(network_session) = web_view.network_session() {
        network_session.connect_download_started(|_, download| download.cancel());
    }
    web_view.set_background_color(&gdk::RGBA::new(0.0, 0.0, 0.0, 0.0));
    let current_activity = Rc::new(Cell::new(Activity::Idle));
    let page_loaded = Rc::new(Cell::new(false));
    let preferences = Rc::new(RefCell::new(config.renderer.clone()));
    connect_ready_handler(
        &content_manager,
        &web_view,
        Rc::clone(&preferences),
        action,
        Rc::clone(&current_activity),
        Rc::clone(&page_loaded),
    );

    let weak_web_view = web_view.downgrade();
    let updates_page_loaded = Rc::clone(&page_loaded);
    gtk::glib::MainContext::default().spawn_local(async move {
        while let Ok(update) = updates.recv().await {
            current_activity.set(update.activity);
            let Some(web_view) = weak_web_view.upgrade() else {
                break;
            };
            if updates_page_loaded.get() {
                send_update(&web_view, update);
            }
        }
    });
    web_view.load_uri(crate::renderer::DOCUMENT_URL);

    let weak_window = window.downgrade();
    let weak_web_view = web_view.downgrade();
    let weak_application = application.downgrade();
    let reload_monitor_model = monitor_model.clone();
    let reload_placement = Rc::clone(&placement);
    let reload_store = Rc::clone(&store);
    let reload_preferences = Rc::clone(&preferences);
    let reload_page_loaded = Rc::clone(&page_loaded);
    gtk::glib::MainContext::default().spawn_local(async move {
        while let Ok(command) = tray_commands.recv().await {
            let Some(window) = weak_window.upgrade() else {
                break;
            };
            match command {
                TrayCommand::Show => window.present(),
                TrayCommand::Hide => window.set_visible(false),
                TrayCommand::Reload => match reload_config(
                    &window,
                    &reload_monitor_model,
                    &reload_placement,
                    &reload_store,
                ) {
                    Ok(reloaded) => {
                        *reload_preferences.borrow_mut() = reloaded;
                        if reload_page_loaded.get()
                            && let Some(web_view) = weak_web_view.upgrade()
                        {
                            send_preferences(&web_view, &reload_preferences.borrow());
                        }
                    }
                    Err(error) => eprintln!("无法重新加载 o-pet 配置: {error}"),
                },
                TrayCommand::Quit => {
                    if let Some(application) = weak_application.upgrade() {
                        application.quit();
                    }
                    break;
                }
            }
        }
    });

    connect_monitor_changes(&window, &web_view, monitor_model, Rc::clone(&placement));
    let saved_placement = Rc::clone(&placement);
    let saved_store = Rc::clone(&store);
    window.connect_destroy(move |_| save_placement(&saved_store, &saved_placement.borrow()));

    window.set_child(Some(&web_view));
    window.present();
    Ok(())
}

fn reload_config(
    window: &gtk::ApplicationWindow,
    monitor_model: &gtk::gio::ListModel,
    placement: &RefCell<WindowPlacement>,
    store: &PlacementStore,
) -> io::Result<RendererPreferences> {
    let config = Config::load()?;
    let monitors = available_monitors(monitor_model);
    let primary = monitors
        .first()
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "没有可用的显示器"))?;
    let mut placement = placement.borrow_mut();
    let selected = monitors
        .iter()
        .find(|choice| choice.id == placement.monitor)
        .unwrap_or(primary);
    let geometry = selected.monitor.geometry();

    placement.monitor.clone_from(&selected.id);
    placement.resize_square(config.size, geometry.width(), geometry.height());
    window.set_monitor(Some(&selected.monitor));
    apply_placement(window, &placement);
    save_placement(store, &placement);

    Ok(config.renderer)
}

fn restrict_navigation(web_view: &WebView) {
    web_view.connect_decide_policy(|_, decision, decision_type| match decision_type {
        PolicyDecisionType::NavigationAction => {
            let allowed = decision
                .downcast_ref::<NavigationPolicyDecision>()
                .and_then(NavigationPolicyDecision::navigation_action)
                .and_then(|action| action.request())
                .and_then(|request| request.uri())
                .is_some_and(|uri| is_internal_document_uri(&uri));
            if allowed {
                false
            } else {
                decision.ignore();
                true
            }
        }
        PolicyDecisionType::NewWindowAction => {
            decision.ignore();
            true
        }
        _ => false,
    });
}

fn respond_renderer_asset(request: &URISchemeRequest) {
    let path = request.path();
    let Some(asset) = path.as_deref().and_then(crate::renderer::asset) else {
        let mut error = gtk::glib::Error::new(gtk::gio::IOErrorEnum::NotFound, "找不到渲染资源");
        request.finish_error(&mut error);
        return;
    };
    let length = i64::try_from(asset.body.len()).expect("渲染资源长度必须能用 i64 表示");
    let bytes = gtk::glib::Bytes::from_owned(asset.body.into_owned());
    let stream = gtk::gio::MemoryInputStream::from_bytes(&bytes);
    request.finish(&stream, length, Some(asset.content_type));
}

fn is_internal_document_uri(uri: &str) -> bool {
    uri == "about:blank"
        || uri.starts_with("about:blank#")
        || uri == crate::renderer::DOCUMENT_URL
        || uri
            .strip_prefix(crate::renderer::DOCUMENT_URL)
            .is_some_and(|rest| rest.starts_with('#'))
}

fn send_preferences(web_view: &WebView, preferences: &RendererPreferences) {
    let payload = serde_json::to_string(preferences).expect("renderer preferences must serialize");
    let script = format!("window.oPet.setPreferences({payload})");
    web_view.evaluate_javascript(
        &script,
        None,
        None,
        None::<&gtk::gio::Cancellable>,
        |result| {
            if let Err(error) = result {
                eprintln!("无法向渲染页面发送配置: {error}");
            }
        },
    );
}

fn show_action(web_view: &WebView, action: &str) {
    let payload = serde_json::to_string(action).expect("action name must serialize");
    let script = format!("window.oPet.showAction({payload})");
    web_view.evaluate_javascript(
        &script,
        None,
        None,
        None::<&gtk::gio::Cancellable>,
        |result| {
            if let Err(error) = result {
                eprintln!("无法向渲染页面发送动画预设: {error}");
            }
        },
    );
}

fn send_update(web_view: &WebView, update: AnimationUpdate) {
    let payload = serde_json::to_string(&update).expect("animation update must serialize");
    let script = format!("window.oPet.update({payload})");
    web_view.evaluate_javascript(
        &script,
        None,
        None,
        None::<&gtk::gio::Cancellable>,
        |result| {
            if let Err(error) = result {
                eprintln!("无法向渲染页面发送状态: {error}");
            }
        },
    );
}

fn configure_layer_surface(
    window: &gtk::ApplicationWindow,
    monitor: &gdk::Monitor,
    placement: &WindowPlacement,
) {
    window.init_layer_shell();
    window.set_namespace(Some("o-pet"));
    window.set_layer(Layer::Top);
    window.set_exclusive_zone(0);
    window.set_keyboard_mode(KeyboardMode::None);
    window.set_anchor(Edge::Left, false);
    window.set_anchor(Edge::Top, false);
    window.set_anchor(Edge::Right, true);
    window.set_anchor(Edge::Bottom, true);
    window.set_monitor(Some(monitor));
    apply_placement(window, placement);
}

fn connect_ready_handler(
    content_manager: &UserContentManager,
    web_view: &WebView,
    preferences: Rc<RefCell<RendererPreferences>>,
    action: Option<String>,
    current_activity: Rc<Cell<Activity>>,
    page_loaded: Rc<Cell<bool>>,
) {
    let weak_web_view = web_view.downgrade();
    content_manager.connect_script_message_received(Some("ready"), move |_, _| {
        if page_loaded.get() {
            return;
        }
        let Some(web_view) = weak_web_view.upgrade() else {
            return;
        };
        page_loaded.set(true);
        send_preferences(&web_view, &preferences.borrow());
        if let Some(action) = &action {
            show_action(&web_view, action);
        } else {
            send_update(&web_view, AnimationUpdate::steady(current_activity.get()));
        }
    });
}

fn connect_drag_handler(
    content_manager: &UserContentManager,
    window: &gtk::ApplicationWindow,
    monitor_model: &gtk::gio::ListModel,
    placement: Rc<RefCell<WindowPlacement>>,
    store: Rc<PlacementStore>,
) {
    let window = window.clone();
    let monitor_model = monitor_model.clone();
    let session = Rc::new(RefCell::new(DragSession::default()));
    content_manager.connect_script_message_received(Some("drag"), move |_, value| {
        let Some(json) = value.to_json(0) else {
            return;
        };
        let Ok(message) = serde_json::from_str::<DragMessage>(&json) else {
            return;
        };
        match message {
            DragMessage::Start => session.borrow_mut().start(),
            DragMessage::Move { dx, dy } => {
                let Some((dx, dy)) = session.borrow_mut().delta(dx, dy) else {
                    return;
                };
                let mut placement = placement.borrow_mut();
                placement.right = placement.right.saturating_sub(dx);
                placement.bottom = placement.bottom.saturating_sub(dy);
                if let Some(monitor) = find_monitor(&monitor_model, &placement.monitor) {
                    clamp_to_monitor(&mut placement, &monitor);
                }
                apply_placement(&window, &placement);
            }
            DragMessage::End => {
                if session.borrow_mut().end() {
                    save_placement(&store, &placement.borrow());
                }
            }
        }
    });
}

fn connect_monitor_changes(
    window: &gtk::ApplicationWindow,
    web_view: &WebView,
    monitor_model: gtk::gio::ListModel,
    placement: Rc<RefCell<WindowPlacement>>,
) {
    let weak_window = window.downgrade();
    let changed_model = monitor_model.clone();
    let changed_placement = Rc::clone(&placement);
    let handler = monitor_model.connect_items_changed(move |_, _, _, _| {
        let Some(window) = weak_window.upgrade() else {
            return;
        };
        let monitors = available_monitors(&changed_model);
        let Some(primary) = monitors.first() else {
            return;
        };
        let mut placement = changed_placement.borrow_mut();
        let selected = monitors
            .iter()
            .find(|choice| choice.id == placement.monitor);
        let selected = match selected {
            Some(selected) => selected,
            None => {
                let configured_size = placement.width;
                *placement = WindowPlacement::default_for(primary.id.clone(), configured_size);
                primary
            }
        };
        clamp_to_monitor(&mut placement, &selected.monitor);
        window.set_monitor(Some(&selected.monitor));
        apply_placement(&window, &placement);
    });
    let disconnected_model = monitor_model.clone();
    let handler = Rc::new(RefCell::new(Some(handler)));
    window.connect_destroy(move |_| {
        if let Some(handler) = handler.borrow_mut().take() {
            disconnected_model.disconnect(handler);
        }
    });

    let weak_web_view = web_view.downgrade();
    window.connect_scale_factor_notify(move |window| {
        window.queue_resize();
        if let Some(web_view) = weak_web_view.upgrade() {
            web_view.queue_draw();
        }
    });
}

fn available_monitors(model: &gtk::gio::ListModel) -> Vec<MonitorChoice> {
    (0..model.n_items())
        .filter_map(|index| {
            model
                .item(index)
                .and_then(|item| item.downcast::<gdk::Monitor>().ok())
                .map(|monitor| MonitorChoice {
                    id: monitor_id(&monitor, index),
                    monitor,
                })
        })
        .collect()
}

fn monitor_id(monitor: &gdk::Monitor, index: u32) -> String {
    monitor
        .connector()
        .filter(|value| !value.is_empty())
        .or_else(|| monitor.description().filter(|value| !value.is_empty()))
        .or_else(|| monitor.model().filter(|value| !value.is_empty()))
        .map_or_else(|| format!("monitor-{index}"), |value| value.to_string())
}

fn find_monitor(model: &gtk::gio::ListModel, id: &str) -> Option<gdk::Monitor> {
    available_monitors(model)
        .into_iter()
        .find(|choice| choice.id == id)
        .map(|choice| choice.monitor)
}

fn clamp_to_monitor(placement: &mut WindowPlacement, monitor: &gdk::Monitor) {
    let geometry = monitor.geometry();
    placement.clamp_to(geometry.width(), geometry.height());
}

fn apply_placement(window: &gtk::ApplicationWindow, placement: &WindowPlacement) {
    window.set_default_size(placement.width, placement.height);
    window.set_margin(Edge::Left, 0);
    window.set_margin(Edge::Top, 0);
    window.set_margin(Edge::Right, placement.right);
    window.set_margin(Edge::Bottom, placement.bottom);
}

fn save_placement(store: &PlacementStore, placement: &WindowPlacement) {
    if let Err(error) = store.save(placement) {
        eprintln!("无法保存 o-pet 窗口位置: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::{DragSession, SystemTray, TrayCommand, is_internal_document_uri};

    #[test]
    fn tray_menu_can_request_a_reload() {
        let (commands, receiver) = async_channel::unbounded();
        let mut tray = SystemTray {
            commands,
            icon: ksni::Icon {
                width: 1,
                height: 1,
                data: vec![0, 0, 0, 0],
            },
        };

        for item in ksni::Tray::menu(&tray) {
            if let ksni::MenuItem::Standard(item) = item {
                (item.activate)(&mut tray);
            }
        }
        let mut received = Vec::new();
        while let Ok(command) = receiver.try_recv() {
            received.push(command);
        }

        assert!(received.contains(&TrayCommand::Reload));
    }

    #[test]
    fn only_allows_the_embedded_document_uri() {
        assert!(is_internal_document_uri("about:blank"));
        assert!(is_internal_document_uri("about:blank#pet"));
        assert!(is_internal_document_uri("o-pet://app/index.html"));
        assert!(is_internal_document_uri("o-pet://app/index.html#pet"));
        for uri in [
            "data:text/html,external",
            "file:///tmp/pet.html",
            "https://example.com",
            "http://127.0.0.1/pet",
            "o-pet://app/host.js",
        ] {
            assert!(!is_internal_document_uri(uri), "不应允许 {uri}");
        }
    }

    #[test]
    fn drag_session_requires_a_grab_and_preserves_fractional_deltas() {
        let mut session = DragSession::default();
        assert_eq!(session.delta(4.0, 4.0), None);
        session.start();
        assert_eq!(session.delta(0.4, -0.4), Some((0, 0)));
        assert_eq!(session.delta(0.4, -0.4), Some((1, -1)));
        assert!(session.end());
        assert!(!session.end());
        assert_eq!(session.delta(1.0, 1.0), None);
    }
}
