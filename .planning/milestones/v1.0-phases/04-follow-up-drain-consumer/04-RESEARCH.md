# Phase 4: Follow-up Drain Consumer - Research

**Researched:** 2026-03-03
**Domain:** In-process SDK session multi-turn messaging / TypeScript async patterns
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

All implementation details are delegated to Claude's discretion (user skipped all questions).

### Claude's Discretion

- **drain 循环位置**：在 `runForGroup()` 的 `try` 块末尾（`processMessagesFn` await 之后），用 while 循环消费 `state.pendingFollowUps`，在 `finally` 清理之前执行。此时 `state.session` 仍然有效，无需重建。

- **多条消息合并策略**：将 `pendingFollowUps.splice(0)` 取出全部待发消息，join 拼接为一条字符串发送（与 `formatMessages()` 风格一致）。减少 API round-trip，且现有 `processGroupMessages` 已有此先例。

- **drain 内的 onOutput 处理**：复用 `processMessagesFn` 传递的 `onOutput` 或通过新的回调参数传入，确保 follow-up 的 assistant 输出也能发送给用户（setTyping、sendMessage）。最小改动方案：将 drain 逻辑封装为 `runForGroup` 可调用的辅助函数，接收与 `processMessagesFn` 相同的上下文。

- **drain 后的新消息**：drain 完成后不改变 `pendingMessages` 标志，走现有 `drainGroup()` 流程处理后续消息——现有逻辑已正确处理，无需新增代码。

- **错误处理**：drain 循环中 SDK 出错时，记录 error 日志，停止循环（不继续消费剩余 follow-ups），已消费部分不回滚（与现有 `outputSentToUser` 逻辑一致）。

- **空队列处理**：`pendingFollowUps.length === 0` 时直接跳过循环，零开销。

### Deferred Ideas (OUT OF SCOPE)

None — 讨论在 Phase 4 边界内

全新的 follow-up 架构、IPC 变更、session 管理变更不在本阶段。
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RUNNER-04 | IPC follow-up 消息机制改为进程内直接传递，去掉文件轮询 | drain 消费循环通过 `session.send()` 直接传递已在内存队列中的 follow-up 消息，完成写入侧（sendMessage→pendingFollowUps）与消费侧（drain loop→session.send）的全链路打通 |
</phase_requirements>

## Summary

Phase 4 is a targeted gap closure: `GroupQueue.sendMessage()` already pushes messages to `state.pendingFollowUps[]`, but `runForGroup()` never consumes them. The drain consumer is a while-loop inserted after `await processMessagesFn(groupJid)` and before the `finally` block. It consumes `pendingFollowUps` via `state.session.send()` + `session.stream()`, using the same session already established during the primary turn.

The implementation is entirely within `src/group-queue.ts`. The session call pattern is proven in `src/agent-runner.ts` lines 122-175 and can be adapted directly. No new dependencies, no architectural changes — purely additive logic in the existing call site.

The critical design constraint: drain MUST execute before `finally` (which nulls `state.session`). The session object's lifetime is bounded by the `finally` block; drain must complete within that window.

**Primary recommendation:** Insert `drainFollowUps()` private method in `GroupQueue`, called from `runForGroup()` after `processMessagesFn` returns, passing `state.session` and a routing callback. Tests via vitest with fake timers following existing `group-queue.test.ts` patterns.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/claude-agent-sdk` | 0.2.x (existing) | `session.send()` + `session.stream()` | Already in use; `runInProcessAgent` in agent-runner.ts proves the pattern |
| `vitest` | existing | Unit tests with fake timers | Already used in group-queue.test.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pino (via `logger`) | existing | Structured logging | `logger.debug/info/error({ groupJid, ... }, 'msg')` pattern |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| splice(0) + join | Process one-at-a-time in loop | More round-trips; batching is simpler and reduces API calls |
| Separate drain session | Reuse existing state.session | Reusing is simpler; new session requires extra setup and wastes the already-open session |

**Installation:** No new packages needed.

## Architecture Patterns

### Current State (before Phase 4)

```
GroupQueue.sendMessage()
  → state.pendingFollowUps.push(text)   ← write side EXISTS ✓

GroupQueue.runForGroup()
  → await processMessagesFn(groupJid)   ← primary turn
  → ??? pendingFollowUps never consumed  ← GAP ✗
  → finally: state.session = null
