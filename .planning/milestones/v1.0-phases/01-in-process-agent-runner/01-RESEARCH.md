# Phase 1: In-process Agent Runner - Research

**Researched:** 2026-03-03
**Domain:** @anthropic-ai/claude-agent-sdk V2 session API, TypeScript in-process agent integration
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### SDK API 版本
- 使用 **V2**：`unstable_v2_createSession()` / `unstable_v2_resumeSession()`
- 每个 group 的活跃 agent 以 session 对象表示（替代现有的 `ChildProcess`）
- `session.send()` 发送消息，`session.stream()` 流式接收输出

#### Streaming 输出
- 使用 streaming 模式：`for await (const message of session.stream())`
- 现有 `onOutput` callback 模式保留，适配 V2 stream 消息类型
- 从 stream 消息中提取 `session_id` 存入 SQLite（与现有逻辑一致）

#### Follow-up 消息传递
- **等待当前 turn 完成再 send**：agent 处理中的消息暂存队列，`stream()` 结束后用同一 session `send()` 发送
- 不再需要 `data/ipc/{group}/input/` 文件写入
- `GroupQueue.sendMessage()` 改为向进程内队列追加，而非写文件
- `GroupQueue.notifyIdle()` 触发下一条队列消息的 send

#### Group cwd 隔离
- **main group**：`cwd` = 项目根目录（与容器模式一致，可读写项目文件）
- **其他 group**：`cwd` = `groups/{name}/`
- SDK `cwd` 选项直接设置，无需额外 mount 配置
- `.claude/skills/` 从各自 cwd 加载（SDK 原生支持）

#### Session 管理
- `sessions` 表继续使用：存储 `group.folder → session_id` 的映射
- 新会话：`unstable_v2_createSession()`，从 stream 捕获 session_id 存库
- 恢复会话：`unstable_v2_resumeSession(session_id)`
- `GroupQueue` 中 `process: ChildProcess | null` 替换为 `session: Session | null`

#### 错误恢复
- **全部保留**现有逻辑：
  - cursor rollback（失败且未输出时回滚消息游标）
  - GroupQueue 指数退避 retry（最多 5 次，BASE 5s）
  - 已有输出则不 rollback 以避免重复发送
- SDK 调用失败与容器启动失败等价对待

### Claude's Discretion
- V2 session 的 `cwd`、`model`、`allowedTools` 等具体参数
- `GroupQueue` 中 session 生命周期管理的实现细节（何时 `session.close()`）
- 进程内消息队列的数据结构选择

### Deferred Ideas (OUT OF SCOPE)
- 无 — 讨论完全在 Phase 1 边界内
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RUNNER-01 | 用 `@anthropic-ai/claude-agent-sdk` `query()` 直接在主进程内替代 `runContainerAgent()` | V2 API `unstable_v2_createSession` / `unstable_v2_resumeSession` 覆盖新建和恢复两种路径；SDKResultMessage 类型覆盖 success/error 区分 |
| RUNNER-04 | IPC follow-up 消息机制改为进程内直接传递，去掉文件轮询 | V2 `session.send()` 为同一 session 追加 turn，GroupQueue 内部队列替代文件写入；ipc.ts 的 `input/` 目录扫描可删除 |
| GROUP-01 | agent `cwd` 设为 `groups/{name}/`，实现目录级 group 隔离 | SDK `Options.cwd` 直接支持；`settingSources: ['project']` 加载各 cwd 下的 CLAUDE.md |
| GROUP-02 | session 存储路径沿用 `data/sessions/{group}/` | SDK 默认将 session 持久化在 cwd 下的 `.claude/`；通过 `env.CLAUDE_HOME` 或 `settingSources` 可重定向到 `data/sessions/{group}/.claude/` |
</phase_requirements>

---

## Summary

Phase 1 用 Claude Agent SDK V2 session API 在主进程内替代容器调用。`unstable_v2_createSession()` / `unstable_v2_resumeSession()` 返回一个 `SDKSession` 对象，它的 `send()` + `stream()` 替代了现有的容器 stdin 写入和 stdout 解析。Session 对象本身就是"活跃 agent"的句柄，直接存入 `GroupQueue.GroupState` 替换原有的 `ChildProcess | null`。

