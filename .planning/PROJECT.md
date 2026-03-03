# NanoHaro

## What This Is

NanoHaro 是一个自用的个人 Claude 助手，fork 自 NanoClaw。接收 WhatsApp 消息，调用 Claude Agent SDK 在主进程内直接生成回复，无嵌套容器层。整服务打包为单一 Docker 镜像部署。

## Core Value

WhatsApp 消息进来，Claude 回复出去——中间没有多余的进程层。

## Requirements

### Validated

- ✓ WhatsApp 消息收发 — 现有
- ✓ 多 group 隔离（目录级）— 现有
- ✓ SQLite 持久化（消息、任务、session）— 现有
- ✓ 定时任务调度 — 现有
- ✓ IPC 机制（follow-up 消息 pipe 进活跃 agent）— 现有
- ✓ 用 `@anthropic-ai/claude-agent-sdk` `query()` 直接替代容器调用 — v1.0
- ✓ 删除 `container/` 目录（Dockerfile、agent-runner、skills）— v1.0
- ✓ 整个服务打包为单一 Docker 镜像（NanoHaro 本身就是容器）— v1.0
- ✓ Group 隔离改为纯目录级（`groups/{name}/`）— v1.0
- ✓ Follow-up drain 消费者，追加消息真正送达 Claude — v1.0

### Active

（暂无——等待下一里程碑定义）

### Out of Scope

- 嵌套容器隔离（Docker-in-Docker / Apple Container）— 目标部署模型已是单容器，多余
- 保留 `container-runner.ts` 文件名以兼容 NanoClaw diff — 容器层代码整体替换，保留名字无意义
- IPC 文件轮询机制 — 已改为进程内 `pendingFollowUps[]` 内存队列

## Context

**已发布：** v1.0 去容器化改造（2026-03-03）

**当前架构：** 消息 → SQLite → GroupQueue → `runInProcessAgent()` → Claude Agent SDK V2 session → 回复

- `src/agent-runner.ts`：核心 in-process runner，V2 `unstable_v2_createSession/resumeSession`
- `src/group-queue.ts`：持有 SDKSession 句柄，pendingFollowUps 内存队列，drainFollowUps 消费者
- `Dockerfile`：node:20-slim 两阶段构建，镜像 526MB，`docker run` 一键部署

**代码规模：** ~6,453 行 TypeScript，325 tests / 27 files

**已知技术债（非阻塞）：**
- `src/types.ts`：ContainerConfig、AdditionalMount 等容器时代残留接口（db.ts/ipc.ts 引用但执行路径不消费）
- `config.ts`：`MAX_CONCURRENT_CONTAINERS` 命名含 'containers' 字样（语义问题，无功能影响）
- `index.ts`：391,404,406 行注释中仍有 'active container' 字样

**待人工确认（需真实环境）：**
- bind mount 持久化跨重启验证
- WhatsApp 全链路消息收发（需有效 auth 凭据）

## Constraints

- **Tech Stack**：TypeScript / Node.js，不引入新语言
- **Deploy**：单一 Docker 镜像，镜像内直接有 `@anthropic-ai/claude-agent-sdk`
- **Sync**：与上游 NanoClaw 的同步以"能看懂 diff、手动移植"为目标

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 直接 import SDK，不 spawn 子进程 | 去掉容器后子进程无额外价值，增加复杂度 | ✓ Good — 简洁，无额外进程管理 |
| 删除 container/ 目录 | 容器相关代码整体替换，保留无意义 | ✓ Good — 代码库零容器残留，Phase 3 按需重建 Dockerfile |
| 目录级 group 隔离 | 个人自用场景安全需求满足，无需 OS 隔离 | ✓ Good — cwd + CLAUDE_HOME 隔离有效 |
| 主干文件尽量不动 | 便于从上游 cherry-pick whatsapp/router/scheduler 等改动 | ✓ Good — whatsapp.ts/router.ts/ipc.ts 基本未动 |
| ExtendedSessionOptions 交集类型 | SDK v0.2.63 缺 cwd/settingSources 字段，但 CLI 运行时接受 | ✓ Good — 编译通过，运行正常 |
| No `await using`，手动 session 生命周期 | 支持 follow-up turn 复用同一 session 句柄 | ✓ Good — drain 消费者依赖此设计 |
| splice(0) 原子取出 pendingFollowUps | 避免与并发 sendMessage() 竞争 | ✓ Good — 并发安全 |
| node:20-slim 两阶段构建 | 最小 glibc 环境，builder 编译 better-sqlite3 native module | ✓ Good — 镜像 526MB，构建成功 |

---
*Last updated: 2026-03-03 after v1.0 milestone*
