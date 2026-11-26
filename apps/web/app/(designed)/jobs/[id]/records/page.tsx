import { PilotJobs } from "../../../pilot-jobs";
import { DesignedJob } from "../../../jobs-screens";
import { CustomerMessages, JobDiary } from "../../../../ui/job-sources";

export const metadata = { title: "JobGuard · Job records" };
export default async function JobRecordsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (process.env.JOBGUARD_ENV === "pilot_no_charge") return <PilotJobs screen="review" jobId={id}/>;
  return <DesignedJob jobId={id} tab="records">{/* V2-G1 mount: one link to Snags. */}{process.env.JOBGUARD_LOCAL_V2 === "1" && <p><a href={`/jobs/${id}/snags`}>Snags</a>{/* V2-G2 mount: one link to Handover. */} · <a href={`/jobs/${id}/handover`}>Handover</a></p>}<JobDiary jobId={id} extrasHref={`/jobs/${id}/work#variations-title`}/><CustomerMessages jobId={id}/></DesignedJob>;
}
