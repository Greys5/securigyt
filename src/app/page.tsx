import Link from "next/link";
import { isConfigured } from "@/lib/config";
import { SetupNotice } from "@/components/SetupNotice";

export const dynamic = "force-dynamic";

/** Placeholder overview — replaced by the full rollup in a later phase. */
export default function Home() {
  if (!isConfigured()) {
    return <SetupNotice message="SecuriGit needs GitHub App credentials to read your org." />;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
      <p className="text-sm text-muted">
        Start with the{" "}
        <Link href="/repos" className="text-info hover:underline">
          repository inventory
        </Link>
        .
      </p>
    </div>
  );
}
