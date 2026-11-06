import { notFound } from "next/navigation";
import { ExportScreen } from "../export-screen";
export default async function ExportPage({ params }: { params: Promise<{ sourceId: string }> }) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  const { sourceId } = await params;
  return <ExportScreen key={sourceId} sourceId={sourceId} />;
}
