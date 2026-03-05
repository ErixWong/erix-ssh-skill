---
name: ssh
description: SSH remote server management toolkit with session support. Use when Claude needs to connect to remote servers via SSH, execute commands, manage files, or perform system administration tasks. Supports persistent sessions, async command execution, and message history with SQLite storage.
allowed-tools:
  - Bash(node scripts/ssh-skill.js *)
---

# SSH Remote Server Management

Session-based SSH client with async execution and SQLite storage.

## Quick Start

```bash
node scripts/ssh-skill.js start-manager
node scripts/ssh-skill.js connect --host 192.168.1.100 --username admin
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
| `connect` | Connect to server |
| `disconnect` | Disconnect from server |
| `delete` | Delete session and history |
| `list` | List all sessions |

### Command Execution

| Command | Description |
|---------|-------------|
| `exec` | Execute command (async, returns task_id) |
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
# 1. List sessions
node scripts/ssh-skill.js list

# 2. Check command history
node scripts/ssh-skill.js history --session sess_xxx

# 3. Get output for specific task
node scripts/ssh-skill.js output --task task_xxx

# 4. Execute new command
node scripts/ssh-skill.js exec --session sess_xxx --command "..."

# 5. Search for errors
node scripts/ssh-skill.js search --session sess_xxx --query "error"
```

## Storage

SQLite database: `~/.ssh-skill/ssh-skill.db`

Tables:
- `sessions` - Connection info
- `tasks` - Command execution details
- `messages` - All messages with read status

## Requirements

- Node.js 18+
- Run `npm install` first