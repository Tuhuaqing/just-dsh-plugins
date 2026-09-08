# just-dsh-plugins

基于Cordis思想实现的一组超绝的DSH插件

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

## 许可证

本项目基于 [Apache License 2.0](./LICENSE) 开源。
