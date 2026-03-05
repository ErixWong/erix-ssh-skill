# SSH Skill 需求文档

## 1. 项目概述

### 1.1 项目背景
本项目旨在开发一个 Claude Skill（技能插件），使 LLM（大语言模型）能够通过 SSH 协议远程连接和操控服务器。该 Skill 将作为 LLM 的工具扩展，赋予 AI 真正的系统操作能力。

### 1.2 项目目标
- 提供安全可靠的 SSH 连接能力
- 支持远程命令执行和结果返回
- 实现文件传输功能（上传/下载）
- 提供完善的权限控制和安全审计机制

### 1.3 目标用户
- 需要自动化运维的开发者
- 希望让 AI 辅助管理服务器的用户
- 需要远程执行任务的系统集成场景

---

## 2. 功能需求

### 2.1 SSH 连接管理

#### 2.1.1 连接配置
| 功能项 | 描述 | 优先级 |
|--------|------|--------|
| 主机配置 | 支持配置主机地址、端口、用户名 | P0 |
| 认证方式 | 支持密码认证和 SSH Key 认证 | P0 |
| 连接池 | 支持多服务器连接管理 | P1 |
| 配置持久化 | 安全存储连接配置 | P1 |
| 跳板机 | 支持 Jump Host 跳板连接 | P2 |

#### 2.1.2 连接生命周期
- **建立连接**: 验证凭据，建立安全通道
- **保活机制**: 心跳检测，自动重连
- **断开连接**: 主动断开，资源清理

### 2.2 命令执行

#### 2.2.1 远程命令执行
| 功能项 | 描述 | 优先级 |
|--------|------|--------|
| 同步执行 | 执行命令并等待结果返回 | P0 |
| 异步执行 | 支持长时间运行的后台任务 | P1 |
| 超时控制 | 命令执行超时机制 | P0 |
| 输出流处理 | stdout/stderr 分离处理 | P0 |
| 退出码获取 | 获取命令执行状态 | P0 |
| 交互式命令 | 支持 sudo 等需要交互的命令 | P2 |

#### 2.2.2 安全控制
- 命令白名单/黑名单机制
- 危险命令拦截（如 `rm -rf /`）
- 命令执行审计日志
- 权限级别控制

### 2.3 文件操作

#### 2.3.1 文件传输
| 功能项 | 描述 | 优先级 |
|--------|------|--------|
| 文件上传 | 本地文件上传到远程服务器 | P1 |
| 文件下载 | 从远程服务器下载文件 | P1 |
| 目录传输 | 支持整个目录的上传/下载 | P2 |
| 断点续传 | 大文件传输支持断点续传 | P2 |
| 进度回调 | 传输进度实时反馈 | P1 |

#### 2.3.2 文件管理
| 功能项 | 描述 | 优先级 |
|--------|------|--------|
| 列出文件 | 列出远程目录内容 | P0 |
| 创建目录 | 在远程服务器创建目录 | P1 |
| 删除文件/目录 | 删除远程文件或目录 | P1 |
| 文件搜索 | 在远程服务器搜索文件 | P2 |
| 权限修改 | 修改文件权限 | P2 |

### 2.4 工具接口（LLM 调用）

#### 2.4.1 Skill 工具定义
为 LLM 提供清晰、安全的工具接口：

```typescript
// 示例工具定义
interface SSHTools {
  // 连接管理
  ssh_connect(config: SSHConfig): Promise<ConnectionResult>;
  ssh_disconnect(connectionId: string): Promise<void>;
  ssh_list_connections(): Promise<ConnectionInfo[]>;
  
  // 命令执行
  ssh_exec(connectionId: string, command: string, options?: ExecOptions): Promise<ExecResult>;
  
  // 文件操作
  ssh_upload(connectionId: string, localPath: string, remotePath: string): Promise<TransferResult>;
  ssh_download(connectionId: string, remotePath: string, localPath: string): Promise<TransferResult>;
  ssh_ls(connectionId: string, path: string): Promise<FileList>;
  ssh_mkdir(connectionId: string, path: string): Promise<void>;
  ssh_rm(connectionId: string, path: string): Promise<void>;
}
```

#### 2.4.2 工具返回格式
```typescript
interface ToolResult {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: string;
  };
  metadata?: {
    duration: number;
    timestamp: string;
  };
}
```

---

## 3. 非功能需求

### 3.1 安全性

#### 3.1.1 凭据安全
- SSH 私钥加密存储
- 密码不明文存储
- 支持 Passphrase 保护的密钥
- 凭据访问审计

#### 3.1.2 操作安全
- 敏感操作需要二次确认
- 危险命令拦截机制
- 操作日志完整记录
- 支持 Readonly 模式

