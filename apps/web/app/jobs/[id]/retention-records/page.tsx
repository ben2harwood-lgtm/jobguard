import { notFound } from "next/navigation";
import { RetentionRecordScreen } from "./screen";
export default async function RetentionRecordPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  const { id } = await params;
  return <RetentionRecordScreen key={id} jobId={id} />;
}
