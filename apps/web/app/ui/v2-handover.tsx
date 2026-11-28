"use client";
// V2-G2 (Q56): Job › Records › Handover, following M3's Handover mock. G3 mounts Release in the version history.
import { useCallback, useEffect, useRef, useState } from "react";
import type { HandoverChoice, HandoverContent, HandoverRefusal, HandoverSectionKey, HandoverSources, HandoverVersion } from "@jobguard/api/workspace";
import { Card, Empty, Note } from "../(designed)/designed-ui";
import { HandoverPack, handoverEmpty, handoverIntro, handoverProblem, handoverProblemText, handoverRefusalText, handoverSaved,
  handoverTitle, handoverVersionLine } from "./v2-handover-label";
import { HandoverReleases } from "./v2-handover-release";

const sections: { key: HandoverSectionKey; title: string }[] = [{ key: "done", title: "What was done" }, { key: "changes", title: "Changes" },
  { key: "photos", title: "Photos" }, { key: "certificates", title: "Manuals and certificates" }, { key: "snags", title: "Outstanding snags" },
  { key: "contacts", title: "Contacts" }];
type View = { sources: HandoverSources; versions: HandoverVersion[] };
const blank: HandoverChoice = { sections: ["contacts"], lineIds: [], variationIds: [], photoIds: [], snagIds: [], certificates: [] };
const tick = { display: "flex", flexDirection: "row", gap: 12, alignItems: "center", minHeight: 44 } as const;
const box = { width: 44, height: 44, flex: "0 0 44px" } as const;
const toggle = (rows: string[], id: string, on: boolean) => on ? [...rows, id] : rows.filter(row => row !== id);
/** Keep only the chosen ids that the refreshed sources still offer. */
export function reconcileChoice(choice: HandoverChoice, sources: HandoverSources): HandoverChoice {
  const keep = (rows: string[], offered: string[]) => rows.filter(id => offered.includes(id));
  return { ...choice, lineIds: keep(choice.lineIds, sources.lines.map(row => row.id)),
    variationIds: keep(choice.variationIds, sources.variations.map(row => row.variationId)),
    photoIds: keep(choice.photoIds, sources.photos.map(row => row.id)), snagIds: keep(choice.snagIds, sources.snags.map(row => row.id)) };
}

