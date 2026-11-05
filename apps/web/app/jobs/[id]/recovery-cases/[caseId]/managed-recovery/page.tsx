import { notFound } from "next/navigation";
import { ManagedRecoveryScreen } from "./managed-recovery-screen";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string; caseId: string }> }) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  const { id, caseId } = await params;
  return <main className="workspace-page"><h1>Managed recovery practice choice</h1>
    <p>Practice only — not on offer. No letter is drafted or sent and nothing is issued or charged.</p>
    <ManagedRecoveryScreen key={`${id}:${caseId}`} jobId={id} caseId={caseId} />
  </main>;
}
