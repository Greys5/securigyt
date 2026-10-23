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
