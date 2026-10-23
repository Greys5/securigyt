export type ActionRelease = {
  tag: string;
  sha: string;
  immutable: boolean | null;
  releaseUrl: string;
  pin: string;
  checkedAt: string;
};

export function parseActionRepository(action: string) {
  const parts = action.split("/");
  if (parts.length < 2 || parts.some((p) => !/^[A-Za-z0-9_.-]+$/.test(p) || p === "." || p === "..")) throw new Error("Invalid GitHub action reference.");
  return { owner: parts[0], repo: parts[1] };
}

export async function resolveActionRelease(action: string, read: (path: string) => Promise<unknown>): Promise<ActionRelease> {
  const { owner, repo } = parseActionRepository(action);
  const base = `/repos/${owner}/${repo}`;
  const release = await read(`${base}/releases/latest`) as { tag_name: string; draft: boolean; prerelease: boolean; immutable?: boolean };
  if (!release.tag_name || release.draft || release.prerelease) throw new Error("No stable published release is available.");
  let object = (await read(`${base}/git/ref/tags/${encodeURIComponent(release.tag_name)}`) as { object: { type: string; sha: string } }).object;
  for (let depth = 0; object.type === "tag" && depth < 10; depth++) {
    object = (await read(`${base}/git/tags/${object.sha}`) as { object: { type: string; sha: string } }).object;
  }
  if (object.type !== "commit" || !/^[a-f0-9]{40}$/i.test(object.sha)) throw new Error("Release tag could not be resolved to a commit SHA.");
  return {
    tag: release.tag_name, sha: object.sha,
    immutable: typeof release.immutable === "boolean" ? release.immutable : null,
    releaseUrl: `https://github.com/${owner}/${repo}/releases/tag/${encodeURIComponent(release.tag_name)}`,
    pin: `${action}@${object.sha} # ${release.tag_name}`,
    checkedAt: new Date().toISOString(),
  };
}
