# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- 项目初始化
- 需求文档编写
- 项目架构设计

---

## [0.3.0] - 2026-03-20

### Changed
- **重大变更**: 将 SQLite 存储替换为 JSON 文件存储
  - 移除 `better-sqlite3` 原生依赖，简化部署
  - 新增 `scripts/db-json.js` 实现 JSON 文件存储
  - 每个会话独立存储在 `./data/sessions/sess_xxx.json`
  - 会话索引存储在 `./data/sessions.json`

### Benefits
- 无需原生模块编译，跨平台部署更简单
- 技能安装只需 `npm install ssh2`，无编译依赖
- 数据文件可直接查看和备份

---

## [0.1.0] - TBD

### Added
- 基本 SSH 连接功能
- 密码和 SSH Key 认证支持
- 远程命令执行功能
- 基本安全控制（命令黑名单）
- LLM 工具接口定义

---

## [0.2.0] - TBD

### Added
- SFTP 文件传输功能
- 文件上传/下载
- 远程目录管理
- 连接池管理
- 配置持久化

### Changed
- 优化连接稳定性
- 改进错误处理

---

## [1.0.0] - TBD

### Added
- 完整审计日志系统
- 权限级别控制
- 危险命令智能拦截
- 性能优化
- 完整文档

### Security
- 凭据加密存储
- 命令注入防护
- 输入验证增强

---

## 版本说明

- **[Unreleased]**: 开发中的功能
- **[0.1.0]**: MVP 版本 - 基本功能
- **[0.2.0]**: 增强版本 - 文件传输
- **[1.0.0]**: 生产就绪版本

✌Bazinga！