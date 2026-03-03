# Phase 3: Single-Image Deployment - Research

**Researched:** 2026-03-03
**Domain:** Docker / Node.js containerization with native modules
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
(None — user specified no locked preferences)

### Claude's Discretion
- **持久化数据挂载方式**: `store/`、`data/sessions/`、`groups/` 的 volume/bind mount 约定
- **配置注入方式**: `.env` 文件挂载 vs 环境变量，以及 `docker run` 示例命令
- **镜像构建策略**: 单阶段 vs 多阶段 build（剔除 devDependencies）
- **首次 WhatsApp 认证流程**: QR 码在容器内的处理方式（`docker run -it` 交互式 vs 先在宿主机 auth 再挂载）
- **base image 选择**: `node:20-slim` vs `node:20-alpine`
- **运行用户**: root vs 非特权用户

### Deferred Ideas (OUT OF SCOPE)
- None — 讨论在 Phase 3 边界内
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DEPLOY-01 | 主 Dockerfile 构建整个 NanoHaro 服务（含 SDK 依赖，不含嵌套容器运行时） | Multi-stage build strategy, native module handling, volume layout, env var injection |
</phase_requirements>

---

## Summary

NanoHaro 打包为单个 Docker 镜像面临三个核心挑战：

1. **native module 编译**：`better-sqlite3` 含 C++ 绑定（`prebuild-install || node-gyp rebuild`），需要在构建阶段提供编译工具（python3、g++、build-essential），但不能带入运行时镜像。多阶段 build 是标准解决方案。

2. **SDK binary 机制**：`@anthropic-ai/claude-agent-sdk` 并非独立二进制，而是通过 `cli.js`（Node.js 脚本）启动，runtime 只需 `node` 即可。SDK 包含的 platform-specific 二进制（约 225MB/platform）是 ripgrep，已静态链接，无额外系统依赖。`sharp`（可选依赖）已安装但不是必须的。

3. **WhatsApp 认证流程**：`store/auth` 必须在首次运行前就存在。最简方案：先在宿主机完成认证（`npm run auth`），然后将 `store/` 通过 bind mount 传入容器。容器运行时不需要交互式 TTY。

**Primary recommendation:** 使用 `node:20-slim` base image，两阶段 multi-stage build（builder 编译 native modules，runner 只含运行时），`store/`、`data/`、`groups/` 通过 bind mount 挂载，`ANTHROPIC_API_KEY` 通过 `--env-file .env` 注入。

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:20-slim | Debian bookworm-slim | Runtime base image | glibc 兼容 native modules，比 alpine 省去 musl 踩坑 |
| node:20-slim (builder) | same | Build stage base | 与 runner 相同 glibc，确保 better-sqlite3 ABI 一致 |

### Multi-Stage Build Tools (builder stage only)
| Tool | Install via | Purpose | Needed at runtime? |
|------|-------------|---------|-------------------|
| python3 | apt-get | node-gyp 编译 better-sqlite3 需要 Python | NO |
| build-essential | apt-get | gcc/g++/make for C++ compilation | NO |
| g++ | apt-get (included in build-essential) | C++ compiler | NO |

### Runtime Native Dependencies
| Library | Required by | Note |
|---------|-------------|------|
| libstdc++.so.6 | better-sqlite3.node | 已包含在 node:20-slim glibc 中 |
| libc.so.6 | better-sqlite3.node, ripgrep.node | glibc，slim 基础镜像自带 |

`libsqlite3-dev` **不需要**：`better-sqlite3` 静态链接了 SQLite（`sqlite3.a` 在 build/Release 中），不依赖系统动态库。

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| node:20-slim | node:20-alpine | Alpine 用 musl libc，better-sqlite3 native binding 会有 ABI 兼容问题，额外踩坑；slim 镜像大小差距不显著 |
| node:20-slim | node:20 (full) | Full 镜像含大量不必要工具，最终镜像更大，安全面更大 |
| multi-stage build | single-stage | Single-stage 将 python3/build-essential 带入运行时，白白增大镜像 100MB+ |

**Installation (builder stage):**
```bash
apt-get update && \
apt-get install -y --no-install-recommends python3 g++ build-essential && \
rm -rf /var/lib/apt/lists/*
```

---

## Architecture Patterns

