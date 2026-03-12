# SSH Client

[English](#english) | [中文](#中文)

---

<a name="english"></a>
## English

> Claude SSH Client for remote server management with session persistence, async execution, and SQLite storage.

### Features

- **Session Management** - Persistent SSH connections with auto-reconnect
- **Async Execution** - Non-blocking command execution with task tracking
- **SQLite Storage** - Structured data storage with powerful queries
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

---

<a name="中文"></a>
## 中文

> Claude SSH 客户端，用于远程服务器管理，支持会话持久化、异步执行和 SQLite 存储。

### 特性

- **会话管理** - 持久化 SSH 连接，支持自动重连
- **异步执行** - 非阻塞命令执行，任务追踪
- **SQLite 存储** - 结构化数据存储，支持复杂查询
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

---

## License

MIT