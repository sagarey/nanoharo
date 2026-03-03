# Phase 2: Container Layer Removal - Research

**Researched:** 2026-03-03
**Domain:** TypeScript module cleanup — delete dead code, migrate survivors, fix imports
**Confidence:** HIGH

## Summary

Phase 2 is a pure cleanup phase: delete six files (three source, two test, one directory tree) and migrate three exported symbols (`writeGroupsSnapshot`, `writeTasksSnapshot`, `AvailableGroup`) from the soon-to-be-deleted `container-runner.ts` to `agent-runner.ts`. The critical correctness check is a TypeScript build (`npm run build`) — once it compiles clean with no references to any deleted module, the phase is done.

The work is mechanical but requires careful ordering. The symbols must land in `agent-runner.ts` before any import paths are updated, or the build will break in the middle. There are also several secondary cleanup opportunities — stale config exports, stale `containerConfig` field in `types.ts`, a stale constant name `MAX_CONCURRENT_CONTAINERS` in `group-queue.ts` — that the CONTEXT.md decisions leave to Claude's discretion on placement and typing.

No new libraries are needed. No runtime behavior changes. The only open question is whether `config.ts` container-specific constants (`CONTAINER_IMAGE`, `CONTAINER_TIMEOUT`, `CONTAINER_MAX_OUTPUT_SIZE`, `MOUNT_ALLOWLIST_PATH`, `MAX_CONCURRENT_CONTAINERS`) should be removed in this phase or left for Phase 3.

**Primary recommendation:** Move the three survivor symbols into `agent-runner.ts`, update the four import lines in `index.ts`, `ipc.ts`, and `task-scheduler.ts`, then delete all six file targets. Confirm with `npm run build`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 仍被使用的函数归宿
- `writeGroupsSnapshot`、`writeTasksSnapshot`、`AvailableGroup` 迁移到 `src/agent-runner.ts`
- `index.ts`、`ipc.ts`、`task-scheduler.ts` 的 import 路径改为从 `agent-runner.js` 引入
- `ContainerInput`、`ContainerOutput` 接口随 `container-runner.ts` 一起删除（Phase 1 已完成替换，不再被外部使用）

#### container/skills/ 处理
- 随 `container/` 目录一起删除，不迁移
- agent-browser skill（`container/skills/agent-browser/SKILL.md`）一并删除
- 浏览器自动化支持在 Phase 3 Dockerfile 中按需重新考虑

#### 测试文件
- `src/container-runner.test.ts` 直接删除（测试的是将被删除的代码）
- `src/container-runtime.test.ts` 直接删除（同上）

### Claude's Discretion
- `writeGroupsSnapshot` / `writeTasksSnapshot` 在 `agent-runner.ts` 中的具体插入位置（文件末尾或独立区块）
- 是否需要同步更新这些函数的类型定义

### Deferred Ideas (OUT OF SCOPE)
- 浏览器自动化（agent-browser skill）— Phase 3 或后续按需添加
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RUNNER-02 | 删除 `src/container-runner.ts`、`src/container-runtime.ts`、`src/mount-security.ts` | All three files confirmed to exist. Survivor symbols (`writeGroupsSnapshot`, `writeTasksSnapshot`, `AvailableGroup`) confirmed identified and ready to migrate to `agent-runner.ts` before deletion. |
| RUNNER-03 | 删除 `container/` 目录（Dockerfile、agent-runner、skills、build.sh） | `container/` directory confirmed to exist with `Dockerfile`, `agent-runner/`, `skills/`, `build.sh`. Safe to rm -rf once RUNNER-02 code is migrated (no runtime dependency remains). |
</phase_requirements>

---

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| TypeScript compiler (`tsc`) | existing | Validate all references resolved after deletions | The authoritative signal that cleanup is complete |
| Node.js `fs` module | built-in | Delete files/directories programmatically or via shell `rm` | Already in use throughout codebase |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| `npm run build` | Full compile check (`tsc`) | Primary verification after each deletion step |
| `npm test` | Run vitest suite | Secondary verification that surviving tests still pass |
| `npm run typecheck` | `tsc --noEmit` | Quick type-only check without emitting JS |

