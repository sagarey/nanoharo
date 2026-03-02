# Architecture

**Analysis Date:** 2026-03-03

## Pattern Overview

**Overall:** Event-driven Orchestrator with Isolated Container Sandboxing.

**Key Characteristics:**
- **Asynchronous Processing:** Central message loop polls for new messages and dispatches them to a queue.
- **Strict Isolation:** Every chat group or user interaction runs in its own isolated Linux container with restricted filesystem mounts.
- **IPC-based Communication:** Interaction between the host orchestrator and agent containers happens via a per-group IPC (Inter-Process Communication) directory.
- **Stateful but Decoupled:** SQLite handles persistent state (messages, tasks, session IDs), while containers handle ephemeral execution.

## Layers

**Channel Layer:**
- Purpose: Connects to external platforms (WhatsApp, etc.) to receive and send messages.
- Location: `src/channels/`
- Contains: WhatsApp client implementation using Baileys.
- Depends on: `src/types.ts`, `src/db.ts`
- Used by: `src/index.ts`

**Orchestration Layer:**
- Purpose: Coordinates message routing, task scheduling, and state persistence.
- Location: `src/index.ts`, `src/router.ts`, `src/task-scheduler.ts`
- Contains: Main loop, state loading/saving, and task coordination.
- Depends on: `src/db.ts`, `src/container-runner.ts`, `src/group-queue.ts`
- Used by: Node.js runtime (entry point).

**Persistence Layer:**
- Purpose: Manages SQLite database operations for messages, tasks, and sessions.
- Location: `src/db.ts`
- Contains: SQL queries and database initialization logic.
- Depends on: `src/config.ts`, `src/types.ts`
- Used by: Orchestration layer and Channel layer.

**Sandbox Layer:**
- Purpose: Manages the lifecycle and security of agent containers.
- Location: `src/container-runner.ts`, `src/container-runtime.ts`
- Contains: Container spawning logic, volume mount configuration, and execution monitoring.
- Depends on: `src/config.ts`, `src/mount-security.ts`
- Used by: `src/group-queue.ts`

## Data Flow

**Inbound Message Flow:**

1. `WhatsAppChannel` receives a message via Baileys and calls `storeMessage` in `src/db.ts`.
2. `startMessageLoop` in `src/index.ts` polls for new messages from SQLite.
3. If a message matches a trigger or is in the "main" group, it's enqueued via `GroupQueue.enqueueMessageCheck`.
4. `GroupQueue` triggers `runContainerAgent` in `src/container-runner.ts`.
5. `runContainerAgent` spawns a container and pipes the message/context via stdin.

**Outbound Message Flow:**

1. The agent in the container writes JSON output to stdout with sentinel markers.
2. `src/container-runner.ts` parses the output and invokes a callback.
3. `src/index.ts` receives the output and calls `channel.sendMessage` via the router.
4. If the agent is still active, subsequent messages are piped into the container's IPC `input/` directory monitored by the agent.

**State Management:**
- **Persistent:** SQLite (`messages.db`) stores chat history, task schedules, and group registrations.
- **Ephemeral:** `GroupQueue` maintains in-memory status of active containers and concurrency.
- **Session:** `sessions` table in SQLite maps group folders to Claude Code session IDs for continuity.

## Key Abstractions

**Channel:**
- Purpose: Abstract interface for messaging platforms.
- Examples: `src/channels/whatsapp.ts`
- Pattern: Strategy Pattern for multi-platform support.

**GroupQueue:**
- Purpose: Manages container concurrency and task prioritization.
- Examples: `src/group-queue.ts`
- Pattern: Producer-Consumer Queue with concurrency limiting.

**ContainerRunner:**
- Purpose: High-level API for running agent code in a sandbox.
- Examples: `src/container-runner.ts`
- Pattern: Bridge between Node.js logic and Docker/Orbstack runtime.

## Entry Points

**Orchestrator Main:**
- Location: `src/index.ts`
- Triggers: CLI execution (`npm run dev`).
- Responsibilities: Initializes DB, starts channels, triggers message loop, and starts the scheduler.

**Task Scheduler:**
- Location: `src/task-scheduler.ts`
- Triggers: Interval loop started in `main()`.
- Responsibilities: Polls for due tasks and enqueues them for execution.

**IPC Watcher:**
- Location: `src/ipc.ts`
- Triggers: Interval loop polling the `data/ipc/` directory.
- Responsibilities: Handles out-of-band requests from agents (sending cross-group messages, scheduling tasks).

## Error Handling

**Strategy:** Fail-safe isolation with cursor rollback for message processing.

**Patterns:**
- **Backoff Retries:** `GroupQueue` implements exponential backoff for failed container starts.
- **Cursor Rollback:** If an agent fails before sending output, the "last processed" timestamp for that group is rolled back to ensure the message is re-processed.
- **Log Isolation:** Each container run captures logs to `groups/{name}/logs/container-{timestamp}.log`.

## Cross-Cutting Concerns

**Logging:** Uses `pino` logger (`src/logger.ts`) for structured host logging; per-container logs are written to disk.
**Validation:** `src/group-folder.ts` and `src/mount-security.ts` ensure paths and mounts are safe.
**Authentication:** Handled per-channel (e.g., `whatsapp-auth.ts` for Baileys).

---

*Architecture analysis: 2026-03-03*
