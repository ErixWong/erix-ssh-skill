# Code Review: db-json.js

**Review Date**: 2026-03-20
**Reviewer**: Maria
**File**: `scripts/db-json.js` (1074 lines)

## Summary

该文件实现了基于 JSON 文件的存储层，支持 session、task、message 的持久化，以及新增的自动归档功能。整体代码结构清晰，但存在一些安全性、性能和边界条件问题需要修复。

---

## ✅ Fixed Issues

### 1. 密码泄露问题 (Line 176-185) ✅ 已修复

**问题**: `getSession()` 返回完整的 session 对象，包含 `config.password`。

**修复**: 使用解构排除 `config` 字段。

```javascript
function getSession(sessionId) {
  const data = loadSessionData(sessionId);
  if (!data) return null;
  
  const session = data.session;
  const { config, ...safeSession } = session;  // ✅ 排除 config
  
  return {
    ...safeSession,
    unread_count: getUnreadCount(sessionId),
    message_count: data.messages.length
  };
}
```

### 2. 归档边界条件 (Line 841-853) ✅ 已修复

**问题**: 当 `keepCommands = 0` 或命令数等于保留数时，`cutoffCommand` 可能为 `undefined`。

**修复**: 添加边界检查。

```javascript
const cutoffIndex = commandMessages.length - keepCommands - 1;
if (cutoffIndex < 0) {
  return { archived: 0, reason: 'Not enough command rounds to archive' };
}
const cutoffCommand = commandMessages[cutoffIndex];
const cutoffTimestamp = cutoffCommand.timestamp;
```

### 3. deleteSession 不删除归档文件 (Line 248-270) ✅ 已修复

**问题**: 删除 session 时没有删除对应的归档文件。

**修复**: 添加归档文件删除逻辑。

```javascript
function deleteSession(sessionId) {
  // Remove main data file
  const filePath = getSessionFilePath(sessionId);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  
  // Remove archive files
  const archives = getNumberedArchiveFiles(sessionId);
  for (const archive of archives) {
    if (fs.existsSync(archive.path)) {
      fs.unlinkSync(archive.path);
    }
  }
  
  // Update index
  const index = loadSessionsIndex();
  index.sessions = index.sessions.filter(id => id !== sessionId);
  saveSessionsIndex(index);
}
```

---

## 🟡 Medium Issues (Pending)

### 4. getTask 性能问题 (Line 296-308)

**问题**: 遍历所有 session 文件查找 task，效率低。

```javascript
function getTask(taskId) {
  const index = loadSessionsIndex();
  
  for (const sessionId of index.sessions) {
    const data = loadSessionData(sessionId);  // ❌ 每次都读文件
    if (data) {
      const task = data.tasks.find(t => t.id === taskId);
      if (task) return task;
    }
  }
  
  return null;
}
```

**建议**: 考虑添加 task 索引，或接受当前实现（适用于少量 session）。

### 5. getMessage 同样的性能问题 (Line 452-464)

同上，遍历所有 session 文件。

### 6. archiveMode 配置未使用 (Line 39)

**问题**: `archiveMode: 'numbered'` 配置存在但代码中未使用。

```javascript
const ARCHIVE_CONFIG = {
  // ...
  archiveMode: 'numbered'  // ❌ 未使用
};
```

**建议**: 移除或实现 'dated' 模式支持。

---

## 🟢 Minor Issues

### 7. 空 catch 块 (多处)

**问题**: 多处使用空 catch 块，可能隐藏错误。

- Line 732-735: `getFileSize()`
- Line 763-768: `getNumberedArchiveFiles()`
- Line 911-915: `readArchive()`

**建议**: 至少记录警告日志。

### 8. 缺少输入验证

**问题**: 多个函数缺少参数验证。

- `loadSessionData(sessionId)` - 未验证 sessionId 格式
- `archiveMessages(sessionId, options)` - 未验证 options 类型

### 9. 魔法数字

**问题**: 部分硬编码值。

- Line 633: `limit = 50`
- Line 699: `keepCount = 1000`

**建议**: 使用配置常量。

---

## ✅ Good Practices

1. **安全存储**: `createSession()` 正确地不保存密码到磁盘
2. **异步归档**: 使用 `setImmediate()` 非阻塞执行归档
3. **Dry run 支持**: `archiveMessages()` 支持 dryRun 模式
4. **错误恢复**: `readJsonFile()` 有默认值回退
5. **文档完善**: 文件头部有清晰的存储结构说明

---

## Action Items

| Priority | Issue | Line | Status |
|----------|-------|------|--------|
| 🔴 P0 | 密码泄露 | 176-185 | ✅ 已修复 |
| 🔴 P0 | 归档边界条件 | 841-853 | ✅ 已修复 |
| 🟡 P1 | deleteSession 不删归档 | 248-270 | ✅ 已修复 |
| 🟡 P2 | archiveMode 未使用 | 39 | 待决定 |
| 🟢 P3 | 空 catch 块 | 多处 | 待优化 |

---

## Test Cases Needed

1. ✅ `getSession()` 不应返回密码
2. ✅ `archiveMessages()` 边界条件测试
3. ✅ `deleteSession()` 应删除所有归档
4. 归档后消息完整性验证