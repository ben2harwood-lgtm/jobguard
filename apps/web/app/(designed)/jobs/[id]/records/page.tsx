import { PilotJobs } from "../../../pilot-jobs";
import { DesignedJob } from "../../../jobs-screens";
import { CustomerMessages, JobDiary } from "../../../../ui/job-sources";
// F8 mount: card only.
import { SiteAttendanceCard } from "../../../../ui/v2-site-attendance";

export const metadata = { title: "JobGuard · Job records" };
export default async function JobRecordsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (process.env.JOBGUARD_ENV === "pilot_no_charge") return <PilotJobs screen="review" jobId={id}/>;
  return <DesignedJob jobId={id} tab="records">{process.env.JOBGUARD_LOCAL_V2 === "1" && <SiteAttendanceCard key={id} jobId={id}/>}<JobDiary jobId={id} extrasHref={`/jobs/${id}/work#variations-title`}/><CustomerMessages jobId={id}/></DesignedJob>;
}
