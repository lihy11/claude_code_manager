import pc from "picocolors";

export const theme = {
  title: (text: string) => pc.bold(pc.cyan(text)),
  section: (text: string) => pc.bold(pc.blue(text)),
  success: (text: string) => pc.green(text),
  warning: (text: string) => pc.yellow(text),
  error: (text: string) => pc.red(text),
  muted: (text: string) => pc.dim(text),
  accent: (text: string) => pc.magenta(text),
  active: (text: string) => pc.bold(pc.bgGreen(pc.black(` ${text} `))),
  key: (text: string) => pc.bold(pc.white(text)),
};

export function colorAction(label: string, color: "blue" | "green" | "yellow" | "red" | "cyan"): string {
  if (color === "blue") {
    return pc.blue(label);
  }
  if (color === "green") {
    return pc.green(label);
  }
  if (color === "yellow") {
    return pc.yellow(label);
  }
  if (color === "red") {
    return pc.red(label);
  }
  return pc.cyan(label);
}

export function renderPanel(lines: string[]): string {
  const columns = process.stdout.columns ?? 100;
  const minWidth = 54;
  const maxWidth = 88;
  const innerWidth = Math.max(minWidth, Math.min(maxWidth, columns - 4));
  const top = `+${"-".repeat(innerWidth + 2)}+`;
  const body = lines.map((line) => {
    const visible = stripAnsi(line);
    const truncated = visible.length > innerWidth ? `${visible.slice(0, innerWidth - 3)}...` : visible;
    const pad = " ".repeat(Math.max(0, innerWidth - truncated.length));
    return `| ${line}${pad} |`;
  });
  return [pc.dim(top), ...body, pc.dim(top)].join("\n");
}

function stripAnsi(input: string): string {
  return input.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}
