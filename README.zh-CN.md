<div align="center">
  <img src="public/logo.svg" alt="CloudCLI UI" width="64" height="64">
  <h1>CloudCLI UI</h1>
  <p>面向 Claude Code 和 Codex 的本地 Web 工作台。</p>
</div>

<p align="center">
  <a href="https://cloudcli.ai">CloudCLI</a> ·
  <a href="https://cloudcli.ai/docs">Documentation</a> ·
  <a href="https://github.com/siteboon/claudecodeui/issues">Issues</a> ·
  <a href="CONTRIBUTING.md">Contributing</a> ·
  <a href="README.md">English</a>
</p>

---

## 项目简介

CloudCLI UI 是一个自托管的 Web UI，用来在浏览器里管理和使用 AI Coding Agent。它可以发现项目、恢复会话、查看文件、操作 Git、管理 MCP/工具权限，并在同一套界面里使用 Claude Code 和 Codex。

当前版本默认使用中文界面，并保留英文 README 供国际用户查看。

## 核心功能

- **Claude Code 和 Codex 支持**：在同一个 Web UI 中使用两个 Agent。
- **聊天与会话管理**：查看历史会话、恢复上下文、继续对话。
- **项目与文件管理**：浏览项目目录、查看文件、编辑代码、查看语法高亮。
- **Git 面板**：查看改动、暂存文件、提交代码、切换分支。
- **内置终端**：在 Web 界面中打开 Shell，直接运行命令。
- **工具权限管理**：按需开启 Agent 工具，避免默认授予高风险权限。
- **MCP 管理**：统一定义 MCP Server，并启用到 Claude 或 Codex。
- **Skills 管理**：统一管理 Claude 和 Codex 的 Skills。
- **手动导入 Skill ZIP**：上传包含 `SKILL.md` 的 ZIP，预检通过后导入统一管理。
- **插件系统**：通过插件扩展自定义页面、后端服务和集成能力。
- **响应式界面**：支持桌面、平板和移动端浏览器访问。

## 界面预览

<div align="center">
  <table>
    <tr>
      <td align="center">
        <h3>桌面视图</h3>
        <img src="public/screenshots/desktop-main.png" alt="Desktop Interface" width="400">
      </td>
      <td align="center">
        <h3>移动端聊天</h3>
        <img src="public/screenshots/mobile-chat.png" alt="Mobile Interface" width="250">
      </td>
    </tr>
    <tr>
      <td align="center" colspan="2">
        <h3>CLI 选择</h3>
        <img src="public/screenshots/cli-selection.png" alt="CLI Selection" width="400">
      </td>
    </tr>
  </table>
</div>

## 快速开始

### 方式一：npx 运行

要求 Node.js 22 或更高版本。

```bash
npx @cloudcli-ai/cloudcli
```

启动后打开：

```text
http://localhost:3001
```

### 方式二：全局安装

```bash
npm install -g @cloudcli-ai/cloudcli
cloudcli
```

### 方式三：源码开发运行

```bash
npm install
npm run dev
```

前端和后端会同时启动。默认服务端口为 `3001`。

### 方式四：Docker Compose 运行

本仓库包含可直接使用的 Docker 配置，会在容器中安装指定版本的 Claude Code，并把数据和工作区挂载到本地目录。

```bash
docker compose up -d --build
```

打开：

```text
http://localhost:3001
```

默认挂载：

| 宿主机路径 | 容器路径 | 用途 |
|---|---|---|
| `./docker-data/home` | `/data/home` | 用户 Home、数据库、Agent 配置 |
| `./workspace` | `/workspace` | 项目工作区 |

常用 Docker 命令：

```bash
# 查看服务状态
docker compose ps

# 查看日志
docker compose logs -f webcli

# 停止服务
docker compose down

# 重新构建并启动
docker compose down && docker compose build webcli && docker compose up -d
```

## 常用脚本

```bash
# 开发模式
npm run dev

# 构建前端和后端
npm run build

# 运行已构建服务
npm run server

# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 自动修复 lint 问题
npm run lint:fix
```

## 配置说明

常用环境变量：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `SERVER_PORT` | `3001` | 后端监听端口 |
| `HOST` | `localhost` / Docker 中为 `0.0.0.0` | 后端监听地址 |
| `HOME` | 当前用户 Home | Agent 配置、Skills、MCP 等目录的基础路径 |
| `DATABASE_PATH` | 自动生成 | SQLite 数据库路径 |
| `WORKSPACES_ROOT` | 未固定 | Docker 中默认 `/workspace` |
| `CLAUDE_CLI_PATH` | 自动查找 | Claude CLI 可执行文件路径 |

