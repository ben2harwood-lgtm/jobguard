import { ClientApproval } from "./client-approval";
export default async function Page({ params }: { params: Promise<{ jobId: string; requestId: string }> }) {
  const { jobId, requestId } = await params;
  return <ClientApproval jobId={jobId} requestId={requestId} />;
}
