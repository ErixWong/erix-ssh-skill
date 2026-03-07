# Session 隔离与创建者绑定设计方案

**创建日期**: 2026-03-07  
**状态**: 草案  
**目标**: 实现多进程访问时的Session与创建者绑定及相互隔离

---

## 1. 问题分析

### 1.1 当前问题

```
当前架构（不安全）:
┌─────────────────────────────────────────────────────────────┐
│                      共享资源                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ data/       │  │ data/       │  │ data/               │  │
│  │ ssh-skill.db│  │ commands/   │  │ manager.pid         │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                    │              │
│         ▼                ▼                    ▼              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Manager (单例，无用户概念)               │   │
│  │    任何进程都可以:                                    │   │
│  │    - 读取所有session的凭据                            │   │
│  │    - 向任意session发送命令                            │   │
│  │    - 断开任意session                                  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

进程A创建的session ←→ 进程B可以完全访问 ←→ 安全风险！
```

### 1.2 需求

1. **创建者绑定**: Session必须绑定到创建者
2. **访问隔离**: 进程只能访问自己创建的Session
3. **跨平台**: 支持Windows和Linux
4. **多进程支持**: 多个进程可以同时使用，互不干扰

---

## 2. 解决方案

### 2.1 方案概述

采用 **Client ID + 用户级隔离 + IPC认证** 的三层防护机制：

```
┌─────────────────────────────────────────────────────────────────────┐
│                           用户空间                                   │
│                                                                     │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐ │
│  │    进程 A        │    │    进程 B        │    │    进程 C        │ │
│  │ client_id: A    │    │ client_id: B    │    │ client_id: C    │ │
│  │                 │    │                 │    │                 │ │
│  │ session_1 ←─────┼────┼─────────────────┼────┤ 无法访问        │ │
│  │ session_2 ←─────┼────┼─────────────────┼────┤ 无法访问        │ │
│  │                 │    │ session_3 ←─────┼────┤ 无法访问        │ │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘ │
│           │                      │                      │          │
│           └──────────────────────┼──────────────────────┘          │
│                                  │                                 │
│                                  ▼                                 │
│           ┌─────────────────────────────────────────────────────┐  │
│           │              Manager (带认证层)                      │  │
│           │  ┌─────────────────────────────────────────────┐    │  │
│           │  │         Session 所有权表                     │    │  │
│           │  │  session_1 → client_A                       │    │  │
│           │  │  session_2 → client_A                       │    │  │
│           │  │  session_3 → client_B                       │    │  │
│           │  └─────────────────────────────────────────────┘    │  │
│           │                                                    │  │
│           │  访问控制: 只有所属client才能操作session            │  │
│           └─────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 核心组件

#### 2.2.1 Client Identity (客户端身份)

```javascript
// lib/client-identity.js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

class ClientIdentity {
  constructor() {
    this.clientId = null;
    this.secretKey = null;
    this.identityPath = null;
  }

