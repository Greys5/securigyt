"""Configuration, GitHub access, and the shared SQLite cache."""

from __future__ import annotations

import json
import os
import sqlite3
import time
from pathlib import Path
from threading import Lock
from typing import Any, Callable

import httpx
import jwt

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / ".data" / "cache.db"
TTL_MS = {
    "org-meta": 30 * 60_000,
    "org-repos": 15 * 60_000,
    "org-rulesets": 30 * 60_000,
    "org-apps": 30 * 60_000,
    "org-pats": 30 * 60_000,
    "org-hooks": 30 * 60_000,
    "org-members": 30 * 60_000,
    "org-alerts": 10 * 60_000,
    "org-billing": 60 * 60_000,
    "org-audit": 10 * 60_000,
    "repo-detail": 15 * 60_000,
    "repo-workflows": 15 * 60_000,
    "repo-collaborators": 15 * 60_000,
    "repo-rulesets": 15 * 60_000,
    "repo-codeowners": 15 * 60_000,
    "repo-security": 10 * 60_000,
}
_lock = Lock()
_token_lock = Lock()
_installation_tokens: dict[int, tuple[str, float]] = {}


class ConfigError(ValueError):
    pass


def config() -> dict[str, Any]:
    org = os.environ.get("GITHUB_ORG", "").strip()
    if not org:
        raise ConfigError("Missing GITHUB_ORG. Copy .env.local.example to .env.local and fill it in.")
    app_id = os.environ.get("GITHUB_APP_ID", "").strip()
    key = os.environ.get("GITHUB_APP_PRIVATE_KEY", "")
    installation = os.environ.get("GITHUB_APP_INSTALLATION_ID", "").strip()
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    if app_id or key or installation:
        missing = [name for name, value in (("GITHUB_APP_ID", app_id), ("GITHUB_APP_PRIVATE_KEY", key), ("GITHUB_APP_INSTALLATION_ID", installation)) if not value]
        if missing:
            raise ConfigError("Incomplete GitHub App configuration — missing: " + ", ".join(missing) + ".")
        try:
            installation_id = int(installation)
            if installation_id <= 0:
                raise ValueError
        except ValueError as exc:
            raise ConfigError("GITHUB_APP_INSTALLATION_ID must be a positive integer.") from exc
        return {"org": org, "mode": "app", "app_id": app_id, "key": key.replace("\\n", "\n"), "installation_id": installation_id, "fallback_pat": os.environ.get("GITHUB_FALLBACK_PAT")}
    if token:
        return {"org": org, "mode": "token", "token": token, "fallback_pat": os.environ.get("GITHUB_FALLBACK_PAT")}
    raise ConfigError("No credentials found. Set GitHub App variables or GITHUB_TOKEN.")


def is_configured() -> bool:
    try:
        config()
        return True
    except ConfigError:
        return False


def _connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=30)
    db.execute("PRAGMA journal_mode = WAL")
    db.execute("CREATE TABLE IF NOT EXISTS cache (scope TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, fetched_at INTEGER NOT NULL, PRIMARY KEY (scope, key))")
    return db


def read_cache(scope: str, key: str) -> dict[str, Any] | None:
    with _connection() as db:
        row = db.execute("SELECT value, fetched_at FROM cache WHERE scope = ? AND key = ?", (scope, key)).fetchone()
    if not row:
        return None
    try:
        return {"value": json.loads(row[0]), "fetchedAt": row[1], "stale": int(time.time() * 1000) - row[1] > TTL_MS[scope]}
    except (ValueError, KeyError):
        return None


def cached(scope: str, key: str, fetcher: Callable[[], Any], force: bool = False) -> dict[str, Any]:
    hit = read_cache(scope, key)
    if hit and not hit["stale"] and not force:
        return hit
    try:
        value = fetcher()
        fetched_at = int(time.time() * 1000)
        with _lock, _connection() as db:
            db.execute("INSERT INTO cache (scope, key, value, fetched_at) VALUES (?, ?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value, fetched_at = excluded.fetched_at", (scope, key, json.dumps(value), fetched_at))
        return {"value": value, "fetchedAt": fetched_at, "stale": False}
    except Exception:
        if hit:
            return hit
        raise