**No new installations required.** This phase adds zero dependencies.

---

## Architecture Patterns

### Recommended Migration Order

```
1. Add survivor symbols to agent-runner.ts
2. Update imports in index.ts, ipc.ts, task-scheduler.ts
3. Delete src/container-runner.ts
4. Delete src/container-runtime.ts
5. Delete src/mount-security.ts
6. Delete src/container-runner.test.ts
7. Delete src/container-runtime.test.ts
8. Delete container/ directory tree
9. npm run build  ← must pass
10. npm test      ← must pass
```

Doing step 1 before step 2 ensures there is never a moment when the build is broken mid-task.

### Pattern 1: Symbol migration into agent-runner.ts

**What:** Append the three symbols to the bottom of `src/agent-runner.ts`, below the existing exports.

**When to use:** Any time a file is deleted but some of its exports are still referenced externally.

**Example:**
```typescript
// --- Snapshot helpers (migrated from container-runner.ts) ---

import fs from 'fs';
import path from 'path';
import { resolveGroupIpcPath } from './group-folder.js';

export interface AvailableGroup {
  jid: string;
  name: string;
  lastActivity: string;
  isRegistered: boolean;
}

export function writeTasksSnapshot(
  groupFolder: string,
  isMain: boolean,
  tasks: Array<{
    id: string;
    groupFolder: string;
    prompt: string;
    schedule_type: string;
    schedule_value: string;
    status: string;
    next_run: string | null;
  }>,
): void {
  const groupIpcDir = resolveGroupIpcPath(groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });
  const filteredTasks = isMain
    ? tasks
    : tasks.filter((t) => t.groupFolder === groupFolder);
  const tasksFile = path.join(groupIpcDir, 'current_tasks.json');
  fs.writeFileSync(tasksFile, JSON.stringify(filteredTasks, null, 2));
}

export function writeGroupsSnapshot(
  groupFolder: string,
  isMain: boolean,
  groups: AvailableGroup[],
  registeredJids: Set<string>,
): void {
  const groupIpcDir = resolveGroupIpcPath(groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });
  const visibleGroups = isMain ? groups : [];
  const groupsFile = path.join(groupIpcDir, 'available_groups.json');
  fs.writeFileSync(
    groupsFile,
    JSON.stringify({ groups: visibleGroups, lastSync: new Date().toISOString() }, null, 2),
  );
}
```

Note: `agent-runner.ts` already imports `path` but not `fs`. The `fs` import and the `resolveGroupIpcPath` import from `group-folder.js` must be added at the top of the file.

### Pattern 2: Import path surgery

**What:** Change four import lines across three files.

**Exact changes required:**

```typescript
// src/index.ts line 13 — BEFORE:
import { writeGroupsSnapshot, writeTasksSnapshot } from './container-runner.js';

// src/index.ts line 13 — AFTER:
import { writeGroupsSnapshot, writeTasksSnapshot } from './agent-runner.js';

// src/index.ts line 100 — BEFORE:
export function getAvailableGroups(): import('./container-runner.js').AvailableGroup[] {

// src/index.ts line 100 — AFTER:
export function getAvailableGroups(): import('./agent-runner.js').AvailableGroup[] {
// (or import AvailableGroup at the top and use it directly)

// src/ipc.ts line 12 — BEFORE:
import { AvailableGroup } from './container-runner.js';

// src/ipc.ts line 12 — AFTER:
import { AvailableGroup } from './agent-runner.js';

// src/task-scheduler.ts line 12 — BEFORE:
import { writeTasksSnapshot } from './container-runner.js';

// src/task-scheduler.ts line 12 — AFTER:
import { writeTasksSnapshot } from './agent-runner.js';
```

### Anti-Patterns to Avoid

