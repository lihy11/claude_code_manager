# cc_manage

[English Documentation](README.md)

`ccm` 是一个交互式全屏 TUI，用来管理多套 Claude 服务商/模型/Key 配置，并在激活配置时同步到 Claude 的设置文件。

## 项目目标

- 用单一命令 `ccm` 进行多套 Claude 配置的新增、编辑、删除与切换
- 激活配置时，自动写入 `~/.claude/settings.json` 中的 `env` 字段

## 功能

- 全屏菜单 + 弹窗输入的交互流程，支持快速回退（`Esc` / `←`）
- 配置列表、当前生效配置详情查看
- 新增 / 修改 / 删除 / 切换配置，一键重新同步 settings.json
- 支持从已有 `~/.claude/settings.json` 导入初始配置

## 支持能力

- 自定义服务商名称、Base URL 与 API Key
- 多种模型模式：`none` / `sonnet_only` / `all_same` / `split_three`
- 自定义额外环境变量 `extraEnv`，合并到最终 `env`
- 原子化写入配置文件与 settings.json

## 使用方式

```bash
npm install
npm run build
node dist/cli.js
```

可选：在仓库内全局链接，直接使用 `ccm` 命令：

```bash
npm link
ccm
```

常用菜单入口：

- 查看配置列表（标记 active）
- 新增配置 / 修改配置 / 删除配置
- 切换生效配置（activate）
- 查看当前生效详情 / 重新同步 settings.json

## 数据文件

- Profiles 存储：`~/.claude/cc-profiles.json`
- Claude settings 同步目标：`~/.claude/settings.json`
