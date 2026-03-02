---
phase: 01-in-process-agent-runner
plan: 03
subsystem: api
tags: [agent-runner, whatsapp, task-scheduler, sdk-session, in-process]

# Dependency graph
requires:
  - phase: 01-in-process-agent-runner/01-01
    provides: runInProcessAgent() 函数和 AgentOutput 接口
  - phase: 01-in-process-agent-runner/01-02
    provides: GroupQueue.registerSession() 替代 registerProcess()
provides:
  - index.ts 完全接入 runInProcessAgent()，容器调用链路删除
  - task-scheduler.ts 完全接入 runInProcessAgent()，调度器使用 SDK session
  - WhatsApp 消息路径端到端接通：消息 → processGroupMessages → runAgent → runInProcessAgent → SDK → 回复
  - ensureContainerSystemRunning() 从 main() 中移除（container-runtime 不再在启动时调用）
affects: [02-remove-container-layer, 03-deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "runInProcessAgent 替代 runContainerAgent，消除 Docker IPC 层"
    - "onSession 回调替代 onProcess 回调，传递 SDKSession 而非 ChildProcess"
    - "SDKSession.stream() 自然结束替代定时器 scheduleClose()"

key-files:
  created: []
  modified:
    - src/index.ts
    - src/task-scheduler.ts
    - src/task-scheduler.test.ts

key-decisions:
  - "index.ts 和 task-scheduler.ts 同时改造，两个文件互相依赖（SchedulerDependencies 接口），需要同时通过编译"
  - "scheduleClose/closeTimer 逻辑删除：V2 session.stream() 在 turn 结束后自然返回，不需要定时器强制关闭"
  - "writeGroupsSnapshot/writeTasksSnapshot 保留（Phase 2 才删除），此次只删除 runContainerAgent 和 container-runtime 调用"

patterns-established:
  - "onSession 回调模式：runInProcessAgent 创建 session 后立即调用 onSession，让 GroupQueue 存储 session 句柄以支持 follow-up 消息"
  - "SchedulerDependencies.onSession 签名：(groupJid, session, groupFolder) => void"

requirements-completed: [RUNNER-01, RUNNER-04]

# Metrics
duration: 5min
completed: 2026-03-03
---

# Phase 1 Plan 3: 接入层改造 Summary

**index.ts 和 task-scheduler.ts 切换到 runInProcessAgent()，删除 ensureContainerSystemRunning 和 scheduleClose 定时器逻辑，WhatsApp 消息路径和调度器端到端接通**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-02T19:14:22Z
- **Completed:** 2026-03-02T19:19:00Z
- **Tasks:** 3 (Task 1: index.ts, Task 2: task-scheduler.ts, Task 3: 验证构建测试)
- **Files modified:** 3

## Accomplishments

- index.ts：runAgent() 调用 runInProcessAgent()，onSession 回调调用 queue.registerSession()，删除 ensureContainerSystemRunning() 和 container-runtime 的 import
- task-scheduler.ts：SchedulerDependencies 接口 onProcess(ChildProcess) 改为 onSession(SDKSession)，runTask() 调用 runInProcessAgent()，删除 scheduleClose/closeTimer 定时器逻辑
- 构建和测试全部通过：npm run build 无错误，npm test 332 个测试全部通过

## Task Commits

每个任务原子提交：

1. **Task 1: 改造 src/index.ts** - `6bc8e3c` (feat)
2. **Task 2: 改造 src/task-scheduler.ts** - `f873a9f` (feat)
3. **Task 3: 验证构建和测试** - `a182f6e` (test)

**Plan 元数据：** 见下一个 docs commit

## Files Created/Modified

- `src/index.ts` - runContainerAgent → runInProcessAgent，删除 ensureContainerSystemRunning 和 container-runtime import
- `src/task-scheduler.ts` - SchedulerDependencies.onSession 替代 onProcess，删除 scheduleClose/closeTimer 逻辑
- `src/task-scheduler.test.ts` - 测试 mock 中 onProcess 改为 onSession

## Decisions Made

- scheduleClose/closeTimer 逻辑删除：V2 session.stream() 在 turn 结束后自然返回，无需定时器强制关闭（单轮任务结束即 stream 结束）
- writeGroupsSnapshot/writeTasksSnapshot 调用保留：Phase 2 整体清理容器相关代码，此次只删除 runContainerAgent 和 container-runtime 调用
- Task 1 和 Task 2 分别提交，但 TypeScript 编译验证需要两者同时完成（SchedulerDependencies 接口跨文件依赖）

## Deviations from Plan

None — 计划按原样执行。Task 3 预期的测试更新（onProcess → onSession）如计划所述完成。

## Issues Encountered

None — index.ts 类型检查在 Task 2 完成前会报一个 TS2353 错误（onSession 在旧 SchedulerDependencies 接口中不存在），Task 2 完成后立即消失，符合预期。

## Next Phase Readiness

- Phase 1 全部完成：agent-runner 创建（01-01）、GroupQueue 改造（01-02）、接入层改造（01-03）
- 整个消息路径端到端接通：WhatsApp 消息 → processGroupMessages → runAgent → runInProcessAgent → Claude SDK → 回复
- Phase 2（删除容器层）：可以安全删除 container-runner.ts、container-runtime.ts、writeGroupsSnapshot/writeTasksSnapshot

---
*Phase: 01-in-process-agent-runner*
*Completed: 2026-03-03*
