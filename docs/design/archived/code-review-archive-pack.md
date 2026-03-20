# Code Review: Archive Pack Feature

**File:** `scripts/db-json.js`
**Date:** 2026-03-20
**Reviewer:** AI Assistant
**Status:** ✅ 已修复关键问题

## Overview

审查新增的归档打包功能（Archive Pack Feature），包括：
- `packArchives()` 函数
- `getPackedArchiveFiles()` 函数
- `getArchiveDir()` 函数
- 相关修改

---

## Issues Found

### 1. ✅ FIXED: `searchArchives()` 不搜索打包的归档

**Location:** Line 1120-1175

**Problem:** `searchArchives()` 只搜索 sessions 目录下的归档文件，不搜索打包的归档。

**Impact:** 用户无法搜索已打包的历史消息。

**Fix Applied:** 已添加搜索打包归档的逻辑，现在会同时搜索 `pack_*.json` 文件。

---

### 2. 🟡 MINOR: `getSessionInfo()` 不包含打包归档信息

**Location:** Line 1202-1222

**Problem:** `getSessionInfo()` 只显示 sessions 目录下的归档统计，不包含打包归档的信息。

**Impact:** 用户看不到完整的归档统计信息。

**Status:** 未修复（低优先级）

---

### 3. ✅ FIXED: `deleteSession()` 可能删除失败（非空目录）

**Location:** Line 278-282

**Problem:** 如果 archive 目录包含子目录（虽然当前不会），`fs.rmdirSync()` 会失败。

**Fix Applied:** 已改用 `fs.rmSync(archiveDir, { recursive: true, force: true })`。

---

### 4. 🟢 MINOR: `packArchives()` 没有验证 `archive_nums` 连续性

**Location:** Line 950

**Problem:** 打包时记录了 `archive_nums`，但没有验证它们是否连续。如果之前有手动删除归档文件，可能导致编号不连续。

**Impact:** 低风险，只是元数据问题。

**Status:** 未修复（低优先级）

---

### 5. 🟢 MINOR: 缺少 `packArchives` 和 `getPackedArchiveFiles` 导出

**Location:** Line 1242-1285

**Problem:** 新增的函数没有导出，外部无法直接调用。

**Impact:** 如果需要手动触发打包或查询打包归档，无法实现。

**Status:** 未修复（低优先级）

---

## Applied Fixes

### Fix 1: 更新 `searchArchives()` 搜索打包归档 ✅

已在 Line 1120-1175 添加搜索打包归档的逻辑：

```javascript
// Search packed archives
const packedArchives = getPackedArchiveFiles(sessionId);
for (const pack of packedArchives) {
  try {
    const packData = JSON.parse(fs.readFileSync(pack.path, 'utf8'));
    if (!packData.messages) continue;
    
    const matches = packData.messages
      .filter(m => m.content && m.content.toLowerCase().includes(searchLower))
      .map(m => ({ ...m, pack_num: pack.pack_num }));
    
    results.push(...matches);
    if (options.limit && results.length >= options.limit) {
      return results.slice(0, options.limit);
    }
  } catch (err) {
    console.error(`[Archive] Error reading pack ${pack.pack_num}:`, err.message);
  }
}
```

### Fix 2: 更新 `deleteSession()` 使用递归删除 ✅

已在 Line 278-282 修改：

```javascript
// Remove packed archive directory (recursive for safety)
const archiveDir = getArchiveDir(sessionId);
if (fs.existsSync(archiveDir)) {
  fs.rmSync(archiveDir, { recursive: true, force: true });
}
```

---

## Remaining Minor Issues

### Fix 3: 导出新函数（可选）

```javascript
module.exports = {
  // ... existing exports
  
  // Archive operations
  packArchives,           // 新增
  getPackedArchiveFiles,  // 新增
  getArchiveDir,          // 新增
};
```

### Fix 4: 更新 `getSessionInfo()` 包含打包归档统计（可选）

---

## Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| 🔴 Critical | 1 | ✅ 1 |
| 🟡 Medium | 2 | ✅ 1 |
| 🟢 Minor | 2 | 0 |

**关键问题已全部修复。**

✌Bazinga！