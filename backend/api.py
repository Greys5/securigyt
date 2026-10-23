"""Local JSON API consumed by the Next.js UI."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

from .actions import get_actions, latest_release
from .assessment import assess_inventory
from .core import DB_PATH, TTL_MS, GitHubError, config, invalidate, is_configured, read_cache
from .org import get_org
from .repos import get_detail, get_inventory
from .scoring import compute_score, get_posture
from .security import get_security

load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")
app = FastAPI(title="SecuriGit backend", docs_url=None, redoc_url=None)


class RefreshRequest(BaseModel):
    scopes: list[str] = []
    key: str | None = None


@app.get("/health")
def health():
    return {"ok": True, "configured": is_configured()}


@app.get("/config")
def public_config():
    if not is_configured():
        return {"configured": False, "org": None}
    return {"configured": True, "org": config()["org"]}


@app.get("/inventory")
def inventory(force: bool = False):
    return get_inventory(force)


@app.get("/org")
def organization(force: bool = False):
    return get_org(force)


@app.get("/security")
def security(force: bool = False):
    return get_security(force)


@app.get("/actions")
def actions(force: bool = False):
    return get_actions(force)


@app.get("/posture")
def posture():
    return get_posture()


@app.get("/assessment")
def assessment():
    return assess_inventory(get_inventory()["value"]["repos"])


@app.get("/repos/{name}")
def repository(name: str, force: bool = False):
    try:
        snapshot = get_detail(name, force)
        detail = snapshot["value"]
        uses = [use for workflow in detail["workflows"] for use in workflow["uses"]]
        collaborators = detail["collaborators"]
        settings = detail["security"]
        score = compute_score(
            detail["summary"],
            {"total": len(uses), "unpinned": sum(not use["pinned"] and use["kind"] != "docker" for use in uses)},
            security={"secretScanning": settings["data"]["secretScanning"] == "enabled", "pushProtection": settings["data"]["secretScanningPushProtection"] == "enabled"} if settings["available"] else None,
            admin_collaborators=sum(row["admin"] for row in collaborators["data"]) if collaborators["available"] else None,
        )
        return {**snapshot, "value": {**detail, "score": score}}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/cache/{scope}")
def cache_entry(scope: str, key: str):
    if scope not in TTL_MS:
        raise HTTPException(status_code=404, detail="Unknown cache scope")
    return read_cache(scope, key)


@app.post("/refresh")
def refresh(body: RefreshRequest):
    scopes = [scope for scope in body.scopes if scope in TTL_MS]
    return {"cleared": invalidate(scopes, body.key), "scopes": scopes or "all"}


@app.get("/actions/latest-release")
def action_release(action: str = Query(min_length=3)):
    if not is_configured():
        raise HTTPException(status_code=503, detail="Configure GitHub credentials first.")
    inventory_cache = read_cache("repo-workflows", config()["org"])
    entry = next((item for item in (inventory_cache or {}).get("value", {}).get("actions", []) if item["name"] == action), None)
    if not entry or entry["kind"] not in ("action", "reusable-workflow"):
        raise HTTPException(status_code=400, detail="Select a GitHub action in the scanned inventory.")
    try:
        return latest_release(action)
    except (GitHubError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
