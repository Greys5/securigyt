"""Organization configuration and access inventory."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any

from .core import GitHub, GitHubError, cached, config, try_fetch

ADMIN_HINT = "Needs organization admin access (GitHub App: Organization administration, read-only)."


def _fetch_org() -> dict[str, Any]:
    org = config()["org"]
    github = GitHub()

    def profile() -> dict[str, Any]:
        data = github.request(f"/orgs/{org}")
        return {"login": data["login"], "name": data.get("name"), "plan": (data.get("plan") or {}).get("name"), "publicRepos": data["public_repos"], "privateRepos": data.get("owned_private_repos", 0), "twoFactorRequired": data.get("two_factor_requirement_enabled"), "defaultRepositoryPermission": data.get("default_repository_permission"), "membersCanCreateRepositories": data.get("members_can_create_repositories"), "membersCanCreatePublicRepositories": data.get("members_can_create_public_repositories"), "membersCanForkPrivateRepositories": data.get("members_can_fork_private_repositories"), "webCommitSignoffRequired": data.get("web_commit_signoff_required"), "advancedSecurityEnabledForNewRepos": data.get("advanced_security_enabled_for_new_repositories"), "secretScanningEnabledForNewRepos": data.get("secret_scanning_enabled_for_new_repositories"), "secretScanningPushProtectionForNewRepos": data.get("secret_scanning_push_protection_enabled_for_new_repositories"), "dependabotAlertsEnabledForNewRepos": data.get("dependabot_alerts_enabled_for_new_repositories"), "dependabotSecurityUpdatesEnabledForNewRepos": data.get("dependabot_security_updates_enabled_for_new_repositories")}

    def rulesets() -> list[dict[str, Any]]:
        listing = github.request(f"/orgs/{org}/rulesets")
        result = []
        for item in listing:
            rule = github.request(f"/orgs/{org}/rulesets/{item['id']}")
            result.append({"id": rule["id"], "name": rule["name"], "target": rule.get("target", "branch"), "enforcement": rule["enforcement"], "ruleTypes": [entry["type"] for entry in rule.get("rules") or []], "bypassActorCount": len(rule.get("bypass_actors") or []), "htmlUrl": ((rule.get("_links") or {}).get("html") or {}).get("href")})
        return result

    def apps() -> list[dict[str, Any]]:
        data = github.request(f"/orgs/{org}/installations", params={"per_page": 100})
        return [{"id": item["id"], "appId": item["app_id"], "appSlug": item["app_slug"], "repositorySelection": item["repository_selection"], "permissions": item.get("permissions") or {}, "events": item.get("events") or [], "createdAt": item.get("created_at"), "suspendedAt": item.get("suspended_at"), "htmlUrl": item.get("html_url")} for item in data.get("installations") or []]

    def tokens() -> list[dict[str, Any]]:
        rows, _ = github.paginate(f"/orgs/{org}/personal-access-tokens")
        return [{"id": item["id"], "owner": (item.get("owner") or {}).get("login", "unknown"), "repositorySelection": item["repository_selection"], "repositoryCount": item.get("repository_count"), "permissions": {**(item.get("permissions") or {}).get("organization", {}), **(item.get("permissions") or {}).get("repository", {})}, "accessGrantedAt": item.get("access_granted_at"), "tokenExpired": item.get("token_expired"), "tokenExpiresAt": item.get("token_expires_at")} for item in rows]

    def pending() -> int:
        rows, _ = github.paginate(f"/orgs/{org}/personal-access-token-requests")
        return len(rows)

    def webhooks() -> list[dict[str, Any]]:
        rows, _ = github.paginate(f"/orgs/{org}/hooks")
        return [{"id": item["id"], "name": item["name"], "active": item["active"], "events": item.get("events") or [], "url": (item.get("config") or {}).get("url"), "insecureSsl": str((item.get("config") or {}).get("insecure_ssl", "0")) == "1", "hasSecret": bool((item.get("config") or {}).get("secret"))} for item in rows]

    def members() -> dict[str, Any]:
        admins, _ = github.paginate(f"/orgs/{org}/members", params={"role": "admin"})
        all_members, _ = github.paginate(f"/orgs/{org}/members")
        try:
            outside, _ = github.paginate(f"/orgs/{org}/outside_collaborators")
            outside_count = len(outside)
        except GitHubError:
            outside_count = None
        try:
            disabled, _ = github.paginate(f"/orgs/{org}/members", params={"filter": "2fa_disabled"})
            disabled_count = len(disabled)
        except GitHubError:
            disabled_count = None
        return {"total": len(all_members), "admins": len(admins), "members": len(all_members) - len(admins), "outsideCollaborators": outside_count, "twoFactorDisabled": disabled_count, "adminLogins": sorted(item["login"] for item in admins)}

    def actions_policy() -> dict[str, Any]:
        permissions = github.request(f"/orgs/{org}/actions/permissions")
        selected = github.request(f"/orgs/{org}/actions/permissions/selected-actions") if permissions.get("allowed_actions") == "selected" else {}
        try:
            workflow = github.request(f"/orgs/{org}/actions/permissions/workflow")
        except GitHubError:
            workflow = {}
        return {"enabledRepositories": permissions["enabled_repositories"], "allowedActions": permissions.get("allowed_actions"), "githubOwnedAllowed": selected.get("github_owned_allowed"), "verifiedAllowed": selected.get("verified_allowed"), "patternsAllowed": selected.get("patterns_allowed"), "defaultWorkflowPermissions": workflow.get("default_workflow_permissions"), "canApprovePullRequestReviews": workflow.get("can_approve_pull_request_reviews")}

    tasks = (("profile", "Organization profile", profile, None), ("rulesets", "Organization rulesets", rulesets, ADMIN_HINT), ("apps", "Installed GitHub Apps", apps, ADMIN_HINT), ("tokens", "Fine-grained personal access tokens", tokens, ADMIN_HINT), ("pendingTokenRequests", "Pending token requests", pending, ADMIN_HINT), ("webhooks", "Organization webhooks", webhooks, ADMIN_HINT), ("members", "Members", members, None), ("actionsPolicy", "Actions policy", actions_policy, ADMIN_HINT))
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {key: pool.submit(try_fetch, label, function, hint) for key, label, function, hint in tasks}
        return {key: future.result() for key, future in futures.items()}


def get_org(force: bool = False) -> dict[str, Any]:
    return cached("org-meta", config()["org"], _fetch_org, force)
