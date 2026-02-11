import blessed from "blessed";
import { buildEnvFromProfile } from "../services/env-builder";
import { importProfileFromCurrentSettings } from "../services/importer";
import { loadProfilesStore, saveProfilesStore } from "../services/profile-store";
import { syncProfileToClaudeSettings } from "../services/settings-sync";
import type { ModelMode, Profile, ProfilesFile } from "../types";
import { createProfileId, maskSecret, nowIsoString } from "../utils/profile";

type MainAction = "list" | "add" | "edit" | "remove" | "activate" | "status" | "sync" | "exit";
type Tone = "cyan" | "green" | "yellow" | "red" | "white";

interface SelectChoice<T> {
  label: string;
  description: string;
  value: T;
  tone?: Tone;
}

type PromptResult<T> = { kind: "ok"; value: T } | { kind: "back" };

const UI = {
  bg: "default",
  border: "cyan",
  text: "white",
  muted: "gray",
  success: "green",
  warning: "yellow",
  error: "red",
  accent: "cyan",
};

const HEADER_ART = [
  "  ██████  ██████  ███    ███",
  " ██      ██      ████  ████",
  " ██      ██      ██ ████ ██",
  " ██      ██      ██  ██  ██",
  "  ██████  ██████ ██      ██",
];

export async function runMenu(): Promise<void> {
  const app = new CcmInteractiveApp();
  await app.run();
}

class CcmInteractiveApp {
  private readonly screen: blessed.Widgets.Screen;
  private store: ProfilesFile = {
    version: 1,
    activeProfileId: null,
    profiles: [],
  };
  private closed = false;
  private mainPanelCols = 80;

  constructor() {
    this.screen = blessed.screen({
      smartCSR: true,
      fullUnicode: true,
      dockBorders: false,
      title: "CCM Interactive Manager",
      autoPadding: false,
      warnings: false,
    });

    this.screen.key(["C-c"], () => {
      this.shutdown();
    });
  }

  async run(): Promise<void> {
    try {
      const { store, created } = await loadProfilesStore();
      this.store = store;

      if (created) {
        await this.handleFirstRunImport();
      }

      let running = true;
      while (running) {
        const action = await this.renderMainMenu();
        if (action.kind === "back" || action.value === "exit") {
          running = false;
          continue;
        }

        if (action.value === "list") {
          await this.showProfilesPage();
        } else if (action.value === "add") {
          await this.addProfileFlow();
        } else if (action.value === "edit") {
          await this.editProfileFlow();
        } else if (action.value === "remove") {
          await this.removeProfileFlow();
        } else if (action.value === "activate") {
          await this.activateProfileFlow();
        } else if (action.value === "status") {
          await this.showActiveStatusPage();
        } else if (action.value === "sync") {
          await this.syncActiveProfileFlow();
        }
      }
    } finally {
      this.shutdown();
    }
  }

  private shutdown() {
    if (!this.closed) {
      this.closed = true;
      this.screen.destroy();
    }
  }

  private async handleFirstRunImport(): Promise<void> {
    const content = this.renderFrame("首次初始化", "检测到首次运行，建议从现有 settings 导入。");
    content.setContent(
      [
        "{bold}首次启动向导{/bold}",
        "",
        "将创建 profiles 仓库并可选导入 `~/.claude/settings.json`。",
        "按 {bold}Esc{/bold} 或 {bold}←{/bold} 返回主流程。",
      ].join("\n"),
    );
    this.screen.render();

    const shouldImport = await this.promptChoice(
      "导入初始化配置",
      "是否从当前 ~/.claude/settings.json 导入一个初始 profile？",
      [
        { label: "导入并设为生效", description: "读取现有 env 并创建 active profile", value: true, tone: "green" },
        { label: "跳过导入", description: "仅创建空的 profiles 仓库", value: false, tone: "yellow" },
      ],
    );
    if (shouldImport.kind !== "ok" || !shouldImport.value) {
      return;
    }

    const name = await this.promptText("导入配置名称", {
      description: "用于标识这份导入配置，例如 imported-default",
      defaultValue: "imported-default",
      required: true,
    });
    if (name.kind !== "ok") {
      return;
    }

    const imported = await importProfileFromCurrentSettings(name.value);
    if (!imported) {
      await this.showNotice("未导入", ["未检测到可导入的 env，已跳过。"], "warning");
      return;
    }

    this.store.profiles.push(imported);
    this.store.activeProfileId = imported.id;
    await saveProfilesStore(this.store);
    await syncProfileToClaudeSettings(imported);
    await this.showNotice("导入成功", [`已导入并激活: ${imported.name}`], "success");
  }