def invalidate(scopes: list[str] | None = None, key: str | None = None) -> int:
    with _lock, _connection() as db:
        if not scopes:
            cursor = db.execute("DELETE FROM cache")
            return cursor.rowcount
        total = 0
        for scope in scopes:
            if scope not in TTL_MS:
                continue
            sql = "DELETE FROM cache WHERE scope = ?" + (" AND key = ?" if key else "")
            total += db.execute(sql, (scope, key) if key else (scope,)).rowcount
        return total


class GitHubError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


class GitHub:
    def __init__(self, fallback: bool = False):
        self.settings = config()
        self.fallback = fallback
        self.client = httpx.Client(timeout=40, headers={"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"})

    def _auth_token(self) -> str:
        if self.fallback and self.settings["fallback_pat"]:
            return self.settings["fallback_pat"]
        if self.settings["mode"] == "token":
            return self.settings["token"]
        installation_id = self.settings["installation_id"]
        with _token_lock:
            token, expires = _installation_tokens.get(installation_id, ("", 0.0))
            if token and time.time() < expires - 60:
                return token
            now = int(time.time())
            signed = jwt.encode({"iat": now - 60, "exp": now + 600, "iss": self.settings["app_id"]}, self.settings["key"], algorithm="RS256")
            response = self.client.post(f"https://api.github.com/app/installations/{installation_id}/access_tokens", headers={"Authorization": f"Bearer {signed}"})
            self._check(response)
            token = response.json()["token"]
            _installation_tokens[installation_id] = (token, time.time() + 3600)
            return token

    @staticmethod
    def _check(response: httpx.Response) -> None:
        if response.status_code >= 400:
            try:
                message = response.json().get("message", response.text)
            except ValueError:
                message = response.text
            raise GitHubError(response.status_code, str(message))

    def _send(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        for attempt in range(3):
            response = self.client.request(method, url, **kwargs)
            limited = response.status_code == 429 or (
                response.status_code == 403 and (
                    response.headers.get("X-RateLimit-Remaining") == "0"
                    or "secondary rate limit" in response.text.lower()
                )
            )
            transient = response.status_code in (502, 503, 504)
            if attempt == 2 or not (limited or transient):
                return response
            try:
                delay = float(response.headers.get("Retry-After", 2 ** attempt))
            except ValueError:
                delay = float(2 ** attempt)
            time.sleep(min(max(delay, 0), 30))
        raise AssertionError("unreachable")

    def request(self, path: str, *, params: dict[str, Any] | None = None, method: str = "GET", json_body: Any = None) -> Any:
        url = path if path.startswith("https://") else "https://api.github.com" + path
        response = self._send(method, url, params=params, json=json_body, headers={"Authorization": f"Bearer {self._auth_token()}"})
        self._check(response)
        return response.json()

    def paginate(self, path: str, *, params: dict[str, Any] | None = None, cap: int | None = None) -> tuple[list[Any], bool]:
        url = path
        query = {**(params or {}), "per_page": 100}
        rows: list[Any] = []
        while url:
            response = self._send("GET", url if url.startswith("https://") else "https://api.github.com" + url, params=query, headers={"Authorization": f"Bearer {self._auth_token()}"})
            self._check(response)
            data = response.json()
            if not isinstance(data, list):
                raise ValueError(f"Expected a list from {path}")
            rows.extend(data)
            if cap and len(rows) >= cap:
                return rows[:cap], True
            url = response.links.get("next", {}).get("url")
            query = {}
        return rows, False

    def graphql(self, query: str, variables: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
        body = self.request("/graphql", method="POST", json_body={"query": query, "variables": variables})
        errors = [str(item.get("message", "GraphQL error")) for item in body.get("errors", [])]
        if not body.get("data"):
            raise GitHubError(502, "; ".join(errors) or "GraphQL returned no data")
        return body["data"], errors


def try_fetch(label: str, fetcher: Callable[[], Any], hint: str | None = None) -> dict[str, Any]:
    try:
        return {"available": True, "data": fetcher()}
    except GitHubError as exc:
        if exc.status in (401, 403):
            return {"available": False, "reason": f"{label}: access denied (HTTP {exc.status}). {exc}", "hint": hint or "Check GitHub App permissions."}
        if exc.status == 404:
            return {"available": False, "reason": f"{label}: not found or not enabled for this org/plan (HTTP 404).", "hint": hint}
        return {"available": False, "reason": f"{label}: {exc}", "hint": hint}
    except Exception as exc:
        return {"available": False, "reason": f"{label}: {exc}", "hint": hint}
