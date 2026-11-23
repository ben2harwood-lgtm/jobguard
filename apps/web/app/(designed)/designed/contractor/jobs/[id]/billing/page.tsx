import { notFound } from "next/navigation";
import { ContractorBilling } from "../../../../../../ui/contractor-billing";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ designed?: string }> }) {
  if ((await searchParams).designed !== "1") notFound();
  return <ContractorBilling designed jobId={(await params).id} />;
}
