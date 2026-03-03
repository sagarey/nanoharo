# Retrospective: NanoHaro

---

## Milestone: v1.0 — NanoHaro 去容器化改造

**Shipped:** 2026-03-03
**Phases:** 4 | **Plans:** 6 | **Timeline:** 单日完成（< 8 小时）

### What Was Built

- `src/agent-runner.ts`：V2 SDK session runner，ExtendedSessionOptions 桥接 SDK 类型缺口
- GroupQueue 全面改造：ChildProcess → SDKSession，文件 IPC → 内存队列
- index.ts + task-scheduler.ts 端到端接入 in-process runner
- 容器层代码完整删除：5 个 src 文件 + 整个 container/ 目录
- node:20-slim 两阶段 Dockerfile，nanoharo:latest 526MB 可一键部署
- drainFollowUps() 消费者：追加消息真正送达 Claude，不再静默丢弃

### What Worked

- **迁移顺序策略**：先追加符号到目标文件，修复所有 import 引用，最后删除源文件——完全规避中间态编译失败
- **Phase 4 追加机制**：audit 发现 RUNNER-04 drain consumer 缺失后，通过插入 Phase 4 优雅关闭差距，不影响已完成的 Phase 1-3
- **单日完成**：4 个 Phase 在一天内完成，每个 Plan 节奏快（3-18 分钟），验证-提交循环紧凑

### What Was Inefficient

- **SDK 类型缺口**（01-01）：ExtendedSessionOptions 需要在 Plan 执行时临时解决；RESEARCH 阶段若验证过 SDK 版本差异可以提前解决
- **tasks 计数为 0**：STATE.md 速率指标中 "Total plans completed: 2" 与实际 6 不符，STATE 追踪有计算 bug

### Patterns Established

- `splice(0)` 原子取出 in-memory 队列（适用于并发写入场景）
- "Drain-before-finally"：需要有效 session 的异步清理必须在 try 块内完成，不能在 finally 后
- ExtendedSessionOptions 交集类型桥接 SDK 版本类型缺口（无需 fork 或 patch SDK）
- node:20-slim 两阶段 Docker 构建：builder 编译 native module，runner 只含生产产物

### Key Lessons

1. **SDK @alpha 版本要在 Research 阶段验证类型签名**，不能假设文档代码和实际 SDK 类型一致
2. **Audit 差距优先**：第一轮 audit 发现 drain 缺失，插入 Phase 4 关闭而不是放 tech debt，正确
3. **单文件删除顺序重要**：容器层删除时，"迁移 → 修引用 → 删源文件" 比"先删再修"成本低很多

### Cost Observations

- 执行极高效：单日完成 4 个 Phase，总 wall-clock 时间约 57 分钟（实际 AI 执行时间）
- Phase 3（Docker 构建）耗时最长（18 min），因为包含真实 docker build 等待时间
- Phase 2 和 Phase 4 最快（3 min 各），说明清理类和小增量类任务在 GSD 框架下非常高效

---

## Cross-Milestone Trends

| Milestone | Phases | Plans | Timeline | Velocity |
|-----------|--------|-------|----------|----------|
| v1.0 去容器化 | 4 | 6 | 单日 | 9.5 min/plan avg |

_更多里程碑数据待 v1.1 后追加_
