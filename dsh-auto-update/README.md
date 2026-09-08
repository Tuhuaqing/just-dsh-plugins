# dsh-auto-update

自动检测并更新 DeepSeek Harness（dsh）的插件。在 dsh web 侧边栏左下角显示当前版本，
发现官方新版本后一键 `npm install -g` 更新并重启。

## 功能

1. 通过 `dsh plugin add` 安装后立即热加载生效，无需重启 dsh。
2. 插件加载时立即检查一次，之后每 30 分钟检查当前 dsh 版本与官方最新版本。
3. 在 dsh web 左下角设置按钮最右侧，以小号灰色字体显示当前运行版本。
4. 检测到最新版**高于**当前版时，在版本号右侧显示蓝色「更新」按钮（蓝底黑字）。
   点击后按钮变为 loading spinner，后台执行 `npm install -g` 安装最新版；
   安装完成后按钮文字变为「重启」。
5. 点击「重启」后，开启独立子进程：先关闭占用 3080 端口的进程，再以
   `dsh web --no-open` 重启，日志追加写入 `~/dsh.log`。

## 目录结构

```
dsh-auto-update/
├── README.md   # 本文档
├── host.js     # Host 半边（版本检查、npm install、重启脚本）
└── client.js   # Client 半边（侧边栏版本号 + 更新/重启按钮）
```

`host.js` / `client.js` 分别对应 DSH 动态插件的 `code.host` / `code.client`：
每个文件是一个「返回 Cordis Plugin 的函数体」。

## 工作原理

- **版本检查（Host）**：`dsh --version` 读取当前版本；`npm view @deepseek-ai/dsh version`
  读取 npm 官方 `latest` 通道的最新版本。加载时执行一次，之后 `timer.interval` 每 30 分钟一次。
- **Client ↔ Host 通信**：Host 用 `harness.handle` 注册三个 RPC 方法
  （`getStatus` / `installUpdate` / `restart`），Client 通过 `host.call` 调用。
- **更新**：`installUpdate` 执行 `npm install -g @deepseek-ai/dsh@latest`。
- **重启（跨平台）**：`restart` 先用 `node -p process.platform` 检测操作系统，再按平台选择脚本——
  Linux 用 `setsid + nohup + &`、macOS 用 `nohup + &`（无 setsid）、Windows 用 PowerShell
  （`Get-NetTCPConnection` 结束监听进程 + `Start-Process` 拉起新进程），均以脱离父进程的方式后台运行，
  确保父进程（当前 dsh web）被杀死后脚本仍能继续启动新进程。

## 依赖说明

- Host 侧依赖 `shell`（bash 后端）与 `timer` 服务；Client 侧依赖 `slots` 与 `timer` 服务。
- 重启脚本按平台依赖：Linux 依赖 `lsof`（或 `fuser`）/`setsid`/`nohup`；macOS 依赖 `lsof`/`nohup`；
  Windows 依赖 PowerShell（`Get-NetTCPConnection`/`Stop-Process`/`Start-Process`，需 PowerShell 4+）。
- 版本号显示在 `settings.trigger` 插槽（即「设置」按钮的内容区），紧挨「设置」文字右侧；
  更新/重启按钮也渲染在设置按钮内部，点击时用 `stopPropagation` 阻止冒泡以避免误打开设置面板。
  侧边栏折叠为窄栏时只显示齿轮图标（隐藏版本号与按钮）。

## 注意事项

- 「最新版本」取自 npm 的 `latest` dist-tag，即 `npm install -g @deepseek-ai/dsh` 会安装的版本，
  保证「检测到的版本」与「实际安装的版本」一致。若你使用 `next` 等预发布通道，
  可自行将 `host.js` 中的 `DIST_TAG` 改为对应 tag。
- 版本比较使用 semver（`compareVersions`）：仅当 `latest > current`（最新版更高）时才提示更新，
  避免跨通道 / 预发布导致的降级（例如当前运行 `next` 通道的 `0.1.2-rc.1` 高于 `latest` 通道的
  `0.1.1-rc.2` 时，不会误提示「更新」）。