### Recommended Project Structure (container view)
```
/app/                 # WORKDIR，只读应用代码
├── dist/             # 编译后 JS（COPY from build）
├── node_modules/     # npm 依赖（COPY from builder）
├── package.json      # 需要 npm start
└── src/              # 不需要（仅 dist/ 即可）

/data/                # bind mount → host: ./data/
├── sessions/         # SDK session storage (CLAUDE_HOME)

/store/               # bind mount → host: ./store/
└── auth/             # WhatsApp credentials（必须 pre-exist）

/groups/              # bind mount → host: ./groups/
├── main/
│   └── CLAUDE.md
└── {group}/
    └── CLAUDE.md
```

### Pattern 1: Multi-Stage Build (Two Stages)

**What:** Stage 1（builder）安装编译工具、npm ci、编译 native modules；Stage 2（runner）只 COPY node_modules 和 dist，不含任何编译工具。

**When to use:** 任何包含 native module（better-sqlite3）的 Node.js 项目。

**Example:**
```dockerfile
# Stage 1: Builder — compile native modules
FROM node:20-slim AS builder
WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 g++ build-essential && \
    rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: Runner — production image
FROM node:20-slim AS runner
WORKDIR /app

# Create persistent data directories (overridden by mounts at runtime)
RUN mkdir -p /app/store /app/data /app/groups/main

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# Non-root user for security
RUN chown -R node:node /app
USER node

ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
```

### Pattern 2: Volume Strategy for Persistent Data

**What:** 将三个状态目录通过 bind mount 挂载，宿主机完整保留认证和 session 数据。

**When to use:** 个人自用场景，bind mount 比 named volume 更直观（可直接 ls 查看文件）。

**Example:**
```bash
docker run -d \
  --name nanoharo \
  --restart=unless-stopped \
  --env-file .env \
  -v "$(pwd)/store:/app/store" \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/groups:/app/groups" \
  nanoharo:latest
```

### Pattern 3: WhatsApp Auth Before Container Start

**What:** 首次启动前，在宿主机执行 `npm run auth`，生成 `store/auth/` 凭据，然后再 `docker run`。容器本身不需要 TTY 或 QR 渲染能力。

**When to use:** 无头容器（no TTY）场景。

**Example — pre-auth then run:**
```bash
# Step 1: Auth on host (one-time)
npm run auth

# Step 2: Build and run container
docker build -t nanoharo:latest .
docker run -d \
  --env-file .env \
  -v "$(pwd)/store:/app/store" \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/groups:/app/groups" \
  nanoharo:latest
```

**Alternative — pairing code via docker exec:**
```bash
# 先启动容器（会因无 auth 退出），或用 docker run -it 运行 auth 脚本
docker run --rm -it \
  --env-file .env \
  -v "$(pwd)/store:/app/store" \
  nanoharo:latest node dist/whatsapp-auth.js --pairing-code --phone 8613800001234
```

注意：`src/whatsapp-auth.ts` 已支持 `--pairing-code --phone` 模式，且写入 `store/qr-data.txt` 作为文件输出——适合无 TTY 环境。

### Anti-Patterns to Avoid

- **直接 COPY node_modules from host**：宿主机编译的 better-sqlite3.node 与容器 glibc 版本不一定匹配，必须在容器内 `npm ci`。
- **单阶段 build 保留 devDependencies**：typescript、tsx 等 devDependencies 不应进入生产镜像，`npm ci --omit=dev` 排除它们。
- **Alpine + better-sqlite3**：musl libc 导致 prebuild-install 二进制不匹配，需要额外的 node-gyp rebuild，且 musl 与 glibc ABI 差异可能引发段错误。
- **把 .env 文件 COPY 进镜像**：API key 会固化在镜像层，应用 `--env-file .env` 在运行时注入。

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| native module 编译 | 自定义 gyp 脚本 | `npm ci` on builder stage | prebuild-install 自动选择预编译二进制，node-gyp 作为后备 |
| SQLite 动态链接 | 系统安装 libsqlite3 | better-sqlite3 静态链接版本（默认） | 验证：build/Release/ 中有 sqlite3.a 静态库 |
| env var 注入 | 自定义配置解析 | `--env-file .env` docker flag | 已有 src/env.ts 支持 .env 文件，容器内行为一致 |

