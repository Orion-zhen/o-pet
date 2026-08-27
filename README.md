# o-pet

`o-pet` 是一个独立运行的跨平台桌面宠物。它通过本地 JSON Lines IPC 接收 Agent 活动，并在桌面窗口中播放对应动画。

本仓库只包含桌宠进程、渲染器、IPC 协议和相关测试。Pi 适配器属于使用方仓库，双方只通过 IPC 协议通信，不共享源码或构建产物。

## 构建与测试

生产代码使用 Rust 构建。渲染器测试使用 Node.js 和 TypeScript。

```bash
cargo fmt --check
cargo check
cargo test
cargo clippy --all-targets -- -D warnings

npm install
npm run renderer:typecheck
npm run renderer:test
```

`cargo check` 和 `cargo test` 需要当前平台对应的窗口和 WebView 开发依赖。仓库不提供这些系统依赖的安装脚本。

启动桌宠：

```bash
cargo run --release
```

查看所有动画预设：

```bash
cargo run --release -- --list-actions
```

按名称预览动画预设：

```bash
cargo run --release -- --show-action happy
```

预览模式每轮播放指定预设 3 秒，暂停 1 秒后重新播放。预览模式不启动 IPC 服务，因此可以与正常运行的桌宠实例同时启动。

## 渲染器架构

渲染器使用单向依赖和显式组合：

- `renderer/catalog/` 保存动作名称、场景预设、活动配方、空闲片段和有限序列。`defineScene()` 使用具名字段组合 `motion`、`face`、`expression`、`gaze`、`shape`、`form`、`decoration`、`particles`、`camera` 和 `badge` 十个固定通道。动作预览只接受 `actions` 动作目录中已注册的名称。共享控制通道的场景不会自动继承彼此的入场编排。
- `renderer/behaviors/` 管理 Agent 活动、空闲深度、Cue 和用户交互的生命周期及运行时分支。活动步骤和空闲片段内容由目录模块构建。步骤构建器分别创建场景、预览状态和暂停步骤，一次性眨眼、旋转、跳跃与扑动通过步骤事件组合。
- `renderer/runtime/` 提供 Host 状态生命周期、统一动画时钟、可取消时间线和场景呈现端口。状态生命周期集中停止旧导演并管理活动切换计时器。统一时钟同时冻结定时器、动画帧和动画时间。
- `renderer/engine/` 解析场景、采样控制通道、推进弹簧并生成帧模型。motion、face 和 gaze 通过名称分派到独立控制器定义，不使用集中式状态分支。编排使用通用局部时间事件轨道。`visual-channels.js` 根据特效元数据管理形变、装饰、粒子、相机和徽标的过渡状态。
- `renderer/view/` 从帧模型生成 SVG。`renderer/view/effects/` 按视觉隐喻拆分绘制和身体采样公式，特效目录统一生成形变、装饰和相机注册表，以及循环、构图缩放和墨迹生命周期元数据。`effects.js` 只组合共享 SVG 节点、特效定义和形变采样器。视图模块不读取动画运行时的内部对象。
- `renderer/adapters/` 管理浏览器指针、原生拖动协议和动态偏好。`renderer/host.js` 是唯一组合根，只处理外部事件、行为优先级和销毁顺序。

Rust 使用 `rust-embed` 将 `renderer/` 嵌入可执行文件，并通过内部 `o-pet://` 协议提供 HTML、CSS、JavaScript 和 JSON 资源。渲染页面不读取安装目录或外部网络资源。

渲染器使用标准 ESM 静态导入。`bootstrap.js` 只启动页面组合根，浏览器全局只暴露 `window.oPet`。构造动画运行时所需的时钟、随机数、文档和渲染端口均由组合根注入。测试直接导入模块。组合根行为测试只替换角色运行时端口。

`renderer/types.js` 定义活动、Cue、场景、时间线、调度器、角色端口和只读帧模型等共享契约。motion、face、gaze、编排和视觉通道分别公开受支持名称的注册表。组合根在创建角色运行时前验证全部场景和预览动作引用。组合根、适配器、行为、目录、时间线、帧引擎和 SVG 入口使用严格 JavaScript 检查。底层几何、特效、眼睛和粒子公式仍由确定性视觉基线保护。

`renderer/view/geometry-data.js` 保存原始形状和眼睛数据。形状路径、轮廓采样、动画公式、弹簧参数和混合顺序属于视觉契约。渲染器测试使用确定的时钟和随机数检查关键 SVG 帧，避免重构改变现有画面。

启动后，macOS 会在 Dock 中显示应用图标。macOS、Windows 和 Linux 均会创建托盘图标。托盘菜单可显示、隐藏或重新加载桌宠，也可退出应用。“重新加载桌宠”会重新读取配置并立即应用，不会重启应用或中断 IPC 服务；配置无效时保留当前状态并输出错误。Linux 桌面环境必须提供 StatusNotifierItem 主机才能显示托盘图标。

