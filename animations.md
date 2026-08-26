# 动画调度设计

本文记录当前实现，不描述未来方案。重点是 Agent 事件如何变成活动和瞬态提示，渲染器何时选择动画，动画链如何排布，以及空闲、交互和帧内动画的触发条件。

文中的“拟人化描述”是对现有动作的角色化解读，用于表达情绪、动机和微型故事，不属于运行时行为契约。触发条件和时长仍以实现说明及代码为准。

## 1. 总体链路

```text
AgentEvent
  -> Coordinator 选择前台客户端
  -> AnimationUpdate { activity, cue? }
  -> host 状态机
  -> idle / activities / cues / interaction 导演
  -> 单一有限 timeline
  -> presenter 切换场景或触发一次性动作
  -> preset 解析 10 个控制通道
  -> character 每帧采样控制器并推进弹簧
  -> SVG 视图
```

主要实现位置如下。

| 层 | 文件 | 职责 |
| --- | --- | --- |
| 事件归并 | `src/coordinator.rs` | 将 IPC 事件归并为前台 `activity` 和可选 `cue` |
| 组合与抢占 | `renderer/host.js` | 管理全局状态、行为切换、唤醒、抢占和生命周期 |
| 统一时钟 | `renderer/runtime/scheduler.js` | 统一定时器、动画帧和逻辑时间，处理页面隐藏 |
| 有限时间线 | `renderer/runtime/timeline.js` | 顺序进入步骤、循环、完成回调和取消 |
| 场景呈现 | `renderer/runtime/presenter.js` | 维护基础场景、临时覆盖和一次性动作 |
| 行为导演 | `renderer/behaviors/*.js` | 生成活动、空闲、Cue 和指针交互的步骤链 |
| 动画目录 | `renderer/catalog/*.js` | 定义场景、有限序列和可预览动作名 |
| 帧运行时 | `renderer/engine/runtime.js` | 采样身体、表情、视线、视觉通道和一次性动作 |

高层动画只使用一个有限时间线。新的 `timeline.play()` 会取消当前时间线，因此活动、空闲片段、Cue 和普通交互不会并行播放。角色的呼吸、眨眼、视线、弹簧和粒子仍由每帧运行时持续推进。`presenter` 的临时覆盖是例外，它可在受保护动画上方显示 `dragging`，但不会推进另一条有限时间线。

## 2. 场景和步骤

一个场景固定包含 10 个正交通道：

- `motion`：身体姿态和位移
- `face`：脸部姿态
- `expression`：眼形、眼睑和眼睛缩放
- `gaze`：程序化视线
- `shape`：临时身形覆盖；场景退出时恢复用户配置身形
- `form`：身体形变特效
- `decoration`：装饰
- `particles`：粒子
- `camera`：构图缩放
- `badge`：徽标

行为导演不直接操作 SVG。导演只向时间线提交步骤，常用字段如下。

| 字段 | 效果 |
| --- | --- |
| `scene` | 切换组合场景，默认保留弹簧连续性，不重置整段播放 |
| `state` | 从动作名构造完整预设，并用 `playPreset` 重启播放，用于预览模式 |
| `duration` | 当前步骤保持时间 |
| `pause` | 暂停角色动画帧，步骤计时仍由时间线继续 |
| `wink` | 进入步骤时单次眨一只眼 |
| `spin` | 进入步骤时单次旋转 |
| `bounce` | 进入步骤时单次跳跃 |
| `pounce` | 进入步骤时施加横向和纵向冲量 |
| `preserveEffect` | 保留基础场景的 5 个视觉特效通道，只替换身体、脸、表情和视线 |

场景切换和一次性动作都发生在步骤入口。步骤到时后，时间线进入下一步。非循环时间线完成后执行导演提供的回调。

## 3. Agent 事件如何选择活动

### 3.1 工具分类

| 工具名 | 活动 |
| --- | --- |
| `read`、`grep`、`find`、`websearch` | `searching` |
| `edit`、`write` | `coding` |
| `bash` | `terminal` |
| `webfetch` | `receiving` |
| `skill` | `consulting` |
| 其他名称 | `tooling` |

多个工具并行时，最近开始且仍活跃的工具决定当前工作活动。等待审批优先于活跃工具。没有活跃工具时，运行中的 Agent 回到基础活动 `thinking` 或 `replying`。

### 3.2 事件映射

| `AgentEvent` | 活动结果 | Cue 或附加效果 |
| --- | --- | --- |
| `agent_started` | `thinking` | `engage`，并清空本轮工具、审批和错误统计 |
| `turn_started`、`thinking_started` | 基础活动改为 `thinking`，再按审批和活跃工具覆盖 | 无 |
| `reply_started` | 基础活动改为 `replying`，再按审批和活跃工具覆盖 | 无 |
| `reply_finished` | 保持当前工作活动 | `reply_sent` |
| `tool_observed` | 直接切到工具分类活动 | 无 |
| `tool_started` | 审批优先，否则使用最近活跃工具的分类 | 新工具调用使 `tool_count + 1` |
| `tool_progressed` | 工具仍活跃时重新计算当前工作活动 | `progress` |
| `tool_finished: success` | 移除工具并回到下一层工作活动 | 连续错误计数归零 |
| `tool_finished: error` | 移除工具并回到下一层工作活动 | 按连续错误次数产生错误 Cue |
| `approval_requested` | `awaiting_approval` | 无 |
| `approval_resolved: approved` | 回到当前工作活动 | `approval_granted` |
| `approval_resolved: denied` | 移除被拒绝工具，再回到当前工作活动 | `approval_denied`，随后该工具的失败结果不再产生错误 Cue |
| `agent_settled` | `idle` | 按结果和工作量产生完成 Cue |

