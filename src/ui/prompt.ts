import Enquirer = require("enquirer");
import pc from "picocolors";

const combos = require("enquirer/lib/combos") as {
  ctrl: Record<string, string>;
  shift: Record<string, string>;
  option: Record<string, string>;
  keys: Record<string, string>;
};

const MENU_BACK_ACTIONS = {
  ...combos,
  keys: {
    ...combos.keys,
    left: "cancel",
  },
};

export interface SelectOption<T> {
  label: string;
  value: T;
  hint?: string;
  role?: "heading";
}

export class PromptBackError extends Error {
  constructor() {
    super("BACK");
    this.name = "PromptBackError";
  }
}

export function createPrompter() {
  async function text(
    label: string,
    options: {
      required?: boolean;
      defaultValue?: string;
      allowClearWithDash?: boolean;
    } = {},
  ): Promise<string> {
    const required = options.required ?? false;
    const defaultValue = options.defaultValue;

    while (true) {
      const raw = (await askInput(pc.bold(pc.cyan(label)), defaultValue)).trim();

      if (options.allowClearWithDash && raw === "-") {
        return "__CLEAR__";
      }

      if (raw) {
        return raw;
      }
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      if (!required) {
        return "";
      }

      process.stdout.write(`${pc.yellow("输入不能为空，请重试。")}\n`);
    }
  }

  async function confirm(label: string, defaultYes = true): Promise<boolean> {
    return askConfirm(pc.bold(pc.cyan(label)), defaultYes);
  }

  async function select<T>(
    label: string,
    options: SelectOption<T>[],
    config: { footer?: string } = {},
  ): Promise<T> {
    if (options.length === 0) {
      throw new Error("No options available for select prompt.");
    }

    const selectedIndex = await askSelect(
      pc.bold(pc.cyan(label)),
      options.map((option, index) => ({
        message: option.label,
        value: index,
        hint: option.hint,
        role: option.role,
      })),
      config.footer,
    );

    const idx = Number(selectedIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) {
      throw new Error("选择项无效");
    }
    return options[idx].value;
  }

  async function pause(message = "按回车继续..."): Promise<void> {
    await askInput(pc.dim(message), "");
  }

  function close() {
    // Enquirer prompts are closed after each interaction.
  }

  return {
    text,
    confirm,
    select,
    pause,
    close,
  };
}

export type Prompter = ReturnType<typeof createPrompter>;

async function askInput(message: string, initial?: string): Promise<string> {
  const result = await askPrompt<{ value: string }>({
    type: "input",
    name: "value",
    message,
    initial,
  });
  return typeof result.value === "string" ? result.value : "";
}

async function askConfirm(message: string, initial: boolean): Promise<boolean> {
  const result = await askPrompt<{ value: boolean }>({
    type: "confirm",
    name: "value",
    message,
    initial,
    actions: MENU_BACK_ACTIONS,
  });
  return Boolean(result.value);
}

async function askSelect(
  message: string,
  choices: Array<{ message: string; value: unknown; hint?: string; role?: "heading" }>,
  footer?: string,
): Promise<unknown> {
  const result = await askPrompt<{ value: unknown }>({
    type: "select",
    name: "value",
    message,
    actions: MENU_BACK_ACTIONS,
    footer,
    choices: choices.map((choice, index) => ({
      name: String(index),
      message: choice.message,
      value: choice.value,
      hint: choice.hint,
      role: choice.role,
    })),
  });
  return result.value;
}

async function askPrompt<T extends { value: unknown }>(question: any): Promise<T> {
  try {
    return (await Enquirer.prompt(question)) as T;
  } catch {
    throw new PromptBackError();
  }
}
