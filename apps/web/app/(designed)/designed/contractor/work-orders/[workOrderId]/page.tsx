import { WorkOrderRevisions } from "../../../../../ui/work-order-revisions";

export default async function Page({ params }: { params: Promise<{ workOrderId: string }> }) {
  const { workOrderId } = await params;
  return <WorkOrderRevisions key={workOrderId} designed workOrderId={workOrderId} />;
}
