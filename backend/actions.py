"""Organization Actions inventory and stable release lookup."""

from __future__ import annotations

import json
import re
import httpx
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

from .core import GitHub, GitHubError, cached, config
from .parsers import parse_workflow
from .repos import get_inventory


def _fetch_actions() -> dict[str, Any]:
    org = config()["org"]
    targets = [repo for repo in get_inventory()["value"]["repos"] if not repo["archived"] and repo["workflowFiles"]]
    errors: list[str] = []
    parsed: list[tuple[str, str, dict[str, Any]]] = []

    def batch(repos: list[dict[str, Any]]) -> tuple[list[tuple[str, str, dict[str, Any]]], list[str]]:
        selections = []
        for ri, repo in enumerate(repos):
            files = "\n".join(f'f{fi}: object(expression: {json.dumps("HEAD:.github/workflows/" + file)}) {{ ... on Blob {{ text isTruncated }} }}' for fi, file in enumerate(repo["workflowFiles"]))
            selections.append(f'r{ri}: repository(owner: $org, name: {json.dumps(repo["name"])}) {{ {files} }}')
        data, issues = GitHub().graphql('query($org: String!) { ' + '\n'.join(selections) + ' }', {"org": org})
        found: list[tuple[str, str, dict[str, Any]]] = []
        for ri, repo in enumerate(repos):
            contents = data.get(f"r{ri}")
            if not contents:
                issues.append(f'{repo["name"]}: workflow contents unavailable')
                continue
            for fi, file in enumerate(repo["workflowFiles"]):
                blob = contents.get(f"f{fi}")
                if blob and blob.get("text"):
                    found.append((repo["name"], file, parse_workflow(file, blob["text"])))
        return found, issues

    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = [pool.submit(batch, targets[i:i + 8]) for i in range(0, len(targets), 8)]
        for future in as_completed(futures):
            found, issues = future.result()
            parsed.extend(found)
            errors.extend(issues)

    actions: dict[str, dict[str, Any]] = {}
    flagged: list[dict[str, Any]] = []
    total_refs = 0
    unpinned_refs = 0
    for repo, file, workflow in parsed:
        for reason, detail in (("Parse error", workflow["parseError"]), ("Risky trigger", f'{", ".join(workflow["riskyTriggers"])} runs with repository secrets in a fork context' if workflow["riskyTriggers"] else None), ("Broad token permissions", "Workflow requests write-all" if workflow["permissions"] == "write-all" else None)):
            if detail:
                flagged.append({"repo": repo, "workflow": file, "name": workflow["name"], "reason": reason, "detail": detail})
        for use in workflow["uses"]:
            total_refs += 1
            not_pinned = not use["pinned"] and use["kind"] != "docker"
            unpinned_refs += int(not_pinned)
            entry = actions.setdefault(use["name"], {"name": use["name"], "kind": use["kind"], "firstParty": use["firstParty"], "totalRefs": 0, "repoCount": 0, "unpinnedRefs": 0, "versions": [], "sites": []})
            entry["totalRefs"] += 1
            entry["unpinnedRefs"] += int(not_pinned)
            entry["sites"].append({"repo": repo, "workflow": file, "job": use["job"], "step": use["step"], "ref": use["ref"], "refType": use["refType"], "pinned": use["pinned"]})
            version = next((item for item in entry["versions"] if item["ref"] == use["ref"]), None)
            if not version:
                version = {"ref": use["ref"], "refType": use["refType"], "pinned": use["pinned"], "count": 0, "repos": []}
                entry["versions"].append(version)
            version["count"] += 1
            if repo not in version["repos"]:
                version["repos"].append(repo)
    listing = list(actions.values())
    for entry in listing:
        entry["repoCount"] = len({site["repo"] for site in entry["sites"]})
        entry["versions"].sort(key=lambda version: -version["count"])
    listing.sort(key=lambda entry: (-entry["totalRefs"], entry["name"]))
    return {"scannedRepos": len(targets), "workflowCount": len(parsed), "totalRefs": total_refs, "unpinnedRefs": unpinned_refs, "distinctActions": len(listing), "actions": listing, "flagged": sorted(flagged, key=lambda item: item["repo"]), "errors": errors}


def get_actions(force: bool = False) -> dict[str, Any]:
    return cached("repo-workflows", config()["org"], _fetch_actions, force)


def parse_action_repository(action: str) -> tuple[str, str]:
    parts = action.split("/")
    if len(parts) < 2 or any(not re.fullmatch(r"[A-Za-z0-9_.-]+", part) or part in (".", "..") for part in parts):
        raise ValueError("Invalid GitHub action reference.")
    return parts[0], parts[1]


def latest_release(action: str) -> dict[str, Any]:
    owner, repo = parse_action_repository(action)
    github = GitHub()
    base = f"/repos/{owner}/{repo}"

    def read(path: str) -> Any:
        try:
            return github.request(path)
        except GitHubError as exc:
            if exc.status not in (403, 404):
                raise
            response = httpx.get("https://api.github.com" + path, headers={"Accept": "application/vnd.github+json"}, timeout=15)
            if response.status_code >= 400:
                raise GitHubError(response.status_code, "GitHub lookup failed") from exc
            return response.json()

    release = read(f"{base}/releases/latest")
    if not release.get("tag_name") or release.get("draft") or release.get("prerelease"):
        raise ValueError("No stable published release is available.")
    tag = release["tag_name"]
    obj = read(f"{base}/git/ref/tags/{quote(tag, safe='')}")["object"]
    for _ in range(10):
        if obj["type"] != "tag":
            break
        obj = read(f"{base}/git/tags/{obj['sha']}")["object"]
    if obj["type"] != "commit" or not re.fullmatch(r"[a-f0-9]{40}", obj["sha"], re.I):
        raise ValueError("Release tag could not be resolved to a commit SHA.")
    return {"tag": tag, "sha": obj["sha"], "immutable": release.get("immutable") if isinstance(release.get("immutable"), bool) else None, "releaseUrl": f"https://github.com/{owner}/{repo}/releases/tag/{quote(tag, safe='')}", "pin": f"{action}@{obj['sha']} # {tag}", "checkedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}