```

### Target State (after Phase 4)

```
GroupQueue.runForGroup()
  → await processMessagesFn(groupJid)   ← primary turn
  → drainFollowUps(groupJid, state)      ← NEW: consume follow-ups
      while (pendingFollowUps.length > 0)
        const msgs = state.pendingFollowUps.splice(0)
        await state.session.send(msgs.join('\n\n'))
        for await (msg of state.session.stream()) { ... route output ... }
  → finally: state.session = null        ← session still valid during drain
```

### Pattern 1: Drain Loop with splice(0)

**What:** Atomically take all queued follow-ups in one operation, process, then check for more.
**When to use:** When a producer may add items during the drain loop (concurrent writes).
**Example:**
```typescript
// Source: existing processGroupMessages pattern in src/index.ts
while (state.pendingFollowUps.length > 0) {
  const msgs = state.pendingFollowUps.splice(0); // atomic take-all
  const combined = msgs.join('\n\n');
  // send + stream pattern from agent-runner.ts:122-175
  await state.session!.send(combined);
  for await (const msg of state.session!.stream()) {
    // handle assistant/result messages
  }
}
```

### Pattern 2: onOutput Routing for Follow-up Turns

**What:** Reuse the same output routing as primary turn to send follow-up responses to the user.
**When to use:** When follow-up response must go to WhatsApp just like primary turn response.
**Example:**
```typescript
// GroupQueue needs a follow-up output handler callback
// Simplest approach: add optional drainOutputFn to processMessagesFn interface
// OR: expand processMessagesFn signature
// Current processMessagesFn: (groupJid: string) => Promise<boolean>
// Option A: separate drainFollowUpsFn: (groupJid: string, msgs: string) => Promise<void>
// Option B: inline callback in runForGroup at time of drain
```

### Pattern 3: GroupQueue Architecture for drainFollowUps

**What:** A private method in GroupQueue, separate from runForGroup, responsible for the drain loop.
**Why separate method:** Keeps runForGroup readable; drain logic is independently testable.
**Example:**
```typescript
private async drainFollowUps(
  groupJid: string,
  state: GroupState,
  onFollowUpOutput?: (groupJid: string, text: string) => Promise<void>,
): Promise<void> {
  while (state.pendingFollowUps.length > 0 && state.session) {
    const msgs = state.pendingFollowUps.splice(0);
    const combined = msgs.join('\n\n');
    logger.debug({ groupJid, msgCount: msgs.length }, 'Draining follow-ups');
    try {
      await state.session.send(combined);
      for await (const msg of state.session.stream()) {
        if (msg.type === 'assistant') {
          const text = (msg.message.content as Array<{type: string; text?: string}>)
            .filter((b): b is {type: 'text'; text: string} => b.type === 'text')
            .map((b) => b.text)
            .join('');
          if (text && onFollowUpOutput) {
            await onFollowUpOutput(groupJid, text);
          }
        }
        if (msg.type === 'result') break;
      }
    } catch (err) {
      logger.error({ groupJid, err }, 'Error draining follow-up');
      break; // Stop drain on error; don't re-queue
    }
  }
}
```

### Anti-Patterns to Avoid
- **Drain after finally:** Calling drain after `state.session = null` — session is gone, drain cannot proceed. MUST be before `finally` cleanup.
- **Creating a new session for drain:** Unnecessary overhead; the existing session is still open and valid.
- **Not splicing atomically:** Using `shift()` in a loop risks missing items added by concurrent `sendMessage()` calls between iterations.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-turn messaging | Custom HTTP client | `state.session.send()` + `state.session.stream()` | SDK handles auth, retries, session continuity |
| Output routing | New channel abstraction | Pass callback from caller (same `onOutput` pattern) | Already proven in processGroupMessages → runAgent → runInProcessAgent |
| Test async flows | Manual Promise chains | vitest fake timers + vi.fn() | Already in group-queue.test.ts |

**Key insight:** All infrastructure exists. This phase is pure "wire up the drain loop."

## Common Pitfalls

### Pitfall 1: Drain Called After Session Nulled
**What goes wrong:** `finally` sets `state.session = null`. If drain is called after finally, `state.session!.send()` throws.
**Why it happens:** Incorrect placement of drain call in runForGroup.
**How to avoid:** Call `drainFollowUps()` inside the `try` block, AFTER `processMessagesFn` returns, BEFORE the `finally` runs.
**Warning signs:** TypeScript might allow `state.session!` even when null; add runtime null-check inside drainFollowUps.

### Pitfall 2: splice(0) vs shift() Race
**What goes wrong:** Using `shift()` in a tight loop may miss items added by concurrent `sendMessage()` during drain.
**Why it happens:** `sendMessage()` can be called from the WhatsApp message handler while drain is running.
**How to avoid:** Use `splice(0)` to atomically take ALL items at loop start. Even if new items arrive mid-stream, the next while-iteration catches them.
**Warning signs:** Tests show messages occasionally lost under high-frequency follow-up scenarios.

### Pitfall 3: Error Leaves pendingFollowUps Non-Empty
**What goes wrong:** SDK error mid-drain leaves un-processed items in `pendingFollowUps`. Next `runForGroup` call may try to process stale items.
**Why it happens:** break on error stops drain but doesn't clear the queue.
**How to avoid:** Per CONTEXT.md decision: stop loop on error (consistent with `outputSentToUser` logic). Items remain in queue and will be retried on next `runForGroup` invocation. Document this explicitly.
**Warning signs:** Items accumulate across retries.

### Pitfall 4: onOutput Not Wired for Drain
**What goes wrong:** Follow-up response never reaches the user (WhatsApp) because drain outputs aren't routed.
**Why it happens:** `runForGroup` has no reference to `onOutput`/`onFollowUpOutput` callback.
**How to avoid:** Expand `processMessagesFn` or add a `drainFollowUpsFn` callback to `GroupQueue` (similar to `setProcessMessagesFn`). Alternatively, route through `processMessagesFn` by calling it again with follow-up context — but this changes semantics. Best: add `setDrainFollowUpsFn` setter.
**Warning signs:** Drain silently processes follow-ups but user sees no response in WhatsApp.

### Pitfall 5: Test Isolation with Fake Session
**What goes wrong:** Tests using `makeSession()` mock need `session.stream()` to return an async iterable. The current mock has `stream: vi.fn()` but doesn't return an async generator.
**Why it happens:** `for await (const msg of session.stream())` requires an AsyncIterable.
**How to avoid:** In drain tests, mock `session.stream()` to return an async generator:
```typescript
session.stream = vi.fn().mockReturnValue(
  (async function* () {
    yield { type: 'assistant', session_id: 'sid', message: { content: [{ type: 'text', text: 'reply' }] } };
    yield { type: 'result', subtype: 'success', session_id: 'sid' };
  })()
);
```

## Code Examples

### Drain Loop Integration Point in runForGroup

```typescript
// Source: src/group-queue.ts (current runForGroup structure)
private async runForGroup(groupJid: string, reason: 'messages' | 'drain'): Promise<void> {
  const state = this.getGroup(groupJid);
  state.active = true;
  // ...setup...
  try {
    if (this.processMessagesFn) {
      const success = await this.processMessagesFn(groupJid);
      if (success) {
        state.retryCount = 0;
      } else {
        this.scheduleRetry(groupJid, state);
      }
    }
    // ← INSERT HERE: await this.drainFollowUps(groupJid, state);
  } catch (err) {
    // ...error handling...
  } finally {
    state.active = false;
    state.session = null;      // ← session must still be valid during drain
    state.groupFolder = null;
    this.activeCount--;
    this.drainGroup(groupJid);
  }
}
```

### setDrainFollowUpsFn Setter (Option for output routing)

```typescript
// In GroupQueue class
private drainFollowUpsFn: ((groupJid: string, text: string) => Promise<void>) | null = null;