错误 Cue 的条件如下。

| 连续工具错误次数 | Cue |
| --- | --- |
| 1 | `error_first` |
| 2 至 3 | `error_repeated` |
| 4 及以上 | `error_stubborn` |

任意工具成功会把连续错误次数归零。

完成 Cue 的条件按以下顺序判断。

| 条件 | Cue |
| --- | --- |
| `outcome = error` | `run_failed` |
| `outcome = aborted` | `run_aborted` |
| 成功，且 `durationMs >= 45000`，或工具数至少为 5，或工具错误数至少为 2 | `completed_hard` |
| 成功，且 `durationMs <= 8000`，并且未调用工具 | `completed_quick` |
| 其他成功结果 | `completed_normal` |

### 3.3 多客户端选择

每个 IPC 连接维护独立活动状态。协调器只向渲染器输出一个前台客户端。

1. `awaiting_approval` 的前台优先级为 2。
2. 其他非空闲活动的优先级为 1。
3. `idle` 的优先级为 0。
4. 优先级相同时，最近收到事件的客户端获选。
5. Cue 只在产生该 Cue 的客户端成为当前前台客户端时可见。
6. 当前可见活动未改变且没有可见 Cue 时，不发送 `AnimationUpdate`。

## 4. 渲染器状态机和抢占关系

`host` 使用以下状态：

| 状态 | 含义 |
| --- | --- |
| `startup` | 启动动画受保护 |
| `waking` | 从困倦或睡眠进入 Agent 活动，动画受保护 |
| `switching` | 等待活动切换消抖 |
| `idle` | 空闲导演占用时间线 |
| `activity` | Agent 活动导演占用时间线 |
| `cue` | 瞬态 Cue 占用时间线 |
| `interaction` | 普通指针交互占用时间线 |
| `preview` | 命令行预览循环，拒绝后续活动更新 |

### 4.1 启动和活动切换

```text
创建渲染器
  -> spawning 2000 ms
  -> 播放启动期间排队的 Cue
  -> 当前 activity
```

没有 Cue 的普通活动变化会经过 350 ms 消抖。消抖期间连续变化只进入最后收到的活动。

```text
当前活动
  -> switching 350 ms
  -> 最新活动
```

`awaiting_approval` 是例外。没有 Cue 的审批等待更新会立即进入审批动画，不等待 350 ms。

离开 `idle` 时，空闲导演会按空闲会话时间计算真实深度。当前深度为 `drowsy` 或 `sleeping` 时，进入非空闲活动前播放唤醒。

```text
idle(drowsy/sleeping)
  -> switching 350 ms
  -> waking 1800 ms
  -> activity
```

如果同一更新还携带 Cue，则先保护唤醒并把 Cue 排队，不经过 350 ms。

```text
idle(drowsy/sleeping) + cue
  -> waking 1800 ms
  -> cue
  -> activity
```

启动和唤醒不能被 Cue 打断。期间只保留一个待播放 Cue，选择规则见第 6 节。

### 4.2 交互与 Cue 的抢占

- 普通指针按下会打断 `idle`、`activity`、`cue` 或 `switching`。被打断 Cue 及其待播放 Cue 会被清除。
- 新 Cue 会打断普通交互，并清除交互场景和视线目标。
- `startup`、`waking` 和 `preview` 是受保护状态。指针按下只临时覆盖 `dragging`，松开后恢复底层动画。
- Cue 结束后重新启动当前活动导演，不从被打断步骤续播。
- 活动变化也会重新创建活动链，不保存旧链的步骤位置。
- 完成 Cue 播放期间若活动变为新的非空闲活动，完成 Cue 会被取消，新活动按切换流程进入。

## 5. 持续活动动画链

下表中的范围为每轮独立随机选择。活动保持不变时，链尾回到链首。

| 活动 | 循环链 | 选择条件或附加动作 |
| --- | --- | --- |
| `thinking` | `thinking` 3–6 s -> 强调场景 -> 重复 | `humming` 6–9 s，权重 40%。`thinking-alt` 6–9 s，权重 36%。`deepThinking` 3.5–5.5 s，权重 16%。`radar` 3.2–4.8 s，权重 8% |
| `searching` | `searching` 3.5–6.5 s -> 强调场景 -> 重复 | `curious` 1.4–2.4 s，权重 45%。`radar` 2.5–4 s，权重 35%。`deepThinking` 1.8–3 s，权重 20% |
| `coding` | `coding` 10–16 s -> `reviewing` 2.2–3.2 s -> 重复 | 进入 `reviewing` 时旋转 1 圈 |
| `terminal` | 首轮 `terminalTyping` 0.65–1.1 s -> `loading` 4.5–7 s。后续通常只循环 `loading` | 活动至少持续 20 s、最近 5 s 没有 `progress`、且随机值小于 0.4 时，在两轮 `loading` 间插入 `bored` 1.4–2.4 s |
| `receiving` | `receiving` 5–8 s -> `curious` 1.2–2.2 s -> 重复 | 无 |
| `consulting` | `consulting` 4–6.5 s -> `deepThinking` 1.8–3 s -> 重复 | 无 |
| `tooling` | `tooling` 4.5–7 s -> `loading` 3–5 s -> 重复 | 无 |
| `replying` | `replying` 6–10 s -> `listening` 0.7–1.2 s -> 重复 | 无 |
| `awaiting_approval` | 首次 `alerting` 1.6 s -> 等待场景 15–25 s -> `notifying` 5 s -> 重复等待段 | 活动开始未满 45 s 时等待场景为 `listening`。达到 45 s 后，新一轮等待改为 `bored` |

