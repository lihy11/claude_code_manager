# `ccm` 交互式配置管理器（仅单命令入口）实现计划

## Summary
实现一个仅通过 `ccm` 启动的交互式控制台应用（不提供任何子命令），用于管理多套 Claude 服务商配置（provider/model/key），并在“激活配置”时把结果写入 `~/.claude/settings.json`。  
配置仓库存储为 `~/.claude/cc-profiles.json`，支持新增、修改、删除、切换、查看当前生效配置。

## 1. 用户入口与交互形态
1. 可执行文件仅有：`ccm`
2. 执行 `ccm` 后直接进入主菜单（循环）：
   - 查看配置列表（标记 active）
   - 新增配置
   - 修改配置
   - 删除配置
   - 切换生效配置（activate）
   - 查看当前生效详情
   - 重新同步到 `settings.json`
   - 退出
3. 所有输入都在菜单内完成（选择 + 文本输入 + 二次确认）。

## 2. 重要接口与数据结构
1. 存储文件：`~/.claude/cc-profiles.json`
2. 文件结构：
   - `version: 1`
   - `activeProfileId: string | null`
   - `profiles: Profile[]`
3. `Profile`：
   - `id`, `name`
   - `providerName`（如 zhipu/openrouter/custom）
   - `baseUrl`
   - `apiKey`（明文，按已确认要求）
   - `modelMode: "none" | "sonnet_only" | "all_same" | "split_three"`
   - `sonnetModel?`, `sharedModel?`, `haikuModel?`, `opusModel?`
   - `extraEnv?: Record<string, string>`
   - `createdAt`, `updatedAt`

## 3. 激活与写入规则（核心）
1. 选中 profile 后，构建新的 `env`。
2. 写入映射：
   - `apiKey -> ANTHROPIC_AUTH_TOKEN`
   - `baseUrl -> ANTHROPIC_BASE_URL`
   - `modelMode=none`：不写模型键
   - `modelMode=sonnet_only`：只写 `ANTHROPIC_DEFAULT_SONNET_MODEL`
   - `modelMode=all_same`：同一模型写入 `HAIKU/SONNET/OPUS`
   - `modelMode=split_three`：分别写三项
3. `extraEnv` 合并到最终 `env`。
4. 按确认要求：`settings.env` 采用“整体重写”策略。
5. 写入完成后更新 `activeProfileId`。

## 4. 初始化与迁移
1. 首次运行若 `~/.claude/cc-profiles.json` 不存在则自动创建。
2. 提供一次性引导：可从当前 `~/.claude/settings.json` 导入为初始 profile。
3. 导入时自动推断 `modelMode`（none/sonnet_only/all_same/split_three）。

## 5. 实现分层
1. `src/cli.ts`：启动与主菜单循环
2. `src/ui/menu.ts`：菜单与输入流程
3. `src/services/profile-store.ts`：profiles 读写与原子写入
4. `src/services/settings-sync.ts`：激活写入 `~/.claude/settings.json`
5. `src/services/env-builder.ts`：env 生成规则
6. `src/types.ts` + `src/schema.ts`：类型与校验

## 6. 测试用例与验收场景
1. 新增 profile 后可在列表看到，字段正确保存。
2. 修改 profile 后 `updatedAt` 更新，内容可回显。
3. 删除 profile 有确认，删除 active 时 active 置空。
4. 激活 profile 后：
   - `activeProfileId` 正确
   - `~/.claude/settings.json` 的 `env` 与映射规则一致
5. `modelMode=none` 时不写任何 `ANTHROPIC_DEFAULT_*_MODEL`。
6. 重新同步功能可在手工改坏 `settings.json` 后恢复一致。
7. 非 `env` 顶层字段保持不变。

## 7. Assumptions / Defaults
1. 技术栈：`Node + TypeScript`
2. 仅 `ccm` 单入口，无子命令
3. profile 存储为单文件 `~/.claude/cc-profiles.json`
4. API Key 明文存储
5. 默认模型模式为 `sonnet_only`，但创建/编辑时可改为 `none` 或其他模式
6. 激活时重写整个 `settings.env`
