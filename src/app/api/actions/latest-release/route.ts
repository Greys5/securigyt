import { BackendError, getLatestRelease } from "@/lib/backendClient";

export async function GET(request: Request) {
  const action = new URL(request.url).searchParams.get("action");
  if (!action) return Response.json({ error: "Select a GitHub action in the scanned inventory." }, { status: 400 });
  try {
    const result = await getLatestRelease(action);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BackendError && error.status === 400) return Response.json({ error: "Select a GitHub action in the scanned inventory." }, { status: 400 });
    if (error instanceof BackendError && error.status === 503) return Response.json({ error: "Configure GitHub credentials first." }, { status: 503 });
    return Response.json({ error: "Could not resolve the latest stable release and commit SHA." }, { status: 502 });
  }
}
