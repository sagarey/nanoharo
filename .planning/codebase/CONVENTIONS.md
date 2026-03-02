# Coding Conventions

**Analysis Date:** 2026-03-03

## Naming Patterns

**Files:**
- kebab-case for filenames: `container-runner.ts`, `task-scheduler.ts`, `whatsapp-auth.ts`.
- `.test.ts` suffix for test files: `db.test.ts`.

**Functions:**
- camelCase for function names: `processGroupMessages`, `runContainerAgent`, `getNewMessages`.
- Prefix underscore for internal/test-only exports: `_setRegisteredGroups`, `_initTestDatabase`.

**Variables:**
- camelCase for variables and parameters: `sinceTimestamp`, `isMainGroup`, `chatJid`.
- SCREAMING_SNAKE_CASE for constants: `ASSISTANT_NAME`, `TRIGGER_PATTERN`, `POLL_INTERVAL`.

**Types:**
- PascalCase for interfaces and types: `Channel`, `NewMessage`, `RegisteredGroup`, `ContainerOutput`.
- Interface properties often use snake_case when matching database schema or external API: `chat_jid`, `sender_name`, `is_bot_message`.

## Code Style

**Formatting:**
- Prettier is used for formatting.
- Settings: `printWidth: 80`, `semi: true`, `singleQuote: true`, `trailingComma: 'all'`.
- Command: `npm run format`.

**Linting:**
- Not explicitly detected in `package.json` aside from `typecheck`.
- TypeScript is used for type safety: `tsc --noEmit`.

## Import Organization

**Order:**
1. Built-in Node.js modules (`fs`, `path`).
2. Third-party dependencies (`pino`, `vitest`).
3. Local project modules (`./config.js`, `./db.js`).

**Path Aliases:**
- Not detected. Relative paths with `.js` extensions (for ESM compatibility) are used: `import { ... } from './db.js'`.

## Error Handling

**Patterns:**
- Try-catch blocks around critical operations: `loadState`, `processGroupMessages`, `runAgent`.
- Logging errors with context using Pino: `logger.error({ group: group.name, err }, 'Agent error')`.
- Graceful degradation: Rolling back message cursors on agent failure.
- Global handlers for `uncaughtException` and `unhandledRejection` in `src/logger.ts`.

## Logging

**Framework:**
- Pino with `pino-pretty` for development. `src/logger.ts`.

**Patterns:**
- Object-first logging for structured data: `logger.info({ count: messages.length }, 'New messages')`.
- Different levels: `info` for flow, `debug` for triggers/polling, `warn` for non-critical issues, `error`/`fatal` for failures.

## Comments

**When to Comment:**
- JSDoc-style comments for exported functions and complex logic: `/** @internal - exported for testing */`.
- Single-line comments for logical sections or recovery steps: `// Graceful shutdown handlers`.

## Function Design

**Size:**
- Moderate. Orchestration functions in `src/index.ts` can reach 50-100 lines but are usually broken down by responsibility.

**Parameters:**
- Uses object destructuring for complex configurations: `startSchedulerLoop({...})`.

**Return Values:**
- Explicit return types are common: `Promise<boolean>`, `void`, `ContainerOutput`.

## Module Design

**Exports:**
- Named exports are preferred over default exports.
- Use of re-exports for public APIs: `export { escapeXml, formatMessages } from './router.js'`.

**Barrel Files:**
- Not used extensively; direct imports are preferred.

---

*Convention analysis: 2026-03-03*