setDrainFollowUpsFn(fn: (groupJid: string, text: string) => Promise<void>): void {
  this.drainFollowUpsFn = fn;
}
```

### Caller Registration in index.ts

```typescript
// In index.ts, after queue setup:
queue.setDrainFollowUpsFn(async (chatJid: string, text: string) => {
  const stripped = text.replace(/<internal>[\s\S]*?<\/internal>/g, '').trim();
  if (stripped) {
    await channel.sendMessage(chatJid, stripped);
  }
});
```

### Vitest Test Pattern for Drain

```typescript
it('drains pendingFollowUps after processMessagesFn completes', async () => {
  let resolveProcess: () => void;
  const processMessages = vi.fn(async () => {
    await new Promise<void>((resolve) => { resolveProcess = resolve; });
    return true;
  });

  const drainOutputs: string[] = [];
  queue.setProcessMessagesFn(processMessages);
  queue.setDrainFollowUpsFn(async (_jid, text) => { drainOutputs.push(text); });

  queue.enqueueMessageCheck('group1@g.us');
  await vi.advanceTimersByTimeAsync(10);

  // Set up session mock with stream returning one message
  const session = makeSession();
  session.stream = vi.fn().mockReturnValue((async function* () {
    yield { type: 'assistant', session_id: 'sid',
            message: { content: [{ type: 'text', text: 'got it' }] } };
    yield { type: 'result', subtype: 'success', session_id: 'sid' };
  })());
  queue.registerSession('group1@g.us', session as any, 'test-group');

  // Queue a follow-up while agent is active
  queue.sendMessage('group1@g.us', 'follow up text');

  // Primary turn completes
  resolveProcess!();
  await vi.advanceTimersByTimeAsync(10);

  expect(session.send).toHaveBeenCalledWith('follow up text');
  expect(drainOutputs).toEqual(['got it']);
});
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Container IPC (file polling) | In-process `pendingFollowUps[]` queue | Queue write side complete (Phase 1), consume side missing (Phase 4 adds it) |
| Blocking drain (session.close before drain) | Non-blocking drain (drain before session.close) | Must ensure drain before finally |

