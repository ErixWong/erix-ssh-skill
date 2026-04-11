# SOUL - SSH Skill 人设文档

## 行为准则

- 执行任务时，主动创建记录并做总结

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

1. 维护模板统一放在维护目录的 `README.md`
2. 各主机维护记录放在维护目录的 `<主机名>/` 子目录
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

### 2026-03-24 (1Panel Docker Compose 配置修改)

**问题**: 需要修改 1Panel 管理的容器配置，但直接用 docker run 创建容器会导致 1Panel 无法管理。

**教训**:

1. **1Panel 应用目录结构**：
   ```
   /opt/1panel/docker/compose/<应用名>/
   ├── docker-compose.yml  # 主要配置文件
   ```

2. **修改配置的正确步骤**：
   ```bash
   # 1. 备份原配置
   sudo cp /opt/1panel/docker/compose/<应用>/docker-compose.yml{,.bak}

   # 2. 用 base64 方式创建新配置
   echo 'BASE64_CONTENT' | base64 -d > /tmp/new-compose.yml
   sudo cp /tmp/new-compose.yml /opt/1panel/docker/compose/<应用>/docker-compose.yml

   # 3. 重启容器
   sudo bash -c 'cd /opt/1panel/docker/compose/<应用> && docker compose down && docker compose up -d'
   ```

3. **网络配置要点**：
   - 1Panel 应用通常使用外部网络 (如 `erixProd`)
   - 配置格式：
     ```yaml
     networks:
         erixProd:
             external: true
     services:
         <服务名>:
             networks:
                 erixProd:
                     ipv4_address: 172.20.0.x  # 指定静态IP
     ```

4. **注意事项**：
   - **绝对禁止直接用 `docker run` 创建容器**，否则：
     - IP 地址会变化
     - frpc 映射会失败
     - 1Panel 无法管理
   - 修改配置后需要 `docker compose down && docker compose up -d` 生效
   - 必须保持原有的静态 IP 地址

### 2026-03-28 (远程文件编辑 - sed/yq)

**问题**: 通过 SSH 编辑远程配置文件时，base64 方式适合创建完整文件，但对于小改动效率较低。

**教训**:

1. **AI 可用的远程编辑命令**：

   | 命令 | 用途 | 示例 |
   |------|------|------|
   | `sed` | 替换/删除/插入 | `sed -i 's/old/new/' file` |
   | `yq` | YAML 结构修改 | `yq e '.key="val"' -i file.yml` |
   | `tee` | sudo 写文件 | `echo 'content' \| sudo tee file` |
   | `base64` | 创建完整文件 | 避免转义问题，最可靠 |

2. **sed 常用操作**：
   ```bash
   # 替换文本
   sed -i 's/--parallel 1/--parallel 2/' docker-compose.yml
   
   # 删除行
   sed -i '/^# comment/d' file.yml
   
   # 插入行（在匹配行后）
   sed -i '/^services:/a "  new-service:"' file.yml
   
   # 修改特定行号
   sed -i '5s/old/new/' file.yml
   ```

3. **yq 常用操作**（需安装 `yq` 工具）：
   ```bash
   # 修改 YAML 值
   yq e '.services.app.command[2] = "131072"' -i docker-compose.yml
   
   # 添加新键
   yq e '.services.app.environment += ["NEW_VAR=value"]' -i file.yml
   
   # 删除键
   yq e 'del(.services.app.ports)' -i file.yml
   ```

4. **本地配置仓库方案**：
   ```
   /docker/stacks/
   ├── llamacpp-nemotron-2/
   │   └── docker-compose.yml    # 可直接用 sed/yq 编辑
   ├── llamacpp-qwen35/
   │   └── docker-compose.yml
   └── ...
   ```
   
   工作流程：
   - 通过 SSH 用 `sed`/`yq` 修改配置文件
   - 用 `docker compose up -d` 应用变更
   - Portainer 可通过 Git 同步或 API 更新保持一致

5. **注意事项**：
   - `sed -i` 直接修改文件，无需临时文件
   - 复杂 YAML 结构建议用 `yq`，避免 sed 破坏格式
   - Windows 下用 PowerShell 计算 base64：`[Convert]::ToBase64String([IO.File]::ReadAllBytes('file'))`

### 2026-04-03 (Windows timeout 命令限制)

**问题**: 在 Windows cmd.exe 中使用 `timeout /t 2 > nul` 时报错 "ERROR: Input redirection is not supported, exiting the process immediately."。

**原因**: Windows 的 `timeout` 命令**不支持任何输入/输出重定向** (`>` 或 `<`)，检测到重定向符号就会报错退出。

**教训**:

1. **Windows 延迟命令替代方案**：
   ```cmd
   :: 方法1: PowerShell (推荐)
   powershell -Command "Start-Sleep -Seconds 2"
   
   :: 方法2: 使用 ping 模拟延迟
   ping -n 3 127.0.0.1 > nul
   
   :: 方法3: 直接用 cmd /c 执行
   cmd /c "command"
   ```

2. **注意事项**：
   - `timeout` 命令设计用于交互式场景，不支持脚本中的重定向
   - 在批处理脚本中需要延迟时，优先使用 PowerShell 或 ping 方法

### 2026-04-11 (命令输出导致 JSON 文件损坏)

**问题**: 命令输出包含特殊字符（二进制数据、ANSI 码、控制字符）时，直接存储到 JSON 文件的 `task.output` 字段会导致 JSON 文件损坏。

**原因**: JSON.stringify 无法处理某些特殊字符，导致文件损坏无法读取。

**教训**:

1. **分离存储策略**：
   - JSON 文件： 存储连接信息、任务元数据（状态、exit_code）
   - 日志文件: 存储完整命令输出（append-only，安全）

2. **日志文件格式**：
   ```
   [timestamp] [task_id] [type] content
   ```
   类型: COMMAND, STDOUT, STDERR, EXIT

3. **优点**：
   - JSON 文件不会损坏
   - 完整输出保留
   - 可用标准工具查看 (`tail`, `grep`)
   - 自动轮转（1MB）

4. **实现文件**：
   - `scripts/db-json.js`: 添加 `appendToLog()`, `readTaskLog()`, `searchLogs()`
   - `scripts/session_manager.js`: 输出写入日志文件
   - `docs/design/log-output-design.md`: 设计文档

---

✌Bazinga！
