import { getOrgOverview } from "@/lib/github/collectors/org";
import { isConfigured } from "@/lib/config";
import { SetupNotice } from "@/components/SetupNotice";
import { RefreshButton } from "@/components/RefreshButton";
import {
  Badge,
  Card,
  EmptyState,
  Stat,
  Td,
  Th,
  UnavailableNotice,
  formatAge,
  type Tone,
} from "@/components/ui";
import type { Maybe } from "@/lib/github/client";

export const dynamic = "force-dynamic";

/** Renders a card body from a Maybe, so every section degrades the same way. */
function Section<T>({
  value,
  children,
  empty,
  isEmpty,
}: {
  value: Maybe<T>;
  children: (data: T) => React.ReactNode;
  empty?: string;
  isEmpty?: (data: T) => boolean;
}) {
  if (!value.available) {
    return (
      <div className="p-4">
        <UnavailableNotice info={value} />
      </div>
    );
  }
  if (isEmpty?.(value.data)) return <EmptyState>{empty ?? "Nothing to show."}</EmptyState>;
  return <>{children(value.data)}</>;
}

function BoolBadge({
  value,
  goodWhen = true,
  yes = "yes",
  no = "no",
}: {
  value: boolean | null;
  /** The value that represents the secure choice. */
  goodWhen?: boolean;
  yes?: string;
  no?: string;
}) {
  if (value === null) return <Badge tone="muted">unknown</Badge>;
  const tone: Tone = value === goodWhen ? "ok" : "warn";
  return <Badge tone={tone}>{value ? yes : no}</Badge>;
}

