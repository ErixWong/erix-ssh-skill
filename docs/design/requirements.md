# SSH Skill 需求文档

**版本**: 0.3.0  
**更新日期**: 2026-03-29  
**状态**: 当前实现

---

## 1. 项目概述

### 1.1 项目背景

本项目是一个 SSH Skill（技能插件），使 LLM（大语言模型）能够通过 SSH 协议远程连接和操控服务器。

### 1.2 当前实现

- **语言**: JavaScript (Node.js 18+)
- **存储**: JSON 文件存储 (db-json.js)
- **SSH库**: ssh2
- **架构**: Manager (后台进程) + CLI客户端
- **归档**: 写入即归档，支持历史搜索

### 1.3 核心特性

| 特性 | 状态 | 说明 |
|------|------|------|
| SSH 连接管理 | ✅ 已实现 | 支持密码和密钥认证 |
| 异步命令执行 | ✅ 已实现 | 返回 task_id，后台执行 |
| 消息历史 | ✅ 已实现 | JSON 文件持久化存储 |
| 归档机制 | ✅ 已实现 | 写入即归档，支持历史搜索 |
| Sudo 命令 | ✅ 已实现 | PTY 支持，安全密码输入 |
| Portainer CE 管理 | ✅ 已实现 | HTTP API 管理 stacks/containers |
| Session 隔离 | 🚧 设计中 | Capability-based Security |

---

## 2. 架构设计

### 2.1 当前架构

```
┌─────────────────────────────────────────────────────────────┐
│                      用户空间                                │
│                                                             │
│  ┌─────────────────┐          ┌─────────────────────────┐  │
│  │  ssh_client.js  │          │  session_manager.js     │  │
│  │  (CLI 客户端)    │          │  (后台管理进程)          │  │
│  │                 │          │                         │  │
│  │  - 解析命令     │◄────────►│  - 管理 SSH 连接        │  │
│  │  - 格式化输出   │  文件IPC  │  - 执行远程命令         │  │
│  └─────────────────┘          │  - 维护消息历史         │  │
│                               └───────────┬─────────────┘  │
│                                           │                │
│                                           ▼                │
│                               ┌─────────────────────────┐  │
│                               │  db-json.js             │  │
│                               │  - sessions/*.json      │  │
│                               │  - 归档文件             │  │
│                               └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 目录结构

```
skill_ssh_p0/
├── scripts/
│   ├── ssh_client.js          # CLI 客户端
│   ├── session_manager.js     # 后台管理进程
│   ├── db-json.js             # JSON 数据访问层
│   └── portainerce.js         # Portainer CE 管理脚本
├── data/                      # 数据目录 (gitignore)
│   ├── sessions/              # Session 数据目录
│   │   ├── sess_xxx.json      # 主文件（固定 50 轮命令）
│   │   ├── sess_xxx.1.json    # 归档文件
│   │   └── sess_xxx.2.json    # 归档文件
│   ├── hosts/                 # 主机配置目录
│   │   ├── vllm.json          # SSH 配置
│   │   └── vllm.portainer.json # Portainer 配置
│   ├── manager.pid            # Manager 进程 PID
│   └── commands/              # 命令队列目录
├── docs/
│   ├── SOUL.md                # 项目人设文档
│   └── design/                # 设计文档
│       ├── requirements.md    # 需求文档
│       ├── archive-design.md  # 归档设计
│       ├── interactive-sudo-design.md # Sudo 设计
│       ├── portainerce-design.md # Portainer CE 管理脚本设计
│       └── SESSION_ISOLATION_SIMPLE.md # Session 隔离简化方案
├── SKILL.md                   # LLM Skill 定义
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
| `delete` | ✅ | 删除 session 和历史（包括归档） |
| `list` | ❌ 已移除 | 安全原因（防止枚举） |

### 3.2 命令执行

| 命令 | 状态 | 说明 |
|------|------|------|
| `exec` | ✅ | 异步执行命令，返回 task_id |
| `sudo` | ✅ | PTY 模式执行 sudo 命令 |
| `history` | ✅ | 获取命令历史 |
| `output` | ✅ | 获取任务输出 |
| `task-status` | ✅ | 获取任务状态 |
| `tasks` | ✅ | 列出所有任务 |

### 3.3 消息查询

