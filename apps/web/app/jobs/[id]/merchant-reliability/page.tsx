import { MerchantReliabilityScreen } from "./screen";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
 return <MerchantReliabilityScreen jobId={(await params).id} />;
}