  private async renderMainMenu(): Promise<PromptResult<MainAction>> {
    const content = this.renderFrame("主菜单", "配置管理入口");
    const choices: SelectChoice<MainAction>[] = [
      { label: "查看配置列表", description: "浏览所有 profiles 与 active 状态", value: "list", tone: "cyan" },
      { label: "新增配置", description: "创建 provider/model/key 组合", value: "add", tone: "green" },
      { label: "修改配置", description: "更新已有配置字段", value: "edit", tone: "yellow" },
      { label: "删除配置", description: "删除配置并处理 active", value: "remove", tone: "red" },
      { label: "切换生效配置", description: "激活并同步 settings.env", value: "activate", tone: "cyan" },
      { label: "查看当前生效详情", description: "预览 active profile 与写入 env", value: "status", tone: "white" },
      { label: "重新同步", description: "按 active 重新写入 settings.json", value: "sync", tone: "cyan" },
      { label: "退出", description: "关闭 ccm", value: "exit", tone: "red" },
    ];

    content.setContent("{gray-fg}请使用 ↑/↓ 选择，Enter 确认，Esc/← 返回{/gray-fg}\n");
    const rowWidth = Math.max(28, this.mainPanelCols - 4);

    const list = blessed.list({
      parent: content,
      top: 2,
      left: 1,
      right: 1,
      bottom: 1,
      keys: true,
      vi: true,
      mouse: true,
      tags: true,
      style: {
        bg: UI.bg,
        fg: UI.text,
        item: { fg: UI.text },
        selected: { fg: UI.accent, bold: true, underline: true, bg: UI.bg },
      },
      items: choices.map((choice) => formatChoice(choice, rowWidth)),
    });

    this.screen.render();
    list.focus();

    return new Promise<PromptResult<MainAction>>((resolve) => {
      const cleanup = () => {
        list.removeAllListeners("select");
        list.unkey("escape", onBack);
        list.unkey("left", onBack);
        list.destroy();
      };

      const onBack = () => {
        cleanup();
        this.screen.render();
        resolve({ kind: "back" });
      };

      list.key("escape", onBack);
      list.key("left", onBack);

      list.on("select", (_item, index) => {
        const idx = Number(index);
        const safeIndex = Number.isInteger(idx) && idx >= 0 && idx < choices.length ? idx : 0;
        const selected = choices[safeIndex];
        cleanup();
        this.screen.render();
        resolve({ kind: "ok", value: selected.value });
      });
    });
  }

  private async showProfilesPage(): Promise<void> {
    const content = this.renderFrame("配置列表", "结构化查看 profiles");
    if (this.store.profiles.length === 0) {
      content.setContent("{yellow-fg}当前没有任何配置。{/yellow-fg}");
      this.screen.render();
      await this.waitForDismiss();
      return;
    }

    const rows: string[] = [];
    rows.push("{gray-fg}#   Name                      Provider         Mode          Active{/gray-fg}");
    rows.push("{gray-fg}--  ------------------------ --------------- ------------- ------{/gray-fg}");

    this.store.profiles.forEach((profile, index) => {
      const idx = String(index + 1).padEnd(2, " ");
      const name = padRight(truncate(profile.name, 24), 24);
      const provider = padRight(truncate(profile.providerName, 15), 15);
      const mode = padRight(profile.modelMode, 13);
      const active = profile.id === this.store.activeProfileId ? "{green-fg}yes{/green-fg}" : "{gray-fg}no{/gray-fg}";
      rows.push(`${idx}  {cyan-fg}${name}{/cyan-fg} ${provider} ${mode} ${active}`);
      rows.push(`    {gray-fg}id: ${profile.id}{/gray-fg}`);
    });

    rows.push("");
    rows.push("{gray-fg}Esc/←/Enter 返回主菜单{/gray-fg}");
    content.setContent(rows.join("\n"));
    this.screen.render();
    await this.waitForDismiss();
  }

