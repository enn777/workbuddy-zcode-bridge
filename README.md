# WorkBuddy ZCode Bridge

在 ZCode 中使用已登录的 WorkBuddy AI 国际版账号所提供的云端模型。

基于 [corrinehu/dsh-workbuddy-connect](https://github.com/corrinehu/dsh-workbuddy-connect) 的独立 ZCode 适配项目，无需安装 DSH。
本项目增加了固定地址的本地服务、ZCode 模型配置、Windows 安装和桌面启动流程。
WorkBuddy 登录凭据读取、续期与上游协议处理由原项目提供。

> 这是云端模型调用桥接。请求仍然消耗 WorkBuddy 账号的额度，不转移额度、不在本地部署模型，也不提供额外免费额度。

## 工作流程

```text
ZCode -> http://127.0.0.1:18347/v1 -> 本地 Bridge -> WorkBuddy AI 云端模型
```

- 将账号可用模型加入 ZCode 的 `WorkBuddy AI (Local)` 提供商。
- 支持 OpenAI Chat Completions、流式输出、工具调用和工具结果续接。
- 桌面一键启动，每次启动先重启 ZCode；已有 Bridge 会被复用。
- 读取并备份现有 ZCode 配置，保留其他提供商和默认选择。
- 仅监听本机回环地址，使用独立本地访问密钥；WorkBuddy 凭据不会写入 ZCode 配置。
- 模型计算在云端进行，Bridge 不进行本地 GPU 推理。

## 环境要求

- Windows 10/11；安装脚本针对 Windows。
- [Node.js](https://nodejs.org/) 22 或更高版本，包含 npm，安装后须能执行 `node` 和 `npm`。
- 已安装并登录 WorkBuddy AI 国际版。
- 已安装并至少打开过一次 ZCode，使其生成个人提供商配置。
- 首次安装需要网络连接以下载 npm 依赖。

已在 Windows、Node.js 22 和 ZCode 3.14.4 上验证。其他版本未作兼容性保证。

## 首次安装

1. 下载本仓库 ZIP 并解压到一个长期保留的目录，或使用 `git clone`。
2. 保存 ZCode 中的工作，并停止正在执行的任务。
3. 双击 `Setup.cmd`，输入 `ZCode.exe` 和 `WorkBuddyAI.exe` 的完整路径。路径可从应用快捷方式的属性中查看。
4. 安装脚本会下载锁定的依赖、限制凭据目录访问权限、创建桌面快捷方式、重启 ZCode 并配置模型。
5. 在 ZCode 的模型选择菜单中选择 `WorkBuddy AI (Local)` 下的模型。

安装过程不会要求你粘贴 WorkBuddy Token。不要将 Token 发到 Issues 中。
本地路径保存在 `settings.local.json`，此文件不会被 Git 跟踪。
也可以参考 `settings.example.json` 手动创建本地配置后运行安装脚本。

## 日常使用

双击桌面的 **WorkBuddy ZCode Bridge** 快捷方式，或项目内的 `Start Bridge.cmd`。
每次都会重启 ZCode，未退出的进程在 5 秒后会被强制结束，因此请先保存工作并停止任务。
启动成功后直接在 ZCode 选择模型。关闭启动窗口不会停止 Bridge。

重启 Windows 后需要再次双击启动；本项目不设置开机自启。
双击 `Stop Bridge.cmd` 可停止 Bridge。不要移动或删除安装目录，否则桌面快捷方式会失效。
保持 WorkBuddy AI 安装和登录状态；登录过期时先在 WorkBuddy AI 中重新登录。

Bridge 每 15 分钟刷新一次可用模型目录，每次点击启动脚本会重新同步 ZCode 的模型列表。
首次启动以及账号模型变化可能需要稍等片刻或重新打开模型菜单。

## 命令行

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm start
```

`npm start` 仅前台运行 Bridge，不会重启 ZCode，也不会自动配置提供商。
在另一个终端运行 `npm run configure` 写入 ZCode 模型配置。
使用完整 Windows 安装流程时请运行 `Setup.cmd`。

服务固定使用 `127.0.0.1:18347`，仅支持一个实例。
本地密钥位于 `state/bridge.key`；不要分享，不要把监听地址改成公网地址。
`WORKBUDDY_AI_ELECTRON_BIN` 可覆盖 WorkBuddy 可执行文件路径。
`ZCODE_CONFIG_PATH` 可覆盖配置文件位置，供测试或特殊安装使用。

## 验证

```powershell
npm test
```

离线测试验证配置合并、重复配置和不支持的配置格式，不消耗账号额度。

```powershell
npm run verify
```

在线验证须先启动 Bridge，会发送四个模型请求并消耗 WorkBuddy 额度。
默认测试 `glm-5.3-flash`，可通过 `WORKBUDDY_TEST_MODEL` 指定账号可用且支持工具调用的模型。
已在原部署中验证普通聊天、流式输出、工具调用与续接；未逐一验证所有模型。

## 文件与隐私

| 文件 | 用途 |
| --- | --- |
| `bridge.mjs` | 鉴权本地 HTTP 服务和流式协议适配 |
| `configure-zcode.mjs` | ZCode 提供商、模型合并和备份 |
| `setup.ps1` / `Setup.cmd` | 安装依赖、设置路径和桌面快捷方式 |
| `start.ps1` / `Start Bridge.cmd` | 重启 ZCode，启动或复用 Bridge 并更新配置 |
| `stop.ps1` / `Stop Bridge.cmd` | 停止本项目 Bridge |
| `settings.local.json` | 本机应用路径，不上传 |
| `state/` | 本地密钥、凭据缓存、模型目录和进程信息，不上传 |

默认 ZCode 配置路径为 `%USERPROFILE%\.zcode\v2\provider_config.json`。
写入前会在同目录创建 `.before-workbuddy-时间戳.bak` 备份。
本地密钥会存入 ZCode 提供商配置，真实 WorkBuddy Token 不会存入其中。
配置备份可能包含其他提供商的 API Key，请勿公开。
`state/`、本地配置、日志和依赖目录都已加入 `.gitignore`。

## 常见问题

**PowerShell 阻止脚本运行？** 在 PowerShell 中检查 `Get-ExecutionPolicy -List`。
按照电脑所属组织的策略配置允许的脚本执行方式；脚本不会自动绕过执行策略。

**端口已占用？** 先停止之前的 Bridge。若运行的是旧部署，请在旧目录运行其停止脚本。
不要同时启动两个不同目录的 Bridge；它们有不同的密钥。

**看不到模型？** 确认启动窗口显示成功；查看 `bridge-error.log`，检查 WorkBuddy 登录状态。
如果出现配置格式错误，可能是 ZCode 版本改变了配置结构。不要直接覆盖配置文件。

**会占用显卡吗？** Bridge 不进行模型推理，主要消耗少量 CPU、内存和网络。
一次空闲测量约为 68 MB 内存；并发请求、长上下文及应用版本变化会改变占用。
ZCode 自身运行任务的资源占用另计。

## 范围与限制

这是非官方社区适配，未获 WorkBuddy 或 ZCode 官方背书。
使用自身有权限的账号，并遵守对应服务条款及额度限制。
依赖 WorkBuddy 桌面端的私有接口，上游更新可能导致失效。
不保证每个模型、参数或工具均兼容；不支持 OpenAI Responses 或 Anthropic Messages 接口。
原项目的 DSH 设置卡、活动展示和探测界面不包含在本项目中。

## 开源与致谢

本项目采用 [MIT License](LICENSE)。
特别感谢 [Corrine Hu 的 dsh-workbuddy-connect](https://github.com/corrinehu/dsh-workbuddy-connect)，
本项目复用它的 WorkBuddy 集成能力。第三方版权与许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
