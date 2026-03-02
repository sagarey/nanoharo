# Codebase Structure

**Analysis Date:** 2026-03-03

## Directory Layout

```
nanoharo/
├── assets/             # Static assets
├── config-examples/    # Template configurations
├── container/          # Agent runtime environment
│   ├── agent-runner/   # Node.js source for the agent process
│   ├── skills/         # Shared agent skill descriptions (.md)
│   ├── build.sh        # Rebuild script for container image
│   └── Dockerfile      # Container definition
├── docs/               # Architecture and requirements documentation
├── launchd/            # macOS service management (plist)
├── repo-tokens/        # Storage for repo-specific auth
├── scripts/            # Build and utility scripts
├── setup/              # Installation scripts (e.g., node_modules setup)
├── skills-engine/      # (Internal) Shared skills or logic
├── src/                # Host application source code (TypeScript)
│   ├── channels/       # Messaging channel implementations
│   ├── web/            # (Experimental/Internal) Web-based interfaces
│   └── index.ts        # Orchestrator entry point
├── groups/             # Group-specific memory (ignored by git, resolves via group-folder.ts)
└── data/               # Persistent database, IPC, and sessions (ignored by git)
```

## Directory Purposes

**`src/`:**
- Purpose: Primary source code for the NanoHaro host orchestrator.
- Contains: Business logic, database operations, container management, and messaging integrations.
- Key files: `src/index.ts`, `src/db.ts`, `src/container-runner.ts`, `src/config.ts`.

**`src/channels/`:**
- Purpose: Abstracted messaging providers.
- Contains: Connectivity and protocol logic for specific platforms.
- Key files: `src/channels/whatsapp.ts`.

**`container/`:**
- Purpose: The "Brain" execution environment.
- Contains: Everything packaged into the Docker/Linux VM container.
- Key files: `container/agent-runner/src/index.ts` (agent-side entry point).

**`docs/`:**
- Purpose: System documentation and requirements.
- Contains: High-level design decisions and setup guides.
- Key files: `docs/REQUIREMENTS.md`.

## Key File Locations

**Entry Points:**
- `src/index.ts`: The host application starting point.
- `container/agent-runner/src/index.ts`: The agent application starting point inside the container.

**Configuration:**
- `src/config.ts`: Global application constants, trigger patterns, and interval settings.
- `package.json`: Dependency and script definitions.

**Core Logic:**
- `src/container-runner.ts`: Bridging host logic to containerized execution.
- `src/db.ts`: SQL schema and data access layer.
- `src/group-queue.ts`: Concurrency and task management.

**Testing:**
- `src/*.test.ts`: Vitest unit and integration tests (co-located with source).
- `vitest.config.ts`: Test framework configuration.

## Naming Conventions

**Files:**
- Kebab-case: `container-runner.ts`, `group-queue.ts`.
- Sub-component folders: `channels/`, `web/`.
- Test suffix: `[name].test.ts`.

**Directories:**
- Kebab-case or single word: `config-examples`, `container`, `src`.

## Where to Add New Code

**New Feature (Messaging Platform):**
- Implementation: `src/channels/new-platform.ts` (must implement `Channel` interface).
- Registration: Instantiate and add to `channels` array in `src/index.ts`.

**New Agent Skill:**
- Description: `container/skills/new-skill.md`. These are automatically synced to the container memory.

**New Logic / Shared Helper:**
- Common logic: `src/` (if used by host).
- Agent-side logic: `container/agent-runner/src/`.

**Utilities:**
- Helper functions: `src/router.ts` (for formatting) or new utility files in `src/`.

## Special Directories

**`data/` (Home-relative or local):**
- Purpose: Contains SQLite database (`messages.db`), IPC namespaces (`ipc/`), and Claude session caches (`sessions/`).
- Generated: Yes (at runtime).
- Committed: No.

**`groups/`:**
- Purpose: Per-chat persistent memory (contains `CLAUDE.md` for each group).
- Generated: On group registration.
- Committed: No.

**`.planning/codebase/`:**
- Purpose: GSD analysis and architecture documentation (this file).

---

*Structure analysis: 2026-03-03*
