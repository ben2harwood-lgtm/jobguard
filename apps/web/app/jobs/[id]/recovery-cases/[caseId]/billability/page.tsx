import { BillabilityScreen } from "./screen";
export default async function BillabilityPage({ params }: { params: Promise<{ id: string; caseId: string }> }) {
  const { id, caseId } = await params;
  return <BillabilityScreen key={`${id}/${caseId}`} jobId={id} caseId={caseId} />;
}
