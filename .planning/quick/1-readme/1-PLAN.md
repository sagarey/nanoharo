---
phase: quick-1-readme
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - README.md
  - docs/REQUIREMENTS.md
  - docs/SECURITY.md
autonomous: true
requirements: []

must_haves:
  truths:
    - "README 不再提及容器沙箱作为 NanoHaro 的架构"
    - "README 架构图反映进程内 SDK 调用链路"
    - "docs/REQUIREMENTS.md 架构决策章节描述目录级隔离而非容器隔离"
    - "docs/SECURITY.md 安全模型反映 NanoHaro 实际隔离手段（目录级 + 进程内）"
  artifacts:
    - path: "README.md"
      provides: "NanoHaro 项目介绍，基于 v1.0 去容器化架构"
    - path: "docs/REQUIREMENTS.md"
      provides: "NanoHaro 架构决策文档，去容器化后版本"
    - path: "docs/SECURITY.md"
      provides: "NanoHaro 安全模型，目录级隔离版本"
  key_links:
    - from: "README.md Architecture section"
      to: "actual src/ structure"
      via: "key files list"
      pattern: "agent-runner.ts"
---

<objective>
将 README.md 和 docs/ 下的关联文档更新为 NanoHaro v1.0 去容器化架构的实际描述，移除所有基于容器沙箱的过时内容。

Purpose: v1.0 milestone 已完成去容器化改造（直接 import Claude Agent SDK，删除 container/ 目录），但 README 和文档仍描述 NanoClaw 的容器架构，造成严重的信息误导。
Output: README.md、docs/REQUIREMENTS.md、docs/SECURITY.md 三个文件更新完毕，准确反映进程内 SDK 调用 + 目录级 group 隔离的实际架构。
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/MILESTONES.md

<interfaces>
<!-- NanoHaro v1.0 实际架构（从 PROJECT.md 和 MILESTONES.md 提炼） -->

当前架构链路：
  WhatsApp (baileys) -> SQLite -> GroupQueue -> runInProcessAgent() -> Claude Agent SDK V2 session -> 回复

关键文件（实际存在）：
  src/agent-runner.ts     — 核心 in-process runner，V2 SDK session
  src/group-queue.ts      — 持有 SDKSession 句柄，pendingFollowUps 内存队列
  src/index.ts            — Orchestrator
  src/channels/whatsapp.ts
  src/ipc.ts
  src/router.ts
  src/task-scheduler.ts
  src/db.ts
  （注意：container-runner.ts 已删除，container/ 目录已删除）

隔离模型：
  - 目录级 group 隔离：groups/{name}/ 目录 + cwd + CLAUDE_HOME 绑定
  - 无 OS 级容器隔离
  - 部署方式：整服务打包为单一 Docker 镜像（NanoHaro 本身是容器，agents 不再有嵌套容器）

部署要求：
  - Node.js 20+
  - Claude Code（用于开发/定制）
  - Docker（运行 NanoHaro 服务镜像本身，不是 agent 沙箱）
  - 不再需要 Apple Container
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: 更新 README.md 反映去容器化架构</name>
  <files>README.md</files>
  <action>
重写 README.md，保留 NanoHaro fork 的个人化定位，更新以下内容：

1. **页面顶部描述**：改为 "Personal Claude assistant that runs the Agent SDK in-process. No nested container layer."，移除 "runs agents securely in their own containers"

2. **Philosophy 章节**：
   - 删除 "Secure by isolation" 小节（描述 Linux containers 隔离）
   - 保留 "Small enough to understand"、"Built for the individual user"、"Customization = code changes"、"AI-native"、"Skills over features" 等小节
   - 可加一条关于 "Single process, no nested runtimes" 体现去容器化哲学

3. **What It Supports 章节**：
   - 删除 "Container isolation — Agents are sandboxed in Apple Container (macOS) or Docker (macOS/Linux)" 这一条
   - "Isolated group context" 描述改为：each group has its own CLAUDE.md memory and isolated filesystem directory（不再说"runs in its own container sandbox"）

4. **Architecture 章节**：
   - 架构图改为：`WhatsApp (baileys) --> SQLite --> GroupQueue --> runInProcessAgent() --> Claude Agent SDK V2 --> Response`
   - 描述改为：Single Node.js process. Agent SDK runs in-process. Per-group directory isolation (groups/{name}/). Per-group message queue with concurrency control. IPC via in-memory queue.
   - Key files 列表：删除 `src/container-runner.ts`，新增 `src/agent-runner.ts — In-process Agent SDK runner (V2 sessions)` 和 `src/group-queue.ts — Per-group queue with SDKSession handles`

5. **Requirements 章节**：
   - 删除 Apple Container 和 Docker（作为 agent 沙箱）的要求
   - 保留 Node.js 20+、Claude Code
   - 新增 Docker（用于部署 NanoHaro 服务本身，非 agent 沙箱）

6. **FAQ 章节**：
   - 删除或更新 "Why Docker?" FAQ（旧答案说 Docker 提供 agent 容器跨平台支持——已不适用）
   - 更新 "Can I run this on Linux?" 保持准确（是，可以）
   - 更新 "Is this secure?" FAQ：安全模型从容器隔离改为描述目录级隔离，诚实说明这是个人自用项目的取舍

