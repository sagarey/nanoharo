---
phase: 02-container-layer-removal
verified: 2026-03-03T02:51:00Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 2: Container Layer Removal — Verification Report

**Phase Goal:** 容器相关代码全部删除，代码库中不再有 Docker/容器运行时的残留
**Verified:** 2026-03-03T02:51:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | `src/container-runner.ts`, `src/container-runtime.ts`, `src/mount-security.ts` 不存在 | VERIFIED | `ls` exit 2 for all three paths — files absent |
| 2 | `src/container-runner.test.ts`, `src/container-runtime.test.ts` 不存在 | VERIFIED | `ls` exit 2 for both paths — files absent |
| 3 | `container/` 目录不存在 | VERIFIED | `ls /workspaces/nanoharo/container/` exit 2 — directory absent |
| 4 | `npm run build` 编译通过，零错误，零对已删除模块的引用 | VERIFIED | `tsc` exits 0, no errors, no "Cannot find module" output; no live imports from `container-runner` in any `src/` file |
| 5 | `npm test` 全部通过（存活测试不受影响） | VERIFIED | 27 test files, 321 tests passed, 0 failures |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|---------|--------|---------|
| `src/agent-runner.ts` | 导出 `writeGroupsSnapshot`, `writeTasksSnapshot`, `AvailableGroup`；包含 `fs` 和 `resolveGroupIpcPath` 导入 | VERIFIED | Lines 11–23: `import fs from 'fs'` and `import { resolveGroupIpcPath } from './group-folder.js'` present. Lines 199–246: `AvailableGroup` interface, `writeTasksSnapshot`, `writeGroupsSnapshot` all exported with full implementations (file I/O, mkdirSync, writeFileSync — not stubs) |
| `src/index.ts` | import 路径指向 `agent-runner.js` | VERIFIED | Lines 12–17: `from './agent-runner.js'` imports `AgentOutput`, `runInProcessAgent`, `writeGroupsSnapshot`, `writeTasksSnapshot`. Line 104: inline dynamic import type `import('./agent-runner.js').AvailableGroup[]` — the pitfall case correctly updated |
| `src/ipc.ts` | import 路径指向 `agent-runner.js` | VERIFIED | Line 12: `import { AvailableGroup } from './agent-runner.js'` |
| `src/task-scheduler.ts` | import 路径指向 `agent-runner.js` | VERIFIED | Lines 12–15: `import { AgentOutput, runInProcessAgent, writeTasksSnapshot } from './agent-runner.js'` |
| `src/config.ts` | 不含 `MOUNT_ALLOWLIST_PATH`, `CONTAINER_IMAGE`, `CONTAINER_TIMEOUT`, `CONTAINER_MAX_OUTPUT_SIZE`; 保留 `MAX_CONCURRENT_CONTAINERS`; 注释更新 | VERIFIED | Grep confirms all 4 orphaned constants absent. `MAX_CONCURRENT_CONTAINERS` present at line 28–31. Line 7 comment updated to reference `agent-runner.ts` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/index.ts` | `src/agent-runner.ts` | `import { writeGroupsSnapshot, writeTasksSnapshot }` | WIRED | Line 15–17: static import present and both functions called at lines 254–275 |
| `src/index.ts` (line 104) | `src/agent-runner.ts` | inline dynamic import type in return annotation | WIRED | `export function getAvailableGroups(): import('./agent-runner.js').AvailableGroup[]` — critical pitfall case resolved correctly |
| `src/ipc.ts` | `src/agent-runner.ts` | `import { AvailableGroup }` | WIRED | Line 12: import present; `AvailableGroup` used in `IpcDeps` interface (lines 25, 28) |
| `src/task-scheduler.ts` | `src/agent-runner.ts` | `import { writeTasksSnapshot }` | WIRED | Line 14: import present; `writeTasksSnapshot` called at lines 98–110 |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| RUNNER-02 | 02-01-PLAN.md | 删除 `src/container-runner.ts`、`src/container-runtime.ts`、`src/mount-security.ts` | SATISFIED | All three files absent; survivor symbols (`AvailableGroup`, `writeGroupsSnapshot`, `writeTasksSnapshot`) migrated to `agent-runner.ts` before deletion; `npm run build` exits 0 |
| RUNNER-03 | 02-01-PLAN.md | 删除 `container/` 目录（Dockerfile、agent-runner、skills、build.sh） | SATISFIED | `container/` directory absent; git commit `0927df4` documents the deletion |

**Requirements.md cross-reference:** Both RUNNER-02 and RUNNER-03 appear in `/workspaces/nanoharo/.planning/REQUIREMENTS.md` lines 11–12 (task checkboxes) and lines 45–46 (traceability table) with status "Complete". Definitions match the plan's scope exactly.

**Orphaned requirements:** None. All requirements mapped to this phase (RUNNER-02, RUNNER-03) are claimed by plan 02-01. No REQUIREMENTS.md entries for Phase 2 are unclaimed.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/agent-runner.ts` | 83 | Comment `// This mirrors the container mount layout (container-runner.ts):` | Info | Historical comment, not a live reference; no import or code dependency. Does not affect compilation or behavior. |
| `src/agent-runner.ts` | 197 | Comment `// --- Snapshot helpers (migrated from container-runner.ts) ---` | Info | Provenance comment, not a live reference. |
| `src/index.ts` | 391, 404, 406 | Stale comment `'Piped messages to active container'` and `'No active container'` | Info | Comments reference "container" conceptually; behavior is correct (GroupQueue path), terminology mildly stale. No code impact. |

