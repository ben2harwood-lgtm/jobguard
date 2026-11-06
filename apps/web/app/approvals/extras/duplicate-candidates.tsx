"use client";
import { useCallback, useEffect, useState } from "react";
import styles from "../../northside/northside.module.css";
type Member = { extraId: string; canonicalId: string; description: string };
type Candidates = { jobId: string; revision: number; groups: Array<{ id: string; fingerprint: string; extras: Member[] }>;
 activeLinks: Array<{ linkId: string; duplicateId: string; canonicalId: string; duplicateLabel: string; canonicalLabel: string }> };
const target = { minHeight: 44, minWidth: 44, maxWidth: "100%" };
export function DuplicateCandidates({ jobId, onChange }: { jobId: string; onChange: () => Promise<void> }) {
 const [data, setData] = useState<Candidates | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
 const [dismissReason, setDismissReason] = useState<Record<string, string>>({});
 const [canonical, setCanonical] = useState<Record<string, string>>({}), [duplicate, setDuplicate] = useState<Record<string, string>>({}), [reason, setReason] = useState<Record<string, string>>({});
 const load = useCallback(async () => {
  const response = await fetch(`/api/contractor/jobs/${jobId}/duplicate-candidates`, { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(`That step was refused (${body.code}).`);
  setData(body);
 }, [jobId]);
 useEffect(() => { void load().catch(e => { setData(null); setError((e as Error).message); }); }, [load]);
 async function act(path: string, body: Record<string, unknown>) {
  setBusy(true); setError("");
  try {
   const response = await fetch(`/api/contractor/jobs/${jobId}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ commandId: crypto.randomUUID(), ...body }) });
   const result = await response.json();
   if (!response.ok) throw new Error(`That step was refused (${result.code}).`);
   await load(); await onChange();
  } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
 }
 return <section aria-label={`Possible duplicates on job ${jobId}`} className={styles.card}>
  <h3 style={{ overflowWrap: "anywhere" }}>Job {jobId}</h3>
  {error && <p role="alert">{error}</p>}
  {!data ? (error ? null : <p>Loading possible duplicates…</p>) : <>
   {data.groups.length === 0 ? <p>No unresolved candidate groups.</p> : <p>These extras stop the billing export until they are linked or reviewed as not duplicates.</p>}
   {data.groups.map(group => {
    const roots = group.extras.filter(x => x.extraId === x.canonicalId);
    const keep = canonical[group.id] ?? roots[0]?.extraId ?? "";
    const choices = roots.filter(x => x.extraId !== keep);
    const link = choices.some(x => x.extraId === duplicate[group.id]) ? duplicate[group.id]! : choices[0]?.extraId ?? "";
    return <fieldset key={group.id} disabled={busy} style={{ minWidth: 0 }}>
     <legend>Candidate group</legend>
     <ul>{group.extras.map(x => <li key={x.extraId}>{x.description} <small style={{ overflowWrap: "anywhere" }}>({x.extraId})</small></li>)}</ul>
     <label htmlFor={`canonical-${group.id}`}>Canonical extra to bill</label>
     <select id={`canonical-${group.id}`} style={target} value={keep} onChange={e => setCanonical({ ...canonical, [group.id]: e.target.value })}>{roots.map(x => <option key={x.extraId} value={x.extraId}>{x.description} ({x.extraId})</option>)}</select>
     <label htmlFor={`duplicate-${group.id}`}>Extra to link to canonical</label>
     <select id={`duplicate-${group.id}`} style={target} value={link} onChange={e => setDuplicate({ ...duplicate, [group.id]: e.target.value })}>{choices.map(x => <option key={x.extraId} value={x.extraId}>{x.description} ({x.extraId})</option>)}</select>
     <button style={target} disabled={busy || !keep || !link} onClick={() => void act("duplicate-candidates", { version: "mark-duplicate.v1", duplicateId: link, canonicalId: keep })}>Link duplicate</button>
     <label htmlFor={`dismiss-${group.id}`}>Reason these are not duplicates (required)</label>
     <select id={`dismiss-${group.id}`} style={target} required value={dismissReason[group.id] ?? ""} onChange={e => setDismissReason({ ...dismissReason, [group.id]: e.target.value })}>
      <option value="">Choose a reason</option><option value="different_work">Different work</option><option value="different_location">Different location</option>
     </select>
     <button style={target} disabled={busy || !dismissReason[group.id]} onClick={() => void act("duplicate-dispositions", { version: "duplicate-disposition.v1", groupId: group.id, fingerprint: group.fingerprint, disposition: "not_duplicates", reasonCode: dismissReason[group.id] })}>Not duplicates</button>
    </fieldset>;
   })}
   {data.activeLinks.map(link => <fieldset key={link.linkId} disabled={busy} style={{ minWidth: 0 }}>
    <legend>Linked extras</legend><p>{link.duplicateLabel} linked to {link.canonicalLabel}</p>
    <label htmlFor={`reason-${link.linkId}`}>Reason for un-linking (required)</label>
    <select id={`reason-${link.linkId}`} style={target} required value={reason[link.linkId] ?? ""} onChange={e => setReason({ ...reason, [link.linkId]: e.target.value })}>
     <option value="">Choose a reason</option><option value="linked_in_error">Linked in error</option><option value="wrong_pair">Wrong pair</option><option value="not_same_work">Not the same work</option>
    </select>
    <button style={target} disabled={busy || !reason[link.linkId]} onClick={() => void act("duplicate-unlinks", { version: "extra-duplicate-unlink.v1", linkId: link.linkId, expectedRevision: data.revision, reasonCode: reason[link.linkId] })}>Un-link extras</button>
   </fieldset>)}
  </>}
 </section>;
}
