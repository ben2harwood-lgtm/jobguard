import { notFound } from "next/navigation";
import { ChasingScreen } from "./screen";
export default async function ChasingPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  const { id } = await params;
  return <ChasingScreen key={id} jobId={id} />;
}
