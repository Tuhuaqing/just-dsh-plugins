# 项目记忆

## 项目用途

本目录 `just-dsh-plugins` 专门用于开发各种 DSH(Cordis) 插件。

- 每个子文件夹 = 一个独立的插件。
- 插件开发遵循 DSH 动态 Cordis 插件规范(Host / Client 代码)。

## 目录与命名规范

- 开发一个插件就是新建一个文件夹。
- 文件夹命名必须以 `dsh-` 开头,例如 `dsh-hello`、`dsh-timer`、`dsh-theme`。
- 每个插件文件夹内包含该插件自身的源码、配置与文档,互不影响。
- 每个插件就是一个独立的git仓库, 对应各自的git remote仓库
