import { SetupNotice } from "@/components/SetupNotice";
import { getCachedInventory, getRepoInventory, getBackendConfig } from "@/lib/backendClient";
import { GovernanceReport } from "./GovernanceReport";

export const dynamic = "force-dynamic";

export default async function GovernanceReportPage() {
  const settings = await getBackendConfig();
  if (!settings.configured) {
    return <SetupNotice message="The governance report needs GitHub App credentials." />;
  }

  const { org } = settings;
  const cachedInventory = await getCachedInventory(org);
  const snapshot = cachedInventory ?? await getRepoInventory();

  return <GovernanceReport repos={snapshot.value.repos} org={snapshot.value.org} fetchedAt={snapshot.fetchedAt} stale={snapshot.stale} />;
}
