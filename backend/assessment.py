"""Evidence assessment derived from repository configuration."""

from __future__ import annotations

import re
from typing import Any


def _scope_matches(pattern: str, branch: str) -> bool | None:
    if pattern in ("~DEFAULT_BRANCH", "~ALL"):
        return True
    value = re.sub(r"^refs/heads/", "", pattern)
    if value in (branch, "*"):
        return True
    if re.search(r"[*?\[\\]", value):
        return None
    return False


def assess_repository(repo: dict[str, Any]) -> list[dict[str, str]]:
    def finding(control: str, status: str, evidence: str, csa: str, stride: str, stage: str, remediation: str) -> dict[str, str]:
        return {"repo": repo["name"], "control": control, "status": status, "evidence": evidence, "csa": csa, "stride": stride, "stage": stage, "remediation": remediation}

    branch = repo.get("defaultBranch")
    uncertain = not branch
    applicable = []
    for rule in repo["rulesets"]:
        if rule["target"] != "BRANCH" or rule["enforcement"] != "ACTIVE":
            continue
        included = [_scope_matches(pattern, branch or "") for pattern in rule["includes"]]
        excluded = [_scope_matches(pattern, branch or "") for pattern in rule["excludes"]]
        if True in excluded:
            continue
        if None in excluded or (True not in included and None in included) or not rule["includes"]:
            uncertain = True
            continue
        if True in included:
            applicable.append(rule)
    pr = [rule for rule in applicable if "PULL_REQUEST" in rule["ruleTypes"]]
    bp = repo.get("branchProtection") or {}
    approvals = max([0, bp.get("requiredApprovingReviewCount") or 0 if bp.get("requiresApprovingReviews") else 0, *[(rule.get("pullRequest") or {}).get("requiredApprovingReviewCount") or 0 for rule in pr]])
    owner_required = bool(bp.get("requiresCodeOwnerReviews")) or any((rule.get("pullRequest") or {}).get("requireCodeOwnerReview") for rule in pr)
    last_push = any((rule.get("pullRequest") or {}).get("requireLastPushApproval") for rule in pr)
    owner_usable = repo["hasCodeowners"] and repo["codeownersErrorCount"] == 0 and bool((repo.get("codeowners") or {}).get("rules"))
    review_status = "observed" if approvals > 0 or last_push else "not assessed" if uncertain else "conditional" if owner_required and owner_usable else "gap"
    review_evidence = f'Default branch: {branch or "unknown"}; generic approvals: {approvals}; last-push approval: {"required" if last_push else "not required"}; CODEOWNER approval: {"required only for matching owned paths" if owner_required else "not required"}. {"Some ruleset scopes could not be resolved." if uncertain else ""}'
    bypasses = [actor for rule in applicable for actor in rule["bypassActors"]]
    co = repo.get("codeowners") or {}
    return [
        finding("Approval enforcement", review_status, review_evidence, "Change Control and Configuration Management", "Tampering", "Review", "Require at least one approving review on the target branch; inspect bypass permissions and test an actual pull request."),
        finding("CODEOWNERS coverage", "gap" if not repo["hasCodeowners"] or repo["codeownersErrorCount"] > 0 else "conditional", "No CODEOWNERS file on the default branch." if not repo["hasCodeowners"] else f'{co.get("ruleCount", 0)} patterns; {repo["codeownersErrorCount"]} errors. File presence does not prove coverage of every changed path.', "Application and Interface Security", "Tampering", "Review", "Assign valid teams to sensitive paths and the CODEOWNERS file; verify path matching and required owner review."),
        finding("Bypass accountability", "conditional" if bypasses else "not assessed", f'{len(bypasses)} ruleset bypass actors observed. Classic review bypass allowances are not collected.', "Identity and Access Management", "Elevation of privilege", "Release", "Review each bypass identity, permissions, approval process, and expiration; collect classic bypass allowances."),
        finding("Dependency detection", "observed" if repo["dependabotAlertsEnabled"] else "gap", f'Dependabot alerts {"enabled" if repo["dependabotAlertsEnabled"] else "disabled"}; remediation age and blocking checks are not assessed.', "Threat and Vulnerability Management", "Tampering", "Build", "Enable dependency alerts, assign triage ownership, and define remediation deadlines."),
        finding("Vulnerability disclosure", "observed" if repo["hasSecurityPolicy"] else "gap", f'Security policy {"present" if repo["hasSecurityPolicy"] else "absent"}. Response process effectiveness is not assessed.', "Threat and Vulnerability Management", "Information disclosure", "Respond", "Publish SECURITY.md with a reporting channel and response expectations."),
        finding("Identity assurance", "not assessed", "SSO enforcement, identity lifecycle, and token ownership need organization evidence.", "Identity and Access Management", "Spoofing", "Plan", "Review organization SSO, MFA, service identities, token scope, and access removal evidence."),
        finding("Audit trail", "not assessed", "Audit retention, export integrity, and historical bypass events are not assessed from repository settings.", "Logging and Monitoring", "Repudiation", "Operate", "Collect audit logs and verify retention, access controls, and traceability of administrative changes."),
        finding("CI availability", "not assessed", "Runner quotas, workflow concurrency, and recovery procedures need additional evidence.", "Business Continuity Management and Operational Resilience", "Denial of service", "Operate", "Review runner isolation, resource limits, concurrency, and recovery procedures."),
    ]


def assess_inventory(repos: list[dict[str, Any]]) -> list[dict[str, str]]:
    return [finding for repo in repos if not repo["archived"] for finding in assess_repository(repo)]
