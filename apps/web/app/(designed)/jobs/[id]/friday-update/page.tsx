import { notFound } from "next/navigation";
import { FridayUpdateScreen } from "./screen";
export const dynamic = "force-dynamic";
export default async function FridayUpdatePage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  return <FridayUpdateScreen jobId={(await params).id}/>;
}
