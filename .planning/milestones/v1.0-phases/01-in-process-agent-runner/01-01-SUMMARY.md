---
phase: 01-in-process-agent-runner
plan: "01"
subsystem: agent-runner
tags: [claude-agent-sdk, v2-session, in-process, typescript]

# Dependency graph
requires: []
provides:
  - "runInProcessAgent() — V2 SDK session runner replacing container-based runContainerAgent()"
  - "AgentInput / AgentOutput interfaces aligned with ContainerInput/ContainerOutput"
  - "SDKSession type re-export for callers"
affects:
  - "02-group-queue — needs SDKSession type for GroupState.session field"
  - "03-index-wiring — swaps runContainerAgent() for runInProcessAgent() call site"

# Tech tracking
tech-stack:
  added:
    - "@anthropic-ai/claude-agent-sdk@0.2.63 — V2 unstable session API"
  patterns:
    - "ExtendedSessionOptions intersection type to inject cwd/settingSources/allowDangerouslySkipPermissions into SDKSessionOptions (SDK v0.2.x gap)"
    - "CLAUDE_HOME env for per-group session file isolation under data/sessions/{folder}/"
    - "readEnvFile() for API key — no process.env mutation (concurrent group safety)"

key-files:
  created:
    - src/agent-runner.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Used ExtendedSessionOptions type union to pass cwd/settingSources/allowDangerouslySkipPermissions — these are absent from SDKSessionOptions in v0.2.63 but accepted at runtime by the underlying Claude Code CLI"
  - "No `await using` — manual session lifecycle required so follow-up turns can reuse the same session handle after stream() returns"
  - "CLAUDE_HOME env redirects session storage to data/sessions/{folder}/ matching GROUP-02 requirement"
  - "@anthropic-ai/claude-agent-sdk installed as production dependency (not devDependency) since it runs in the main process"

patterns-established:
  - "Stream iteration pattern: for await (msg of session.stream()) capturing capturedSessionId from every message and emitting onOutput per assistant/result message"
  - "Error handling: catch block returns early with status:'error', normal return carries errorSubtype for non-success result messages"

requirements-completed: [RUNNER-01, GROUP-01, GROUP-02]

# Metrics
duration: 25min
completed: 2026-03-02
---

# Phase 01 Plan 01: In-process Agent Runner Summary

**V2 SDK session runner (unstable_v2_createSession/resumeSession) with per-group cwd isolation and CLAUDE_HOME session storage, replacing container-based runContainerAgent()**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-03-02T18:38:00Z
- **Completed:** 2026-03-02T19:03:37Z
- **Tasks:** 1 of 1
- **Files modified:** 3 (src/agent-runner.ts created, package.json + package-lock.json updated)

## Accomplishments

- New `src/agent-runner.ts` with `runInProcessAgent()` implementing V2 SDK session create/resume pattern
- `AgentInput` / `AgentOutput` interfaces field-aligned with `ContainerInput` / `ContainerOutput` for minimal call-site changes in Plan 03
- Streaming iteration over `session.stream()` — assistant text chunks emitted via `onOutput`, session_id captured from every message
- `CLAUDE_HOME` env isolation ensures each group's session files land in `data/sessions/{folder}/` not `~/.claude/`
- TypeScript strict-mode compilation passes with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: 新建 src/agent-runner.ts** — `7d45e6a` (feat)
   - `src/agent-runner.ts` created
   - `@anthropic-ai/claude-agent-sdk@0.2.63` added to `package.json`

**Plan metadata:** (created below)

## Files Created/Modified

- `src/agent-runner.ts` — Core in-process runner; exports `runInProcessAgent`, `AgentInput`, `AgentOutput`, `SDKSession`
- `package.json` — Added `@anthropic-ai/claude-agent-sdk@0.2.63` as production dependency
- `package-lock.json` — Updated lockfile

## Decisions Made

**1. ExtendedSessionOptions type union**
`SDKSessionOptions` in SDK v0.2.63 (V2 @alpha) lacks `cwd`, `settingSources`, and `allowDangerouslySkipPermissions`. These exist in V1's `Options` type and are accepted by the underlying Claude Code CLI. Created `ExtendedSessionOptions = SDKSessionOptions & { cwd?; allowDangerouslySkipPermissions?; settingSources? }` to pass them without runtime breakage while keeping TS happy.

**2. No `await using`**
Using `const session = unstable_v2_createSession(...)` (not `await using session`) so the session handle is not auto-disposed when the function returns. The caller stores it in `GroupState.session` for follow-up turns.

**3. CLAUDE_HOME env**
Session files routed to `data/sessions/{group.folder}/` via `env.CLAUDE_HOME`. Matches GROUP-02 requirement and keeps session files co-located with existing `sessions` SQLite table data.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed missing @anthropic-ai/claude-agent-sdk dependency**
- **Found during:** Task 1 — package not present in project
- **Issue:** `@anthropic-ai/claude-agent-sdk` not in `package.json`; import would fail at runtime
- **Fix:** `npm install @anthropic-ai/claude-agent-sdk@latest` (resolved to v0.2.63)
- **Files modified:** `package.json`, `package-lock.json`
- **Verification:** `npx tsc --noEmit` exits 0
- **Committed in:** `7d45e6a` (Task 1 commit)

**2. [Rule 1 - Adaptation] ExtendedSessionOptions to bridge SDK type gap**
- **Found during:** Task 1 — `SDKSessionOptions` in v0.2.63 has no `cwd`/`settingSources`/`allowDangerouslySkipPermissions`
- **Issue:** RESEARCH.md code examples used these options; actual SDK types don't include them
- **Fix:** Defined `ExtendedSessionOptions = SDKSessionOptions & {...}` intersection type; runtime SDK CLI accepts these args
- **Verification:** `npx tsc --noEmit` exits 0; no type errors
- **Committed in:** `7d45e6a` (Task 1 commit)

---

**Total deviations:** 2 auto-handled (1 blocking dependency install, 1 type adaptation)
**Impact on plan:** Both necessary for the implementation to compile and run. No scope creep.

## Issues Encountered

SDK v0.2.63 `SDKSessionOptions` (V2 @alpha) is narrower than the V1 `Options` type — missing `cwd`, `settingSources`, `allowDangerouslySkipPermissions`. Research was based on V2 preview docs that may have included these. Resolved by using an intersection type; the underlying Claude Code CLI executable does accept these options (confirmed via `--setting-sources` and `--dangerously-skip-permissions` in `claude --help`).

## User Setup Required

None — no external service configuration required. `ANTHROPIC_API_KEY` is read from `.env` via existing `readEnvFile()`.

## Next Phase Readiness

- `runInProcessAgent()` ready for call-site integration in Plan 03 (index.ts wiring)
- Plan 02 (GroupQueue refactor) needs the `SDKSession` type from this file — re-exported as `export type { SDKSession }`
- No blockers

---
*Phase: 01-in-process-agent-runner*
*Completed: 2026-03-02*

## Self-Check: PASSED

- `src/agent-runner.ts` — FOUND
- Commit `7d45e6a` — FOUND
- `01-01-SUMMARY.md` — FOUND
