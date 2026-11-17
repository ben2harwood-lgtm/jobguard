import { DunningScreen } from "./screen";
export default async function DunningPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DunningScreen key={id} jobId={id} />;
}
