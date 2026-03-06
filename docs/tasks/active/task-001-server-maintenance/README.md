# 服务器维护报告

**日期**: 2026-03-06
**服务器**: hp.inteva.vip:2222
**执行者**: Claude (via SSH Skill)

## 执行任务

### 1. 系统检查

- [x] 连接服务器 (hp.inteva.vip:2222, 用户: erix)
- [x] 检查系统日志 - 无异常
- [x] 检查磁盘使用率 - 87% (警告)
- [x] 检查 Docker 容器状态

### 2. 磁盘清理

| 操作 | 释放空间 |
|------|----------|
| 删除 /docker/stable-diffusion | 84GB |
| 删除 /docker/ollama_cpu/data/models (旧模型) | 11GB |
| 删除 Ollama 模型 (21个) | ~285GB |
| 用户自行清理模型 | ~120GB |
| apt autoremove | 207MB |
| **总计** | **~500GB** |

### 3. Ollama 模型清理

**删除的模型:**
- huanlin/Tifa-Deepsex-14b-CoT-GGUF-Q4:latest
- deepseek-r1:32b
- devstral:24b
- SimonPu/qwen3-coder:30B-Instruct_Q4_K_XL
- renchris/qwen3-coder:30b-gguf-unsloth
- qwen3:32b
- qwen3:30b
- qwen2.5vl:32b
- llama3.2-vision:latest
- huihui_ai/qwen3-abliterated:16b
- snowflake-arctic-embed:latest
- TheAzazel/qwq-32b-instruct-abliterated:latest
- gemma2:27b
- qwen2.5:32b
- huihui_ai/qwen2.5-abliterate:32b
- gemma3:27b
- qwen2.5-coder:32b
- gemma3:12b
- pidrilkin/gemma3_27b_abliterated:Q4_K_M
- gemma3n:e4b
- qwen3-vl:8b

**保留的模型 (Embedding):**
- bge-m3:latest (1.2GB) - 多语言 Embedding
- bge-large:latest (670MB) - 中英文 Embedding
- linux6200/bge-reranker-v2-m3 (1.2GB) - 重排序模型
- quentinz/bge-large-zh-v1.5 (651MB) - 中文 Embedding
- shaw/dmeta-embedding-zh (408MB) - 中文 Embedding
- nomic-embed-text (274MB) - 英文 Embedding
- cwchang/jina-embeddings-v2-base-zh (172MB) - 中文 Embedding

### 4. 软件更新

- [x] 更新 Ollama: 0.12.11 → 0.17.6
- [x] 更新 bge-large Embedding 模型
- [x] 下载 bge-m3 Embedding 模型
- [x] 系统包更新: linux-base, sosreport
- [x] 清理旧包: apt autoremove (释放 207MB)

## 结果

### 磁盘状态

| 指标 | 清理前 | 清理后 |
|------|--------|--------|
| 磁盘使用率 | 87% | 31% |
| 已用空间 | 769GB | 269GB |
| 可用空间 | 121GB | 621GB |

### 服务器状态

- 运行时间: 3 天 22 小时+
- 负载: 0.24, 0.19, 0.13 (低负载)
- 重启需求: 无
- Docker 容器: 正常运行

## 建议

1. **知识库项目**: 推荐使用 bge-m3 作为向量化模型，支持中英文和长上下文
2. **定期维护**: 建议每月检查磁盘使用情况
3. **模型管理**: 定期清理不使用的模型

---

✌Bazinga！