import type { Profile } from "../types";

export function buildEnvFromProfile(profile: Profile): Record<string, string> {
  const env: Record<string, string> = {};

  if (profile.apiKey) {
    env.ANTHROPIC_AUTH_TOKEN = profile.apiKey;
  }
  if (profile.baseUrl) {
    env.ANTHROPIC_BASE_URL = profile.baseUrl;
  }

  if (profile.modelMode === "sonnet_only") {
    if (profile.sonnetModel) {
      env.ANTHROPIC_DEFAULT_SONNET_MODEL = profile.sonnetModel;
    }
  } else if (profile.modelMode === "all_same") {
    if (profile.sharedModel) {
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL = profile.sharedModel;
      env.ANTHROPIC_DEFAULT_SONNET_MODEL = profile.sharedModel;
      env.ANTHROPIC_DEFAULT_OPUS_MODEL = profile.sharedModel;
    }
  } else if (profile.modelMode === "split_three") {
    if (profile.haikuModel) {
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL = profile.haikuModel;
    }
    if (profile.sonnetModel) {
      env.ANTHROPIC_DEFAULT_SONNET_MODEL = profile.sonnetModel;
    }
    if (profile.opusModel) {
      env.ANTHROPIC_DEFAULT_OPUS_MODEL = profile.opusModel;
    }
  }

  if (profile.extraEnv) {
    for (const [key, value] of Object.entries(profile.extraEnv)) {
      env[key] = value;
    }
  }

  return env;
}