  private async addProfileFlow(): Promise<void> {
    this.renderFrame("新增配置", "通过可视化输入框创建新 profile");
    const name = await this.promptText("配置名", {
      description: "例如: glm-prod / openrouter-main",
      required: true,
    });
    if (name.kind !== "ok") {
      return;
    }

    const provider = await this.promptText("服务商名称", {
      description: "例如: zhipu / openrouter / custom",
      defaultValue: "custom",
      required: true,
    });
    if (provider.kind !== "ok") {
      return;
    }

    const baseUrl = await this.promptText("Base URL", {
      description: "可留空，例如 https://open.bigmodel.cn/api/anthropic",
      defaultValue: "",
      required: false,
    });
    if (baseUrl.kind !== "ok") {
      return;
    }

    const apiKey = await this.promptText("API Key", {
      description: "可留空；将写入 ANTHROPIC_AUTH_TOKEN",
      defaultValue: "",
      required: false,
      maskInput: true,
    });
    if (apiKey.kind !== "ok") {
      return;
    }

    const mode = await this.promptModelMode("sonnet_only");
    if (mode.kind !== "ok") {
      return;
    }

    const models = await this.promptModelFields(mode.value);
    if (models.kind !== "ok") {
      return;
    }

    const extraEnv = await this.promptExtraEnv(undefined);
    if (extraEnv.kind !== "ok") {
      return;
    }

    const now = nowIsoString();
    const profile: Profile = {
      id: createProfileId(),
      name: name.value,
      providerName: provider.value,
      baseUrl: emptyToUndefined(baseUrl.value),
      apiKey: emptyToUndefined(apiKey.value),
      modelMode: mode.value,
      sharedModel: models.value.sharedModel,
      sonnetModel: models.value.sonnetModel,
      haikuModel: models.value.haikuModel,
      opusModel: models.value.opusModel,
      extraEnv: extraEnv.value,
      createdAt: now,
      updatedAt: now,
    };

    this.store.profiles.push(profile);
    await saveProfilesStore(this.store);

    const activate = await this.promptChoice(
      "配置已保存",
      "是否立即激活并写入 ~/.claude/settings.json ?",
      [
        { label: "立即激活", description: "设置 active 并同步 settings", value: true, tone: "green" },
        { label: "稍后激活", description: "仅保存配置，不修改 settings", value: false, tone: "yellow" },
      ],
    );

    if (activate.kind === "ok" && activate.value) {
      this.store.activeProfileId = profile.id;
      await saveProfilesStore(this.store);
      await syncProfileToClaudeSettings(profile);
      await this.showNotice("新增完成", [`已新增并激活: ${profile.name}`], "success");
      return;
    }

    await this.showNotice("新增完成", [`已新增配置: ${profile.name}`], "success");
  }

  private async editProfileFlow(): Promise<void> {
    if (this.store.profiles.length === 0) {
      await this.showNotice("无法修改", ["当前没有可修改配置。"], "warning");
      return;
    }

    this.renderFrame("修改配置", "选择一个 profile 进入编辑");
    const profile = await this.pickProfile("请选择要修改的配置");
    if (!profile) {
      return;
    }

    const name = await this.promptText("配置名", {
      description: "回车确认，Esc 返回",
      defaultValue: profile.name,
      required: true,
    });
    if (name.kind !== "ok") {
      return;
    }

    const provider = await this.promptText("服务商名称", {
      description: "回车确认，Esc 返回",
      defaultValue: profile.providerName,
      required: true,
    });
    if (provider.kind !== "ok") {
      return;
    }

    const baseUrl = await this.promptText("Base URL", {
      description: "输入 - 清空，或直接回车保持默认",
      defaultValue: profile.baseUrl ?? "",
      required: false,
    });
    if (baseUrl.kind !== "ok") {
      return;
    }

    const apiKey = await this.promptText("API Key", {
      description: "输入 - 清空，或直接回车保持默认",
      defaultValue: profile.apiKey ?? "",
      required: false,
      maskInput: true,
    });
    if (apiKey.kind !== "ok") {
      return;
    }

    const mode = await this.promptModelMode(profile.modelMode);
    if (mode.kind !== "ok") {
      return;
    }

    const models = await this.promptModelFields(mode.value, profile);
    if (models.kind !== "ok") {
      return;
    }

    const extraEnv = await this.promptExtraEnv(profile.extraEnv);
    if (extraEnv.kind !== "ok") {
      return;
    }

    const updated: Profile = {
      ...profile,
      name: name.value,
      providerName: provider.value,
      baseUrl: normalizeEditableValue(baseUrl.value),
      apiKey: normalizeEditableValue(apiKey.value),
      modelMode: mode.value,
      sharedModel: models.value.sharedModel,
      sonnetModel: models.value.sonnetModel,
      haikuModel: models.value.haikuModel,
      opusModel: models.value.opusModel,
      extraEnv: extraEnv.value,
      updatedAt: nowIsoString(),
    };

    const index = this.store.profiles.findIndex((item) => item.id === profile.id);
    this.store.profiles[index] = updated;
    await saveProfilesStore(this.store);

    if (this.store.activeProfileId === updated.id) {
      const shouldSync = await this.promptChoice(
        "当前是生效配置",
        "是否立即同步修改到 ~/.claude/settings.json ?",
        [
          { label: "立即同步", description: "将新字段写入 settings.env", value: true, tone: "green" },
          { label: "稍后手动同步", description: "仅保存 profile", value: false, tone: "yellow" },
        ],
      );
      if (shouldSync.kind === "ok" && shouldSync.value) {
        await syncProfileToClaudeSettings(updated);
      }
    }

    await this.showNotice("修改完成", [`已更新配置: ${updated.name}`], "success");
  }