`thinking` 和 `searching` 会记住各自上一次强调场景。有多个候选时，下一轮排除上一次结果后再按权重选择，因此不会连续两轮使用同一强调场景。

`progress` 不播放可见 Cue，也不抢占当前时间线。它只更新时间戳，用于抑制 `terminal` 的无输出无聊片段。

主要活动场景的视觉组合如下。

| 场景 | 身体动作 | 表情 | 主要特效 | 视线 |
| --- | --- | --- | --- | --- |
| `thinking` | `thinking` | `thinking` | 无 | `thinking` |
| `thinking-alt` | `thinking-alt`，丝滑切换为略微缩小上移的 `cloud` 身形；轮廓缓慢起伏，并以明显的纵向舒展和横向收放持续呼吸、拉伸和回弹 | `thinking` | 至少两个思考圆点沿弧线上升，接触身体时与局部鼓起的边缘融合，再进入身体并随鼓包回落而被吸收 | `thinking` |
| `deepThinking` | `thinking` | `curious` | `thinking` 圆点 | `thinking` |
| `humming` | `humming` | `thinking` | 哼唱圆点和宽旋转粒子带 | `thinking` |
| `radar` | `thinking` | `searching` | `radar` | `searching` |
| `searching` | `searching` | `searching` | 无 | `searching` |
| `coding` | `working` | `working` | `writing` 铅笔 | `working` |
| `reviewing` | `thinking` | `searching` | 无 | `working` |
| `terminalTyping` | `working` | `working` | 无 | `working` |
| `loading` | `working` | `working` | `loading` 和旋转粒子带 | `working` |
| `receiving` | `working` | `curious` | `receiving` | `searching` |
| `consulting` | `thinking` | `curious` | `orbit` | `thinking` |
| `tooling` | `working` | `working` | `orbit` | `working` |
| `replying` | `listening` | `listening` | `dictating` | `listening` |

### 5.1 持续活动的拟人化叙事

| 活动 | 拟人化描述 |
| --- | --- |
| `thinking` | 它先安静地反复推敲，再偶尔化作云朵吸收逐渐成形的念头、哼着小调整理思路、钻进更深的思考，或像打开雷达一样寻找突破口。强调场景让“持续思考”看起来不是机械等待，而是有灵感起伏的内心活动。 |
| `searching` | 它先专注地扫视信息，然后因为发现线索而好奇靠近、扩大搜索范围，或停下来重新判断方向。整条链像“搜索 -> 发现疑点 -> 调整策略”。 |
| `coding` | 它长时间埋头书写，阶段末抬头审视成果并转一圈换换脑子，再投入下一轮。旋转可以理解为一次带成就感的思维刷新。 |
| `terminal` | 它先快速敲下命令，然后盯着执行结果等待。长时间没有输出时，它会短暂走神和无聊。新输出会重新唤起注意力。 |
| `receiving` | 它努力接住外部信息，完成一批接收后露出好奇神情，像是在问“这里面有什么”。 |
| `consulting` | 它把外部建议放在脑中反复环绕，再收回注意力深入消化。动作表达的是“听取意见”而不是直接照做。 |
| `tooling` | 它认真操作一个尚未形成专属动作的工具，随后观察工具运转和加载，像一名谨慎使用陌生设备的助手。 |
| `replying` | 它面向用户组织语言并持续讲述，句间短暂停下来观察对方是否跟上，然后继续表达。 |
| `awaiting_approval` | 它先明显提醒用户“需要你决定”，随后安静陪伴等待。等待过久时，它从耐心注视变成有点无聊，但仍会周期性轻声提醒。 |

### 5.2 当前动画链的叙事语法

现有活动链主要使用以下拟人化结构：

- **专注 -> 变奏 -> 回到专注**：`thinking`、`searching`、`receiving`、`consulting` 和 `tooling` 都先建立稳定工作状态，再用短强调表现灵感、检查或反馈。
- **长任务 -> 抬头复盘 -> 继续**：`coding` 用长书写和短审视形成工作节奏，让角色看起来知道自己刚完成了一个小阶段。
- **行动 -> 等待结果 -> 情绪泄漏**：`terminal` 先执行命令，再等待输出。沉默过久后插入无聊反应，使等待具有主观感受。
- **请求注意 -> 克制等待 -> 再次提醒**：`awaiting_approval` 不持续报警，而是在显眼提醒后降低动作强度，保留礼貌和耐心。
- **先移动视线，再移动身体**：多个空闲片段先使用 `gaze*` 场景，再让身体跟随。这个顺序会产生“它先发现了什么，然后才采取行动”的意图感。

## 6. Cue 动画、优先级和排队

### 6.1 Cue 序列

