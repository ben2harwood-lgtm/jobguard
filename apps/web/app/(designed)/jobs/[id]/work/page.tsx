import { RamsLink } from "../rams/rams-link";
import { PilotJobs } from "../../../pilot-jobs";
import { DesignedJob } from "../../../jobs-screens";
import { WorkspaceShell } from "../../../../ui/workspace-shell";
import { WorkPlan } from "./work-plan";
import { MerchantOrder } from "../../../../ui/merchant-order";
import { Legacy } from "../../../designed-ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "JobGuard · Job work" };
// The existing job workspace (quote, proof, extras, materials, final bill), hosted in the design.
export default async function JobWorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (process.env.JOBGUARD_ENV === "pilot_no_charge") return <PilotJobs screen="review" jobId={id}/>;
  return <DesignedJob jobId={id} tab="work" plan={process.env.JOBGUARD_LOCAL_V2 === "1" ? <WorkPlan key={id} jobId={id}/> : undefined}><WorkspaceShell designed jobId={id}/>{process.env.JOBGUARD_LOCAL_V2 === "1" && <RamsLink jobId={id}/>}{process.env.JOBGUARD_ENV === "synthetic_demo" && <Legacy label="Merchant order" cards><MerchantOrder key={id} jobId={id}/></Legacy>}</DesignedJob>;
}
