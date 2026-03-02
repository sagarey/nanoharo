# NanoHaro — 去容器化改造

## What This Is

NanoHaro 是一个自用的个人 Claude 助手，fork 自 NanoClaw。接收 WhatsApp 消息，调用 Claude Agent SDK 生成回复。本次改造目标是去除嵌套容器层，让 Agent SDK 在主进程内直接调用，同时保持整体架构不变，便于从上游 NanoClaw 同步无关改动。

## Core Value

WhatsApp 消息进来，Claude 回复出去——中间没有多余的进程层。

## Requirements

### Validated

- ✓ WhatsApp 消息收发 — 现有
- ✓ 多 group 隔离（目录级）— 现有
- ✓ SQLite 持久化（消息、任务、session）— 现有
- ✓ 定时任务调度 — 现有
- ✓ IPC 机制（follow-up 消息 pipe 进活跃 agent）— 现有

### Active

- [ ] 用 `@anthropic-ai/claude-agent-sdk` `query()` 直接替代 `container-runner.ts` 的容器调用
- [ ] 删除 `container/` 目录（Dockerfile、agent-runner、skills）
- [ ] 整个服务打包为单一 Docker 镜像（NanoHaro 本身就是容器）
- [ ] Group 隔离改为纯目录级（`groups/{name}/`），不依赖 OS 容器隔离
- [ ] 保持 `src/` 其余文件（whatsapp.ts、router.ts、ipc.ts、task-scheduler.ts 等）基本不动

### Out of Scope

- 嵌套容器隔离（Docker-in-Docker / Apple Container）— 目标部署模型已是单容器，多余
- 保留 `container-runner.ts` 文件名以兼容 NanoClaw diff — 容器层代码整体替换，保留名字无意义
- IPC 文件轮询机制 — 去掉容器边界后改为进程内直接传递

## Context

- **现有架构**：事件驱动编排器 + 容器沙箱层。消息 → SQLite → GroupQueue → container-runner → docker run → agent-runner → SDK query()
- **目标架构**：消息 → SQLite → GroupQueue → runner → SDK query()（直接）
- **Sandbox 层**（`container-runner.ts`、`container-runtime.ts`、`mount-security.ts`）将被替换或删除
- **Skills**（`container/skills/`）处理方式在执行阶段决定（可能移至 `src/skills/` 或通过 SDK `systemPrompt` 注入）
- **runner 文件命名**（inline / `runner.ts` / 保留旧名）在执行阶段按代码量决定

## Constraints

- **Tech Stack**：TypeScript / Node.js，不引入新语言
- **Deploy**：单一 Docker 镜像，镜像内直接有 `@anthropic-ai/claude-agent-sdk`
- **Sync**：与上游 NanoClaw 的同步以"能看懂 diff、手动移植"为目标，不追求自动无冲突

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 直接 import SDK，不 spawn 子进程 | 去掉容器后子进程无额外价值，增加复杂度 | — Pending |
| 删除 container/ 目录 | 容器相关代码整体替换，保留无意义 | — Pending |
| 目录级 group 隔离 | 个人自用场景安全需求满足，无需 OS 隔离 | — Pending |
| 主干文件尽量不动 | 便于从上游 cherry-pick whatsapp/router/scheduler 等改动 | — Pending |

---
*Last updated: 2026-03-03 after initialization*