7. **Quick Start**：保留 `git clone` 命令，如果有 NanoHaro 自己的仓库地址则更新，否则保持原样；`claude` 后运行 `/setup` 的流程不变

8. **Contributing / RFS 章节**：
   - 删除 `/convert-to-apple-container` 这条 RFS（容器 runtime 切换已不适用）
   - 其余保持

保持文件整体格式和 NanoHaro 个人 fork 的定位，不要变成一个全新的介绍性文档。去除所有 NanoClaw 上游容器架构的误导性描述即可。
  </action>
  <verify>
    <automated>grep -n "container sandbox\|Apple Container\|Docker.*container.*agent\|container-runner" /workspaces/nanoharo/README.md; echo "exit: $?"</automated>
  </verify>
  <done>
    README.md 中不再出现 "container sandbox"、"Apple Container"（作为 agent 运行时要求）、"container-runner.ts" 等过时内容；架构图和 key files 列表反映 agent-runner.ts + group-queue.ts 的实际结构。
  </done>
</task>

<task type="auto">
  <name>Task 2: 更新 docs/REQUIREMENTS.md 和 docs/SECURITY.md</name>
  <files>docs/REQUIREMENTS.md, docs/SECURITY.md</files>
  <action>
**docs/REQUIREMENTS.md** 更新：

这份文档是 NanoClaw 原始的架构决策文档，NanoHaro fork 保留它作为参考但需要在顶部加注说明，并更新与 NanoHaro 实际架构冲突的章节：

1. **顶部加注**：在 `# NanoClaw Requirements` 标题下方加：
   ```
   > **NanoHaro Fork Note:** This document reflects NanoClaw's original design.
   > NanoHaro has diverged in v1.0: agents run in-process via Claude Agent SDK (no containers),
   > and the service itself is packaged as a single Docker image. See PROJECT.md for current architecture.
   ```

2. **Container Isolation 章节**（Architecture Decisions 下的子章节）：在该章节开头加注 `> **NanoHaro:** Removed in v1.0. Agents run in-process; directory-level isolation replaces container sandboxing.`，然后保留原文不删，便于与上游比对。

3. **Vision 章节** 的 "Containers for isolated agent execution (Linux VMs)" 一条：加删除线或注明 `[NanoHaro: replaced by in-process SDK]`。

4. **Scheduler 章节**（Integration Points 下）：描述 "Tasks execute Claude Agent SDK in containerized group context" 旁加注 `[NanoHaro: in-process, no container]`。

5. 不重写全文，只加注和标注差异。

---

**docs/SECURITY.md** 更新：

这份文档以容器隔离为核心安全边界，在 NanoHaro 中已不适用。处理方式：

1. **顶部加注**：在标题下方加：
   ```
   > **NanoHaro Fork Note:** NanoHaro v1.0 removed the container isolation layer.
   > The security model below describes NanoClaw's original design.
   > NanoHaro trades OS-level isolation for simplicity: it is a personal-use tool deployed
   > as a single Docker image. Group isolation is directory-level only (groups/{name}/ folders,
   > cwd binding, CLAUDE_HOME). There is no container sandbox between the host process and agents.
   ```

2. **Trust Model 表格**：将 "Container agents | Sandboxed" 行改为 "SDK agents | In-process (no container sandbox)"

3. **Security Architecture Diagram** 下方加注：`> **NanoHaro:** The CONTAINER layer does not exist. Agents run in the HOST PROCESS directly.`

4. 不删除原有内容，保留作为与 NanoClaw 的对比参考，所有修改以加注形式呈现。
  </action>
  <verify>
    <automated>grep -n "NanoHaro Fork Note" /workspaces/nanoharo/docs/REQUIREMENTS.md /workspaces/nanoharo/docs/SECURITY.md</automated>
  </verify>
  <done>
    docs/REQUIREMENTS.md 和 docs/SECURITY.md 顶部均有 "NanoHaro Fork Note" 加注，清晰说明 NanoHaro 与 NanoClaw 原始设计的差异；SECURITY.md 的 Trust Model 和架构图区域有对应的 NanoHaro 注释。
  </done>
</task>

</tasks>

<verification>
完成后验证：
1. README.md 的 Architecture 章节包含 "agent-runner" 和 "runInProcessAgent" 等 v1.0 关键词
2. README.md 的 Key files 列表包含 src/agent-runner.ts 和 src/group-queue.ts
3. docs/REQUIREMENTS.md 和 docs/SECURITY.md 均有 "NanoHaro Fork Note" 区分说明
4. 三个文件不包含对 NanoHaro 用户误导性的容器沙箱要求（如"需要安装 Apple Container 来运行 agents"）
</verification>

<success_criteria>
- README.md 架构描述准确反映：进程内 SDK 调用、无嵌套容器、目录级 group 隔离
- docs/REQUIREMENTS.md 和 docs/SECURITY.md 通过加注方式标注 NanoHaro 与 NanoClaw 的架构差异
- 读者能从 README 正确理解 NanoHaro 的部署模型（单一 Docker 镜像，agents 在主进程内运行）
</success_criteria>

<output>
完成后创建 `.planning/quick/1-readme/quick-1-readme-1-SUMMARY.md`，记录：
- 三个文件的主要变更内容
- 任何需要注意的后续事项（如 README_zh.md 是否需要同步更新）
</output>
