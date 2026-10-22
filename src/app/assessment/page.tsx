import { readCache } from "@/lib/cache";
import { getConfig, isConfigured } from "@/lib/config";
import type { RepoInventory } from "@/lib/github/collectors/repos";
import { SetupNotice } from "@/components/SetupNotice";
import { Assessment } from "./Assessment";

export const dynamic = "force-dynamic";

export default function AssessmentPage() {
  if (!isConfigured()) return <SetupNotice message="Configure the GitHub App to assess repository evidence." />;
  const { org } = getConfig();
  const snapshot = readCache<RepoInventory>("org-repos", org);
  if (!snapshot) return <SetupNotice message="No repository snapshot is available. Run a repository scan first." />;
  return <Assessment repos={snapshot.value.repos} org={org} fetchedAt={snapshot.fetchedAt} stale={snapshot.stale} />;
}