export function HandoverScreen({ jobId }: { jobId: string }) {
  const endpoint = `/api/jobs/${encodeURIComponent(jobId)}/handover`;
  const [view, setView] = useState<View | null>(null), [problem, setProblem] = useState(false), [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<HandoverChoice>(blank), [notice, setNotice] = useState(""), [status, setStatus] = useState("");
  const [preview, setPreview] = useState<{ content: HandoverContent; contentHash: string } | null>(null), [refused, setRefused] = useState<HandoverRefusal[]>([]);
  const [opened, setOpened] = useState<number | null>(null);
  // One command id per chosen content until a response arrives, so a retried save makes one version.
  const pending = useRef<{ key: string; commandId: string } | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) throw new Error();
    const next = await response.json() as View;
    setView(next); setProblem(false);
    // A snag checked or a photo invalidated elsewhere drops out of the sources: drop it from the choice too,
    // so its hidden tick can't keep refusing every preview.
    setChoice(current => reconcileChoice(current, next.sources));
  }, [endpoint]);
  useEffect(() => { void load().catch(() => setProblem(true)); }, [load]);
  const change = (next: HandoverChoice) => { setChoice(next); setPreview(null); setRefused([]); setStatus(""); };

  async function post(body: Record<string, unknown>) {
    setBusy(true); setNotice("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({})) as { code?: string; refused?: HandoverRefusal[] } & Record<string, unknown>;
      if (!response.ok) {
        if (response.status !== 503) pending.current = null;
        setNotice(handoverProblemText(result.code)); setRefused(result.refused ?? []);
        if (response.status === 409 && !result.refused) { setPreview(null); await load().catch(() => undefined); }
        return null;
      }
      pending.current = null;
      return result;
    } catch { setNotice("Result unknown. Reload before trying again."); return null; }
    finally { setBusy(false); }
  }
  async function showPreview() {
    const result = await post({ version: "v2-handover-preview.v1", choice }) as { preview: { content: HandoverContent; refused: HandoverRefusal[]; contentHash: string } } | null;
    if (result) { setPreview({ content: result.preview.content, contentHash: result.preview.contentHash }); setRefused(result.preview.refused); }
  }
  async function save() {
    // The saved version is the one the builder previewed: a source changed since then refuses the save.
    if (!preview) return;
    const body = { version: "v2-handover-save-command.v1", expectedVersion: view?.versions.at(-1)?.version ?? 0, choice, previewHash: preview.contentHash };
    const key = JSON.stringify(body);
    if (pending.current?.key !== key) pending.current = { key, commandId: crypto.randomUUID() };
    const result = await post({ ...body, commandId: pending.current.commandId }) as { saved: HandoverVersion } | null;
    if (result) { setStatus(handoverSaved(result.saved.version)); setPreview(null); await load().catch(() => setProblem(true)); }
  }

  if (problem) return <div role="alert"><Note tone="warning">{handoverProblem}</Note></div>;
  if (!view) return <p>Loading handover…</p>;
  const { sources, versions } = view;
  const nothing = !sources.lines.length && !sources.variations.length && !sources.photos.length && !sources.snags.length;
  if (nothing && !versions.length) return <Empty title={handoverEmpty[0]} text={handoverEmpty[1]}/>;
  const on = (key: HandoverSectionKey) => choice.sections.includes(key);
  const item = (key: "lineIds" | "variationIds" | "photoIds" | "snagIds", id: string, label: string) =>
    <label key={id} style={tick}><input type="checkbox" style={box} disabled={busy} checked={choice[key].includes(id)}
      onChange={event => change({ ...choice, [key]: toggle(choice[key], id, event.target.checked) })}/>{label}</label>;
  return <div className="form" data-testid="handover" style={{ overflowWrap: "anywhere" }}>
    <Card title={handoverTitle((versions.at(-1)?.version ?? 0) + 1)} sub="Practice job · saving sends nothing">
      <div className="card-body form"><p>{handoverIntro}</p>
        {sections.map(section => <fieldset key={section.key} style={{ border: 0, padding: 0, margin: 0 }}>
          <label style={tick}><input type="checkbox" style={box} disabled={busy} checked={on(section.key)}
            onChange={event => change({ ...choice, sections: event.target.checked ? [...choice.sections, section.key] : choice.sections.filter(key => key !== section.key) })}/>
            <strong>{section.title}</strong></label>
          {on(section.key) && <div style={{ paddingLeft: 24 }}>
            {section.key === "done" && sources.lines.map(row => item("lineIds", row.id, row.description))}
            {section.key === "changes" && (sources.variations.length ? sources.variations.map(row => item("variationIds", row.variationId, `Agreed change · ${row.description}`)) : <p>No agreed changes.</p>)}
            {section.key === "photos" && (sources.photos.length ? sources.photos.map((row, index) => item("photoIds", row.id, `Site photo ${index + 1}`)) : <p>No verified photos.</p>)}
            {section.key === "snags" && (sources.snags.length ? sources.snags.map(row => item("snagIds", row.id, `${row.title}${row.owner ? ` · ${row.owner}` : ""}`)) : <p>No outstanding snags.</p>)}
            {section.key === "contacts" && <p>{sources.contact ? sources.contact.tradingName : "Firm details not saved yet."} · Aftercare: contact the builder about this job.</p>}
            {section.key === "certificates" && <>
              {choice.certificates.map((row, index) => <div key={index} className="form">
                <label>Manual or certificate<input value={row.text} maxLength={200} disabled={busy} onChange={event => change({ ...choice,
                  certificates: choice.certificates.map((other, at) => at === index ? { ...other, text: event.target.value } : other) })}/></label>
                <label>Status<select value={row.status} disabled={busy} onChange={event => change({ ...choice,
                  certificates: choice.certificates.map((other, at) => at === index ? { ...other, status: event.target.value as "included" | "still_needed" } : other) })}>
                  <option value="included">Included</option><option value="still_needed">Still needed: supplied separately</option></select></label>
                <button type="button" className="btn" disabled={busy} onClick={() => change({ ...choice, certificates: choice.certificates.filter((_, at) => at !== index) })}>Remove</button>
              </div>)}
              <button type="button" className="btn" disabled={busy || choice.certificates.length >= 30}
                onClick={() => change({ ...choice, certificates: [...choice.certificates, { text: "", status: "included" }] })}>Add a manual or certificate</button>
            </>}
          </div>}
        </fieldset>)}
        {notice && <p role="alert">{notice}</p>}
        {refused.length > 0 && <ul aria-label="Lines to fix">{refused.map((row, index) => <li key={index}>{handoverRefusalText(row)}</li>)}</ul>}
        {status && <p role="status">{status}</p>}
        <div className="form-actions" style={{ flexWrap: "wrap" }}>
          <button type="button" className="btn" disabled={busy || !choice.sections.length || choice.certificates.some(row => !row.text.trim())}
            onClick={() => preview ? setPreview(null) : void showPreview()}>{preview ? "Close customer preview" : "Preview as the customer sees it"}</button>
          <button type="button" className="btn primary" disabled={busy || !preview || !choice.sections.length || choice.certificates.some(row => !row.text.trim())}
            onClick={() => void save()}>Save this version</button>
        </div>
      </div>
    </Card>
    {preview && <section aria-label="Customer preview" className="form"><h2>Your handover pack</h2><HandoverPack content={preview.content}/></section>}
    <Card title="Version history"><div className="card-body form">
      {versions.length ? versions.map(row => <div key={row.version}>
        <p>{handoverVersionLine(row)}</p>
        <button type="button" className="btn" onClick={() => setOpened(opened === row.version ? null : row.version)}>
          {opened === row.version ? "Close" : `Open version ${row.version}`}</button>
        {opened === row.version && <HandoverPack content={row.content}/>}
      </div>) : <p>No version saved yet.</p>}
      {versions.length > 0 && <HandoverReleases jobId={jobId} versions={versions.map(row => row.version)}/>}
    </div></Card>
  </div>;
}
