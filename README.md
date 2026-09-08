# just-dsh-plugins

DeepSeek Harness（DSH / Cordis）动态插件集合。

本仓库汇总了一系列 DSH 插件，每个子目录都是一个独立、自包含的插件，遵循 DSH 动态
Cordis 插件规范（Host / Client 两半代码）。

## 目录规范

- 每个插件对应一个子文件夹，文件夹名以 `dsh-` 开头（例如 `dsh-auto-update`）。
- 每个插件目录内包含自身的源码、配置与文档，彼此独立、互不影响。
- 插件的 `host.js` / `client.js` 分别对应 DSH 动态插件的 `code.host` / `code.client`，
  每个文件是一个「返回 Cordis Plugin 的函数体」。

## 插件列表

| 插件 | 说明 |
| --- | --- |
| [`dsh-auto-update`](./dsh-auto-update) | 自动检测并更新 DeepSeek Harness，在 web 侧边栏显示当前版本并提供一键更新 / 重启。 |

### dsh-auto-update

自动检测并更新 DSH 的插件。在 dsh web 侧边栏「设置」按钮旁显示当前运行版本，发现官方新
版本后可一键 `npm install -g` 更新并重启。

- 加载后立即热生效，无需重启 dsh；之后每 30 分钟检查一次当前版本与官方 `latest` 版本。
- 检测到更高版本时显示「更新」按钮，安装完成后变为「重启」按钮。
- 重启脚本跨平台（Linux / macOS / Windows），以脱离父进程的方式后台拉起新的 `dsh web`。

详见 [`dsh-auto-update/README.md`](./dsh-auto-update/README.md)。

## 安装插件

以 `dsh-auto-update` 为例：

```bash
dsh plugin add ./dsh-auto-update
```

安装后即可热加载生效。

## 新增插件

1. 在仓库根目录新建以 `dsh-` 开头的文件夹。
2. 在其中放入 `host.js`、`client.js` 与 `README.md`。
3. 更新本文件的「插件列表」。

## 许可证

本项目基于 [Apache License 2.0](./LICENSE) 开源。
