import { notFound } from "next/navigation";
import { AdjustmentsScreen } from "./adjustments-screen";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string; runId: string }> }) {
 if (process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
 const { id, runId } = await params;
 return <AdjustmentsScreen jobId={id} runId={runId} />;
}
