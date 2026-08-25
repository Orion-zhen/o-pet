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

## 渲染器架构

渲染器按职责分为四层：

- `renderer/host.js` 根据活动、Cue、空闲深度和用户交互选择动画。
- `renderer/grok/presets.js` 组合场景，`sequences.js` 安排有限动画序列。场景由 `motion`、`face`、`expression`、`gaze`、`form`、`decoration`、`particles`、`camera` 和 `badge` 九个固定通道组成。
- `motion.js`、`expression.js`、`gaze.js`、`actions.js` 和 `choreography.js` 计算各通道的目标值与瞬态动作。控制器不生成 SVG 路径，也不直接调用其他控制器。
- `geometry.js` 从原始形状数据派生轮廓、截面和旋转形变。`render.js`、`eyes.js`、`effects.js` 和 `particles.js` 将已混合的状态写入 SVG。

`geometry-data.js` 保存原始形状和眼睛数据。形状路径、轮廓采样、动画公式、弹簧参数和混合顺序属于视觉契约。渲染器测试使用确定的时钟和随机数检查关键 SVG 帧，避免重构改变现有画面。

启动后，macOS 会在 Dock 中显示应用图标。macOS、Windows 和 Linux 均会创建托盘图标。托盘菜单可显示或隐藏桌宠，也可退出应用。Linux 桌面环境必须提供 StatusNotifierItem 主机才能显示托盘图标。

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
size = 240
shape = "blob"
body_color = "#808080"
eye_color = "#f3efe6"
```

- `size`：正方形窗口的边长，取值范围为 `64` 到 `1024`。
- `shape`：桌宠形状。支持 `blob`、`pebble`、`bean`、`egg`、`squircle`、`tablet`、`capsule`、`cylinder`、`hex`、`gem`、`crystal`、`wedge`、`shield`、`dome`、`arch`、`cloud`、`teardrop` 和 `leaf`。
- `body_color`：身体颜色，支持十六进制、CSS 颜色名、`rgb()` 和 `hsl()` 等 CSS 颜色格式。
- `eye_color`：眼睛颜色，格式与 `body_color` 相同。

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