No Blocker or Warning anti-patterns found. All implementations are substantive (real file I/O, non-empty function bodies, non-stub).

### Human Verification Required

None. All aspects of this phase — file deletion, import path surgery, symbol migration, build and test — are fully verifiable programmatically. The phase involves no UI, real-time behavior, or external service integration.

### Gaps Summary

No gaps. All five observable truths verified. All artifacts exist, are substantive, and are wired. Both requirements (RUNNER-02, RUNNER-03) satisfied. TypeScript compiler confirms zero unresolved module references. All 321 tests pass.

---

## Verification Evidence Summary

**Deleted files (confirmed absent):**
- `/workspaces/nanoharo/src/container-runner.ts` — gone
- `/workspaces/nanoharo/src/container-runtime.ts` — gone
- `/workspaces/nanoharo/src/mount-security.ts` — gone
- `/workspaces/nanoharo/src/container-runner.test.ts` — gone
- `/workspaces/nanoharo/src/container-runtime.test.ts` — gone
- `/workspaces/nanoharo/container/` — gone

**Migrated symbols (confirmed in `src/agent-runner.ts` lines 197–246):**
- `export interface AvailableGroup` — full definition, 4 fields
- `export function writeTasksSnapshot` — full implementation with `fs.mkdirSync`, filter logic, `fs.writeFileSync`
- `export function writeGroupsSnapshot` — full implementation with `fs.mkdirSync`, visibility logic, `fs.writeFileSync`

**Import rewrites verified:**
- `src/index.ts` line 12–17: `from './agent-runner.js'` (static import)
- `src/index.ts` line 104: `import('./agent-runner.js').AvailableGroup[]` (inline dynamic import type — pitfall case)
- `src/ipc.ts` line 12: `from './agent-runner.js'`
- `src/task-scheduler.ts` line 12–15: `from './agent-runner.js'`

**Config cleanup verified:**
- `MOUNT_ALLOWLIST_PATH`, `CONTAINER_IMAGE`, `CONTAINER_TIMEOUT`, `CONTAINER_MAX_OUTPUT_SIZE` — all absent from `src/config.ts`
- `MAX_CONCURRENT_CONTAINERS` — retained at line 28, still consumed by `src/group-queue.ts` lines 3, 69, 106, 288
- `os` import — removed (was orphaned after `HOME_DIR` deletion)
- Line 7 comment — updated from `container-runner.ts` to `agent-runner.ts`

**Build and test:**
- `npm run build` (tsc): exit 0, zero errors
- `npm test` (vitest): 27 test files, 321 tests, 0 failures
- Git commits: `f1e6b23` (Task 1) and `0927df4` (Task 2) both confirmed present in repository

---

_Verified: 2026-03-03T02:51:00Z_
_Verifier: Claude (gsd-verifier)_