| Cue | 优先级 | 动画链 |
| --- | ---: | --- |
| `progress` | 0 | 不播放动画，只记录进度时间 |
| `engage` | 1 | `listening` 350 ms -> `curious` 650 ms |
| `reply_sent` | 2 | `sending` 850 ms |
| `approval_granted` | 2 | `happy` 900 ms，保留 Cue 触发前的视觉特效 |
| `approval_denied` | 2 | `shy` 900 ms，保留 Cue 触发前的视觉特效 |
| `error_first` | 3 | `surprised` 650 ms，保留 Cue 触发前的视觉特效 |
| `error_repeated` | 3 | `confused` 1200 ms，保留 Cue 触发前的视觉特效 |
| `error_stubborn` | 3 | `angry` 1400 ms，保留 Cue 触发前的视觉特效 |
| `completed_quick` | 4 | `quickHappy` 900 ms，并单次眨眼 -> `notifying` 5000 ms |
| `completed_normal` | 4 | `proud` 1500 ms -> `notifying` 5000 ms |
| `completed_hard` | 4 | `celebrate` 2500 ms -> `notifying` 5000 ms |
| `run_failed` | 4 | `sad` 1800 ms -> `notifying` 5000 ms |
| `run_aborted` | 4 | `surprised` 600 ms |

`preserveEffect` 只替换 `motion`、`face`、`expression` 和 `gaze`。例如编码时收到 `error_repeated`，身体改为 `confused`，但铅笔等 `form`、`decoration`、`particles`、`camera` 和 `badge` 通道继续显示。

### 6.2 Cue 的拟人化语义

| Cue | 拟人化描述 |
| --- | --- |
| `engage` | 听见呼唤后先认真倾听，再带着好奇心靠近任务，表达“我来了，先让我看看”。 |
| `reply_sent` | 把刚组织好的内容郑重送向用户，像松开一封已经写完的信。 |
| `approval_granted` | 得到许可后露出轻快而克制的开心，表达“收到，我可以继续了”。 |
| `approval_denied` | 稍微缩回去并显得腼腆，表达“明白，那我不做了”，不把拒绝表现成失败。 |
| `error_first` | 第一次失败让它突然一惊，像是遇到一个没预料到的小障碍。 |
| `error_repeated` | 连续失败后，它不再只是惊讶，而是歪着头困惑地重新检查问题。 |
| `error_stubborn` | 多次失败耗尽耐心，它短暂生气，表达“这个问题怎么还在”。 |
| `completed_quick` | 轻巧完成任务后眨眼报喜，带一点“这很简单”的俏皮感，然后提醒用户查看结果。 |
| `completed_normal` | 稳稳完成后先自豪地确认成果，再把结果交给用户。 |
| `completed_hard` | 艰难任务完成后明显庆祝，让积累的努力得到情绪释放，然后回到通知职责。 |
| `run_failed` | 最终失败时先显得失落，再把结果交给用户，表达遗憾但不逃避汇报。 |
| `run_aborted` | 任务突然结束使它短暂错愕，没有庆祝或悲伤结论，保留“发生了什么”的中断感。 |

`progress` 没有可见表演。拟人化上，它相当于角色听见终端仍在“说话”，因此继续耐心等待，而不是因为沉默而走神。

### 6.3 Cue 抢占规则

Cue 导演维护一个当前 Cue 和一个待播放槽位。

1. 没有当前 Cue 时立即播放。
2. 新 Cue 优先级高于当前 Cue 时立即抢占。
3. 新 Cue 优先级不高于当前 Cue 时进入待播放槽位。
4. 待播放槽位已有 Cue 时，只有更高优先级的新 Cue 会替换它。相同优先级不会替换。
5. `reply_sent` 播放期间收到任意完成 Cue 时，完成 Cue 必须排队，确保先完成发送动画。
6. `startup` 或 `waking` 期间的 Cue 都进入待播放槽位。
7. 当前 Cue 结束后先播放待播放 Cue。没有待播放 Cue 时才恢复当前活动。

待播放槽位只有一个，不保存完整队列。

## 7. 空闲导演

### 7.1 空闲深度

每次进入 `idle` 都创建新的空闲会话，并随机生成深度边界。

| 深度 | 到达时间 | 基础场景 | 片段间隔 |
| --- | --- | --- | --- |
| `awake` | 会话开始 | `idle` | 5–9 s |
| `relaxed` | 90–150 s | `idle` | 8–14 s |
| `drowsy` | `max(relaxed + 60 s, 240–420 s)` | `drowsy` | 10–18 s |
| `sleeping` | `max(drowsy + 180 s, 600–900 s)` | `sleeping` | 18–30 s |

基础场景的等待不会跨过深度边界。到达边界时，导演立即重新计算深度并进入对应基础场景。页面隐藏的时间不计入空闲会话。

### 7.2 片段选择

候选片段必须同时满足以下条件：

- 支持当前空闲深度
- 已经过各自冷却时间
- 不在最近 3 个片段中
- 高能量片段还要求能量预算达到 3，且上一片段不是高能量

如果排除最近 3 个片段后没有候选，导演只排除紧邻的上一个片段。候选按权重随机选择。

能量预算初始为 3。高能量片段把预算清零，低能量片段恢复 1，中能量片段恢复 0.5，上限为 3。高能量片段结束后还会增加 20–30 s 安静期。片段历史最多保留 6 个名称。

同一类片段的左右方向首次随机选择，之后尽量与该类上一次方向相反。

### 7.3 空闲片段链

