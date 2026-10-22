import type { RepoSummary } from "./github/collectors/repos";

export type AssessmentStatus = "observed" | "gap" | "conditional" | "not assessed";
export type AssessmentFinding = {
  repo: string; control: string; status: AssessmentStatus; evidence: string;
  csa: string; stride: string; stage: string; remediation: string;
};

function scopeMatches(pattern: string, branch: string): boolean | null {
  if (pattern === "~DEFAULT_BRANCH" || pattern === "~ALL") return true;
  const value = pattern.replace(/^refs\/heads\//, "");
  if (value === branch || value === "*") return true;
  if (/[*?\[\\]/.test(value)) return null;
  return false;
}

export function assessRepository(repo: RepoSummary): AssessmentFinding[] {
  const base = (control: string, status: AssessmentStatus, evidence: string, csa: string, stride: string, stage: string, remediation: string): AssessmentFinding => ({ repo: repo.name, control, status, evidence, csa, stride, stage, remediation });
  const branch = repo.defaultBranch;
  let uncertain = !branch;
  const applicable = repo.rulesets.filter((r) => {
    if (r.target !== "BRANCH" || r.enforcement !== "ACTIVE") return false;
    const included = r.includes.map((p) => scopeMatches(p, branch ?? ""));
    const excluded = r.excludes.map((p) => scopeMatches(p, branch ?? ""));
    if (excluded.includes(true)) return false;
    if (excluded.includes(null) || (!included.includes(true) && included.includes(null)) || r.includes.length === 0) { uncertain = true; return false; }
    return included.includes(true);
  });
  const pr = applicable.filter((r) => r.ruleTypes.includes("PULL_REQUEST"));
  const approvals = Math.max(0, repo.branchProtection?.requiresApprovingReviews ? repo.branchProtection.requiredApprovingReviewCount ?? 0 : 0, ...pr.map((r) => r.pullRequest?.requiredApprovingReviewCount ?? 0));
  const ownerRequired = Boolean(repo.branchProtection?.requiresCodeOwnerReviews) || pr.some((r) => r.pullRequest?.requireCodeOwnerReview);
  const lastPush = pr.some((r) => r.pullRequest?.requireLastPushApproval);
  const ownerUsable = repo.hasCodeowners && repo.codeownersErrorCount === 0 && Boolean(repo.codeowners?.rules.length);
  const reviewStatus: AssessmentStatus = approvals > 0 || lastPush ? "observed" : uncertain ? "not assessed" : ownerRequired && ownerUsable ? "conditional" : "gap";
  const reviewEvidence = `Default branch: ${branch ?? "unknown"}; generic approvals: ${approvals}; last-push approval: ${lastPush ? "required" : "not required"}; CODEOWNER approval: ${ownerRequired ? "required only for matching owned paths" : "not required"}. ${uncertain ? "Some ruleset scopes could not be resolved." : ""}`;
  const bypasses = applicable.flatMap((r) => r.bypassActors);
  return [
    base("Approval enforcement", reviewStatus, reviewEvidence, "Change Control and Configuration Management", "Tampering", "Review", "Require at least one approving review on the target branch; inspect bypass permissions and test an actual pull request."),
    base("CODEOWNERS coverage", !repo.hasCodeowners ? "gap" : repo.codeownersErrorCount > 0 ? "gap" : "conditional", !repo.hasCodeowners ? "No CODEOWNERS file on the default branch." : `${repo.codeowners?.ruleCount ?? 0} patterns; ${repo.codeownersErrorCount} errors. File presence does not prove coverage of every changed path.`, "Application and Interface Security", "Tampering", "Review", "Assign valid teams to sensitive paths and the CODEOWNERS file; verify path matching and required owner review."),
    base("Bypass accountability", bypasses.length ? "conditional" : "not assessed", `${bypasses.length} ruleset bypass actors observed. Classic review bypass allowances are not collected.`, "Identity and Access Management", "Elevation of privilege", "Release", "Review each bypass identity, permissions, approval process, and expiration; collect classic bypass allowances."),
    base("Dependency detection", repo.dependabotAlertsEnabled ? "observed" : "gap", `Dependabot alerts ${repo.dependabotAlertsEnabled ? "enabled" : "disabled"}; remediation age and blocking checks are not assessed.`, "Threat and Vulnerability Management", "Tampering", "Build", "Enable dependency alerts, assign triage ownership, and define remediation deadlines."),
    base("Vulnerability disclosure", repo.hasSecurityPolicy ? "observed" : "gap", `Security policy ${repo.hasSecurityPolicy ? "present" : "absent"}. Response process effectiveness is not assessed.`, "Threat and Vulnerability Management", "Information disclosure", "Respond", "Publish SECURITY.md with a reporting channel and response expectations."),
    base("Identity assurance", "not assessed", "SSO enforcement, identity lifecycle, and token ownership need organization evidence.", "Identity and Access Management", "Spoofing", "Plan", "Review organization SSO, MFA, service identities, token scope, and access removal evidence."),
    base("Audit trail", "not assessed", "Audit retention, export integrity, and historical bypass events are not assessed from repository settings.", "Logging and Monitoring", "Repudiation", "Operate", "Collect audit logs and verify retention, access controls, and traceability of administrative changes."),
    base("CI availability", "not assessed", "Runner quotas, workflow concurrency, and recovery procedures need additional evidence.", "Business Continuity Management and Operational Resilience", "Denial of service", "Operate", "Review runner isolation, resource limits, concurrency, and recovery procedures."),
  ];
}

export function assessmentCsv(findings: AssessmentFinding[]): string {
  const keys: (keyof AssessmentFinding)[] = ["repo", "control", "status", "evidence", "csa", "stride", "stage", "remediation"];
  const cell = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
  return "\uFEFF" + [keys.map(cell).join(","), ...findings.map((f) => keys.map((k) => cell(f[k])).join(","))].join("\r\n");
}
