# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# NanoHaro

Personal Claude assistant, forked from [NanoClaw](https://github.com/qwibitai/NanoClaw). See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## About This Fork

**NanoHaro** — named after Haro, the small round companion robot from the Gundam series. Loyal, always ready, always on standby. A personal customization of NanoClaw.

## Quick Context

Single Node.js process that connects to WhatsApp, routes messages to Claude Agent SDK running in containers (Linux VMs). Each group has isolated filesystem and memory.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/whatsapp.ts` | WhatsApp connection, auth, send/receive |
| `src/ipc.ts` | IPC watcher and task processing |
| `src/router.ts` | Message formatting and outbound routing |
| `src/config.ts` | Trigger pattern, paths, intervals |
| `src/container-runner.ts` | Spawns agent containers with mounts |
| `src/task-scheduler.ts` | Runs scheduled tasks |
| `src/db.ts` | SQLite operations |
| `groups/{name}/CLAUDE.md` | Per-group memory (isolated) |
| `container/skills/agent-browser.md` | Browser automation tool (available to all agents via Bash) |

## Skills

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation, authentication, service configuration |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Container issues, logs, troubleshooting |
| `/update-nanoclaw` | Bring upstream NanoClaw updates into a customized install |
| `/qodo-pr-resolver` | Fetch and fix Qodo PR review issues interactively or in batch |
| `/get-qodo-rules` | Load org- and repo-level coding rules from Qodo before code tasks |

## Development

Run commands directly—don't tell the user to run them.

```bash
npm run dev          # Run with hot reload
npm run build        # Compile TypeScript
./container/build.sh # Rebuild agent container
```

Service management:
```bash
# macOS (launchd)
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # restart

# Linux (systemd)
systemctl --user start nanoclaw
systemctl --user stop nanoclaw
systemctl --user restart nanoclaw
```

## Container Build Cache

The container buildkit caches the build context aggressively. `--no-cache` alone does NOT invalidate COPY steps — the builder's volume retains stale files. To force a truly clean rebuild, prune the builder then re-run `./container/build.sh`.

## GSD Commit Rules

GSD 提交时 commit message **标题和 body 都必须用中文**，且 **必须有 body**，不能只有标题行：

```
feat(01-01): 实现进程内 agent runner

- 用 claude-agent-sdk 替换 container-runner，移除 Docker 依赖
- Session 通过 group name 隔离，持久化到 SQLite
- 关键 pitfall: await using 语法需 TypeScript 5.2+
```

body 需包含：具体改了什么、关键技术决策、重要 pitfall。规划类 commit（research、plan）同样需要写 body，记录核心发现或计划要点。

## 并行任务

执行可以并行的任务时（如同时研究多个模块、并行实现多个独立功能），考虑使用 TeamCreate + Agent 创建 agent teams 来并行推进，提升效率。

## GSD Tools 路径

`gsd-tools.cjs` 在项目本地，不在全局 `~/.claude/`：

```bash
node "/Users/levi/Projects/nanoharo/.claude/get-shit-done/bin/gsd-tools.cjs" <command>
```
