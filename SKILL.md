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
3. 如果丢失 session_id，只能 disconnect 并重新 connect

错误做法:
- 没有保存 session_id 就关闭对话
- 把 session_id 分享给不可信的人
- 在公开场合泄露 session_id
```

## Quick Start

```bash
node scripts/ssh-skill.js start-manager
node scripts/ssh-skill.js connect --host 192.168.1.100 --username admin
# ⚠️ 保存返回的 session_id！这是访问该连接的唯一凭证
node scripts/ssh-skill.js exec --session sess_xxx --command "df -h"
node scripts/ssh-skill.js history --session sess_xxx
node scripts/ssh-skill.js output --task task_xxx
```

## Core Workflow

```
history → 返回命令清单 (task_id, command, status)
           ↓
output --task TASK_ID → 返回详细结果 (stdout, stderr, exit_code)
```

## Commands

### Session Management

| Command | Description |
|---------|-------------|
| `start-manager` | Start background manager |
| `stop-manager` | Stop background manager |
| `connect` | Connect to server (返回 session_id，**必须保存**) |
| `disconnect` | Disconnect from server |
| `delete` | Delete session and history |
| ~~`list`~~ | **已移除**（安全原因，Session ID 是访问凭证） |

### Command Execution

| Command | Description |
|---------|-------------|
| `exec` | Execute command (async, returns task_id) |
| `sudo` | Execute sudo command with password (PTY enabled) |
| `history` | Get command list with task_id |
| `output` | Get task output by task_id |
| `task-status` | Get task status (summary) |
| `tasks` | List all tasks |

### Message Query

| Command | Description |
|---------|-------------|
| `read` | Read messages with filters |
| `search` | Search messages by content |
| `stats` | Get session statistics |
| `mark-read` | Mark messages as read |

## history

Get command history with task_id.

```bash
node scripts/ssh-skill.js history --session ID [--limit N]
```

**Output:**
```json
{
  "success": true,
  "commands": [
    {
      "id": "msg_xxx",
      "task_id": "task_001",
      "command": "df -h",
      "timestamp": "2024-01-15T10:30:00Z",
      "status": "completed",
      "exit_code": 0,
      "has_output": true,
      "has_error": false
    }
  ]
}
```

## output

Get detailed output for a specific task.

```bash
node scripts/ssh-skill.js output --task TASK_ID
```

**Output:**
```json
{
  "success": true,
  "task_id": "task_001",
  "command": "df -h",
  "status": "completed",
  "exit_code": 0,
  "output": "Filesystem...",
  "stderr": ""
}
```

## sudo

Execute a command with sudo privileges. Uses PTY (pseudo-terminal) to handle password prompts automatically.

```bash
node scripts/ssh-skill.js sudo --session ID --command "COMMAND" --password "PASSWORD"
```

**Options:**
- `--session` - Session ID (required)
- `--command` - Command to execute with sudo (required)
- `--password` - User password for sudo authentication (required)

**Example:**
```bash
node scripts/ssh-skill.js sudo --session sess_xxx --command "apt update" --password "mypassword"
```

**Output:**
```json
{
  "success": true,
  "task_id": "task_xxx",
  "message": "Sudo command submitted"
}
```

**Notes:**
- Uses `sudo -S` to read password from stdin
- PTY is automatically allocated for proper terminal handling
- Password is not stored in the database
- Check output with `output --task TASK_ID` after execution

## read

Read messages with filters.

```bash
node scripts/ssh-skill.js read --session ID [options]
```

**Options:**
- `--since` - Messages after timestamp
- `--until` - Messages before timestamp
- `--type` - Filter by type (command, output, error, complete, system)
- `--task` - Filter by task_id
- `--unread-only` - Only unread
- `--mark-read` - Mark as read
- `--limit N` - Limit results

## search

Search messages by content.

```bash
node scripts/ssh-skill.js search --session ID --query "TEXT"
```

## Typical LLM Workflow

```bash
# 0. 首次使用：建立连接并保存 session_id
node scripts/ssh-skill.js connect --host 192.168.1.100 --username admin
# 返回: {"success":true,"session_id":"sess_c7f8a9b2..."}
# ⚠️ 必须保存这个 session_id！丢失后无法恢复，只能重新连接

# 1. 检查命令历史（需要 session_id）
node scripts/ssh-skill.js history --session sess_xxx

# 2. 获取特定任务的输出
node scripts/ssh-skill.js output --task task_xxx

# 3. 执行新命令
node scripts/ssh-skill.js exec --session sess_xxx --command "..."

# 4. 执行需要 sudo 权限的命令
node scripts/ssh-skill.js sudo --session sess_xxx --command "apt update" --password "xxx"

# 5. 搜索错误信息
node scripts/ssh-skill.js search --session sess_xxx --query "error"
```

### LLM 职责清单

- [ ] **连接后立即保存 session_id** 到对话上下文或本地存储
- [ ] **每次操作前确认 session_id 可用**
- [ ] **如果 session_id 丢失**，告知用户需要重新连接
- [ ] **不要在公开场合显示完整 session_id**（可显示前8位用于识别）

## Storage

SQLite database: `~/.ssh-skill/ssh-skill.db`

Tables:
- `sessions` - Connection info
- `tasks` - Command execution details
- `messages` - All messages with read status

## Requirements

- Node.js 18+
- Run `npm install` first