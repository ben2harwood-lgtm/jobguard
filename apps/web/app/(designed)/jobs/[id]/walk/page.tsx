import { notFound } from "next/navigation";
import { DesignedJob } from "../../../jobs-screens";
import { Walk } from "./walk";

export const metadata = { title: "JobGuard · Walk the job" };
export default async function WalkPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  const { id } = await params;
  return <DesignedJob jobId={id} tab="work"><Walk key={id} jobId={id}/></DesignedJob>;
}
