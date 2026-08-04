/**
 * Runtime configuration read from the environment.
 *
 * The app authenticates as a GitHub App installation. A fallback classic PAT is
 * optional and used only for endpoints that reject installation tokens
 * (billing, audit log).
 */

export type AppConfig = {
  org: string;
  appId: string;
  privateKey: string;
  installationId: number;
  fallbackPat?: string;
};

export class ConfigError extends Error {}

/** Normalize a PEM private key that may arrive with escaped newlines. */
function normalizePrivateKey(raw: string): string {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;

  const org = process.env.GITHUB_ORG?.trim();
  const appId = process.env.GITHUB_APP_ID?.trim();
  const privateKeyRaw = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationIdRaw = process.env.GITHUB_APP_INSTALLATION_ID?.trim();

  const missing: string[] = [];
  if (!org) missing.push("GITHUB_ORG");
  if (!appId) missing.push("GITHUB_APP_ID");
  if (!privateKeyRaw) missing.push("GITHUB_APP_PRIVATE_KEY");
  if (!installationIdRaw) missing.push("GITHUB_APP_INSTALLATION_ID");

  if (missing.length > 0) {
    throw new ConfigError(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        `Copy .env.local.example to .env.local and fill it in.`,
    );
  }

  const installationId = Number(installationIdRaw);
  if (!Number.isInteger(installationId) || installationId <= 0) {
    throw new ConfigError(
      `GITHUB_APP_INSTALLATION_ID must be a positive integer, got "${installationIdRaw}".`,
    );
  }

  cached = {
    org: org!,
    appId: appId!,
    privateKey: normalizePrivateKey(privateKeyRaw!),
    installationId,
    fallbackPat: process.env.GITHUB_FALLBACK_PAT?.trim() || undefined,
  };
  return cached;
}

/** True when config is present — lets pages render a setup hint instead of crashing. */
export function isConfigured(): boolean {
  try {
    getConfig();
    return true;
  } catch {
    return false;
  }
}
