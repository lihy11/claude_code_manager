import { SETTINGS_FILE_PATH } from "../constants";
import type { ClaudeSettings, Profile } from "../types";
import { readJsonFile, writeJsonAtomic } from "../utils/fs";
import { buildEnvFromProfile } from "./env-builder";

export async function syncProfileToClaudeSettings(profile: Profile): Promise<void> {
  const existing = (await readJsonFile<ClaudeSettings>(SETTINGS_FILE_PATH)) ?? {};

  const next: ClaudeSettings = {
    ...existing,
    env: buildEnvFromProfile(profile),
  };

  await writeJsonAtomic(SETTINGS_FILE_PATH, next);
}

