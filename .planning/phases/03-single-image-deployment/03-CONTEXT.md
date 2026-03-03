# Phase 3: Single-Image Deployment - Context

**Gathered:** 2026-03-03
**Status:** Ready for planning

<domain>
## Phase Boundary

将整个 NanoHaro 服务打包为单一 Docker 镜像，可直接 `docker run` 启动。包含：
1. 主 Dockerfile（含 Node.js 运行时 + `@anthropic-ai/claude-agent-sdk` 依赖）
2. `.dockerignore` 排除无关文件
3. 启动命令和环境变量声明

不包含：嵌套容器运行时、多容器编排（docker-compose 是可选文档，不是必须）。

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

用户未指定任何偏好 — 以下所有决策由 Claude 根据最佳实践自行决定：

- **持久化数据挂载方式**：`store/`、`data/sessions/`、`groups/` 的 volume/bind mount 约定
- **配置注入方式**：`.env` 文件挂载 vs 环境变量，以及 `docker run` 示例命令
- **镜像构建策略**：单阶段 vs 多阶段 build（剔除 devDependencies）
- **首次 WhatsApp 认证流程**：QR 码在容器内的处理方式（`docker run -it` 交互式 vs 先在宿主机 auth 再挂载）
- **base image 选择**：`node:20-slim` vs `node:20-alpine`
- **运行用户**：root vs 非特权用户

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- 无现有 Dockerfile — 从零创建
- `package.json` 包含 `npm run build`（tsc）和 `npm start`（运行 dist/index.js）
- Node.js >=20 requirement（来自 package.json engines 字段）

### Established Patterns
- 持久化数据路径（来自 `src/config.ts`）：
  - `store/` — WhatsApp auth state（必须持久化）
  - `data/sessions/` — Claude SDK session state（必须持久化）
  - `groups/` — per-group cwd + CLAUDE.md（必须持久化）
- 配置来自 `.env` 文件或环境变量（两者都支持，见 `src/env.ts`）
- 关键环境变量：`ANTHROPIC_API_KEY`、`ASSISTANT_NAME`、`CLAUDE_MODEL`、`LOG_LEVEL` 等

### Integration Points
- `npm run build` 产出 `dist/` 目录
- `npm start` 即 `node dist/index.js`
- `@anthropic-ai/claude-agent-sdk` 包含 `claude` CLI 二进制，需确保 `node_modules/.bin/claude` 在 PATH 中

</code_context>

<specifics>
## Specific Ideas

- Phase 2 CONTEXT.md 标注：浏览器自动化（agent-browser skill）可在 Phase 3 Dockerfile 中按需考虑 — 本次以最简为目标，不引入额外系统依赖

</specifics>

<deferred>
## Deferred Ideas

- None — 讨论在 Phase 3 边界内

</deferred>

---

*Phase: 03-single-image-deployment*
*Context gathered: 2026-03-03*
