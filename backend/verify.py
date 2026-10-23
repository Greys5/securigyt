"""Probe the GitHub permissions used by the dashboard."""

from __future__ import annotations

from typing import Callable

from dotenv import load_dotenv

from .core import ROOT, GitHub, config


def main() -> None:
    load_dotenv(ROOT / ".env.local")
    settings = config()
    github = GitHub()
    org = settings["org"]
    results: list[tuple[str, str, str, str]] = []
    print(f"SecuriGit setup check — org: {org} — auth: {settings['mode']}")

    def probe(section: str, label: str, task: Callable[[], str]) -> None:
        try:
            results.append((section, label, "ok", task()))
        except Exception as exc:
            results.append((section, label, "fail", str(exc)))

    def skip(section: str, label: str, reason: str) -> None:
        results.append((section, label, "skip", reason))

    probe("Auth", "GitHub credentials", lambda: str(github.request("/rate_limit")["resources"]["core"]["remaining"]) + " core requests remaining")
    sample: list[str] = []

    def list_repos() -> str:
        rows = github.request(f"/orgs/{org}/repos", params={"per_page": 100})
        if rows:
            sample.append(next((row["name"] for row in rows if not row["archived"]), rows[0]["name"]))
        return f"{len(rows)} visible on first page; sample: {sample[0] if sample else 'none'}"

    probe("Repos", "List organization repositories", list_repos)
    probe("Repos", "GraphQL batch query", lambda: str(github.graphql("query($org: String!) { organization(login: $org) { repositories(first: 1, ownerAffiliations: OWNER) { totalCount } } }", {"org": org})[0]["organization"]["repositories"]["totalCount"]) + " repositories reachable")
    if sample:
        repo = sample[0]
        probe("Repo detail", "Contents", lambda: "readable" if github.request(f"/repos/{org}/{repo}/contents/") is not None else "empty")
        probe("Repo detail", "Administration", lambda: "default branch: " + github.request(f"/repos/{org}/{repo}")["default_branch"])
        probe("Repo detail", "Rulesets", lambda: str(len(github.request(f"/repos/{org}/{repo}/rulesets"))) + " rulesets")
        probe("Repo detail", "Collaborators", lambda: str(len(github.request(f"/repos/{org}/{repo}/collaborators", params={"per_page": 1}))) + " on first page")
    else:
        skip("Repo detail", "Per-repository probes", "No repository available to sample")
    probe("Org", "Organization settings", lambda: "plan: " + str((github.request(f"/orgs/{org}").get("plan") or {}).get("name", "unknown")))
    probe("Org", "Organization rulesets", lambda: str(len(github.request(f"/orgs/{org}/rulesets"))) + " rulesets")
    probe("Org", "Installed GitHub Apps", lambda: str(github.request(f"/orgs/{org}/installations").get("total_count", 0)) + " installations")
    probe("Org", "Fine-grained PATs", lambda: str(len(github.request(f"/orgs/{org}/personal-access-tokens", params={"per_page": 1}))) + " on first page")
    probe("Org", "Webhooks", lambda: str(len(github.request(f"/orgs/{org}/hooks", params={"per_page": 100}))) + " webhooks")
    probe("Org", "Members", lambda: str(len(github.request(f"/orgs/{org}/members", params={"per_page": 1}))) + " on first page")
    for label, endpoint in (("Dependabot alerts", "dependabot/alerts"), ("Secret scanning alerts", "secret-scanning/alerts"), ("Code scanning alerts", "code-scanning/alerts")):
        probe("Security", label, lambda endpoint=endpoint: str(len(github.request(f"/orgs/{org}/{endpoint}", params={"state": "open", "per_page": 1}))) + " on first page")
    fallback = GitHub(fallback=True)
    via = "fallback PAT" if settings.get("fallback_pat") else "primary credential"
    probe("Security", f"Audit log via {via}", lambda: str(len(fallback.request(f"/orgs/{org}/audit-log", params={"per_page": 1}))) + " on first page")
    if settings.get("fallback_pat"):
        probe("Costs", "Actions billing", lambda: str(fallback.request(f"/orgs/{org}/settings/billing/actions").get("total_minutes_used")) + " minutes used")
    else:
        skip("Costs", "Billing", "GITHUB_FALLBACK_PAT not set")

    section = ""
    icons = {"ok": "✓", "fail": "✗", "skip": "–"}
    for current, label, status, detail in results:
        if current != section:
            section = current
            print(f"\n{section}")
        print(f"  {icons[status]} {label}\n      {detail}")
    failed = sum(status == "fail" for _, _, status, _ in results)
    skipped = sum(status == "skip" for _, _, status, _ in results)
    print(f"\n{len(results) - failed - skipped} ok, {failed} failed, {skipped} skipped.")


if __name__ == "__main__":
    main()