- **Delete before migrating:** Deleting `container-runner.ts` before adding its survivors to `agent-runner.ts` will break the TypeScript build, leaving the repo in an unbuildable state.
- **Partial cleanup of config.ts:** `CONTAINER_IMAGE`, `CONTAINER_TIMEOUT`, `CONTAINER_MAX_OUTPUT_SIZE`, `MOUNT_ALLOWLIST_PATH`, `MAX_CONCURRENT_CONTAINERS` in `config.ts` are still referenced (by `container-runner.ts` and `group-queue.ts`). Once `container-runner.ts` is deleted, `CONTAINER_IMAGE`, `CONTAINER_TIMEOUT`, `CONTAINER_MAX_OUTPUT_SIZE`, and `MOUNT_ALLOWLIST_PATH` will have no references and can optionally be cleaned up. `MAX_CONCURRENT_CONTAINERS` is still used in `group-queue.ts` — leave it (or rename as a follow-up).
- **Forgetting the dynamic import type annotation:** `index.ts` line 100 has an inline `import('./container-runner.js').AvailableGroup[]` type in the return signature of `getAvailableGroups`. This is easy to miss because it is not a top-level import statement.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Verifying no stale references | Custom grep script | `npm run build` (tsc) | TypeScript compiler is authoritative and will error on any missing module |
| Directory removal | Custom fs.rmSync loop | `fs.rmSync(path, { recursive: true, force: true })` or shell `rm -rf` | Built-in Node.js API handles recursion and non-existence |

**Key insight:** The TypeScript compiler is the single source of truth for this phase. Every deletion is validated by running `npm run build`.

---

## Common Pitfalls

### Pitfall 1: Inline dynamic import type in function signature
**What goes wrong:** `index.ts` line 100 uses `import('./container-runner.js').AvailableGroup[]` as an inline type reference in the return type of `getAvailableGroups()`. A grep for `from './container-runner.js'` will not catch this — it is inside the return type annotation, not a regular import statement.
**Why it happens:** TypeScript allows inline dynamic import types in return annotations. This pattern is uncommon and easy to overlook.
**How to avoid:** Search for all occurrences of the string `container-runner` (without the `from` prefix) before deleting the file.
**Warning signs:** Build passes after changing the three import statements but then fails with "Cannot find module './container-runner.js'" pointing to line 100.

### Pitfall 2: Missing imports in agent-runner.ts after migration
**What goes wrong:** The snapshot functions in `container-runner.ts` import `fs`, `path`, and `resolveGroupIpcPath`. The current `agent-runner.ts` imports `path` but not `fs`, and does not import `resolveGroupIpcPath`.
**Why it happens:** Copying function bodies without auditing their local dependencies.
**How to avoid:** Before writing the functions into `agent-runner.ts`, check its current import list and add `fs` and `resolveGroupIpcPath` if needed.
**Warning signs:** TypeScript errors `Cannot find name 'fs'` or `Cannot find name 'resolveGroupIpcPath'` after migration.

### Pitfall 3: config.ts orphaned exports after deletion
**What goes wrong:** After `container-runner.ts` is deleted, `config.ts` exports `CONTAINER_IMAGE`, `CONTAINER_TIMEOUT`, `CONTAINER_MAX_OUTPUT_SIZE`, `MOUNT_ALLOWLIST_PATH` with no consumers. These are harmless dead code but may cause confusion.
**Why it happens:** config.ts was not part of the deletion scope in CONTEXT.md decisions.
**How to avoid:** Clean them up as part of this phase (discretionary), or leave for Phase 3. Either is fine. Do not let them block the build — unused exports do not cause TypeScript errors.
**Warning signs:** Stale exported constants with container-specific names after phase completion.

