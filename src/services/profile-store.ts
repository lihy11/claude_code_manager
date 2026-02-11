import { PROFILES_FILE_PATH } from "../constants";
import type { Profile, ProfilesFile } from "../types";
import { readJsonFile, writeJsonAtomic } from "../utils/fs";
import { nowIsoString } from "../utils/profile";

const EMPTY_STORE: ProfilesFile = {
  version: 1,
  activeProfileId: null,
  profiles: [],
};

export interface LoadProfilesResult {
  store: ProfilesFile;
  created: boolean;
}

export async function loadProfilesStore(): Promise<LoadProfilesResult> {
  const parsed = await readJsonFile<ProfilesFile>(PROFILES_FILE_PATH);

  if (!parsed) {
    await writeJsonAtomic(PROFILES_FILE_PATH, EMPTY_STORE);
    return { store: structuredClone(EMPTY_STORE), created: true };
  }

  const store = normalizeStore(parsed);
  await writeJsonAtomic(PROFILES_FILE_PATH, store);
  return { store, created: false };
}

export async function saveProfilesStore(store: ProfilesFile): Promise<void> {
  await writeJsonAtomic(PROFILES_FILE_PATH, normalizeStore(store));
}

function normalizeStore(input: ProfilesFile): ProfilesFile {
  const profiles = Array.isArray(input?.profiles)
    ? input.profiles.map(normalizeProfile).filter((profile): profile is Profile => profile !== null)
    : [];

  const activeProfileId =
    typeof input?.activeProfileId === "string" && profiles.some((p) => p.id === input.activeProfileId)
      ? input.activeProfileId
      : null;

  return {
    version: 1,
    activeProfileId,
    profiles,
  };
}

function normalizeProfile(input: unknown): Profile | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const source = input as Partial<Profile>;
  if (!source.id || !source.name) {
    return null;
  }

  const mode = normalizeMode(source.modelMode);
  const now = nowIsoString();
  const extraEnv = normalizeExtraEnv(source.extraEnv);

  return {
    id: String(source.id),
    name: String(source.name),
    providerName: source.providerName ? String(source.providerName) : "custom",
    baseUrl: nonEmptyString(source.baseUrl),
    apiKey: nonEmptyString(source.apiKey),
    modelMode: mode,
    sharedModel: nonEmptyString(source.sharedModel),
    sonnetModel: nonEmptyString(source.sonnetModel),
    haikuModel: nonEmptyString(source.haikuModel),
    opusModel: nonEmptyString(source.opusModel),
    extraEnv,
    createdAt: source.createdAt ? String(source.createdAt) : now,
    updatedAt: source.updatedAt ? String(source.updatedAt) : now,
  };
}

function normalizeMode(mode: unknown): Profile["modelMode"] {
  if (mode === "none" || mode === "sonnet_only" || mode === "all_same" || mode === "split_three") {
    return mode;
  }
  return "sonnet_only";
}

function normalizeExtraEnv(extraEnv: unknown): Record<string, string> | undefined {
  if (!extraEnv || typeof extraEnv !== "object") {
    return undefined;
  }

  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(extraEnv as Record<string, unknown>)) {
    const k = key.trim();
    if (!k) {
      continue;
    }
    output[k] = String(value ?? "");
  }

  if (Object.keys(output).length === 0) {
    return undefined;
  }
  return output;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
