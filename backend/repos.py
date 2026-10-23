"""Organization inventory and repository deep scans."""

from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from .core import GitHub, cached, config, try_fetch
from .parsers import parse_codeowners, parse_workflow

LIST_QUERY = """query($org: String!, $cursor: String) {
  organization(login: $org) {
    repositories(first: 100, after: $cursor, ownerAffiliations: OWNER, orderBy: {field: NAME, direction: ASC}) {
      totalCount pageInfo { hasNextPage endCursor }
      nodes { name url description isArchived isPrivate isFork visibility pushedAt }
    }
  }
}"""

DETAIL_FIELDS = """
  name isSecurityPolicyEnabled hasVulnerabilityAlertsEnabled
  codeowners { errors { kind line message path } }
  defaultBranchRef { name branchProtectionRule {
    pattern allowsForcePushes allowsDeletions requiresApprovingReviews requiredApprovingReviewCount
    requiresCodeOwnerReviews dismissesStaleReviews requiresStatusChecks requiresConversationResolution
    requiresLinearHistory requiresCommitSignatures isAdminEnforced restrictsPushes
  } }
  rulesets(first: 20, includeParents: true) { nodes {
    name enforcement target databaseId source { __typename }
    conditions { refName { include exclude } }
    bypassActors(first: 100) { nodes {
      bypassMode deployKey enterpriseOwner enterpriseRole organizationAdmin repositoryRoleName
      actor { __typename ... on App { name slug } ... on Team { name slug } ... on User { login } }
    } }
    rules(first: 30) { nodes { type parameters { __typename ... on PullRequestParameters {
      requiredApprovingReviewCount requireCodeOwnerReview dismissStaleReviewsOnPush requireLastPushApproval
    } } } }
  } }
  dotGithub: object(expression: "HEAD:.github") { ... on Tree { entries { name type } } }
  workflowsDir: object(expression: "HEAD:.github/workflows") { ... on Tree { entries { name type } } }
  codeownersDotGithub: object(expression: "HEAD:.github/CODEOWNERS") { ... on Blob { text isTruncated } }
  codeownersRoot: object(expression: "HEAD:CODEOWNERS") { ... on Blob { text isTruncated } }
  codeownersDocs: object(expression: "HEAD:docs/CODEOWNERS") { ... on Blob { text isTruncated } }
"""


def _bypass_actor(node: dict[str, Any]) -> dict[str, str]:
    actor = node.get("actor")
    if actor:
        name = actor.get("slug") or actor.get("login") or actor.get("name") or actor.get("__typename")
        return {"actorType": actor.get("__typename", "Unknown"), "actorName": name, "bypassMode": node["bypassMode"]}
    for flag, kind, label in (("organizationAdmin", "OrganizationAdmin", "Organization admins"), ("enterpriseOwner", "EnterpriseOwner", "Enterprise owners"), ("enterpriseRole", "EnterpriseRole", "Enterprise role"), ("deployKey", "DeployKey", "Deploy keys")):
        if node.get(flag):
            return {"actorType": kind, "actorName": label, "bypassMode": node["bypassMode"]}
    if node.get("repositoryRoleName"):
        return {"actorType": "RepositoryRole", "actorName": node["repositoryRoleName"], "bypassMode": node["bypassMode"]}
    return {"actorType": "Unknown", "actorName": "Unknown actor", "bypassMode": node["bypassMode"]}