  /**
   * 初始化或加载客户端身份
   * 每个进程实例有唯一的clientId和secretKey
   */
  init() {
    // 使用进程启动时间 + 随机数生成唯一ID
    this.clientId = `client_${process.pid}_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    
    // 生成通信密钥（用于签名命令）
    this.secretKey = crypto.randomBytes(32);
    
    // 存储身份信息到临时文件（仅当前用户可读）
    const identityDir = this.getIdentityDir();
    if (!fs.existsSync(identityDir)) {
      fs.mkdirSync(identityDir, { recursive: true, mode: 0o700 });
    }
    
    this.identityPath = path.join(identityDir, `${this.clientId}.json`);
    
    const identity = {
      clientId: this.clientId,
      secretKey: this.secretKey.toString('hex'),
      pid: process.pid,
      createdAt: new Date().toISOString()
    };
    
    fs.writeFileSync(this.identityPath, JSON.stringify(identity), { mode: 0o600 });
    
    // 注册退出时清理
    this.registerCleanup();
    
    return this.clientId;
  }

  /**
   * 获取身份目录（用户级别隔离）
   */
  getIdentityDir() {
    if (process.platform === 'win32') {
      // Windows: 使用 %LOCALAPPDATA%
      return path.join(process.env.LOCALAPPDATA || process.env.APPDATA, 'ssh-skill', 'clients');
    }
    // Linux/macOS: 使用 XDG_RUNTIME_DIR 或 ~/.local/share
    return process.env.XDG_RUNTIME_DIR 
      || path.join(os.homedir(), '.local', 'share', 'ssh-skill', 'clients');
  }

  /**
   * 签名命令
   */
  signCommand(command) {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    
    const payload = JSON.stringify({ ...command, timestamp, nonce });
    const signature = crypto
      .createHmac('sha256', this.secretKey)
      .update(payload)
      .digest('hex');
    
    return {
      clientId: this.clientId,
      timestamp,
      nonce,
      signature,
      payload: command
    };
  }

  /**
   * 清理身份文件
   */
  registerCleanup() {
    const cleanup = () => {
      try {
        if (this.identityPath && fs.existsSync(this.identityPath)) {
          fs.unlinkSync(this.identityPath);
        }
      } catch (e) {
        // 忽略清理错误
      }
    };
    
    process.on('exit', cleanup);
    process.on('SIGINT', () => { cleanup(); process.exit(0); });
    process.on('SIGTERM', () => { cleanup(); process.exit(0); });
  }
}

module.exports = new ClientIdentity();
```

#### 2.2.2 Session Ownership (Session所有权)

```javascript
// lib/session-ownership.js

/**
 * Session所有权管理
 * 
 * 数据库表结构变更:
 * 
 * ALTER TABLE sessions ADD COLUMN owner_id TEXT NOT NULL;
 * ALTER TABLE sessions ADD COLUMN owner_pid INTEGER;
 * 
 * 或创建新表:
 * CREATE TABLE session_ownership (
 *   session_id TEXT PRIMARY KEY,
 *   owner_id TEXT NOT NULL,
 *   owner_pid INTEGER,
 *   created_at TEXT NOT NULL,
 *   FOREIGN KEY (session_id) REFERENCES sessions(id)
 * );
 */

class SessionOwnership {
  constructor(db) {
    this.db = db;
    this.ownershipCache = new Map(); // 内存缓存
  }

  /**
   * 绑定Session到创建者
   */
  bindSession(sessionId, clientId) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO session_ownership (session_id, owner_id, owner_pid, created_at)
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run(sessionId, clientId, process.pid, new Date().toISOString());
    this.ownershipCache.set(sessionId, clientId);
  }

  /**
   * 检查所有权
   */
  checkOwnership(sessionId, clientId) {
    // 先查缓存
    const cached = this.ownershipCache.get(sessionId);
    if (cached) {
      return cached === clientId;
    }
    
    // 查数据库
    const stmt = this.db.prepare(`
      SELECT owner_id FROM session_ownership WHERE session_id = ?
    `);
    const row = stmt.get(sessionId);
    
    if (!row) {
      return false; // 无所有权记录
    }
    
    // 更新缓存
    this.ownershipCache.set(sessionId, row.owner_id);
    
    return row.owner_id === clientId;
  }

  /**
   * 获取用户的所有Session
   */
  getUserSessions(clientId) {
    const stmt = this.db.prepare(`
      SELECT s.* FROM sessions s
      JOIN session_ownership o ON s.id = o.session_id
      WHERE o.owner_id = ?
      ORDER BY s.created_at DESC
    `);
    
    return stmt.all(clientId);
  }

  /**
   * 释放Session所有权（删除session时调用）
   */
  releaseSession(sessionId) {
    const stmt = this.db.prepare(`
      DELETE FROM session_ownership WHERE session_id = ?
    `);
    stmt.run(sessionId);
    this.ownershipCache.delete(sessionId);
  }

  /**
   * 清理孤儿Session（owner进程已退出）
   */
  cleanOrphanSessions() {
    const stmt = this.db.prepare(`
      SELECT session_id, owner_pid FROM session_ownership
    `);
    
    const orphans = [];
    
    for (const row of stmt.iterate()) {
      try {
        // 检查进程是否存在
        if (row.owner_pid) {
          process.kill(row.owner_pid, 0);
        }
      } catch (e) {
        // 进程不存在
        orphans.push(row.session_id);
      }
    }
    
    // 清理孤儿session
    for (const sessionId of orphans) {
      this.releaseSession(sessionId);
      // 可选：也断开SSH连接
    }
    
    return orphans;
  }
}

module.exports = SessionOwnership;
```

#### 2.2.3 Secure IPC (安全通信)

```javascript
// lib/secure-ipc.js
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

class SecureIPC {
  constructor() {
    this.socketPath = null;
    this.server = null;
    this.clients = new Map(); // clientId -> { secretKey, authenticated }
  }

  /**
   * 获取Socket路径（用户级别隔离）
   */
  getSocketPath() {
    if (process.platform === 'win32') {
      // Windows Named Pipe - 自动用户隔离
      // 格式: \\.\pipe\ssh-skill-{username}-{random}
      const username = process.env.USERNAME || process.env.USER;
      return `\\\\.\\pipe\\ssh-skill-${username}`;
    }
    
    // Unix Socket - 放在用户目录
    const runtimeDir = process.env.XDG_RUNTIME_DIR 
      || path.join(os.homedir(), '.ssh-skill');
    
    return path.join(runtimeDir, 'manager.sock');
  }

  /**
   * 启动IPC服务器（Manager端）
   */
  async startServer(commandHandler) {
    this.socketPath = this.getSocketPath();
    
    // 确保目录存在
    const socketDir = path.dirname(this.socketPath);
    if (!fs.existsSync(socketDir)) {
      fs.mkdirSync(socketDir, { recursive: true, mode: 0o700 });
    }
    
    // 清理旧socket
    if (process.platform !== 'win32' && fs.existsSync(this.socketPath)) {
      fs.unlinkSync(this.socketPath);
    }
    
    this.server = net.createServer((socket) => {
      this.handleConnection(socket, commandHandler);
    });
    
    return new Promise((resolve, reject) => {
      this.server.listen(this.socketPath, () => {
        // Unix系统设置权限
        if (process.platform !== 'win32') {
          fs.chmodSync(this.socketPath, 0o600);
        }
        console.log(`IPC server listening on ${this.socketPath}`);
        resolve();
      });
      this.server.on('error', reject);
    });
  }

  /**
   * 处理连接
   */
  handleConnection(socket, commandHandler) {
    let buffer = Buffer.alloc(0);
    let authenticated = false;
    let clientId = null;
    
    socket.on('data', async (data) => {
      buffer = Buffer.concat([buffer, data]);
      
      try {
        const message = JSON.parse(buffer.toString());
        buffer = Buffer.alloc(0);
        
        // 首次连接需要认证
        if (!authenticated) {
          const authResult = this.authenticateClient(message);
          if (!authResult.success) {
            socket.end(JSON.stringify({ error: authResult.error }));
            return;
          }
          
          authenticated = true;
          clientId = message.clientId;
          this.clients.set(clientId, {
            secretKey: Buffer.from(message.secretKey, 'hex'),
            socket
          });
          
          socket.write(JSON.stringify({ success: true, authenticated: true }));
          return;
        }
        
        // 验证签名
        if (!this.verifySignature(message, clientId)) {
          socket.end(JSON.stringify({ error: 'Invalid signature' }));
          return;
        }
        
        // 处理命令（带clientId）
        const result = await commandHandler(message.payload, clientId);
        socket.write(JSON.stringify(result));
        
      } catch (e) {
        // 数据不完整，继续接收
      }
    });
    
    socket.on('close', () => {
      if (clientId) {
        this.clients.delete(clientId);
      }
    });
  }

  /**
   * 认证客户端
   */
  authenticateClient(message) {
    if (!message.clientId || !message.secretKey) {
      return { success: false, error: 'Missing credentials' };
    }
    
    // 验证clientId格式
    if (!message.clientId.startsWith('client_')) {
      return { success: false, error: 'Invalid client ID' };
    }
    
    // 可选：验证客户端身份文件是否存在
    // 这里简化处理，信任首次连接
    
    return { success: true };
  }

  /**
   * 验证消息签名
   */
  verifySignature(message, clientId) {
    const client = this.clients.get(clientId);
    if (!client) return false;
    
    const { signature, timestamp, nonce, payload } = message;
    
    // 检查时间戳（防止重放攻击）
    const now = Date.now();
    if (Math.abs(now - timestamp) > 60000) { // 60秒有效期
      return false;
    }
    
    // 验证签名
    const expectedSig = crypto
      .createHmac('sha256', client.secretKey)
      .update(JSON.stringify({ ...payload, timestamp, nonce }))
      .digest('hex');
    
    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSig, 'hex')
      );
    } catch {
      return false;
    }
  }

  /**
   * 客户端连接（Client端）
   */
  async connect(clientId, secretKey) {
    const socketPath = this.getSocketPath();
    
    return new Promise((resolve, reject) => {
      const socket = net.connect(socketPath, () => {
        // 发送认证
        socket.write(JSON.stringify({
          type: 'auth',
          clientId,
          secretKey: secretKey.toString('hex')
        }));
      });
      
      let buffer = Buffer.alloc(0);
      
      socket.on('data', (data) => {
        buffer = Buffer.concat([buffer, data]);
        
        try {
          const response = JSON.parse(buffer.toString());
          if (response.authenticated) {
            this.clientSocket = socket;
            this.clientBuffer = Buffer.alloc(0);
            resolve(true);
          } else if (response.error) {
            reject(new Error(response.error));
          }
        } catch (e) {
          // 数据不完整
        }
      });
      
      socket.on('error', reject);
    });
  }

  /**
   * 发送命令（Client端）
   */
  async sendCommand(payload, clientId, secretKey) {
    if (!this.clientSocket) {
      throw new Error('Not connected');
    }
    
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    
    const signature = crypto
      .createHmac('sha256', secretKey)
      .update(JSON.stringify({ ...payload, timestamp, nonce }))
      .digest('hex');
    
    const message = {
      clientId,
      timestamp,
      nonce,
      signature,
      payload
    };
    
    return new Promise((resolve, reject) => {
      this.clientSocket.write(JSON.stringify(message));
      
      const handler = (data) => {
        this.clientBuffer = Buffer.concat([this.clientBuffer, data]);
        
        try {
          const response = JSON.parse(this.clientBuffer.toString());
          this.clientBuffer = Buffer.alloc(0);
          this.clientSocket.off('data', handler);
          resolve(response);
        } catch (e) {
          // 数据不完整
        }
      };
      
      this.clientSocket.on('data', handler);
    });
  }
}

module.exports = new SecureIPC();
```

### 2.3 数据库Schema变更

```sql
-- 添加所有权表
CREATE TABLE IF NOT EXISTS session_ownership (
  session_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  owner_pid INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_ownership_owner ON session_ownership(owner_id);

-- 添加审计日志表
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  client_id TEXT,
  action TEXT NOT NULL,
  session_id TEXT,
  details TEXT,
  ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_client ON audit_log(client_id);
```

---

## 3. 完整架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              用户空间                                        │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        Client Process A                               │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │  │
│  │  │ ClientIdentity  │  │ SecureIPC       │  │ Local Operations    │  │  │
│  │  │ - clientId      │  │ - connect()     │  │ - listMySessions()  │  │  │
│  │  │ - secretKey     │  │ - sendCommand() │  │                     │  │  │
│  │  │ - signCommand() │  │                 │  │                     │  │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│                                    │ Unix Socket / Named Pipe               │
│                                    │ (用户级别隔离)                          │
│                                    ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                          Manager Process                              │  │
│  │                                                                       │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │                    Access Control Layer                         │  │  │
│  │  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │  │  │
│  │  │  │ ClientRegistry   │  │ SessionOwnership │  │ AuditLogger  │  │  │  │
│  │  │  │ - authenticate() │  │ - bindSession()  │  │ - log()      │  │  │  │
│  │  │  │ - verifySig()    │  │ - checkOwner()   │  │              │  │  │  │
│  │  │  └──────────────────┘  └──────────────────┘  └──────────────┘  │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                                    │                                  │  │
│  │                                    ▼                                  │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │                    Core SSH Operations                          │  │  │
│  │  │  - connect(sessionId, config, clientId)  ← 绑定所有权           │  │  │
│  │  │  - exec(sessionId, command, clientId)    ← 检查所有权           │  │  │
│  │  │  - disconnect(sessionId, clientId)       ← 检查所有权           │  │  │
│  │  │  - listSessions(clientId)                ← 只返回用户的session  │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  │                                    │                                  │  │
│  │                                    ▼                                  │  │
│  │  ┌────────────────────────────────────────────────────────────────┐  │  │
│  │  │                    Storage Layer                                │  │  │
│  │  │  ┌─────────────────────────────────────────────────────────┐   │  │  │
│  │  │  │ SQLite Database (用户目录, 600权限)                      │   │  │  │
│  │  │  │ - sessions (含加密config)                                │   │  │  │
│  │  │  │ - session_ownership                                     │   │  │  │
│  │  │  │ - audit_log                                             │   │  │  │
│  │  │  └─────────────────────────────────────────────────────────┘   │  │  │
│  │  └────────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  跨用户隔离: 不同操作系统用户有各自独立的Manager和数据目录                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

Windows 隔离机制:
├── Named Pipe: \\.\pipe\ssh-skill-{username}  (自动用户隔离)
├── 数据目录: %LOCALAPPDATA%\ssh-skill\        (用户专属)
└── ACL: 仅当前用户有访问权限

Linux 隔离机制:
├── Unix Socket: $XDG_RUNTIME_DIR/ssh-skill/manager.sock (用户专属, 600)
├── 数据目录: ~/.local/share/ssh-skill/       (用户专属, 700)
└── 文件权限: 600/700                         (仅所有者可访问)
```

---

## 4. 使用示例

### 4.1 客户端代码

```javascript
// 使用示例
const ClientIdentity = require('./lib/client-identity');
const SecureIPC = require('./lib/secure-ipc');

async function main() {
  // 1. 初始化客户端身份
  const clientId = ClientIdentity.init();
  console.log('My Client ID:', clientId);
  
  // 2. 连接到Manager
  await SecureIPC.connect(clientId, ClientIdentity.secretKey);
  console.log('Connected to Manager');
  
  // 3. 创建Session（自动绑定到当前client）
  const createResult = await SecureIPC.sendCommand({
    action: 'connect',
    host: '192.168.1.100',
    username: 'admin',
    password: 'secret'
  }, clientId, ClientIdentity.secretKey);
  
  console.log('Session created:', createResult.sessionId);
  
  // 4. 执行命令（只有创建者可以执行）
  const execResult = await SecureIPC.sendCommand({
    action: 'exec',
    sessionId: createResult.sessionId,
    command: 'ls -la'
  }, clientId, ClientIdentity.secretKey);
  
  // 5. 列出我的Sessions（只返回当前client创建的）
  const listResult = await SecureIPC.sendCommand({
    action: 'list'
  }, clientId, ClientIdentity.secretKey);
  
  console.log('My sessions:', listResult.sessions);
}

main().catch(console.error);
```

### 4.2 Manager端处理

```javascript
// Manager端命令处理
async function handleCommand(payload, clientId) {
  // 审计日志
  auditLog(clientId, payload.action, payload);
  
  switch (payload.action) {
    case 'connect': {
      const sessionId = createSession(payload);
      
      // 绑定所有权
      sessionOwnership.bindSession(sessionId, clientId);
      
      // 建立SSH连接
      await setupConnection(sessionId, payload);
      
      return { success: true, sessionId };
    }
    
    case 'exec': {
      // 检查所有权
      if (!sessionOwnership.checkOwnership(payload.sessionId, clientId)) {
        return { 
          success: false, 
          error: 'Access denied: session not owned by this client' 
        };
      }
      
      // 执行命令
      const result = await executeCommand(payload.sessionId, payload.command);
      return { success: true, result };
    }
    
    case 'list': {
      // 只返回当前用户的sessions
      const sessions = sessionOwnership.getUserSessions(clientId);
      return { success: true, sessions };
    }
    
    case 'disconnect': {
      // 检查所有权
      if (!sessionOwnership.checkOwnership(payload.sessionId, clientId)) {
        return { 
          success: false, 
          error: 'Access denied: session not owned by this client' 
        };
      }
      
      await disconnect(payload.sessionId);
      sessionOwnership.releaseSession(payload.sessionId);
      
      return { success: true };
    }
    
    default:
      return { success: false, error: 'Unknown action' };
  }
}
```

---

## 5. 安全特性总结

| 特性 | 实现方式 | Windows | Linux |
|------|----------|---------|-------|
| **用户级隔离** | 数据存储在用户目录 | `%LOCALAPPDATA%` | `~/.local/share` |
| **进程级隔离** | Client ID绑定 | ✓ | ✓ |
| **通信安全** | Unix Socket/Named Pipe | Named Pipe | Unix Socket |
| **消息认证** | HMAC签名 | ✓ | ✓ |
| **防重放** | 时间戳+nonce | ✓ | ✓ |
| **文件权限** | 严格权限控制 | ACL | 600/700 |
| **审计追踪** | 操作日志 | ✓ | ✓ |

---

## 6. 实施步骤

1. **Phase 1: 数据库变更** (1天)
   - 添加 `session_ownership` 表
   - 添加 `audit_log` 表
   - 迁移现有数据

2. **Phase 2: IPC改造** (2-3天)
   - 实现 `SecureIPC` 模块
   - 实现 `ClientIdentity` 模块
   - 替换现有的文件命令机制

3. **Phase 3: 所有权集成** (1-2天)
   - 实现 `SessionOwnership` 模块
   - 修改所有session操作添加所有权检查
   - 添加审计日志

4. **Phase 4: 测试与文档** (1-2天)
   - 多进程并发测试
   - 安全测试
   - 更新文档

---

✌Bazinga！
