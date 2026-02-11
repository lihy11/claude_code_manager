import { SETTINGS_FILE_PATH } from "../constants";
import type { ModelMode, Profile } from "../types";
import { readJsonFile } from "../utils/fs";
import { createProfileId, nowIsoString } from "../utils/profile";

interface SettingsLike {
  env?: Record<string, unknown>;
}

export async function importProfileFromCurrentSettings(name: string): Promise<Profile | null> {
  const settings = await readJsonFile<SettingsLike>(SETTINGS_FILE_PATH);
  if (!settings?.env || typeof settings.env !== "object") {
    return null;
  }

  const env = settings.env;
  const mode = inferModelMode(env);
  const now = nowIsoString();

  const profile: Profile = {
    id: createProfileId(),
    name,
    providerName: "imported",
    baseUrl: readString(env.ANTHROPIC_BASE_URL),
    apiKey: readString(env.ANTHROPIC_AUTH_TOKEN),
    modelMode: mode,
    sharedModel: undefined,
    sonnetModel: undefined,
    haikuModel: undefined,
    opusModel: undefined,
    extraEnv: pickExtraEnv(env),
    createdAt: now,
    updatedAt: now,
  };

  if (mode === "sonnet_only") {
    profile.sonnetModel = readString(env.ANTHROPIC_DEFAULT_SONNET_MODEL);
  } else if (mode === "all_same") {
    profile.sharedModel = readString(env.ANTHROPIC_DEFAULT_SONNET_MODEL);
  } else if (mode === "split_three") {
    profile.haikuModel = readString(env.ANTHROPIC_DEFAULT_HAIKU_MODEL);
    profile.sonnetModel = readString(env.ANTHROPIC_DEFAULT_SONNET_MODEL);
    profile.opusModel = readString(env.ANTHROPIC_DEFAULT_OPUS_MODEL);
  }

  return profile;
}

function inferModelMode(env: Record<string, unknown>): ModelMode {
  const haiku = readString(env.ANTHROPIC_DEFAULT_HAIKU_MODEL);
  const sonnet = readString(env.ANTHROPIC_DEFAULT_SONNET_MODEL);
  const opus = readString(env.ANTHROPIC_DEFAULT_OPUS_MODEL);

  if (!haiku && !sonnet && !opus) {
    return "none";
  }
  if (!haiku && sonnet && !opus) {
    return "sonnet_only";
  }
  if (haiku && sonnet && opus && haiku === sonnet && sonnet === opus) {
    return "all_same";
  }
  return "split_three";
}

function pickExtraEnv(env: Record<string, unknown>): Record<string, string> | undefined {
  const reserved = new Set([
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
  ]);

  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (reserved.has(key)) {
      continue;
    }
    if (typeof value === "string") {
      output[key] = value;
    } else if (typeof value === "number" || typeof value === "boolean") {
      output[key] = String(value);
    }
  }
  if (Object.keys(output).length === 0) {
    return undefined;
  }
  return output;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