export default async function OrgPage() {
  if (!isConfigured()) {
    return <SetupNotice message="Organization settings need GitHub App credentials." />;
  }

  const { value: overview, fetchedAt } = await getOrgOverview();
  const { profile, rulesets, apps, tokens, pendingTokenRequests, webhooks, members, actionsPolicy } =
    overview;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Organization</h1>
          <p className="mt-1 text-sm text-muted">
            Settings, access, and integrations · updated {formatAge(fetchedAt)}
          </p>
        </div>
        <RefreshButton scopes={["org-meta"]} />
      </div>

      {members.available && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Members" value={members.data.total} tone="info" />
          <Stat
            label="Owners"
            value={members.data.admins}
            tone={members.data.admins > 5 ? "warn" : "ok"}
            hint="Full administrative control"
          />
          <Stat
            label="Outside collaborators"
            value={members.data.outsideCollaborators ?? "—"}
            tone={members.data.outsideCollaborators ? "warn" : "muted"}
          />
          <Stat
            label="2FA disabled"
            value={members.data.twoFactorDisabled ?? "—"}
            tone={
              members.data.twoFactorDisabled === null
                ? "muted"
                : members.data.twoFactorDisabled > 0
                  ? "bad"
                  : "ok"
            }
          />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Security posture" subtitle="Organization-wide defaults">
          <Section value={profile}>
            {(p) => (
              <ul className="divide-y divide-border">
                {(
                  [
                    ["Two-factor required", p.twoFactorRequired, true],
                    ["Web commit sign-off required", p.webCommitSignoffRequired, true],
                    ["Members can create repositories", p.membersCanCreateRepositories, false],
                    [
                      "Members can create public repositories",
                      p.membersCanCreatePublicRepositories,
                      false,
                    ],
                    ["Members can fork private repos", p.membersCanForkPrivateRepositories, false],
                    ["Advanced Security on new repos", p.advancedSecurityEnabledForNewRepos, true],
                    ["Secret scanning on new repos", p.secretScanningEnabledForNewRepos, true],
                    [
                      "Push protection on new repos",
                      p.secretScanningPushProtectionForNewRepos,
                      true,
                    ],
                    ["Dependabot alerts on new repos", p.dependabotAlertsEnabledForNewRepos, true],
                    [
                      "Dependabot security updates on new repos",
                      p.dependabotSecurityUpdatesEnabledForNewRepos,
                      true,
                    ],
                  ] as const
                ).map(([label, value, goodWhen]) => (
                  <li key={label} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span>{label}</span>
                    <BoolBadge value={value} goodWhen={goodWhen} />
                  </li>
                ))}
                <li className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>Default repository permission</span>
                  <Badge
                    tone={
                      p.defaultRepositoryPermission === "none"
                        ? "ok"
                        : p.defaultRepositoryPermission === "read"
                          ? "warn"
                          : "bad"
                    }
                  >
                    {p.defaultRepositoryPermission ?? "unknown"}
                  </Badge>
                </li>
                <li className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>Plan</span>
                  <Badge tone="muted">{p.plan ?? "unknown"}</Badge>
                </li>
              </ul>
            )}
          </Section>
        </Card>

        <Card title="Actions policy" subtitle="Which actions may run and what tokens they get">
          <Section value={actionsPolicy}>
            {(a) => (
              <ul className="divide-y divide-border">
                <li className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>Enabled repositories</span>
                  <Badge tone={a.enabledRepositories === "all" ? "warn" : "ok"}>
                    {a.enabledRepositories}
                  </Badge>
                </li>
                <li className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>Allowed actions</span>
                  <Badge tone={a.allowedActions === "all" ? "bad" : "ok"}>
                    {a.allowedActions ?? "unknown"}
                  </Badge>
                </li>
                <li className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>Default workflow token</span>
                  <Badge tone={a.defaultWorkflowPermissions === "write" ? "bad" : "ok"}>
                    {a.defaultWorkflowPermissions ?? "unknown"}
                  </Badge>
                </li>
                <li className="flex items-center justify-between px-4 py-2 text-sm">
                  <span>Actions can approve pull requests</span>
                  <BoolBadge value={a.canApprovePullRequestReviews} goodWhen={false} />
                </li>
                {a.patternsAllowed && a.patternsAllowed.length > 0 && (
                  <li className="px-4 py-2 text-sm">
                    <div className="mb-1">Allowed patterns</div>
                    <div className="flex flex-wrap gap-1">
                      {a.patternsAllowed.map((p) => (
                        <Badge key={p} tone="muted">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </li>
                )}
              </ul>
            )}
          </Section>
        </Card>
      </div>

      <Card
        title="Organization rulesets"
        subtitle="Rules inherited by every repository in the org"
        className="p-0"
      >
        <Section value={rulesets} isEmpty={(r) => r.length === 0} empty="No organization rulesets.">
          {(list) => (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th>Ruleset</Th>
                  <Th>Target</Th>
                  <Th>Enforcement</Th>
                  <Th>Rules</Th>
                  <Th>Bypass actors</Th>
                </tr>
              </thead>
              <tbody>
                {list.map((rs) => (
                  <tr key={rs.id} className="hover:bg-surface-2/60">
                    <Td>
                      {rs.htmlUrl ? (
                        <a
                          href={rs.htmlUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-info hover:underline"
                        >
                          {rs.name}
                        </a>
                      ) : (
                        rs.name
                      )}
                    </Td>
                    <Td>
                      <Badge tone="muted">{rs.target}</Badge>
                    </Td>
                    <Td>
                      <Badge tone={rs.enforcement === "active" ? "ok" : "warn"}>
                        {rs.enforcement}
                      </Badge>
                    </Td>
                    <Td>
                      <span className="flex flex-wrap gap-1">
                        {rs.ruleTypes.map((t) => (
                          <Badge key={t} tone="info">
                            {t}
                          </Badge>
                        ))}
                      </span>
                    </Td>
                    <Td>
                      {rs.bypassActorCount > 0 ? (
                        <Badge tone="warn">{rs.bypassActorCount}</Badge>
                      ) : (
                        <Badge tone="ok">none</Badge>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </Card>

      <Card
        title="Installed GitHub Apps"
        subtitle="Third-party code with API access to your repositories"
        className="p-0"
      >
        <Section value={apps} isEmpty={(a) => a.length === 0} empty="No installed apps.">
          {(list) => (
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <Th>App</Th>
                    <Th>Repositories</Th>
                    <Th>Permissions</Th>
                    <Th>Installed</Th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((app) => {
                    const writes = Object.entries(app.permissions).filter(
                      ([, level]) => level === "write" || level === "admin",
                    );
                    return (
                      <tr key={app.id} className="hover:bg-surface-2/60">
                        <Td>
                          {app.htmlUrl ? (
                            <a
                              href={app.htmlUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-info hover:underline"
                            >
                              {app.appSlug}
                            </a>
                          ) : (
                            app.appSlug
                          )}
                          {app.suspendedAt && (
                            <Badge tone="muted" >suspended</Badge>
                          )}
                        </Td>
                        <Td>
                          <Badge tone={app.repositorySelection === "all" ? "warn" : "ok"}>
                            {app.repositorySelection}
                          </Badge>
                        </Td>
                        <Td>
                          <span
                            className="flex flex-wrap gap-1"
                            title={Object.entries(app.permissions)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(", ")}
                          >
                            <Badge tone={writes.length > 0 ? "warn" : "muted"}>
                              {Object.keys(app.permissions).length} scopes
                            </Badge>
                            {writes.length > 0 && (
                              <Badge tone="bad">{writes.length} write</Badge>
                            )}
                          </span>
                        </Td>
                        <Td className="text-xs text-muted">
                          {app.createdAt ? app.createdAt.slice(0, 10) : "—"}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card
          title="Fine-grained personal access tokens"
          subtitle={
            pendingTokenRequests.available && pendingTokenRequests.data > 0
              ? `${pendingTokenRequests.data} pending request(s)`
              : "Tokens with access to organization resources"
          }
          className="p-0"
        >
          <Section value={tokens} isEmpty={(t) => t.length === 0} empty="No fine-grained tokens.">
            {(list) => (
              <div className="max-h-80 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <Th>Owner</Th>
                      <Th>Scope</Th>
                      <Th>Permissions</Th>
                      <Th>Expires</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((t) => (
                      <tr key={t.id} className="hover:bg-surface-2/60">
                        <Td>{t.owner}</Td>
                        <Td>
                          <Badge tone={t.repositorySelection === "all" ? "bad" : "muted"}>
                            {t.repositorySelection}
                            {t.repositoryCount !== null && ` (${t.repositoryCount})`}
                          </Badge>
                        </Td>
                        <Td>
                          <Badge
                            tone="muted"
                            title={Object.entries(t.permissions)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(", ")}
                          >
                            {Object.keys(t.permissions).length} scopes
                          </Badge>
                        </Td>
                        <Td className="text-xs">
                          {t.tokenExpired ? (
                            <Badge tone="muted">expired</Badge>
                          ) : t.tokenExpiresAt ? (
                            <span className="text-muted">{t.tokenExpiresAt.slice(0, 10)}</span>
                          ) : (
                            <Badge tone="bad">never</Badge>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </Card>

        <Card title="Organization webhooks" subtitle="Outbound event delivery" className="p-0">
          <Section value={webhooks} isEmpty={(w) => w.length === 0} empty="No organization webhooks.">
            {(list) => (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <Th>Endpoint</Th>
                    <Th>Events</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((h) => (
                    <tr key={h.id} className="hover:bg-surface-2/60">
                      <Td className="max-w-xs truncate font-mono text-xs" >{h.url ?? "—"}</Td>
                      <Td>
                        <Badge tone="muted" title={h.events.join(", ")}>
                          {h.events.includes("*") ? "all events" : `${h.events.length} events`}
                        </Badge>
                      </Td>
                      <Td>
                        <span className="flex flex-wrap gap-1">
                          <Badge tone={h.active ? "ok" : "muted"}>
                            {h.active ? "active" : "inactive"}
                          </Badge>
                          {h.insecureSsl && <Badge tone="bad">SSL verification off</Badge>}
                          {!h.hasSecret && <Badge tone="warn">no secret</Badge>}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </Card>
      </div>

      <Card title="Organization owners" subtitle="Accounts with full administrative control" className="p-0">
        <Section value={members} isEmpty={(m) => m.adminLogins.length === 0} empty="No owners found.">
          {(m) => (
            <div className="flex flex-wrap gap-1.5 px-4 py-3">
              {m.adminLogins.map((login) => (
                <a
                  key={login}
                  href={`https://github.com/${login}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Badge tone="warn">{login}</Badge>
                </a>
              ))}
            </div>
          )}
        </Section>
      </Card>
    </div>
  );
}
