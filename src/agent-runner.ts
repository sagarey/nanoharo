/**
 * In-process Agent Runner for NanoHaro
 *
 * Replaces container-based runContainerAgent() with a direct SDK V2 session call.
 * Uses unstable_v2_createSession / unstable_v2_resumeSession to run Claude in the
 * main process, eliminating the container IPC layer.
 *
 * Interface is intentionally aligned with ContainerInput/ContainerOutput so that
 * index.ts and task-scheduler.ts require minimal changes.
 */
import fs from 'fs';
import path from 'path';

import {
  unstable_v2_createSession,
  unstable_v2_resumeSession,
  type SDKSession,
  type SDKSessionOptions,
} from '@anthropic-ai/claude-agent-sdk';

import { DATA_DIR, GROUPS_DIR, MAIN_GROUP_FOLDER } from './config.js';
import { readEnvFile } from './env.js';
import { resolveGroupIpcPath } from './group-folder.js';
import { logger } from './logger.js';
import { type RegisteredGroup } from './types.js';

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

/**
 * Extended session options type that includes fields present at runtime but
 * not yet reflected in SDKSessionOptions (SDK v0.2.x — V2 is still @alpha).
 * These correspond to Options fields used by V1 query() which the underlying
 * Claude Code CLI also accepts.
 */
type ExtendedSessionOptions = SDKSessionOptions & {
  cwd?: string;
  allowDangerouslySkipPermissions?: boolean;
  settingSources?: ('user' | 'project' | 'local')[];
};

/**
 * Run Claude in-process using the V2 session API.
 *
 * @param group           The registered group this session belongs to.
 * @param input           Message and session parameters.
 * @param onSession       Called immediately after the session is created, before
 *                        send(). Lets the caller store the session handle for
 *                        follow-up turns (GroupQueue.GroupState.session).
 * @param onOutput        Called for each output event (assistant text chunks and
 *                        result/idle signals). Optional — callers that only want
 *                        the final return value can omit it.
 * @returns               Final AgentOutput: status, newSessionId (from stream),
 *                        and any error subtype.
 */
export async function runInProcessAgent(
  group: RegisteredGroup,
  input: AgentInput,
  onSession: (session: SDKSession) => void,
  onOutput?: (output: AgentOutput) => Promise<void>,
): Promise<AgentOutput> {
  // Read API key from .env — never modify process.env to avoid concurrent
  // group race conditions (Pitfall 2 from RESEARCH.md).
  const secrets = readEnvFile(['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN']);
  const apiKey =
    secrets.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? '';

  // cwd rule: main group uses project root, all other groups use their folder.
  // This mirrors the container mount layout (container-runner.ts):
  //   - main  → /workspace/project (project root)
  //   - other → /workspace/group   (groups/{folder})
  const groupCwd = input.isMain
    ? process.cwd()
    : path.resolve(GROUPS_DIR, group.folder);

  // CLAUDE_HOME redirects session file storage away from ~/.claude/projects/
  // so each group keeps its sessions isolated under data/sessions/{folder}/.
  // (See RESEARCH.md Pitfall 5 and GROUP-02 requirement.)
  const sessionStorePath = path.resolve(DATA_DIR, 'sessions', group.folder);

  const sessionOptions: ExtendedSessionOptions = {
    model: process.env.CLAUDE_MODEL ?? 'claude-opus-4-6',
    cwd: groupCwd,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    // Load CLAUDE.md from the session cwd (group memory). Without this, the
    // SDK runs in isolation mode and ignores all filesystem settings.
    settingSources: ['project'],
    env: {
      ...process.env,
      ANTHROPIC_API_KEY: apiKey,
      // Redirect session persistence to per-group directory.
      CLAUDE_HOME: sessionStorePath,
    },
  };

  // Create or resume session — never use `await using` here!
  // `await using` calls [Symbol.asyncDispose]() on scope exit, closing the
  // session before follow-up turns can be sent. (RESEARCH.md Pitfall 3)
  const session = input.sessionId
    ? unstable_v2_resumeSession(input.sessionId, sessionOptions)
    : unstable_v2_createSession(sessionOptions);

  // Hand the session handle to the caller before we send, so GroupQueue can
  // store it and use it for follow-up messages while this turn is running.
  onSession(session);

  await session.send(input.prompt);

  let capturedSessionId: string | undefined;
  let errorSubtype: string | undefined;

  try {
    for await (const msg of session.stream()) {
      // Every SDKMessage carries session_id — capture it so we can persist
      // the session to SQLite after the turn completes (see GROUP-02 req).
      capturedSessionId = msg.session_id;

      if (msg.type === 'assistant') {
        // Extract all text content blocks and concatenate them.
        // msg.message is a BetaMessage whose content is an array of blocks.
        const text = (
          msg.message.content as Array<{ type: string; text?: string }>
        )
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join('');

        if (text && onOutput) {
          await onOutput({
            status: 'success',
            result: text,
            newSessionId: capturedSessionId,
          });
        }
      }

      if (msg.type === 'result') {
        if (msg.subtype === 'success') {
          // Idle signal: turn is complete, no further output for this send().
          if (onOutput) {
            await onOutput({
              status: 'success',
              result: null,
              newSessionId: capturedSessionId,
            });
          }
        } else {
          // Error subtypes: 'error_during_execution' | 'error_max_turns' |
          //                 'error_max_budget_usd' | 'error_max_structured_output_retries'
          errorSubtype = msg.subtype;
          if (onOutput) {
            await onOutput({
              status: 'error',
              result: null,
              error: msg.subtype,
            });
          }
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

// Re-export SDKSession type so callers can import it from a single location
// without depending directly on @anthropic-ai/claude-agent-sdk.
export type { SDKSession };

// Export MAIN_GROUP_FOLDER for convenience (callers checking isMain logic).
export { MAIN_GROUP_FOLDER };

// --- Snapshot helpers (migrated from container-runner.ts) ---

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
  _registeredJids: Set<string>,
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
