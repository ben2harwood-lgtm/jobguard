import { EvidenceHolds } from "./evidence-holds";
export default async function EvidenceHoldsPage({ params }: { params: Promise<{ id: string }> }) {
  return <main className="workspace-page"><h1>Evidence holds</h1><p>Synthetic practice only. Requests await a separate executor. Nothing on this screen executes a hold or release.</p><EvidenceHolds jobId={(await params).id} /></main>;
}
