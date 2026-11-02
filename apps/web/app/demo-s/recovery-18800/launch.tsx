"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { WalkIt } from "../../ui/jobguard-app";
import { WorkspaceShell } from "../../ui/workspace-shell";

const sessionV1 = z.object({ version: z.literal(1), tenants: z.array(z.object({ id: z.string().uuid() })).min(1) });
const uuid = z.string().uuid();
export const recovery18800Source = `JOB: Fictional practice decorating
ITEM: Protect room | £3760.00
ITEM: Prepare walls | £3760.00
ITEM: Paint walls | £3760.00
ITEM: Finish trim | £3760.00
ITEM: Clean site | £3760.00`;
const recoveryLink = (id: string) => `/demo-s/recovery-18800?${new URLSearchParams({ jobId: uuid.parse(id) })}`;

/** Starts a fresh fictional job, then hands over to the job screens and the saved-state guide. Never reports an outcome. */
export function Recovery18800Launch({ requestedJobId }: { requestedJobId?: string | string[] | undefined }) {
  const [tenantId, setTenantId] = useState(""), [checking, setChecking] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const jobId = requestedJobId === undefined ? undefined : uuid.safeParse(requestedJobId);
  async function readSession() {
    const response = await fetch("/api/session", { cache: "no-store" });
    if (response.status === 401) return;
    if (!response.ok) throw new Error("Practice session could not load. Try again.");
    setTenantId(sessionV1.parse(await response.json()).tenants[0]!.id);
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
    <section className="workspace-page" aria-label="Recovery £18,800 start">
      <a href="/demo-s">Practice chooser</a><h1>Recovery £18,800 job</h1>
      <p>Practice sandbox — synthetic data; nothing is sent or charged</p>
      {jobId?.success && <p><a href={`/jobs/${jobId.data}/recovery-journey`}>Open the recovery practice guide</a></p>}
    </section>
    {jobId !== undefined && !jobId.success ? <p role="alert">Invalid saved job reference.</p> : jobId?.success ? <WorkspaceShell jobId={jobId.data} /> :
      <section className="workspace-page">
        {checking ? <p role="status">Checking practice session…</p> : tenantId ?
          <WalkIt tenantId={tenantId} initialText={recovery18800Source} reviewHref={recoveryLink} close={() => location.assign("/demo-s")} /> :
          <button disabled={busy} onClick={() => void start()}>Start recovery-18800 practice session</button>}
        {error && <p role="alert">{error}</p>}
      </section>}
  </>;
}
