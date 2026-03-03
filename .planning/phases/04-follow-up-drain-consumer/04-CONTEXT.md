# Phase 4: Follow-up Drain Consumer - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

实现 `pendingFollowUps` drain 消费者，让 agent **活跃期间**收到的追加消息在当前 turn 结束后通过 SDK `session.send()` 真正送达 Claude。不再被静默丢弃。

具体范围：
1. 在 `runForGroup()` 内部（`processMessagesFn` 完成之后、`finally` 之前）加入 drain 循环
2. 循环消费 `state.pendingFollowUps[]`，通过同一 session 逐轮 `send()` + `stream()` 到完成
3. 确认 `GroupQueue.sendMessage()` 写入侧（已实现）与消费侧的完整链路打通

不在本阶段：全新的 follow-up 架构、IPC 变更、session 管理变更。

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

用户跳过了全部问题，将所有实现细节授权给 Claude 决定。以下是基于代码库分析的合理默认策略，供规划器直接采用：

- **drain 循环位置**：在 `runForGroup()` 的 `try` 块末尾（`processMessagesFn` await 之后），用 while 循环消费 `state.pendingFollowUps`，在 `finally` 清理之前执行。此时 `state.session` 仍然有效，无需重建。

- **多条消息合并策略**：将 `pendingFollowUps.splice(0)` 取出全部待发消息，join 拼接为一条字符串发送（与 `formatMessages()` 风格一致）。减少 API round-trip，且现有 `processGroupMessages` 已有此先例。

- **drain 内的 onOutput 处理**：复用 `processMessagesFn` 传递的 `onOutput` 或通过新的回调参数传入，确保 follow-up 的 assistant 输出也能发送给用户（setTyping、sendMessage）。最小改动方案：将 drain 逻辑封装为 `runForGroup` 可调用的辅助函数，接收与 `processMessagesFn` 相同的上下文。

- **drain 后的新消息**：drain 完成后不改变 `pendingMessages` 标志，走现有 `drainGroup()` 流程处理后续消息——现有逻辑已正确处理，无需新增代码。

- **错误处理**：drain 循环中 SDK 出错时，记录 error 日志，停止循环（不继续消费剩余 follow-ups），已消费部分不回滚（与现有 `outputSentToUser` 逻辑一致）。

- **空队列处理**：`pendingFollowUps.length === 0` 时直接跳过循环，零开销。

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets

- `GroupQueue.sendMessage()`（`src/group-queue.ts:150`）：写入侧已完成，push 到 `state.pendingFollowUps[]`
- `GroupQueue.runForGroup()`（`src/group-queue.ts:167`）：drain 消费逻辑的插入点，在 `processMessagesFn` await 之后
- `runInProcessAgent()`（`src/agent-runner.ts:70`）：提供 `session.send()` + `session.stream()` 的完整调用模式，可直接复用

### Established Patterns

- `session.send()` + `for await (msg of session.stream())` 模式：`src/agent-runner.ts:122-175`，drain 循环直接沿用
- 结构化日志：`logger.debug/info/error({ groupJid, ... }, 'msg')` 模式
- `pendingFollowUps.splice(0)` 取出并清空：避免与并发 `sendMessage()` 竞争

### Integration Points

- `runForGroup()` → 在 `processMessagesFn` 返回后、`finally` 执行前插入 drain while 循环
- `state.session`：此时 session 仍然有效（`finally` 块才清空），直接调用
- `processGroupMessages()` 中的 `onOutput` callback：drain 循环也需要将输出路由给用户——需确认回调如何传递到 drain 层

</code_context>

<specifics>
## Specific Ideas

- RUNNER-04 要求明确：follow-up 通过 `session.send()` 或等效的 multi-turn API 送达，不再被静默丢弃
- 现有 `group-queue.test.ts:404` 已测试 `sendMessage` 写入侧；drain 消费侧需要新增测试

</specifics>

<deferred>
## Deferred Ideas

None — 讨论在 Phase 4 边界内

</deferred>

---

*Phase: 04-follow-up-drain-consumer*
*Context gathered: 2026-03-03*
