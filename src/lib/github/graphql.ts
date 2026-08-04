/**
 * GraphQL helpers.
 *
 * GitHub answers partial results with a top-level `errors` array (e.g. a repo
 * the installation cannot read). Octokit throws in that case, but the usable
 * data is attached to the error — `runGraphql` recovers it so one bad repo
 * never blanks a whole batch.
 */

import type { GitHubClient } from "@/lib/github/client";

type GraphqlPartialError = {
  data?: unknown;
  errors?: Array<{ message: string; path?: Array<string | number> }>;
};

function isPartial(error: unknown): error is GraphqlPartialError {
  return typeof error === "object" && error !== null && "data" in error && "errors" in error;
}

export type GraphqlResult<T> = {
  data: T;
  errors: string[];
};

export async function runGraphql<T>(
  octokit: GitHubClient,
  query: string,
  variables: Record<string, unknown>,
): Promise<GraphqlResult<T>> {
  try {
    return { data: await octokit.graphql<T>(query, variables), errors: [] };
  } catch (error) {
    if (isPartial(error) && error.data) {
      return {
        data: error.data as T,
        errors: (error.errors ?? []).map((e) =>
          e.path ? `${e.path.join(".")}: ${e.message}` : e.message,
        ),
      };
    }
    throw error;
  }
}

/** Split a list into fixed-size chunks — used to build aliased batch queries. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * GraphQL aliases must match /^[_A-Za-z][_0-9A-Za-z]*$/, but repo names contain
 * dots and dashes. Index-based aliases sidestep the problem entirely.
 */
export function aliasFor(index: number): string {
  return `r${index}`;
}
