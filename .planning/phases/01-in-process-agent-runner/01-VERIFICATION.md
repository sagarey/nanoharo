---
phase: 01-in-process-agent-runner
verified: 2026-03-03T03:22:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
---

# Phase 01: In-Process Agent Runner Verification Report

**Phase Goal:** Replace container-based agent execution with in-process Claude Agent SDK V2 sessions. WhatsApp messages trigger runInProcessAgent() instead of spawning containers. Each group gets an isolated CLAUDE_HOME directory for session files.
**Verified:** 2026-03-03T03:22:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | runInProcessAgent() 可在主进程内用 V2 SDK session 调用 Claude 并返回结果 | VERIFIED | `src/agent-runner.ts` 完整实现，使用 `unstable_v2_createSession` / `unstable_v2_resumeSession`，stream 迭代返回 `AgentOutput` |
| 2 | 新建 session 时 session_id 从 stream 消息中捕获并通过 AgentOutput.newSessionId 返回 | VERIFIED | `agent-runner.ts:128` — `capturedSessionId = msg.session_id`，最终 return 携带 `newSessionId: capturedSessionId` |
| 3 | 恢复 session 时使用已有 session_id | VERIFIED | `agent-runner.ts:111-113` — `input.sessionId ? unstable_v2_resumeSession(...) : unstable_v2_createSession(...)` |
| 4 | 每个 group 的 cwd 按规则设置（main = project root, 其他 = groups/{name}/） | VERIFIED | `agent-runner.ts:83-85` — `input.isMain ? process.cwd() : path.resolve(GROUPS_DIR, group.folder)` |
| 5 | session 文件存储路径为 data/sessions/{group.folder}（通过 CLAUDE_HOME env 隔离） | VERIFIED | `agent-runner.ts:90,104` — `sessionStorePath = path.resolve(DATA_DIR, 'sessions', group.folder)`，`env.CLAUDE_HOME: sessionStorePath` |
| 6 | GroupQueue 用 SDKSession 替代 ChildProcess 作为活跃 agent 句柄 | VERIFIED | `group-queue.ts:21` — `session: SDKSession \| null`，无 ChildProcess 或 containerName 字段 |
| 7 | sendMessage() 将 follow-up 文本追加到内存队列（pendingFollowUps） | VERIFIED | `group-queue.ts:150` — `state.pendingFollowUps.push(text)`，无任何 fs 写入 |
| 8 | closeStdin() 改为调用 session.close() | VERIFIED | `group-queue.ts:160` — `state.session.close()` |
| 9 | registerSession() 替代 registerProcess()，接受 SDKSession 参数 | VERIFIED | `group-queue.ts:124-128` — `registerSession(groupJid, session, groupFolder?)` 存在，无 registerProcess |
| 10 | ipc.ts 中 startIpcWatcher 不再扫描 input/ 子目录 | VERIFIED | `ipc.ts` 只处理 `messages/` 和 `tasks/`，input/ 仅在注释中提及，无扫描代码 |
| 11 | WhatsApp 消息触发后，runInProcessAgent() 在主进程内被调用并通过 WhatsApp 回复 | VERIFIED | `index.ts:288-300` — `runInProcessAgent(group, {...}, (session) => queue.registerSession(...), wrappedOnOutput)` |
| 12 | task-scheduler.ts 中的 runTask() 改为调用 runInProcessAgent()，onSession 回调存入 GroupQueue | VERIFIED | `task-scheduler.ts:114-138` — `runInProcessAgent(...)` 调用，`(session) => deps.onSession(...)` 正确传递 |
| 13 | ensureContainerSystemRunning() 调用从 main() 中移除，container-runtime import 删除 | VERIFIED | `index.ts` 无 `ensureContainerRuntimeRunning`、`cleanupOrphans` import，无 `ensureContainerSystemRunning` 调用 |

