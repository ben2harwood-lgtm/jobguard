"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { WalkIt } from "../../ui/jobguard-app";
import { InstructionTour } from "./instruction-tour";
import { WorkspaceShell } from "../../ui/workspace-shell";
import { core1000Link, core1000Source } from "./journey-model";

const sessionV1 = z.object({ version: z.literal(1), tenants: z.array(z.object({ id: z.string().uuid() })).min(1) });
const uuid = z.string().uuid();
export { core1000Link, core1000Source } from "./journey-model";

/** Instructions describe the reference exercise, never a claimed outcome or a shadow read. */
export function Core1000Guide({ chooserHref = "/demo-s" }: { chooserHref?: string }) {
  return <section className="workspace-page" aria-label="Core-1000 guide">
    <a href={chooserHref} aria-label="Practice chooser">Choose a practice exercise</a><h1>Core £1,000 job</h1>
    <p>Practice with made-up details; nothing is sent or charged</p>
    <p>Follow these steps in the job screens below. The figures show what to expect. This guide does not mark steps complete; check the saved results in the job screens.</p>
    <InstructionTour>
      <li>Start a new draft using the five supplied work items. Check the notes beside each item and accept all five. Answer the waste disposal question, save the made-up customer and site details, then click Confirm scope to save the work list.</li>
      <li>Click Price the work. Save the first quote at £900 before VAT. Change Clean site to £200 and save the second quote at £1,000 before VAT, £200 example VAT, £1,200 including VAT.</li>
      <li>Preview the saved quote and try the practice send. Use the next practice-send button to finish the send without contacting anyone. Record practice acceptance, then click Start this practice job. This example has no fee limit and starting it creates no amount to pay.</li>
      <li>Log Extra preparation +£125, Omit cabinet painting −£25 and Pending trim repair +£50. Approve the saved versions of the first two only. Leave the £50 waiting for approval.</li>
      <li>Attach the supplied practice image, check that the uploaded file matches the original and mark the stage complete. Build the final bill: £1,100 before VAT, £220 example VAT, £1,320 including VAT.</li>
      <li>Review the extras you logged and mark each of the five original work items Done. Accept the Final Check terms if this business has not already accepted them, then complete the final account to save the bill for checking. Click Run the final check (practice). When the check finishes, load its saved result. Wait for Final Check to finish before issuing the invoice.</li>
      <li>Issue the £1,320 invoice and try the practice send. Record payments of £500, then £820: the amount still due should be £820, then £0. Undo the second payment and give a reason: £820 becomes due again.</li>
      <li>Preview a credit note reducing the bill by £100 before VAT, then approve that correction. The reduction should be £120 including VAT, leaving £700 due. The original £1,320 invoice and payment history stay saved.</li>
      <li>Open job value and follow the links to see where the figures came from. Payments you enter in this practice have not been confirmed by a bank and cannot earn JobGuard a recovery fee.</li>
    </InstructionTour>
    <p>Here, you record acceptance yourself for practice. To try a customer approving work through their secure link, choose the £30,000 Final Check exercise from the practice chooser.</p>
  </section>;
}

export function Core1000Journey({ requestedJobId, chooserHref }: { requestedJobId?: string | string[] | undefined; chooserHref?: string }) {
  const [tenantId, setTenantId] = useState(""), [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const jobId = requestedJobId === undefined ? undefined : uuid.safeParse(requestedJobId);
  const invalid = jobId !== undefined && !jobId.success;
  async function readSession() {
    const response = await fetch("/api/session", { cache: "no-store" });
    if (response.status === 401) return;
    if (!response.ok) throw new Error("Practice session could not load. Try again.");
    const session = sessionV1.parse(await response.json());
    setTenantId(session.tenants[0]!.id);
  }
  useEffect(() => {
    // Reading a link never creates a session, a job or a replacement for an inaccessible job.
    void readSession().catch(() => setError("Practice session could not load. Try again.")).finally(() => setChecking(false));
  }, []);
  async function start() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/session", { method: "POST" });
      if (!response.ok) throw new Error("Practice is unavailable in this environment.");
      await readSession();
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  return <>
    <Core1000Guide {...(chooserHref ? { chooserHref } : {})} />
    {invalid ? <p role="alert">Invalid saved job reference.</p> : jobId?.success ? <>
      {tenantId && <Core1000GuideLinks jobId={jobId.data} />}
      <WorkspaceShell jobId={jobId.data} />
    </> : <section className="workspace-page">
      {checking ? <p role="status">Checking practice session…</p> : tenantId ?
        <WalkIt tenantId={tenantId} initialText={core1000Source} reviewHref={core1000Link} close={() => location.assign(chooserHref ?? "/demo-s")} /> :
        <button disabled={busy} onClick={() => void start()} aria-label="Start core-1000 practice session">Start the £1,000 practice job</button>}
      {error && <p role="alert">{error}</p>}
    </section>}
  </>;
}

function Core1000GuideLinks({ jobId }: { jobId: string }) {
  return <nav className="workspace-page" aria-label="Core-1000 saved sources">
    <a href={core1000Link(jobId)}>Resume this guided job</a> · <a href={`/jobs/${jobId}`}>Saved job</a> · <a href={`/jobs/${jobId}/value`} aria-label="Source-linked job value">See job value and supporting records</a> · <a href="/value">See business value</a>
  </nav>;
}
