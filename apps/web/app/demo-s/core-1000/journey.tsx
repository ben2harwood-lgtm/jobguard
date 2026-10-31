"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { WalkIt } from "../../ui/jobguard-app";
import { WorkspaceShell } from "../../ui/workspace-shell";

const sessionV1 = z.object({ version: z.literal(1), tenants: z.array(z.object({ id: z.string().uuid() })).min(1) });
const uuid = z.string().uuid();
export const core1000Source = `JOB: Fictional practice decorating
ITEM: Protect room | £200.00
ITEM: Prepare walls | £200.00
ITEM: Paint walls | £200.00
ITEM: Finish trim | £200.00
ITEM: Clean site | £100.00`;
export const core1000Link = (id: string) => `/demo-s/core-1000?${new URLSearchParams({ jobId: uuid.parse(id) })}`;

/** Instructions describe the reference exercise, never a claimed outcome or a shadow read. */
export function Core1000Guide() {
  return <section className="workspace-page" aria-label="Core-1000 guide">
    <a href="/demo-s">Practice chooser</a><h1>Core £1,000 job</h1>
    <p>Practice sandbox — synthetic data; nothing is sent or charged</p>
    <p>These are instructions and expected figures. The job screens below read saved facts; this guide does not mark steps complete.</p>
    <ol>
      <li>Make a fresh draft from the five supplied lines. Check each source excerpt, accept all five, answer the disposal question and save the fictional customer and site. Confirm scope.</li>
      <li>Price the work. Save quote revision 1 at £900 net. Change Clean site to £200 and save revision 2 at £1,000 net, £200 reference VAT, £1,200 gross.</li>
      <li>Preview the immutable quote, simulate sending, continue the fake worker, record practice acceptance and start this practice job. New work uses v3: no v1 cap or activation obligation.</li>
      <li>Log Extra preparation +£125, Omit cabinet painting −£25 and Pending trim repair +£50. Approve only the first two exact revisions. The £50 remains pending.</li>
      <li>Attach the generated practice image, check file integrity and complete the stage. Build the final account: £1,100 net, £220 reference VAT, £1,320 gross.</li>
      <li>Review the captures, set all five baseline dispositions to Done, accept Final Check terms if they have not already been accepted for this business, and complete the final account. Run the final check (practice), then load its saved result after the worker finishes. Invoice issue must wait for completed Final Check.</li>
      <li>Issue and simulate the £1,320 invoice. Record £500, then £820: expected balances £820 then £0. Reverse the second receipt with a reason: £820 becomes due again.</li>
      <li>Preview a £100 net credit note and approve that exact correction. The expected gross credit is £120 and remaining balance £700. The original £1,320 invoice and receipt history stay saved.</li>
      <li>Inspect job value and follow its source links. Manual practice receipts are not bank-confirmed settlement or fee-eligible recoveries.</li>
    </ol>
    <p>MON-5 customer journey: not ready yet. Acceptance here is builder-recorded practice acceptance, not an authenticated customer response.</p>
    <p>Independent RED verdict: missing. Non-technical builder observations: 0 of 2 recorded here. No release gate is passed by this exercise.</p>
  </section>;
}

export function Core1000Journey({ requestedJobId }: { requestedJobId?: string | string[] | undefined }) {
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
    <Core1000Guide />
    {invalid ? <p role="alert">Invalid saved job reference.</p> : jobId?.success ? <>
      {tenantId && <Core1000GuideLinks jobId={jobId.data} />}
      <WorkspaceShell jobId={jobId.data} />
    </> : <section className="workspace-page">
      {checking ? <p role="status">Checking practice session…</p> : tenantId ?
        <WalkIt tenantId={tenantId} initialText={core1000Source} reviewHref={core1000Link} close={() => location.assign("/demo-s")} /> :
        <button disabled={busy} onClick={() => void start()}>Start core-1000 practice session</button>}
      {error && <p role="alert">{error}</p>}
    </section>}
  </>;
}

function Core1000GuideLinks({ jobId }: { jobId: string }) {
  return <nav className="workspace-page" aria-label="Core-1000 saved sources">
    <a href={core1000Link(jobId)}>Resume this guided job</a> · <a href={`/jobs/${jobId}`}>Saved job</a> · <a href={`/jobs/${jobId}/value`}>Source-linked job value</a> · <a href="/value">Business value availability (CH-9)</a>
  </nav>;
}
