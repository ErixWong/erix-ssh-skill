# SSH Skill 需求文档

**版本**: 0.2.0  
**更新日期**: 2026-03-07  
**状态**: 当前实现

---

## 1. 项目概述

### 1.1 项目背景

本项目是一个 SSH Skill（技能插件），使 LLM（大语言模型）能够通过 SSH 协议远程连接和操控服务器。

### 1.2 当前实现

- **语言**: JavaScript (Node.js 18+)
- **存储**: SQLite (better-sqlite3)
- **SSH库**: ssh2
- **架构**: Manager (后台进程) + CLI客户端

### 1.3 核心特性

| 特性 | 状态 | 说明 |
|------|------|------|
| SSH 连接管理 | ✅ 已实现 | 支持密码和密钥认证 |
| 异步命令执行 | ✅ 已实现 | 返回 task_id，后台执行 |
| 消息历史 | ✅ 已实现 | SQLite 持久化存储 |
| Session 隔离 | 🚧 设计中 | Capability-based Security |

---

## 2. 架构设计

### 2.1 当前架构

```
┌─────────────────────────────────────────────────────────────┐
│                      用户空间                                │
│                                                             │
│  ┌─────────────────┐          ┌─────────────────────────┐  │
│  │  ssh-skill.js   │          │  ssh-skill-manager.js   │  │
│  │  (CLI 客户端)    │          │  (后台管理进程)          │  │
│  │                 │          │                         │  │
│  │  - 解析命令     │◄────────►│  - 管理 SSH 连接        │  │
│  │  - 格式化输出   │  文件IPC  │  - 执行远程命令         │  │
│  └─────────────────┘          │  - 维护消息历史         │  │
│                               └───────────┬─────────────┘  │
│                                           │                │
│                                           ▼                │
│                               ┌─────────────────────────┐  │
│                               │  db.js (SQLite)         │  │
│                               │  - sessions 表          │  │
│                               │  - tasks 表             │  │
│                               │  - messages 表          │  │
│                               └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 目录结构

```
erix-ssh-skill/
├── scripts/
│   ├── ssh-skill.js          # CLI 客户端 (14KB)
│   ├── ssh-skill-manager.js  # 后台管理进程 (10KB)
│   └── db.js                 # SQLite 数据访问层 (16KB)
├── data/                     # 数据目录 (gitignore)
│   ├── ssh-skill.db          # SQLite 数据库
│   ├── manager.pid           # Manager 进程 PID
│   └── commands/             # 命令队列目录
├── docs/
│   ├── design/               # 设计文档
│   └── SECURITY_AUDIT_REPORT.md
├── SKILL.md                  # LLM Skill 定义
└── package.json
```

---

## 3. 功能需求

### 3.1 Session 管理

| 命令 | 状态 | 说明 |
|------|------|------|
| `start-manager` | ✅ | 启动后台管理进程 |
| `stop-manager` | ✅ | 停止后台管理进程 |
| `connect` | ✅ | 建立 SSH 连接 |
| `disconnect` | ✅ | 断开连接 |
| `delete` | ✅ | 删除 session 和历史 |
| `list` | ❌ 已移除 | 安全原因（防止枚举） |

### 3.2 命令执行

| 命令 | 状态 | 说明 |
|------|------|------|
| `exec` | ✅ | 异步执行命令，返回 task_id |
| `history` | ✅ | 获取命令历史 |
| `output` | ✅ | 获取任务输出 |
| `task-status` | ✅ | 获取任务状态 |
| `tasks` | ✅ | 列出所有任务 |

### 3.3 消息查询

| 命令 | 状态 | 说明 |
|------|------|------|
| `read` | ✅ | 读取消息（支持过滤） |
| `search` | ✅ | 搜索消息内容 |
| `stats` | ✅ | 获取统计信息 |
| `mark-read` | ✅ | 标记已读 |

---

## 4. 安全设计

### 4.1 Session ID 安全机制

**采用 Capability-based Security 模型**

```
核心原理: Session ID = 访问凭证

- Session ID 使用 256 位加密安全随机数
- 知道 Session ID = 拥有该 Session 的完全控制权
- 不提供 Session 列表功能（防止枚举攻击）
- LLM 必须保存 Session ID，丢失无法恢复
```

详见: [`docs/design/SESSION_ISOLATION_SIMPLE.md`](SESSION_ISOLATION_SIMPLE.md)

### 4.2 待实现的安全改进

| 优先级 | 改进项 | 状态 | 说明 |
|--------|--------|------|------|
| P0 | Session ID 安全生成 | 🚧 设计完成 | 256位随机数 |
| P0 | 文件权限控制 | 📝 待实现 | 600/700 权限 |
| P1 | 凭据加密存储 | 📝 待实现 | AES-256-GCM |
| P1 | 审计日志 | 📝 待实现 | 操作记录 |
| P2 | Unix Socket 通信 | 📝 待实现 | 替代文件 IPC |

详见: [`docs/SECURITY_AUDIT_REPORT.md`](../SECURITY_AUDIT_REPORT.md)

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

### 5.2 tasks 表

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  command TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  output TEXT DEFAULT '',
  stderr TEXT DEFAULT '',
  exit_code INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

### 5.3 messages 表

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  task_id TEXT,
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL,  -- command, output, error, complete, system
  content TEXT,
  stream TEXT,  -- stdout, stderr
  read INTEGER DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(id),
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);
```

---

## 6. 通信协议

### 6.1 当前：文件 IPC

```
Client                              Manager
  │                                    │
  │  写入 data/commands/xxx.json       │
  │───────────────────────────────────►│
  │                                    │ 读取并执行
  │                                    │
  │  读取 data/responses/xxx.json      │
  │◄───────────────────────────────────│
  │                                    │
```

**安全问题**: 任何能写入命令目录的进程都可以控制 Manager

### 6.2 计划：Unix Socket / Named Pipe

```
Client                              Manager
  │                                    │
  │  Unix Socket / Named Pipe          │
  │◄──────────────────────────────────►│
  │  (用户级隔离 + 消息签名)            │
  │                                    │
```

详见: [`docs/design/SESSION_ISOLATION_DESIGN.md`](SESSION_ISOLATION_DESIGN.md)

---

## 7. LLM 集成

### 7.1 Skill 定义 (SKILL.md)

```yaml
---
name: ssh
description: SSH remote server management toolkit...
allowed-tools:
  - Bash(node scripts/ssh-skill.js *)
---
```

### 7.2 LLM 职责

- [ ] 连接后立即保存 Session ID
- [ ] 每次操作前确认 Session ID 可用
- [ ] Session ID 丢失时告知用户重新连接
- [ ] 不在公开场合显示完整 Session ID

---

## 8. 发布计划

### v0.2.0 (当前)

- [x] SQLite 存储
- [x] 异步命令执行
- [x] 消息历史查询
- [x] Session ID 安全设计

### v0.3.0 (计划)

- [ ] Session ID 安全生成（256位随机）
- [ ] 文件权限控制
- [ ] 凭据加密存储
- [ ] 移除 list 命令

### v0.4.0 (计划)

- [ ] Unix Socket 通信
- [ ] 审计日志
- [ ] 命令签名验证

---

## 9. 参考资料

- [ssh2 npm package](https://www.npmjs.com/package/ssh2)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [Capability-based Security](https://en.wikipedia.org/wiki/Capability-based_security)
- [OWASP Command Injection](https://owasp.org/www-community/attacks/Command_Injection)

✌Bazinga！
