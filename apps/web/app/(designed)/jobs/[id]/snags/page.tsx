import { notFound } from "next/navigation";
import { DesignedJob } from "../../../jobs-screens";
import { SnagRegisterScreen } from "../../../../ui/v2-snag-register";

export const metadata = { title: "JobGuard · Snags" };
// V2-G1: Job › Records › Snags. Local V2 practice only.
export default async function JobSnagsPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  const { id } = await params;
  return <DesignedJob jobId={id} tab="records"><SnagRegisterScreen jobId={id}/></DesignedJob>;
}
