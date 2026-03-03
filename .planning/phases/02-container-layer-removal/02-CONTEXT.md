# Phase 2: Container Layer Removal - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

删除所有容器相关代码和文件，让代码库中不再有 Docker/容器运行时的残留。具体包括：
1. 删除 `src/container-runner.ts`、`src/container-runtime.ts`、`src/mount-security.ts`
2. 删除 `container/` 目录（Dockerfile、agent-runner、skills、build.sh）
3. 将仍被使用的函数迁移到合适位置，确保 TypeScript 编译通过

Docker 镜像打包（主 Dockerfile）属于 Phase 3，本阶段不涉及。

</domain>

<decisions>
## Implementation Decisions

### 仍被使用的函数归宿
- `writeGroupsSnapshot`、`writeTasksSnapshot`、`AvailableGroup` 迁移到 `src/agent-runner.ts`
- `index.ts`、`ipc.ts`、`task-scheduler.ts` 的 import 路径改为从 `agent-runner.js` 引入
- `ContainerInput`、`ContainerOutput` 接口随 `container-runner.ts` 一起删除（Phase 1 已完成替换，不再被外部使用）

### container/skills/ 处理
- 随 `container/` 目录一起删除，不迁移
- agent-browser skill（`container/skills/agent-browser/SKILL.md`）一并删除
- 浏览器自动化支持在 Phase 3 Dockerfile 中按需重新考虑

### 测试文件
- `src/container-runner.test.ts` 直接删除（测试的是将被删除的代码）
- `src/container-runtime.test.ts` 直接删除（同上）

### Claude's Discretion
- `writeGroupsSnapshot` / `writeTasksSnapshot` 在 `agent-runner.ts` 中的具体插入位置（文件末尾或独立区块）
- 是否需要同步更新这些函数的类型定义

</decisions>

<code_context>
## Existing Code Insights

### 当前 import 关系（需要修改的文件）
- `src/index.ts:16` — `import { writeGroupsSnapshot, writeTasksSnapshot } from './container-runner.js'`
- `src/index.ts:103` — `export function getAvailableGroups(): import('./container-runner.js').AvailableGroup[]`
- `src/ipc.ts:12` — `import { AvailableGroup } from './container-runner.js'`
- `src/task-scheduler.ts:12` — `import { writeTasksSnapshot } from './container-runner.js'`

### 需要删除的文件
- `src/container-runner.ts`（702 行）
- `src/container-runtime.ts`
- `src/mount-security.ts`
- `src/container-runner.test.ts`
- `src/container-runtime.test.ts`
- `container/`（整个目录，含 Dockerfile、agent-runner/、skills/、build.sh）

### 迁移目标
- `src/agent-runner.ts` — 接收 `writeGroupsSnapshot`、`writeTasksSnapshot`、`AvailableGroup`
- Phase 1 新增的 agent-runner.ts 是主要 runner 代码所在，快照函数放此处逻辑连贯

### 验证点
- `npm run build`（`tsc`）编译通过，无对已删除模块的引用
- 现有其他测试（group-queue.test.ts、db.test.ts 等）不受影响

</code_context>

<specifics>
## Specific Ideas

- 无特殊要求 — 标准删除 + 迁移操作，干净利落

</specifics>

<deferred>
## Deferred Ideas

- 浏览器自动化（agent-browser skill）— Phase 3 或后续按需添加

</deferred>

---

*Phase: 02-container-layer-removal*
*Context gathered: 2026-03-03*
