import { SetupNotice } from "@/components/SetupNotice";
import { readCache } from "@/lib/cache";
import { getConfig, isConfigured } from "@/lib/config";
import { getRepoInventory, type RepoInventory } from "@/lib/github/collectors/repos";
import { GovernanceReport } from "./GovernanceReport";

export const dynamic = "force-dynamic";

export default async function GovernanceReportPage() {
  if (!isConfigured()) {
    return <SetupNotice message="The governance report needs GitHub App credentials." />;
  }

  const { org } = getConfig();
  const cachedInventory = readCache<RepoInventory>("org-repos", org);
  const snapshot = cachedInventory ?? await getRepoInventory();

  return <GovernanceReport repos={snapshot.value.repos} org={snapshot.value.org} fetchedAt={snapshot.fetchedAt} stale={snapshot.stale} />;
}