**Key insight:** SDK 不需要独立 `claude` binary 在 PATH 中。SDK 通过 `sdk.mjs` 中的 `pathToClaudeCodeExecutable` 默认定位到 `@anthropic-ai/claude-agent-sdk/cli.js`，整个过程通过 `node cli.js` 运行——`node` 已在基础镜像中。

---

## Common Pitfalls

### Pitfall 1: better-sqlite3 ABI 不匹配

**What goes wrong:** 从宿主机 COPY node_modules 进镜像，或在 Alpine 上运行为 Debian 编译的 .node 文件，导致 `Error: /app/node_modules/better-sqlite3/build/Release/better_sqlite3.node: invalid ELF header` 或 SIGSEGV。

**Why it happens:** native module 编译时链接的 glibc/musl 版本必须与运行时一致。

**How to avoid:** 在 Dockerfile builder stage 内执行 `npm ci`，确保 better-sqlite3 在与 runner stage 相同的 OS/libc 上编译。

**Warning signs:** 容器启动时立即崩溃，错误含 "invalid ELF" 或 "cannot open shared object file"。

### Pitfall 2: WhatsApp auth 凭据未挂载

**What goes wrong:** 容器内 `store/auth/` 不存在或为空，`src/channels/whatsapp.ts:93` 中执行 `setTimeout(() => process.exit(1), 1000)` 导致容器退出。

**Why it happens:** 认证状态必须持久化，容器默认不保留文件系统。

**How to avoid:** 启动前确认宿主机 `./store/auth/` 含有效凭据（`creds.json`），并 bind mount 该目录。

**Warning signs:** 容器日志出现 "WhatsApp authentication required. Run /setup in Claude Code."，1 秒后 exit code 1。

### Pitfall 3: SDK 需要 node 在 PATH

**What goes wrong:** 如果设置 USER 为非 root 且 node binary 不在 PATH，SDK spawn cli.js 会失败。

**Why it happens:** SDK 通过 `spawn(executable, ['cli.js', ...])` 启动子进程，executable 默认是 `"node"`（字符串），PATH 解析由 shell 负责。

**How to avoid:** node:20-slim 基础镜像的 `node` 已在 `/usr/local/bin/node`，USER node 切换后 PATH 保持完整，无需额外配置。

### Pitfall 4: NODE_ENV 影响 npm 安装

**What goes wrong:** `npm ci` 在 NODE_ENV=production 下默认跳过 devDependencies（与 `--omit=dev` 等效），但如果 Dockerfile 在安装前设置了 `ENV NODE_ENV=production`，行为可能与预期不一致。

**Why it happens:** npm 在 production 模式默认不安装 devDependencies。

**How to avoid:** 在 builder stage 中不设置 NODE_ENV，或明确使用 `npm ci --omit=dev`；只在 runner stage 设置 `ENV NODE_ENV=production`。

### Pitfall 5: groups/ 目录不存在导致 agent cwd 失败

**What goes wrong:** `groups/{name}/` 目录不存在时，SDK 的 `cwd` 参数指向无效路径，agent 启动失败。

**Why it happens:** `src/agent-runner.ts:88` — `groupCwd = path.resolve(GROUPS_DIR, group.folder)`；SDK 不会自动创建 cwd。

**How to avoid:** `groups/main/` 是预设 group，需在宿主机预先创建（含 CLAUDE.md）。Dockerfile 中 `RUN mkdir -p /app/groups/main` 创建默认目录，但 bind mount 会覆盖，因此宿主机必须有该目录。

---

## Code Examples

### Complete Dockerfile (Recommended)

```dockerfile
# Stage 1: Builder
FROM node:20-slim AS builder
WORKDIR /app

# Install native module compilation tools
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 g++ build-essential && \
    rm -rf /var/lib/apt/lists/*

# Install production dependencies (compiles better-sqlite3)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Compile TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: Runner
FROM node:20-slim AS runner
WORKDIR /app

# Runtime directories (replaced by bind mounts)
RUN mkdir -p /app/store /app/data /app/groups/main

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

RUN chown -R node:node /app
USER node

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
```

### .dockerignore

```
node_modules/
dist/
.git/
.env
store/
data/
logs/
.nanoclaw/
*.md
!package.json
!package-lock.json
!tsconfig.json
setup/
scripts/
config-examples/
assets/
docs/
launchd/
repo-tokens/
skills-engine/
agents-sdk-docs/
```

