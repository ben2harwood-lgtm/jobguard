import { notFound } from "next/navigation";
import { PayNowAttemptScreen } from "./screen";
export const dynamic = "force-dynamic";
export default async function PayNowPreviewPage({ params }: { params: Promise<{ id: string; invoiceId: string }> }) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  const { id, invoiceId } = await params;
  return <PayNowAttemptScreen key={`${id}:${invoiceId}`} jobId={id} invoiceId={invoiceId} />;
}