## 应用打包

在 macOS 或 Windows 上安装仓库使用的 `cargo-packager` 版本：

```bash
cargo install cargo-packager
```

在目标平台执行发布打包：

```bash
cargo package-app
```

macOS 默认生成 `.app` 和 `.dmg`，Windows 默认生成 NSIS `.exe` 安装程序。产物位于 `dist/`。应用包和 Windows 可执行文件均使用 `assets/app-icon-256.png` 对应的平台图标。

默认产物未签名。对外分发前，需要在对应平台配置代码签名，并在 macOS 上完成公证。

## 配置

Linux、macOS 和 Windows 均读取 `~/.config/o-pet/config.toml`。配置文件不存在时使用默认值。

```toml
size = 120
shape = "blob"
body_color = "radial-gradient(circle at 28% 20% in oklch, oklch(72% 0.015 85), oklch(59% 0.022 75), oklch(47% 0.028 65))"
body_blur = 4
eye_color = "#fffaf0"
```

- `size`：正方形窗口的边长，取值范围为 `64` 到 `1024`。
- `shape`：桌宠形状。支持 `blob`、`pebble`、`bean`、`egg`、`squircle`、`tablet`、`capsule`、`cylinder`、`hex`、`gem`、`crystal`、`wedge`、`shield`、`dome`、`arch`、`cloud`、`teardrop` 和 `leaf`。
- `body_color`：身体颜色，支持单色、线性渐变和径向渐变。单色和渐变色标支持十六进制、CSS 颜色名、`rgb()`、`hsl()` 和 `oklch()` 等 CSS 颜色格式。
- `body_blur`：径向渐变的光晕模糊量，取值为 `0` 到 `32` 之间的整数。径向渐变省略该字段时使用 `4`。该值仅可与 `radial-gradient` 一起使用。
- `eye_color`：眼睛颜色，仅支持 `body_color` 可用的单色格式。

`body_color` 支持以下渐变语法：

```toml
# 默认使用 sRGB 插值
body_color = "linear-gradient(135deg, #ff6b6b, #4d96ff)"

# 第三个颜色是位于 50% 的桥梁色
body_color = "linear-gradient(135deg, #ff6b6b, #ffd166, #4d96ff)"

# 使用 OKLCH 插值，色标本身也可以使用 oklch() 格式
body_color = "linear-gradient(135deg in oklch, oklch(70% 0.2 20), oklch(65% 0.2 260))"

# 径向渐变支持调整圆心，并可添加光晕
body_color = "radial-gradient(circle at 35% 30%, #ffffff, #a855f7, transparent)"
body_blur = 10
```

渐变只支持两个或三个等距色标。线性渐变角度使用 `deg`。径向渐变圆心使用 `circle at <x>% <y>%`，省略时默认为 `50% 50%`。两种渐变均可在头部追加 `in oklch`。暂不支持自定义色标位置、方向关键字、椭圆、重复渐变和锥形渐变。

所有字段均可省略。配置格式、字段名或字段值无效时，桌宠会输出错误并终止启动。`size` 会覆盖内部保存的窗口尺寸，但不会清除已保存的显示器和窗口位置。

## IPC 协议

客户端通过本地端点向桌宠发送 JSON Lines。每条消息必须以换行符结束。

```json
{"type":"hello","clientId":"client-1","sessionId":"session-1"}
{"type":"event","event":{"type":"thinking_started"}}
{"type":"event","event":{"type":"agent_settled","outcome":"success","durationMs":1200}}
{"type":"goodbye"}
```

支持的顶层消息是：

- `hello`：必须包含 `clientId` 和 `sessionId`。
- `event`：包含一个 Agent 活动事件。
- `goodbye`：结束当前连接。

Agent 活动事件包括 `agent_started`、`turn_started`、`thinking_started`、`reply_started`、`reply_finished`、`tool_observed`、`tool_started`、`tool_progressed`、`tool_finished`、`approval_requested`、`approval_resolved` 和 `agent_settled`。字段使用协议示例中的 camelCase 命名。

桌宠会忽略未知消息类型、未知事件类型、格式错误的消息和未知字段。单行最大长度为 64 KiB。

## IPC 端点

可以通过 `O_PET_ENDPOINT` 指定端点。未设置时使用平台默认值：

- Linux：`$XDG_RUNTIME_DIR/o-pet.sock`
- macOS：临时目录下的用户专属 `o-pet.sock`
- Windows：当前用户专属的命名管道

Unix 端点的父目录会以当前用户私有权限创建和校验。Windows 命名管道使用当前用户专属的访问控制。

## 许可证

本项目使用 [AGPL-3.0-only](LICENSE) 许可证。
