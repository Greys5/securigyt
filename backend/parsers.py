"""Parsers for CODEOWNERS and GitHub Actions workflows."""

from __future__ import annotations

import re
from typing import Any

import yaml


def parse_codeowners(text: str) -> dict[str, Any]:
    owners: set[str] = set()
    teams: set[str] = set()
    users: set[str] = set()
    emails: set[str] = set()
    rules: list[dict[str, Any]] = []
    for line in text.splitlines():
        trimmed = re.sub(r"\s+#.*$", "", line).strip()
        if not trimmed or trimmed.startswith("#"):
            continue
        parts = trimmed.split()
        if len(parts) < 2:
            continue
        pattern, rule_owners = parts[0], parts[1:]
        rules.append({"pattern": pattern, "owners": rule_owners})
        for owner in rule_owners:
            owners.add(owner)
            if re.fullmatch(r"@[^/\s]+/[^/\s]+", owner):
                teams.add(owner)
            elif re.fullmatch(r"@[^@/\s]+", owner):
                users.add(owner)
            elif re.fullmatch(r"[^\s@]+@[^\s@]+", owner):
                emails.add(owner)
    return {"ruleCount": len(rules), "owners": sorted(owners), "teams": sorted(teams), "users": sorted(users), "emails": sorted(emails), "rules": rules}


def classify_ref(ref: str | None) -> dict[str, Any]:
    if not ref:
        return {"ref": None, "type": "none", "pinned": False}
    if re.fullmatch(r"[0-9a-f]{40}", ref, re.I):
        return {"ref": ref, "type": "sha", "pinned": True}
    if re.fullmatch(r"v?\d+(\.\d+)*([-+][0-9A-Za-z.-]+)?", ref):
        return {"ref": ref, "type": "tag", "pinned": False}
    return {"ref": ref, "type": "branch", "pinned": False}


def parse_uses(raw: str, job: str, step: str | None) -> dict[str, Any]:
    value = raw.strip()
    if value.startswith("docker://"):
        return {"raw": value, "kind": "docker", "name": value[9:], "owner": None, "path": None, "ref": None, "refType": "none", "pinned": False, "firstParty": False, "job": job, "step": step}
    if value.startswith(("./", "../")):
        return {"raw": value, "kind": "local", "name": value, "owner": None, "path": value, "ref": None, "refType": "none", "pinned": True, "firstParty": False, "job": job, "step": step}
    identity, sep, ref = value.rpartition("@")
    if not sep or not identity:
        identity, ref = value, None
    info = classify_ref(ref)
    segments = identity.split("/")
    owner = segments[0] if segments else None
    repo = segments[1] if len(segments) > 1 else None
    path = "/".join(segments[2:]) if len(segments) > 2 else None
    return {"raw": value, "kind": "reusable-workflow" if path and path.startswith(".github/workflows/") else "action", "name": f"{owner}/{repo}" if owner and repo else identity, "owner": owner, "path": path, "ref": info["ref"], "refType": info["type"], "pinned": info["pinned"], "firstParty": bool(owner and owner.lower() in ("actions", "github")), "job": job, "step": step}


def _permissions(value: Any) -> dict[str, str] | str | None:
    if value in ("read-all", "write-all"):
        return value
    if not isinstance(value, dict):
        return None
    return {str(key): level for key, level in value.items() if isinstance(level, str)}


def parse_workflow(file: str, contents: str) -> dict[str, Any]:
    empty: dict[str, Any] = {"file": file, "name": None, "triggers": [], "riskyTriggers": [], "permissions": None, "jobs": [], "uses": [], "parseError": None}
    try:
        doc = yaml.load(contents, Loader=yaml.BaseLoader)
    except yaml.YAMLError as exc:
        return {**empty, "parseError": str(exc)}
    if not isinstance(doc, dict):
        return empty
    on = doc.get("on")
    triggers = [on] if isinstance(on, str) else [x for x in on if isinstance(x, str)] if isinstance(on, list) else list(on) if isinstance(on, dict) else []
    jobs: list[dict[str, Any]] = []
    uses: list[dict[str, Any]] = []
    if isinstance(doc.get("jobs"), dict):
        for job_name, job in doc["jobs"].items():
            if not isinstance(job, dict):
                continue
            jobs.append({"name": job_name, "permissions": _permissions(job.get("permissions"))})
            if isinstance(job.get("uses"), str):
                uses.append(parse_uses(job["uses"], job_name, None))
            if isinstance(job.get("steps"), list):
                for step in job["steps"]:
                    if isinstance(step, dict) and isinstance(step.get("uses"), str):
                        uses.append(parse_uses(step["uses"], job_name, step.get("name") if isinstance(step.get("name"), str) else None))
    return {"file": file, "name": doc.get("name") if isinstance(doc.get("name"), str) else None, "triggers": triggers, "riskyTriggers": [trigger for trigger in triggers if trigger in ("pull_request_target", "workflow_run")], "permissions": _permissions(doc.get("permissions")), "jobs": jobs, "uses": uses, "parseError": None}
