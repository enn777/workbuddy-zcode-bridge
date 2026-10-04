# WorkBuddy ZCode Bridge

在 ZCode 中直接使用已登录的 WorkBuddy 账号所提供的云端模型，支持
**国际版**（根目录）与**国内版**（`cn/`）两个区域，可同时运行。

基于 [corrinehu/dsh-workbuddy-connect](https://github.com/corrinehu/dsh-workbuddy-connect)
的独立 ZCode 适配项目，无需安装 DSH。WorkBuddy 登录凭据读取、续期与上游
协议处理由原项目提供。

> 这是云端模型调用桥接。请求仍然消耗 WorkBuddy 账号的额度，不转移额度、
> 不在本地部署模型，也不提供额外免费额度。

## 工作流程

```text
ZCode -> http://127.0.0.1:18347/v1 -> 本地 Bridge -> WorkBuddy AI 国际版云端模型
ZCode -> http://127.0.0.1:18348/v1 -> 本地 Bridge -> WorkBuddy 国内版云端模型
```

- 两个区域各对应一个 ZCode 提供商：`WorkBuddy AI (Local)` 与 `WorkBuddy CN (Local)`。
- 支持 OpenAI Chat Completions、流式输出（SSE）、工具调用和工具结果续接。
- 只监听本机回环地址，使用独立本地访问密钥；WorkBuddy 凭据不写入 ZCode 配置。
- 模型计算在云端进行，Bridge 不进行本地 GPU 推理（空闲内存约 100 MB/实例）。

## 目录结构

```text
bridge.mjs / verify.mjs / zcode-shape-test.mjs   国际版 Bridge（端口 18347）
cn/                                              国内版 Bridge（端口 18348）
keepalive/                                       自启动守护（推荐安装）
tests/                                           配置合并的自动化测试
Setup.cmd / setup.ps1 / start.ps1 / stop.ps1     国际版安装与启动脚本
```

## 环境要求

- Windows 10/11；安装脚本针对 Windows。
- [Node.js](https://nodejs.org/) 22 或更高版本，包含 npm。
- 对应区域已安装并登录 WorkBuddy 桌面应用。
- 已安装并至少打开过一次 ZCode，使其生成个人提供商配置。
- 首次安装需要网络连接以下载 npm 依赖。

已在 Windows、Node.js 22 和 ZCode 3.14.4 上验证。其他版本未作兼容性保证。

## 首次安装（国际版）

1. 下载本仓库 ZIP 并解压到一个长期保留的目录，或使用 `git clone`。
2. 保存 ZCode 中的工作，并停止正在执行的任务。
3. 双击 `Setup.cmd`，输入 `ZCode.exe` 和 `WorkBuddyAI.exe` 的完整路径。
4. 安装脚本会下载锁定的依赖、限制凭据目录访问权限、创建桌面快捷方式、
   重启 ZCode 并配置模型。
5. 在 ZCode 的模型选择菜单中选择 `WorkBuddy AI (Local)` 下的模型。

## 首次安装（国内版）

1. 确认已登录 WorkBuddy 国内版桌面应用。
2. 参照 `cn/settings.example.json` 创建 `cn/settings.local.json`，填入国内版
   WorkBuddy 可执行文件完整路径。
3. 在 `cn/` 目录执行：

   ```powershell
   npm ci --ignore-scripts --no-audit --no-fund
   npm start
   ```

4. 按 `keepalive/README.md` 安装 keepalive（推荐），它会把两个区域的
   模型目录都注册进 ZCode 并保持常驻。

安装过程不会要求你粘贴 WorkBuddy Token。不要将 Token 发到 Issues 中。
本地路径保存在各自的 `settings.local.json`，此文件不会被 Git 跟踪。

## 自启动（推荐）

没有 keepalive 时，重启电脑后需要手动重新启动 Bridge，否则 ZCode 里的
WorkBuddy 模型会因连接被拒而不可用。安装一次即可：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File keepalive\install-task.ps1
```

之后每 5 分钟自动巡检：Bridge 不在就拉起，模型目录变化就同步到 ZCode，
电脑重启后自动恢复。详见 `keepalive/README.md`。

## 命令行

```powershell
npm ci --ignore-scripts --no-audit --no-fund   # 安装依赖（cn/ 同理）
npm start                                       # 前台运行国际版 Bridge
npm run configure                               # 写入 ZCode 模型配置（两个区域）
npm run verify                                  # 聊天/工具调用/流式验证
npm test                                        # 自动化测试
node keepalive/smoke-test.mjs                   # 两个 Bridge 的流式自检
node zcode-shape-test.mjs 18347 glm-5.3-flash   # 模拟 ZCode 的请求形状
```

本地密钥位于各 Bridge 的 `state/bridge.key`；不要分享，不要把监听地址改成
公网地址。`WORKBUDDY_AI_ELECTRON_BIN` / `WORKBUDDY_ELECTRON_BIN` 可覆盖
WorkBuddy 可执行文件路径。`ZCODE_CONFIG_PATH` 可覆盖 ZCode 配置文件位置。

## 安全与隐私

- Bridge 只绑定 `127.0.0.1`；`state/` 目录、`settings.local.json`、
  `*.log` 均被 `.gitignore` 排除，不会进入版本库。
- WorkBuddy Token 只存在于本地凭据解析链路中，不出现在 ZCode 配置或本仓库。
- 两个区域使用独立的凭据、密钥、端口与 ZCode 提供商，互不混用。

## 常见问题

- **ZCode 里模型突然全部不可用**：Bridge 进程没在运行。安装 keepalive 可
  自愈；临时修复可 `npm start` 或检查 `schtasks /Query /TN WorkBuddyZCode-BridgeKeepalive`。
- **有思考输出但没有正文**：推理模型的 `reasoning_content` 会先消耗
  `max_tokens`，调大输出预算即可。
- **模型列表与客户端不一致**：Bridge 每 15 分钟刷新目录；ZCode 重启后展示
  最新列表。keepalive 会在目录变化时自动同步配置。

## 验证状态

- 聊天、工具调用与续接、SSE 流式：两个区域均通过。
- ZCode 请求形状（`stream_options`、`developer` 角色消息、对象形式
  `tool_choice`、`max_completion_tokens`、penalties 等）：全部兼容。
- `npm test`：配置合并保留既有提供商、幂等、异常配置拒绝。

上游依赖变更或 WorkBuddy 私有接口调整可能影响可用性；欢迎带着
`bridge-error.log` 中的脱敏错误信息提 Issue。

上游项目：https://github.com/corrinehu/dsh-workbuddy-connect
