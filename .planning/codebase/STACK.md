# Technology Stack

**Analysis Date:** 2026-03-03

## Languages

**Primary:**
- TypeScript 5.7.0 - Core application logic, agents orchstration, and WhatsApp channel implementation in `src/`.

**Secondary:**
- Shell (Bash) - Build scripts and container entrypoints in `container/build.sh`.
- Markdown - Documentation and Claude "skills" (instructions) in `docs/` and `container/skills/`.

## Runtime

**Environment:**
- Node.js >= 20
- Docker/Podman - Used for running agent containers.

**Package Manager:**
- npm 10.x (implied)
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core:**
- Claude Agent SDK - Implicitly used within agent containers (referenced in `src/container-runner.ts`).
- @whiskeysockets/baileys ^7.0.0-rc.9 - WhatsApp Web API implementation.

**Testing:**
- Vitest ^4.0.18 - Unit and integration testing.

**Build/Dev:**
- tsx ^4.19.0 - TypeScript execution for development and setup scripts.
- Prettier ^3.8.1 - Code formatting.
- Husky ^9.1.7 - Git hooks.

## Key Dependencies

**Critical:**
- `better-sqlite3` ^11.8.1 - High-performance SQLite driver for local state and message persistence.
- `@whiskeysockets/baileys` - The backbone of the WhatsApp integration.
- `zod` ^4.3.6 - Schema validation for configuration and IPC.

**Infrastructure:**
- `pino` ^9.6.0 - High-performance logging.
- `cron-parser` ^5.5.0 - Parsing cron expressions for scheduled tasks.
- `yaml` ^2.8.2 - Configuration parsing.
- `qrcode` / `qrcode-terminal` - Generating WhatsApp authentication QR codes.

## Configuration

**Environment:**
- `.env` file - Stores application configuration (e.g., `ASSISTANT_NAME`, `ANTHROPIC_API_KEY`).
- `src/env.ts` and `src/config.ts` - Logic for reading and defaulting environment variables.

**Build:**
- `tsconfig.json` - TypeScript compiler configuration.
- `package.json` - Task runner and dependency definitions.

## Platform Requirements

**Development:**
- macOS or Linux (required for container support and shell scripts).
- Docker or Podman installed and running.

**Production:**
- Managed via `launchd` (macOS) or `systemd` (Linux).
- Requires persistent storage for SQLite database and WhatsApp session keys in `/Users/levi/Projects/nanoharo/store/`.

---

*Stack analysis: 2026-03-03*
