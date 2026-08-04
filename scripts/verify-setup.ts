/**
 * Setup doctor.
 *
 * Probes every GitHub endpoint the dashboard depends on and reports which
 * sections will work. Run with: npm run verify
 */

import { getConfig, ConfigError } from "@/lib/config";
import { getOctokit, getFallbackOctokit, authMode } from "@/lib/github/client";

type Status = "ok" | "fail" | "skip";

type Check = {
  section: string;
  what: string;
  status: Status;
  detail: string;
};

const results: Check[] = [];

async function probe(section: string, what: string, fn: () => Promise<string>) {
  try {
    results.push({ section, what, status: "ok", detail: await fn() });
  } catch (error) {
    const e = error as { status?: number; message?: string };
    const status = e.status ? `HTTP ${e.status}` : "error";
    results.push({
      section,
      what,
      status: "fail",
      detail: `${status}: ${e.message ?? String(error)}`,
    });
  }
}

function skip(section: string, what: string, detail: string) {
  results.push({ section, what, status: "skip", detail });
}

async function main() {
  let config;
  try {
    config = getConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`\n✗ ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }

  const org = config.org;
  const mode = authMode();
  console.log(`\nSecuriGit setup check — org: ${org} — auth: ${mode}\n`);

  const octokit = getOctokit();

  // Authentication itself.
  if (mode === "app") {
    await probe("Auth", "App installation token", async () => {
      const { data } = await octokit.rest.apps.getAuthenticated();
      return `authenticated as app "${data?.name ?? "unknown"}"`;
    });
  } else {
    await probe("Auth", "Personal access token", async () => {
      const { data } = await octokit.rest.users.getAuthenticated();
      return `authenticated as ${data.login} (a GitHub App gives higher rate limits)`;
    });
  }

  await probe("Auth", "Rate limit", async () => {
    const { data } = await octokit.rest.rateLimit.get();
    const core = data.resources.core;
    return `core ${core.remaining}/${core.limit} remaining`;
  });

  // Repo inventory.
  let sampleRepo: string | null = null;
  await probe("Repos", "List org repositories", async () => {
    const { data } = await octokit.rest.repos.listForOrg({ org, per_page: 100 });
    sampleRepo = data.find((r) => !r.archived)?.name ?? data[0]?.name ?? null;
    return `${data.length}${data.length === 100 ? "+" : ""} repos visible (sample: ${sampleRepo ?? "none"})`;
  });

  await probe("Repos", "GraphQL batch query", async () => {
    const res = await octokit.graphql<{ organization: { repositories: { totalCount: number } } }>(
      `query($org: String!) {
         organization(login: $org) { repositories(first: 1, ownerAffiliations: OWNER) { totalCount } }
       }`,
      { org },
    );
    return `${res.organization.repositories.totalCount} repos reachable via GraphQL`;
  });

  // Per-repo detail.
  if (sampleRepo) {
    const repo = sampleRepo;

    await probe("Repo detail", "Contents (.github, workflows, CODEOWNERS)", async () => {
      await octokit.rest.repos.getContent({ owner: org, repo, path: "" });
      return `readable on ${repo}`;
    });

    await probe("Repo detail", "Branch protection / administration", async () => {
      const { data } = await octokit.rest.repos.get({ owner: org, repo });
      return `repo administration readable (default branch: ${data.default_branch})`;
    });

    await probe("Repo detail", "Repository rulesets", async () => {
      const { data } = await octokit.request("GET /repos/{owner}/{repo}/rulesets", {
        owner: org,
        repo,
      });
      return `${data.length} ruleset(s) on ${repo}`;
    });

    await probe("Repo detail", "Collaborators", async () => {
      const { data } = await octokit.rest.repos.listCollaborators({
        owner: org,
        repo,
        affiliation: "all",
        per_page: 1,
      });
      return `collaborator list readable (${data.length >= 1 ? "has members" : "empty"})`;
    });
  } else {
    skip("Repo detail", "Per-repo probes", "no repository available to sample");
  }

  // Org configuration.
  await probe("Org", "Organization settings", async () => {
    const { data } = await octokit.rest.orgs.get({ org });
    return `plan: ${data.plan?.name ?? "unknown"}; 2FA required: ${data.two_factor_requirement_enabled ?? "unknown"}`;
  });

  await probe("Org", "Organization rulesets", async () => {
    const { data } = await octokit.request("GET /orgs/{org}/rulesets", { org });
    return `${data.length} org ruleset(s)`;
  });

  await probe("Org", "Installed GitHub Apps", async () => {
    const { data } = await octokit.request("GET /orgs/{org}/installations", { org });
    return `${data.total_count} app installation(s)`;
  });

  await probe("Org", "Fine-grained PATs", async () => {
    const { data } = await octokit.request("GET /orgs/{org}/personal-access-tokens", {
      org,
      per_page: 1,
    });
    return `token list readable (${data.length} on first page)`;
  });

  await probe("Org", "Webhooks", async () => {
    const { data } = await octokit.rest.orgs.listWebhooks({ org, per_page: 100 });
    return `${data.length} org webhook(s)`;
  });

  await probe("Org", "Members", async () => {
    const { data } = await octokit.rest.orgs.listMembers({ org, per_page: 1 });
    return `member list readable (${data.length} on first page)`;
  });

  // Security alerts.
  await probe("Security", "Dependabot alerts (org-wide)", async () => {
    const { data } = await octokit.request("GET /orgs/{org}/dependabot/alerts", {
      org,
      state: "open",
      per_page: 1,
    });
    return `readable (${data.length} on first page)`;
  });

  await probe("Security", "Secret scanning alerts (org-wide)", async () => {
    const { data } = await octokit.request("GET /orgs/{org}/secret-scanning/alerts", {
      org,
      state: "open",
      per_page: 1,
    });
    return `readable (${data.length} on first page)`;
  });

  await probe("Security", "Code scanning alerts (org-wide)", async () => {
    const { data } = await octokit.request("GET /orgs/{org}/code-scanning/alerts", {
      org,
      state: "open",
      per_page: 1,
    });
    return `readable (${data.length} on first page)`;
  });

  // Endpoints that usually need the fallback PAT.
  const fallback = getFallbackOctokit();
  const auditClient = fallback ?? octokit;
  const auditVia = fallback ? "fallback PAT" : "app token";

  await probe("Security", `Audit log (via ${auditVia}, Enterprise Cloud only)`, async () => {
    const { data } = await auditClient.request("GET /orgs/{org}/audit-log", {
      org,
      per_page: 1,
    });
    return `readable (${(data as unknown[]).length} entries on first page)`;
  });

  if (fallback) {
    await probe("Costs", "Actions billing (via fallback PAT)", async () => {
      const { data } = await fallback.request("GET /orgs/{org}/settings/billing/actions", { org });
      return `${data.total_minutes_used} minutes used this cycle`;
    });
  } else {
    skip("Costs", "Billing", "GITHUB_FALLBACK_PAT not set — billing section will be hidden");
  }

  // Report.
  const icon: Record<Status, string> = { ok: "✓", fail: "✗", skip: "–" };
  let section = "";
  for (const r of results) {
    if (r.section !== section) {
      section = r.section;
      console.log(`\n${section}`);
    }
    console.log(`  ${icon[r.status]} ${r.what}\n      ${r.detail}`);
  }

  const failed = results.filter((r) => r.status === "fail").length;
  const skipped = results.filter((r) => r.status === "skip").length;
  console.log(
    `\n${results.length - failed - skipped} ok, ${failed} failed, ${skipped} skipped.\n` +
      (failed > 0
        ? "Failed checks mean those dashboard sections will render as unavailable.\n"
        : "All probed sections are available.\n"),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