follow-up 消息（原先写到 `data/ipc/{group}/input/` 的文件）改为在 `GroupQueue.sendMessage()` 内暂存到内存队列，当前 `stream()` 结束后用同一 session 的 `send()` 发送。这样消除了文件轮询，IPC watcher 的 `input/` 目录扫描逻辑可以删除（`messages/` 和 `tasks/` 目录保留）。

Session 存储路径通过 SDK 的 `env.CLAUDE_HOME` 环境变量重定向到 `data/sessions/{group}/`，使每个 group 的 session 文件与现有 `sessions` SQLite 表协同工作。SDK 会在该目录下创建 `.claude/` 子目录存放 session JSONL 文件。

**Primary recommendation:** 新建 `src/agent-runner.ts` 实现 `runInProcessAgent()`，签名与现有 `runContainerAgent()` 接口兼容，内部使用 V2 session API，不修改 `processGroupMessages()` 的调用层代码。

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@anthropic-ai/claude-agent-sdk` | latest (≥0.1.58) | 主进程内运行 Claude agent | 锁定决策；V2 API 包含在同一包内 |
| `typescript` | ^5.7.0 (已有) | 类型安全 | V2 API 需要 TS 5.2+ (`await using`) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `better-sqlite3` | ^11.8.1 (已有) | session_id 持久化 | `setSession()` 已有实现，直接复用 |
| `pino` | ^9.6.0 (已有) | 结构化日志 | 保持现有日志模式 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| V2 `unstable_v2_createSession` | V1 `query()` + async generator | V1 多 turn 需要 async iterable 协调，复杂；用户已决策用 V2 |
| 进程内 session | 子进程 SDK runner | 子进程方案已明确 Out of Scope |

**Installation:**
```bash
npm install @anthropic-ai/claude-agent-sdk
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── agent-runner.ts        # 新文件：runInProcessAgent() — 替代 container-runner.ts 的核心调用
├── group-queue.ts         # 改造：ChildProcess → SDKSession，sendMessage() 改为内存队列
├── index.ts               # 改造：runAgent() 内部替换，删除 ensureContainerSystemRunning()
├── task-scheduler.ts      # 改造：onProcess 回调改为 onSession，删除 containerName
├── ipc.ts                 # 改造：删除 input/ 目录扫描逻辑，保留 messages/+tasks/
└── container-runner.ts    # 保留（Phase 2 删除）：writeTasksSnapshot/writeGroupsSnapshot 仍被调用
```

### Pattern 1: V2 Session 创建与 session_id 捕获

**What:** 创建新 session，从 stream 中首条消息的 `session_id` 字段捕获 UUID 存库。
**When to use:** group 没有已存储的 session_id（新 group 或 session 过期）。

```typescript
// Source: https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview
import {
  unstable_v2_createSession,
  type SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';
import path from 'path';

const groupCwd = isMain ? process.cwd() : path.join('groups', group.folder);

const session = unstable_v2_createSession({
  model: 'claude-opus-4-6',
  cwd: groupCwd,
  permissionMode: 'bypassPermissions',
  allowDangerouslySkipPermissions: true,
  settingSources: ['project'], // 加载 cwd 下的 CLAUDE.md
  env: {
    ...process.env,
    ANTHROPIC_API_KEY: apiKey,
    CLAUDE_HOME: path.join('data', 'sessions', group.folder), // session 文件存储位置
  },
});

await session.send(prompt);

let capturedSessionId: string | undefined;
for await (const msg of session.stream()) {
  capturedSessionId = msg.session_id; // 每条消息都有 session_id
  if (msg.type === 'result') {
    // 处理结果
  }
}

if (capturedSessionId) {
  setSession(group.folder, capturedSessionId); // 存入 SQLite
}
```

### Pattern 2: V2 Session 恢复

**What:** 用已存储的 session_id 恢复历史会话。
**When to use:** group 有已存储的 session_id（重启后恢复，或 follow-up turn）。

```typescript
// Source: https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview
import { unstable_v2_resumeSession } from '@anthropic-ai/claude-agent-sdk';

const session = unstable_v2_resumeSession(existingSessionId, {
  model: 'claude-opus-4-6',
  cwd: groupCwd,
  permissionMode: 'bypassPermissions',
  allowDangerouslySkipPermissions: true,
  settingSources: ['project'],
  env: {
    ...process.env,
    ANTHROPIC_API_KEY: apiKey,
    CLAUDE_HOME: path.join('data', 'sessions', group.folder),
  },
});
```

### Pattern 3: Follow-up 消息队列（内存）

**What:** GroupQueue.sendMessage() 改为向内存队列追加，而非写文件。stream() 结束后发送队列中的下一条消息。
**When to use:** agent 处理中有新消息到达。

```typescript
// GroupState 新增字段
interface GroupState {
  // 原有字段...
  session: SDKSession | null;        // 替代 process: ChildProcess | null
  pendingFollowUps: string[];        // 替代文件写入
  // containerName: string | null;  // 删除（无容器名概念）
}

// sendMessage 新实现
sendMessage(groupJid: string, text: string): boolean {
  const state = this.getGroup(groupJid);
  if (!state.active || state.isTaskContainer) return false;
  state.idleWaiting = false;
  state.pendingFollowUps.push(text); // 追加到内存队列
  return true;
}

// notifyIdle 触发队列消费
notifyIdle(groupJid: string): void {
  const state = this.getGroup(groupJid);
  state.idleWaiting = true;
  if (state.pendingTasks.length > 0) {
    // 原有任务优先逻辑，触发 session.close() 结束当前 turn
    state.session?.close();
  }
  // follow-up 消费逻辑由 runInProcessAgent 内部处理
}
```

### Pattern 4: SDKResultMessage 处理

**What:** stream 中 `type === 'result'` 的消息对应 agent turn 结束；`subtype === 'success'` 表示成功，其他 subtype 表示错误。
**When to use:** 判断 agent 是否成功完成，提取结果文本。

```typescript
// Source: https://platform.claude.com/docs/en/agent-sdk/typescript (SDKResultMessage 类型)
for await (const msg of session.stream()) {
  capturedSessionId = msg.session_id;

  if (msg.type === 'assistant') {
    const text = msg.message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');
    if (text && onOutput) {
      await onOutput({ status: 'success', result: text });
    }
  }

  if (msg.type === 'result') {
    if (msg.subtype === 'success') {
      if (onOutput) await onOutput({ status: 'success', result: null }); // idle signal
    } else {
      // error_max_turns | error_during_execution | etc.
      if (onOutput) await onOutput({ status: 'error', result: null, error: msg.subtype });
    }
  }
}
```

### Anti-Patterns to Avoid

- **在 stream() 期间调用 session.close()：** 会中断当前 turn，造成不完整输出。只在 turn 结束后（stream() 返回后）或需要任务抢占时调用。
- **await using session = ...：** 会在 `processGroupMessages()` 返回时自动 close session，导致 follow-up turn 不可用。改用手动 `session.close()` 管理生命周期。
- **不传 `allowDangerouslySkipPermissions: true`：** `bypassPermissions` 模式必须同时设置此选项，否则工具调用仍会请求用户确认，在无人值守环境中挂起。
- **不设 `settingSources: ['project']`：** SDK 默认不加载任何 filesystem 配置，CLAUDE.md 不会被读取，group 记忆失效。
- **忘记设 `CLAUDE_HOME` env：** SDK 会将 session 文件存在 `~/.claude/projects/...`（全局），导致不同 group 的 session 混在一起。

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-turn 会话状态 | 手动拼 message history | V2 `session.send()` + `session.stream()` | SDK 内部管理上下文，包括 token 压缩 |
| Session 持久化格式 | 自定义 session 序列化 | SDK 原生 session 文件（JSONL）+ `CLAUDE_HOME` 重定向 | SDK 的 resumeSession 要求匹配格式 |
| 工具权限管理 | 自定义工具白名单逻辑 | SDK `allowedTools` + `permissionMode: 'bypassPermissions'` | SDK 处理工具调用流程和权限检查 |
| 流式输出解析 | 自定义 marker 解析（现有 sentinel 方案） | 直接迭代 `session.stream()` 消息 | 消除现有 OUTPUT_START/END_MARKER 的脆弱解析 |

**Key insight:** V2 SDK 消除了整个"子进程通信层"——不再需要 stdin 写入、stdout 解析、sentinel marker、文件 IPC。这是架构简化，不是功能替换。

---

## Common Pitfalls

### Pitfall 1: session.close() 导致 resumeSession 失败

**What goes wrong:** 调用 `session.close()` 后立即尝试 `resumeSession()`，发现历史记录不完整或报错。
**Why it happens:** 已修复的 bug（changelog 提及）：早期版本的 `session.close()` 会在持久化完成前终止子进程。确保使用最新版本的 SDK。
**How to avoid:** `npm install @anthropic-ai/claude-agent-sdk@latest`；close 后延迟几百 ms 再 resume（或等下次消息触发时再 resume，如现有逻辑）。
**Warning signs:** resumeSession 后 agent 不记得之前的对话。

### Pitfall 2: 并发 group 的 ANTHROPIC_API_KEY 环境变量竞争

**What goes wrong:** 多个 group 并发运行时，`process.env` 中的 API key 被覆盖。
**Why it happens:** SDK `env` 选项接受完整的环境变量对象；如果直接修改 `process.env` 而不是通过 `env` 选项传入，会有竞争条件。
**How to avoid:** 始终通过 `options.env` 传入 API key，不要修改全局 `process.env`。
**Warning signs:** 随机出现认证失败，重启后恢复。

### Pitfall 3: TypeScript `await using` 语法导致 session 过早关闭

**What goes wrong:** 用 `await using session = unstable_v2_createSession(...)` 后，session 在函数退出时自动 close，后续 follow-up 的 `session.send()` 报错。
**Why it happens:** TypeScript 5.2+ `await using` 是 explicit resource management，变量作用域结束时自动调用 `[Symbol.asyncDispose]()`。
**How to avoid:** 使用手动 `const session = unstable_v2_createSession(...)`，在明确需要关闭时调用 `session.close()`（例如任务完成后，或 `GroupQueue.shutdown()` 时）。
**Warning signs:** follow-up 消息发送失败，日志中出现 "session already closed" 错误。

### Pitfall 4: stream() 返回后 pendingFollowUps 队列消费时机

**What goes wrong:** stream() 已返回但 follow-up 队列中有消息，未及时发送，导致消息丢失或乱序。
**Why it happens:** `notifyIdle()` 在 stream() 结束前被调用（`result` 消息触发），而队列消费逻辑在 stream() 之后。
**How to avoid:** 在 `runInProcessAgent()` 的 stream 循环结束后、`session.close()` 之前处理队列：先 `send()` 队列中的下一条消息，再进入下一个 stream() 循环。用 `while (pendingFollowUps.length > 0)` 循环处理所有排队消息。
**Warning signs:** WhatsApp 发来的 follow-up 消息没有得到回复，但没有错误日志。

### Pitfall 5: GROUP-02 session 存储路径冲突

**What goes wrong:** SDK 将不同 group 的 session 文件存到同一目录（`~/.claude/projects/...`）。
**Why it happens:** SDK 默认按 cwd 的路径 hash 分组，如果两个 group 有相同的绝对路径前缀可能冲突；另外 `~/.claude/` 对所有用户全局共享。
**How to avoid:** 每个 group 的 createSession/resumeSession 都设置 `env.CLAUDE_HOME = 'data/sessions/{group.folder}'`（绝对路径），确保 session 文件隔离。
**Warning signs:** group A 能看到 group B 的对话历史。

### Pitfall 6: ipc.ts input/ 目录残留导致重复处理

**What goes wrong:** 迁移后 `data/ipc/{group}/input/` 目录还有旧文件，IPC watcher 仍在运行，处理了本不应处理的旧文件。
**Why it happens:** Phase 1 只改变消息传递路径，未删除 IPC watcher（Phase 2 才清理容器层）。
**How to avoid:** 在 `startIpcWatcher()` 中删除 `input/` 目录的扫描逻辑（保留 `messages/` 和 `tasks/`）；`GroupQueue.sendMessage()` 改为内存队列后不再写 `input/` 文件。
**Warning signs:** follow-up 消息被处理两次，WhatsApp 收到重复回复。

---

## Code Examples

### runInProcessAgent() 完整骨架

```typescript
// Source: 基于 https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview
// File: src/agent-runner.ts
import path from 'path';
import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
  type SDKSession,
} from '@anthropic-ai/claude-agent-sdk';
import { MAIN_GROUP_FOLDER, DATA_DIR, GROUPS_DIR } from './config.js';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';