| 片段 | 深度 | 能量、权重、冷却 | 动画链和分支 |
| --- | --- | --- | --- |
| `notice` | `awake`、`relaxed` | 低，5，20 s | `gazeListening` 250 ms -> `listening` 450 ms -> `curious` 900 ms。35% 进入 `playful` 3000 ms 并轻扑，再进入 `happy` 1400 ms。其余进入 `idle` 700 ms |
| `patrol` | `awake`、`relaxed` | 低，3，30 s | `gazeSearching` 250 ms -> 同方向 `searching` 3500 ms -> 反方向 `searching` 650 ms -> `proud` 2200 ms |
| `pounce` | `awake` | 中，2，35 s | `gazeCurious` 250 ms -> `curious` 400 ms -> `playful` 3000 ms -> `jumping` 1050 ms 并全力扑。55% 成功后 `happy` 1400 ms，否则 `surprised` 600 ms -> `shy` 900 ms |
| `bounce-practice` | `awake` | 高，1.4，75 s | `playful` 3000 ms -> `jumping` 1800 ms 并跳跃。18% 失败后 `surprised` 650 ms -> `shy` 800 ms，否则 `happy` 1400 ms |
| `spin-challenge` | `awake` | 高，0.9，90 s | 反方向 `playful` 3000 ms -> 正方向 `playful` 3000 ms 并旋转 1 圈。62% 进入 `proud` 2200 ms，34% 进入 `shy` 1300 ms，4% 进入 `quickHappy` 900 ms 并眨眼和轻扑 |
| `stretch` | `awake`、`relaxed` | 中，2，40 s | `stretching` 3500 ms -> `happy` 1400 ms |
| `quiet-observe` | `relaxed` | 低，4，18 s | `listening` 1200 ms -> `idle` 900 ms |
| `self-entertain` | `relaxed` | 中，2.2，40 s | `bored` 1600 ms -> `curious` 900 ms -> `playful` 3000 ms |
| `sleepy-nod` | `drowsy` | 低，5，20 s | `drowsy` 2200 ms -> `surprised` 600 ms -> `drowsy` 900 ms |
| `resist-sleep` | `drowsy` | 中，2.2，40 s | `stretching` 3500 ms -> `happy` 1400 ms -> `drowsy` 900 ms |
| `half-awake` | `drowsy` | 低，2.5，30 s | `sleepyCurious` 1600 ms -> `drowsy` 1000 ms |
| `sleepy-play` | `drowsy` | 中，1，70 s | `playful` 3000 ms -> `drowsy` 1300 ms |
| `dream-float` | `sleeping` | 低，1，35 s | `dreaming(float)` 6–10 s |
| `dream-curl` | `sleeping` | 低，1，35 s | `dreaming(curl)` 6–10 s，带交替方向 |
| `dream-twitch` | `sleeping` | 低，1，35 s | `dreaming(twitch)` 6–10 s |

每个片段结束后回到当前深度的基础场景，再等待下一次片段。进入 Agent 活动会终止空闲会话。再次进入 `idle` 时，深度、片段冷却、历史和能量全部重置。

### 7.4 空闲片段的拟人化叙事

| 片段 | 拟人化描述 |
| --- | --- |
| `notice` | 它似乎听见旁边有动静，先只转动视线，再侧身观察。发现有趣目标时会忍不住轻扑并为自己的发现开心，否则若无其事地回到原位。 |
| `patrol` | 它像小小的值班员一样左右巡视，确认周围没有异常后，带着完成巡逻任务的自豪感收尾。 |
| `pounce` | 它锁定一个想象中的猎物，压低注意力、试探靠近，然后猛扑过去。成功时兴奋，扑空时先受惊再害羞，形成完整的尝试和结果。 |
| `bounce-practice` | 它主动给自己安排弹跳练习。大多数时候会因完成动作而开心，偶尔失误后则先吓一跳，再不好意思地收场。 |
| `spin-challenge` | 它左右蓄势后挑战一次旋转，结束时可能骄傲、害羞，极少数时候会用眨眼和轻扑把动作包装成一次完美表演。 |
| `stretch` | 它意识到自己待得太久，于是认真舒展身体，伸完后露出轻松满足的表情。 |
| `quiet-observe` | 它没有明确目标，只是安静听一会儿周围的声音，确认无需行动后继续休息。 |
| `self-entertain` | 它先因无事可做而无聊，随后自己发现一个念头，并把这个念头发展成短暂游戏。 |
| `sleepy-nod` | 它快要睡着时突然点头下坠，又被自己惊醒，努力睁眼后仍抵不过困意。 |
| `resist-sleep` | 它用力伸展并给自己打气，短暂恢复精神，最后还是慢慢回到困倦。 |
| `half-awake` | 它半睁着眼确认周围发生了什么，发现没有要紧事后又把注意力放下。 |
| `sleepy-play` | 它困得厉害却还想玩一下，刚提起一点兴致，很快又软回困倦状态。 |
| `dream-float` | 梦里的它失去重量，缓慢漂起又落下，像被平静的梦境托住。 |
| `dream-curl` | 它在梦里朝一侧蜷缩，像在寻找更舒服、更安全的位置。 |
| `dream-twitch` | 平静睡眠中突然出现短促抽动，像梦里追逐了什么，然后立即恢复安静。 |

这些片段大多遵循“察觉或欲望 -> 尝试 -> 结果 -> 情绪收尾”的微型故事结构。冷却、最近片段排除和能量预算共同避免角色反复讲同一个故事，或连续表现得过度兴奋。

### 7.5 悬停片段

鼠标进入角色时，只有满足以下条件才触发悬停片段：

- 当前活动为 `idle`
- `host` 当前状态为 `idle`
- 没有指针按下交互
- 当前深度为 `awake` 或 `relaxed`
- 距上次悬停触发至少 45 s

动画链为：

