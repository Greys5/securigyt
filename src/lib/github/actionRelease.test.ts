import { expect, it } from "vitest";
import { parseActionRepository, resolveActionRelease } from "./actionRelease";

it("resolves annotated tags and preserves action subpaths", async () => {
  const sha = "a".repeat(40);
  const result = await resolveActionRelease("org/repo/subaction", async (path) => {
    if (path.endsWith("/latest")) return { tag_name: "v2.1.0", draft: false, prerelease: false, immutable: false };
    if (path.includes("/ref/")) return { object: { type: "tag", sha: "b".repeat(40) } };
    return { object: { type: "commit", sha } };
  });
  expect(result.pin).toBe(`org/repo/subaction@${sha} # v2.1.0`);
  expect(result.immutable).toBe(false);
});

it("rejects prereleases and unsafe references", async () => {
  await expect(resolveActionRelease("org/repo", async () => ({ tag_name: "v3-beta", prerelease: true }))).rejects.toThrow("stable");
  expect(() => parseActionRepository("org/../repo")).toThrow();
});

it("accepts lightweight tags and reports missing immutability as unknown", async () => {
  const result = await resolveActionRelease("org/repo", async (path) => path.endsWith("/latest") ? { tag_name: "v1", draft: false, prerelease: false } : { object: { type: "commit", sha: "a".repeat(40) } });
  expect(result.immutable).toBe(null);
});
