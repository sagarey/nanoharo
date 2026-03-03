# Phase 1: In-process Agent Runner - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

用 Claude Agent SDK `query()` 替代容器调用，让消息从 WhatsApp 进来到 Claude 回复出去全程在主进程内完成，不经过任何容器或子进程。具体包括：
1. 新的 in-process runner 替代 `container-runner.ts`
2. follow-up 消息改为进程内传递（不再写文件）
3. group 隔离改为目录级 cwd

容器层代码删除属于 Phase 2，Docker 打包属于 Phase 3。

</domain>

<decisions>
## Implementation Decisions

### SDK API 版本
- 使用 **V2**：`unstable_v2_createSession()` / `unstable_v2_resumeSession()`
- 每个 group 的活跃 agent 以 session 对象表示（替代现有的 `ChildProcess`）
- `session.send()` 发送消息，`session.stream()` 流式接收输出

### Streaming 输出
- 使用 streaming 模式：`for await (const message of session.stream())`
- 现有 `onOutput` callback 模式保留，适配 V2 stream 消息类型
- 从 stream 消息中提取 `session_id` 存入 SQLite（与现有逻辑一致）

### Follow-up 消息传递
- **等待当前 turn 完成再 send**：agent 处理中的消息暂存队列，`stream()` 结束后用同一 session `send()` 发送
- 不再需要 `data/ipc/{group}/input/` 文件写入
- `GroupQueue.sendMessage()` 改为向进程内队列追加，而非写文件
- `GroupQueue.notifyIdle()` 触发下一条队列消息的 send

### Group cwd 隔离
- **main group**：`cwd` = 项目根目录（与容器模式一致，可读写项目文件）
- **其他 group**：`cwd` = `groups/{name}/`
- SDK `cwd` 选项直接设置，无需额外 mount 配置
- `.claude/skills/` 从各自 cwd 加载（SDK 原生支持）

### Session 管理
- `sessions` 表继续使用：存储 `group.folder → session_id` 的映射
- 新会话：`unstable_v2_createSession()`，从 stream 捕获 session_id 存库
- 恢复会话：`unstable_v2_resumeSession(session_id)`
- `GroupQueue` 中 `process: ChildProcess | null` 替换为 `session: Session | null`

### 错误恢复
- **全部保留**现有逻辑：
  - cursor rollback（失败且未输出时回滚消息游标）
  - GroupQueue 指数退避 retry（最多 5 次，BASE 5s）
  - 已有输出则不 rollback 以避免重复发送
- SDK 调用失败与容器启动失败等价对待

### Claude's Discretion
- V2 session 的 `cwd`、`model`、`allowedTools` 等具体参数
- `GroupQueue` 中 session 生命周期管理的实现细节（何时 `session.close()`）
- 进程内消息队列的数据结构选择

</decisions>

<specifics>
## Specific Ideas

- "你看文档" — 明确要求基于 SDK 官方 API 实现，不要自己发明 IPC 机制
- follow-up 传递要干净，V2 的 `session.send()` 就是为此而生

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GroupQueue`（`src/group-queue.ts`）：并发管理、队列、retry 逻辑全部保留，只替换内部的 `ChildProcess` 引用和 `sendMessage()` / `closeStdin()` 实现
- `processGroupMessages`（`src/index.ts`）：cursor 管理、onOutput callback、idle timer 逻辑可直接复用，只替换 `runAgent()` 内部的 `runContainerAgent()` 调用
- `ContainerInput` / `ContainerOutput` 接口：可改名或重新定义，关键字段（`prompt`、`sessionId`、`groupFolder`、`isMain`）仍需传递
- `sessions` SQLite 表 + `setSession()` / `getAllSessions()`：直接复用

### Established Patterns
- 流式输出：现有 sentinel marker 解析逻辑废弃，改为直接迭代 SDK stream
- Pino 结构化日志：`logger.info({ group: group.name, ... }, 'msg')` 模式保留
- 错误处理：try-catch + `return 'error'` + rollback 模式保留

### Integration Points
- `runAgent()`（`src/index.ts:247`）：核心替换点，将 `runContainerAgent()` 替换为 SDK session 调用
- `GroupQueue.registerProcess()` → 改为 `registerSession()`，参数从 `ChildProcess` 改为 SDK session 对象
- `GroupQueue.sendMessage()` / `closeStdin()`：行为改变，但接口签名可保持兼容
- `src/ipc.ts` 的 `startIpcWatcher()`：follow-up 消息路径（`input/` 目录）不再需要，但 `messages/` 和 `tasks/` IPC 目录仍保留用于 agent → 主进程通信

</code_context>

<deferred>
## Deferred Ideas

- 无 — 讨论完全在 Phase 1 边界内

</deferred>

---

*Phase: 01-in-process-agent-runner*
*Context gathered: 2026-03-03*
