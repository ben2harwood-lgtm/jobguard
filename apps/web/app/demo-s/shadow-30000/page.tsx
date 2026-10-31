import { z } from "zod";
import { ShadowJourney } from "./journey";
import { EvidencePacksV3 } from "../../ui/evidence-packs-v3";
import { PaymentFeeStatements } from "../../ui/payment-fee-statements";
export const dynamic = "force-dynamic";
export default async function ShadowJourneyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
 const query = await searchParams;
 const jobId = z.string().uuid().safeParse(query.jobId), caseId = z.string().uuid().safeParse(query.caseId);
 if (jobId.success && (query.screen === "payment-fees" || query.screen === "pack" && caseId.success)) return <main className="workspace-page">
  <a href={`/demo-s/shadow-30000?jobId=${jobId.data}`}>← Saved J3 report</a>
  <p>Practice sandbox — made-up data; nothing is sent or charged.</p>
  {query.screen === "pack" && caseId.success ? <EvidencePacksV3 caseId={caseId.data} /> : <PaymentFeeStatements jobId={jobId.data} />}
 </main>;
 return <ShadowJourney />;
}
