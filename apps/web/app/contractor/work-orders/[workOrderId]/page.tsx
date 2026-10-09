import { WorkOrderRevisions } from "../../../ui/work-order-revisions";
export default async function Page({ params }: { params: Promise<{ workOrderId: string }> }) { return <WorkOrderRevisions workOrderId={(await params).workOrderId}/>; }
