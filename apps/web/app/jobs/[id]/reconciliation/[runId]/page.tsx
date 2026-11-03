import { ReconciliationReportPage } from "../../../../ui/financial-reconciliation-report";
export default async function Page({ params }: { params: Promise<{ id: string; runId: string }> }) {
 const { id, runId } = await params;
 return <ReconciliationReportPage jobId={id} runId={runId} />;
}