**Score:** 13/13 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/agent-runner.ts` | runInProcessAgent() — 主进程内 SDK session 调用核心 | VERIFIED | 191 行，导出 `runInProcessAgent`, `AgentInput`, `AgentOutput`, `SDKSession` |
| `src/group-queue.ts` | GroupQueue 改造：SDKSession 句柄 + 内存 follow-up 队列 | VERIFIED | 327 行，`registerSession`, `sendMessage`（内存队列），`closeStdin`（session.close），`shutdown`（session 关闭） |
| `src/ipc.ts` | IPC watcher：仅处理 messages/ 和 tasks/，input/ 逻辑无残留 | VERIFIED | 仅扫描 `messagesDir`/`tasksDir`，注释确认 RUNNER-04 完成 |
| `src/index.ts` | 主进程编排：runAgent 改为调用 runInProcessAgent | VERIFIED | `runAgent()` 直接调用 `runInProcessAgent`，`queue.registerSession` 作为 onSession 回调 |
| `src/task-scheduler.ts` | 调度器：runContainerAgent 调用改为 runInProcessAgent | VERIFIED | `SchedulerDependencies.onSession` 字段，`runInProcessAgent` 调用，`scheduleClose`/`closeTimer` 已删除 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/agent-runner.ts` | `@anthropic-ai/claude-agent-sdk` | `unstable_v2_createSession` / `unstable_v2_resumeSession` | WIRED | `agent-runner.ts:14-15` 导入，`agent-runner.ts:112-113` 使用 |
| `src/agent-runner.ts` | `data/sessions/{group.folder}` | `env.CLAUDE_HOME` | WIRED | `agent-runner.ts:90` 构建路径，`agent-runner.ts:104` 注入 env |
| `src/group-queue.ts sendMessage` | `GroupState.pendingFollowUps` | `push(text)` | WIRED | `group-queue.ts:150` — `state.pendingFollowUps.push(text)` |
| `src/group-queue.ts` | `@anthropic-ai/claude-agent-sdk` | `SDKSession type import` | WIRED | `group-queue.ts:1` — `import type { SDKSession }` |
| `src/index.ts runAgent()` | `src/agent-runner.ts runInProcessAgent()` | 直接函数调用 | WIRED | `index.ts:12` import，`index.ts:288` 调用 |
| `src/index.ts` | `GroupQueue.registerSession()` | `onSession` 回调 | WIRED | `index.ts:298` 和 `index.ts:476` |
| `src/task-scheduler.ts` | `src/agent-runner.ts runInProcessAgent()` | 直接函数调用 | WIRED | `task-scheduler.ts:11` import，`task-scheduler.ts:114` 调用 |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| RUNNER-01 | 01-01, 01-03 | 用 SDK query() 直接在主进程内替代 runContainerAgent() | SATISFIED | `runInProcessAgent()` 完整实现并接入 index.ts + task-scheduler.ts |
| RUNNER-04 | 01-02, 01-03 | IPC follow-up 消息机制改为进程内直接传递，去掉文件轮询 | SATISFIED | `GroupQueue.sendMessage` 改为 `pendingFollowUps.push(text)`；ipc.ts 无 input/ 扫描 |
| GROUP-01 | 01-01 | agent cwd 设为 groups/{name}/，实现目录级 group 隔离 | SATISFIED | `agent-runner.ts:83-85` — main 用 `process.cwd()`，其他用 `path.resolve(GROUPS_DIR, group.folder)` |
| GROUP-02 | 01-01 | session 存储路径沿用 data/sessions/{group}/ | SATISFIED | `agent-runner.ts:90,104` — `CLAUDE_HOME = data/sessions/{folder}` |

所有 Phase 1 需求（RUNNER-01, RUNNER-04, GROUP-01, GROUP-02）均已满足。

Phase 2 需求（RUNNER-02, RUNNER-03）和 Phase 3 需求（DEPLOY-01）按计划暂缓，不在本 Phase 验证范围内。

---

### Anti-Patterns Found

无。对所有修改文件（`src/agent-runner.ts`、`src/group-queue.ts`、`src/index.ts`、`src/task-scheduler.ts`、`src/ipc.ts`）扫描结果：

- 无 TODO/FIXME/PLACEHOLDER 注释（RUNNER-04 完成标注除外，为正常说明性注释）
- 无空实现（`return null`/`return {}`/`return []`）
- 无仅含 console.log 的处理函数
- 无文件写入残留于 group-queue.ts
- 无 ChildProcess/containerName/registerProcess/onProcess/runContainerAgent 残留于主文件

**注意（非阻塞）：** `writeGroupsSnapshot` 和 `writeTasksSnapshot` 仍在 `index.ts` 和 `task-scheduler.ts` 中通过 `container-runner.ts` 调用，且 `getAvailableGroups()` 返回类型仍引用 `container-runner.js` 的 `AvailableGroup`。这是计划内的技术债（Phase 2 才删除容器层），不影响 Phase 1 目标达成。

---

### Human Verification Required

无自动化无法覆盖的项目。所有关键路径均可通过静态代码分析验证。

端到端 WhatsApp 消息流（消息入 → SDK 调用 → 回复出）需要真实环境（WhatsApp 连接 + Anthropic API），但这属于集成测试范畴，不是本 Phase 的验证标准。

---

### Build & Test Status

- `npm run build` — EXIT 0，无 TypeScript 错误
- `npm test` — 29 个测试文件，332 个测试，全部通过

---

### Commits Verified

| Commit | Task | Change |
|--------|------|--------|
| `7d45e6a` | 01-01 Task 1 | 新建 src/agent-runner.ts，安装 SDK |
| `270cc19` | 01-02 Task 1 | GroupQueue SDKSession 改造，测试迁移 |
| `0665f67` | 01-02 Task 2 | ipc.ts RUNNER-04 确认注释 |
| `6bc8e3c` | 01-03 Task 1 | index.ts 切换 runInProcessAgent |
| `f873a9f` | 01-03 Task 2 | task-scheduler.ts 切换 runInProcessAgent |
| `a182f6e` | 01-03 Task 3 | 测试更新，构建验证 |

所有 6 个预期提交均存在于 git 历史中。

---

_Verified: 2026-03-03T03:22:00Z_
_Verifier: Claude (gsd-verifier)_