Docker Compose 默认配置见 `docker-compose.yml`。

## Skills 管理

进入 Settings → Skills 管理，可以统一管理以下目录中的 Skills：

| 应用 | 默认目录 |
|---|---|
| Claude | `~/.claude/skills` |
| Codex | `~/.agents/skills` |

支持两种导入方式：

1. **扫描应用 Skills**：从应用目录中发现尚未托管的 Skill，并导入统一管理。
2. **手动导入 ZIP**：上传包含 `SKILL.md` 的 Skill ZIP，预检通过后导入到统一托管目录。

同步策略是 merge-only：如果目标应用目录中已经存在同名 Skill，本工具不会覆盖原目录；关闭同步时也只删除本工具创建的副本。

## Skill ZIP 预检规则

手动导入 ZIP 时会做必要检查：

- ZIP 必须能正常解析。
- 必须包含且只能包含一个 `SKILL.md`。
- 支持 `skill-directory/SKILL.md` 结构。
- 支持根目录直接放置 `SKILL.md`，此时目录名来自 ZIP 文件名。
- `SKILL.md` 的 frontmatter 需要能解析出 Skill 元数据。
- Skill 目录名必须是单段安全目录名。
- 不允许 ZIP entry 解压路径逃逸目标目录。
- 已存在同名托管 Skill 时拒绝导入。
- 应用目录存在同名 Skill 时只提示 warning，不覆盖。

## MCP 管理

进入 Settings → MCP Servers，可以统一定义 MCP Server，并启用到 Claude 或 Codex。

统一 MCP 管理会为每个 Server 保存一份中心记录，再同步到已启用的应用。新建 MCP Server 默认启用 Claude，Codex 默认关闭。

## 安全说明

Agent 工具可能执行文件修改、命令运行、Git 操作等动作。建议：

1. 首次使用时只启用必要工具。
2. 在 Settings 中检查工具权限和 MCP 配置。
3. 对不可信项目优先使用 Docker 或隔离工作区。
4. 不要在共享环境中暴露未受保护的服务端口。

## 插件系统

CloudCLI UI 支持插件扩展。插件可以添加自定义 Tab、前端 UI，以及可选的 Node.js 后端服务。

插件入口在 Settings → Plugins。

参考：

- [Plugin Starter Template](https://github.com/cloudcli-ai/cloudcli-plugin-starter)
- [Plugin Documentation](https://cloudcli.ai/docs/plugin-overview)

## 开发验证

提交或打包前建议运行：

```bash
npm run typecheck
npm run lint -- --quiet
npm run build
```

后端单测可以使用 Node 内置 test runner。例如：

```bash
TSX_TSCONFIG_PATH=server/tsconfig.json node --import tsx --test "server/modules/unified-skills/unified-skills.service.test.ts"
```

## 目录结构

```text
src/                  前端 React 代码
server/               后端 Express/Node 代码
shared/               前后端共享常量和类型
public/               静态资源和截图
docker/               Docker sandbox 相关资料
docs/                 项目文档
dist/                 前端构建产物
dist-server/          后端构建产物
```

## FAQ

### 这是 Claude Code 的替代品吗？

不是。CloudCLI UI 是 Claude Code、Codex 等命令行 Agent 的 Web UI 和管理层。底层能力仍来自对应 CLI 和你的账号订阅。

### 需要单独购买 AI 订阅吗？

需要。CloudCLI UI 不提供模型额度。你需要自行登录并配置 Claude、OpenAI/Codex 等账号或 CLI。

### UI 中修改配置会影响本地 Claude Code 吗？

会。自托管模式下，CloudCLI UI 会读写同一套本地配置，例如 `~/.claude` 下的 MCP、权限、Skills 等内容。

### 可以在手机上使用吗？

可以。只要手机能访问运行 CloudCLI UI 的机器或容器端口，就可以用浏览器打开界面。

## 许可证

本项目使用 GNU Affero General Public License v3.0 or later，详见 [LICENSE](LICENSE)。

如果你修改本软件并作为网络服务提供给用户，需要按 AGPL-3.0-or-later 的要求向用户提供对应源代码。

## 致谢

本项目基于以下工具和生态构建：

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [Codex](https://developers.openai.com/codex)
- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [CodeMirror](https://codemirror.net/)

---

<div align="center">
  <strong>为 Claude Code 和 Codex 用户打造的本地 Web 工作台。</strong>
</div>
