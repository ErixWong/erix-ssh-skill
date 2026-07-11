# 设计文档索引

**更新日期**: 2026-03-29

## 目录结构

```
docs/
├── SOUL.md                      # 项目人设文档（经验教训）
└── design/                      # 设计文档目录
    ├── README.md                # 本文档
    ├── requirements.md          # 需求文档（主文档）
    ├── archive-design.md        # 归档设计（已实现）
    ├── interactive-sudo-design.md # Sudo 命令设计（已实现）
    ├── portainerce-design.md    # Portainer CE 管理脚本设计（已实现）
    └── SESSION_ISOLATION_SIMPLE.md # Session 隔离简化方案（设计中）

references/
└── skill-md-standard.md         # SKILL.md 结构标准参考文档
```

## 设计文档

| 文档 | 状态 | 说明 |
|------|------|------|
| [`requirements.md`](requirements.md) | 当前 | 项目需求总览，核心参考文档 |
| [`archive-design.md`](archive-design.md) | ✅ 已实现 | JSON 归档机制设计 |
| [`interactive-sudo-design.md`](interactive-sudo-design.md) | ✅ 已实现 | Sudo 命令 PTY 支持 |
| [`portainerce-design.md`](portainerce-design.md) | ✅ 已实现 | Portainer CE 管理脚本 |
| [`SESSION_ISOLATION_SIMPLE.md`](SESSION_ISOLATION_SIMPLE.md) | 🚧 设计中 | Session ID 作为访问凭证 |
| [`../tasks/active/task-001-mcp-interface/MCP_HTTP_DESIGN.md`](../tasks/active/task-001-mcp-interface/MCP_HTTP_DESIGN.md) | 🚧 设计中 | MCP stdio、MCP HTTP 与普通 HTTP API 改造草案 |

## 参考文档

| 文档 | 说明 |
|------|------|
| [`../references/skill-md-standard.md`](../references/skill-md-standard.md) | SKILL.md 结构标准（基于 anthropics/skills） |

## 快速导航

### 新成员入门

1. 先读 [`requirements.md`](requirements.md) 了解项目整体
2. 再读 [`archive-design.md`](archive-design.md) 了解存储机制
3. 最后读 [`SESSION_ISOLATION_SIMPLE.md`](SESSION_ISOLATION_SIMPLE.md) 了解安全模型

### 功能开发

- Sudo 相关: [`interactive-sudo-design.md`](interactive-sudo-design.md)
- 存储相关: [`archive-design.md`](archive-design.md)
- 安全相关: [`SESSION_ISOLATION_SIMPLE.md`](SESSION_ISOLATION_SIMPLE.md)
- Portainer 管理: [`portainerce-design.md`](portainerce-design.md)
- MCP 与 HTTP 接口改造: [`../tasks/active/task-001-mcp-interface/MCP_HTTP_DESIGN.md`](../tasks/active/task-001-mcp-interface/MCP_HTTP_DESIGN.md)

## 文档维护规则

1. **设计文档**: 实现后更新状态为"已实现"
2. **过时文档**: 直接删除，只保留最新版本

✌Bazinga！
