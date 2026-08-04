/** Invalidates cached scopes so the next render refetches from GitHub. */

import { NextResponse } from "next/server";
import { invalidate, type CacheScope } from "@/lib/cache";
import { revalidatePath } from "next/cache";

const VALID_SCOPES: CacheScope[] = [
  "org-meta",
  "org-repos",
  "org-rulesets",
  "org-apps",
  "org-pats",
  "org-hooks",
  "org-members",
  "org-alerts",
  "org-billing",
  "org-audit",
  "repo-detail",
  "repo-workflows",
  "repo-collaborators",
  "repo-rulesets",
  "repo-codeowners",
  "repo-security",
];

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    scopes?: string[];
    key?: string;
    path?: string;
  };

  const scopes = (body.scopes ?? []).filter((s): s is CacheScope =>
    VALID_SCOPES.includes(s as CacheScope),
  );

  let cleared = 0;
  if (scopes.length === 0) {
    cleared = invalidate();
  } else {
    for (const scope of scopes) cleared += invalidate(scope, body.key);
  }

  if (body.path) revalidatePath(body.path);

  return NextResponse.json({ cleared, scopes: scopes.length ? scopes : "all" });
}
