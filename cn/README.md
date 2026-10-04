# WorkBuddy CN (国内版) Bridge

在 ZCode 中使用已登录的 WorkBuddy 国内版账号所提供的云端模型。
与根目录的国际版 Bridge 相互独立：独立的端口、凭据、本地密钥和 ZCode 提供商。

## 与国际版的差异

- 监听 `http://127.0.0.1:18348/v1`（国际版是 18347）。
- 使用 `dsh-workbuddy-connect` 的 `CN_VARIANT` 与 `WORKBUDDY_ELECTRON_BIN`
  环境变量（指向国内版 WorkBuddy 可执行文件）。
- 模型目录来自国内版接口，ZCode 提供商名为 `WorkBuddy CN (Local)`。
- 端到端线路：`ZCode -> http://127.0.0.1:18348/v1 -> 本地 Bridge -> WorkBuddy 国内版云端模型`。

## 安装与运行

1. 确认已安装并登录 WorkBuddy 国内版桌面应用。
2. 参照 `settings.example.json` 创建 `settings.local.json`，填入国内版
   WorkBuddy 可执行文件完整路径。
3. 安装依赖并启动：

   ```powershell
   npm ci --ignore-scripts --no-audit --no-fund
   npm start
   ```

4. Bridge 启动后，运行 `..\keepalive\configure-zcode.mjs` 注册 ZCode 提供商，
   或按 `..\keepalive\README.md` 安装 keepalive 计划任务（自动注册 + 常驻）。

## 验证

```powershell
npm run verify          # 聊天、工具调用、流式
node zcode-shape-test.mjs 18348 glm-5.3-flash   # 模拟 ZCode 的请求形状
```

验证请求消耗账号额度。`verify.mjs` 支持环境变量 `BRIDGE_PORT` 与 `BRIDGE_MODEL`。

## 本地文件

`state/` 目录（含 `bridge.key`、`credentials.json`、`models.json`、`runtime.json`）
不会被 Git 跟踪，也不要分享其中任何内容。