### Pitfall 4: containerConfig field in types.ts and ipc.ts
**What goes wrong:** `types.ts` defines `ContainerConfig` and `RegisteredGroup.containerConfig`. `ipc.ts` `processTaskIpc` data parameter includes `containerConfig?: RegisteredGroup['containerConfig']`. These are still referenced even after the container runner is deleted, because `ipc.ts` passes `containerConfig` to `deps.registerGroup`.
**Why it happens:** The container configuration concept is baked into `RegisteredGroup` and the IPC `register_group` flow.
**How to avoid:** Leave `ContainerConfig` and `RegisteredGroup.containerConfig` in `types.ts` — they are not in the deletion scope (CONTEXT.md does not mention them). They do no harm as unused fields.
**Warning signs:** Cascading type errors if `ContainerConfig` is removed prematurely.

---

## Code Examples

Verified from direct code inspection:

### Current agent-runner.ts imports (what needs adding)
```typescript
// Current top of agent-runner.ts:
import path from 'path';
import { ... } from '@anthropic-ai/claude-agent-sdk';
import { DATA_DIR, GROUPS_DIR, MAIN_GROUP_FOLDER } from './config.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';
import { type RegisteredGroup } from './types.js';

// Must ADD for snapshot functions:
import fs from 'fs';
import { resolveGroupIpcPath } from './group-folder.js';
```

### Exact lines to update in each consumer file

**src/index.ts** — two changes:
- Line 13: `from './container-runner.js'` → `from './agent-runner.js'`
- Line 100: `import('./container-runner.js').AvailableGroup[]` → `import('./agent-runner.js').AvailableGroup[]`

**src/ipc.ts** — one change:
- Line 12: `import { AvailableGroup } from './container-runner.js'` → `from './agent-runner.js'`

**src/task-scheduler.ts** — one change:
- Line 12: `import { writeTasksSnapshot } from './container-runner.js'` → `from './agent-runner.js'`

### Verification commands
```bash
# Verify TypeScript compiles clean (primary gate):
npm run build

# Run surviving tests (must stay green):
npm test

# Quick double-check for any missed references:
grep -r "container-runner\|container-runtime\|mount-security" src/ dist/ 2>/dev/null
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `container-runner.ts` exports symbols directly | Symbols live in `agent-runner.ts`, no container dependency | This phase | Simpler dependency graph, no Docker coupling |
| `container/` directory containing Dockerfile + agent-runner | Deleted; main process IS the agent runner | This phase | Eliminates build/run container step |

---

## Open Questions

1. **Should config.ts container-specific constants be cleaned up in this phase?**
   - What we know: After deletion, `CONTAINER_IMAGE`, `CONTAINER_TIMEOUT`, `CONTAINER_MAX_OUTPUT_SIZE`, `MOUNT_ALLOWLIST_PATH` will have zero consumers. `MAX_CONCURRENT_CONTAINERS` is still used by `group-queue.ts`.
   - What's unclear: CONTEXT.md is silent on config.ts cleanup scope.
   - Recommendation: Remove the four orphaned constants from `config.ts` as part of this phase (they are dead code the moment `container-runner.ts` is gone). Leave `MAX_CONCURRENT_CONTAINERS` — it still gates concurrency in `group-queue.ts`, even if the name is a misnomer.

2. **Should the comment on config.ts line 8 be updated?**
   - What we know: Line 8 says "Secrets are NOT read here — they stay on disk and are loaded only where needed (container-runner.ts)". After deletion, the parenthetical reference is wrong.
   - Recommendation: Update the comment to reference `agent-runner.ts` or `env.ts` instead.

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection of all six affected source files — verified line numbers, symbol names, import paths, and function signatures
- `package.json` scripts section — verified `npm run build` = `tsc`, `npm test` = `vitest run`

### Secondary (MEDIUM confidence)
- TypeScript documentation on inline dynamic import types in function signatures (general language knowledge, verified pattern seen in `index.ts` line 100)

---

## Metadata

**Confidence breakdown:**
- Migration targets (symbols, lines): HIGH — verified by reading source files directly
- Deletion list: HIGH — all six targets confirmed to exist on disk
- Build verification approach: HIGH — `tsc` is the project's standard build command
- Pitfalls: HIGH — derived from direct code inspection, not speculation

**Research date:** 2026-03-03
**Valid until:** Until any of the affected source files are modified (stable; this is not a fast-moving domain)
