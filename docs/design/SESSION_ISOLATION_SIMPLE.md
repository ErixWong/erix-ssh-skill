# Session 隔离简化方案：Session ID as Secret

**创建日期**: 2026-03-07  
**状态**: 草案  
**核心思路**: Session ID 本身就是访问凭证，不需要额外的所有权管理

---

## 1. 原理解释

### 1.1 当前问题

```
当前 session_id 格式: sess_12345678_abcd

问题: 
- session_id 可预测（时间戳+短随机数）
- 任何知道 session_id 的进程都可以操作
- 数据库中 session_id 明文存储，任何人都可读取
```

### 1.2 Capability-based Security (能力安全模型)

核心思想：**拥有能力（Capability）= 拥有访问权限**

```
传统模型:
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   用户/进程   │ ──► │  访问控制检查 │ ──► │   资源      │
└─────────────┘     └─────────────┘     └─────────────┘
                     需要维护谁可以访问什么

Capability模型:
┌─────────────┐     ┌─────────────┐
│   用户/进程   │ ──► │   资源      │
│ (持有Capability)│   │ (无额外检查) │
└─────────────┘     └─────────────┘
                     拥有不可伪造的token = 拥有访问权
```

### 1.3 简化方案

**Session ID = 不可猜测的随机Token**

```
新 session_id 格式: sess_c7f8a9b2e4d6f1a3b5c7d9e8f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9

特点:
- 256位随机数（64个十六进制字符）
- 不可预测、不可暴力破解
- 知道 session_id = 拥有该 session 的完全控制权
- 不提供 session list 功能（防止遍历）
```

---

## 2. 简化方案实现

### 2.1 Session ID 生成

```javascript
// lib/secure-session-id.js
const crypto = require('crypto');

/**
 * 生成安全的 Session ID
 * 
 * 原理：使用加密安全的随机数生成器
 * 256位 = 2^256 种可能性，暴力破解不可行
 */
function generateSecureSessionId() {
  // 32字节 = 256位 = 64个十六进制字符
  const randomBytes = crypto.randomBytes(32);
  return `sess_${randomBytes.toString('hex')}`;
}

/**
 * 验证 Session ID 格式
 */
function isValidSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') {
    return false;
  }
  
  // sess_ + 64个十六进制字符
  const pattern = /^sess_[0-9a-f]{64}$/;
  return pattern.test(sessionId);
}

module.exports = {
  generateSecureSessionId,
  isValidSessionId
};
```

### 2.2 修改 db.js

```javascript
// scripts/db.js 修改

const { generateSecureSessionId } = require('../lib/secure-session-id');

/**
 * 创建新 Session
 * 
 * 关键变更：
 * 1. 使用安全的随机 session_id
 * 2. session_id 不再存储在数据库中，只返回给创建者
 * 3. 数据库中使用内部 id（自增或UUID）作为主键
 */
function createSession(config) {
  // 生成安全的 session_id（这就是访问凭证）
  const sessionId = generateSecureSessionId();
  
  // 数据库内部使用 hash(session_id) 作为索引（可选，增加安全性）
  // 或者直接用 session_id 作为主键
  const sessionIdHash = crypto
    .createHash('sha256')
    .update(sessionId)
    .digest('hex');
  
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO sessions (id, id_hash, host, port, username, status, config, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  stmt.run(
    sessionId,        // 实际的 session_id（也可以只存hash）
    sessionIdHash,    // 用于快速查找
    config.host,
    config.port || 22,
    config.username,
    'connecting',
    JSON.stringify(config),  // 注意：仍需加密敏感信息
    now,
    now
  );
  
  // 返回完整的 session_id 给创建者（这是唯一能访问这个session的凭证）
  return sessionId;
}

/**
 * 获取 Session
 * 
 * 只有提供完整 session_id 的人才能获取
 */
function getSession(sessionId) {
  // 验证格式
  if (!isValidSessionId(sessionId)) {
    return null;
  }
  
  const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?');
  const row = stmt.get(sessionId);
  
  if (!row) return null;
  
  // 返回session信息（不包含完整凭据，只返回状态）
  return {
    id: row.id,
    host: row.host,
    port: row.port,
    username: row.username,
    status: row.status,
    createdAt: row.created_at
    // 不返回 config（凭据）
  };
}

/**
 * 获取完整配置（仅内部使用）
 */
function getFullConfig(sessionId) {
  if (!isValidSessionId(sessionId)) {
    return null;
  }
  
  const stmt = db.prepare('SELECT config FROM sessions WHERE id = ?');
  const row = stmt.get(sessionId);
  
  return row ? JSON.parse(row.config) : null;
}

// 不再提供 listSessions() 功能！
// 或者只提供统计信息：
function getSessionStats() {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM sessions');
  return stmt.get();
}
```