export interface AgentInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
}

export interface AgentOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

export async function runInProcessAgent(
  group: RegisteredGroup,
  input: AgentInput,
  onSession: (session: SDKSession) => void,
  onOutput?: (output: AgentOutput) => Promise<void>,
): Promise<AgentOutput> {
  const secrets = readEnvFile(['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN']);
  const apiKey = secrets.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || '';

  const groupCwd = input.isMain
    ? process.cwd()
    : path.resolve(GROUPS_DIR, group.folder);

  const sessionStorePath = path.resolve(DATA_DIR, 'sessions', group.folder);

  const sessionOptions = {
    model: process.env.CLAUDE_MODEL || 'claude-opus-4-6',
    cwd: groupCwd,
    permissionMode: 'bypassPermissions' as const,
    allowDangerouslySkipPermissions: true,
    settingSources: ['project'] as const,
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: apiKey,
      CLAUDE_HOME: sessionStorePath,
    },
  };

  const session = input.sessionId
    ? unstable_v2_resumeSession(input.sessionId, sessionOptions)
    : unstable_v2_createSession(sessionOptions);

  onSession(session);

  await session.send(input.prompt);

  let capturedSessionId: string | undefined;
  let hadOutput = false;
  let errorSubtype: string | undefined;

  try {
    for await (const msg of session.stream()) {
      capturedSessionId = msg.session_id;

      if (msg.type === 'assistant') {
        const text = msg.message.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join('');
        if (text && onOutput) {
          hadOutput = true;
          await onOutput({ status: 'success', result: text, newSessionId: capturedSessionId });
        }
      }

      if (msg.type === 'result') {
        if (msg.subtype === 'success') {
          if (onOutput) await onOutput({ status: 'success', result: null, newSessionId: capturedSessionId });
        } else {
          errorSubtype = msg.subtype;
          if (onOutput) await onOutput({ status: 'error', result: null, error: msg.subtype });
        }
      }
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error({ group: group.name, error }, 'SDK session error');
    return { status: 'error', result: null, error };
  }

  return {
    status: errorSubtype ? 'error' : 'success',
    result: null,
    newSessionId: capturedSessionId,
    error: errorSubtype,
  };
}
```

### GroupState 改造关键字段

```typescript
// Source: 基于现有 src/group-queue.ts GroupState 接口
import type { SDKSession } from '@anthropic-ai/claude-agent-sdk';

