import { PilotJobs } from "../../../pilot-jobs";
import { DesignedJob } from "../../../jobs-screens";

export const dynamic = "force-dynamic";
export const metadata = { title: "JobGuard · Job overview" };
export default async function JobOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (process.env.JOBGUARD_ENV === "pilot_no_charge") return <PilotJobs screen="review" jobId={id}/>;
  return <DesignedJob jobId={id} tab="overview"/>;
}
