import { V2PaymentSchedule } from "../../../../ui/v2-payment-schedule";
import { V2CloseOut } from "../../../../ui/v2-close-out";
import { PilotJobs } from "../../../pilot-jobs";
import { cookies } from "next/headers";
import { DesignedJob } from "../../../jobs-screens";
import { JobInvoices } from "../../../job-invoices";
import { Legacy } from "../../../designed-ui";
import { ValuePage } from "../../../../ui/job-value";
import { JobMappedValue } from "../../../../ui/mapped-value-receipt";

export const metadata = { title: "JobGuard · Job money" };
// Same content rule as /jobs/[id]/value: a company-session owner without a practice session sees the mapped value only.
// V2-SQ-I-3 (placement copied from #918): the invoices card and the paid report in the designed look; the mapped value
// receipt keeps its legacy look.
export default async function JobMoneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (process.env.JOBGUARD_ENV === "pilot_no_charge") return <PilotJobs screen="review" jobId={id}/>;
  const jar = await cookies();
  const companyOnly = Boolean(jar.get("jobguard_session") && !jar.get("jg_session"));
  return <DesignedJob jobId={id} tab="money">
    {process.env.JOBGUARD_LOCAL_V2 === "1" && process.env.JOBGUARD_ENV === "synthetic_demo" && !companyOnly && <><V2CloseOut jobId={id}/><V2PaymentSchedule jobId={id}/></>}
    {!companyOnly && <><JobInvoices jobId={id}/><ValuePage jobId={id} designed/></>}
    <Legacy label="Value receipt" cards><JobMappedValue jobId={id}/></Legacy>
  </DesignedJob>;
}
