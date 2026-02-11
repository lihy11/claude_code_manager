#!/usr/bin/env node

import { runMenu } from "./ui/menu";

async function main(): Promise<void> {
  await runMenu();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`ccm 启动失败: ${message}\n`);
  process.exitCode = 1;
});
