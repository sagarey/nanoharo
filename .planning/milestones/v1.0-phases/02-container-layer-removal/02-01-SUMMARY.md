---
phase: 02-container-layer-removal
plan: 01
subsystem: infra
tags: [cleanup, refactor, agent-runner, container, ipc, snapshot]

# Dependency graph
requires:
  - phase: 01-in-process-agent-runner
    provides: runInProcessAgent、agent-runner.ts SDK session runner（Phase 1 建立的进程内运行层）
provides:
  - AvailableGroup 接口、writeGroupsSnapshot、writeTasksSnapshot 迁移至 agent-runner.ts 统一导出
  - 所有 container-runner.js / container-runtime.js / mount-security.js 引用从代码库中清除
  - container/ 目录（Dockerfile、agent-runner/、skills/）完整删除
  - config.ts 孤立容器常量（MOUNT_ALLOWLIST_PATH、CONTAINER_IMAGE、CONTAINER_TIMEOUT、CONTAINER_MAX_OUTPUT_SIZE）删除
affects: [phase-03-deployment, any-future-agent-tooling]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "snapshot helpers（writeTasksSnapshot/writeGroupsSnapshot）与 agent runner 同住一个模块，降低跨文件依赖"
    - "config.ts 只保留运行时实际使用的常量，孤立常量即删即止"

key-files:
  created: []
  modified:
    - src/agent-runner.ts
    - src/index.ts
    - src/ipc.ts
    - src/task-scheduler.ts
    - src/config.ts
  deleted:
    - src/container-runner.ts
    - src/container-runtime.ts
    - src/mount-security.ts
    - src/container-runner.test.ts
    - src/container-runtime.test.ts
    - container/ (整个目录)

key-decisions:
  - "snapshot helpers 追加到 agent-runner.ts 末尾，不新建文件——保持模块数量最小化"
  - "writeGroupsSnapshot 参数名 registeredJids 改为 _registeredJids（实现中未使用，显式标记）"
  - "container/ 目录全量删除，不迁移任何内容——Phase 3 按需重建 Dockerfile"
  - "os 导入随 HOME_DIR/MOUNT_ALLOWLIST_PATH 一并从 config.ts 删除（Rule 1 auto-fix）"

patterns-established:
  - "迁移顺序：先追加到目标文件、修复 import 路径，再删除源文件——避免中间态编译失败"

requirements-completed:
  - RUNNER-02
  - RUNNER-03

# Metrics
duration: 3min
completed: 2026-03-03
---

# Phase 2 Plan 01: Container Layer Removal Summary

**Docker/容器运行时残留完整清除：5 个 src 文件 + container/ 目录删除，3 个 survivor 符号迁移到 agent-runner.ts，321 个测试全部通过**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-03T02:41:17Z
- **Completed:** 2026-03-03T02:44:30Z
- **Tasks:** 2
- **Files modified:** 5 modified, 5 + container/ deleted

## Accomplishments

- 将 AvailableGroup、writeTasksSnapshot、writeGroupsSnapshot 从 container-runner.ts 迁移到 agent-runner.ts，实现单点导出
- 修复 index.ts（含 inline dynamic import 返回类型）、ipc.ts、task-scheduler.ts 的 import 路径
- 删除 5 个 src 文件及整个 container/ 目录，代码库中不再有 Docker/容器运行时痕迹
- 清理 config.ts 中 4 个孤立容器常量（及 os 导入），保留 MAX_CONCURRENT_CONTAINERS
- npm run build 零错误，npm test 321 个测试全部通过

## Task Commits

每个任务原子提交：

1. **Task 1: 迁移 survivor 符号，修复 import 路径，删除 src 容器文件** - `f1e6b23` (feat)
2. **Task 2: 删除 container/ 目录，清理 config.ts 孤立常量** - `0927df4` (chore)

## Files Created/Modified

- `src/agent-runner.ts` - 新增 fs/resolveGroupIpcPath 导入；追加 AvailableGroup 接口、writeTasksSnapshot、writeGroupsSnapshot
- `src/index.ts` - import 路径从 container-runner.js 改为 agent-runner.js（含 inline dynamic import 类型注解）
- `src/ipc.ts` - AvailableGroup import 路径从 container-runner.js 改为 agent-runner.js
- `src/task-scheduler.ts` - writeTasksSnapshot import 路径从 container-runner.js 改为 agent-runner.js
- `src/config.ts` - 删除 4 个孤立常量和 os 导入；更新顶部注释
- `src/container-runner.ts` - 已删除
- `src/container-runtime.ts` - 已删除
- `src/mount-security.ts` - 已删除
- `src/container-runner.test.ts` - 已删除
- `src/container-runtime.test.ts` - 已删除
- `container/` - 整个目录已删除

## Decisions Made

- snapshot helpers 追加到 agent-runner.ts 末尾而不新建文件，保持模块数量最小化
- container/ 目录全量删除，不迁移任何内容；Phase 3 按需重建 Dockerfile
- writeGroupsSnapshot 参数名 registeredJids 改为 _registeredJids（实现中未使用，显式标记避免 TS warning）

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 同步删除 config.ts 中的 os import**
- **Found during:** Task 2（清理孤立常量时）
- **Issue:** 删除 MOUNT_ALLOWLIST_PATH 后 HOME_DIR 变量也一并消失，os 导入成为孤立 import，TypeScript 会报 unused import
- **Fix:** 同步删除 `import os from 'os'`，并将注释 "Absolute paths needed for container mounts" 更新为 "Absolute paths needed for agent runner"
- **Files modified:** src/config.ts
- **Verification:** npm run build 零错误
- **Committed in:** 0927df4 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug fix, unused import cleanup)
**Impact on plan:** 必要的附带清理，无范围蔓延。

## Issues Encountered

无——计划执行顺利，迁移顺序（先追加符号、修复引用、再删除源文件）完全规避了中间态编译失败风险。

## User Setup Required

无——不需要任何外部服务配置。

## Next Phase Readiness

- 代码库中容器层残留完全清除，Phase 2 目标达成
- Phase 3（部署/Dockerfile）可按需从零重建容器配置，不受旧文件干扰
- src/agent-runner.ts 现在是唯一的 agent 运行层入口，依赖关系清晰

---
*Phase: 02-container-layer-removal*
*Completed: 2026-03-03*
