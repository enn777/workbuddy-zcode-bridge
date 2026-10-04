# Bridge Keepalive（自启动守护）

保持 `bridges.json` 中声明的所有 WorkBuddy 本地 Bridge 常驻，并把模型目录
同步到 ZCode 配置。没有它，电脑重启后 Bridge 不会自己恢复，ZCode 里的
WorkBuddy 模型会因连接被拒而不可用——这是最常见的"突然不能用"的原因。

## 工作方式

- 计划任务 `WorkBuddyZCode-BridgeKeepalive`：每 5 分钟 + 用户登录时运行
  `node keepalive.mjs`（当前用户权限，无需管理员）。
- `keepalive.mjs` 对每个 Bridge：
  1. 用各自 `state/bridge.key` 调 `/health`；
  2. 不健康则后台启动一个实例并等待就绪；
  3. 运行 `configure-zcode.mjs` 同步 ZCode 模型列表（内容无变化时不写盘）。
- 日志：`keepalive.log`（健康且无变化时不产生输出，属正常现象）。

## 安装

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File install-task.ps1
```

脚本会在运行时生成任务 XML（探测当前 node.exe 路径与当前用户），然后通过
`schtasks /Create /XML` 注册。以当前用户注册无需管理员权限；仓库里不包含
任何机器相关的静态任务文件。

## bridges.json

```json
[
  { "name": "workbuddy-ai", "port": 18347, "dir": "..",    "providerId": "workbuddy-ai-local", "providerName": "WorkBuddy AI (Local)" },
  { "name": "workbuddy-cn", "port": 18348, "dir": "../cn", "providerId": "workbuddy-cn-local", "providerName": "WorkBuddy CN (Local)" }
]
```

`dir` 是 Bridge 所在目录（相对本目录）。只跑一个区域就删掉另一行。

## 常用操作

```powershell
node keepalive.mjs        # 立即巡检一次
node smoke-test.mjs       # 每个 Bridge 各发一条流式请求，期望全部 PASS
node debug-diff.mjs       # 只读对比 ZCode 配置与模型目录
schtasks /Query /TN WorkBuddyZCode-BridgeKeepalive /V /FO LIST
schtasks /Run /TN WorkBuddyZCode-BridgeKeepalive    # 手动触发
```

## 已知坑（给维护者）

- **不要用 PowerShell 实现 keepalive 主体**：在部分机器上，此类
  "HTTP 健康检查 + 隐藏窗口启动进程"的 PowerShell 脚本会被 AMSI/Defender
  启发式秒删。Node 脚本没有这个问题。
- **比较 ZCode 配置必须忽略 JSON key 顺序**：ZCode 会按自己的键序重写
  `provider_config.json`，严格 stringify 比较会造成每 5 分钟一次的写盘循环。
  `configure-zcode.mjs` 已内置键序无关比较。
- 非管理员下 `Register-ScheduledTask` 可能被拒绝（0x80070005），
  `schtasks.exe /Create /XML` 可以。
- 推理模型的 `reasoning_content` 会先消耗 `max_tokens`，自检脚本因此使用
  512 预算；预算过小会出现"有思考、正文为空"的正常现象，不是故障。
