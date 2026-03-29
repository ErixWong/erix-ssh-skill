# SFTP 功能设计文档

## 概述

为 SSH Skill 添加 SFTP 文件传输功能，支持远程文件管理操作。

## 与现有架构融合

### 现有架构

项目采用 **Client-Manager** 架构：

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  ssh_client.js  │────▶│ session_manager │────▶│   ssh2 (SSH2)   │
│  (CLI Client)   │     │  (Background)   │     │   (SSH/SFTP)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│  commands/*.json│     │  db-json.js     │
│  (Command Queue)│     │  (JSON Storage) │
└─────────────────┘     └─────────────────┘
```

### 融合方案

1. **Session Manager 扩展**
   - 在现有 SSH 连接上初始化 SFTP 会话
   - 复用现有连接池和密码缓存机制
   - 添加 SFTP 命令处理函数

2. **CLI Client 扩展**
   - 添加 SFTP 相关命令
   - 保持与现有命令一致的参数风格

3. **数据存储扩展**
   - Task 结构添加 `type` 字段区分 exec/sftp
   - 复用现有消息系统记录文件操作

## 功能清单

### P0 - 核心功能

| 命令 | 功能 | ssh2 API |
|------|------|----------|
| `sftp-list` | 列出远程目录 | `sftp.readdir()` |
| `sftp-download` | 下载文件 | `sftp.fastGet()` / `sftp.createReadStream()` |
| `sftp-upload` | 上传文件 | `sftp.fastPut()` / `sftp.createWriteStream()` |

### P1 - 基础管理

| 命令 | 功能 | ssh2 API |
|------|------|----------|
| `sftp-stat` | 获取文件信息 | `sftp.stat()` |
| `sftp-mkdir` | 创建目录 | `sftp.mkdir()` |
| `sftp-rmdir` | 删除目录 | `sftp.rmdir()` |
| `sftp-delete` | 删除文件 | `sftp.unlink()` |

### P2 - 高级功能

| 命令 | 功能 | ssh2 API |
|------|------|----------|
| `sftp-rename` | 重命名/移动 | `sftp.rename()` |
| `sftp-read` | 读取文件内容（小文件） | `sftp.open() + read()` |
| `sftp-write` | 写入文件内容（小文件） | `sftp.open() + write()` |

## API 设计

### CLI 命令格式

保持与现有命令一致的风格：

```bash
# 列出目录
node ssh_client.js sftp-list --session sess_xxx --path /home/user

# 下载文件
node ssh_client.js sftp-download --session sess_xxx --remote /etc/config.yml --local ./config.yml

# 上传文件
node ssh_client.js sftp-upload --session sess_xxx --local ./app.js --remote /home/user/app.js

# 创建目录
node ssh_client.js sftp-mkdir --session sess_xxx --path /home/user/newdir

# 获取文件信息
node ssh_client.js sftp-stat --session sess_xxx --path /home/user/file.txt
```

### 返回格式

```json
{
  "success": true,
  "task_id": "task_xxx",
  "type": "sftp_download",
  "status": "completed",
  "bytes_transferred": 1024,
  "source": "/remote/path/file.txt",
  "destination": "./local/file.txt"
}
```

### 目录列表返回格式

```json
{
  "success": true,
  "task_id": "task_xxx",
  "type": "sftp_list",
  "path": "/home/user",
  "files": [
    {
      "name": "file.txt",
      "longname": "-rw-r--r-- 1 user group 1024 Mar 29 10:00 file.txt",
      "size": 1024,
      "mode": 33188,
      "mtime": 1711699200,
      "atime": 1711699200,
      "is_file": true,
      "is_dir": false
    }
  ]
}
```

## 实现细节

### Session Manager 修改

```javascript
// 新增: SFTP 会话缓存
const sftpSessions = new Map();

// 在 setupConnection 中初始化 SFTP
conn.on('ready', () => {
  connections.set(sessionId, conn);
  
  // 初始化 SFTP 会话
  conn.sftp((err, sftp) => {
    if (!err) {
      sftpSessions.set(sessionId, sftp);
    }
  });
  
  // ... 其他现有逻辑
});

// 连接关闭时清理 SFTP
conn.on('close', () => {
  connections.delete(sessionId);
  sftpSessions.delete(sessionId);
});
```

### SFTP 命令处理函数示例

```javascript
async function sftpList(sessionId, taskId, path) {
  const sftp = sftpSessions.get(sessionId);
  if (!sftp) {
    // 错误处理
    return;
  }
  
  sftp.readdir(path, (err, list) => {
    if (err) {
      // 错误处理
      return;
    }
    
    // 格式化输出
    const files = list.map(item => ({
      name: item.filename,
      longname: item.longname,
      size: item.attrs.size,
      mode: item.attrs.mode,
      mtime: item.attrs.mtime,
      is_file: (item.attrs.mode & 0o040000) === 0,
      is_dir: (item.attrs.mode & 0o040000) !== 0
    }));
    
    // 更新任务状态
    db.updateTask({ ...task, status: 'completed', output: files });
  });
}
```

### 大文件传输

使用流式传输避免内存溢出：

```javascript
async function sftpDownload(sessionId, taskId, remotePath, localPath) {
  const sftp = sftpSessions.get(sessionId);
  
  const writeStream = fs.createWriteStream(localPath);
  const readStream = sftp.createReadStream(remotePath);
  
  let bytesTransferred = 0;
  
  readStream.on('data', (chunk) => {
    bytesTransferred += chunk.length;
    // 可选: 更新进度
  });
  
  readStream.pipe(writeStream);
  
  writeStream.on('finish', () => {
    db.updateTask({ 
      ...task, 
      status: 'completed', 
      bytes_transferred: bytesTransferred 
    });
  });
}
```

## 安全考虑

### 路径安全

1. **路径验证** - 防止路径遍历攻击
   ```javascript
   function validatePath(path) {
     // 禁止 .. 路径遍历
     if (path.includes('..')) return false;
     // 禁止绝对路径跳转（可选）
     return true;
   }
   ```

2. **权限继承** - SFTP 使用 SSH 连接的用户权限

### 传输安全

1. **大小限制** - 建议单文件限制 100MB
2. **传输日志** - 记录所有文件操作到消息系统
3. **临时文件** - 下载到临时目录，验证后移动

## 文件结构变更

```
scripts/
├── ssh_client.js      # +150 行 (新增 sftp 命令)
├── session_manager.js # +200 行 (新增 sftp 处理)
├── db-json.js         # +30 行 (扩展 task 结构)
└── sftp_utils.js      # 新建 (可选，SFTP 辅助函数)

SKILL.md               # 更新工具清单
```

## Task 结构扩展

```javascript
{
  "id": "task_xxx",
  "session_id": "sess_xxx",
  "command": "sftp-download /remote/file ./local/file",
  "type": "sftp_download",  // 新增字段
  "status": "completed",
  "created_at": "2026-03-29T10:00:00Z",
  "completed_at": "2026-03-29T10:00:05Z",
  "bytes_transferred": 1024,  // 新增字段
  "source": "/remote/file",   // 新增字段
  "destination": "./local/file"  // 新增字段
}
```

## SKILL.md 更新

新增工具清单：

```markdown
### sftp-list

列出远程目录内容。

**参数：**
- `session`: Session ID（必需）
- `path`: 远程目录路径（必需）

**返回示例：**
{
  "success": true,
  "files": [...]
}

---

### sftp-download

下载远程文件到本地。

**参数：**
- `session`: Session ID（必需）
- `remote`: 远程文件路径（必需）
- `local`: 本地保存路径（必需）

---

### sftp-upload

上传本地文件到远程服务器。

**参数：**
- `session`: Session ID（必需）
- `local`: 本地文件路径（必需）
- `remote`: 远程保存路径（必需）
```

## 工作流程示例

```
1. connect → 建立 SSH 连接，自动初始化 SFTP
2. sftp-list → 查看远程目录结构
3. sftp-download → 下载配置文件
4. (本地编辑文件)
5. sftp-upload → 上传修改后的文件
6. exec → 执行命令使配置生效
7. disconnect → 断开连接
```

## 实现优先级

| 阶段 | 功能 | 预计时间 |
|------|------|----------|
| Phase 1 | sftp-list, download, upload | 4 小时 |
| Phase 2 | stat, mkdir, rmdir, delete | 2 小时 |
| Phase 3 | rename, read, write | 2 小时 |
| Phase 4 | 文档更新、测试 | 2 小时 |

**总计**: 约 10 小时开发时间

## 测试计划

1. **单元测试** - 各 SFTP 命令独立测试
2. **集成测试** - 与现有 session 系统集成测试
3. **边界测试** - 大文件、特殊字符路径、权限错误
4. **安全测试** - 路径遍历攻击防护验证

---

✌Bazinga！