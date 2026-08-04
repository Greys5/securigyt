/**
 * Octokit clients.
 *
 * `getOctokit()` authenticates as the GitHub App installation (15k req/h).
 * `getFallbackOctokit()` uses the optional classic PAT, needed only for
 * endpoints that reject installation tokens (billing, audit log).
 */

import { Octokit as Core } from "@octokit/core";
import { restEndpointMethods } from "@octokit/plugin-rest-endpoint-methods";
import { paginateRest } from "@octokit/plugin-paginate-rest";
import { createAppAuth } from "@octokit/auth-app";
import { throttling } from "@octokit/plugin-throttling";
import { retry } from "@octokit/plugin-retry";
import { getConfig } from "@/lib/config";

const SecuriGitOctokit = Core.plugin(restEndpointMethods, paginateRest, throttling, retry);

export type GitHubClient = InstanceType<typeof SecuriGitOctokit>;

type ThrottleOptions = { method: string; url: string };

const throttle = {
  onRateLimit(retryAfter: number, options: ThrottleOptions, _o: unknown, retryCount: number) {
    console.warn(`[github] rate limit on ${options.method} ${options.url}; retry in ${retryAfter}s`);
    return retryCount < 2;
  },
  onSecondaryRateLimit(retryAfter: number, options: ThrottleOptions, _o: unknown, retryCount: number) {
    console.warn(`[github] secondary limit on ${options.method} ${options.url}; retry in ${retryAfter}s`);
    return retryCount < 2;
  },
};

let primaryClient: GitHubClient | null = null;

export function getOctokit(): GitHubClient {
  if (primaryClient) return primaryClient;
  const { auth } = getConfig();

  primaryClient =
    auth.mode === "app"
      ? new SecuriGitOctokit({
          authStrategy: createAppAuth,
          auth: {
            appId: auth.appId,
            privateKey: auth.privateKey,
            installationId: auth.installationId,
          },
          throttle,
        })
      : new SecuriGitOctokit({ auth: auth.token, throttle });

  return primaryClient;
}

/** Which credential the primary client is using — surfaced in the setup doctor. */
export function authMode(): "app" | "token" {
  return getConfig().auth.mode;
}

let fallbackClient: GitHubClient | null = null;

/** Null when GITHUB_FALLBACK_PAT is not set. */
export function getFallbackOctokit(): GitHubClient | null {
  const { fallbackPat } = getConfig();
  if (!fallbackPat) return null;
  if (fallbackClient) return fallbackClient;

  fallbackClient = new SecuriGitOctokit({ auth: fallbackPat, throttle });
  return fallbackClient;
}

/** Shape returned when a section cannot be rendered for a permission/plan reason. */
export type Unavailable = {
  available: false;
  reason: string;
  hint?: string;
};

export type Available<T> = { available: true; data: T };
export type Maybe<T> = Available<T> | Unavailable;

type HttpError = { status?: number; message?: string };

function isHttpError(e: unknown): e is HttpError {
  return typeof e === "object" && e !== null && "status" in e;
}

/**
 * Run a GitHub call and turn permission/plan failures into a renderable
 * "unavailable" result instead of an exception.
 */
export async function tryFetch<T>(
  label: string,
  fn: () => Promise<T>,
  hint?: string,
): Promise<Maybe<T>> {
  try {
    return { available: true, data: await fn() };
  } catch (error) {
    if (isHttpError(error)) {
      const status = error.status;
      if (status === 403 || status === 401) {
        return {
          available: false,
          reason: `${label}: access denied (HTTP ${status}). ${error.message ?? ""}`.trim(),
          hint: hint ?? "Check the GitHub App permissions, then reinstall/approve the app.",
        };
      }
      if (status === 404) {
        return {
          available: false,
          reason: `${label}: not found or not enabled for this org/plan (HTTP 404).`,
          hint,
        };
      }
    }
    const message = error instanceof Error ? error.message : String(error);
    return { available: false, reason: `${label}: ${message}`, hint };
  }
}

/** Remaining core REST rate limit — surfaced in the UI footer. */
export async function getRateLimit(octokit: GitHubClient) {
  const { data } = await octokit.rest.rateLimit.get();
  return { core: data.resources.core, graphql: data.resources.graphql };
}
