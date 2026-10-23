"""Organization security alerts, audit log, and billing."""

from __future__ import annotations

from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any

from .core import GitHub, GitHubError, cached, config, try_fetch

SEVERITIES = ("critical", "high", "medium", "low", "unknown")


def _severity(value: Any) -> str:
    value = value.lower() if isinstance(value, str) else ""
    return {"error": "high", "warning": "medium", "note": "low"}.get(value, value if value in SEVERITIES else "unknown")


def _summarize(rows: list[dict[str, str]], truncated: bool) -> dict[str, Any]:
    counts = dict.fromkeys(SEVERITIES, 0)
    by_repo: dict[str, dict[str, Any]] = {}
    for row in rows:
        severity = row["severity"]
        counts[severity] += 1
        entry = by_repo.setdefault(row["repo"], {"repo": row["repo"], "total": 0, "counts": dict.fromkeys(SEVERITIES, 0)})
        entry["total"] += 1
        entry["counts"][severity] += 1
    ordered = sorted(by_repo.values(), key=lambda item: (-item["counts"]["critical"], -item["counts"]["high"], -item["total"], item["repo"]))
    return {"total": len(rows), "counts": counts, "byRepo": ordered, "truncated": truncated}


def _timestamp(value: Any) -> str | None:
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, timezone.utc).isoformat().replace("+00:00", "Z")
    return None


def _fetch_security() -> dict[str, Any]:
    org = config()["org"]
    github = GitHub()
    fallback = GitHub(fallback=True)

    def dependabot() -> dict[str, Any]:
        rows, truncated = github.paginate(f"/orgs/{org}/dependabot/alerts", params={"state": "open"}, cap=3000)
        return _summarize([{"repo": (row.get("repository") or {}).get("name", "unknown"), "severity": _severity((row.get("security_vulnerability") or {}).get("severity") or (row.get("security_advisory") or {}).get("severity"))} for row in rows], truncated)

    def code_scanning() -> dict[str, Any]:
        rows, truncated = github.paginate(f"/orgs/{org}/code-scanning/alerts", params={"state": "open"}, cap=3000)
        return _summarize([{"repo": (row.get("repository") or {}).get("name", "unknown"), "severity": _severity((row.get("rule") or {}).get("security_severity_level") or (row.get("rule") or {}).get("severity"))} for row in rows], truncated)

    def secret_scanning() -> dict[str, Any]:
        rows, truncated = github.paginate(f"/orgs/{org}/secret-scanning/alerts", params={"state": "open"}, cap=3000)
        alerts = [{"repo": (row.get("repository") or {}).get("name", "unknown"), "secretType": row.get("secret_type_display_name") or row.get("secret_type") or "unknown", "createdAt": row.get("created_at"), "pushProtectionBypassed": bool(row.get("push_protection_bypassed")), "htmlUrl": row.get("html_url"), "validity": row.get("validity")} for row in rows]
        counts = Counter(alert["secretType"] for alert in alerts)
        by_type = [{"type": key, "count": value} for key, value in sorted(counts.items(), key=lambda item: -item[1])]
        return {"total": len(alerts), "byRepo": _summarize([{"repo": alert["repo"], "severity": "critical"} for alert in alerts], truncated)["byRepo"], "byType": by_type, "bypassedCount": sum(alert["pushProtectionBypassed"] for alert in alerts), "alerts": alerts, "truncated": truncated}

    def audit_log() -> list[dict[str, Any]]:
        rows = fallback.request(f"/orgs/{org}/audit-log", params={"per_page": 100})
        return [{"action": str(row.get("action") or "unknown"), "actor": row.get("actor") if isinstance(row.get("actor"), str) else None, "repo": row.get("repo") if isinstance(row.get("repo"), str) else None, "createdAt": _timestamp(row.get("@timestamp") or row.get("created_at"))} for row in rows]

    def billing() -> dict[str, Any]:
        values = []
        for path in ("actions", "packages", "shared-storage"):
            try:
                values.append(fallback.request(f"/orgs/{org}/settings/billing/{path}"))
            except GitHubError:
                values.append(None)
        if not any(values):
            raise GitHubError(403, "no billing endpoint responded")
        actions, packages, storage = [value or {} for value in values]
        return {"actionsMinutesUsed": actions.get("total_minutes_used"), "actionsPaidMinutesUsed": actions.get("total_paid_minutes_used"), "actionsIncludedMinutes": actions.get("included_minutes"), "packagesBytes": packages.get("total_gigabytes_bandwidth_used"), "storageDaysUsed": storage.get("days_left_in_billing_cycle"), "storageEstimatedPaid": storage.get("estimated_paid_storage_for_month")}

    tasks = (("dependabot", "Dependabot alerts", dependabot, "Needs the Dependabot alerts permission (read-only) on the GitHub App."), ("codeScanning", "Code scanning alerts", code_scanning, "Needs the Code scanning alerts permission (read-only) on the GitHub App."), ("secretScanning", "Secret scanning alerts", secret_scanning, "Needs the Secret scanning alerts permission (read-only) on the GitHub App."), ("auditLog", "Audit log", audit_log, "The audit log requires GitHub Enterprise Cloud and usually a classic PAT — set GITHUB_FALLBACK_PAT."), ("billing", "Billing", billing, "Billing needs a classic PAT with manage_billing scope — set GITHUB_FALLBACK_PAT."))
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {key: pool.submit(try_fetch, label, function, hint) for key, label, function, hint in tasks}
        return {key: future.result() for key, future in futures.items()}


def get_security(force: bool = False) -> dict[str, Any]:
    return cached("org-alerts", config()["org"], _fetch_security, force)


def alert_counts_by_repo(overview: dict[str, Any]) -> dict[str, dict[str, int]]:
    merged: dict[str, dict[str, int]] = defaultdict(lambda: dict.fromkeys(SEVERITIES, 0))
    for source in ("dependabot", "codeScanning", "secretScanning"):
        section = overview[source]
        if section["available"]:
            for row in section["data"]["byRepo"]:
                for severity in SEVERITIES:
                    merged[row["repo"]][severity] += row["counts"][severity]
    return dict(merged)


def has_any_alert_source(overview: dict[str, Any]) -> bool:
    return any(overview[source]["available"] for source in ("dependabot", "codeScanning", "secretScanning"))
