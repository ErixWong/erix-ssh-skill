# 代码审计报告 - sudo 命令实现

**审计日期**: 2026-03-12
**提交**: `f418b0f` - feat: add sudo command with PTY support for interactive password input
**审计人**: Maria
**修复状态**: ✅ 主要问题已修复，仍有小问题待改进

---

## 第二轮审计发现与修复

### 🟡 低风险问题

#### 1. ✅ 已修复 - 密码文件权限未检查

**修复**: 添加权限检查和警告
```javascript
const stat = fs.statSync(absolutePath);
const mode = stat.mode & 0o777;
if (mode & 0o077) { // Others or group can read
  console.error(`WARNING: Password file ${absolutePath} has overly permissive permissions`);
}
```

---

#### 2. ⚠️ 待改进 - connect 命令的 --password 参数

**现状**: `connect` 命令仍接受 `--password` 参数

**建议**: 未来版本中对 `connect` 也应用相同的密码安全策略

---

#### 3. ✅ 已修复 - stdin raw mode 异常处理

**修复**: 添加 cleanup 函数和 try-catch
```javascript
let rawModeEnabled = false;
const cleanup = () => {
  if (rawModeEnabled) {
    try { process.stdin.setRawMode(false); } catch (e) {}
  }
};
```

---

#### 4. ✅ 已修复 - 命令文件权限

**修复**: 设置文件权限为 `0600`
```javascript
fs.writeFileSync(cmdFile, JSON.stringify(cmd), { mode: 0o600 });
```

---

#### 5. ✅ 已修复 - 密码内存清除

**修复**: 命令完成后清除密码引用
```javascript
stream.on('close', (code, signal) => {
  // ...
  password = null;  // Clear password from memory
});
```

---

#### 6. ✅ 已修复 - 输出消息密码屏蔽

**修复**: 在存储前屏蔽密码
```javascript
const sanitizedChunk = chunk.replace(new RegExp(escapeRegExp(password), 'g'), '********');
db.addMessage(sessionId, { content: sanitizedChunk });
```

## 审计概述

本次提交添加了 `sudo` 命令支持，允许用户通过 PTY (伪终端) 执行需要密码认证的 sudo 命令。

## 变更文件

| 文件 | 变更类型 | 行数变更 |
|------|---------|---------|
| [`SKILL.md`](../SKILL.md) | 修改 | +39 |
| [`docs/design/interactive-sudo-design.md`](../design/interactive-sudo-design.md) | 新增 | +258 |
| [`scripts/session_manager.js`](../../scripts/session_manager.js) | 修改 | +152 |
| [`scripts/ssh_client.js`](../../scripts/ssh_client.js) | 修改 | +30 |

---

## 发现的问题与修复状态

### 🔴 严重 (Critical)

#### 1. ✅ 已修复 - 密码通过命令行参数传递

**位置**: [`scripts/ssh_client.js:319-351`](../../scripts/ssh_client.js:319)

**修复方案**: 添加了三种安全的密码传递方式：
1. `--password-file FILE` - 从文件读取密码
2. `SUDO_PASSWORD` 环境变量
3. 交互式隐藏输入

```javascript
async function getPassword(params) {
  // 1. From password file (highest priority for scripting)
  if (params.password_file) {
    const pw = readPasswordFile(params.password_file);
    if (pw) return { password: pw, source: 'file' };
    return { error: `Password file not found or empty: ${params.password_file}` };
  }
  
  // 2. From environment variable
  if (process.env.SUDO_PASSWORD) {
    return { password: process.env.SUDO_PASSWORD, source: 'env' };
  }
  
  // 3. Interactive prompt (if tty)
  if (process.stdin.isTTY) {
    const password = await promptPassword('[sudo] Password: ');
    // ...
  }
}
```

**--password 参数已废弃**，使用时会显示警告信息。

---

#### 2. ⚠️ 部分修复 - 密码明文写入文件系统

**位置**: [`scripts/ssh_client.js:56-71`](../../scripts/ssh_client.js:56)

**现状**: 密码仍通过 JSON 文件传递给 manager 进程（进程间通信需要）

**缓解措施**:
- `--password` 参数已废弃，用户不再直接传递明文密码
- 文件在处理后立即删除

**待改进**: 考虑使用更安全的 IPC 机制（如 Unix Socket、管道）

---

### 🟠 中等 (Medium)

#### 3. ✅ 已修复 - 正则表达式未转义特殊字符

**位置**: [`scripts/session_manager.js:293-294`](../../scripts/session_manager.js:293)

**修复**:
```javascript
// Escape regex special characters for safe password matching
const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// ...
stdout = stdout.replace(new RegExp(`^${escapeRegExp(password)}$`, 'gm'), '********');
```

---

#### 4. ✅ 已修复 - 密码尝试逻辑错误

**位置**: [`scripts/session_manager.js:305`](../../scripts/session_manager.js:305)

**修复**: 将 `||` 改为 `&&`
```javascript
// 修复前: if (!passwordSent || passwordAttempts < maxPasswordAttempts)
// 修复后:
if (!passwordSent && passwordAttempts < maxPasswordAttempts) {
```

