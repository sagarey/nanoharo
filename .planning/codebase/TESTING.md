# Testing Patterns

**Analysis Date:** 2026-03-03

## Test Framework

**Runner:**
- Vitest ^4.0.18
- Config: `vitest.config.ts` (implied by `package.json` scripts)

**Assertion Library:**
- Included in Vitest (`expect`).

**Run Commands:**
```bash
npm run test           # Run all tests once
npm run test:watch     # Run vitest in watch mode
```

## Test File Organization

**Location:**
- Co-located with source files in `src/`.

**Naming:**
- `*.test.ts` - e.g., `src/db.test.ts`.

**Structure:**
```
src/
├── module.ts
└── module.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, it, expect } from 'vitest';

describe('moduleName', () => {
  describe('functionName', () => {
    it('does something expected', () => {
      // test logic
    });
  });
});
```

**Patterns:**
- `beforeEach` is used for environment setup, particularly for database isolation.
- `describe` blocks are nested by function name or feature area.

## Mocking

**Framework:**
- Vitest's built-in mocking capabilities.
- Manual mock helpers/factories are common.

**Patterns:**
```typescript
// Example from db.test.ts
function store(overrides: Partial<NewMessage>) {
  storeMessage({
    id: 'msg-1',
    // ... defaults
    ...overrides,
  });
}
```

**What to Mock:**
- Database state (using in-memory SQLite initialization).
- Time-based values or external JIDs.
- Internal private state via `_` prefixed exports for testing.

## Fixtures and Factories

**Test Data:**
```typescript
function makeMsg(overrides: Partial<NewMessage> = {}): NewMessage {
  return {
    id: '1',
    chat_jid: 'group@g.us',
    sender: '123@s.whatsapp.net',
    sender_name: 'Alice',
    content: 'hello',
    timestamp: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}
```

**Location:**
- Usually defined as local helpers within the test file itself.

## Coverage

**Requirements:**
- Not explicitly enforced but `@vitest/coverage-v8` is installed.

**View Coverage:**
```bash
npx vitest run --coverage
```

## Test Types

**Unit Tests:**
- Heavy focus on pure logic: `src/formatting.test.ts`, `src/routing.test.ts`.
- Tests for XML escaping, regex matching (triggers), and string manipulation.

**Integration Tests:**
- Database operations: `src/db.test.ts` using a test-specific DB initialization (`_initTestDatabase`).
- Process orchestration: `src/container-runner.test.ts`, `src/group-queue.test.ts`.

## Common Patterns

**Async Testing:**
```typescript
it('handles async operation', async () => {
  const result = await someAsyncFn();
  expect(result).toBe(true);
});
```

**Error Testing:**
- Identifying edge cases like corrupted state parsing or missing channels.

---

*Testing analysis: 2026-03-03*