```text
curious 500 ms
  -> front 1300 ms
  -> 18% 概率追加 quickHappy 700 ms 和单次眨眼
  -> 恢复空闲导演
```

拟人化上，它先察觉用户靠近，再把注意力从环境转到用户本人。偶发眨眼让这次对视从“注意到了你”升级为“我在主动向你打招呼”。

## 8. 指针按下和拖动

只有主按钮按下会开始交互。原生窗口拖动立即开始，视觉链由当前活动和空闲深度决定。

### 8.1 非睡眠状态

```text
pointer down
  -> dragging，持续到松开
```

如果当前活动不是 `idle`：

```text
dragging
  -> pointer up
  -> 立即从头恢复当前活动链
```

如果当前活动是 `idle`，包括 `awake`、`relaxed` 和 `drowsy`：

```text
dragging
  -> pointer up
  -> quizzical 2200 ms，视线锁定正前方
  -> 恢复当前空闲深度
```

### 8.2 睡眠状态

```text
pointer down
  -> startled 650 ms，视线锁定接触点
  -> 若仍按住则 dragging
  -> pointer up
  -> quizzical 2200 ms
  -> 暂时恢复 drowsy
```

接触窗口左半边时 `startled` 使用方向 `+1`，右半边使用方向 `-1`。如果在 650 ms 惊醒步骤完成前松开，会跳过 `dragging`，直接进入 `quizzical`。

单次睡眠打断会设置 20–40 s 恢复窗口。在该窗口内，已达到睡眠边界的会话按 `drowsy` 呈现。窗口结束后重新进入 `sleeping`。

### 8.3 连续戳弄完全唤醒

空闲状态下每次按下都会记录一次戳弄。25 s 内达到 3 次时，在本次 `quizzical` 后执行完整唤醒：

```text
quizzical 2200 ms
  -> stretching 3500 ms
  -> playful 700 ms
  -> happy 900 ms
  -> 重置空闲会话并进入 awake
```

计数达到 3 次后立即清空。完整唤醒从 `stretching` 开始时重置空闲深度计时。

### 8.4 交互链的拟人化叙事

| 交互链 | 拟人化描述 |
| --- | --- |
| 活动期间拖动 | 它允许用户把自己抱起来移动。放下后立刻回到工作，表现出配合但不忘当前职责。 |
| 清醒空闲时拖动 | 它被抱起时顺着拖动移动，落地后歪头看向用户，像在问“你找我吗”。 |
| 睡眠时按住 | 突然接触先让它受惊并看向触碰位置。确认自己仍被抱着后，它才进入拖动姿态。 |
| 睡眠时快速松开 | 它从惊醒直接转为面对用户的疑问，像在确认刚才是否真的有人碰过自己。 |
| 单次睡眠打断 | 它没有彻底清醒，只是带着警觉浅睡一段时间，确认安全后再次进入深睡。 |
| 三次连续戳弄 | 它终于接受用户确实想让自己醒来，于是伸懒腰、恢复玩心、开心回应，并从头开始新的清醒会话。 |
| 受保护动画期间拖动 | 它在视觉上回应用户的抓取，但启动、唤醒或预览表演仍在后台保持原来的进度。松手后继续完成原表演。 |

`quizzical` 是交互链的关键“关系确认”动作。它不表示系统错误，而是角色在被用户触碰后主动确认用户意图。

## 9. 帧内自动动画

有限时间线只决定当前场景。角色运行时每帧继续调度以下动画。

### 9.1 眼形、眨眼和视线

- 每种 `expression` 都有眼形播放列表和保持时间。保持时间到期后随机切换到同一列表中的下一眼形。
- 每种 `expression` 独立配置普通眨眼间隔。`sleeping`、`dreaming`、`waking`、`drowsy` 和若干特效表情不做周期眨眼。
- `idle`、`happy`、`excited`、`curious` 和 `playful` 会自动眨单眼。进入表情后首次等待 3–8 s，之后每次等待 4.5–10 s。
- 场景切换后，普通视线首次等待通常为 0.5–1.4 s。`front` 和 `sleeping` 首次等待 5–8 s。之后由当前 `gaze` 控制器选择目标和保持时间。
- 启用跟随指针时，指针位置覆盖程序化视线。`front` 和 `sleeping` 锁定正前方，不跟随指针。惊醒交互设置的显式接触点优先于普通指针跟随。

眼形列表、保持范围和眨眼范围的数据源是 `renderer/catalog/tables.js`。视线目标范围和保持时间的数据源是 `renderer/engine/channels/gaze.js`。

### 9.2 身体和入场编排事件

