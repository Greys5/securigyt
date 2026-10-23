import { getConfig, isConfigured } from "@/lib/config";
import { readCache } from "@/lib/cache";
import type { ActionsInventory } from "@/lib/github/collectors/actionsInventory";
import { getOctokit } from "@/lib/github/client";
import { resolveActionRelease } from "@/lib/github/actionRelease";

export async function GET(request: Request) {
  if (!isConfigured()) return Response.json({ error: "Configure GitHub credentials first." }, { status: 503 });
  const action = new URL(request.url).searchParams.get("action");
  const inventory = readCache<ActionsInventory>("repo-workflows", getConfig().org);
  const entry = inventory?.value.actions.find((a) => a.name === action);
  if (!entry || !["action", "reusable-workflow"].includes(entry.kind)) return Response.json({ error: "Select a GitHub action in the scanned inventory." }, { status: 400 });
  try {
    const result = await resolveActionRelease(entry.name, async (path) => {
      try {
        const response = await getOctokit().request(`GET ${path}`);
        return response.data;
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status !== 403 && status !== 404) throw error;
        // Public action repositories can be outside the App installation.
        const response = await fetch(`https://api.github.com${path}`, { cache: "no-store", headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw Object.assign(new Error("GitHub lookup failed."), { status: response.status });
        return response.json();
      }
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = (error as { status?: number }).status;
    const message = status === 404 ? "No stable release found, or repository access is unavailable." : status === 403 || status === 429 ? "GitHub access or rate limit prevented the lookup. Retry later." : "Could not resolve the latest stable release and commit SHA.";
    return Response.json({ error: message }, { status: 502 });
  }
}
