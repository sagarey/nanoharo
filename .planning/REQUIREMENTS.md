# Requirements: NanoHaro 去容器化改造

**Defined:** 2026-03-03
**Core Value:** WhatsApp 消息进来，Claude 回复出去——中间没有多余的进程层

## v1 Requirements

### Runner

- [x] **RUNNER-01**: 用 `@anthropic-ai/claude-agent-sdk` `query()` 直接在主进程内替代 `runContainerAgent()`
- [x] **RUNNER-02**: 删除 `src/container-runner.ts`、`src/container-runtime.ts`、`src/mount-security.ts`
- [x] **RUNNER-03**: 删除 `container/` 目录（Dockerfile、agent-runner、skills、build.sh）
- [x] **RUNNER-04**: IPC follow-up 消息机制改为进程内直接传递，去掉文件轮询

### Group

- [x] **GROUP-01**: agent `cwd` 设为 `groups/{name}/`，实现目录级 group 隔离
- [x] **GROUP-02**: session 存储路径沿用 `data/sessions/{group}/`

### Deploy

- [x] **DEPLOY-01**: 主 Dockerfile 构建整个 NanoHaro 服务（含 SDK 依赖，不含嵌套容器运行时）

## v2 Requirements

（暂无）

## Out of Scope

| Feature | Reason |
|---------|--------|
| OS 级容器隔离（每 group 一个容器） | 个人自用场景，目录隔离已足够 |
| 保留 container-runner.ts 文件名 | 整体替换，保留名字无意义 |
| IPC 文件轮询（/workspace/ipc/input/） | 容器边界消失后改为进程内传递 |
| agent-runner 子进程方案（方案 B） | 直接 import SDK 更简洁 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RUNNER-01 | Phase 1: In-process Agent Runner | Complete (01-01) |
| RUNNER-04 | Phase 4: Follow-up Drain Consumer | Complete |
| GROUP-01 | Phase 1: In-process Agent Runner | Complete (01-01) |
| GROUP-02 | Phase 1: In-process Agent Runner | Complete (01-01) |
| RUNNER-02 | Phase 2: Container Layer Removal | Complete |
| RUNNER-03 | Phase 2: Container Layer Removal | Complete |
| DEPLOY-01 | Phase 3: Single-Image Deployment | Complete |

**Coverage:**
- v1 requirements: 7 total
- Mapped to phases: 7
- Unmapped: 0
- Pending (gap closure): 0

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-03 after 04-01 completion — Phase 4 complete. All v1 requirements satisfied.*
