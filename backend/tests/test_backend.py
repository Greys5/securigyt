import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend import core
from backend.assessment import assess_repository
from backend.parsers import classify_ref, parse_codeowners, parse_workflow
from backend.scoring import compute_score


def repository():
    return {
        "name": "example", "defaultBranch": "main", "rulesets": [],
        "branchProtection": None, "defaultBranchProtected": False,
        "protectionSource": "none", "hasCodeowners": False,
        "codeownersErrorCount": 0, "codeowners": None,
        "dependabotAlertsEnabled": False, "hasSecurityPolicy": False,
    }


class ParserTests(unittest.TestCase):
    def test_codeowners_classifies_owners_and_ignores_comments(self):
        result = parse_codeowners("# comment\n* @org/team @person a@example.com # note\n")
        self.assertEqual(result["ruleCount"], 1)
        self.assertEqual(result["teams"], ["@org/team"])
        self.assertEqual(result["users"], ["@person"])
        self.assertEqual(result["emails"], ["a@example.com"])

    def test_workflow_keeps_on_trigger_and_distinguishes_pins(self):
        workflow = parse_workflow("ci.yml", "on: [pull_request_target]\njobs:\n  build:\n    steps:\n      - uses: actions/checkout@v4\n      - uses: org/tool@0123456789abcdef0123456789abcdef01234567\n")
        self.assertEqual(workflow["riskyTriggers"], ["pull_request_target"])
        self.assertFalse(workflow["uses"][0]["pinned"])
        self.assertTrue(workflow["uses"][1]["pinned"])
        self.assertEqual(classify_ref("main")["type"], "branch")


class LogicTests(unittest.TestCase):
    def test_unknown_checks_do_not_lower_score(self):
        score = compute_score(repository())
        self.assertEqual(score["applicableWeight"], 14)
        self.assertEqual(next(check for check in score["checks"] if check["id"] == "actions-pinned")["status"], "unknown")
        self.assertEqual(next(check for check in score["checks"] if check["id"] == "codeowners-valid")["status"], "n/a")

    def test_complex_ruleset_scope_stays_not_assessed(self):
        repo = repository()
        repo["rulesets"] = [{"target": "BRANCH", "enforcement": "ACTIVE", "includes": ["refs/heads/release/*"], "excludes": [], "ruleTypes": ["PULL_REQUEST"], "pullRequest": {"requiredApprovingReviewCount": 1}, "bypassActors": []}]
        approval = assess_repository(repo)[0]
        self.assertEqual(approval["status"], "not assessed")

    def test_cache_falls_back_to_stale_snapshot(self):
        with tempfile.TemporaryDirectory() as temporary:
            with patch.object(core, "DB_PATH", Path(temporary) / "cache.db"), patch.dict(core.TTL_MS, {"org-repos": -1}):
                first = core.cached("org-repos", "example", lambda: {"ok": True})
                second = core.cached("org-repos", "example", lambda: 1 / 0)
                self.assertEqual(first["value"], second["value"])
                self.assertTrue(second["stale"])


if __name__ == "__main__":
    unittest.main()
