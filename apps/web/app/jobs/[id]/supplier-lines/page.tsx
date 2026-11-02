import { SupplierLinesReview } from "../../../ui/supplier-lines-review";
export default async function SupplierLinesPage({ params }: { params: Promise<{ id: string }> }) {
  return <SupplierLinesReview key={(await params).id} jobId={(await params).id} />;
}
