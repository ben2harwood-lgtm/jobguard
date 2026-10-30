import { ContractorBilling } from "../../../../ui/contractor-billing";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <ContractorBilling jobId={(await params).id}/>; }