### 2.3 通信安全（简化版）

既然 session_id 就是 secret，通信安全可以简化：

```javascript
// 方案A：继续使用文件命令，但增加 session_id 验证

// 命令格式
{
  "action": "exec",
  "session_id": "sess_c7f8a9b2e4d6f1a3...",  // 必须提供完整正确的 session_id
  "command": "ls -la"
}

// Manager 处理时：
// 1. 验证 session_id 格式
// 2. 查找是否存在
// 3. 存在 = 有权限，执行命令
// 4. 不存在 = 无权限或无效，返回错误
```

```javascript
// 方案B：使用 Unix Socket + session_id 双重保护

// 连接时不需要认证
// 但每个命令都必须提供正确的 session_id
// session_id 本身就是访问令牌

async function handleCommand(cmd) {
  // 验证 session_id
  if (!isValidSessionId(cmd.session_id)) {
    return { error: 'Invalid session ID format' };
  }
  
  // 检查 session 是否存在
  const session = db.getSession(cmd.session_id);
  if (!session) {
    // 不区分"不存在"和"无权限"，都返回相同错误
    // 防止攻击者枚举 session_id
    return { error: 'Session not found or access denied' };
  }
  
  // 执行操作
  switch (cmd.action) {
    case 'exec':
      return await executeCommand(cmd.session_id, cmd.command);
    case 'disconnect':
      return await disconnect(cmd.session_id);
    // ...
  }
}
```

---

## 3. 安全性分析

### 3.1 为什么安全？

```
假设攻击者想要访问某个 session：

方法1: 猜测 session_id
       空间大小: 2^256 ≈ 1.16 × 10^77
       每秒尝试1亿次，需要 3.67 × 10^63 年
       → 不可行

方法2: 读取数据库获取 session_id
       如果数据库权限正确（600），攻击者无法读取
       → 依赖文件权限

方法3: 监听通信
       如果使用 Unix Socket（权限600），只有创建者可以连接
       → 依赖通信安全
```

### 3.2 与原方案对比

| 特性 | 原复杂方案 | 简化方案 |
|------|-----------|----------|
| **核心机制** | Client ID + 所有权表 | Session ID = Secret |
| **数据库变更** | 需要新表 | 仅改ID生成 |
| **代码复杂度** | 高 | 低 |
| **隔离粒度** | 进程级 | Session级 |
| **Session共享** | 不支持 | 支持（分享ID即可） |
| **撤销访问** | 支持 | 需删除Session |
| **List功能** | 支持（只列自己的） | 不支持 |

### 3.3 适用场景

**简化方案适合：**
- 单用户多进程场景
- 不需要"列出我的sessions"功能
- 进程间可能需要共享session
- 追求简单实现

**复杂方案适合：**
- 需要细粒度权限管理
- 需要审计追踪
- 需要支持session共享但可撤销
- 企业级应用

---

## 4. 完整实现示例

### 4.1 创建Session流程

```
Client                          Manager                     Database
  │                               │                           │
  │  connect(host, user, pass)    │                           │
  │──────────────────────────────►│                           │
  │                               │                           │
  │                               │  generateSecureSessionId()│
  │                               │──────────────────────────►│
  │                               │                           │
  │                               │  INSERT session           │
  │                               │──────────────────────────►│
  │                               │                           │
  │  return session_id            │                           │
  │◄──────────────────────────────│                           │
  │                               │                           │
  │  [Client 保存 session_id]     │                           │
  │  [这就是访问凭证，不要泄露]    │                           │
```

