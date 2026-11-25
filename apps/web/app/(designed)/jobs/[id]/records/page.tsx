import { DesignedJob } from "../../../jobs-screens";
import { CustomerMessages, JobDiary } from "../../../../ui/job-sources";
import { V2CertificatesPanel } from "../../../../ui/v2-certificates-panel";

export const metadata = { title: "JobGuard · Job records" };
export default async function JobRecordsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DesignedJob jobId={id} tab="records"><JobDiary jobId={id} extrasHref={`/jobs/${id}/work#variations-title`}/><CustomerMessages jobId={id}/>{process.env.JOBGUARD_LOCAL_V2 === "1" && <V2CertificatesPanel jobId={id}/>}</DesignedJob>;
}