  private async removeProfileFlow(): Promise<void> {
    if (this.store.profiles.length === 0) {
      await this.showNotice("无法删除", ["当前没有可删除配置。"], "warning");
      return;
    }

    this.renderFrame("删除配置", "请谨慎操作，删除后不可恢复");
    const profile = await this.pickProfile("请选择要删除的配置");
    if (!profile) {
      return;
    }

    const confirmed = await this.promptChoice(
      "确认删除",
      `确定删除 "${profile.name}" 吗？`,
      [
        { label: "确认删除", description: "执行删除", value: true, tone: "red" },
        { label: "取消", description: "返回主菜单", value: false, tone: "yellow" },
      ],
    );
    if (confirmed.kind !== "ok" || !confirmed.value) {
      return;
    }

    this.store.profiles = this.store.profiles.filter((item) => item.id !== profile.id);
    if (this.store.activeProfileId === profile.id) {
      this.store.activeProfileId = null;
    }
    await saveProfilesStore(this.store);
    await this.showNotice("删除完成", [`已删除配置: ${profile.name}`], "success");
  }

  private async activateProfileFlow(): Promise<void> {
    if (this.store.profiles.length === 0) {
      await this.showNotice("无法激活", ["当前没有可激活配置。"], "warning");
      return;
    }

    this.renderFrame("切换生效配置", "选中后将重写 settings.json 的 env");
    const profile = await this.pickProfile("请选择要激活的配置");
    if (!profile) {
      return;
    }

    this.store.activeProfileId = profile.id;
    await saveProfilesStore(this.store);
    await syncProfileToClaudeSettings(profile);
    await this.showNotice("激活成功", [`当前生效: ${profile.name}`], "success");
  }

  private async showActiveStatusPage(): Promise<void> {
    const contentBox = this.renderFrame("当前生效详情", "active profile 以及将写入 settings 的 env");

    const activeProfile = this.getActiveProfile();
    if (!activeProfile) {
      contentBox.setContent("{yellow-fg}当前没有生效配置。{/yellow-fg}");
      this.screen.render();
      await this.waitForDismiss();
      return;
    }

    const env = buildEnvFromProfile(activeProfile);
    const lines: string[] = [
      `{cyan-fg}{bold}${activeProfile.name}{/bold}{/cyan-fg} ${activeProfile.id === this.store.activeProfileId ? "{green-fg}[ACTIVE]{/green-fg}" : ""}`,
      "",
      `{gray-fg}provider:{/gray-fg} ${activeProfile.providerName}`,
      `{gray-fg}baseUrl:{/gray-fg} ${activeProfile.baseUrl ?? "(empty)"}`,
      `{gray-fg}apiKey:{/gray-fg} ${maskSecret(activeProfile.apiKey)}`,
      `{gray-fg}mode:{/gray-fg} ${activeProfile.modelMode}`,
      `{gray-fg}updatedAt:{/gray-fg} ${activeProfile.updatedAt}`,
      "",
      "{bold}settings.env preview{/bold}",
    ];

    if (Object.keys(env).length === 0) {
      lines.push("{gray-fg}(empty){/gray-fg}");
    } else {
      Object.entries(env).forEach(([key, value]) => {
        lines.push(`- {cyan-fg}${key}{/cyan-fg} = ${value}`);
      });
    }
    lines.push("");
    lines.push("{gray-fg}Esc/←/Enter 返回主菜单{/gray-fg}");

    contentBox.setContent(lines.join("\n"));
    this.screen.render();
    await this.waitForDismiss();
  }

  private async syncActiveProfileFlow(): Promise<void> {
    const active = this.getActiveProfile();
    if (!active) {
      await this.showNotice("无法同步", ["当前没有 active profile。"], "warning");
      return;
    }
    await syncProfileToClaudeSettings(active);
    await this.showNotice("同步成功", [`已按 active profile 写入 settings: ${active.name}`], "success");
  }

  private async promptModelMode(current: ModelMode): Promise<PromptResult<ModelMode>> {
    return this.promptChoice<ModelMode>("模型模式", "选择默认模型映射策略", [
      { label: withCurrent("none", current), description: "不写默认模型变量", value: "none", tone: "yellow" },
      { label: withCurrent("sonnet_only", current), description: "仅写 SONNET", value: "sonnet_only", tone: "green" },
      { label: withCurrent("all_same", current), description: "三模型写同一值", value: "all_same", tone: "cyan" },
      { label: withCurrent("split_three", current), description: "三模型分别设置", value: "split_three", tone: "white" },
    ]);
  }