def _summary(item: dict[str, Any], detail: dict[str, Any] | None) -> dict[str, Any]:
    detail = detail or {}
    rulesets = []
    for rule in (detail.get("rulesets") or {}).get("nodes") or []:
        if not rule:
            continue
        rules = [entry for entry in (rule.get("rules") or {}).get("nodes") or [] if entry]
        pr = next((entry.get("parameters") for entry in rules if (entry.get("parameters") or {}).get("__typename") == "PullRequestParameters"), None)
        ref = (rule.get("conditions") or {}).get("refName") or {}
        rulesets.append({"name": rule["name"], "enforcement": rule["enforcement"], "target": rule["target"], "databaseId": rule.get("databaseId"), "source": (rule.get("source") or {}).get("__typename", "Unknown"), "ruleTypes": [entry["type"] for entry in rules], "pullRequest": {"requiredApprovingReviewCount": pr.get("requiredApprovingReviewCount"), "requireCodeOwnerReview": pr.get("requireCodeOwnerReview", False), "dismissStaleReviewsOnPush": pr.get("dismissStaleReviewsOnPush", False), "requireLastPushApproval": pr.get("requireLastPushApproval", False)} if pr else None, "includes": ref.get("include") or [], "excludes": ref.get("exclude") or [], "bypassActors": [_bypass_actor(actor) for actor in (rule.get("bypassActors") or {}).get("nodes") or [] if actor]})
    branch_ref = detail.get("defaultBranchRef") or {}
    bp = branch_ref.get("branchProtectionRule")
    protection = "branch-protection" if bp else "ruleset" if any(rule["target"] == "BRANCH" and rule["enforcement"] == "ACTIVE" for rule in rulesets) else "none"
    dot_entries = [entry["name"] for entry in (detail.get("dotGithub") or {}).get("entries") or []]
    files = [entry["name"] for entry in (detail.get("workflowsDir") or {}).get("entries") or [] if entry["type"] == "blob" and re.search(r"\.ya?ml$", entry["name"], re.I)]
    codeowners = None
    for path, field in ((".github/CODEOWNERS", "codeownersDotGithub"), ("CODEOWNERS", "codeownersRoot"), ("docs/CODEOWNERS", "codeownersDocs")):
        blob = detail.get(field)
        if blob is not None:
            if blob.get("text"):
                codeowners = {"path": path, **parse_codeowners(blob["text"]), "truncated": blob.get("isTruncated", False)}
            break
    return {"name": item["name"], "url": item["url"], "description": item.get("description"), "archived": item["isArchived"], "isPrivate": item["isPrivate"], "isFork": item["isFork"], "visibility": item["visibility"], "pushedAt": item.get("pushedAt"), "defaultBranch": branch_ref.get("name"), "hasDotGithub": bool(dot_entries), "dotGithubEntries": dot_entries, "workflowFiles": files, "hasCodeowners": detail.get("codeowners") is not None, "codeownersErrorCount": len((detail.get("codeowners") or {}).get("errors") or []), "codeowners": codeowners, "hasSecurityPolicy": detail.get("isSecurityPolicyEnabled", False), "dependabotAlertsEnabled": detail.get("hasVulnerabilityAlertsEnabled", False), "branchProtection": bp, "rulesets": rulesets, "protectionSource": protection, "defaultBranchProtected": protection != "none"}


def _fetch_inventory() -> dict[str, Any]:
    org = config()["org"]
    github = GitHub()
    listed: list[dict[str, Any]] = []
    errors: list[str] = []
    cursor = None
    total = 0
    while True:
        data, issues = github.graphql(LIST_QUERY, {"org": org, "cursor": cursor})
        errors.extend(issues)
        page = data["organization"]["repositories"]
        total = page["totalCount"]
        listed.extend(node for node in page["nodes"] if node)
        cursor = page["pageInfo"]["endCursor"] if page["pageInfo"]["hasNextPage"] else None
        if not cursor:
            break

    def batch(items: list[dict[str, Any]]) -> tuple[dict[str, Any], list[str]]:
        fields = "\n".join(f'  r{i}: repository(owner: $org, name: {json.dumps(item["name"])}) {{{DETAIL_FIELDS}}}' for i, item in enumerate(items))
        data, issues = GitHub().graphql(f"query($org: String!) {{\n{fields}\n}}", {"org": org})
        return {item["name"]: data.get(f"r{i}") for i, item in enumerate(items)}, issues

    details: dict[str, Any] = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(batch, listed[i:i + 25]) for i in range(0, len(listed), 25)]
        for future in as_completed(futures):
            result, issues = future.result()
            details.update(result)
            errors.extend(issues)
    for item in listed:
        if not details.get(item["name"]):
            errors.append(f'{item["name"]}: detail unavailable')
    return {"org": org, "totalCount": total, "repos": [_summary(item, details.get(item["name"])) for item in listed], "errors": errors}


def get_inventory(force: bool = False) -> dict[str, Any]:
    return cached("org-repos", config()["org"], _fetch_inventory, force)