### docker run command

```bash
# Production run (assume store/auth pre-populated)
docker run -d \
  --name nanoharo \
  --restart=unless-stopped \
  --env-file .env \
  -v "$(pwd)/store:/app/store" \
  -v "$(pwd)/data:/app/data" \
  -v "$(pwd)/groups:/app/groups" \
  nanoharo:latest
```

### Environment variables (required in .env for docker)

```bash
ANTHROPIC_API_KEY=sk-ant-...  # REQUIRED
ASSISTANT_NAME=Andy            # optional, default: Andy
CLAUDE_MODEL=claude-opus-4-6   # optional
LOG_LEVEL=info                 # optional
ASSISTANT_HAS_OWN_NUMBER=false # optional
TZ=Asia/Shanghai               # optional, timezone for scheduler
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 每 group 一个容器 | 单进程 + 目录隔离 | Phase 1-2 (2026-03) | Phase 3 只需单一镜像 |
| Container-runner + IPC | in-process SDK session | Phase 1 | 无嵌套容器，Dockerfile 简化 |
| `npm install` (full) | `npm ci --omit=dev` | Docker best practice | 排除 devDeps，减小镜像 |

**SDK binary 机制（关键发现）:**
- SDK 不需要单独下载 `claude` binary。
- `sdk.mjs` 内的 session 初始化：若 `pathToClaudeCodeExecutable` 未指定，默认为 `$SDK_DIR/cli.js`（`let X=CW(J,"cli.js")`）。
- CLI 通过 `node cli.js` 运行，无平台 binary 下载需求。
- Manifest.json 中列出的 225MB+ 平台 binary 是 future/optional 功能（如 standalone 分发），不是 SDK v2 session 的必要组件。

---

## Open Questions

1. **sharp optional dependency**
   - What we know: `@img/sharp-linux-x64` 已安装在 node_modules，是 claude-agent-sdk 的 optional dep
   - What's unclear: 是否需要额外系统依赖（libvips 等）？其 `.node` 文件是否会被加载？
   - Recommendation: 观察是否会有运行时错误；若需要，在 builder stage 安装 `libvips-dev`，或通过 `--ignore-optional` 跳过安装

2. **WhatsApp auth 流程文档**
   - What we know: 容器本身无法显示 QR code（无 TTY），`whatsapp-auth.ts` 支持 pairing code 模式
   - What's unclear: 在 PLAN.md 中是否需要文档化完整的首次认证步骤（超出 DEPLOY-01 范围）
   - Recommendation: DEPLOY-01 仅要求构建成功且服务运行，auth 流程记录为 README 注释即可

---

## Sources

### Primary (HIGH confidence)
- 直接代码分析：`/workspaces/nanoharo/node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs` — pathToClaudeCodeExecutable 默认值，spawn 机制
- 直接代码分析：`/workspaces/nanoharo/node_modules/better-sqlite3/package.json` — install script: `prebuild-install || node-gyp rebuild`
- 直接代码分析：`ldd better_sqlite3.node` — 运行时依赖仅 glibc 系统库
- 直接代码分析：`ldd vendor/ripgrep/x64-linux/rg` — static-pie 链接，无系统依赖
- 直接代码分析：`src/channels/whatsapp.ts:86-93` — QR code 导致 process.exit(1) 的确认

### Secondary (MEDIUM confidence)
- WebSearch: Docker multi-stage build + better-sqlite3 best practices 2025 — 确认 `apt-get install python3 g++ build-essential` 为标准方案
- WebSearch: node:20-slim vs node:20-alpine 2025 — 确认 slim 为 native modules 首选

### Tertiary (LOW confidence)
- WebSearch: Baileys Docker QR/pairing code production 2025 — 一般 WhatsApp bot 容器化模式

---

## Metadata

**Confidence breakdown:**
- Standard Stack (node:20-slim, multi-stage): HIGH — 代码实证 + WebSearch 多源印证
- Architecture (volume layout, env injection): HIGH — 直接来自 src/config.ts 路径常量
- SDK binary mechanism: HIGH — 直接分析 sdk.mjs 源码确认
- Pitfalls: HIGH — better-sqlite3 native binding 行为已通过 ldd 验证

**Research date:** 2026-03-03
**Valid until:** 2026-06-03 (90 days — node base images 和 better-sqlite3 较稳定)