| 命令 | 状态 | 说明 |
|------|------|------|
| `read` | ✅ | 读取消息（支持过滤） |
| `search` | ✅ | 搜索消息内容（包括归档） |
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

详见: [`SESSION_ISOLATION_SIMPLE.md`](SESSION_ISOLATION_SIMPLE.md)

### 4.2 Sudo 命令安全

```
密码传递方式（按优先级）:
1. --password-file FILE  - 从文件读取（推荐脚本使用）
2. SUDO_PASSWORD 环境变量 - CI/CD 场景
3. 交互式隐藏输入 - 手动操作

安全措施:
- 密码不通过命令行参数传递（已废弃 --password）
- 输出中自动屏蔽密码
- 命令完成后清除内存中的密码引用
```

详见: [`interactive-sudo-design.md`](interactive-sudo-design.md)

### 4.3 待实现的安全改进

| 优先级 | 改进项 | 状态 | 说明 |
|--------|--------|------|------|
| P0 | Session ID 安全生成 | 🚧 设计完成 | 256位随机数 |
| P0 | 文件权限控制 | 📝 待实现 | 600/700 权限 |
| P1 | 凭据加密存储 | 📝 待实现 | AES-256-GCM |
| P1 | 审计日志 | 📝 待实现 | 操作记录 |
| P2 | Unix Socket 通信 | 📝 待实现 | 替代文件 IPC |

---

## 5. 数据模型

### 5.1 Session 数据结构

```javascript
// sess_xxx.json - 主文件
{
  "session": {
    "id": "sess_xxx",
    "host": "192.168.1.100",
    "port": 22,
    "username": "admin",
    "status": "connected",
    "created_at": "2026-03-29T00:00:00Z",
    "updated_at": "2026-03-29T01:00:00Z"
  },
  "tasks": [
    {
      "id": "task_xxx",
      "command": "ls -la",
      "status": "completed",
      "exit_code": 0,
      "created_at": "...",
      "completed_at": "..."
    }
  ],
  "messages": [
    {
      "id": "msg_xxx",
      "type": "command",
      "task_id": "task_xxx",
      "content": "ls -la",
      "timestamp": "..."
    },
    {
      "id": "msg_yyy",
      "type": "output",
      "task_id": "task_xxx",
      "content": "file1.txt\nfile2.txt",
      "stream": "stdout",
      "timestamp": "..."
    }
  ]
}
```

### 5.2 归档文件结构

```javascript
// sess_xxx.1.json - 归档文件（最大 100KB）
{
  "messages": [
    // 历史消息，追加写入
  ],
  "archive_num": 1,
  "created_at": "...",
  "session_id": "sess_xxx"
}
```

### 5.3 归档配置

```javascript
const ARCHIVE_CONFIG = {
  keepRecentCommands: 50,        // 主文件保留最近 50 轮命令
  archiveMaxSize: 100 * 1024     // 归档文件最大 100KB
};
```

详见: [`archive-design.md`](archive-design.md)

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

---

## 7. LLM 集成

### 7.1 Skill 定义 (SKILL.md)

```yaml
---
name: ssh
description: SSH remote server management toolkit...
allowed-tools:
  - Bash(node scripts/ssh_client.js *)
---
```

### 7.2 LLM 职责

- [x] 连接后立即保存 Session ID
- [x] 每次操作前确认 Session ID 可用
- [x] Session ID 丢失时告知用户重新连接
- [x] 不在公开场合显示完整 Session ID

---

## 8. 发布计划

### v0.3.0 (当前)

- [x] JSON 文件存储（替代 SQLite）
- [x] 写入即归档机制
- [x] Sudo 命令支持（PTY）
- [x] 历史搜索（包括归档）
- [x] Session ID 安全设计
- [x] Portainer CE 管理脚本

### v0.4.0 (计划)

- [ ] Session ID 安全生成（256位随机）
- [ ] 文件权限控制
- [ ] 凭据加密存储
- [ ] Unix Socket 通信

### v0.5.0 (计划)

- [ ] 审计日志
- [ ] 命令签名验证
- [ ] 多主机配置管理

---

## 9. 参考资料

- [ssh2 npm package](https://www.npmjs.com/package/ssh2)
- [Capability-based Security](https://en.wikipedia.org/wiki/Capability-based_security)
- [OWASP Command Injection](https://owasp.org/www-community/attacks/Command_Injection)

✌Bazinga！
