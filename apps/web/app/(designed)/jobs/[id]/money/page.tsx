import { V2PaymentSchedule } from "../../../../ui/v2-payment-schedule";
import { V2CloseOut } from "../../../../ui/v2-close-out";
import { cookies } from "next/headers";
import { DesignedJob } from "../../../jobs-screens";
import { ValuePage } from "../../../../ui/job-value";
import { JobMappedValue } from "../../../../ui/mapped-value-receipt";

export const metadata = { title: "JobGuard · Job money" };
// Same content rule as /jobs/[id]/value: a company-session owner without a practice session sees the mapped value only.
export default async function JobMoneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jar = await cookies();
  const companyOnly = Boolean(jar.get("jobguard_session") && !jar.get("jg_session"));
  return <DesignedJob jobId={id} tab="money">{process.env.JOBGUARD_LOCAL_V2 === "1" && process.env.JOBGUARD_ENV === "synthetic_demo" && !companyOnly && <><V2CloseOut jobId={id}/><V2PaymentSchedule jobId={id}/></>}<JobMappedValue jobId={id}/>{!companyOnly && <ValuePage jobId={id}/>}</DesignedJob>;
}
