export function nowIsoString(): string {
  return new Date().toISOString();
}

export function createProfileId(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 8);
  return `profile_${ts}_${rnd}`;
}

export function maskSecret(secret?: string): string {
  if (!secret) {
    return "(empty)";
  }
  if (secret.length <= 6) {
    return `${secret.slice(0, 1)}***${secret.slice(-1)}`;
  }
  return `${secret.slice(0, 3)}***${secret.slice(-3)}`;
}

