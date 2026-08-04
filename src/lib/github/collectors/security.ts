/**
 * Organization security signals: alerts, audit log and cost.
 *
 * Alerts use the org-level endpoints (one paginated call per source) rather
 * than N per-repo calls. The audit log and billing usually reject GitHub App
 * installation tokens, so they go through the fallback PAT when one is set.
 */

import { getOctokit, getFallbackOctokit, tryFetch, type Maybe } from "@/lib/github/client";
import { cached, type CachedValue } from "@/lib/cache";
import { getConfig } from "@/lib/config";

/** Hard cap so a very noisy org cannot stall the page; reported, never silent. */
const MAX_ALERTS_PER_SOURCE = 3000;
const AUDIT_LOG_ENTRIES = 100;

export type Severity = "critical" | "high" | "medium" | "low" | "unknown";

export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "unknown"];

export type SeverityCounts = Record<Severity, number>;

export type RepoAlertCounts = {
  repo: string;
  total: number;
  counts: SeverityCounts;
};

export type AlertsSummary = {
  total: number;
  counts: SeverityCounts;
  byRepo: RepoAlertCounts[];
  /** Set when the cap above was hit, so the UI can say the numbers are partial. */
  truncated: boolean;
};

export type SecretAlert = {
  repo: string;
  secretType: string;
  createdAt: string | null;
  pushProtectionBypassed: boolean;
  htmlUrl: string | null;
  validity: string | null;
};

export type SecretScanningSummary = {
  total: number;
  byRepo: RepoAlertCounts[];
  byType: { type: string; count: number }[];
  bypassedCount: number;
  alerts: SecretAlert[];
  truncated: boolean;
};

export type AuditEntry = {
  action: string;
  actor: string | null;
  repo: string | null;
  createdAt: string | null;
};

export type BillingUsage = {
  actionsMinutesUsed: number | null;
  actionsPaidMinutesUsed: number | null;
  actionsIncludedMinutes: number | null;
  packagesBytes: number | null;
  storageDaysUsed: number | null;
  storageEstimatedPaid: number | null;
};

export type SecurityOverview = {
  dependabot: Maybe<AlertsSummary>;
  codeScanning: Maybe<AlertsSummary>;
  secretScanning: Maybe<SecretScanningSummary>;
  auditLog: Maybe<AuditEntry[]>;
  billing: Maybe<BillingUsage>;
};

function emptyCounts(): SeverityCounts {
  return { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 };
}

function normalizeSeverity(value: unknown): Severity {
  const s = typeof value === "string" ? value.toLowerCase() : "";
  if (s === "critical" || s === "high" || s === "medium" || s === "low") return s;
  // Code scanning uses `warning`/`note`/`error` when no security severity is set.
  if (s === "error") return "high";
  if (s === "warning") return "medium";
  if (s === "note") return "low";
  return "unknown";
}

function summarize(rows: { repo: string; severity: Severity }[], truncated: boolean): AlertsSummary {
  const counts = emptyCounts();
  const perRepo = new Map<string, RepoAlertCounts>();

  for (const row of rows) {
    counts[row.severity] += 1;
    let entry = perRepo.get(row.repo);
    if (!entry) {
      entry = { repo: row.repo, total: 0, counts: emptyCounts() };
      perRepo.set(row.repo, entry);
    }
    entry.total += 1;
    entry.counts[row.severity] += 1;
  }

  const byRepo = [...perRepo.values()].sort(
    (a, b) =>
      b.counts.critical - a.counts.critical ||
      b.counts.high - a.counts.high ||
      b.total - a.total ||
      a.repo.localeCompare(b.repo),
  );

  return { total: rows.length, counts, byRepo, truncated };
}

type RawAlert = {
  repository?: { name?: string };
  security_advisory?: { severity?: string };
  security_vulnerability?: { severity?: string };
  rule?: { security_severity_level?: string | null; severity?: string | null };
};

