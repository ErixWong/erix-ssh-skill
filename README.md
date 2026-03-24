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
- **Auto Archive** - Automatic session archiving with file rotation (100KB per file)
- **Sudo Support** - Interactive sudo with password caching for reconnection

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

### Connection Config File

You can use a config file to simplify server connections. The `connect` command supports `--config` option to read connection settings from a file.

#### JSON Format

```json
{
  "host": "example.com",
  "port": 22,
  "username": "admin",
  "password": "your_password",
  "privateKey": "~/.ssh/id_rsa",
  "passphrase": "key_passphrase"
}
```

#### Key-Value Format

```
# Server connection config
host: example.com
port: 22
username: admin
password: your_password
```

#### Usage

```bash
# Connect using config file
node scripts/ssh_client.js connect --config ./hosts/server.json

# Or with absolute path
node scripts/ssh_client.js connect --config ~/configs/ssh/server.json
```

#### Config File Fields

| Field | Required | Description |
|-------|----------|-------------|
| `host` | Yes | Server hostname or IP address |
| `port` | No | Server port (default: 22) |
| `username` | Yes | Username for authentication |
| `password` | No* | Password for authentication |
| `privateKey` | No* | Path to private key file (supports `~` for home directory) |
| `passphrase` | No | Passphrase for encrypted private key |

*Either `password` or `privateKey` is required for authentication.

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
- **自动归档** - 自动会话归档，文件轮转（每文件 100KB）
- **Sudo 支持** - 交互式 sudo，密码缓存支持重连

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

### 连接配置文件

可以使用配置文件简化服务器连接。`connect` 命令支持 `--config` 选项从文件读取连接配置。

#### JSON 格式

```json
{
  "host": "example.com",
  "port": 22,
  "username": "admin",
  "password": "your_password",
  "privateKey": "~/.ssh/id_rsa",
  "passphrase": "key_passphrase"
}
```

#### 键值对格式

```
# 服务器连接配置
host: example.com
port: 22
username: admin
password: your_password
```

#### 使用方法

```bash
# 使用配置文件连接
node scripts/ssh_client.js connect --config ./hosts/server.json

# 或使用绝对路径
node scripts/ssh_client.js connect --config ~/configs/ssh/server.json
```

#### 配置文件字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `host` | 是 | 服务器主机名或 IP 地址 |
| `port` | 否 | 服务器端口（默认：22） |
| `username` | 是 | 认证用户名 |
| `password` | 否* | 认证密码 |
| `privateKey` | 否* | 私钥文件路径（支持 `~` 表示主目录） |
| `passphrase` | 否 | 加密私钥的密码 |

*`password` 或 `privateKey` 至少需要提供一个用于认证。

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

## Best Practices / 最佳实践

### Security Guidelines / 安全准则

1. **Never read connection config files** - Use `--config` parameter directly
   ```bash
   # ✅ Correct - pass config file path
   node scripts/ssh_client.js connect --config ./hosts/server.json
   
   # ❌ Wrong - reading config file content
   cat ./hosts/server.json  # DON'T DO THIS
   ```

2. **Never store passwords to disk** - Passwords are cached in memory only
   - The SSH client automatically caches passwords for sudo commands
   - No need to create password files for sudo operations

3. **Save Session ID immediately** - Session ID is your access credential
   - Lost Session ID = Lost access (no session list for security)
   - Only show first 8 characters for identification: `sess_abc1...`

### LLM Usage Guidelines / LLM 使用指南

When using this skill with AI assistants (Claude, Kilo Code, etc.):

1. **Read SKILL.md first** - Before any SSH operation, the AI must read the skill documentation

2. **Trust existing features** - Don't reinvent the wheel
   - Sudo password caching is already implemented
   - Session management is already handled

3. **System differences** - Know your target OS
   | System | Sudo Group |
   |--------|------------|
   | RHEL/CentOS/AlmaLinux | `wheel` |
   | Debian/Ubuntu | `sudo` |

### Typical Workflow / 典型工作流程

```bash
# 1. Start session manager
node scripts/ssh_client.js start-manager

# 2. Connect using config file (recommended)
node scripts/ssh_client.js connect --config ./hosts/server.json
# Save the returned session_id!

# 3. Execute commands
node scripts/ssh_client.js exec --session sess_xxx --command "df -h"

# 4. For sudo commands - just use sudo, password is cached
node scripts/ssh_client.js sudo --session sess_xxx --command "apt update"

# 5. Check output
node scripts/ssh_client.js output --task task_xxx

# 6. Disconnect when done
node scripts/ssh_client.js disconnect --session sess_xxx
```

### Common Mistakes to Avoid / 常见错误

| Mistake | Correct Approach |
|---------|------------------|
| Reading config file content | Use `--config` parameter directly |
| Creating password files for sudo | Just use `sudo` command, password is cached |
| Losing session_id | Save it immediately after connection |
| Using wrong sudo group | Check OS: `wheel` for RHEL, `sudo` for Debian |

---

## License

MIT