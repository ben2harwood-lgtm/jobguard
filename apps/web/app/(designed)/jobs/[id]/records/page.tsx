import { PilotJobs } from "../../../pilot-jobs";
import { cookies } from "next/headers";
import { Card, Legacy } from "../../../designed-ui";
import { DesignedJob } from "../../../jobs-screens";
import { CustomerMessages, JobDiary } from "../../../../ui/job-sources";

export const metadata = { title: "JobGuard · Job records" };
export default async function JobRecordsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (process.env.JOBGUARD_ENV === "pilot_no_charge") return <PilotJobs screen="review" jobId={id}/>;
  const jar = await cookies();
  const companyOnly = Boolean(jar.get("jobguard_session") && !jar.get("jg_session"));
  return <DesignedJob jobId={id} tab="records">
    <Legacy label="Job diary and messages" cards>
      <JobDiary jobId={id} extrasHref={`/jobs/${id}/work#variations-title`}/>
      <CustomerMessages jobId={id}/>
    </Legacy>
    {!companyOnly && <Card title="Customer payment evidence" id="customer-payment-evidence">
      <div className="card-body"><a className="btn" href={`/jobs/${id}/money#customer-invoices`}>View invoice documents, receipts and reversals in Money</a></div>
    </Card>}
  </DesignedJob>;
}