| 当前场景或身体状态 | 自动事件 |
| --- | --- |
| `idle` | 每 7–15 s 安排一次持续 0.9–1.7 s 的轻微重心转移 |
| `sleeping` | 每 18–34 s 安排一次 420 ms 抽动，减少动态模式下不执行抽动位移 |
| `listening` | 点头结束后等待 1.8–3.2 s 再安排下一次 380 ms 点头 |
| `curious` | 点头结束后等待 1.6–2.8 s 再安排下一次 440 ms 点头 |
| `drowsy` | 进入后等待 12–24 s 开始约 3.5 s 的下沉、惊醒和恢复，然后重新等待 12–24 s |
| `searching` | 进入后 0.8–1.6 s 可首次旋转，之后每 4–7 s 再旋转 |
| `working` | 进入后 1.2–2.4 s 可首次旋转，之后每 6–9 s 再旋转。`writing` 铅笔形变显示时禁止该自动旋转 |
| `happy` | 进入约 120 ms 后固定触发一次 `hop`，依次完成三次逐渐减弱的弹跳 |
| `playful` | 进入约 120 ms 后触发一次旋转，普通旋转和眩晕旋转各占 50% |
| `proud` | 进入约 120 ms 后固定触发一次 `spinBounce`，旋转一圈并短暂停稳后复用 `hop` |
| `excited` | 进入后 0.4–1.1 s 可首次旋转，之后每 2.8–5 s 再旋转 |
| `angry` | 进入后 0.5–1.2 s 首次震动，之后每 1.8–3.2 s 再震动 |
| `suspicious` | 进入后 0.5–1.2 s 首次倾斜冲量，之后每 4–7 s 再触发 |
| `confused` | 进入后 0.5–1.2 s 首次倾斜冲量，之后每 2.6–4.2 s 再触发 |
| `bored` | 进入后 0.5–1.2 s 首次点动，之后每 4–7 s 再触发 |
| `notifying` | 进入约 120 ms 后触发一次上跳冲量和眨眼 |
| `dragging` | 身体动作以 3.4 s 为周期循环 |
| `celebrate` | 进入约 140 ms 后启动狂野旋转。如果场景持续足够久，每 6.2 s 再启动一次 |

`waking` 在进入 0.5–1.2 s 区间时还会触发一次 9–13 个粒子的爆发。

### 9.3 帧内动作的拟人化作用

帧内动作负责维持角色的生命感。它们不改变当前故事，却会改变角色“如何待在故事里”。

- 呼吸、轻微漂移和重心变化表示角色即使没有新任务，也在持续感受环境。
- 眼形轮换像思绪在脸上的细小泄漏。搜索时轮换更快，空闲和睡眠时保持更久。
- 眨眼打断绝对静止，使注视更像真实注意力，而不是固定图标。
- 自动单眼眨眼给 `happy`、`curious` 和 `playful` 等正向状态加入偶发的默契感。
- 程序化视线让角色拥有自己的关注点。指针跟随则让外部用户暂时成为更强的关注对象。
- 点头、走神、睡眠抽动和偶发旋转是“状态中的小念头”，用于避免持续场景只剩机械循环。

## 10. 动作预设的拟人化词典

本节描述 `showAction()` 可直接预览的 45 个原子动作。原子动作提供角色词汇，前文的活动链和空闲片段则把这些词汇组织成句子和故事。

### 10.1 生命周期

| 动作 | 拟人化描述 |
| --- | --- |
| `sleeping` | 身体沉下来并保持缓慢呼吸，偶尔轻微抽动，表现已经放下警觉的深睡。 |
| `dreaming` | 预览时在闭眼睡眠上加入默认漂浮，表现身体仍在回应看不见的梦境。空闲导演还会为它提供蜷缩和抽动变体。 |
| `waking` | 从闭眼低伏到睁眼抬起，并用一次粒子爆发强调意识重新上线。 |
| `idle` | 平静呼吸、轻微摇摆并偶尔转移重心，表现没有任务但仍保持在场。 |
| `listening` | 身体朝注意方向倾斜并偶尔点头，表现正在接收信息，而不是等待自己发言。 |
| `thinking` | 身体缓慢偏转和游移，视线向侧上方寻找答案，表现思绪在内部来回推演。 |
| `thinking-alt` | 身体丝滑化作略微缩小上移、呼吸变化明显的云朵，为下方多个圆点留出完整路径。圆点接触身体时与局部鼓起的边缘融合，再逐渐进入身体。身体边缘随圆点进入而恢复平滑，并通过整体拉伸和回弹表现吸收反馈。结束时恢复用户配置的身形。 |
| `searching` | 身体和视线快速扫描不同方向，偶尔旋转扩大观察范围，表现主动寻找目标。 |
| `working` | 保持连续、规律的操作节奏，视线偏向工作区域，表现手头任务正在稳定推进。 |

### 10.2 情绪和反应

| 动作 | 拟人化描述 |
| --- | --- |
| `excited` | 身体持续弹起并快速转动，像好消息带来的能量已经藏不住。 |
| `surprised` | 身体瞬间后缩、抬起并睁大眼睛，随后逐渐稳定，表现一般性的意外。 |
| `startled` | 根据触碰方向先躲开再回弹，眼睛保持警觉，表现突发近距离接触造成的惊吓。 |
| `suspicious` | 压低眼睑并谨慎侧移，偶尔突然倾斜，像在判断某件事是否可信。 |
| `angry` | 身体压低并反复短促震动，表现受阻后的不耐烦和对抗感。 |
| `drowsy` | 身体逐渐下沉、眼睑变重，偶尔猛然惊醒再恢复，表现正在输给睡意。 |
| `happy` | 进入时完成一组逐渐减弱的上下弹跳，随后保持轻快弹动，眼睛放大并维持开放视线，表现稳定而温和的开心。 |
| `winking` | 保持单眼表情，像向用户传递一句不必说出口的“你懂的”。 |
| `curious` | 歪头、靠近并频繁调整视线，像正在从多个角度理解新事物。 |
| `confused` | 身体左右摇摆，视线无法稳定落点，表现已有线索彼此冲突。 |
| `quizzical` | 身体和两只眼睛形成不对称倾斜，并正面看向用户，表现带有明确对象的疑问。 |
| `bored` | 身体松垮下沉，眼睑降低并偶尔无精打采地点动，表现注意力正在流失。 |
| `proud` | 进入时先旋转一圈再连续弹跳，随后抬高并舒展身体、将视线略微上移，表现对成果的自豪。 |
| `shy` | 身体缩向一侧，眼睛变小并避开正面注视，表现被关注后的不好意思。 |
| `sad` | 身体整体下沉，动作幅度减小，视线朝下，表现能量和期待同时降低。 |
| `laughing` | 身体快速起伏和摇动，像笑声让整个身体都无法保持安静。 |
| `scared` | 身体持续细小颤动，眼睛放大并快速观察周围，表现威胁仍未解除。 |
| `playful` | 身体轻跳、摇摆，并在进入时执行普通旋转或眩晕旋转，表现正在主动邀请下一次互动。 |
| `celebrate` | 用夸张旋转和高能动作释放情绪，表现值得认真庆祝的重大成功。 |

