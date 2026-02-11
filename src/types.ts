export type ModelMode = "none" | "sonnet_only" | "all_same" | "split_three";

export interface Profile {
  id: string;
  name: string;
  providerName: string;
  baseUrl?: string;
  apiKey?: string;
  modelMode: ModelMode;
  sharedModel?: string;
  sonnetModel?: string;
  haikuModel?: string;
  opusModel?: string;
  extraEnv?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface ProfilesFile {
  version: 1;
  activeProfileId: string | null;
  profiles: Profile[];
}

export interface ClaudeSettings {
  env?: Record<string, string>;
  [key: string]: unknown;
}

