# SSH Skill 需求文档

**版本**: 0.3.0  
**更新日期**: 2026-03-07  
**状态**: 简化设计

---

## 1. 项目概述

### 1.1 项目背景

本项目是一个 SSH Skill（技能插件），使 LLM（大语言模型）能够通过 SSH 协议远程连接和操控服务器。

### 1.2 当前实现

- **语言**: JavaScript (Node.js 18+)
- **存储**: SQLite (better-sqlite3)
- **SSH库**: ssh2
- **架构**: Manager (后台进程) + CLI客户端

### 1.3 核心设计原则

1. **单层模型**: 只有 Session，没有 Task
2. **消息流**: 命令输出作为消息流，LLM 通过读取消息获取结果
3. **最小认知负担**: LLM 只需记住 session_id

---

## 2. 架构设计

### 2.1 核心模型

```
┌─────────────────────────────────────────┐
│              Session                     │
│  - session_id (访问凭证)                 │
│  - SSH 连接信息                          │
│  - 消息流                                │
└─────────────────────────────────────────┘
```

**没有 Task 层！** 命令执行后直接产生消息。

### 2.2 消息类型

| 类型 | 说明 |
|------|------|
| `command` | 执行的命令 |
| `output` | stdout 输出 |
| `error` | stderr 输出 |
| `complete` | 命令完成（含退出码） |
| `system` | 系统消息（连接/断开） |

### 2.3 工作流程

```
LLM                        SSH Skill
 │                              │
 │  exec --session xxx --cmd    │
 │─────────────────────────────►│
 │                              │ 执行命令
 │  { success: true }           │ 产生消息
 │◄─────────────────────────────│
 │                              │
 │  ... 稍后 ...                │
 │                              │
 │  read --session xxx          │
 │─────────────────────────────►│
 │                              │
 │  { messages: [...] }         │
 │◄─────────────────────────────│
```

---

## 3. 命令清单

### 3.1 Session 管理

| 命令 | 说明 | 返回 |
|------|------|------|
| `start-manager` | 启动后台进程 | `{ success, pid }` |
| `stop-manager` | 停止后台进程 | `{ success }` |
| `connect` | 建立 SSH 连接 | `{ success, session_id }` |
| `disconnect` | 断开连接 | `{ success }` |
| `delete` | 删除 session | `{ success }` |

### 3.2 命令执行

| 命令 | 说明 | 返回 |
|------|------|------|
| `exec` | 执行命令（异步） | `{ success }` |

### 3.3 消息查询

| 命令 | 说明 | 返回 |
|------|------|------|
| `read` | 读取消息 | `{ success, messages[] }` |
| `search` | 搜索消息 | `{ success, messages[] }` |
| `stats` | 获取统计 | `{ success, total, unread }` |

---

## 4. 命令详情

### 4.1 connect

```bash
node scripts/ssh-skill.js connect --host HOST --username USER [options]
```

**必填参数:**
- `--host HOST` - 服务器地址
- `--username USER` - 用户名

**可选参数:**
- `--port PORT` - 端口（默认 22）
- `--password PASS` - 密码
- `--key PATH` - 私钥路径
- `--passphrase PASS` - 私钥密码

**返回:**
```json
{ "success": true, "session_id": "sess_xxx" }
```

### 4.2 exec

```bash
node scripts/ssh-skill.js exec --session ID --command "COMMAND"
```

**必填参数:**
- `--session ID` - Session ID
- `--command "COMMAND"` - 要执行的命令

**返回:**
```json
{ "success": true }
```

### 4.3 read

```bash
node scripts/ssh-skill.js read --session ID [options]
```

**必填参数:**
- `--session ID` - Session ID

**可选参数:**
- `--unread-only` - 只返回未读
- `--mark-read` - 标记已读
- `--type TYPE` - 按类型过滤
- `--since TIME` - 时间范围起点
- `--until TIME` - 时间范围终点
- `--limit N` - 限制数量
- `--reverse` - 倒序

**返回:**
```json
{
  "success": true,
  "session_id": "sess_xxx",
  "status": "connected",
  "unread_count": 3,
  "messages": [...]
}
```

### 4.4 search

```bash
node scripts/ssh-skill.js search --session ID --query "TEXT"
```

**必填参数:**
- `--session ID` - Session ID
- `--query "TEXT"` - 搜索文本

**可选参数:**
- `--type TYPE` - 按类型过滤
- `--limit N` - 限制数量

### 4.5 stats

```bash
node scripts/ssh-skill.js stats --session ID
```

**返回:**
```json
{
  "success": true,
  "session_id": "sess_xxx",
  "status": "connected",
  "total_messages": 150,
  "unread_count": 3
}
```

---

## 5. 数据模型

### 5.1 sessions 表

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,          -- Session ID (访问凭证)
  host TEXT NOT NULL,
  port INTEGER DEFAULT 22,
  username TEXT NOT NULL,
  status TEXT DEFAULT 'connecting',
  config TEXT,                  -- JSON (需加密)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_read_at TEXT
);
```

### 5.2 messages 表

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL,  -- command, output, error, complete, system
  content TEXT,
  stream TEXT,  -- stdout, stderr
  read INTEGER DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

**注意：没有 tasks 表！**

---

## 6. 安全设计

### 6.1 Session ID 安全

- Session ID 使用 256 位加密安全随机数
- 知道 Session ID = 拥有完全控制权
- 不提供 Session 列表功能

详见: [`SESSION_ISOLATION_SIMPLE.md`](SESSION_ISOLATION_SIMPLE.md)

### 6.2 待实现

| 优先级 | 改进项 | 状态 |
|--------|--------|------|
| P0 | Session ID 安全生成 | 📝 待实现 |
| P0 | 文件权限控制 | 📝 待实现 |
| P1 | 凭据加密存储 | 📝 待实现 |
| P1 | 审计日志 | 📝 待实现 |

---

## 7. 与旧版本对比

| 方面 | 旧版本 (v0.2) | 新版本 (v0.3) |
|------|--------------|--------------|
| 模型层次 | Session → Task → Messages | Session → Messages |
| LLM 需要记住 | session_id + task_id | **只有 session_id** |
| 获取结果 | `output --task xxx` | `read --unread-only` |
| 复杂度 | 较高 | **低** |

---

## 8. LLM 集成

### 8.1 Skill 定义

```yaml
---
name: ssh
description: SSH remote server management...
allowed-tools:
  - Bash(node scripts/ssh-skill.js *)
---
```

### 8.2 LLM 职责

- [ ] 连接后立即保存 session_id
- [ ] 每次操作前确认 session_id 可用
- [ ] session_id 丢失时告知用户重新连接
- [ ] 不在公开场合显示完整 session_id

---

✌Bazinga！
