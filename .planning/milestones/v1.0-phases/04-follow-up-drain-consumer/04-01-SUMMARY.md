---
phase: 04-follow-up-drain-consumer
plan: "04-01"
subsystem: messaging
tags: [sdk-session, group-queue, follow-up, drain, vitest]

# Dependency graph
requires:
  - phase: 01-in-process-agent-runner
    provides: GroupQueue with pendingFollowUps[] write side + SDKSession.send()/stream() pattern
provides:
  - "GroupQueue.drainFollowUps(): consumes pendingFollowUps via session.send() + stream()"
  - "GroupQueue.setDrainFollowUpsFn(): output routing callback setter"
  - "index.ts wiring: drain output reaches WhatsApp user via channel.sendMessage"
  - "4 vitest unit tests covering drain behavior"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "splice(0) atomic take-all pattern for concurrent producer-consumer queues"
    - "drainFollowUpsFn setter mirrors setProcessMessagesFn — consistent callback registration"
    - "Drain before finally: session must still be valid when drain executes"

key-files:
  created: []
  modified:
    - src/group-queue.ts
    - src/group-queue.test.ts
    - src/index.ts

key-decisions:
  - "splice(0) instead of shift() to atomically take all queued messages in one operation — handles concurrent sendMessage() calls during stream iteration"
  - "Drain placed in try block after processMessagesFn, before finally — session is still valid at this point"
  - "Break on SDK error (don't re-throw) — runForGroup must not fail due to drain error, consistent with outputSentToUser pattern"
  - "setDrainFollowUpsFn setter pattern — backward compatible, matches existing setProcessMessagesFn API"
  - "index.ts <internal> strip applied to drain output — same as primary onOutput handler in processGroupMessages"

patterns-established:
  - "Drain-before-finally: async cleanup that needs active session must run in try block, not after finally"
  - "Atomic splice(0) for in-memory queues with concurrent writers"

requirements-completed:
  - RUNNER-04

# Metrics
duration: 3min
completed: 2026-03-03
---

# Phase 4 Plan 01: Follow-up Drain Consumer Summary

**pendingFollowUps drain consumer added to GroupQueue: follow-up messages now sent to Claude via session.send() and responses routed to WhatsApp user**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-03T06:36:50Z
- **Completed:** 2026-03-03T06:40:12Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `drainFollowUps()` private method to GroupQueue that consumes `pendingFollowUps[]` via the open SDK session
- Added `setDrainFollowUpsFn()` public setter for output routing — follow-up assistant responses now reach WhatsApp users
- Wired drain output routing in `index.ts` with `<internal>` tag stripping, matching the primary `onOutput` handler
- Added 4 vitest tests covering: normal drain, empty-queue no-op, SDK error isolation, concurrent-push during stream iteration

## Task Commits

Each task was committed atomically:

1. **Task 1: Add drainFollowUps() to GroupQueue and wire into runForGroup()** - `c7e1007` (feat)
2. **Task 2: Write drain consumer tests and wire drainFollowUpsFn in index.ts** - `3b8c8ab` (feat)

## Files Created/Modified

- `src/group-queue.ts` - Added `drainFollowUpsFn` field, `setDrainFollowUpsFn()` setter, `drainFollowUps()` private method; wired drain call in `runForGroup()` try block before finally
- `src/group-queue.test.ts` - Added 4 drain tests + `makeStreamMessages()` helper; total test count: 18 (up from 14)
- `src/index.ts` - Registered `setDrainFollowUpsFn` callback after `setProcessMessagesFn`, routes output through `findChannel()` + `ch.sendMessage()` with `<internal>` stripping

## Decisions Made

- `splice(0)` over `shift()` in while-loop — atomically takes all queued messages including any pushed during the current stream() iteration; next loop pass catches new arrivals
- Drain executes inside `try` block, not after `finally` — `finally` nulls `state.session`, so drain must complete while session is still valid
- `break` on SDK error without re-throw — keeps `runForGroup` stable; unprocessed items remain in queue for next invocation
- `setDrainFollowUpsFn` callback pattern mirrors `setProcessMessagesFn` — caller (index.ts) owns channel routing, GroupQueue stays channel-agnostic

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- RUNNER-04 fully satisfied: follow-up messages are no longer silently discarded
- All 325 tests pass, TypeScript compiles clean
- Phase 4 is the last phase in the roadmap — milestone v1.0 audit gap now closed

---
*Phase: 04-follow-up-drain-consumer*
*Completed: 2026-03-03*

## Self-Check: PASSED
