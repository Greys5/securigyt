import { describe, expect, it } from "vitest";
import { repositoryAuditHrefForCheck } from "./remediationLinks";

describe("repositoryAuditHrefForCheck", () => {
  it("routes CODEOWNERS findings to a scoped repository audit", () => {
    expect(repositoryAuditHrefForCheck("codeowners-present")).toBe("/repos?view=codeowners-missing");
    expect(repositoryAuditHrefForCheck("codeowners-valid", "api")).toBe("/repos?view=codeowners-invalid&repository=api");
    expect(repositoryAuditHrefForCheck("code-owner-review")).toBe("/repos?view=codeowner-review");
  });

  it("keeps unsupported findings on the overview", () => {
    expect(repositoryAuditHrefForCheck("actions-pinned")).toBe("/#findings");
  });
});
