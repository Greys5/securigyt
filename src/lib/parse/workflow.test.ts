import { describe, expect, it } from "vitest";
import { parseWorkflow, classifyRef } from "./workflow";

describe("classifyRef", () => {
  it("recognizes a full commit SHA as pinned", () => {
    const ref = classifyRef("11bd71901bbe5b1630ceea73d27597364c9af683");
    expect(ref).toEqual({ ref: "11bd71901bbe5b1630ceea73d27597364c9af683", type: "sha", pinned: true });
  });

  it("rejects a short SHA — GitHub does not treat it as an immutable pin", () => {
    expect(classifyRef("11bd719").type).toBe("branch");
  });

  it("recognizes semver-ish tags", () => {
    expect(classifyRef("v4").type).toBe("tag");
    expect(classifyRef("v2.5.0").type).toBe("tag");
    expect(classifyRef("0.2").type).toBe("tag");
    expect(classifyRef("v1.2.3-beta.1").type).toBe("tag");
  });

  it("treats anything else as a branch", () => {
    expect(classifyRef("main").type).toBe("branch");
    expect(classifyRef("release/next").type).toBe("branch");
  });

  it("marks a missing ref as unversioned", () => {
    expect(classifyRef(null)).toEqual({ ref: null, type: "none", pinned: false });
  });
});

describe("parseWorkflow", () => {
  const yaml = `
name: CI
on:
  pull_request:
    branches: ["main"]
  workflow_dispatch:
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: third/party@11bd71901bbe5b1630ceea73d27597364c9af683
        with:
          key: value
      - name: local step
        uses: ./.github/actions/setup
      - name: docker step
        uses: docker://alpine:3.19
      - run: npm test
  call:
    uses: my-org/reusable/.github/workflows/deploy.yml@main
    secrets: inherit
`;

  const wf = parseWorkflow("ci.yml", yaml);

  it("extracts workflow metadata", () => {
    expect(wf.file).toBe("ci.yml");
    expect(wf.name).toBe("CI");
    expect(wf.triggers).toEqual(["pull_request", "workflow_dispatch"]);
    expect(wf.permissions).toEqual({ contents: "read" });
    expect(wf.parseError).toBeNull();
  });

  it("finds every uses: reference across steps and reusable job calls", () => {
    expect(wf.uses.map((u) => u.raw)).toEqual([
      "actions/checkout@v4",
      "third/party@11bd71901bbe5b1630ceea73d27597364c9af683",
      "./.github/actions/setup",
      "docker://alpine:3.19",
      "my-org/reusable/.github/workflows/deploy.yml@main",
    ]);
  });

  it("classifies action identity and pinning", () => {
    const [checkout, thirdParty, local, docker, reusable] = wf.uses;

    expect(checkout).toMatchObject({
      kind: "action",
      owner: "actions",
      name: "actions/checkout",
      ref: "v4",
      refType: "tag",
      pinned: false,
      firstParty: true,
      job: "build",
    });

    expect(thirdParty).toMatchObject({ pinned: true, refType: "sha", firstParty: false });
    expect(local).toMatchObject({ kind: "local", pinned: true, name: "./.github/actions/setup" });
    expect(docker).toMatchObject({ kind: "docker", firstParty: false });
    expect(reusable).toMatchObject({
      kind: "reusable-workflow",
      owner: "my-org",
      name: "my-org/reusable",
      path: ".github/workflows/deploy.yml",
      refType: "branch",
      pinned: false,
    });
  });

  it("records job-level permissions", () => {
    expect(wf.jobs).toEqual([
      { name: "build", permissions: { contents: "read", "id-token": "write" } },
      { name: "call", permissions: null },
    ]);
  });

  it("flags risky triggers", () => {
    const risky = parseWorkflow("r.yml", "on: pull_request_target\njobs: {}\n");
    expect(risky.triggers).toEqual(["pull_request_target"]);
    expect(risky.riskyTriggers).toEqual(["pull_request_target"]);
    expect(wf.riskyTriggers).toEqual([]);
  });

  it("handles the shorthand list and string trigger forms", () => {
    expect(parseWorkflow("a.yml", "on: [push, pull_request]\njobs: {}\n").triggers).toEqual([
      "push",
      "pull_request",
    ]);
    expect(parseWorkflow("b.yml", "on: push\njobs: {}\n").triggers).toEqual(["push"]);
  });

  it("does not crash on malformed YAML", () => {
    const broken = parseWorkflow("bad.yml", "name: [unclosed\n");
    expect(broken.parseError).toBeTruthy();
    expect(broken.uses).toEqual([]);
  });

  it("ignores a workflow whose jobs are not a mapping", () => {
    const odd = parseWorkflow("odd.yml", "name: x\njobs: notamap\n");
    expect(odd.uses).toEqual([]);
    expect(odd.parseError).toBeNull();
  });
});
