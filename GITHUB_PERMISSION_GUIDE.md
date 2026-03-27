# GitHub 授予仓库访问权限指南

## ErixWong 需要执行的步骤

### 方法 1：通过 GitHub 网页授予 Collaborator 权限

1. **登录 GitHub**
   - 访问 https://github.com 并登录 `ErixWong` 账号

2. **进入仓库设置**
   - 进入 `ErixWong/erix-ssh-skill` 仓库
   - 点击 `Settings`（设置）标签

3. **管理访问权限**
   - 在左侧菜单中选择 `Collaborators`（在 Access -> Collaborators 下）
   - 或者直接访问: https://github.com/ErixWong/erix-ssh-skill/settings/access

4. **添加 collaborator**
   - 点击 `Add people` 按钮
   - 输入 `jiage166` 的 GitHub 用户名或邮箱
   - 选择 `Can manage` 或 `Maintain` 或 `Write` 权限级别
   - 点击 `Add jiage166 to this repository`

5. **等待确认**
   - `jiage166` 会收到 GitHub 发送的邀请邮件
   - `jiage166` 需要点击邮件中的 "Accept invitation" 链接

### 方法 2：通过 Organizations（如果是 Organization 仓库）

如果 `ErixWong/erix-ssh-skill` 是 Organization 下的仓库：
1. 进入仓库的 Organization 设置
2. 选择 `Members` 或 `Teams`
3. 添加成员并设置权限

---

## 权限级别说明

| 角色 | 权限内容 |
|------|----------|
| Read | 读取代码、提交 PR |
| Triage | Read + 管理 Issues/PR |
| Write | Triage + 推送代码、合并 PR |
| Maintain | Write + 管理仓库设置 |
| Admin | 完全控制权 |

---

## 替代方案：如果不想授予写权限

### 使用 Fork + PR 流程（推荐）

1. **ErixWong 邀请 `jiage166` 作为 Collaborator**（只需要这个）
   - 只要 `jiage166` 能访问仓库即可

2. **`jiage166` Fork 仓库**
   - 在 GitHub 上点击 Fork 按钮

3. **`jiage166` 在 Fork 的仓库中创建 PR**
   - 从 Fork 提交 PR 到原仓库

---

## 快捷方式

ErixWong 可以直接访问这个链接添加 collaborator：
https://github.com/ErixWong/erix-ssh-skill/settings/access

---
✌Bazinga！
