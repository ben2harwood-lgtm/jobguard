import { notFound } from "next/navigation";
import { InterimDraftScreen } from "./screen";
export default async function InterimDraftPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  const { id } = await params;
  return <InterimDraftScreen key={id} jobId={id} />;
}