  private async promptModelFields(
    mode: ModelMode,
    source?: Profile,
  ): Promise<PromptResult<{
    sharedModel?: string;
    sonnetModel?: string;
    haikuModel?: string;
    opusModel?: string;
  }>> {
    if (mode === "none") {
      return { kind: "ok", value: {} };
    }

    if (mode === "sonnet_only") {
      const sonnet = await this.promptText("Sonnet 模型", {
        description: "例如 claude-3-7-sonnet-latest",
        defaultValue: source?.sonnetModel ?? "claude-3-7-sonnet-latest",
        required: true,
      });
      if (sonnet.kind !== "ok") {
        return { kind: "back" };
      }
      return { kind: "ok", value: { sonnetModel: sonnet.value } };
    }

    if (mode === "all_same") {
      const shared = await this.promptText("统一模型名", {
        description: "该值将写入 HAIKU/SONNET/OPUS",
        defaultValue: source?.sharedModel ?? source?.sonnetModel ?? "claude-3-7-sonnet-latest",
        required: true,
      });
      if (shared.kind !== "ok") {
        return { kind: "back" };
      }
      return { kind: "ok", value: { sharedModel: shared.value } };
    }

    const haiku = await this.promptText("Haiku 模型", {
      description: "例如 claude-3-5-haiku-latest",
      defaultValue: source?.haikuModel ?? "claude-3-5-haiku-latest",
      required: true,
    });
    if (haiku.kind !== "ok") {
      return { kind: "back" };
    }
    const sonnet = await this.promptText("Sonnet 模型", {
      description: "例如 claude-3-7-sonnet-latest",
      defaultValue: source?.sonnetModel ?? "claude-3-7-sonnet-latest",
      required: true,
    });
    if (sonnet.kind !== "ok") {
      return { kind: "back" };
    }
    const opus = await this.promptText("Opus 模型", {
      description: "例如 claude-3-opus-latest",
      defaultValue: source?.opusModel ?? "claude-3-opus-latest",
      required: true,
    });
    if (opus.kind !== "ok") {
      return { kind: "back" };
    }

    return {
      kind: "ok",
      value: {
        haikuModel: haiku.value,
        sonnetModel: sonnet.value,
        opusModel: opus.value,
      },
    };
  }

  private async promptExtraEnv(initial: Record<string, string> | undefined): Promise<PromptResult<Record<string, string> | undefined>> {
    const mode = await this.promptChoice("extraEnv 设置", "额外环境变量处理策略", [
      { label: "保持当前", description: "保留 existing extraEnv", value: "keep", tone: "cyan" },
      { label: "重新录入", description: "逐项输入并覆盖", value: "rewrite", tone: "green" },
      { label: "清空", description: "移除全部 extraEnv", value: "clear", tone: "red" },
    ]);
    if (mode.kind !== "ok") {
      return { kind: "back" };
    }
    if (mode.value === "keep") {
      return { kind: "ok", value: initial };
    }
    if (mode.value === "clear") {
      return { kind: "ok", value: undefined };
    }

    const output: Record<string, string> = {};
    while (true) {
      const key = await this.promptText("Env 键名", {
        description: "留空结束录入",
        required: false,
      });
      if (key.kind !== "ok") {
        return { kind: "back" };
      }
      if (!key.value.trim()) {
        break;
      }
      const value = await this.promptText(`值 (${key.value})`, {
        description: "按 Enter 保存该键值",
        required: true,
      });
      if (value.kind !== "ok") {
        return { kind: "back" };
      }
      output[key.value] = value.value;
    }

    return { kind: "ok", value: Object.keys(output).length ? output : undefined };
  }

  private async pickProfile(title: string): Promise<Profile | undefined> {
    if (this.store.profiles.length === 0) {
      return undefined;
    }
    const selected = await this.promptChoice(
      title,
      "每个选项包含 provider 和 model mode",
      this.store.profiles.map((profile) => ({
        label:
          this.store.activeProfileId === profile.id
            ? `${profile.name} [ACTIVE]`
            : profile.name,
        description: `${profile.providerName} | ${profile.modelMode} | ${profile.id}`,
        value: profile.id,
        tone: this.store.activeProfileId === profile.id ? "green" : "white",
      })),
    );
    if (selected.kind !== "ok") {
      return undefined;
    }
    return this.store.profiles.find((item) => item.id === selected.value);
  }

  private getActiveProfile(): Profile | undefined {
    if (!this.store.activeProfileId) {
      return undefined;
    }
    return this.store.profiles.find((item) => item.id === this.store.activeProfileId);
  }

