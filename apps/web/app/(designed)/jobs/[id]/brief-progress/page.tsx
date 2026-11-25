import { notFound } from "next/navigation";
import { BriefProgressView } from "../../../../ui/brief-progress";
export const metadata = { title: "JobGuard · Brief progress" };
export default async function BriefProgressPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  return <BriefProgressView jobId={(await params).id}/>;
}
