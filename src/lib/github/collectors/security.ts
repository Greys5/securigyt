import type { Maybe } from "@/lib/github/client";
export type Severity = "critical" | "high" | "medium" | "low" | "unknown";

export const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "unknown"];

export type SeverityCounts = Record<Severity, number>;

export type RepoAlertCounts = {
  repo: string;
  total: number;
  counts: SeverityCounts;
};

export type AlertsSummary = {
  total: number;
  counts: SeverityCounts;
  byRepo: RepoAlertCounts[];
  /** Set when the cap above was hit, so the UI can say the numbers are partial. */
  truncated: boolean;
};

export type SecretAlert = {
  repo: string;
  secretType: string;
  createdAt: string | null;
  pushProtectionBypassed: boolean;
  htmlUrl: string | null;
  validity: string | null;
};

export type SecretScanningSummary = {
  total: number;
  byRepo: RepoAlertCounts[];
  byType: { type: string; count: number }[];
  bypassedCount: number;
  alerts: SecretAlert[];
  truncated: boolean;
};

export type AuditEntry = {
  action: string;
  actor: string | null;
  repo: string | null;
  createdAt: string | null;
};

export type BillingUsage = {
  actionsMinutesUsed: number | null;
  actionsPaidMinutesUsed: number | null;
  actionsIncludedMinutes: number | null;
  packagesBytes: number | null;
  storageDaysUsed: number | null;
  storageEstimatedPaid: number | null;
};

export type SecurityOverview = {
  dependabot: Maybe<AlertsSummary>;
  codeScanning: Maybe<AlertsSummary>;
  secretScanning: Maybe<SecretScanningSummary>;
  auditLog: Maybe<AuditEntry[]>;
  billing: Maybe<BillingUsage>;
};
