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

从 npm 安装：

```bash
dsh plugin --profile web add @just-ai/dsh-auto-update
```

从本地安装（从仓库根目录执行）：

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

- **版本检查（Host）**：`dsh --version` 读取当前版本；`npm view @deepseek-ai/dsh time --json`
  读取 npm 上**所有版本的发布时间**，取其中发布时间最近的版本作为「最新版」（跨通道，不区分
  latest / next / alpha）。加载时执行一次，之后 `ctx.interval` 每 30 分钟一次。
- **Client ↔ Host 通信**：Host 用 `ctx.webServer.register` 注册 `/dsh-auto-update/api` 路由
  （POST `{method}` → JSON），Client 通过 `fetch()` 调用，方法为 `getStatus` / `installUpdate` / `restart`。
- **更新**：`installUpdate` 执行 `npm install -g @deepseek-ai/dsh@<最新版确切版本号>`（安装的就是
  检测到的那个发布时间最近的版本，而非某个 dist-tag）。
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

- 「最新版本」= npm 上**发布时间最近**的版本，跨所有通道选取，不再按 dist-tag
  （latest / next / alpha …）区分通道。例如 alpha 通道的 `0.1.5-alpha.2` 虽是 `alpha` tag
  指向的版本，但若 `0.1.5-rc.2` 发布时间更晚，则后者才是「真正的最新版」，检测与安装都取它。
  检测到的版本就是会被安装的版本：`npm install -g @deepseek-ai/dsh@<该确切版本号>`。
- 防降级：当前版本在 npm 上有发布记录时，只有当「最新版发布时间 > 当前版发布时间」才提示更新，
  即便当前跑的是发布时间更晚的版本也不会被拉回旧版本；若当前版本在 npm 上查不到发布时间
  （本地 / 未发布版本），则只要版本号不同即视为可更新。
