import { notFound } from "next/navigation";
import { DunningScreen } from "./screen";
export default async function DunningPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  const { id } = await params;
  return <DunningScreen key={id} jobId={id} />;
}
