# dsh-auto-update

自动检测最新DeepSeek Harness版本, 显示当前版本号, 并提供一键升级按钮。

## 功能

1. `dsh plugin add` 安装后立即热加载生效，无需重启 dsh。
2. 加载时立即检查一次，之后每 30 分钟检查当前 dsh 版本与官方最新版本。
3. 在 dsh web 左下角「设置」按钮内、靠右，以小号灰色字体显示当前运行版本。
4. 检测到最新版**高于**当前版时，在版本号右侧显示蓝色「更新」按钮（蓝底黑字）。
   点击后按钮变为 loading spinner，后台执行 `npm install -g` 安装最新版；
   安装完成后按钮文字变为「重启」。
5. 点击「重启」后，开启独立子进程：先关闭占用 3080 端口的进程，再以
   `dsh web --no-open` 重启，日志追加写入 `~/dsh.log`（Windows 写 `%USERPROFILE%\dsh.log`）。

## 安装

发布到 npm 后：

```bash
dsh plugin --profile web add dsh-auto-update
```

本地开发可直接用路径安装（从仓库根目录执行）：

```bash
dsh plugin --profile web add ./plugins/dsh-auto-update
```

## 目录结构

```
dsh-auto-update/
├── package.json        # 声明 dsh.bundle.patch + dsh.client
├── cordis.patch.yml    # 挂载条目（insert：id + 包名）
├── index.js            # Host 半边：ESM 模块，export { name, inject, apply }
└── client.js           # Client 半边：浏览器 bundle（window.__ModuleLoader__.load）
```

> 本插件为纯手写 JS、无构建步骤，故入口按官方 bundle 最简范式直接放在包根目录
> （对照[打包与安装插件](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)
> 的 `hello-plugin` 示例）。`lib/` 在 dsh 约定中指由 `src/` 构建出的产物目录，此处不适用。

## 工作原理

- **版本检查（Host）**：`dsh --version` 读取当前版本；`npm view @deepseek-ai/dsh version`
  读取 npm 官方 `latest` 通道的最新版本。加载时执行一次，之后 `ctx.interval` 每 30 分钟一次。
- **Client ↔ Host 通信**：Host 用 `ctx.webServer.register` 注册 `/dsh-auto-update/api` 路由
  （POST `{method}` → JSON），Client 通过 `fetch()` 调用，方法为 `getStatus` / `installUpdate` / `restart`。
- **更新**：`installUpdate` 执行 `npm install -g @deepseek-ai/dsh@latest`。
- **重启（跨平台）**：`restart` 先用 `node -p process.platform` 检测操作系统，再按平台选择脚本——
  Linux 用 `setsid + nohup + &`、macOS 用 `nohup + &`（无 setsid）、Windows 用 PowerShell
  （`Get-NetTCPConnection` 结束监听进程 + `Start-Process` 拉起新进程），均以脱离父进程的方式后台运行，
  确保父进程（当前 dsh web）被杀死后脚本仍能继续启动新进程。

## 依赖说明

- Host 侧依赖 `shell`（bash 后端）、`timer`、`webServer` 服务；Client 侧依赖 `slots`、`timer` 服务。
- 重启脚本按平台依赖：Linux 依赖 `lsof`（或 `fuser`）/`setsid`/`nohup`；macOS 依赖 `lsof`/`nohup`；
  Windows 依赖 PowerShell（`Get-NetTCPConnection`/`Stop-Process`/`Start-Process`，需 PowerShell 4+）。
- 版本号显示在 `settings.trigger` 插槽（即「设置」按钮的内容区），侧边栏折叠为窄栏时只显示齿轮图标。

## 注意事项

- 「最新版本」取自 npm 的 `DIST_TAG` dist-tag（默认 `latest`），检测与安装始终锁定同一通道：
  即检测到的版本，就是 `npm install -g @deepseek-ai/dsh@<DIST_TAG>` 会安装的版本。
  改 `index.js` 中的 `DIST_TAG` 即可切换通道，例如 `next`（预发布）、`alpha`（内测）；
  dist-tag 是任意字符串标签，`beta` / `rc` 等（含官方未来新增的）也自动兼容，
  只需保证该 tag 在 npm 上确实存在，否则检测会报错而非误报更新。
- 版本比较使用 semver（`compareVersions`）：仅当 `latest > current`（最新版更高）时才提示更新，
  避免跨通道 / 预发布导致的降级。
