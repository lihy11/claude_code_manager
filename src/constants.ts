import os from "node:os";
import path from "node:path";

export const CLAUDE_DIR = path.join(os.homedir(), ".claude");
export const PROFILES_FILE_PATH = path.join(CLAUDE_DIR, "cc-profiles.json");
export const SETTINGS_FILE_PATH = path.join(CLAUDE_DIR, "settings.json");

