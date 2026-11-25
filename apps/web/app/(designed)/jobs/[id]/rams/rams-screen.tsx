"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RamsScreen as Screen } from "@jobguard/api/workspace";
import type { RamsDraft } from "@jobguard/db";
import { DesignedJob } from "../../../jobs-screens";
import { Card, Empty, Note, Tag } from "../../../designed-ui";

const signedDate = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/London" });

const problem: Record<string, string> = {
  FORBIDDEN: "You cannot save this change. Reload the page and check that you are signed in.",
  RAMS_INCOMPLETE: "Complete the missing sections and review every flagged change before signing.",
  RAMS_PLAN_CHANGED: "The plan has changed. Generate a new draft and check the sections before signing.",
  RAMS_VERSION_CONFLICT: "This draft changed in another window. Reload it before continuing.",
  RAMS_DRAFT_REQUIRED: "This version is signed and read-only. Make a new draft to change it.",
};

export function RamsScreen({ jobId }: { jobId: string }) {
  const [screen, setScreen] = useState<Screen | null>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [editor, setEditor] = useState<{ key: string; text: string } | null>(null);
  const [name, setName] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alert = useRef<HTMLDivElement>(null);
  const pending = useRef<{ payload: Record<string, unknown>; commandId: string } | null>(null);
  const path = `/api/jobs/${jobId}/rams`;
  const load = useCallback(async () => {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error("The safety draft could not be loaded. Your saved versions are unchanged.");
    const data: Screen = await response.json();
    const session = await fetch("/api/auth/session", { cache: "no-store" });
    if (!session.ok) throw new Error("Sign in again to edit this safety draft.");
    setCsrfToken((await session.json()).csrfToken);
    setScreen(data);
    return data;
  }, [path]);
  useEffect(() => { void load().catch(error => setError(String(error.message))); }, [load]);
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  const latest = screen?.drafts.at(-1);
  const draft = screen?.drafts.find(item => item.revision === selected) ?? latest;
  const stale = !!draft && (draft.quoteRevisionId !== screen?.plan.quoteRevisionId || draft.planVersion !== screen?.plan.planVersion ||
    (draft.planHash !== undefined && draft.planHash !== screen?.plan.planHash));
  const readOnly = draft?.status === "signed" || draft?.revision !== latest?.revision || stale;
  const ready = !!screen?.canSign;

  async function command(action: "generate" | "edit" | "sign", extra: Record<string, unknown> = {}) {
    if (!screen || busy) return;
    const payload = { version: "rams-command.v1", action, expectedVersion: latest?.revision ?? 0,
      quoteRevisionId: screen.plan.quoteRevisionId, expectedPlanVersion: screen.plan.planVersion, ...extra };
    if (JSON.stringify(pending.current?.payload) !== JSON.stringify(payload)) {
      pending.current = { payload, commandId: crypto.randomUUID() };
    }
    setBusy(true); setError("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ ...payload, commandId: pending.current!.commandId }) });
      const saved = await response.json() as RamsDraft & { code?: string };
      if (!response.ok) throw new Error(problem[saved.code ?? ""] ?? "The change was not saved. Check the connection and retry.");
      pending.current = null;
      setScreen(current => current && ({ ...current, drafts: [...current.drafts.filter(item => item.revision !== saved.revision), saved], canSign: false }));
      setSelected(saved.revision); setEditor(null); setChecked(false); setName("");
      await load();
    } catch (error) { setError(error instanceof Error ? error.message : "The change was not saved."); }
    finally { setBusy(false); }
  }
  const versions = screen?.drafts.filter((item, index, all) => all[index + 1]?.documentVersion !== item.documentVersion) ?? [];
  return <DesignedJob jobId={jobId} tab="work">
    <div className="rams-page">
      <h1>RAMS draft</h1>
      <p>Practice sandbox — synthetic data; nothing is sent or charged</p>
      <p>Use only the fictional job and fictional contacts supplied for this practice.</p>
      {error && <div role="alert" tabIndex={-1} ref={alert}><Note tone="warning">{error}</Note></div>}
      <div className="rams-controls">
        <button className="btn" disabled={busy} onClick={() => { void load().then(() => { setSelected(null); setEditor(null); setChecked(false); setError(""); }).catch(error => setError(error.message)); }}>Reload draft</button>
        {screen && <button className="btn primary" disabled={busy} onClick={() => void command("generate")}>{latest ? "Generate new draft" : "Generate draft"}</button>}
        {draft && <><button className="btn" onClick={() => window.print()} disabled={busy}>Print</button>
          <label>Saved version<select aria-label="Saved version" value={draft.revision} onChange={event => { setSelected(Number(event.target.value)); setEditor(null); setChecked(false); }}>
            {versions.map(item => <option key={item.revision} value={item.revision}>Version {item.documentVersion} — {item.status}</option>)}
          </select></label></>}
      </div>
      {!screen && !error && <p role="status">Loading safety drafts…</p>}
      {screen && !draft && <Empty title="No safety draft yet" text="Generate a draft from the job's current plan, then check and complete each section."/>}
      {draft && <article id="rams-document">
        <h1>Risk assessment, method statement and construction phase plan</h1>
        <p className="rams-warning">{screen?.warning}</p>
        <p>Practice sandbox — synthetic data; nothing is sent or charged</p>
        <p>{(draft.job ?? screen?.job)?.title}</p>
        <p>{(draft.job ?? screen?.job)?.address}</p>
        <p>Version {draft.documentVersion} · <Tag>{draft.status === "signed" ? "Signed — read-only" : "Draft — check before use"}</Tag></p>
        <p>Based on work plan version {draft.planVersion}</p>
        {stale && <Note tone="warning">The plan has changed. Generate a new draft. This saved version is unchanged.</Note>}
        {draft.sections.map(section => <Card key={section.key} title={section.heading}
          action={!readOnly && <button className="btn rams-controls" disabled={busy} onClick={() => setEditor({ key: section.key, text: section.text })}>Edit {section.heading}</button>}>
          <p className="rams-section-text card-body">{section.text}</p>
          {section.needsReview && <Note tone="warning">Plan change clashes with your edit. Check and save this section to confirm it still fits.</Note>}
          {section.required && !section.edited && <p>To complete before signing</p>}
          {editor?.key === section.key && !readOnly && <div className="rams-controls rams-editor">
            <label>Unsaved edit — {section.heading}<textarea aria-label={`Unsaved edit — ${section.heading}`} value={editor.text} maxLength={8000} onChange={event => setEditor({ ...editor, text: event.target.value })}/></label>
            <button className="btn primary" disabled={busy || !editor.text.trim()} onClick={() => void command("edit", { sectionKey: editor.key, text: editor.text })}>Save section</button>
            <button className="btn" disabled={busy} onClick={() => setEditor(null)}>Cancel edit</button>
          </div>}
        </Card>)}
        <section><h2>Builder signature</h2>
          <p>{draft.signedBy ? `Signed by ${draft.signedName} on ${signedDate.format(new Date(draft.signedAt!))}` : "Not signed — builder must check and complete this draft."}</p>
          {!readOnly && <div className="rams-controls">
            <label>Your name<input value={name} maxLength={100} onChange={event => setName(event.target.value)}/></label>
            <label><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)}/> I have checked every section and completed the site-specific assessment.</label>
            <button className="btn primary" disabled={busy || !ready || !checked || !name.trim() || !!editor} onClick={() => void command("sign", { checkedAllSections: true, signerName: name })}>Sign this version</button>
          </div>}
        </section>
      </article>}
    </div>
  </DesignedJob>;
}
