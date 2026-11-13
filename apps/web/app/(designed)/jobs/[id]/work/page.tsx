import { DesignedJob } from "../../../jobs-screens";
import { WorkspaceShell } from "../../../../ui/workspace-shell";
import { MerchantOrder } from "../../../../ui/merchant-order";

export const metadata = { title: "JobGuard · Job work" };
// The existing job workspace (quote, proof, extras, materials, final bill), hosted in the design.
export default async function JobWorkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DesignedJob jobId={id} tab="work"><WorkspaceShell jobId={id}/>{process.env.JOBGUARD_ENV === "synthetic_demo" && <MerchantOrder key={id} jobId={id}/>}</DesignedJob>;
}
