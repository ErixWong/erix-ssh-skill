# 归档设计

**Date:** 2026-03-20
**Status:** Current

## 设计目标

简化归档逻辑，移除复杂的打包机制，实现"写入即归档"。

## 核心思路

**每次写入主文件时，同时写入归档文件。**

- 主文件：自循环，保持固定轮次
- 归档文件：追加写入，满了创建新文件

## 文件结构

```
data/sessions/
├── sess_xxx.json           # 主文件（固定 50 轮命令，循环覆盖）
├── sess_xxx.1.json         # 归档 #1（已满，~100KB）
├── sess_xxx.2.json         # 归档 #2（已满，~100KB）
├── sess_xxx.3.json         # 归档 #3（当前写入中）
```

## 写入流程

```
添加消息时：
1. 追加到主文件
2. 检查主文件命令轮次
   - 如果 > 50 轮，删除最老的命令及其相关消息
3. 追加到当前归档文件
4. 检查归档文件大小
   - 如果 > 100KB，创建新归档文件继续写
```

## 配置参数

```javascript
const ARCHIVE_CONFIG = {
  keepRecentCommands: 50,        // 主文件保留最近 50 轮命令
  archiveMaxSize: 100 * 1024     // 归档文件最大 100KB
};
```

## 与旧设计对比

| 方面 | 旧设计 | 新设计 |
|------|--------|--------|
| 归档触发 | 定期检查，条件触发 | 每次写入即归档 |
| 归档内容 | 溢出的消息 | 所有消息 |
| 归档文件大小 | 不固定 | 固定上限 |
| 打包机制 | 有（复杂） | 无 |
| 代码复杂度 | 高 | 低 |

## 优点

1. **逻辑简单**：写入主文件 = 写入归档文件
2. **历史完整**：所有消息都有归档
3. **文件大小可控**：每个归档文件最大 100KB
4. **便于查询**：只需遍历归档文件，无需解包

## 缺点

1. **写入量增加**：每次写入两个文件
2. **存储空间**：归档保留所有历史

## 实现要点

### 主文件自循环

```javascript
function addMessage(sessionId, message) {
  // 1. 追加到主文件
  data.messages.push(msg);
  
  // 2. 检查命令轮次，删除最老的
  const commands = data.messages.filter(m => m.type === 'command');
  if (commands.length > keepRecentCommands) {
    // 找到要删除的命令的时间点
    const cutoffCommand = commands[commands.length - keepRecentCommands - 1];
    data.messages = data.messages.filter(m => m.timestamp > cutoffCommand.timestamp);
  }
  
  // 3. 追加到归档文件
  appendToArchive(sessionId, msg);
  
  saveSessionData(sessionId, data);
}
```

### 归档文件追加

```javascript
function appendToArchive(sessionId, message) {
  // 找到当前归档文件
  let archiveNum = getCurrentArchiveNum(sessionId);
  let archivePath = getArchivePath(sessionId, archiveNum);
  
  // 检查大小，满了创建新文件
  if (fs.existsSync(archivePath) && getFileSize(archivePath) > archiveMaxSize) {
    archiveNum++;
    archivePath = getArchivePath(sessionId, archiveNum);
  }
  
  // 追加消息
  let archiveData = readArchive(archiveNum) || { messages: [] };
  archiveData.messages.push(message);
  writeArchive(archiveNum, archiveData);
}
```

## 搜索历史

```javascript
function searchArchives(sessionId, query) {
  const results = [];
  
  // 搜索所有归档文件
  let num = 1;
  while (fs.existsSync(getArchivePath(sessionId, num))) {
    const archive = readArchive(sessionId, num);
    // 搜索逻辑...
    num++;
  }
  
  return results;
}
```

## 删除会话

```javascript
function deleteSession(sessionId) {
  // 删除主文件
  fs.unlinkSync(getSessionFilePath(sessionId));
  
  // 删除所有归档文件
  let num = 1;
  while (fs.existsSync(getArchivePath(sessionId, num))) {
    fs.unlinkSync(getArchivePath(sessionId, num));
    num++;
  }
}
```

## 总结

新设计大幅简化了归档逻辑：
- 移除打包机制
- 移除复杂的触发条件
- 写入即归档，简单直接

✌Bazinga！