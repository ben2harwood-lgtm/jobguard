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
  return <DesignedJob jobId={id} tab="money"><JobMappedValue jobId={id}/>{!companyOnly && <ValuePage jobId={id}/>}</DesignedJob>;
}
