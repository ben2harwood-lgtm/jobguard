import { DesignedJob } from "../../../jobs-screens";
import { WorkspaceShell } from "../../../../ui/workspace-shell";
import { WorkPlan } from "./work-plan";
import { MerchantOrder } from "../../../../ui/merchant-order";
import { V2FactReplies } from "../../../../ui/v2-fact-replies";

export const metadata = { title: "JobGuard · Job work" };
// The existing job workspace (quote, proof, extras, materials, final bill), hosted in the design.
export default async function JobWorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DesignedJob jobId={id} tab="work" plan={process.env.JOBGUARD_LOCAL_V2 === "1" ? <WorkPlan key={id} jobId={id}/> : undefined}><WorkspaceShell jobId={id}/>{process.env.JOBGUARD_LOCAL_V2 === "1" && <V2FactReplies jobId={id}/>}{process.env.JOBGUARD_ENV === "synthetic_demo" && <MerchantOrder key={id} jobId={id}/>}</DesignedJob>;
}
