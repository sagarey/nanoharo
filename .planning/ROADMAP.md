# Roadmap: NanoHaro 去容器化改造

## Overview

将 NanoHaro 从"编排器 + 容器沙箱"架构改为"编排器 + 进程内 SDK 调用"。三个阶段：先让新 runner 跑起来（替代容器调用），再清理容器层代码，最后打包为单一 Docker 镜像。

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: In-process Agent Runner** - 用 SDK query() 替代容器调用，IPC 改为进程内传递，group 隔离改为目录级
- [ ] **Phase 2: Container Layer Removal** - 删除所有容器相关代码和文件
- [ ] **Phase 3: Single-Image Deployment** - 构建整个服务的主 Dockerfile

## Phase Details

### Phase 1: In-process Agent Runner
**Goal**: Agent SDK 在主进程内直接调用，消息从 WhatsApp 进来到 Claude 回复出去不经过任何容器或子进程
**Depends on**: Nothing (first phase)
**Requirements**: RUNNER-01, RUNNER-04, GROUP-01, GROUP-02
**Success Criteria** (what must be TRUE):
  1. WhatsApp 消息触发后，Claude Agent SDK `query()` 在主进程内被调用并返回回复
  2. follow-up 消息（IPC）在进程内直接传递给活跃的 agent，无文件轮询
  3. 不同 group 的 agent 以各自 `groups/{name}/` 为 cwd 运行，互不干扰
  4. session 数据写入 `data/sessions/{group}/`，重启后可恢复
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — 新建 src/agent-runner.ts（V2 SDK session 核心 wrapper）
- [x] 01-02-PLAN.md — 改造 GroupQueue（SDKSession 替换 ChildProcess，内存 follow-up 队列）+ ipc.ts 清理
- [x] 01-03-PLAN.md — 改造 index.ts 和 task-scheduler.ts 完成端到端接入

### Phase 2: Container Layer Removal
**Goal**: 容器相关代码全部删除，代码库中不再有 Docker/容器运行时的残留
**Depends on**: Phase 1
**Requirements**: RUNNER-02, RUNNER-03
**Success Criteria** (what must be TRUE):
  1. `src/container-runner.ts`、`src/container-runtime.ts`、`src/mount-security.ts` 不存在
  2. `container/` 目录（Dockerfile、agent-runner、skills、build.sh）不存在
  3. 项目 TypeScript 编译通过，无对已删除模块的引用
**Plans**: 1 plan

Plans:
- [ ] 02-01-PLAN.md — 迁移 survivor 符号到 agent-runner.ts，修复 import 路径，删除全部容器文件

### Phase 3: Single-Image Deployment
**Goal**: 整个 NanoHaro 服务打包为一个 Docker 镜像，可直接 `docker run` 启动
**Depends on**: Phase 2
**Requirements**: DEPLOY-01
**Success Criteria** (what must be TRUE):
  1. 主 Dockerfile 构建成功，镜像包含 Node.js 运行时和 `@anthropic-ai/claude-agent-sdk` 依赖
  2. `docker run` 启动后服务正常接收 WhatsApp 消息并通过 SDK 回复
**Plans**: 1 plan

Plans:
- [ ] 03-01-PLAN.md — 创建多阶段 Dockerfile（builder 编译 native modules，runner 含运行时）和 .dockerignore

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. In-process Agent Runner | 3/3 | Complete | 2026-03-03 |
| 2. Container Layer Removal | 0/1 | Not started | - |
| 3. Single-Image Deployment | 0/1 | Not started | - |
