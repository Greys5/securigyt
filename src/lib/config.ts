/**
 * Runtime configuration read from the environment.
 *
 * Two credential modes:
 *   - "app"   GitHub App installation (preferred: 15k req/h, org-scoped identity)
 *   - "token" personal access token (quick start, or when no App exists yet)
 *
 * A separate fallback PAT can be supplied for endpoints that reject
 * installation tokens (billing, audit log).
 */

export type AppAuth = {
  mode: "app";
  appId: string;
  privateKey: string;
  installationId: number;
};

export type TokenAuth = {
  mode: "token";
  token: string;
};

export type AppConfig = {
  org: string;
  auth: AppAuth | TokenAuth;
  fallbackPat?: string;
};

export class ConfigError extends Error {}

/** Normalize a PEM private key that may arrive with escaped newlines. */
function normalizePrivateKey(raw: string): string {
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;

  const org = env("GITHUB_ORG");
  if (!org) {
    throw new ConfigError(
      "Missing GITHUB_ORG. Copy .env.local.example to .env.local and fill it in.",
    );
  }

  const appId = env("GITHUB_APP_ID");
  const privateKeyRaw = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationIdRaw = env("GITHUB_APP_INSTALLATION_ID");
  const token = env("GITHUB_TOKEN");
  const fallbackPat = env("GITHUB_FALLBACK_PAT");

  const anyAppVar = appId || privateKeyRaw || installationIdRaw;

  if (anyAppVar) {
    const missing: string[] = [];
    if (!appId) missing.push("GITHUB_APP_ID");
    if (!privateKeyRaw) missing.push("GITHUB_APP_PRIVATE_KEY");
    if (!installationIdRaw) missing.push("GITHUB_APP_INSTALLATION_ID");
    if (missing.length > 0) {
      throw new ConfigError(
        `Incomplete GitHub App configuration — missing: ${missing.join(", ")}.`,
      );
    }

    const installationId = Number(installationIdRaw);
    if (!Number.isInteger(installationId) || installationId <= 0) {
      throw new ConfigError(
        `GITHUB_APP_INSTALLATION_ID must be a positive integer, got "${installationIdRaw}".`,
      );
    }

    cached = {
      org,
      auth: {
        mode: "app",
        appId: appId!,
        privateKey: normalizePrivateKey(privateKeyRaw!),
        installationId,
      },
      fallbackPat,
    };
    return cached;
  }

  if (token) {
    cached = { org, auth: { mode: "token", token }, fallbackPat };
    return cached;
  }

  throw new ConfigError(
    "No credentials found. Set either the GitHub App variables " +
      "(GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID) or GITHUB_TOKEN.",
  );
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

/** Test seam: drop the memoized config so a new environment is picked up. */
export function resetConfigCache(): void {
  cached = null;
}
