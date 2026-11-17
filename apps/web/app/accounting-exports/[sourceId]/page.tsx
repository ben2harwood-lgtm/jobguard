import { ExportScreen } from "../export-screen";
export default async function ExportPage({ params }: { params: Promise<{ sourceId: string }> }) {
  const { sourceId } = await params;
  return <ExportScreen key={sourceId} sourceId={sourceId} />;
}
