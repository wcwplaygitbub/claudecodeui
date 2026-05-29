<div align="center">
  <img src="public/logo.svg" alt="CloudCLI UI" width="64" height="64">
  <h1>CloudCLI UI</h1>
  <p>A self-hosted web workspace for Claude Code and Codex.</p>
</div>

<p align="center">
  <a href="https://cloudcli.ai">CloudCLI</a> ·
  <a href="https://cloudcli.ai/docs">Documentation</a> ·
  <a href="https://github.com/siteboon/claudecodeui/issues">Issues</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="README.zh-CN.md">中文</a>
</p>

---

## Overview

CloudCLI UI is a self-hosted web interface for managing and using AI coding agents from your browser. It helps you discover projects, resume sessions, inspect files, manage Git changes, configure MCP servers and tool permissions, and switch between Claude Code and Codex in one interface.

The current product experience is optimized for Chinese by default while keeping an English README for international users.

## Features

- **Claude Code and Codex support**: use both agents from the same web UI.
- **Chat and session management**: browse previous sessions, resume context, and continue conversations.
- **Project and file explorer**: inspect project trees, open files, edit code, and view syntax highlighting.
- **Git panel**: review changes, stage files, create commits, and switch branches.
- **Integrated terminal**: run shell commands directly from the browser.
- **Tool permission management**: enable only the agent tools you need.
- **MCP management**: define MCP servers once and enable them for Claude or Codex.
- **Skills management**: manage Claude and Codex Skills from a unified page.
- **Manual Skill ZIP import**: upload a ZIP that contains `SKILL.md`, preview validation results, then import it.
- **Plugin system**: extend the UI with custom tabs, frontend components, backend services, and integrations.
- **Responsive layout**: use the workspace from desktop, tablet, or mobile browsers.

## Screenshots

<div align="center">
  <table>
    <tr>
      <td align="center">
        <h3>Desktop</h3>
        <img src="public/screenshots/desktop-main.png" alt="Desktop Interface" width="400">
      </td>
      <td align="center">
        <h3>Mobile Chat</h3>
        <img src="public/screenshots/mobile-chat.png" alt="Mobile Interface" width="250">
      </td>
    </tr>
    <tr>
      <td align="center" colspan="2">
        <h3>CLI Selection</h3>
        <img src="public/screenshots/cli-selection.png" alt="CLI Selection" width="400">
      </td>
    </tr>
  </table>
</div>

## Quick Start

### Run with npx

Requires Node.js 22 or newer.

```bash
npx @cloudcli-ai/cloudcli
```

Then open:

```text
http://localhost:3001
```

### Install globally

```bash
npm install -g @cloudcli-ai/cloudcli
cloudcli
```

### Run from source

```bash
npm install
npm run dev
```

The frontend and backend start together. The default server port is `3001`.

### Run with Docker Compose

This repository includes a Docker Compose setup that installs a pinned Claude Code version in the container and mounts local data/workspace directories.

```bash
docker compose up -d --build
```

Open:

```text
http://localhost:3001
```

Default mounts:

| Host path | Container path | Purpose |
|---|---|---|
| `./docker-data/home` | `/data/home` | User home, database, and agent configuration |
| `./workspace` | `/workspace` | Project workspace |

Common Docker commands:

```bash
# Show service status
docker compose ps

# Follow logs
docker compose logs -f webcli

# Stop the service
docker compose down

# Rebuild and restart
docker compose down && docker compose build webcli && docker compose up -d
```

## Scripts

```bash
# Development mode
npm run dev

# Build frontend and backend
npm run build

# Run the built server
npm run server

# Type checking
npm run typecheck

# Lint
npm run lint

# Auto-fix lint issues
npm run lint:fix
```

## Configuration

Common environment variables:

| Variable | Default | Description |
|---|---|---|
| `SERVER_PORT` | `3001` | Backend server port |
| `HOST` | `localhost`, or `0.0.0.0` in Docker | Backend bind address |
| `HOME` | Current user home | Base path for agent config, Skills, MCP, and related files |
| `DATABASE_PATH` | Auto-generated | SQLite database path |
| `WORKSPACES_ROOT` | Not fixed; `/workspace` in Docker | Project workspace root |
| `CLAUDE_CLI_PATH` | Auto-detected | Claude CLI executable path |

