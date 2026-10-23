export type AssessmentStatus = "observed" | "gap" | "conditional" | "not assessed";
export type AssessmentFinding = {
  repo: string; control: string; status: AssessmentStatus; evidence: string;
  csa: string; stride: string; stage: string; remediation: string;
};

export function assessmentCsv(findings: AssessmentFinding[]): string {
  const keys: (keyof AssessmentFinding)[] = ["repo", "control", "status", "evidence", "csa", "stride", "stage", "remediation"];
  const cell = (value: string) => `"${(/^[=+@\-\t\r]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
  return "\uFEFF" + [keys.map(cell).join(","), ...findings.map((f) => keys.map((k) => cell(f[k])).join(","))].join("\r\n");
}
