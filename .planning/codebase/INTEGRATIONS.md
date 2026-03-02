# External Integrations

**Analysis Date:** 2026-03-03

## APIs & External Services

**AI Services:**
- Anthropic Claude API - Powered via Claude Agent SDK.
  - SDK/Client: Integrated within the containerized agent runner.
  - Auth: `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN` (passed to containers via stdin).

**Messaging:**
- WhatsApp - Main user interface.
  - SDK/Client: `@whiskeysockets/baileys`
  - Auth: Multi-file auth state stored in `store/auth/`.

## Data Storage

**Databases:**
- SQLite (Local)
  - Connection: `store/messages.db`
  - Client: `better-sqlite3`

**File Storage:**
- Local filesystem for:
  - Persistent group data: `groups/{name}/`
  - Session state: `data/sessions/`
  - Authentication keys: `store/auth/`

**Caching:**
- Local memory for LID to Phone JID mapping in WhatsApp channel (`src/channels/whatsapp.ts`).

## Authentication & Identity

**Auth Provider:**
- WhatsApp QR-based Pairing - Custom implementation using Baileys.
  - Implementation: `src/whatsapp-auth.ts` and `src/channels/whatsapp.ts`.

## Monitoring & Observability

**Error Tracking:**
- None (Local logging only).

**Logs:**
- Pino logger writing to stdout/stderr.
- Container execution logs stored in `groups/{name}/logs/container-[timestamp].log`.

## CI/CD & Deployment

**Hosting:**
- Local Machine / Private Server (macOS or Linux).

**CI Pipeline:**
- None detected (Local git hooks via Husky).

## Environment Configuration

**Required env vars:**
- `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`: For Claude Agent SDK.
- `ASSISTANT_NAME`: Trigger name for the bot.

**Secrets location:**
- `.env` file in project root (not committed).
- Multi-file auth credentials in `store/auth/`.

## Webhooks & Callbacks

**Incoming:**
- WhatsApp socket events (Baileys long polling/websockets).
- IPC watcher for subagent/tool requests in `src/ipc.ts`.

**Outgoing:**
- None (Direct socket communication).

---

*Integration audit: 2026-03-03*
