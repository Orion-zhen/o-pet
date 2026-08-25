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

## 配置

Linux、macOS 和 Windows 均读取 `~/.config/o-pet/config.toml`。配置文件不存在时使用默认值。

```toml
size = 240
shape = "blob"
body_color = "#000000"
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