async function fetchSecurityOverview(): Promise<SecurityOverview> {
  const { org } = getConfig();
  const octokit = getOctokit();
  const fallback = getFallbackOctokit();

  /** Paginate an org alert endpoint up to the cap. */
  async function collect(route: string): Promise<{ rows: RawAlert[]; truncated: boolean }> {
    const rows: RawAlert[] = [];
    let truncated = false;

    for await (const response of octokit.paginate.iterator(route, {
      org,
      state: "open",
      per_page: 100,
    })) {
      rows.push(...(response.data as RawAlert[]));
      if (rows.length >= MAX_ALERTS_PER_SOURCE) {
        truncated = true;
        break;
      }
    }

    return { rows: rows.slice(0, MAX_ALERTS_PER_SOURCE), truncated };
  }

  const [dependabot, codeScanning, secretScanning, auditLog, billing] = await Promise.all([
    tryFetch<AlertsSummary>(
      "Dependabot alerts",
      async () => {
        const { rows, truncated } = await collect("GET /orgs/{org}/dependabot/alerts");
        return summarize(
          rows.map((a) => ({
            repo: a.repository?.name ?? "unknown",
            severity: normalizeSeverity(
              a.security_vulnerability?.severity ?? a.security_advisory?.severity,
            ),
          })),
          truncated,
        );
      },
      "Needs the Dependabot alerts permission (read-only) on the GitHub App.",
    ),

    tryFetch<AlertsSummary>(
      "Code scanning alerts",
      async () => {
        const { rows, truncated } = await collect("GET /orgs/{org}/code-scanning/alerts");
        return summarize(
          rows.map((a) => ({
            repo: a.repository?.name ?? "unknown",
            severity: normalizeSeverity(a.rule?.security_severity_level ?? a.rule?.severity),
          })),
          truncated,
        );
      },
      "Needs the Code scanning alerts permission (read-only) on the GitHub App.",
    ),

    tryFetch<SecretScanningSummary>(
      "Secret scanning alerts",
      async () => {
        const rows: {
          repository?: { name?: string };
          secret_type_display_name?: string;
          secret_type?: string;
          created_at?: string;
          push_protection_bypassed?: boolean;
          html_url?: string;
          validity?: string;
        }[] = [];
        let truncated = false;

        for await (const response of octokit.paginate.iterator(
          "GET /orgs/{org}/secret-scanning/alerts",
          { org, state: "open", per_page: 100 },
        )) {
          rows.push(...(response.data as typeof rows));
          if (rows.length >= MAX_ALERTS_PER_SOURCE) {
            truncated = true;
            break;
          }
        }

        const capped = rows.slice(0, MAX_ALERTS_PER_SOURCE);
        const alerts: SecretAlert[] = capped.map((a) => ({
          repo: a.repository?.name ?? "unknown",
          secretType: a.secret_type_display_name ?? a.secret_type ?? "unknown",
          createdAt: a.created_at ?? null,
          pushProtectionBypassed: Boolean(a.push_protection_bypassed),
          htmlUrl: a.html_url ?? null,
          validity: a.validity ?? null,
        }));

        // Every leaked credential is treated as critical for the repo rollup.
        const byRepo = summarize(
          alerts.map((a) => ({ repo: a.repo, severity: "critical" as Severity })),
          truncated,
        ).byRepo;

        const typeCounts = new Map<string, number>();
        for (const a of alerts) typeCounts.set(a.secretType, (typeCounts.get(a.secretType) ?? 0) + 1);

        return {
          total: alerts.length,
          byRepo,
          byType: [...typeCounts.entries()]
            .map(([type, count]) => ({ type, count }))
            .sort((a, b) => b.count - a.count),
          bypassedCount: alerts.filter((a) => a.pushProtectionBypassed).length,
          alerts,
          truncated,
        };
      },
      "Needs the Secret scanning alerts permission (read-only) on the GitHub App.",
    ),

    tryFetch<AuditEntry[]>(
      "Audit log",
      async () => {
        const client = fallback ?? octokit;
        const { data } = await client.request("GET /orgs/{org}/audit-log", {
          org,
          per_page: AUDIT_LOG_ENTRIES,
        });
        return (data as Record<string, unknown>[]).map((e) => ({
          action: String(e.action ?? "unknown"),
          actor: typeof e.actor === "string" ? e.actor : null,
          repo: typeof e.repo === "string" ? e.repo : null,
          createdAt:
            typeof e["@timestamp"] === "number"
              ? new Date(e["@timestamp"]).toISOString()
              : typeof e.created_at === "number"
                ? new Date(e.created_at).toISOString()
                : null,
        }));
      },
      fallback
        ? "The audit log API requires GitHub Enterprise Cloud."
        : "The audit log requires GitHub Enterprise Cloud and usually a classic PAT — set GITHUB_FALLBACK_PAT.",
    ),

    tryFetch<BillingUsage>(
      "Billing",
      async () => {
        const client = fallback ?? octokit;
        const [actions, packages, storage] = await Promise.all([
          client
            .request("GET /orgs/{org}/settings/billing/actions", { org })
            .then((r) => r.data)
            .catch(() => null),
          client
            .request("GET /orgs/{org}/settings/billing/packages", { org })
            .then((r) => r.data)
            .catch(() => null),
          client
            .request("GET /orgs/{org}/settings/billing/shared-storage", { org })
            .then((r) => r.data)
            .catch(() => null),
        ]);

        if (!actions && !packages && !storage) {
          throw Object.assign(new Error("no billing endpoint responded"), { status: 403 });
        }

        return {
          actionsMinutesUsed: actions?.total_minutes_used ?? null,
          actionsPaidMinutesUsed: actions?.total_paid_minutes_used ?? null,
          actionsIncludedMinutes: actions?.included_minutes ?? null,
          packagesBytes: packages?.total_gigabytes_bandwidth_used ?? null,
          storageDaysUsed: storage?.days_left_in_billing_cycle ?? null,
          storageEstimatedPaid: storage?.estimated_paid_storage_for_month ?? null,
        };
      },
      "Billing needs a classic PAT with manage_billing scope — set GITHUB_FALLBACK_PAT.",
    ),
  ]);

  return { dependabot, codeScanning, secretScanning, auditLog, billing };
}

export function getSecurityOverview(
  opts: { force?: boolean } = {},
): Promise<CachedValue<SecurityOverview>> {
  const { org } = getConfig();
  return cached<SecurityOverview>("org-alerts", org, fetchSecurityOverview, opts);
}

/** Per-repo open alert counts, merged across all three sources, for scoring. */
export function alertCountsByRepo(overview: SecurityOverview): Map<string, SeverityCounts> {
  const merged = new Map<string, SeverityCounts>();

  const add = (rows: RepoAlertCounts[]) => {
    for (const row of rows) {
      let entry = merged.get(row.repo);
      if (!entry) {
        entry = emptyCounts();
        merged.set(row.repo, entry);
      }
      for (const severity of SEVERITIES) entry[severity] += row.counts[severity];
    }
  };

  if (overview.dependabot.available) add(overview.dependabot.data.byRepo);
  if (overview.codeScanning.available) add(overview.codeScanning.data.byRepo);
  if (overview.secretScanning.available) add(overview.secretScanning.data.byRepo);

  return merged;
}

/** True when at least one alert source responded — otherwise scoring must stay "unknown". */
export function hasAnyAlertSource(overview: SecurityOverview): boolean {
  return (
    overview.dependabot.available ||
    overview.codeScanning.available ||
    overview.secretScanning.available
  );
}