def _fetch_detail(name: str) -> dict[str, Any]:
    org = config()["org"]
    summary = next((repo for repo in get_inventory()["value"]["repos"] if repo["name"] == name), None)
    if not summary:
        raise ValueError(f'Repository "{name}" is not in the {org} inventory.')
    selections = "\n".join(f' w{i}: object(expression: {json.dumps("HEAD:.github/workflows/" + file)}) {{ ... on Blob {{ text byteSize isTruncated }} }}' for i, file in enumerate(summary["workflowFiles"]))
    codeowners_fields = "\n".join(f' co{i}: object(expression: {json.dumps("HEAD:" + path)}) {{ ... on Blob {{ text byteSize isTruncated }} }}' for i, path in enumerate((".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS")))
    query = f'query($org: String!, $repo: String!) {{ repository(owner: $org, name: $repo) {{ codeowners {{ errors {{ kind line message path }} }} {codeowners_fields} {selections} }} }}'
    data, _ = GitHub().graphql(query, {"org": org, "repo": name})
    contents = data.get("repository") or {}
    workflows = []
    truncated = []
    for i, file in enumerate(summary["workflowFiles"]):
        blob = contents.get(f"w{i}")
        if blob and blob.get("text"):
            if blob.get("isTruncated"):
                truncated.append(file)
            workflows.append(parse_workflow(file, blob["text"]))
    codeowners = None
    for i, path in enumerate((".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS")):
        blob = contents.get(f"co{i}")
        if blob and blob.get("text"):
            codeowners = {"path": path, "text": blob["text"], **parse_codeowners(blob["text"])}
            break
    github = GitHub()

    def collaborators() -> list[dict[str, Any]]:
        rows, _ = github.paginate(f"/repos/{org}/{name}/collaborators", params={"affiliation": "all"})
        return sorted(({"login": row["login"], "type": row["type"], "role": row.get("role_name") or ("admin" if (row.get("permissions") or {}).get("admin") else "read"), "admin": bool((row.get("permissions") or {}).get("admin")), "htmlUrl": row["html_url"], "avatarUrl": row["avatar_url"]} for row in rows), key=lambda row: row["login"])

    def teams() -> list[dict[str, Any]]:
        rows, _ = github.paginate(f"/repos/{org}/{name}/teams")
        return [{"name": row["name"], "slug": row["slug"], "permission": row["permission"]} for row in rows]

    def rulesets() -> list[dict[str, Any]]:
        listing = github.request(f"/repos/{org}/{name}/rulesets", params={"includes_parents": "true"})
        result = []
        for item in listing:
            rule = github.request(f"/repos/{org}/{name}/rulesets/{item['id']}", params={"includes_parents": "true"})
            ref = (rule.get("conditions") or {}).get("ref_name") or {}
            result.append({"id": rule["id"], "name": rule["name"], "target": rule.get("target", "branch"), "enforcement": rule["enforcement"], "sourceType": rule.get("source_type", "Repository"), "source": rule.get("source", name), "includes": ref.get("include") or [], "excludes": ref.get("exclude") or [], "rules": [{"type": entry["type"], "parameters": entry.get("parameters")} for entry in rule.get("rules") or []], "bypassActors": [{"actorType": actor.get("actor_type", "Unknown"), "bypassMode": actor.get("bypass_mode", "unknown"), "actorId": actor.get("actor_id")} for actor in rule.get("bypass_actors") or []], "htmlUrl": ((rule.get("_links") or {}).get("html") or {}).get("href")})
        return result

    def security() -> dict[str, str | None]:
        details = github.request(f"/repos/{org}/{name}")
        settings = details.get("security_and_analysis")
        if not settings:
            raise ValueError("security_and_analysis not returned")
        return {field: (settings.get(key) or {}).get("status") for field, key in (("advancedSecurity", "advanced_security"), ("secretScanning", "secret_scanning"), ("secretScanningPushProtection", "secret_scanning_push_protection"), ("dependabotSecurityUpdates", "dependabot_security_updates"), ("codeSecurity", "code_security"))}

    with ThreadPoolExecutor(max_workers=4) as pool:
        jobs = {key: pool.submit(try_fetch, label, function, hint) for key, label, function, hint in (("collaborators", "Collaborators", collaborators, None), ("teams", "Teams", teams, "Team access needs repository admin permission."), ("rulesets", "Rulesets", rulesets, None), ("security", "Security settings", security, "Repository security settings need admin access on the repository."))}
        sections = {key: future.result() for key, future in jobs.items()}
    return {"summary": summary, "workflows": workflows, "workflowsTruncated": truncated, "codeowners": codeowners, "codeownersErrors": (contents.get("codeowners") or {}).get("errors") or [], **sections}


def get_detail(name: str, force: bool = False) -> dict[str, Any]:
    return cached("repo-detail", name, lambda: _fetch_detail(name), force)
