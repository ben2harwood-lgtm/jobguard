import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { PracticeAccessError } from "@jobguard/db";
import { readInboxDashboard } from "../../../lib/inbox-metrics-server";
import { syntheticPool } from "../../../lib/synthetic-server";
import { InboxMetricsDashboard } from "../../../ui/inbox-metrics-dashboard";

export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  const sessionId = (await cookies()).get("jg_session")?.value;
  if (!sessionId) redirect("/classic");
  let view;
  try { view = await readInboxDashboard(syntheticPool(), sessionId, (await params).id); }
  catch (error) {
    if (error instanceof PracticeAccessError) notFound();
    return <main><h1>Signal-to-noise dashboard</h1><p role="alert">Metrics are unavailable. Reload to try again.</p></main>;
  }
  return <InboxMetricsDashboard view={view} />;
}
