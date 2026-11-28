import { notFound } from "next/navigation";
import { DesignedJob } from "../../../jobs-screens";
import { HandoverScreen } from "../../../../ui/v2-handover";

export const metadata = { title: "JobGuard · Handover" };
// V2-G2: Job › Records › Handover. Local V2 practice only.
export default async function JobHandoverPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  const { id } = await params;
  return <DesignedJob jobId={id} tab="records"><HandoverScreen jobId={id}/></DesignedJob>;
}
