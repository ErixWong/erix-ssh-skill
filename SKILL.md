---
name: ssh
description: SSH remote server management toolkit with session support. Use when Claude needs to connect to remote servers via SSH, execute commands, manage files, or perform system administration tasks. Supports persistent sessions, async command execution, and message history with SQLite storage.
allowed-tools:
  - Bash(node scripts/ssh-skill.js *)
---

# SSH Remote Server Management

Session-based SSH client with async execution and SQLite storage.

## ⚠️ 重要安全说明

**Session ID 是访问凭证，必须妥善保存！**

- Session ID 采用 **Capability-based Security** 机制：**知道 Session ID = 拥有该 Session 的完全控制权**
- **LLM 必须将 Session ID 保存在本地**（如对话上下文、本地文件等）
- **丢失 Session ID = 丢失访问权限**，必须重新发起连接
- **不要泄露 Session ID**，任何获得它的人都可以控制你的远程服务器
- **不提供 Session 列表功能**（防止枚举攻击），所以无法找回丢失的 Session ID

```
正确做法:
1. connect 成功后，立即保存返回的 session_id
2. 后续所有操作都使用这个 session_id
3. 如果丢失 session_id，只能重新 connect

错误做法:
- 没有保存 session_id 就关闭对话
- 把 session_id 分享给不可信的人
- 在公开场合泄露 session_id
```

## Quick Start

```bash
# 1. 启动后台管理进程
node scripts/ssh-skill.js start-manager

# 2. 连接服务器（保存返回的 session_id！）
node scripts/ssh-skill.js connect --host 192.168.1.100 --username admin
# → { "success": true, "session_id": "sess_xxx" }

# 3. 执行命令
node scripts/ssh-skill.js exec --session sess_xxx --command "df -h"

# 4. 读取消息
node scripts/ssh-skill.js read --session sess_xxx --unread-only --mark-read
```

## Core Workflow

```
exec --session ID --command "..."  →  异步执行，立即返回
                ↓
read --session ID --unread-only    →  稍后读取新消息
```

## Commands

### Session Management

| Command | Description |
|---------|-------------|
| `start-manager` | Start background manager |
| `stop-manager` | Stop background manager |
| `connect` | Connect to server (返回 session_id，**必须保存**) |
| `disconnect` | Disconnect from server |
| `delete` | Delete session and all history |

### Command Execution

| Command | Description |
|---------|-------------|
| `exec` | Execute command (async, returns immediately) |

### Message Query

| Command | Description |
|---------|-------------|
| `read` | Read messages with filters |
| `search` | Search messages by content |
| `stats` | Get session statistics |

---

## connect

Connect to a remote server.

```bash
node scripts/ssh-skill.js connect --host HOST --username USER [options]
```

**Required:**
- `--host HOST` - Server hostname or IP
- `--username USER` - SSH username

**Options:**
- `--port PORT` - SSH port (default: 22)
- `--password PASS` - Password authentication
- `--key PATH` - SSH private key path
- `--passphrase PASS` - Key passphrase

**Output:**
```json
{
  "success": true,
  "session_id": "sess_c7f8a9b2..."
}
```
⚠️ **必须保存 session_id！这是访问该连接的唯一凭证。**

---

## exec

Execute a command on the remote server (async).

```bash
node scripts/ssh-skill.js exec --session ID --command "COMMAND"
```

**Required:**
- `--session ID` - Session ID
- `--command "COMMAND"` - Command to execute

**Output:**
```json
{ "success": true }
```

Command runs asynchronously. Use `read` to get output.

---

## read

Read messages from a session.

```bash
node scripts/ssh-skill.js read --session ID [options]
```

**Required:**
- `--session ID` - Session ID

**Options:**
- `--unread-only` - Only return unread messages
- `--mark-read` - Mark messages as read
- `--type TYPE` - Filter by type: `command`, `output`, `error`, `complete`, `system`
- `--since TIME` - Messages after timestamp
- `--until TIME` - Messages before timestamp
- `--limit N` - Limit results (default: 100)
- `--reverse` - Newest first

**Output:**
```json
{
  "success": true,
  "session_id": "sess_xxx",
  "status": "connected",
  "unread_count": 3,
  "messages": [
    {
      "id": "msg_001",
      "type": "command",
      "content": "df -h",
      "timestamp": "2024-01-15T10:30:00Z"
    },
    {
      "id": "msg_002",
      "type": "output",
      "content": "FilesystemSizeUsed...",
      "timestamp": "2024-01-15T10:30:01Z",
      "stream": "stdout"
    },
    {
      "id": "msg_003",
      "type": "complete",
      "content": "exit code: 0",
      "timestamp": "2024-01-15T10:30:02Z"
    }
  ]
}
```

---

## search

Search messages by content.

```bash
node scripts/ssh-skill.js search --session ID --query "TEXT"
```

**Required:**
- `--session ID` - Session ID
- `--query "TEXT"` - Search text

**Options:**
- `--type TYPE` - Filter by type
- `--limit N` - Limit results (default: 50)

---

## stats

Get session statistics.

```bash
node scripts/ssh-skill.js stats --session ID
```

**Output:**
```json
{
  "success": true,
  "session_id": "sess_xxx",
  "status": "connected",
  "total_messages": 150,
  "unread_count": 3,
  "connected_at": "2024-01-15T10:00:00Z"
}
```

---

## disconnect

Disconnect from server.

```bash
node scripts/ssh-skill.js disconnect --session ID
```

---

## delete

Delete session and all history.

```bash
node scripts/ssh-skill.js delete --session ID
```

---

## Typical LLM Workflow

```bash
# 1. 连接服务器（保存 session_id！）
node scripts/ssh-skill.js connect --host 192.168.1.100 --username admin
# → { "session_id": "sess_abc123" }

# 2. 执行命令
node scripts/ssh-skill.js exec --session sess_abc123 --command "df -h"

# 3. 读取新消息
node scripts/ssh-skill.js read --session sess_abc123 --unread-only --mark-read

# 4. 执行更多命令
node scripts/ssh-skill.js exec --session sess_abc123 --command "ls -la"

# 5. 搜索历史
node scripts/ssh-skill.js search --session sess_abc123 --query "error"

# 6. 断开连接
node scripts/ssh-skill.js disconnect --session sess_abc123
```

## LLM 职责清单

- [ ] **连接后立即保存 session_id** 到对话上下文或本地存储
- [ ] **每次操作前确认 session_id 可用**
- [ ] **如果 session_id 丢失**，告知用户需要重新连接
- [ ] **不要在公开场合显示完整 session_id**（可显示前8位用于识别）

## Storage

SQLite database: `data/ssh-skill.db`

Tables:
- `sessions` - Connection info and credentials
- `messages` - All messages (command, output, error, complete, system)

## Requirements

- Node.js 18+
- Run `npm install` first