---

#### 5. 密码可能泄露到日志/消息

**位置**: [`scripts/session_manager.js:331-336`](../../scripts/session_manager.js:331)

```javascript
db.addMessage(sessionId, {
  type: 'output',
  task_id: taskId,
  content: chunk,  // 原始输出可能包含密码回显
  stream: 'stdout'
});
```

**问题**:
- 虽然有密码屏蔽逻辑，但只在检测到密码提示后执行
- 原始 chunk 可能包含其他敏感信息
- 密码屏蔽只在 stdout 变量上执行，但消息已存入数据库

**建议修复**:
```javascript
// 在添加消息之前屏蔽密码
const sanitizedChunk = chunk.replace(new RegExp(password, 'g'), '********');
db.addMessage(sessionId, {
  type: 'output',
  task_id: taskId,
  content: sanitizedChunk,
  stream: 'stdout'
});
```

---

### 🟡 低 (Low)

#### 6. PTY 配置硬编码

**位置**: [`scripts/session_manager.js:266-270`](../../scripts/session_manager.js:266)

```javascript
const ptyConfig = {
  cols: 120,
  rows: 24,
  term: 'xterm-256color'
};
```

**问题**: PTY 终端大小硬编码，可能影响某些需要正确终端尺寸的命令

**建议**: 考虑使其可配置

---

#### 7. 缺少密码清除机制

**位置**: [`scripts/session_manager.js:353-365`](../../scripts/session_manager.js:353)

**问题**: 命令执行完成后，`password` 变量仍在内存中，可能被内存转储泄露

**建议修复**:
```javascript
stream.on('close', (code, signal) => {
  // 清除密码引用
  password = null;
  // ... 其余代码
});
```

---

## 代码质量检查

### ✅ 通过项

- [x] 代码风格一致
- [x] 有适当的错误处理
- [x] 文档更新完整
- [x] 设计文档清晰

### ⚠️ 需改进项

- [ ] 添加单元测试
- [ ] 添加密码安全相关注释/警告
- [ ] 考虑添加密码输入验证

---

## 安全建议总结

### 短期修复 (应立即处理)

1. **修复正则表达式转义问题** - 防止密码包含特殊字符时出错
2. **修复密码尝试逻辑** - 将 `||` 改为 `&&`
3. **文件权限设置** - 确保 command 文件权限为 `0600`

### 长期改进

1. **更改密码传递方式** - 使用环境变量或 stdin
2. **实现内存安全** - 及时清除密码引用
3. **添加安全审计日志** - 记录 sudo 命令执行但不记录密码

---

## 审查结论

| 项目 | 状态 | 说明 |
|------|------|------|
| 功能正确性 | ✅ 已修复 | 逻辑错误已修复 |
| 安全性 | ✅ 大幅改进 | 密码不再通过命令行暴露 |
| 代码质量 | ✅ 良好 | 代码风格一致 |
| 文档完整性 | ✅ 完整 | 已更新安全使用说明 |

### 第一轮修复摘要

| 问题 | 严重度 | 状态 | 修复方式 |
|------|--------|------|---------|
| 密码命令行暴露 | 🔴 Critical | ✅ 已修复 | 环境变量/文件/交互输入 |
| 密码文件残留 | 🔴 Critical | ⚠️ 部分缓解 | 文件权限0600 + 立即删除 |
| 正则转义 | 🟠 Medium | ✅ 已修复 | `escapeRegExp` 函数 |
| 逻辑错误 `||`→`&&` | 🟠 Medium | ✅ 已修复 | 代码修正 |

### 第二轮修复摘要

| 问题 | 严重度 | 状态 | 修复方式 |
|------|--------|------|---------|
| 密码文件权限未检查 | 🟡 Low | ✅ 已修复 | 添加权限检查警告 |
| stdin raw mode 异常 | 🟡 Low | ✅ 已修复 | cleanup 函数 |
| 命令文件权限 | 🟡 Low | ✅ 已修复 | `mode: 0o600` |
| 密码内存清除 | 🟡 Low | ✅ 已修复 | `password = null` |
| 输出消息密码屏蔽 | 🟡 Low | ✅ 已修复 | sanitizedChunk |
| connect 密码参数 | 🟡 Low | ⚠️ 待改进 | 未来版本处理 |

### 使用建议

**生产环境可用**，推荐使用方式：

```bash
# 方式 1: 环境变量（CI/CD）
SUDO_PASSWORD="xxx" node scripts/ssh_client.js sudo --session sess_xxx --command "apt update"

# 方式 2: 密码文件（脚本）
echo "password" > ~/.sudo_pw && chmod 600 ~/.sudo_pw
node scripts/ssh_client.js sudo --session sess_xxx --command "apt update" --password-file ~/.sudo_pw

# 方式 3: 交互式（手动）
node scripts/ssh_client.js sudo --session sess_xxx --command "apt update"
```

✌Bazinga！