### 10.3 Agent 形变

| 动作 | 拟人化描述 |
| --- | --- |
| `orbit` | 让信息围绕身体运行，像把多个外部观点暂时放进自己的思考轨道。 |
| `radar` | 展开扫描式形变和搜索视线，像主动向环境发出探测并等待回波。 |

### 10.4 交互

| 动作 | 拟人化描述 |
| --- | --- |
| `stretching` | 从压低身体开始，缓慢伸展到最开，再眨眼放松，像一次认真完成的伸懒腰。 |
| `front` | 身体向用户倾斜并轻微点头，专用正面眼形按当前身形的脸部参数居中，同时收起自主扫视，表达“现在你是我的注意中心”。 |

### 10.5 产品生命周期和工具隐喻

| 动作 | 拟人化描述 |
| --- | --- |
| `spawning` | 身体从聚集效果中出现，像角色从散落能量里拼回自己并来到桌面。 |
| `humming` | 身边浮现哼唱圆点和宽粒子带，身体轻轻摆动，像用无意识的小调陪伴思考。 |
| `loading` | 旋转结构和粒子带持续运转，像角色正在耐心推动一个尚未完成的过程。 |
| `dictating` | 波形随表达展开，像角色把内部组织好的语言转成正在流出的声音。 |
| `writing` | 铅笔形变把抽象计算变成埋头书写，表现成果正在被一笔一笔构造。 |
| `sending` | 发送形变把内容推离身体，像把完成的消息亲手递向用户。 |
| `receiving` | 接收形变朝身体汇入，像角色张开注意力接住远处到来的信息。 |
| `uploading` | 对接式形变承接向外传输，像把整理好的成果放上离站的平台。 |
| `notifying` | 通知徽标弹出，身体轻跳并眨眼，像轻轻敲一下用户的肩膀。 |
| `alerting` | 夸张提示形变迅速展开，像突然举起醒目标牌说“这里需要你”。 |
| `dragging` | 身体以周期动作适应被移动的位置，像被用户抱起时努力保持平衡。 |
| `bouncing` | 球形隐喻把身体变成富有弹性的玩具，强调回弹、轻盈和游戏感。 |
| `powering-down` | 待机形变和闭合表情逐步收起活力，像角色在说“我先休息了”。 |

同一个动作可以承担不同人格含义。例如 `surprised` 用于首次工具错误时是“意外”，用于困倦点头后是“被自己惊醒”，用于任务中止时则是“事件突然断开”。动画链中的前因和后果决定动作最终表达的语义。

## 11. 预览模式

`showAction(name)` 只接受 `renderer/catalog/action-groups.json` 中的 45 个动作名。每轮按以下链播放：

```text
指定 state 3000 ms
  -> 暂停角色动画帧 1000 ms
  -> 重启同一 state
  -> 循环
```

动作按目录分为：

- 生命周期：`sleeping`、`dreaming`、`waking`、`idle`、`listening`、`thinking`、`thinking-alt`、`searching`、`working`
- 反应：`excited`、`surprised`、`startled`、`suspicious`、`angry`、`drowsy`、`happy`、`winking`、`curious`、`confused`、`quizzical`、`bored`、`proud`、`shy`、`sad`、`laughing`、`scared`、`playful`、`celebrate`
- Agent 形变：`orbit`、`radar`
- 交互：`stretching`、`front`
- 产品生命周期：`spawning`、`humming`、`loading`、`dictating`、`writing`、`sending`、`receiving`、`uploading`、`notifying`、`alerting`、`dragging`、`bouncing`、`powering-down`

进入预览后，`update()` 返回 `false`，不会再响应活动或 Cue。再次调用合法的 `showAction()` 可以切换预览动作。

## 12. 暂停、减少动态和销毁

### 页面隐藏

`document.hidden` 会暂停统一调度器。暂停期间：

- 已挂起的定时器不会到期
- 角色动画帧不会执行
- `scheduler.now()` 保持不变
- 活动步骤、空闲深度、冷却、恢复窗口和预览轮次都不计入隐藏时间

页面恢复后从剩余时间继续，不补播隐藏期间的动画。

### 减少动态

系统 `prefers-reduced-motion` 或配置中的 `reduceMotion` 任一为真时启用减少动态。高层场景顺序、步骤时长、惊醒顺序和空闲深度不变。帧运行时会压制旋转、跳跃、扑动等一次性位移，将主要身体变换收敛到静态值，并立即完成部分视觉通道过渡。

### 销毁

销毁顺序会停止切换计时器、指针监听、偏好监听、Cue、空闲、活动、交互、时间线、角色动画帧和统一调度器。销毁后的 `update()`、`showAction()` 和偏好更新不再启动动画。
