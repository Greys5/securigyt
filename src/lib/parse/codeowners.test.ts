import { describe, expect, it } from "vitest";
import { parseCodeowners } from "./codeowners";

describe("parseCodeowners", () => {
  it("normalizes rules and owner attribution without exposing comments", () => {
    const parsed = parseCodeowners(`
# Global ownership
* @acme/platform @jdoe
/docs/ docs@example.com # documentation owners
/infra/ @acme/platform
`);

    expect(parsed.ruleCount).toBe(3);
    expect(parsed.teams).toEqual(["@acme/platform"]);
    expect(parsed.users).toEqual(["@jdoe"]);
    expect(parsed.emails).toEqual(["docs@example.com"]);
    expect(parsed.rules[1]).toEqual({ pattern: "/docs/", owners: ["docs@example.com"] });
  });
});
