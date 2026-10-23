"""Repository score and organization posture."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from math import floor
from typing import Any

from .actions import get_actions
from .repos import get_inventory
from .security import alert_counts_by_repo, get_security, has_any_alert_source


def grade_for(percent: int) -> str:
    return "A" if percent >= 90 else "B" if percent >= 75 else "C" if percent >= 60 else "D" if percent >= 40 else "F"


def compute_score(repo: dict[str, Any], action_refs: dict[str, int] | None = None, alerts: dict[str, int] | None = None, security: dict[str, bool] | None = None, admin_collaborators: int | None = None) -> dict[str, Any]:
    bp = repo.get("branchProtection") or {}
    active = [rule for rule in repo["rulesets"] if rule["target"] == "BRANCH" and rule["enforcement"] == "ACTIVE"]
    pr = next((rule["pullRequest"] for rule in active if rule.get("pullRequest")), None) or {}
    has_rule = lambda kind: any(kind in rule["ruleTypes"] for rule in active)
    check: list[dict[str, Any]] = []

    def add(id: str, label: str, weight: int, status: str | bool, detail: str) -> None:
        check.append({"id": id, "label": label, "weight": weight, "status": "pass" if status is True else "fail" if status is False else status, "detail": detail})

    add("branch-protected", "Default branch is protected", 3, repo["defaultBranchProtected"], "No branch protection rule or active ruleset covers the default branch" if repo["protectionSource"] == "none" else f'Protected via {"ruleset" if repo["protectionSource"] == "ruleset" else "branch protection rule"}')
    add("force-push-blocked", "Force pushes blocked", 2, (bool(bp) and not bp.get("allowsForcePushes")) or has_rule("NON_FAST_FORWARD"), "History rewrites on the default branch")
    add("deletion-blocked", "Branch deletion blocked", 1, (bool(bp) and not bp.get("allowsDeletions")) or has_rule("DELETION"), "Deleting the default branch")
    approvals = (bool(bp.get("requiresApprovingReviews")) and (bp.get("requiredApprovingReviewCount") or 0) > 0) or (bool(pr) and (pr.get("requiredApprovingReviewCount") or 0) > 0)
    add("review-required", "Pull request review required", 2, approvals, "A pull request is required but zero approvals are needed" if pr and (pr.get("requiredApprovingReviewCount") or 0) == 0 else "At least one approving review before merge")
    add("code-owner-review", "Code owner review required", 1, bool(bp.get("requiresCodeOwnerReviews") or pr.get("requireCodeOwnerReview")), "CODEOWNERS approval enforced on merge")
    add("codeowners-present", "CODEOWNERS file present", 2, repo["hasCodeowners"], "Found on the default branch" if repo["hasCodeowners"] else "No CODEOWNERS file")
    add("codeowners-valid", "CODEOWNERS has no errors", 1, repo["codeownersErrorCount"] == 0 if repo["hasCodeowners"] else "n/a", f'{repo["codeownersErrorCount"]} validation error(s)' if repo["codeownersErrorCount"] else "No syntax or ownership errors")
    add("dependabot-alerts", "Dependabot alerts enabled", 2, repo["dependabotAlertsEnabled"], "Vulnerable dependency detection")
    add("security-policy", "Security policy published", 1, repo["hasSecurityPolicy"], "SECURITY.md tells people how to report issues")
    add("actions-pinned", "Actions pinned to a commit SHA", 2, "unknown" if action_refs is None else "n/a" if action_refs["total"] == 0 else action_refs["unpinned"] == 0, "Workflow scan has not run" if action_refs is None else "No workflows in this repository" if action_refs["total"] == 0 else f'{action_refs["unpinned"]} of {action_refs["total"]} references are not SHA-pinned')
    add("secret-scanning", "Secret scanning enabled", 2, "unknown" if security is None else security["secretScanning"], "Needs repository admin access" if security is None else "Detects committed credentials")
    add("push-protection", "Secret push protection enabled", 2, "unknown" if security is None else security["pushProtection"], "Needs repository admin access" if security is None else "Blocks pushes containing secrets")
    add("no-admin-collaborators", "No direct admin collaborators", 1, "unknown" if admin_collaborators is None else admin_collaborators == 0, "Collaborator list not loaded" if admin_collaborators is None else f"{admin_collaborators} collaborator(s) hold the admin role directly")
    add("no-severe-alerts", "No critical or high alerts open", 2, "unknown" if alerts is None else alerts["critical"] == 0 and alerts["high"] == 0, "Alert data not available" if alerts is None else f'{alerts["critical"]} critical, {alerts["high"]} high open')
    scored = [item for item in check if item["status"] in ("pass", "fail")]
    applicable = sum(item["weight"] for item in scored)
    earned = sum(item["weight"] for item in scored if item["status"] == "pass")
    percent = floor(earned / applicable * 100 + 0.5) if applicable else 0
    return {"percent": percent, "grade": grade_for(percent), "earnedWeight": earned, "applicableWeight": applicable, "checks": check, "failed": [item for item in check if item["status"] == "fail"]}


def get_posture() -> dict[str, Any]:
    inventory = get_inventory()
    with ThreadPoolExecutor(max_workers=2) as pool:
        actions_job = pool.submit(get_actions)
        security_job = pool.submit(get_security)
        actions, security = actions_job.result(), security_job.result()
    refs: dict[str, dict[str, int]] = {}
    for action in actions["value"]["actions"]:
        for site in action["sites"]:
            entry = refs.setdefault(site["repo"], {"total": 0, "unpinned": 0})
            entry["total"] += 1
            entry["unpinned"] += int(not site["pinned"])
    alert_counts = alert_counts_by_repo(security["value"])
    alerts_available = has_any_alert_source(security["value"])
    scored = [{"repo": repo, "score": compute_score(repo, refs.get(repo["name"], {"total": 0, "unpinned": 0}), alert_counts.get(repo["name"], {"critical": 0, "high": 0, "medium": 0, "low": 0}) if alerts_available else None)} for repo in inventory["value"]["repos"] if not repo["archived"]]
    scored.sort(key=lambda item: (item["score"]["percent"], item["repo"]["name"]))
    distribution = dict.fromkeys(("A", "B", "C", "D", "F"), 0)
    rollups: dict[str, dict[str, Any]] = {}
    for item in scored:
        distribution[item["score"]["grade"]] += 1
        for check in item["score"]["checks"]:
            entry = rollups.setdefault(check["id"], {"id": check["id"], "label": check["label"], "passed": 0, "failed": 0, "unknown": 0, "notApplicable": 0})
            field = {"pass": "passed", "fail": "failed", "unknown": "unknown", "n/a": "notApplicable"}[check["status"]]
            entry[field] += 1
    average = floor(sum(item["score"]["percent"] for item in scored) / len(scored) + 0.5) if scored else 0
    return {"scored": scored, "averagePercent": average, "distribution": distribution, "checkRollup": sorted(rollups.values(), key=lambda item: -item["failed"]), "security": security["value"], "actionsScanned": actions["value"]["workflowCount"] > 0, "fetchedAt": min(inventory["fetchedAt"], actions["fetchedAt"], security["fetchedAt"])}