  private renderFrame(pageTitle: string, subtitle: string): blessed.Widgets.BoxElement {
    for (const child of [...this.screen.children]) {
      child.destroy();
    }

    const active = this.getActiveProfile();

    const root = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      tags: true,
      style: { bg: UI.bg, fg: UI.text },
    });

    const headerBox = blessed.box({
      parent: root,
      top: 0,
      left: 1,
      right: 1,
      height: 8,
      border: "line",
      tags: true,
      label: " {bold} CCM CONTROL CENTER {/bold} ",
      style: {
        bg: UI.bg,
        border: { fg: UI.border },
        fg: UI.text,
      },
      content: "",
    });
    const headerInnerCols = Math.max(40, this.getCols() - 4);
    const showHeaderRight = headerInnerCols >= 92;
    const leftWidth = showHeaderRight ? clamp(Math.floor(headerInnerCols * 0.58), 34, 72) : headerInnerCols - 2;

    const headerLeft = blessed.box({
      parent: headerBox,
      top: 1,
      left: 1,
      width: leftWidth,
      height: 6,
      tags: true,
      style: {
        bg: UI.bg,
        fg: UI.text,
      },
    });
    const artMaxWidth = Math.max(16, leftWidth - 2);
    headerLeft.setContent(
      [
        ...HEADER_ART.map((line) => `{cyan-fg}${truncate(line, artMaxWidth)}{/cyan-fg}`),
        "{bold}CCM Interactive Manager{/bold}",
      ].join("\n"),
    );

    if (showHeaderRight) {
      const rightWidth = Math.max(22, headerInnerCols - leftWidth - 3);
      const headerRight = blessed.box({
        parent: headerBox,
        top: 1,
        right: 1,
        width: rightWidth,
        height: 6,
        tags: true,
        style: {
          bg: UI.bg,
          fg: UI.text,
        },
      });
      headerRight.setContent(
        [
          "{bold}运行概览{/bold}",
          `{gray-fg}生效配置{/gray-fg}: ${active ? `{green-fg}${truncate(active.name, 16)}{/green-fg}` : "{yellow-fg}(none){/yellow-fg}"}`,
          `{gray-fg}服务商{/gray-fg}: ${active ? truncate(active.providerName, 16) : "-"}`,
          `{gray-fg}模式{/gray-fg}: ${active ? active.modelMode : "-"}`,
          `{gray-fg}Profiles{/gray-fg}: {cyan-fg}${this.store.profiles.length}{/cyan-fg}`,
          "{gray-fg}键位{/gray-fg}: ↑/↓ Enter Esc",
        ].join("\n"),
      );
    }

    const content = blessed.box({
      parent: root,
      top: 8,
      left: 1,
      right: 1,
      bottom: 2,
      border: "line",
      tags: true,
      label: ` {bold}${pageTitle}{/bold} `,
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      padding: { left: 1, right: 1 },
      style: {
        bg: UI.bg,
        fg: UI.text,
        border: { fg: UI.border },
      },
    });
    const totalInnerCols = Math.max(40, this.getCols() - 4);
    const showSidebar = totalInnerCols >= 76;
    const sidebarWidth = showSidebar ? clamp(Math.floor(totalInnerCols * 0.28), 24, 32) : 0;
    this.mainPanelCols = showSidebar ? Math.max(30, totalInnerCols - sidebarWidth - 2) : totalInnerCols;

    let mainPanel: blessed.Widgets.BoxElement;
    if (showSidebar) {
      mainPanel = blessed.box({
        parent: content,
        top: 0,
        left: 0,
        right: sidebarWidth + 1,
        bottom: 0,
        tags: true,
        scrollable: true,
        alwaysScroll: true,
        keys: true,
        vi: true,
        padding: { left: 1, right: 1 },
        style: {
          bg: UI.bg,
          fg: UI.text,
        },
      });

      const sidebar = blessed.box({
        parent: content,
        top: 0,
        right: 0,
        width: sidebarWidth,
        bottom: 0,
        border: "line",
        tags: true,
        label: " {bold}当前生效配置{/bold} ",
        padding: { left: 1, right: 1 },
        style: {
          bg: UI.bg,
          fg: UI.text,
          border: { fg: UI.border },
        },
      });

      sidebar.setContent(this.renderActiveSidebarContent(active));
    } else {
      mainPanel = blessed.box({
        parent: content,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        tags: true,
        scrollable: true,
        alwaysScroll: true,
        keys: true,
        vi: true,
        padding: { left: 1, right: 1 },
        style: {
          bg: UI.bg,
          fg: UI.text,
        },
      });
    }
    mainPanel.setContent("");

    blessed.box({
      parent: root,
      bottom: 0,
      left: 1,
      right: 1,
      height: 1,
      tags: true,
      style: {
        bg: UI.bg,
        fg: UI.muted,
      },
      content:
        "{gray-fg}↑/↓ 选择   Enter 确认   Esc/← 返回{/gray-fg}",
    });

    this.screen.render();
    return mainPanel;
  }

  private renderActiveSidebarContent(active: Profile | undefined): string {
    if (!active) {
      return [
        "{gray-fg}名称{/gray-fg}",
        "{yellow-fg}(none){/yellow-fg}",
      ].join("\n");
    }

    return [
      "{gray-fg}名称{/gray-fg}",
      `{cyan-fg}${truncate(active.name, 20)}{/cyan-fg}`,
      "",
      "{gray-fg}服务商{/gray-fg}",
      truncate(active.providerName, 20),
    ].join("\n");
  }

  private async promptChoice<T>(
    title: string,
    description: string,
    choices: SelectChoice<T>[],
  ): Promise<PromptResult<T>> {
    const rows = this.getRows();
    const cols = this.getCols();
    const modalHeight = clamp(Math.floor(rows * 0.66), 14, Math.max(14, rows - 2));
    const modalWidth = clamp(Math.floor(cols * 0.76), 60, Math.max(60, cols - 2));

    const modal = blessed.box({
      parent: this.screen,
      top: "center",
      left: "center",
      width: modalWidth,
      height: modalHeight,
      border: "line",
      tags: true,
      label: ` {bold}${title}{/bold} `,
      style: {
        bg: UI.bg,
        fg: UI.text,
        border: { fg: UI.border },
      },
    });

    blessed.box({
      parent: modal,
      top: 1,
      left: 2,
      right: 2,
      height: 2,
      tags: true,
      style: { bg: UI.bg, fg: UI.muted },
      content: `{gray-fg}${description}{/gray-fg}`,
    });

    const list = blessed.list({
      parent: modal,
      top: 3,
      left: 1,
      right: 1,
      bottom: 2,
      keys: true,
      vi: true,
      mouse: true,
      tags: true,
      style: {
        bg: UI.bg,
        fg: UI.text,
        item: { fg: UI.text },
        selected: { fg: UI.accent, bold: true, underline: true, bg: UI.bg },
      },
      items: choices.map((choice) => formatChoice(choice, modalWidth - 8)),
    });

    blessed.box({
      parent: modal,
      bottom: 0,
      left: 2,
      right: 2,
      height: 1,
      tags: true,
      style: { bg: UI.bg, fg: UI.muted },
      content: "{gray-fg}↑/↓ 选择   Enter 确认   Esc/← 返回{/gray-fg}",
    });

    this.screen.render();
    list.focus();

    return new Promise<PromptResult<T>>((resolve) => {
      const cleanup = () => {
        list.removeAllListeners("select");
        list.unkey("escape", onBack);
        list.unkey("left", onBack);
        modal.destroy();
      };

      const onBack = () => {
        cleanup();
        this.screen.render();
        resolve({ kind: "back" });
      };

      list.key("escape", onBack);
      list.key("left", onBack);

      list.on("select", (_item, index) => {
        const idx = Number(index);
        const safeIndex = Number.isInteger(idx) && idx >= 0 && idx < choices.length ? idx : 0;
        const selected = choices[safeIndex];
        cleanup();
        this.screen.render();
        resolve({ kind: "ok", value: selected.value });
      });
    });
  }

  private async promptText(
    title: string,
    options: {
      description: string;
      defaultValue?: string;
      required: boolean;
      maskInput?: boolean;
    },
  ): Promise<PromptResult<string>> {
    while (true) {
      const one = await this.promptTextOnce(title, options);
      if (one.kind !== "ok") {
        return one;
      }

      const value = one.value.trim();
      if (options.required && !value) {
        await this.showNotice("输入无效", ["该字段不能为空。"], "warning");
        continue;
      }
      return { kind: "ok", value };
    }
  }

  private async promptTextOnce(
    title: string,
    options: {
      description: string;
      defaultValue?: string;
      required: boolean;
      maskInput?: boolean;
    },
  ): Promise<PromptResult<string>> {
    const cols = this.getCols();
    const modalWidth = clamp(Math.floor(cols * 0.7), 56, Math.max(56, cols - 2));
    const modal = blessed.box({
      parent: this.screen,
      top: "center",
      left: "center",
      width: modalWidth,
      height: 10,
      border: "line",
      tags: true,
      label: ` {bold}${title}{/bold} `,
      style: {
        bg: UI.bg,
        fg: UI.text,
        border: { fg: UI.border },
      },
    });

    blessed.box({
      parent: modal,
      top: 1,
      left: 2,
      right: 2,
      height: 2,
      tags: true,
      style: { bg: UI.bg, fg: UI.muted },
      content: `{gray-fg}${options.description}{/gray-fg}`,
    });

    const input = blessed.textbox({
      parent: modal,
      top: 3,
      left: 2,
      right: 2,
      height: 3,
      border: "line",
      inputOnFocus: true,
      keys: true,
      mouse: true,
      censor: options.maskInput ?? false,
      style: {
        bg: UI.bg,
        fg: UI.text,
        border: { fg: UI.border },
        focus: {
          border: { fg: UI.success },
        },
      },
    });
    input.setValue(options.defaultValue ?? "");

    blessed.box({
      parent: modal,
      bottom: 0,
      left: 2,
      right: 2,
      height: 1,
      tags: true,
      style: { bg: UI.bg, fg: UI.muted },
      content: "{gray-fg}Enter 提交   Esc 返回   输入 - 可用于清空字段{/gray-fg}",
    });

    this.screen.render();
    input.focus();

    return new Promise<PromptResult<string>>((resolve) => {
      const cleanup = () => {
        input.removeAllListeners("submit");
        input.unkey("escape", onBack);
        modal.destroy();
      };

      const onBack = () => {
        cleanup();
        this.screen.render();
        resolve({ kind: "back" });
      };
      input.key("escape", onBack);

      input.readInput((_err, value) => {
        cleanup();
        this.screen.render();
        resolve({ kind: "ok", value: String(value ?? "").replace(/\n/g, "") });
      });
    });
  }

  private async showNotice(title: string, lines: string[], status: "success" | "warning" | "error"): Promise<void> {
    const color =
      status === "success" ? UI.success : status === "warning" ? UI.warning : UI.error;
    const cols = this.getCols();
    const modalWidth = clamp(Math.floor(cols * 0.64), 52, Math.max(52, cols - 2));
    const modal = blessed.box({
      parent: this.screen,
      top: "center",
      left: "center",
      width: modalWidth,
      height: Math.max(8, lines.length + 6),
      border: "line",
      tags: true,
      label: ` {bold}${title}{/bold} `,
      style: {
        bg: UI.bg,
        fg: UI.text,
        border: { fg: color },
      },
    });

    const icon = status === "success" ? "✔" : status === "warning" ? "⚠" : "✖";
    blessed.box({
      parent: modal,
      top: 1,
      left: 2,
      right: 2,
      bottom: 2,
      tags: true,
      style: { bg: UI.bg, fg: UI.text },
      content: [`{bold}${icon}{/bold}`, "", ...lines].join("\n"),
    });

    blessed.box({
      parent: modal,
      bottom: 0,
      left: 2,
      right: 2,
      height: 1,
      tags: true,
      style: { bg: UI.bg, fg: UI.muted },
      content: "{gray-fg}Enter / Esc 关闭{/gray-fg}",
    });

    this.screen.render();
    await this.waitForDismiss(["enter", "escape", "left", "space"]);
    modal.destroy();
    this.screen.render();
  }

  private async waitForDismiss(keys: string[] = ["escape", "left", "enter"]): Promise<void> {
    return new Promise<void>((resolve) => {
      const onClose = () => {
        keys.forEach((key) => this.screen.unkey(key, onClose));
        resolve();
      };
      keys.forEach((key) => this.screen.key(key, onClose));
    });
  }

  private getRows(): number {
    const program = (this.screen as unknown as { program?: { rows?: number; height?: number } }).program;
    const rows = Number(program?.rows ?? program?.height ?? process.stdout.rows ?? 40);
    return Number.isFinite(rows) && rows > 0 ? rows : 40;
  }

  private getCols(): number {
    const program = (this.screen as unknown as { program?: { cols?: number; width?: number } }).program;
    const cols = Number(program?.cols ?? program?.width ?? process.stdout.columns ?? 120);
    return Number.isFinite(cols) && cols > 0 ? cols : 120;
  }
}