### 3.2 可靠性
- 连接异常自动重连
- 网络波动容错
- 命令执行幂等性保证
- 文件传输完整性校验

### 3.3 性能要求
| 指标 | 目标值 |
|------|--------|
| 命令执行延迟 | < 100ms（不含远程执行时间） |
| 并发连接数 | 支持 10+ 并发连接 |
| 文件传输速度 | 接近原生 SFTP 速度 |
| 内存占用 | < 100MB（空闲状态） |

### 3.4 可维护性
- 完善的日志系统
- 配置热更新支持
- 模块化架构设计
- 单元测试覆盖率 > 80%

---

## 4. 技术方案

### 4.1 技术栈选型

| 组件 | 技术选型 | 说明 |
|------|----------|------|
| 运行时 | Node.js 18+ | 支持 ESM，原生 fetch |
| SSH 库 | ssh2 | 成熟稳定的 SSH 客户端库 |
| 配置管理 | dotenv + conf | 环境变量 + 持久化配置 |
| 日志 | winston/pino | 结构化日志 |
| 测试 | Jest + Vitest | 单元测试和集成测试 |
| 类型检查 | TypeScript | 类型安全 |

### 4.2 核心模块架构

```
skill_ssh/
├── src/
│   ├── index.ts              # 入口，导出 Skill 定义
│   ├── connection/
│   │   ├── manager.ts       # 连接管理器
│   │   ├── pool.ts          # 连接池
│   │   └── types.ts         # 类型定义
│   ├── executor/
│   │   ├── command.ts       # 命令执行器
│   │   ├── security.ts      # 安全检查
│   │   └── output.ts        # 输出处理
│   ├── transfer/
│   │   ├── sftp.ts          # SFTP 操作
│   │   └── progress.ts      # 进度管理
│   ├── tools/
│   │   ├── definitions.ts   # LLM 工具定义
│   │   └── handlers.ts      # 工具处理函数
│   ├── security/
│   │   ├── validator.ts     # 命令验证
│   │   ├── sanitizer.ts     # 输入清理
│   │   └── audit.ts         # 审计日志
│   └── utils/
│       ├── logger.ts        # 日志工具
│       └── config.ts        # 配置管理
├── tests/
├── docs/
└── package.json
```

### 4.3 Claude Tools API 集成

本项目作为**库**使用，通过 Claude Tools API 与 LLM 集成：

```
┌─────────────────────────────────────────────────────────────┐
│                      你的应用程序                             │
│                                                             │
│  ┌─────────────┐     Tool Use Request      ┌─────────────┐  │
│  │   你的代码   │ ─────────────────────────→ │  SSH Skill  │  │
│  │             │ ←─────────────────────────── │   (库)      │  │
│  │             │     Tool Result            │             │  │
│  └─────────────┘                            └──────┬──────┘  │
│       │                                            │         │
│       │ tool definitions                    SSH    │         │
│       ▼                                     Protocol│         │
│  ┌─────────────┐                                   ▼         │
│  │ Claude API  │                            ┌─────────────┐  │
│  │             │                            │    服务器    │  │
│  └─────────────┘                            └─────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

#### 使用方式

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { SSHSkill } from 'skill_ssh';

const skill = new SSHSkill();
const client = new Anthropic();

// 1. 获取工具定义，传给 Claude
const tools = skill.getTools();

// 2. 发送请求到 Claude
const response = await client.messages.create({
  model: 'claude-3-opus-20240229',
  tools: tools,
  messages: [{ role: 'user', content: '...' }]
});

// 3. 处理 Claude 返回的 tool_use
for (const block of response.content) {
  if (block.type === 'tool_use') {
    const result = await skill.handleToolUse(block);
    // 将 result 返回给 Claude 继续对话
  }
}
```

#### 工具定义格式

```json
{
  "name": "ssh_exec",
  "description": "在远程服务器上执行命令",
  "input_schema": {
    "type": "object",
    "properties": {
      "connection_id": {
        "type": "string",
        "description": "SSH连接ID"
      },
      "command": {
        "type": "string",
        "description": "要执行的命令"
      },
      "timeout": {
        "type": "number",
        "description": "超时时间(毫秒)",
        "default": 30000
      }
    },
    "required": ["connection_id", "command"]
  }
}
```

#### 安全考虑

1. **凭据不进入对话**: 凭据通过参数传入，可选择是否记录
2. **权限控制**: 通过 `permissionLevel` 限制可执行的命令
3. **审计日志**: 所有操作记录到本地日志文件

---

## 5. 接口设计

### 5.1 连接管理接口

