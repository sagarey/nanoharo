---
phase: quick-1-readme
plan: 1
subsystem: docs
tags: [readme, documentation, architecture, de-containerization]

requires: []
provides:
  - "README.md 反映 v1.0 进程内 SDK 架构，Key files 和架构图准确"
  - "CLAUDE.md Quick Context 和 Key Files 去容器化后状态"
  - "docs/REQUIREMENTS.md 通过加注标注 NanoHaro 与 NanoClaw 的架构差异"
  - "docs/SECURITY.md 通过加注说明目录级隔离取代容器沙箱"
affects: []

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - README.md
    - CLAUDE.md
    - docs/REQUIREMENTS.md
    - docs/SECURITY.md

key-decisions:
  - "docs/REQUIREMENTS.md 和 docs/SECURITY.md 不重写，以加注形式保留原文，便于与上游 NanoClaw 对比"
  - "README.md 完整重写以反映 NanoHaro 自己的定位，删除 NanoClaw 上游的容器架构描述"
  - "CLAUDE.md GSD Tools 路径从硬编码本地路径改为 $PWD 相对路径，支持任意机器"

patterns-established: []

requirements-completed: []

duration: 3min
completed: 2026-03-03
---

# Quick Task 1 (quick-1-readme): 更新文档反映去容器化架构 Summary

**README.md、CLAUDE.md、REQUIREMENTS.md、SECURITY.md 四文件更新，准确反映 NanoHaro v1.0 进程内 SDK 调用 + 目录级 group 隔离架构，消除对用户的容器沙箱误导**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-03T07:33:15Z
- **Completed:** 2026-03-03T07:36:36Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- README.md 架构图从容器沙箱链路改为 `runInProcessAgent()` → Claude Agent SDK V2 链路，Key files 新增 `agent-runner.ts` 和 `group-queue.ts`，删除 `container-runner.ts`
- CLAUDE.md Quick Context、Key Files、Development 章节均反映去容器化状态；GSD Tools 路径从硬编码路径改为 `$PWD` 相对路径；删除 Container Build Cache 整章
- docs/REQUIREMENTS.md 顶部加注 NanoHaro Fork Note，Container Isolation 章节加注 v1.0 已移除，Vision 和 Scheduler 相关行加注差异
- docs/SECURITY.md 顶部加注 NanoHaro Fork Note，Trust Model 表格更新，架构图下方加注 CONTAINER 层在 NanoHaro 不存在

## Task Commits

1. **Task 1: 更新 README.md 和 CLAUDE.md 反映去容器化架构** - `757db71` (文档)
2. **Task 2: 更新 docs/REQUIREMENTS.md 和 docs/SECURITY.md** - `93b9304` (文档)

## Files Created/Modified

- `/workspaces/nanoharo/README.md` - 完整重写，删除容器沙箱描述，更新架构图、Key files、Requirements、FAQ
- `/workspaces/nanoharo/CLAUDE.md` - Quick Context、Key Files、Development 更新；Container Build Cache 章节删除；GSD Tools 路径修正
- `/workspaces/nanoharo/docs/REQUIREMENTS.md` - 顶部加注 + Container Isolation / Vision / Scheduler 差异标注
- `/workspaces/nanoharo/docs/SECURITY.md` - 顶部加注 + Trust Model 表格更新 + 架构图注释

## Decisions Made

- docs/ 下文件选择加注而非重写：保留原文便于以后从 NanoClaw 上游 cherry-pick 变更时对比差异
- README.md 采用完整重写：作为 NanoHaro 的主要入口，需要准确反映当前架构，不保留过时描述

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Follow-up Notes

- `README_zh.md` 目前还是 NanoClaw 上游内容（中文版），同样需要同步更新。本次任务计划范围不含此文件，建议作为后续 quick task 处理。
- `docs/SECURITY.md` 的 Trust Model 表格格式在更新后列宽不对齐（原表格第三列描述移除），如有强迫症可手动修复格式，不影响内容准确性。

## Self-Check

- [x] README.md 架构图包含 runInProcessAgent — 确认 (line 121)
- [x] README.md Key files 包含 src/agent-runner.ts — 确认 (line 131)
- [x] README.md Key files 包含 src/group-queue.ts — 确认 (line 132)
- [x] docs/REQUIREMENTS.md 有 "NanoHaro Fork Note" — 确认 (line 5)
- [x] docs/SECURITY.md 有 "NanoHaro Fork Note" — 确认 (line 3)
- [x] 两个 task commits 存在 — 757db71, 93b9304 均确认

## Self-Check: PASSED

---
*Phase: quick-1-readme*
*Completed: 2026-03-03*