interface GroupState {
  active: boolean;
  idleWaiting: boolean;
  isTaskContainer: boolean;
  pendingMessages: boolean;
  pendingTasks: QueuedTask[];
  session: SDKSession | null;         // 替代 process: ChildProcess | null
  pendingFollowUps: string[];         // 替代 IPC input/ 文件写入
  groupFolder: string | null;
  retryCount: number;
  // 删除: containerName: string | null （无容器名概念）
}
```

### GroupQueue.sendMessage() 新实现

```typescript
// 替代写 data/ipc/{group}/input/*.json 文件的逻辑
sendMessage(groupJid: string, text: string): boolean {
  const state = this.getGroup(groupJid);
  if (!state.active || state.isTaskContainer) return false;
  state.idleWaiting = false;
  state.pendingFollowUps.push(text);  // 内存队列追加
  return true;
}
```

### task-scheduler.ts 接口适配

```typescript
// SchedulerDependencies 中 onProcess 改为 onSession
export interface SchedulerDependencies {
  registeredGroups: () => Record<string, RegisteredGroup>;
  getSessions: () => Record<string, string>;
  queue: GroupQueue;
  onSession: (groupJid: string, session: SDKSession, groupFolder: string) => void; // 替代 onProcess
  sendMessage: (jid: string, text: string) => Promise<void>;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 容器子进程 + stdout sentinel marker 解析 | V2 session `stream()` 直接迭代 SDKMessage | SDK V2 preview（2025 Q4） | 消除整个 IPC 通信层 |
| V1 `query()` async generator + yield 协调多 turn | V2 `send()` + `stream()` 每 turn 独立调用 | SDK V2 preview | 多 turn 逻辑大幅简化 |
| `session.receive()` | `session.stream()` | SDK changelog（已改名） | 保持与 Anthropic SDK 命名一致 |
| 默认加载 filesystem settings | 默认不加载（`settingSources: []`） | SDK v0.1.0 架构改变 | **必须显式设置 `settingSources: ['project']`** 才能读 CLAUDE.md |

**Deprecated/outdated:**
- sentinel marker 解析（`OUTPUT_START_MARKER` / `OUTPUT_END_MARKER`）：V2 stream 消息类型化，不需要自定义协议
- `data/ipc/{group}/input/` 文件写入：V2 `session.send()` 替代
- `CONTAINER_RUNTIME_BIN`、`docker run` 参数：Phase 1 不再需要（Phase 2 删除）

---

## Open Questions

1. **`CLAUDE_HOME` 是否为 SDK 公开支持的 env 变量？**
   - What we know: SDK 内部使用类似机制重定向 session 存储；`SDKSystemMessage` 的 `cwd` 字段表明 SDK 感知 cwd；官方文档未明确列出 `CLAUDE_HOME`
   - What's unclear: 是否存在更稳定的 `sessionStoragePath` 选项，或者是否应该依赖 SDK 在 cwd 下自动创建 `.claude/` 目录
   - Recommendation: 先测试 SDK 默认行为（session 文件存在哪里），如果默认已按 cwd 隔离则不需要 `CLAUDE_HOME`；如不满足则查阅最新 SDK changelog 寻找官方选项

2. **V2 session 关闭时机：GroupQueue shutdown 如何处理活跃 session？**
   - What we know: `session.close()` 终止底层子进程；现有 `shutdown()` 故意不杀容器（让它们自然结束）
   - What's unclear: in-process session 关闭是否安全（不丢失 session 数据）？是否需要等待 stream() 完成？
   - Recommendation: `GroupQueue.shutdown()` 中对所有活跃 session 调用 `session.close()`（与容器处理对称），但可以不等待 stream() 完成——session 数据在每个 turn 的 stream() 结束时已持久化

3. **`allowedTools` 应设置什么？**
   - What we know: 容器内 agent 有完整工具集（Read/Write/Edit/Bash 等）；`allowedTools: ['Bash', 'Read', ...]` 明确白名单；不设则全部可用
   - What's unclear: 现有 container 中有哪些工具？MCP tools 是否需要在 SDK 中显式配置？
   - Recommendation: 暂不限制（不设 `allowedTools`），与容器模式保持行为等价；后续可按需收紧

---

## Sources

### Primary (HIGH confidence)
- [platform.claude.com/docs/en/agent-sdk/typescript-v2-preview](https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview) — V2 API 完整文档：createSession、resumeSession、send、stream、session_id 提取、cleanup 模式
- [platform.claude.com/docs/en/agent-sdk/typescript](https://platform.claude.com/docs/en/agent-sdk/typescript) — V1 Options 完整类型：cwd、permissionMode、settingSources、allowedTools、env、allowDangerouslySkipPermissions、SDKMessage 所有类型

### Secondary (MEDIUM confidence)
- WebSearch 结果：SDK 版本号 0.1.58、`CLAUDE_HOME` 环境变量行为、`session.receive()` → `session.stream()` 重命名、`session.close()` bug 修复（verified via官方 changelog mentions）
- [WebSearch：SDK settingSources + CLAUDE.md 加载](https://platform.claude.com/docs/en/agent-sdk/typescript) — 多来源交叉验证

### Tertiary (LOW confidence)
- `CLAUDE_HOME` env 变量作为 session 存储重定向机制 — 仅 WebSearch 结果提及，未在官方文档中明确确认；需在实现时验证

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — SDK 版本和安装命令经 npmjs 和官方文档确认
- Architecture: HIGH — V2 API 模式直接来自官方文档代码示例
- Pitfalls: MEDIUM — 多数来自 SDK changelog 和多个 WebSearch 来源交叉验证；`CLAUDE_HOME` 相关坑为 LOW

**Research date:** 2026-03-03
**Valid until:** 2026-04-03（SDK V2 仍标记为 unstable preview，7天内可能有 API 变更；建议实现前再次确认 stream() 方法名）
