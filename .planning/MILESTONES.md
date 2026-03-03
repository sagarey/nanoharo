# Milestones

## v1.0 NanoHaro 去容器化改造 (Shipped: 2026-03-03)

**Phases completed:** 4 phases, 6 plans
**Timeline:** 2026-03-03（单日完成）
**Files changed:** 202 files | **LOC:** ~6,453 TypeScript
**Tests:** 325 tests / 27 files，全部通过
**Git range:** feat(01-01) → feat(04-01)

**Key accomplishments:**
- 新建 `src/agent-runner.ts`：V2 SDK session runner 替代容器调用，ExtendedSessionOptions 桥接 SDK v0.2.63 类型缺口
- GroupQueue 从 ChildProcess 模型切换到 SDKSession 句柄，`sendMessage()` 改为进程内内存队列，消除所有 IPC 文件写入
- index.ts + task-scheduler.ts 端到端接入 `runInProcessAgent()`，WhatsApp 消息全链路接通
- 容器层代码完整删除：5 个 src 文件 + 整个 `container/` 目录，代码库零容器残留
- node:20-slim 两阶段 Dockerfile：builder 编译 better-sqlite3 native module，nanoharo:latest 镜像 526MB
- `drainFollowUps()` 消费者：活跃 turn 内的追加消息通过 `session.send()` 真正送达 Claude，不再静默丢弃

**Delivered:** WhatsApp 消息进来，Claude Agent SDK 在主进程内直接回复——消除嵌套容器层，整服务打包为单一 Docker 镜像

---

