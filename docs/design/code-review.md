# 代码审查报告

**项目**: SSH Skill  
**日期**: 2026-03-05  
**审查者**: AI Code Review

## 审查摘要

| 类别 | 数量 |
|------|------|
| 🔴 高风险问题 | 0 (已修复) |
| 🟡 中等风险问题 | 2 |
| 🟢 低风险问题 | 3 |
| 💡 改进建议 | 4 |

---

## 已修复问题

### 1. 命令注入风险 (高风险) ✅ 已修复
**文件**: [`src/executor/command.ts:69-88`](src/executor/command.ts:69)

**原问题**: `cwd` 和环境变量直接拼接到命令字符串，存在命令注入风险。

**修复方案**: 添加了字符转义处理：
```typescript
const escapedCwd = options.cwd.replace(/["`$\\]/g, '\\$&');
const escapedValue = String(value).replace(/["`$\\]/g, '\\$&');
```

### 2. 错误码分类错误 (中等风险) ✅ 已修复
**文件**: [`src/connection/manager.ts:313`](src/connection/manager.ts:313)

**原问题**: 未知错误默认返回 `CONNECTION_TIMEOUT`，不够准确。

**修复方案**: 添加了 `NOT_CONNECTED` 错误码用于通用连接错误。

---

## 待处理问题

### 🟡 中等风险

#### 1. 权限级别检查可能被绕过
**文件**: [`src/security/validator.ts:166-181`](src/security/validator.ts:166)

**问题**: 权限检查使用简单的正则表达式，可能被复杂命令绕过。

**示例**:
```bash
# 通过子 shell 绕过
$(echo cm0gLXJmIC9y | base64 -d)
```

**建议**: 
- 考虑使用命令解析器
- 添加子 shell 执行检测 (`$()`, `` ` ``, `;`)

#### 2. 审计日志文件路径硬编码
**文件**: [`src/security/audit.ts:58`](src/security/audit.ts:58)

**问题**: 默认日志路径 `./logs/audit.jsonl` 可能在某些环境中不可写。

**建议**: 
- 支持配置文件指定路径
- 添加日志写入失败的降级处理

### 🟢 低风险

#### 1. 连接 ID 可预测性
**文件**: [`src/connection/manager.ts:16-18`](src/connection/manager.ts:16)

**问题**: 使用 UUID 的前 12 位作为连接 ID，虽然足够随机但不是加密安全的。

**建议**: 考虑使用 `crypto.randomBytes()` 生成。

#### 2. 保活命令暴露内部行为
**文件**: [`src/connection/manager.ts:325`](src/connection/manager.ts:325)

**问题**: 保活使用 `echo keepalive` 命令，会在服务器上留下痕迹。

**建议**: 使用 SSH 协议内置的 keepalive 机制。

#### 3. SFTP 功能未实现
**文件**: [`src/index.ts:307-319`](src/index.ts:307)

**问题**: 文件上传/下载功能标记为 TODO。

**建议**: 完成实现或移除相关工具定义。

---

## 改进建议

### 1. 添加连接配置验证
```typescript
// 建议添加
interface SSHConfig {
  // 现有字段...
  allowedHosts?: string[];  // 白名单主机
  maxConnections?: number;  // 最大连接数
}
```

### 2. 添加命令执行限制
```typescript
// 建议添加到 CommandExecutor
private maxConcurrentCommands = 5;
private activeCommands = 0;

async exec(...) {
  if (this.activeCommands >= this.maxConcurrentCommands) {
    throw new Error('Too many concurrent commands');
  }
  // ...
}
```

### 3. 添加连接超时后的清理
```typescript
// 在 connection/manager.ts 中添加
private cleanupStaleConnections(): void {
  const now = Date.now();
  for (const [id, instance] of this.connections) {
    const lastActivity = instance.info.lastActivityAt.getTime();
    if (now - lastActivity > this.maxIdleTime) {
      this.disconnect(id);
    }
  }
}
```

### 4. 添加单元测试
当前项目缺少测试覆盖。建议添加：
- `connection/manager.test.ts` - 连接管理测试
- `security/validator.test.ts` - 安全验证测试
- `executor/command.test.ts` - 命令执行测试

---

## 代码质量

### ✅ 优点
- 清晰的模块化结构
- 完善的类型定义
- 良好的错误处理
- 安全审计日志
- 危险命令拦截

### ⚠️ 待改进
- 缺少单元测试
- SFTP 功能未完成
- 部分 TODO 注释需要处理

---

## 结论

代码整体质量良好，核心安全风险已修复。建议：
1. 完成单元测试覆盖
2. 实现 SFTP 功能
3. 考虑添加更严格的命令解析

**审查通过** ✅