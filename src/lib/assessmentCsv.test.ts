import { expect, it } from "vitest";
import { assessmentCsv } from "./securityAssessment";

it("protects spreadsheet exports from formula injection", () => {
  expect(assessmentCsv([{ repo: "=HYPERLINK()", control: "Review", status: "gap", evidence: "missing", csa: "Change", stride: "Tampering", stage: "Review", remediation: "Add approval" }])).toContain("'=HYPERLINK()");
});
