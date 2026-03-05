# SSH Skill

> Claude Skill for SSH remote server management with SQLite storage

## 特点

- **SQLite 存储** - 高性能、结构化查询
- **会话持久化** - SSH 连接保持在后台运行
- **异步执行** - 命令立即返回，不阻塞
- **消息历史** - 支持复杂查询和搜索
- **已读未读** - 消息状态追踪

## 存储结构

```
~/.ssh-skill/
├── ssh-skill.db       # SQLite 数据库
├── manager.pid        # 管理器进程 ID
└── commands/          # 命令队列（临时）
```

## 数据库表

```sql
-- 会话表
sessions (id, host, port, username, status, config, created_at, updated_at)

-- 任务表  
tasks (id, session_id, command, status, output, stderr, exit_code, created_at)

-- 消息表
messages (id, session_id, task_id, timestamp, type, content, stream, read)
```

## 快速开始

```bash
# 安装依赖
npm install

# 启动管理器
node scripts/ssh-skill.js start-manager

# 连接服务器
node scripts/ssh-skill.js connect --host 192.168.1.100 --username admin

# 执行命令
node scripts/ssh-skill.js exec --session sess_xxx --command "df -h"

# 查看命令历史
node scripts/ssh-skill.js history --session sess_xxx

# 获取任务输出
node scripts/ssh-skill.js output --task task_xxx
```

## 核心命令

| 命令 | 说明 |
|------|------|
| `history` | 获取命令清单（含 task_id） |
| `output --task ID` | 根据 task_id 获取详细结果 |
| `read` | 读取消息（支持过滤） |
| `search` | 搜索消息内容 |
| `stats` | 会话统计 |

## 许可证

MIT License

---

✌Bazinga！