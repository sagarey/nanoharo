---
phase: 03-single-image-deployment
verified: 2026-03-03T03:54:22Z
status: approved
human_approved: 2026-03-03
score: 4/5 must-haves verified
re_verification: false
human_verification:
  - test: "docker run with --env-file .env and bind mounts starts service successfully"
    expected: "Service logs show WhatsApp connection attempt using valid credentials from store/auth/creds.json, no crash or module errors"
    why_human: "Full end-to-end startup requires valid WhatsApp auth credentials (store/auth/creds.json) which cannot be verified in CI. Requires human with real auth state."
  - test: "docker run 启动后服务正常接收 WhatsApp 消息并通过 SDK 回复 (ROADMAP SC2)"
    expected: "A WhatsApp message triggers the SDK query() and a reply is sent back"
    why_human: "Requires live WhatsApp connection with authenticated session. Cannot be tested programmatically."
---

# Phase 3: Single-Image Deployment Verification Report

**Phase Goal:** 整个 NanoHaro 服务打包为一个 Docker 镜像，可直接 `docker run` 启动
**Verified:** 2026-03-03T03:54:22Z
**Status:** human_needed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | `docker build -t nanoharo:latest .` 完成且无错误 | VERIFIED | `docker images nanoharo` shows `nanoharo:latest 526MB` created 2026-03-03 |
| 2 | better-sqlite3 native module 在 runner stage 正常加载（无 ELF header 错误） | VERIFIED | `docker run --rm nanoharo:latest node -e "require('/app/node_modules/better-sqlite3/build/Release/better_sqlite3.node')"` outputs `sqlite3 OK` |
| 3 | 服务通过 --env-file .env 读取 ANTHROPIC_API_KEY 等环境变量 | VERIFIED | `docker run --rm -e ANTHROPIC_API_KEY=sk-ant-test123 nanoharo:latest node -e '...'` outputs `API_KEY present: true` |
| 4 | store/、data/、groups/ 三个持久化目录通过 bind mount 正确挂载，容器重启后数据保留 | PARTIAL (human needed) | Directories created in image (`/app/store`, `/app/data/sessions`, `/app/groups/main`), bind mount commands documented in PLAN/SUMMARY. Full bind mount with data persistence requires runtime test. |
| 5 | node dist/index.js 在 runner stage 中以非 root user 运行 | VERIFIED | Container runs as `uid=1000(node) gid=1000(node)`; service startup log shows successful DB init, state load, WA connection attempt — confirming non-root execution works |

**Score:** 4/5 truths verified (1 needs human)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `Dockerfile` | 多阶段 Docker 构建定义（builder + runner） | VERIFIED | File exists, 57 lines, contains `FROM node:20-slim AS builder` (line 2) and `FROM node:20-slim AS runner` (line 32) |
| `.dockerignore` | 排除 node_modules、dist、.env、store/、data/ 等不必要文件 | VERIFIED | File exists, 45 lines, excludes `node_modules/` (line 2), `.env` (line 11), `store/` (line 15), `data/` (line 16) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Dockerfile builder stage | better_sqlite3.node | `npm ci --omit=dev` in container | WIRED | Line 28: `RUN npm ci --omit=dev`; confirmed by `sqlite3 OK` runtime test |
| Dockerfile runner stage | dist/index.js | `COPY --from=builder /app/dist ./dist` then `CMD node dist/index.js` | WIRED | Lines 41-42: `COPY --from=builder /app/node_modules ./node_modules` and `COPY --from=builder /app/dist ./dist`; CMD on line 57: `["node", "dist/index.js"]` |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DEPLOY-01 | 03-01-PLAN.md | 主 Dockerfile 构建整个 NanoHaro 服务（含 SDK 依赖，不含嵌套容器运行时） | SATISFIED | Dockerfile exists with two-stage build; `nanoharo:latest` image built at 526MB; better-sqlite3 native module loads; service starts successfully in non-root mode |

**Orphaned requirements check:** REQUIREMENTS.md maps only DEPLOY-01 to Phase 3. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| - | - | None found | - | - |

No TODOs, FIXMEs, placeholders, empty implementations, or stub patterns detected in `Dockerfile` or `.dockerignore`.

### Human Verification Required

#### 1. Bind Mount Persistence Test

**Test:** Run the full docker command with bind mounts pointing to real host directories:
```bash
docker run -d \
  --name nanoharo-test \
  --env-file .env \
  -v "$(pwd)/store:/app/store" \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/groups:/app/groups" \
  nanoharo:latest
```
Stop the container, restart it, and verify data written in the first run is still accessible.

**Expected:** Data written to `store/`, `data/`, and `groups/` persists across container restarts because it is stored on the host filesystem via bind mount.

**Why human:** Requires actual host directories with writable data and container stop/start cycle. Cannot verify data persistence programmatically in this context.

#### 2. Full Service Startup with WhatsApp Auth (ROADMAP Success Criterion 2)

**Test:** With valid `store/auth/creds.json` (from prior WhatsApp authentication), run:
```bash
docker run --rm \
  --env-file .env \
  -v "$(pwd)/store:/app/store" \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/groups:/app/groups" \
  nanoharo:latest
```

**Expected:** Service logs show "connected to WA" with authenticated session, no "not logged in, attempting registration..." message. Service becomes ready to receive and process messages.

**Why human:** Requires live WhatsApp credentials. Cannot be verified without real auth state. Automated test showed service starts correctly and reaches WA connection phase, but cannot proceed past auth without credentials.

### Gaps Summary

No blocking gaps. All automated checks pass:

- `nanoharo:latest` image exists at 526MB (built 2026-03-03)
- `Dockerfile` is substantive: two-stage build with builder (node:20-slim + build-essential for native module compilation) and runner (node:20-slim with production artifacts only)
- `.dockerignore` correctly excludes all secrets, source files, and dev tooling
- `better-sqlite3` native module loads without ELF errors inside the container
- Service starts, initializes DB, loads state, and connects to WhatsApp infrastructure (auth aside)
- Container runs as non-root `node` user (UID 1000)
- `dist/index.js` present and executed by CMD
- No `.env` or `src/` directory inside the image
- Environment variable injection confirmed working via `-e` flag
- Commit `f1d18f7` verified in git log

Two items require human verification: bind mount persistence across restarts, and full service operation with live WhatsApp auth. These are runtime behaviors that cannot be tested programmatically.

---

_Verified: 2026-03-03T03:54:22Z_
_Verifier: Claude (gsd-verifier)_