See `docker-compose.yml` for the Docker defaults.

## Skills Management

Open Settings → Skills to manage Skills for:

| App | Default directory |
|---|---|
| Claude | `~/.claude/skills` |
| Codex | `~/.agents/skills` |

Supported import flows:

1. **Scan app Skills**: discover unmanaged Skills from app directories and import them into unified management.
2. **Manual ZIP import**: upload a Skill ZIP that contains `SKILL.md`, preview the result, and import it into the managed store.

The sync strategy is merge-only: if an app already has a Skill with the same directory name, CloudCLI UI does not overwrite it. When sync is disabled, it only removes copies that CloudCLI UI created.

## Skill ZIP Validation

Manual ZIP import performs the required checks for standard Skill packages:

- The ZIP must be readable.
- It must contain exactly one `SKILL.md`.
- `skill-directory/SKILL.md` is supported.
- A root-level `SKILL.md` is supported; the directory name comes from the ZIP filename.
- `SKILL.md` frontmatter must be parseable as Skill metadata.
- The Skill directory name must be a safe single path segment.
- ZIP entries must not escape the target extraction directory.
- Existing managed Skills with the same id block import.
- Existing app Skills with the same directory only produce a warning and are not overwritten.

## MCP Management

Open Settings → MCP Servers to define each MCP server once and enable it for Claude or Codex.

Unified MCP management stores one central record per server and syncs it to enabled apps. New servers default to Claude enabled and Codex disabled.

## Security Notes

Agent tools can modify files, run shell commands, and operate on Git repositories. Recommended usage:

1. Enable only the tools you need.
2. Review tool permissions and MCP configuration in Settings.
3. Use Docker or another isolated workspace for untrusted projects.
4. Do not expose an unprotected local service port on a shared network.

## Plugins

CloudCLI UI supports plugins. A plugin can add custom tabs, frontend UI, and optional Node.js backend services.

Install and manage plugins from Settings → Plugins.

References:

- [Plugin Starter Template](https://github.com/cloudcli-ai/cloudcli-plugin-starter)
- [Plugin Documentation](https://cloudcli.ai/docs/plugin-overview)

## Development Verification

Before packaging or submitting changes, run:

```bash
npm run typecheck
npm run lint -- --quiet
npm run build
```

Example backend test command:

```bash
TSX_TSCONFIG_PATH=server/tsconfig.json node --import tsx --test "server/modules/unified-skills/unified-skills.service.test.ts"
```

## Project Structure

```text
src/                  React frontend
server/               Express/Node backend
shared/               Shared frontend/backend constants and types
public/               Static assets and screenshots
docker/               Docker sandbox documentation and assets
docs/                 Project documentation
dist/                 Frontend build output
dist-server/          Backend build output
```

## FAQ

### Is this a replacement for Claude Code?

No. CloudCLI UI is a web interface and management layer for command-line agents such as Claude Code and Codex. The underlying agent behavior still comes from the corresponding CLI and your own account/subscription.

### Do I need a separate AI subscription?

Yes. CloudCLI UI does not provide model usage. You need to authenticate and configure your own Claude, OpenAI/Codex, or related CLI accounts.

### Will UI changes affect my local Claude Code setup?

Yes in self-hosted mode. CloudCLI UI reads and writes the same local configuration, such as MCP servers, permissions, and Skills under `~/.claude`.

### Can I use it on my phone?

Yes. If your phone can reach the machine or container running CloudCLI UI, you can open the interface in a mobile browser.

## License

This project is licensed under GNU Affero General Public License v3.0 or later. See [LICENSE](LICENSE).

If you modify this software and run it as a network service, you must make the modified source code available to users of that service under AGPL-3.0-or-later.

## Acknowledgements

Built with:

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [Codex](https://developers.openai.com/codex)
- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [CodeMirror](https://codemirror.net/)

---

<div align="center">
  <strong>A self-hosted web workspace for Claude Code and Codex users.</strong>
</div>
