import { getAssessment, getCachedInventory, getBackendConfig } from "@/lib/backendClient";
import { SetupNotice } from "@/components/SetupNotice";
import { Assessment } from "./Assessment";

export const dynamic = "force-dynamic";

export default async function AssessmentPage() {
  const settings = await getBackendConfig();
  if (!settings.configured) return <SetupNotice message="Configure the GitHub App to assess repository evidence." />;
  const { org } = settings;
  const snapshot = await getCachedInventory(org);
  if (!snapshot) return <SetupNotice message="No repository snapshot is available. Run a repository scan first." />;
  const findings = await getAssessment();
  return <Assessment findings={findings} org={org} fetchedAt={snapshot.fetchedAt} stale={snapshot.stale} />;
}
