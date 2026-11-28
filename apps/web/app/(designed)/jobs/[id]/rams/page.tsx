import { notFound } from "next/navigation";
import { RamsScreen } from "./rams-screen";
import "./rams.css";

export const metadata = { title: "JobGuard · RAMS draft" };
export default async function RamsPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  return <RamsScreen jobId={(await params).id}/>;
}