## Open Questions

1. **Output routing approach: setDrainFollowUpsFn vs processMessagesFn expansion**
   - What we know: `processMessagesFn` is `(groupJid: string) => Promise<boolean>`, no access to output routing
   - What's unclear: whether to add a second setter or expand the type signature
   - Recommendation: Add `setDrainFollowUpsFn` setter (minimal change, backward compatible, matches existing pattern)

2. **Error recovery: stale items in pendingFollowUps after drain error**
   - What we know: CONTEXT.md says stop loop on error, don't re-queue
   - What's unclear: whether to clear the queue or leave items for next runForGroup
   - Recommendation: Per CONTEXT.md decision, stop loop (break). Items remain for potential retry on next invocation. This is consistent with the primary turn's retry mechanism.

## Sources

### Primary (HIGH confidence)
- `/workspaces/nanoharo/src/group-queue.ts` — GroupState interface, runForGroup, sendMessage, drainGroup patterns
- `/workspaces/nanoharo/src/agent-runner.ts:122-175` — `session.send()` + `for await session.stream()` proven pattern
- `/workspaces/nanoharo/src/index.ts:140-230` — processGroupMessages onOutput callback routing pattern
- `/workspaces/nanoharo/src/group-queue.test.ts` — vitest patterns, makeSession mock, fake timers setup

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions — user-approved implementation strategy

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries existing, proven in codebase
- Architecture: HIGH — drain pattern directly derived from existing agent-runner.ts code
- Pitfalls: HIGH — identified from code structure analysis + CONTEXT.md notes

**Research date:** 2026-03-03
**Valid until:** N/A — all findings from local codebase, no external dependencies

## RESEARCH COMPLETE

**Phase:** 04 - follow-up-drain-consumer
**Confidence:** HIGH

### Key Findings
- `state.session` is valid during `runForGroup` try block; drain must run before `finally` nulls it
- `session.send()` + `for await (msg of session.stream())` pattern is proven in `agent-runner.ts:122-175`
- `splice(0)` is the correct atomic take pattern for concurrent producer-consumer
- Output routing requires a new `setDrainFollowUpsFn` setter (minimal change matching existing `setProcessMessagesFn` pattern)
- `group-queue.test.ts` already has vitest + fake timers + makeSession pattern; drain tests extend this

### File Created
`.planning/phases/04-follow-up-drain-consumer/04-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | All existing; no new deps |
| Architecture | HIGH | Directly derived from existing code patterns |
| Pitfalls | HIGH | Identified from code structure + CONTEXT.md |

### Open Questions
- Output routing approach: `setDrainFollowUpsFn` vs expanding `processMessagesFn` signature (recommendation: new setter)

### Ready for Planning
Research complete. Planner can now create PLAN.md files.
