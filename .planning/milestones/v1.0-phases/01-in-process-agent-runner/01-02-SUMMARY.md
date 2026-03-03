---
phase: 01-in-process-agent-runner
plan: 02
subsystem: agent-runner
tags: [SDKSession, GroupQueue, IPC, follow-up, session-lifecycle]

requires:
  - phase: 01-in-process-agent-runner/01-01
    provides: SDKSession type + runInProcessAgent() 函数，Group 隔离机制

provides:
  - GroupQueue 改造：SDKSession 句柄替代 ChildProcess，内存 follow-up 队列
  - sendMessage() 内存队列追加（删除 IPC 文件写入）
  - registerSession() API 供 index.ts 调用
  - closeStdin() 改为 session.close()
  - ipc.ts 确认无 input/ 残留，RUNNER-04 完成

affects:
  - 01-03（index.ts 集成，调用 registerSession + 消费 pendingFollowUps）
  - 02（删除 container-runner.ts，清理 ipc.ts 中的 writeGroupsSnapshot）

tech-stack:
  added: []
  patterns:
    - "GroupQueue 持有 SDKSession 句柄，不再持有 ChildProcess"
    - "follow-up 消息通过 pendingFollowUps[] 内存队列传递给 processMessagesFn 消费"
    - "session.close() 作为终止信号，替代 _close sentinel 文件"

key-files:
  created: []
  modified:
    - src/group-queue.ts
    - src/group-queue.test.ts
    - src/ipc.ts
    - src/index.ts

key-decisions:
  - "sendMessage() 改为内存队列追加而非文件写入——follow-up 由 processMessagesFn 在下轮调用时消费 pendingFollowUps"
  - "index.ts 中旧 registerProcess 调用改为 no-op（两处），容器路径整体在 Phase 2 删除"
  - "ipc.ts 无需修改——从未扫描 input/ 目录，RUNNER-04 的 input/ 写入侧已由 GroupQueue 改造完成"
  - "测试全面迁移：删除 fs mock，改为 SDKSession mock 验证 close() 调用语义"

patterns-established:
  - "GroupState.pendingFollowUps: string[] 作为 in-process follow-up 传递机制"
  - "registerSession(jid, session, groupFolder?) 为外部调用者提供的 session 注册 API"

requirements-completed:
  - RUNNER-04

duration: 3min
completed: 2026-03-02
---

# Phase 1 Plan 2: GroupQueue SDKSession 改造 Summary

**GroupQueue 内部从 ChildProcess 模型切换到 SDKSession 句柄，sendMessage() 改为 pendingFollowUps 内存队列，closeStdin() 改为 session.close()，消除所有 IPC 文件写入路径**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-02T19:06:55Z
- **Completed:** 2026-03-02T19:10:22Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- GroupState 接口：`process: ChildProcess | null` + `containerName` → `session: SDKSession | null` + `pendingFollowUps: string[]`
- `registerSession(jid, session, groupFolder?)` 替代 `registerProcess()`，接口更简洁
- `sendMessage()` 改为内存队列追加，彻底删除 `fs.mkdirSync`/`fs.writeFileSync`/`fs.renameSync` 文件操作
- `closeStdin()` 改为 `state.session.close()`，删除 `_close` sentinel 文件写入
- `shutdown()` 遍历所有 session 调用 `close()`，删除容器检测逻辑
- 测试全面更新：移除 `fs` mock，改为 `makeSession()` 模拟 SDKSession，验证 `close()` 调用语义
- 确认 `ipc.ts` 无 `input/` 残留，RUNNER-04 迁移完成

## Task Commits

1. **Task 1: 改造 src/group-queue.ts（SDKSession 替换 ChildProcess）** - `270cc19` (refactor)
2. **Task 2: 清理 src/ipc.ts 中的 input/ 目录残留** - `0665f67` (chore)

## Files Created/Modified

- `src/group-queue.ts` - GroupState 接口 + 所有方法改造（ChildProcess → SDKSession，文件写入 → 内存队列）
- `src/group-queue.test.ts` - 测试全面迁移（fs mock 移除，SDKSession mock 验证 close() 语义，新增 pendingFollowUps 和 shutdown 测试）
- `src/ipc.ts` - 添加 RUNNER-04 完成状态注释，确认无 input/ 残留
- `src/index.ts` - 两处 `queue.registerProcess(...)` 调用改为 no-op（容器路径 Phase 2 删除时一并清理）

## Decisions Made

- `sendMessage()` 中删除了原来检查 `!state.groupFolder` 的条件——内存队列不需要 groupFolder，消除了对文件系统路径的依赖
- index.ts 的两处 `registerProcess` 改为注释 no-op 而非删除调用点，原因是 `runContainerAgent` 的回调签名是 `(proc, containerName)`，Phase 2 才整体删除容器路径，此时最小化改动避免过度修改

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 修复测试文件和 index.ts 中的 registerProcess 引用**
- **Found during:** Task 1 验证（tsc 类型检查）
- **Issue:** tsc 报告 `group-queue.test.ts` 5 处 + `index.ts` 2 处 `registerProcess` 不存在，编译失败
- **Fix:** 测试文件：将所有 `registerProcess` 调用替换为 `registerSession`，移除 `fs` mock，改为 `SDKSession` mock；index.ts：将两处 `registerProcess` 回调改为 no-op
- **Files modified:** src/group-queue.test.ts, src/index.ts
- **Verification:** `npx tsc --noEmit` 返回 EXIT 0
- **Committed in:** 270cc19 (Task 1 commit，一并提交)

---

**Total deviations:** 1 auto-fixed (blocking — 编译错误)
**Impact on plan:** 必要修复，编译通过是 Task 1 done criteria。测试更新同步反映新 API 语义，无范围蔓延。

## Issues Encountered

无。tsc 报错在第一次 Task 1 验证时发现，Rule 3 自动修复，单轮解决。

## Next Phase Readiness

- GroupQueue SDKSession API 就绪：`registerSession()`、`sendMessage()`（内存队列）、`closeStdin()`（session.close）
- Plan 01-03 可继续：在 index.ts 的 `processMessagesFn` 中集成 `runInProcessAgent()`，调用 `registerSession()` 注册 session，在 agent 结束后消费 `pendingFollowUps`

---
*Phase: 01-in-process-agent-runner*
*Completed: 2026-03-02*

## Self-Check: PASSED

- src/group-queue.ts: FOUND
- src/ipc.ts: FOUND
- 01-02-SUMMARY.md: FOUND
- Commit 270cc19 (Task 1): FOUND
- Commit 0665f67 (Task 2): FOUND
- npx tsc --noEmit: EXIT 0
