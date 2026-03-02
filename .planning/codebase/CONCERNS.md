# Codebase Concerns

**Analysis Date:** 2026-03-03

## Tech Debt

**Container Runner Synchronization:**
- Issue: Uses a combination of `Promise` and `ChildProcess` events with a custom `outputChain` to handle streaming output. The logic for resetting timeouts and resolving the promise is complex and prone to race conditions.
- Files: `src/container-runner.ts`
- Impact: Potential for containers to be reaped early or for responses to be lost if the stream is interrupted or markers are missed.
- Fix approach: Refactor to usage of async iterators for stdout and a more robust state machine for container lifecycle.

**Database Schema Migrations:**
- Issue: Migrations are handled via `try-catch` blocks on startup rather than a dedicated migration versioning system.
- Files: `src/db.ts`
- Impact: Hard to track current schema version; potential for partial migrations or silent failures if a `try-catch` catches an unrelated error.
- Fix approach: Implement a simple version-tracking table (`schema_version`) and sequential migration scripts.

**WhatsApp LID Translation:**
- Issue: Translation of LID (Linked ID) to Phone JIDs relies on a local map and Baileys' internal `signalRepository`.
- Files: `src/channels/whatsapp.ts`
- Impact: If the mapping is not yet in the signal store, the bot might fail to recognize "Me" (the bot itself) or other participants correctly, leading to duplicate processing or missed messages.
- Fix approach: Implement a more robust retry or pre-fetch strategy for group participants' identities.

## Known Bugs

**Container Output Truncation:**
- Issue: `CONTAINER_MAX_OUTPUT_SIZE` is enforced by simple slicing and a boolean flag.
- Symptoms: Large outputs from agents (e.g., long file reads or complex tasks) will be cut off, potentially breaking the JSON parsing if the truncation happens inside a sentinel marker pair.
- Files: `src/container-runner.ts`
- Trigger: Agent generating output larger than `CONTAINER_MAX_OUTPUT_SIZE`.
- Workaround: Increase individual group configuration timeouts/limits if possible.

## Security Considerations

**Host User Execution:**
- Risk: Containers run as the host UID/GID to allow bind-mount access. While this is necessary for developer workflows, it means any escape or vulnerability in the container runtime has the same permissions as the host user.
- Files: `src/container-runner.ts`
- Current mitigation: Use of read-only mounts for project root and restricted writable paths.
- Recommendations: Implement User Namespaced containers or more restrictive AppArmor/Seccomp profiles.

**Mount Allowlist Bypass:**
- Risk: While `mount-security.ts` blocks many patterns (`.ssh`, `.env`, etc.), it relies on a list of `blockedPatterns`. A malicious agent might find ways to access sensitive data through symlinks or paths not covered by the list.
- Files: `src/mount-security.ts`
- Current mitigation: Path expansion, real-path resolution, and blocklist matching.
- Recommendations: Use an allowlist-only approach for all mounts (which it mostly does via `allowedRoots`), and ensure recursive resolution of all symlinks within the mounted directories.

## Performance Bottlenecks

**Sequential IPC Processing:**
- Problem: IPC watcher processes tasks/messages but high volume might lead to lag in response if one task blocks the loop.
- Files: `src/ipc.ts`
- Cause: The orchestrator handles many groups and containers; heavy IO in one group might delay others.
- Improvement path: Ensure all IPC operations are truly non-blocking and consider a worker thread for database operations.

## Fragile Areas

**WhatsApp Connection Stability:**
- Files: `src/channels/whatsapp.ts`
- Why fragile: Relies heavily on the `@whiskeysockets/baileys` library and GitHub-based version fetching. Frequent WhatsApp protocol changes can break this without notice.
- Safe modification: Isolating Baileys-specific logic behind a cleaner interface.
- Test coverage: `src/channels/whatsapp.test.ts` exists but cannot fully mock the complex network behavior of WhatsApp.

**Agent Runner Synchronization:**
- Files: `src/container-runner.ts`
- Why fragile: The use of `OUTPUT_START_MARKER` and `OUTPUT_END_MARKER` in a stream requires perfect buffer management.
- Safe modification: Use a structured binary protocol or a dedicated socket for result transmission instead of scraping stdout.

## Missing Critical Features

**Audit Logs:**
- Problem: No central audit log for container executions, filesystem modifications, or security rejections beyond standard pino logs.
- Blocks: Detailed security analysis and troubleshooting of past agent actions.

**Automated Schema Rollbacks:**
- Problem: Since migrations are `try-catch` based, there is no way to rollback if a migration causes data corruption.

## Test Coverage Gaps

**Container Lifecycle:**
- What's not tested: Hard kills, grace periods, and timeout resets are difficult to test in unit tests.
- Files: `src/container-runner.ts`
- Risk: Containers might leak or fail to stop in production under high load.
- Priority: Medium

---

*Concerns audit: 2026-03-03*
