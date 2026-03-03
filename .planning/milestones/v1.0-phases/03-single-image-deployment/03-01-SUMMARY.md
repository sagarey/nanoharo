---
phase: 03-single-image-deployment
plan: "01"
subsystem: infra
tags: [docker, multi-stage-build, better-sqlite3, native-module, node20-slim]

# Dependency graph
requires:
  - phase: 02-container-layer-removal
    provides: 纯进程内 agent runner，无容器依赖的 src/ 代码库
provides:
  - Dockerfile（两阶段 multi-stage build，builder + runner）
  - .dockerignore（排除 secrets、源码、dev 工具）
  - nanoharo:latest 镜像（526MB，可用 docker run 一键部署）
affects: [deployment, ops, future-hosting-phases]

# Tech tracking
tech-stack:
  added: [docker multi-stage build, node:20-slim]
  patterns:
    - "两阶段构建：builder stage 用 build-essential 编译 native module，runner stage 只复制产物"
    - "better-sqlite3 必须在与 runner 相同 OS/libc 环境中编译（容器内 npm ci --omit=dev）"
    - "非 root user（node）运行服务，chown -R node:node /app"
    - "持久化数据通过 bind mount 挂载（store/、data/、groups/），不打入镜像"
    - "secrets 通过 --env-file .env 注入，.env 绝对不进镜像（.dockerignore 排除）"

key-files:
  created:
    - Dockerfile
    - .dockerignore
  modified: []

key-decisions:
  - "node:20-slim 作为 base image——最小 glibc 环境，足够运行 better-sqlite3（静态链接 SQLite）和 node"
  - "builder stage 不设 NODE_ENV=production，明确用 --omit=dev 控制，避免 npm ci 行为差异"
  - "runner stage 不添加 EXPOSE（服务无 HTTP 端口）和 HEALTHCHECK（WhatsApp 连接状态难以 HTTP 检测）"
  - "*.md 在 .dockerignore 全量排除，CLAUDE.md/README.md 等均不进镜像"
  - "groups/main 目录在 runner stage 预创建占位，bind mount 会覆盖但容器启动不报错"

patterns-established:
  - "Pattern: 多阶段构建分离编译环境和运行环境，native module 在 builder 内编译后 COPY 到 runner"
  - "Pattern: chown -R node:node + USER node 保证非 root 运行"

requirements-completed: [DEPLOY-01]

# Metrics
duration: 18min
completed: "2026-03-03"
---

# Phase 3 Plan 01: Single Image Deployment Summary

**node:20-slim 两阶段 Dockerfile，在 builder stage 编译 better-sqlite3 native module 后 COPY 到 runner，nanoharo:latest 镜像 526MB 可通过单条 docker run 部署**

## Performance

- **Duration:** ~18 min（含 docker build 时间）
- **Started:** 2026-03-03T03:30:00Z
- **Completed:** 2026-03-03T03:48:00Z
- **Tasks:** 2（Task 1: 创建文件并构建，Task 2: 验证镜像运行 checkpoint）
- **Files modified:** 2（Dockerfile, .dockerignore）

## Accomplishments

- 创建两阶段 Dockerfile：builder stage 用 build-essential 在容器内编译 better-sqlite3 native module，runner stage 基于 node:20-slim 只含生产产物
- 创建 .dockerignore，排除 node_modules/、dist/、.env、store/、data/、.planning/、.claude/ 等所有非必要文件
- `docker build -t nanoharo:latest .` 成功完成，镜像大小 526MB
- 验证通过：better-sqlite3 native module 加载正常（`sqlite3 OK`）、API_KEY 环境变量注入正常（`API_KEY present: true`）、镜像不含 .env 和 TypeScript 源码

## Task Commits

Each task was committed atomically:

1. **Task 1: 创建 Dockerfile 和 .dockerignore** - `f1d18f7` (feat)
2. **Task 2: 验证镜像运行** - checkpoint approved（无代码变更，验证为人工确认）

**Plan metadata:** _（见 final docs commit）_

## Files Created/Modified

- `Dockerfile` - 两阶段 multi-stage build：builder stage 安装编译工具、npm ci --omit=dev、tsc 编译；runner stage 复制 node_modules 和 dist，以 node user 运行
- `.dockerignore` - 排除 node_modules/、.env、store/、data/、.planning/、*.test.ts 等，保留 package.json、package-lock.json、tsconfig.json、src/

## Decisions Made

- **node:20-slim**：最小 glibc 环境，better-sqlite3 静态链接 SQLite 运行时只依赖 glibc，slim 镜像已足够
- **builder stage 不设 NODE_ENV=production**：显式用 `--omit=dev` 控制依赖范围，避免 npm ci 的隐式行为差异
- **不添加 EXPOSE/HEALTHCHECK**：服务无 HTTP 端口，WhatsApp 连接状态难以用 HTTP 检测，添加会误导 ops
- **groups/main 预创建占位**：runner stage 内 `mkdir -p /app/groups/main`，bind mount 会覆盖但首次启动不因目录缺失报错

## Docker Run 参考命令

```bash
docker run -d \
  --name nanoharo \
  --restart unless-stopped \
  --env-file .env \
  -v "$(pwd)/store:/app/store" \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/groups:/app/groups" \
  nanoharo:latest
```

注意：首次运行前需在宿主机完成 WhatsApp 认证（store/auth/creds.json 必须存在）。

## Deviations from Plan

None - 计划完全按照预期执行。builder + runner 两阶段构建、native module 编译、环境变量注入、非 root user 均按计划实现。

## Issues Encountered

None - 构建过程顺利，无 ELF/ABI 错误，no troubleshooting required.

## User Setup Required

部署前需手动完成：

1. 准备 `.env` 文件（至少含 `ANTHROPIC_API_KEY=sk-ant-xxx`）
2. 在宿主机完成 WhatsApp 认证，确保 `store/auth/creds.json` 存在
3. 使用上述 docker run 命令启动服务

## Next Phase Readiness

- DEPLOY-01 完成：NanoHaro 可通过单个 `docker run` 命令部署在任何装有 Docker 的主机上
- Phase 3 所有计划已完成，milestone v1.0 可评估

---
*Phase: 03-single-image-deployment*
*Completed: 2026-03-03*