function formatChoice<T>(choice: SelectChoice<T>, maxWidth = 88): string {
  const tone = choice.tone ?? "white";
  const safeWidth = Math.max(26, maxWidth);
  const maxLabel = Math.max(8, Math.min(20, Math.floor(safeWidth * 0.33)));
  const labelText = truncate(choice.label, maxLabel);
  const descWidth = Math.max(10, safeWidth - maxLabel - 5);
  const description = truncate(choice.description, descWidth);
  const label = toneTag(labelText, tone);
  return `› ${label} {gray-fg}- ${description}{/gray-fg}`;
}

function toneTag(text: string, tone: Tone): string {
  if (tone === "green") {
    return `{green-fg}${text}{/green-fg}`;
  }
  if (tone === "yellow") {
    return `{yellow-fg}${text}{/yellow-fg}`;
  }
  if (tone === "red") {
    return `{red-fg}${text}{/red-fg}`;
  }
  if (tone === "cyan") {
    return `{cyan-fg}${text}{/cyan-fg}`;
  }
  return `{white-fg}${text}{/white-fg}`;
}

function withCurrent(mode: ModelMode, current: ModelMode): string {
  return mode === current ? `${mode} [当前]` : mode;
}

function emptyToUndefined(value: string): string | undefined {
  return value.trim() ? value.trim() : undefined;
}

function normalizeEditableValue(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-") {
    return undefined;
  }
  return trimmed;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  if (maxLength <= 3) {
    return text.slice(0, maxLength);
  }
  return `${text.slice(0, maxLength - 3)}...`;
}

function padRight(text: string, width: number): string {
  if (text.length >= width) {
    return text;
  }
  return text + " ".repeat(width - text.length);
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}
