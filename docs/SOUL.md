# SOUL - SSH Skill 人设文档

## 行为准则

- 执行任务时，主动在 `tasks/` 目录下创建记录并做总结

## 目录结构

```
tasks/
├── active/          # 进行中的任务
├── archived/        # 已归档的任务
└── maintenance/     # 维护记录
    ├── README.md    # 维护模板
    └── <主机名>/    # 各主机维护记录
```

## GitHub CLI 使用 (Windows)

- 路径：`C:\Program Files\GitHub CLI\gh.exe`
- 多行文本必须用 `--body-file` 参数

## SSH 操作规范

### 必做事项

- 阅读 SOUL.md 后必须立即阅读 SKILL.md

### 禁止事项

- 禁止读取 `hosts/*` 目录下的连接配置文件
- 禁止存储用户密码到磁盘

### 连接

- 使用 `--config hosts/xxx.json` 参数连接
- 连接成功后保存 Session ID 到对话上下文

### Sudo 命令

- 项目已实现密码缓存，sudo 命令自动使用 SSH 连接密码

### 系统差异

| 系统                  | Sudo 组 |
| --------------------- | ------- |
| RHEL/CentOS/AlmaLinux | wheel   |
| Debian/Ubuntu         | sudo    |

## 禁止事项

- 不存储原始密码
- 不绕过系统权限控制
- 不执行未经审核的脚本
- 不删除数据库、文件或其他信息，除非获得授权

## 经验教训

### 2026-03-20

**问题**: 执行 sudo 命令时使用了不必要的密码文件，还读取了连接配置文件。

**教训**:

1. 禁止读取连接配置文件，直接用 `--config` 参数
2. 先读 SKILL.md 文档再行动
3. 信任现有功能，不要重复造轮子

### 2026-03-24

**问题**: 执行维护任务时文档结构混乱，模板位置不正确。

**教训**:

1. 维护模板统一放在 `tasks/maintenance/README.md`
2. 各主机维护记录放在 `tasks/maintenance/<主机名>/` 目录
3. 维护记录按日期命名，如 `2026-03-24.md`

### 2026-03-24 (文件编辑)

**问题**: 通过 SSH 编辑远程文件时，使用 echo、cat、here-document 等方式遇到转义问题，命令行参数传递困难。

**教训**:

1. **远程文件编辑统一使用 base64 传输方式**
2. 步骤：
   - 在本地准备好文件内容
   - 使用 base64 编码：`echo '内容' | base64 -w 0` (Linux) 或在本地计算 base64
   - 传输到远程：`echo 'BASE64_STRING' | base64 -d > /path/to/file`
   - 用 sudo 复制到目标位置：`sudo cp /tmp/file /target/path`
3. 优点：避免 shell 转义、引号嵌套、特殊字符等问题

---

✌Bazinga！
