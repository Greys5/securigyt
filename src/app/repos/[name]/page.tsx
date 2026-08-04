import Link from "next/link";
import { notFound } from "next/navigation";
import { getRepoDetail } from "@/lib/github/collectors/repoDetail";
import { isConfigured } from "@/lib/config";
import { SetupNotice } from "@/components/SetupNotice";
import { RefreshButton } from "@/components/RefreshButton";
import {
  Badge,
  Card,
  EmptyState,
  Td,
  Th,
  UnavailableNotice,
  formatAge,
  type Tone,
} from "@/components/ui";
import { computeScore, type Grade } from "@/lib/score";
import { WorkflowList } from "./WorkflowList";
import { RulesetList } from "./RulesetList";

export const dynamic = "force-dynamic";

const SCORE_TONE: Record<Grade, Tone> = { A: "ok", B: "ok", C: "warn", D: "warn", F: "bad" };

function ProtectionSummary({
  protection,
}: {
  protection: NonNullable<
    Awaited<ReturnType<typeof getRepoDetail>>["value"]["summary"]["branchProtection"]
  >;
}) {
  const checks: { label: string; ok: boolean; detail?: string }[] = [
    {
      label: "Force pushes blocked",
      ok: !protection.allowsForcePushes,
    },
    { label: "Deletion blocked", ok: !protection.allowsDeletions },
    {
      label: "Reviews required",
      ok: protection.requiresApprovingReviews,
      detail: protection.requiredApprovingReviewCount
        ? `${protection.requiredApprovingReviewCount} approval(s)`
        : undefined,
    },
    { label: "Code owner review", ok: protection.requiresCodeOwnerReviews },
    { label: "Stale reviews dismissed", ok: protection.dismissesStaleReviews },
    { label: "Status checks required", ok: protection.requiresStatusChecks },
    { label: "Conversations resolved", ok: protection.requiresConversationResolution },
    { label: "Linear history", ok: protection.requiresLinearHistory },
    { label: "Signed commits", ok: protection.requiresCommitSignatures },
    { label: "Enforced for admins", ok: protection.isAdminEnforced },
    { label: "Pushes restricted", ok: protection.restrictsPushes },
  ];

  return (
    <div className="px-4 py-3">
      <div className="mb-2 text-xs text-muted">
        Pattern: <span className="font-mono text-foreground">{protection.pattern}</span>
      </div>
      <ul className="flex flex-wrap gap-1.5">
        {checks.map((c) => (
          <li key={c.label}>
            <Badge tone={c.ok ? "ok" : "muted"}>
              {c.ok ? "✓" : "✗"} {c.label}
              {c.detail && ` · ${c.detail}`}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default async function RepoDetailPage({ params }: PageProps<"/repos/[name]">) {
  if (!isConfigured()) {
    return <SetupNotice message="Repository detail needs GitHub App credentials." />;
  }

  const { name } = await params;
  const repoName = decodeURIComponent(name);

  let detail;
  let fetchedAt: number;
  try {
    const result = await getRepoDetail(repoName);
    detail = result.value;
    fetchedAt = result.fetchedAt;
  } catch (error) {
    if (error instanceof Error && error.message.includes("is not in the")) notFound();
    throw error;
  }

  const { summary, workflows, codeowners, codeownersErrors, collaborators, teams, rulesets, security } =
    detail;

  const allUses = workflows.flatMap((w) => w.uses);
  const unpinned = allUses.filter((u) => !u.pinned && u.kind !== "docker");
  const admins = collaborators.available
    ? collaborators.data.filter((c) => c.admin)
    : [];

  // The detail page knows more than the org scan does, so score with everything.
  const score = computeScore({
    repo: summary,
    actionRefs: { total: allUses.length, unpinned: unpinned.length },
    security: security.available
      ? {
          secretScanning: security.data.secretScanning === "enabled",
          pushProtection: security.data.secretScanningPushProtection === "enabled",
        }
      : undefined,
    adminCollaborators: collaborators.available ? admins.length : undefined,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted">
            <Link href="/repos" className="hover:text-foreground">
              Repositories
            </Link>
            <span>/</span>
          </div>
          <h1 className="mt-1 flex items-center gap-3 text-xl font-semibold tracking-tight">
            {summary.name}
            <a
              href={summary.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-normal text-info hover:underline"
            >
              open on GitHub ↗
            </a>
          </h1>
          <p className="mt-1 text-sm text-muted">
            {summary.description ?? "No description"} · updated {formatAge(fetchedAt)}
          </p>
        </div>
        <RefreshButton scopes={["repo-detail"]} cacheKey={summary.name} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge tone={summary.visibility.toLowerCase() === "public" ? "warn" : "muted"}>
          {summary.visibility.toLowerCase()}
        </Badge>
        {summary.archived && <Badge tone="warn">archived</Badge>}
        <Badge tone="muted">default: {summary.defaultBranch ?? "unknown"}</Badge>
        <Badge tone={summary.defaultBranchProtected ? "ok" : "bad"}>
          {summary.protectionSource === "none"
            ? "unprotected default branch"
            : `protected via ${summary.protectionSource === "ruleset" ? "ruleset" : "branch rule"}`}
        </Badge>
        <Badge tone={summary.hasCodeowners ? "ok" : "bad"}>
          CODEOWNERS {summary.hasCodeowners ? "present" : "missing"}
        </Badge>
        <Badge tone={unpinned.length === 0 ? "ok" : "warn"}>
          {unpinned.length} unpinned action ref(s)
        </Badge>
        {admins.length > 0 && <Badge tone="warn">{admins.length} admin collaborator(s)</Badge>}
      </div>

      <Card
        title="Security score"
        subtitle={`${score.earnedWeight} of ${score.applicableWeight} applicable weight · unknown checks are excluded`}
        actions={
          <Badge tone={SCORE_TONE[score.grade]}>
            {score.grade} · {score.percent}%
          </Badge>
        }
      >
        <ul className="grid gap-1 px-4 py-3 sm:grid-cols-2 lg:grid-cols-3">
          {score.checks.map((c) => (
            <li
              key={c.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs"
            >
              <span>
                <span className="block">{c.label}</span>
                <span className="text-muted">{c.detail}</span>
              </span>
              <Badge
                tone={c.status === "pass" ? "ok" : c.status === "fail" ? "bad" : "muted"}
              >
                {c.status}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="Workflows and actions"
        subtitle={`${workflows.length} workflow file(s) · ${allUses.length} action reference(s) · ${unpinned.length} not SHA-pinned`}
        className="p-0"
      >
        <WorkflowList workflows={workflows} />
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Rulesets" subtitle="Repository and inherited organization rulesets">
          {rulesets.available ? (
            <RulesetList rulesets={rulesets.data} />
          ) : (
            <div className="p-4">
              <UnavailableNotice info={rulesets} />
            </div>
          )}
        </Card>

        <Card
          title="Branch protection rule"
          subtitle={`Classic protection on ${summary.defaultBranch ?? "the default branch"}`}
        >
          {summary.branchProtection ? (
            <ProtectionSummary protection={summary.branchProtection} />
          ) : (
            <EmptyState>
              No classic branch protection rule.
              {summary.protectionSource === "ruleset" &&
                " This repository is protected by rulesets instead."}
            </EmptyState>
          )}
        </Card>

        <Card
          title="CODEOWNERS"
          subtitle={codeowners ? codeowners.path : "No CODEOWNERS file found"}
        >
          {codeowners ? (
            <div className="px-4 py-3">
              <div className="flex flex-wrap gap-1.5">
                <Badge tone="muted">{codeowners.ruleCount} rule(s)</Badge>
                {codeownersErrors.length > 0 ? (
                  <Badge tone="bad">{codeownersErrors.length} validation error(s)</Badge>
                ) : (
                  <Badge tone="ok">valid</Badge>
                )}
                {codeowners.owners.map((o) => (
                  <Badge key={o} tone="info">
                    {o}
                  </Badge>
                ))}
              </div>

              {codeownersErrors.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-bad">
                  {codeownersErrors.map((e, i) => (
                    <li key={i}>
                      line {e.line}: {e.message}
                    </li>
                  ))}
                </ul>
              )}

              <pre className="mt-3 max-h-64 overflow-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-xs">
                {codeowners.text}
              </pre>
            </div>
          ) : (
            <EmptyState>
              No CODEOWNERS at .github/CODEOWNERS, CODEOWNERS, or docs/CODEOWNERS.
            </EmptyState>
          )}
        </Card>

        <Card title="Security settings" subtitle="Repository security and analysis features">
          {security.available ? (
            <ul className="divide-y divide-border">
              {(
                [
                  ["Advanced Security", security.data.advancedSecurity],
                  ["Code security", security.data.codeSecurity],
                  ["Secret scanning", security.data.secretScanning],
                  ["Push protection", security.data.secretScanningPushProtection],
                  ["Dependabot security updates", security.data.dependabotSecurityUpdates],
                ] as const
              ).map(([label, status]) => (
                <li key={label} className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>{label}</span>
                  <Badge
                    tone={status === "enabled" ? "ok" : status === "disabled" ? "bad" : "muted"}
                  >
                    {status ?? "not reported"}
                  </Badge>
                </li>
              ))}
              <li className="flex items-center justify-between px-4 py-2 text-sm">
                <span>Dependabot alerts</span>
                <Badge tone={summary.dependabotAlertsEnabled ? "ok" : "bad"}>
                  {summary.dependabotAlertsEnabled ? "enabled" : "disabled"}
                </Badge>
              </li>
            </ul>
          ) : (
            <div className="p-4">
              <UnavailableNotice info={security} />
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Collaborators and teams"
        subtitle={
          collaborators.available
            ? `${collaborators.data.length} collaborator(s)${teams.available ? ` · ${teams.data.length} team(s)` : ""}`
            : undefined
        }
        className="p-0"
      >
        {teams.available && teams.data.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-3">
            {teams.data.map((t) => (
              <Badge key={t.slug} tone={t.permission === "admin" ? "warn" : "accent"}>
                {t.name} · {t.permission}
              </Badge>
            ))}
          </div>
        )}

        {collaborators.available ? (
          collaborators.data.length === 0 ? (
            <EmptyState>No direct collaborators.</EmptyState>
          ) : (
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <Th>User</Th>
                    <Th>Type</Th>
                    <Th>Role</Th>
                  </tr>
                </thead>
                <tbody>
                  {collaborators.data.map((c) => (
                    <tr key={c.login} className="hover:bg-surface-2/60">
                      <Td>
                        <a
                          href={c.htmlUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-info hover:underline"
                        >
                          {c.login}
                        </a>
                      </Td>
                      <Td className="text-muted">{c.type}</Td>
                      <Td>
                        <Badge tone={c.admin ? "bad" : c.role === "write" ? "warn" : "muted"}>
                          {c.role}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="p-4">
            <UnavailableNotice info={collaborators} />
          </div>
        )}
      </Card>
    </div>
  );
}
