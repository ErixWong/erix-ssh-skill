# SSH Client

[English](#english) | [中文](#中文)

---

<a name="english"></a>
## English

> Claude SSH Client for remote server management with session persistence, async execution, and JSON file storage.

### Features

- **Session Management** - Persistent SSH connections with auto-reconnect
- **Async Execution** - Non-blocking command execution with task tracking
- **JSON Storage** - Simple file-based storage, no native dependencies required
- **Message History** - Full command/output history with read/unread status
- **Reconnect Support** - Reconnect disconnected sessions without re-entering credentials

### Installation

```bash
git clone https://github.com/ErixWong/erix-ssh-skill.git
cd erix-ssh-skill
npm install
```

### Quick Start

```bash
# Start the background session manager
node scripts/ssh_client.js start-manager

# Connect to a server
node scripts/ssh_client.js connect --host 192.168.1.100 --username admin

# Execute a command
node scripts/ssh_client.js exec --session sess_xxx --command "df -h"

# Get command output
node scripts/ssh_client.js output --task task_xxx
```

### Commands

| Command | Description |
|---------|-------------|
| `start-manager` | Start background session manager |
| `connect` | Connect to server |
| `disconnect` | Disconnect from server |
| `reconnect` | Reconnect a disconnected session |
| `exec` | Execute command (async) |
| `history` | Get command history |
| `output` | Get task output |
| `list` | List all sessions |

### Requirements

- Node.js 18+

### Skill Files

This project provides two skill definition files for different AI assistants:

| File | Description |
|------|-------------|
| `SKILL.md` | Default skill file for Claude and other AI assistants |
| `skill-kilo-code.md` | Skill file optimized for Kilo Code |

#### Kilo Code Deployment

To use this skill with Kilo Code:

1. Copy the `scripts/` folder and `skill-kilo-code.md` to your Kilo Code skills directory:
   ```
   .kilocode/skills/erix-ssh/
   ├── scripts/
   │   ├── ssh_client.js
   │   ├── session_manager.js
   │   └── db-json.js
   └── SKILL.md    # Rename from skill-kilo-code.md
   ```

2. Rename `skill-kilo-code.md` to `SKILL.md`

3. Run `npm install` in the skill directory to install dependencies (only `ssh2` required, no native compilation needed)

For more details, see [Kilo Code Skills Documentation](https://kilo.ai/docs/customize/skills).

---

<a name="中文"></a>
## 中文

> Claude SSH 客户端，用于远程服务器管理，支持会话持久化、异步执行和 JSON 文件存储。

### 特性

- **会话管理** - 持久化 SSH 连接，支持自动重连
- **异步执行** - 非阻塞命令执行，任务追踪
- **JSON 存储** - 简单的文件存储，无需原生依赖
- **消息历史** - 完整的命令/输出历史，已读未读状态
- **重连支持** - 断开后重连，无需重新输入凭据

### 安装

```bash
git clone https://github.com/ErixWong/erix-ssh-skill.git
cd erix-ssh-skill
npm install
```

### 快速开始

```bash
# 启动后台会话管理器
node scripts/ssh_client.js start-manager

# 连接服务器
node scripts/ssh_client.js connect --host 192.168.1.100 --username admin

# 执行命令
node scripts/ssh_client.js exec --session sess_xxx --command "df -h"

# 获取命令输出
node scripts/ssh_client.js output --task task_xxx
```

### 命令列表

| 命令 | 说明 |
|------|------|
| `start-manager` | 启动后台会话管理器 |
| `connect` | 连接服务器 |
| `disconnect` | 断开连接 |
| `reconnect` | 重连已断开的会话 |
| `exec` | 执行命令（异步） |
| `history` | 获取命令历史 |
| `output` | 获取任务输出 |
| `list` | 列出所有会话 |

### 系统要求

- Node.js 18+

### 技能文件

本项目提供两个技能定义文件，适用于不同的 AI 助手：

| 文件 | 说明 |
|------|------|
| `SKILL.md` | 默认技能文件，适用于 Claude 等主流 AI 助手 |
| `skill-kilo-code.md` | 专为 Kilo Code 优化的技能文件 |

#### Kilo Code 部署方式

在 Kilo Code 中使用此技能：

1. 将 `scripts/` 文件夹和 `skill-kilo-code.md` 复制到 Kilo Code 技能目录：
   ```
   .kilocode/skills/erix-ssh/
   ├── scripts/
   │   ├── ssh_client.js
   │   ├── session_manager.js
   │   └── db-json.js
   └── SKILL.md    # 从 skill-kilo-code.md 重命名
   ```

2. 将 `skill-kilo-code.md` 重命名为 `SKILL.md`

3. 在技能目录中运行 `npm install` 安装依赖（仅需 `ssh2`，无需原生编译）

更多详情请参考 [Kilo Code Skills 文档](https://kilo.ai/docs/customize/skills)。

---

## License

MIT