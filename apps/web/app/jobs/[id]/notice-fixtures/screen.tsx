"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { NoticeFixtureView } from "@jobguard/api/workspace";

type Pending = { body: string };
async function companyHeaders() {
  const response = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) throw new Error("Sign in to your company and refresh.");
  const session = await response.json() as { csrfToken?: string; memberships?: { tenantId: string }[] };
  const tenant = session.memberships?.[0]?.tenantId;
  if (!session.csrfToken || !tenant) throw new Error("Sign in to your company and refresh.");
  return { "x-csrf-token": session.csrfToken, "x-tenant-id": tenant };
}
const control = { minHeight: 44, maxWidth: "100%", boxSizing: "border-box" as const };
const pre = { whiteSpace: "pre-wrap" as const, overflowWrap: "anywhere" as const };
export function NoticeFixtureScreen({ jobId, realNoticeRefusal }: { jobId: string; realNoticeRefusal: string }) {
  const [view, setView] = useState<NoticeFixtureView | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const path = `/api/jobs/${encodeURIComponent(jobId)}/notice-fixtures`;
  const storageKey = `notice-fixture-pending:${jobId}`;
  async function load() {
    const response = await fetch(path, { cache: "no-store", credentials: "same-origin", headers: await companyHeaders() });
    if (response.status === 404) { setView(null); setError("Practice notice unavailable. A first complete revision can be recorded for an owned job."); return; }
    if (!response.ok) throw new Error("Practice notice unavailable. Sign in and refresh.");
    setView(await response.json() as NoticeFixtureView);
  }
  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey);
    if (saved) setPending({ body: saved });
    void load().catch(reason => setError(reason instanceof Error ? reason.message : "Practice notice unavailable."))
      .finally(() => setBusy(false));
    // Each job gets its own mounted screen and retry slot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);
  function clearPending() { sessionStorage.removeItem(storageKey); setPending(null); }
  async function submit(command: Pending) {
    setBusy(true); setError("");
    try {
      const response = await fetch(path, { method: "POST", credentials: "same-origin",
        headers: { ...await companyHeaders(), "Content-Type": "application/json" }, body: command.body });
      if (!response.ok) {
        const failure = await response.json() as { message?: string };
        // A repository connection failure can be deliberately masked as not-found.
        // Keep that command as uncertain too; never replace its identity on retry.
        if ([400, 401, 403, 409].includes(response.status)) clearPending();
        setView(null);
        throw new Error(failure.message ?? "Practice command refused. Refresh and review again.");
      }
      clearPending();
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Reply unknown. Retry the same saved command.");
    } finally { setBusy(false); }
  }
  function command(kind: string, data: unknown) {
    const next = { body: JSON.stringify({ version: "notice.fixture-record-command.v1", commandId: crypto.randomUUID(),
      jobId, noticeId: jobId, kind, data }) };
    // Persist exact bytes before the request; a lost reply or reload must not mint another command.
    sessionStorage.setItem(storageKey, next.body); setPending(next); void submit(next);
  }
  function revision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget), value = (name: string) => String(form.get(name) ?? "").trim();
    const previous = view?.history.revisions.at(-1);
    command("revision", { version: "notice.input.v1", environment: "synthetic", revision: (previous?.revision ?? 0) + 1,
      previousRevisionId: previous?.revisionId ?? null, revisionId: crypto.randomUUID(),
      profileId: value("profile"), profileVersion: Number(value("profileVersion")), recipientReference: value("recipient"),
      serviceMethod: value("method"), facts: { dueDate: value("due") || null,
        contractReference: value("contract") || null, triggerEvidenceId: value("trigger") || null } });
  }
  function decision(resolution: "approved" | "rejected") {
    if (!view?.preview) return;
    command("decision", { id: crypto.randomUUID(), noticeRevisionId: view.preview.input.revisionId,
      resolution, expiresAt: view.approvalExpiresAt });
  }
  function service(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!view?.preview || !view.activeDecisionId) return;
    const form = new FormData(event.currentTarget), value = (name: string) => String(form.get(name) ?? "").trim() || null;
    command("service_event", { id: crypto.randomUUID(), noticeRevisionId: view.preview.input.revisionId,
      decisionId: view.activeDecisionId, state: value("state"), providerReference: value("provider"),
      evidenceId: value("evidence"), legalAssessmentReference: value("assessment") });
  }
  const locked = busy || pending !== null;
  return <main className="workspace-page" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
    <h1>Practice notice fixtures</h1>
    <p>This is a practice notice, reviewed by nobody. Nothing is generated, sent or served.</p>
    <p>Fictional contracts and evidence only. This screen gives no legal advice.</p>
    {error ? <p role="alert">{error}</p> : null}
    {busy ? <p role="status">Loading practice records…</p> : null}
    <button style={control} disabled={busy} onClick={() => { setBusy(true); setError(""); void load()
      .catch(() => { setView(null); setError("Practice notice unavailable. Sign in and refresh."); }).finally(() => setBusy(false)); }}>Refresh stored history</button>
    {pending ? <section aria-label="Uncertain command">
      <p>Reply may be unknown. New edits and approvals are blocked. Retry sends the exact saved command ID and facts.</p>
      <button style={control} disabled={busy} onClick={() => void submit(pending)}>Retry same saved command</button>
    </section> : null}
    <form onSubmit={revision} aria-label="Structured input checklist">
      <h2>Structured input checklist</h2>
      <fieldset disabled={locked} style={{ minWidth: 0 }}>
        <label>Fictional profile ID<input style={control} name="profile" defaultValue="fixture-calendar" required /></label>
        <p>Practice profiles: fixture-calendar and fixture-working. Other cases are flagged for advice.</p>
        <label>Profile version<input style={control} name="profileVersion" type="number" min="1" defaultValue="1" required /></label>
        <label>Recipient reference<input style={control} name="recipient" required /></label>
        <label>Service method<select style={control} name="method"><option value="fixture_email">fixture_email</option><option value="fixture_hand_delivery">fixture_hand_delivery</option></select></label>
        <label>Due date<input style={control} name="due" type="date" /></label>
        <label>Fictional contract reference<input style={control} name="contract" /></label>
        <label>Trigger evidence UUID<input style={control} name="trigger" /></label>
        <p>Missing facts are sent as unknown for the server to flag. They never create an approval.</p>
        <button style={control} type="submit">Store revision and preview</button>
      </fieldset>
    </form>
    {view ? <>
      <section aria-label="Exact server preview"><h2>Exact server preview</h2>
        <p>{view.watermark}</p>
        <pre style={pre} data-testid="notice-preview">{JSON.stringify(view.preview, null, 2)}</pre>
        <p>{view.approvalMessage}</p>
        <button style={control} disabled={locked || !view.preview || !!view.activeDecisionId} onClick={() => decision("approved")}>Approve this exact practice preview</button>
        <button style={control} disabled={locked || !view.preview || !!view.activeDecisionId} onClick={() => decision("rejected")}>Reject this exact practice preview</button>
      </section>
      <form onSubmit={service} aria-label="Record service fact"><h2>Record one synthetic service fact</h2>
        <fieldset disabled={locked || !view.activeDecisionId} style={{ minWidth: 0 }}>
          <label>Separate service fact<select style={control} name="state">{["queued", "provider_accepted", "outcome_unknown", "read", "legally_served"].map(state => <option key={state}>{state}</option>)}</select></label>
          <label>Fictional provider reference<input style={control} name="provider" /></label>
          <label>Service evidence UUID<input style={control} name="evidence" /></label>
          <label>Separate legal assessment reference<input style={control} name="assessment" /></label>
          <button style={control} type="submit">Record practice service fact</button>
        </fieldset>
      </form>
      <section aria-label="Stored history"><h2>Stored history</h2>
        {view.records.map(record => <article key={record.commandId}><h3>Record {record.sequence}: {record.kind}</h3>
          <pre style={pre}>{JSON.stringify(record, null, 2)}</pre></article>)}
      </section>
    </> : null}
    <p><button style={control} disabled>Generate notice</button> {realNoticeRefusal}</p>
    <p><button style={control} disabled>Send notice</button> {realNoticeRefusal}</p>
    <a style={{ ...control, display: "inline-block" }} href={`/jobs/${encodeURIComponent(jobId)}`}>Back to job</a>
  </main>;
}
