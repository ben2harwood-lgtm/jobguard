"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { smallBuilderDemoRunV1, smallBuilderDemoReportV1, smallBuilderDemoReadRunV1,
  type SmallBuilderDemoRun, type SmallBuilderDemoReport, type SmallBuilderDemoHttpCommand } from "@jobguard/core";
import { demoLink, journeyChoices, meterProfiles, pendingKey, readPending } from "./chooser-state";
import styles from "./chooser.module.css";
const sessionV1 = z.object({ version: z.literal("identity-session.v1"), environment: z.literal("synthetic_demo"),
  csrfToken: z.string().min(24), memberships: z.array(z.object({ id: z.string().uuid(), tenantId: z.string().uuid(), name: z.string() })) });
type Session = z.infer<typeof sessionV1>;
const errors: Record<string, string> = {
  DEMO_FORBIDDEN: "Sign in to the owning made-up business to open this selection.",
  DEMO_SYNTHETIC_ONLY: "This chooser is available only in the synthetic demo environment.",
  DEMO_NOT_FOUND: "That saved selection or report is unavailable to this membership.",
  DEMO_STALE_REVISION: "The selection changed. Resume it to read the current saved state.",
  DEMO_ARCHIVED: "This selection has been archived. Open its successor to continue.",
  DEMO_COMMAND_CONFLICT: "That request reference belongs to a different operation. Resume the saved selection.",
  INVALID_DEMO_INPUT: "Check the saved selection reference and try again.",
};
async function readSaved(session: Session, tenantId: string, operation: "read" | "report", runId: string, snapshotId?: string) {
  const query = new URLSearchParams({ runId, ...(snapshotId ? { snapshotId } : {}) });
  const response = await fetch(`/api/small-builder-demo/${operation}?${query}`, { cache: "no-store", headers: { "x-tenant-id": tenantId, "x-csrf-token": session.csrfToken } });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(errors[(body as { code?: string }).code ?? ""] ?? "Saved state is unavailable. Try Resume again.");
  return operation === "read" ? smallBuilderDemoRunV1.parse(body) : smallBuilderDemoReportV1.parse(body);
}
export function LifecycleReport({ report, tenantId }: { report: SmallBuilderDemoReport; tenantId: string }) {
  const facts = report.facts;
  return <section aria-labelledby="report-title"><h2 id="report-title">Saved selection report</h2>
    <p>This report records the saved selection and its blocker. The product journey has not run.</p>
    <dl><dt>Scenario</dt><dd>{facts.scenario}</dd><dt>Status</dt><dd>{facts.status}</dd>
      <dt>Saved reason</dt><dd>{facts.reason}</dd><dt>Revision</dt><dd>{facts.revision}</dd>
      <dt>Created</dt><dd>{facts.createdAt}</dd><dt>Archived</dt><dd>{facts.archivedAt ?? "Not archived at snapshot time"}</dd></dl>
    <p><a href={demoLink(tenantId, facts.runId)}>Resume saved selection {facts.runId}</a></p>
    <p><a href={demoLink(tenantId, facts.runId, report.snapshotId)}>Open exact saved report {report.snapshotId}</a></p>
    {facts.predecessorId && <p><a href={demoLink(tenantId, facts.predecessorId)}>Open previous selection</a></p>}
    {facts.successorId && <p><a href={demoLink(tenantId, facts.successorId)}>Open replacement selection</a></p>}
    <p>DEMO-A1 is not ready yet: DEMO-J1–J5 need completed journeys and persisted source reports.</p>
    <p>Independent verdict: missing. Non-technical builder observations: 0 of 2 recorded here.</p>
  </section>;
}
export function DemoChooser() {
  const [session, setSession] = useState<Session | null>(null), [tenantId, setTenantId] = useState("");
  const [checking, setChecking] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [run, setRun] = useState<SmallBuilderDemoRun | null>(null), [report, setReport] = useState<SmallBuilderDemoReport | null>(null);
  const [resumeId, setResumeId] = useState(""), [pending, setPending] = useState<SmallBuilderDemoHttpCommand | null>(null);
  const busyRef = useRef(false);
  const membership = session?.memberships.find(item => item.tenantId === tenantId);
  const storageKey = membership ? pendingKey(tenantId, membership.id) : "";
  useEffect(() => {
    let active = true;
    void fetch("/api/auth/session", { cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Sign in with a fictional email code to use this chooser.");
      const current = sessionV1.parse(await response.json());
      if (active) {
        const requested = new URLSearchParams(location.search).get("tenantId");
        setSession(current); setTenantId(current.memberships.find(item => item.tenantId === requested)?.tenantId ?? current.memberships[0]?.tenantId ?? "");
      }
    }).catch(() => { if (active) setError("Sign in with a fictional email code to use this chooser."); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    setRun(null); setReport(null); setResumeId(""); setError(""); setPending(null);
    if (!session || !storageKey) return;
    try { setPending(readPending(sessionStorage.getItem(storageKey))); }
    catch { setError("Browser storage is unavailable. Enable it before saving a selection."); }
    const query = new URLSearchParams(location.search), id = query.get("runId"), snapshot = query.get("snapshotId");
    if (query.get("tenantId") === tenantId && id) {
      setResumeId(id);
      busyRef.current = true; setBusy(true);
      void Promise.all([
        readSaved(session, tenantId, "read", id),
        snapshot ? readSaved(session, tenantId, "report", id, snapshot) : Promise.resolve(null),
      ]).then(([current, savedReport]) => {
        if (active) {
          setRun(smallBuilderDemoRunV1.parse(current));
          if (savedReport) setReport(smallBuilderDemoReportV1.parse(savedReport));
        }
      }).catch(reason => { if (active) setError((reason as Error).message); })
        .finally(() => { if (active) { busyRef.current = false; setBusy(false); } });
    }
    return () => { active = false; };
  }, [session, storageKey, tenantId]);
  async function resume(event: FormEvent) {
    event.preventDefault();
    if (!session || !membership || busyRef.current) return;
    if (!smallBuilderDemoReadRunV1.safeParse({ runId: resumeId }).success) { setError("Enter a valid saved selection reference."); return; }
    busyRef.current = true; setBusy(true); setError(""); setRun(null); setReport(null);
    try {
      const saved = smallBuilderDemoRunV1.parse(await readSaved(session, tenantId, "read", resumeId));
      setRun(saved); history.replaceState(null, "", demoLink(tenantId, saved.runId));
    } catch (reason) { setError((reason as Error).message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function send(command: SmallBuilderDemoHttpCommand) {
    if (!session || !membership || busyRef.current) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      // Save the exact intent before sending; retry and reload never mint a replacement command ID.
      sessionStorage.setItem(storageKey, JSON.stringify(command)); setPending(command);
      const response = await fetch(`/api/small-builder-demo/${command.operation}`, { method: "POST", cache: "no-store",
        headers: { "content-type": "application/json", "x-csrf-token": session.csrfToken, "x-tenant-id": tenantId }, body: JSON.stringify(command) });
      const body: unknown = await response.json();
      if (!response.ok) {
        if ([400, 403, 404, 409].includes(response.status)) { sessionStorage.removeItem(storageKey); setPending(null); }
        throw new Error(errors[(body as { code?: string }).code ?? ""] ?? "Outcome unknown. Retry the saved request before making another selection.");
      }
      const saved = command.operation === "snapshot" ? smallBuilderDemoReportV1.parse(body) : smallBuilderDemoRunV1.parse(body);
      sessionStorage.removeItem(storageKey); setPending(null);
      if ("facts" in saved) {
        setReport(saved); setRun(saved.facts); history.replaceState(null, "", demoLink(tenantId, saved.facts.runId, saved.snapshotId));
      } else {
        setRun(saved); setReport(null); setResumeId(saved.runId); history.replaceState(null, "", demoLink(tenantId, saved.runId));
        if (saved.successorId) {
          const successor = smallBuilderDemoRunV1.parse(await readSaved(session, tenantId, "read", saved.successorId));
          setRun(successor); setResumeId(successor.runId); history.replaceState(null, "", demoLink(tenantId, successor.runId));
        }
      }
    } catch (reason) { setError((reason as Error).message); }
    finally { busyRef.current = false; setBusy(false); }
  }
  const disabled = busy || !!pending || !membership;
  return <main className={styles.main}><a href="/">JobGuard home</a><h1>Small-builder practice chooser</h1>
    <p>Made-up data only. Choose a journey to see whether it is ready and save your selection.</p>
    <p><a href="/demo-s/core-1000">Practise core-1000 with the guided job screens</a>. This uses a separate practice session; saving a company selection below does not run or complete it.</p>
    {checking && <p role="status">Checking your signed-in business…</p>}
    {error && <p role="alert">{error}</p>}
    {!session && !checking && <a href="/sign-in">Sign in with a fictional email code</a>}
    {session && <><label htmlFor="demo-company">Made-up business</label><select id="demo-company" value={tenantId} disabled={busy} onChange={event => setTenantId(event.target.value)}>
      {session.memberships.map(item => <option key={item.id} value={item.tenantId}>{item.name}</option>)}</select>
      {pending && <section aria-label="Unconfirmed request"><p>A saved request has no confirmed response. Retry uses its original reference.</p>
        <button disabled={busy} onClick={() => void send(pending)}>Retry saved request</button></section>}
      <section aria-labelledby="journey-title"><h2 id="journey-title">Choose a journey</h2><div className={styles.choices}>
        {journeyChoices.map(choice => <article key={choice.scenario}><h3>{choice.title}</h3><p>Not ready yet. {choice.reason}</p>
          {choice.scenario === "meter" && <details><summary>Meter profiles — all not ready yet</summary><ul>{meterProfiles.map(profile => <li key={profile}>{profile}</li>)}</ul></details>}
          <button disabled={disabled} onClick={() => void send({ operation: "create", runId: null, input: { contractVersion: "small-builder-demo.create.v1", commandId: crypto.randomUUID(), scenario: choice.scenario } })}>Save {choice.scenario} selection</button>
        </article>)}
      </div></section>
      <form onSubmit={event => void resume(event)}><h2>Resume a saved selection</h2><label htmlFor="demo-resume">Saved selection reference</label>
        <input id="demo-resume" value={resumeId} onChange={event => setResumeId(event.target.value)} required />
        <button disabled={busy || !membership} type="submit">Resume</button></form>
      {run && <section aria-labelledby="saved-title"><h2 id="saved-title">Saved {run.scenario} selection</h2><p>{run.status === "archived" ? "Archived" : "Not ready yet"}: {run.reason}</p>
        <p><a href={demoLink(tenantId, run.runId)}>Resume link: {run.runId}</a></p>
        <p>Saved revision {run.revision}. No product journey completion is recorded.</p>
        {run.successorId && <p><a href={demoLink(tenantId, run.successorId)}>Open replacement selection</a></p>}
        {run.predecessorId && <p><a href={demoLink(tenantId, run.predecessorId)}>Open archived selection</a></p>}
        <p>Reset archives this selection and creates a replacement. Existing history and business records stay saved.</p>
        <button disabled={disabled || run.status === "archived"} onClick={() => void send({ operation: "reset", runId: run.runId, input: { contractVersion: "small-builder-demo.reset.v1", commandId: crypto.randomUUID(), expectedRunRevision: run.revision } })}>Reset selection</button>
        <button disabled={disabled || run.status === "archived"} onClick={() => void send({ operation: "snapshot", runId: run.runId, input: { contractVersion: "small-builder-demo.report-snapshot.v1", commandId: crypto.randomUUID(), expectedRunRevision: run.revision } })}>Save selection report</button>
      </section>}
      {report && <LifecycleReport report={report} tenantId={tenantId} />}
    </>}
  </main>;
}
