<p align="center">
  <img src="assets/nanoclaw-logo.png" alt="NanoHaro" width="400">
</p>

<p align="center">
  Personal Claude assistant that runs the Agent SDK in-process. No nested container layer. Lightweight, built to be easily understood and completely customized for your needs.
</p>

<p align="center">
  <a href="https://nanoclaw.dev">nanoclaw.dev</a>&nbsp; • &nbsp;
  <a href="README_zh.md">中文</a>&nbsp; • &nbsp;
  <a href="https://discord.gg/VDdww8qS42"><img src="https://img.shields.io/discord/1470188214710046894?label=Discord&logo=discord&v=2" alt="Discord" valign="middle"></a>&nbsp; • &nbsp;
  <a href="repo-tokens"><img src="repo-tokens/badge.svg" alt="34.9k tokens, 17% of context window" valign="middle"></a>
</p>

Using Claude Code, NanoHaro can dynamically rewrite its code to customize its feature set for your needs.

**NanoHaro** is a personal fork of NanoClaw. Agents run directly inside the host Node.js process via the Claude Agent SDK — no nested container layer, no Docker-in-Docker.

## Why I Built NanoHaro

[NanoClaw](https://github.com/qwibitai/NanoClaw) is a well-designed project, but its container-per-agent model adds operational complexity (Apple Container, nested Docker, cross-platform runtime differences) that is unnecessary for a personal self-hosted assistant. NanoHaro trades OS-level container isolation for simplicity: the whole service is one Docker image, agents run in-process, and group isolation is directory-level.

## Quick Start

```bash
git clone https://github.com/qwibitai/NanoClaw.git
cd NanoClaw
claude
```

Then run `/setup`. Claude Code handles everything: dependencies, authentication, and service configuration.

## Philosophy

**Small enough to understand.** One process, a few source files and no microservices. If you want to understand the full NanoHaro codebase, just ask Claude Code to walk you through it.

**Single process, no nested runtimes.** The Claude Agent SDK runs in-process. No spawning containers for each agent invocation. Simpler operational model, easier to debug.

**Built for the individual user.** NanoHaro isn't a monolithic framework; it's software that fits each user's exact needs. Instead of becoming bloatware, NanoHaro is designed to be bespoke. You make your own fork and have Claude Code modify it to match your needs.

**Customization = code changes.** No configuration sprawl. Want different behavior? Modify the code. The codebase is small enough that it's safe to make changes.

**AI-native.**
- No installation wizard; Claude Code guides setup.
- No monitoring dashboard; ask Claude what's happening.
- No debugging tools; describe the problem and Claude fixes it.

**Skills over features.** Instead of adding features (e.g. support for Telegram) to the codebase, contributors submit [claude code skills](https://code.claude.com/docs/en/skills) like `/add-telegram` that transform your fork. You end up with clean code that does exactly what you need.

**Best harness, best model.** NanoHaro runs on the Claude Agent SDK, which means you're running Claude Code directly. Claude Code is highly capable and its coding and problem-solving capabilities allow it to modify and expand NanoHaro and tailor it to each user.

## What It Supports

- **Messenger I/O** - Message NanoHaro from your phone. Supports WhatsApp, Telegram, Discord, Slack, Signal and headless operation.
- **Isolated group context** - Each group has its own `CLAUDE.md` memory and isolated filesystem directory (`groups/{name}/`). Per-group `cwd` and `CLAUDE_HOME` binding ensures agents in different groups cannot see each other's files.
- **Main channel** - Your private channel (self-chat) for admin control; every group is completely isolated
- **Scheduled tasks** - Recurring jobs that run Claude and can message you back
- **Web access** - Search and fetch content from the Web
- **Agent Swarms** - Spin up teams of specialized agents that collaborate on complex tasks.
- **Optional integrations** - Add Gmail (`/add-gmail`) and more via skills

## Usage

Talk to your assistant with the trigger word (default: `@Andy`):

```
@Andy send an overview of the sales pipeline every weekday morning at 9am (has access to my Obsidian vault folder)
@Andy review the git history for the past week each Friday and update the README if there's drift
@Andy every Monday at 8am, compile news on AI developments from Hacker News and TechCrunch and message me a briefing
```

From the main channel (your self-chat), you can manage groups and tasks:
```
@Andy list all scheduled tasks across groups
@Andy pause the Monday briefing task
@Andy join the Family Chat group
```

## Customizing

NanoHaro doesn't use configuration files. To make changes, just tell Claude Code what you want:

- "Change the trigger word to @Bob"
- "Remember in the future to make responses shorter and more direct"
- "Add a custom greeting when I say good morning"
- "Store conversation summaries weekly"

Or run `/customize` for guided changes.

The codebase is small enough that Claude can safely modify it.

## Contributing

**Don't add features. Add skills.**

If you want to add Telegram support, don't create a PR that adds Telegram alongside WhatsApp. Instead, contribute a skill file (`.claude/skills/add-telegram/SKILL.md`) that teaches Claude Code how to transform a NanoHaro installation to use Telegram.

Users then run `/add-telegram` on their fork and get clean code that does exactly what they need, not a bloated system trying to support every use case.

### RFS (Request for Skills)

Skills we'd like to see:

**Communication Channels**
- `/add-slack` - Add Slack

**Session Management**
- `/clear` - Add a `/clear` command that compacts the conversation (summarizes context while preserving critical information in the same session). Requires figuring out how to trigger compaction programmatically via the Claude Agent SDK.

## Requirements

- macOS or Linux
- Node.js 20+
- [Claude Code](https://claude.ai/download)
- [Docker](https://docker.com/products/docker-desktop) (for running the NanoHaro service image itself, not for agent sandboxing)

## Architecture

```
WhatsApp (baileys) --> SQLite --> GroupQueue --> runInProcessAgent() --> Claude Agent SDK V2 --> Response
```

Single Node.js process. Agent SDK runs in-process. Per-group directory isolation (`groups/{name}/`). Per-group message queue with concurrency control. IPC via in-memory queue.

Key files:
- `src/index.ts` - Orchestrator: state, message loop, agent invocation
- `src/channels/whatsapp.ts` - WhatsApp connection, auth, send/receive
- `src/ipc.ts` - IPC watcher and task processing
- `src/router.ts` - Message formatting and outbound routing
- `src/agent-runner.ts` - In-process Agent SDK runner (V2 sessions)
- `src/group-queue.ts` - Per-group queue with SDKSession handles
- `src/task-scheduler.ts` - Runs scheduled tasks
- `src/db.ts` - SQLite operations (messages, groups, sessions, state)
- `groups/*/CLAUDE.md` - Per-group memory

## FAQ

**Can I run this on Linux?**

Yes. The service is packaged as a Docker image and works on both macOS and Linux. Just run `/setup`.

**Is this secure?**

NanoHaro is designed for personal self-hosted use. Group isolation is directory-level: each group's agent runs with its own `cwd` and `CLAUDE_HOME` pointing to `groups/{name}/`, so agents cannot see other groups' files. There is no OS-level container sandbox between the host process and agents. This is an intentional trade-off: simpler deployment, honest about the security model. See [docs/SECURITY.md](docs/SECURITY.md) for details.

**Why no configuration files?**

We don't want configuration sprawl. Every user should customize NanoHaro so that the code does exactly what they want, rather than configuring a generic system. If you prefer having config files, you can tell Claude to add them.

**Can I use third-party or open-source models?**

Yes. NanoHaro supports any API-compatible model endpoint. Set these environment variables in your `.env` file:

```bash
ANTHROPIC_BASE_URL=https://your-api-endpoint.com
ANTHROPIC_AUTH_TOKEN=your-token-here
```

This allows you to use:
- Local models via [Ollama](https://ollama.ai) with an API proxy
- Open-source models hosted on [Together AI](https://together.ai), [Fireworks](https://fireworks.ai), etc.
- Custom model deployments with Anthropic-compatible APIs

Note: The model must support the Anthropic API format for best compatibility.

**How do I debug issues?**

Ask Claude Code. "Why isn't the scheduler running?" "What's in the recent logs?" "Why did this message not get a response?" That's the AI-native approach that underlies NanoHaro.

**Why isn't the setup working for me?**

If you have issues, during setup, Claude will try to dynamically fix them. If that doesn't work, run `claude`, then run `/debug`. If Claude finds an issue that is likely affecting other users, open a PR to modify the setup SKILL.md.

**What changes will be accepted into the codebase?**

Only security fixes, bug fixes, and clear improvements will be accepted to the base configuration. That's all.

Everything else (new capabilities, OS compatibility, hardware support, enhancements) should be contributed as skills.

This keeps the base system minimal and lets every user customize their installation without inheriting features they don't want.

## Community

Questions? Ideas? [Join the Discord](https://discord.gg/VDdww8qS42).

## License

MIT