### 4.2 执行命令流程

```
Client                          Manager                     Database
  │                               │                           │
  │  exec(session_id, command)    │                           │
  │──────────────────────────────►│                           │
  │                               │                           │
  │                               │  getSession(session_id)   │
  │                               │──────────────────────────►│
  │                               │                           │
  │                               │  return session (if found)│
  │                               │◄──────────────────────────│
  │                               │                           │
  │                               │  [session存在=有权限]     │
  │                               │  execute via SSH          │
  │                               │──────────────┐            │
  │                               │              │            │
  │  return output                │◄─────────────┘            │
  │◄──────────────────────────────│                           │
```

### 4.3 恶意进程尝试访问

```
Attacker                        Manager                     Database
  │                               │                           │
  │  exec("sess_guess123", cmd)   │                           │
  │──────────────────────────────►│                           │
  │                               │                           │
  │                               │  getSession("sess_guess") │
  │                               │──────────────────────────►│
  │                               │                           │
  │                               │  return null              │
  │                               │◄──────────────────────────│
  │                               │                           │
  │  error: "Session not found"   │                           │
  │◄──────────────────────────────│                           │
  │                               │                           │
  │  [无法区分是ID错误还是无权限]  │                           │
```

---

## 5. 代码修改清单

### 5.1 新增文件

```
lib/
└── secure-session-id.js    # Session ID 生成和验证
```

### 5.2 修改文件

| 文件 | 修改内容 |
|------|----------|
| `scripts/db.js` | 使用 `generateSecureSessionId()`，移除 `listSessions()` |
| `scripts/ssh-skill.js` | 移除 `list` 命令，保存返回的 session_id |
| `scripts/ssh-skill-manager.js` | 添加 session_id 格式验证 |

### 5.3 数据库迁移

```sql
-- 可选：增加 id_hash 列用于快速查找
ALTER TABLE sessions ADD COLUMN id_hash TEXT;

-- 为现有数据生成 hash（如果有）
UPDATE sessions SET id_hash = sha256(id) WHERE id_hash IS NULL;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_sessions_id_hash ON sessions(id_hash);
```

---

## 6. 使用示例

```bash
# 创建 session（返回完整的 session_id）
$ ssh-skill connect --host 192.168.1.100 --user admin
{
  "success": true,
  "session_id": "sess_c7f8a9b2e4d6f1a3b5c7d9e8f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9"
}

# 保存这个 session_id，这是访问该 session 的唯一凭证

# 执行命令（必须提供完整 session_id）
$ ssh-skill exec --session "sess_c7f8a9b2e4d6f1a3b5c7d9e8f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9" --command "ls"
{
  "success": true,
  "output": "file1.txt\nfile2.txt"
}

# 不再支持 list 命令
$ ssh-skill list
{
  "error": "Session listing not supported for security reasons. Use the session_id returned from connect."
}

# 如果需要共享 session，只需分享 session_id（类似分享密码）
# 另一个进程：
$ ssh-skill exec --session "sess_c7f8a9b2e4d6f1a3b5c7d9e8f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9" --command "pwd"
```

---

## 7. 总结

### 核心原理
**Session ID 本身就是访问凭证（Capability）**

### 关键点
1. Session ID 使用 256 位加密安全随机数
2. 知道 Session ID = 拥有该 Session 的完全控制权
3. 不提供 Session 列表功能（防止枚举）
4. 依赖文件权限保护数据库

### 优势
- 实现简单，改动小
- 无需额外的所有权管理
- 天然支持进程间共享（分享ID即可）

### 注意事项
- Session ID 必须妥善保存，丢失无法恢复
- 如果需要撤销某个进程的访问，只能删除整个 Session
- 仍需配合文件权限和通信安全使用

✌Bazinga！
