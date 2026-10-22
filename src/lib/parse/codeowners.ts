export type CodeownerRule = {
  pattern: string;
  owners: string[];
};

export type ParsedCodeowners = {
  ruleCount: number;
  owners: string[];
  teams: string[];
  users: string[];
  emails: string[];
  rules: CodeownerRule[];
};

/** Parse CODEOWNERS into report-friendly rows without exposing the raw file. */
export function parseCodeowners(text: string): ParsedCodeowners {
  const owners = new Set<string>();
  const teams = new Set<string>();
  const users = new Set<string>();
  const emails = new Set<string>();
  const rules: CodeownerRule[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.replace(/\s+#.*$/, "").trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const [pattern, ...ruleOwners] = trimmed.split(/\s+/);
    if (!pattern || ruleOwners.length === 0) continue;

    rules.push({ pattern, owners: ruleOwners });
    for (const owner of ruleOwners) {
      owners.add(owner);
      if (/^@[^/\s]+\/[^/\s]+$/.test(owner)) teams.add(owner);
      else if (/^@[^@/\s]+$/.test(owner)) users.add(owner);
      else if (/^[^\s@]+@[^\s@]+$/.test(owner)) emails.add(owner);
    }
  }

  const sorted = (values: Set<string>) => [...values].sort((a, b) => a.localeCompare(b));
  return {
    ruleCount: rules.length,
    owners: sorted(owners),
    teams: sorted(teams),
    users: sorted(users),
    emails: sorted(emails),
    rules,
  };
}
