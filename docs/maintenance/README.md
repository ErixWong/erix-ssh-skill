# 系统维护总览

## 维护模板

### 日常维护检查项

1. **磁盘空间检查**
   - `df -h` 查看磁盘使用情况
   - `du -sh /*` 查看目录大小
   - 阈值：使用率 > 80% 需清理

2. **Docker 维护**
   - `docker ps` 检查容器状态
   - `docker system df` 检查磁盘使用
   - `docker system prune -af --volumes` 清理未使用资源
   - 频率：每月一次

3. **日志清理**
   - `/var/log` 目录检查
   - `journalctl --vacuum-time=7d` 清理 systemd 日志
   - 清理旧的压缩日志文件 (30天前)
   - 频率：每周一次

4. **系统更新检查**
   - `apt update && apt list --upgradable`
   - 检查安全补丁
   - 频率：每周一次

5. **服务状态检查**
   - `docker ps` 检查容器运行状态
   - `systemctl status` 检查系统服务
   - 频率：每日

### 维护记录目录

各主机维护记录按日期存放在对应子目录：

- `g.erik.top/` - g.erik.top 服务器维护记录
- (其他主机...)

### 维护报告格式

文件命名：`YYYY-MM-DD.md`

内容包含：
1. 系统信息
2. 维护任务执行情况
3. 清理前后对比
4. 问题和建议
5. 总结

## 维护历史

### 2026-05-08 - g.erik.top
- 回收磁盘空间 ~300GB
- Docker 清理 (镜像、缓存、卷)
- 所有容器运行正常
- 详见: `g.erik.top/2026-05-08.md`

---
✌Bazinga！