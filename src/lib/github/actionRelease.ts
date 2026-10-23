export type ActionRelease = {
  tag: string;
  sha: string;
  immutable: boolean | null;
  releaseUrl: string;
  pin: string;
  checkedAt: string;
};
