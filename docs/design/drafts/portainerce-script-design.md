# Portainer CE 管理脚本设计

## 目标

创建 `scripts/portainerce.js` 脚本，直接通过 HTTP API 调用 Portainer，无需 SSH。

## 配置文件格式

**Portainer 配置**: `../data/hosts/<host>.portainer.json` (JSON 格式)

```json
{
  "url": "http://<host>:9000",
  "api_key": "<api_key>",
  "endpoint_id": 2
}
```

**注意**: 实际配置文件存放在 `../data/hosts/` 目录，不应写入文档。

## 功能设计

### 1. Stack 管理

| 命令 | 功能 | API 端点 |
|------|------|----------|
| `stacks list` | 列出所有 stacks | `GET /api/stacks?endpointId={id}` |
| `stacks get <name>` | 获取 stack 详情 | `GET /api/stacks/{id}` |
| `stacks file <name>` | 获取 compose 文件内容 | `GET /api/stacks/{id}/file` |
| `stacks create` | 创建 stack | `POST /api/stacks?type=2&method=string&endpointId={id}` |
| `stacks update <name>` | 更新 stack | `PUT /api/stacks/{id}` |
| `stacks delete <name>` | 删除 stack | `DELETE /api/stacks/{id}` |
| `stacks start <name>` | 启动 stack | `PUT /api/stacks/{id}/start` |
| `stacks stop <name>` | 停止 stack | `PUT /api/stacks/{id}/stop` |

### 2. Container 管理

| 命令 | 功能 | API 端点 |
|------|------|----------|
| `containers list` | 列出容器 | `GET /api/endpoints/{id}/docker/containers/json` |
| `containers get <name>` | 容器详情 | `GET /api/endpoints/{id}/docker/containers/{id}/json` |
| `containers start <name>` | 启动容器 | `POST /api/endpoints/{id}/docker/containers/{id}/start` |
| `containers stop <name>` | 停止容器 | `POST /api/endpoints/{id}/docker/containers/{id}/stop` |
| `containers restart <name>` | 重启容器 | `POST /api/endpoints/{id}/docker/containers/{id}/restart` |
| `containers logs <name>` | 查看日志 | `GET /api/endpoints/{id}/docker/containers/{id}/logs` |

### 3. Endpoint 管理

| 命令 | 功能 | API 端点 |
|------|------|----------|
| `endpoints list` | 列出环境 | `GET /api/endpoints` |

### 4. Status 检查

| 命令 | 功能 | API 端点 |
|------|------|----------|
| `status` | Portainer 状态 | `GET /api/status` |

## 命令行接口设计

```bash
# 基本用法
node scripts/portainerce.js <command> --config ../data/hosts/<host>.portainer.json

# Stack 操作
node scripts/portainerce.js stacks list --config ../data/hosts/vllm.portainer.json
node scripts/portainerce.js stacks get litellm --config ../data/hosts/vllm.portainer.json
node scripts/portainerce.js stacks file litellm --config ../data/hosts/vllm.portainer.json
node scripts/portainerce.js stacks create --name my-stack --file ./docker-compose.yml
node scripts/portainerce.js stacks update litellm --file ./docker-compose.yml
node scripts/portainerce.js stacks delete my-stack

# Container 操作
node scripts/portainerce.js containers list --config ../data/hosts/vllm.portainer.json
node scripts/portainerce.js containers logs litellm --tail 100

# Endpoint 操作
node scripts/portainerce.js endpoints list --config ../data/hosts/vllm.portainer.json

# Status
node scripts/portainerce.js status --config ../data/hosts/vllm.portainer.json
```

## 实现方案

直接通过 Node.js HTTP 模块调用 Portainer API：

- 使用 `http`/`https` 模块发送请求
- 使用 `X-API-Key` header 认证
- 无需额外依赖

## 文件结构

```
scripts/
├── portainerce.js      # Portainer CE 管理