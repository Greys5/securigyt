import { ArrowClockwise, Info } from "@phosphor-icons/react/dist/ssr";
import { DashboardOverview, type OverviewFinding } from "@/components/DashboardOverview";
import { RefreshButton } from "@/components/RefreshButton";
import { SetupNotice } from "@/components/SetupNotice";
import { getActionsInventory, getBackendConfig, getOrgOverview, getPosture, getRepoInventory } from "@/lib/backendClient";
import type { CheckId } from "@/lib/score";
import { formatAge } from "@/components/ui";

export const dynamic = "force-dynamic";

const REMEDIATION: Record<CheckId, { recommendation: string; action: string }> = {
  "branch-protected": { recommendation: "Protect the default branch with a reviewed organization ruleset.", action: "Protect branch" },
  "force-push-blocked": { recommendation: "Block non-fast-forward updates to preserve branch history.", action: "Block force push" },
  "deletion-blocked": { recommendation: "Prevent deletion of the default branch in the active ruleset.", action: "Block deletion" },
  "review-required": { recommendation: "Require at least one approving review before changes can merge.", action: "Require review" },
  "code-owner-review": { recommendation: "Require approval from matching CODEOWNERS before merge.", action: "Require owners" },
  "codeowners-present": { recommendation: "Add a CODEOWNERS file through a reviewable pull request.", action: "Add CODEOWNERS" },
  "codeowners-valid": { recommendation: "Correct invalid ownership patterns and unresolved teams.", action: "Fix CODEOWNERS" },
  "dependabot-alerts": { recommendation: "Enable Dependabot alerts to detect vulnerable dependencies.", action: "Enable alerts" },
  "security-policy": { recommendation: "Publish SECURITY.md so reports follow a defined process.", action: "Create policy PR" },
  "actions-pinned": { recommendation: "Pin third-party Actions to full commit SHAs through a pull request.", action: "Pin actions" },
  "secret-scanning": { recommendation: "Enable secret scanning for committed credentials.", action: "Enable scanning" },
  "push-protection": { recommendation: "Enable push protection to block secrets before commit.", action: "Enable protection" },
  "no-admin-collaborators": { recommendation: "Replace direct admin access with team-managed permissions.", action: "Review access" },
  "no-severe-alerts": { recommendation: "Triage critical and high alerts before lower-severity findings.", action: "Review alerts" },
};

function severityFor(id: CheckId, affected: number, measured: number): OverviewFinding["severity"] {
  const ratio = affected / Math.max(1, measured);
  if (["dependabot-alerts", "security-policy", "no-severe-alerts"].includes(id) && ratio >= 0.5) return "critical";
  if (ratio >= 0.5) return "high";
  if (ratio >= 0.1) return "medium";
  return "info";
}

export default async function Home() {
  const settings = await getBackendConfig();
  if (!settings.configured) return <SetupNotice message="SecuriGit needs credentials to read your organization." />;
  const { org } = settings;
  const [posture, actions, orgOverview, inventory] = await Promise.all([
    getPosture(),
    getActionsInventory(),
    getOrgOverview(),
    getRepoInventory(),
  ]);

  const activeCount = posture.scored.length;
  const pinned = actions.value.totalRefs - actions.value.unpinnedRefs;
  const findings: OverviewFinding[] = posture.checkRollup
    .filter((check) => check.failed > 0)
    .slice(0, 8)
    .map((check) => {
      const remediation = REMEDIATION[check.id];
      const repositories = posture.scored
        .filter(({ score }) => score.checks.some((candidate) => candidate.id === check.id && candidate.status === "fail"))
        .slice(0, 8)
        .map(({ repo }) => repo.name);
      return {
        id: check.id,
        control: check.label,
        detail: posture.scored.flatMap(({ score }) => score.checks).find((candidate) => candidate.id === check.id)?.detail ?? "Security control",
        severity: severityFor(check.id, check.failed, check.failed + check.passed),
        affected: check.failed,
        measured: check.failed + check.passed,
        recommendation: remediation.recommendation,
        action: remediation.action,
        repositories,
      };
    });

  const unavailable = [
    ["Organization rulesets", orgOverview.value.rulesets],
    ["Audit log", posture.security.auditLog],
    ["Billing", posture.security.billing],
  ].filter(([, section]) => !(section as { available: boolean }).available);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow)]">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-4 py-4 sm:px-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">Operations Ledger</h1>
            <span className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">{org}</span>
          </div>
          <p className="mt-1 text-xs text-muted">Organization posture and prioritized security findings · updated {formatAge(posture.fetchedAt)}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1.5 text-[11px] text-muted sm:flex"><ArrowClockwise size={14} aria-hidden /> {activeCount} repositories measured</div>
          <RefreshButton scopes={["org-repos", "repo-workflows", "org-alerts", "org-meta"]} label="Rescan organization" />
        </div>
      </header>

      <DashboardOverview
        data={{
          averagePercent: posture.averagePercent,
          repoCount: inventory.value.totalCount,
          activeCount,
          protectedCount: posture.scored.filter(({ repo }) => repo.defaultBranchProtected).length,
          pinned,
          actionRefs: actions.value.totalRefs,
          codeowners: posture.scored.filter(({ repo }) => repo.hasCodeowners).length,
          distribution: posture.distribution,
          findings,
        }}
      />

      {unavailable.length > 0 && (
        <footer className="flex flex-wrap items-center gap-2 border-t border-border bg-surface-2 px-4 py-2.5 text-[10px] text-muted">
          <Info size={13} aria-hidden />
          Not measurable with current credentials:
          {unavailable.map(([label]) => <span key={label as string} className="font-medium text-foreground">{label as string}</span>)}
        </footer>
      )}
    </div>
  );
}
