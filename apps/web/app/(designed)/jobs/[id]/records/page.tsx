import { DesignedJob } from "../../../jobs-screens";
import { CustomerMessages, JobDiary } from "../../../../ui/job-sources";

export const metadata = { title: "JobGuard · Job records" };
export default async function JobRecordsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DesignedJob jobId={id} tab="records"><JobDiary jobId={id}/><CustomerMessages jobId={id}/></DesignedJob>;
}