#### ssh_connect
连接到远程服务器

**参数:**
```typescript
{
  host: string;          // 主机地址
  port?: number;         // 端口，默认 22
  username: string;      // 用户名
  password?: string;      // 密码（可选）
  privateKey?: string;   // 私钥路径或内容（可选）
  passphrase?: string;    // 私钥密码（可选）
  name?: string;          // 连接名称（可选）
}
```

**返回:**
```typescript
{
  success: boolean;
  connectionId?: string;  // 连接标识符
  error?: string;
}
```

#### ssh_disconnect
断开指定连接

**参数:**
```typescript
{
  connectionId: string;
}
```

### 5.2 命令执行接口

#### ssh_exec
执行远程命令

**参数:**
```typescript
{
  connectionId: string;
  command: string;
  cwd?: string;          // 工作目录
  timeout?: number;      // 超时时间
  env?: Record<string, string>;  // 环境变量
}
```

**返回:**
```typescript
{
  success: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
  duration?: number;
}
```

### 5.3 文件操作接口

#### ssh_ls
列出远程目录内容

**参数:**
```typescript
{
  connectionId: string;
  path: string;
  hidden?: boolean;  // 是否显示隐藏文件
}
```

**返回:**
```typescript
{
  success: boolean;
  files?: Array<{
    name: string;
    type: 'file' | 'directory' | 'symlink';
    size: number;
    modifiedTime: string;
    permissions: string;
  }>;
  error?: string;
}
```

---

## 6. 安全设计

### 6.1 命令安全策略

#### 危险命令黑名单
```yaml
blacklist:
  - pattern: "rm\\s+-rf\\s+/" 
    action: block
    message: "禁止删除根目录"
  - pattern: "mkfs\\s+"
    action: block
    message: "禁止格式化磁盘"
  - pattern: "dd\\s+.*of=/dev/"
    action: block
    message: "禁止直接写入设备"
  - pattern: ":(){ :|:& };:"
    action: block
    message: "禁止 Fork 炸弹"
```

#### 风险命令警告
```yaml
warning:
  - pattern: "chmod\\s+(-R\\s+)?777"
    action: confirm
    message: "警告：将设置完全开放权限"
  - pattern: "rm\\s+"
    action: log
    message: "删除操作已记录"
```

### 6.2 权限级别

| 级别 | 描述 | 允许操作 |
|------|------|----------|
| readonly | 只读模式 | ls, cat, head, tail 等 |
| standard | 标准模式 | + mkdir, touch, cp, mv |
| admin | 管理模式 | + rm, chmod, chown |
| root | 完全权限 | 所有操作 |

### 6.3 审计日志

所有操作记录包含：
- 时间戳
- 操作类型
- 目标服务器
- 执行命令/操作详情
- 执行结果
- 执行用户（LLM Session）

---

## 7. 测试策略

### 7.1 测试类型

| 类型 | 覆盖范围 | 工具 |
|------|----------|------|
| 单元测试 | 核心逻辑函数 | Jest/Vitest |
| 集成测试 | 模块间协作 | Jest + testcontainers |
| E2E 测试 | 完整工作流 | 自定义 Docker 环境 |
| 安全测试 | 命令注入、权限绕过 | OWASP 指南 |

### 7.2 Mock 策略
- SSH 连接使用 Mock
- 文件系统使用虚拟文件系统
- 网络操作可配置延迟和错误

---

## 8. 发布计划

### Phase 1: MVP (v0.1.0)
- [ ] 基本连接功能
- [ ] 命令执行功能
- [ ] 基本安全控制

### Phase 2: 增强版 (v0.2.0)
- [ ] 文件传输功能
- [ ] 连接池管理
- [ ] 配置持久化

### Phase 3: 生产就绪 (v1.0.0)
- [ ] 完善安全机制
- [ ] 完整审计日志
- [ ] 性能优化
- [ ] 文档完善

---

## 9. 风险评估

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|----------|
| SSH 凭据泄露 | 中 | 高 | 加密存储，环境变量注入 |
| 命令注入攻击 | 中 | 高 | 严格输入验证，命令白名单 |
| 资源耗尽 | 低 | 中 | 超时控制，并发限制 |
| 连接劫持 | 低 | 高 | 使用加密通道，证书验证 |

---

## 10. 参考资料

- [SSH2 Protocol RFC 4254](https://tools.ietf.org/html/rfc4254)
- [ssh2 npm package](https://www.npmjs.com/package/ssh2)
- [Claude Tools API](https://docs.anthropic.com/claude/docs/tools)
- [OWASP Command Injection](https://owasp.org/www-community/attacks/Command_Injection)