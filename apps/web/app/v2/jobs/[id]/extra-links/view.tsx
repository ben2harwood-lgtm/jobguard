"use client";
import { useCallback, useEffect, useState } from "react";
import type { VariationWorkspaceResponse } from "@jobguard/api/variation-contracts";
type Link = { id: string; variationId: string; revisionId: string; amount: string; expectedVersion: number;
  agreedAt: string | null; agreedBy: string | null; cancelledAt: string | null; expiresAt: string };
type State = { variations: VariationWorkspaceResponse; links: Link[]; photos: { id: string; receivedAt: string }[] };
const attestation = "Builder-recorded practice acceptance — not an authenticated customer signature";
export function BuilderExtraLinks({ jobId }: { jobId: string }) {
  const [state, setState] = useState<State | null>(null), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [inbox, setInbox] = useState<{ linkId: string; capability: string }[]>([]), [photoIds, setPhotoIds] = useState<string[]>([]);
  const endpoint = `/api/jobs/${jobId}/extra-links`;
  const load = useCallback(async () => {
    const r = await fetch(endpoint, { cache: "no-store" });
    if (!r.ok) throw new Error();
    setState(await r.json() as State);
  }, [endpoint]);
  useEffect(() => { void load().catch(() => setNotice("Sign in to the correct practice firm to manage links.")); }, [load]);
  async function command(body: unknown, approval = false) {
    if (busy) return;
    setBusy(true); setNotice("");
    try {
      const r = await fetch(approval ? `/api/jobs/${jobId}/variations` : endpoint,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error();
      const result = await r.json() as { linkId?: string; capability?: string };
      if (result.linkId && result.capability) setInbox(rows => [...rows, { linkId: result.linkId!, capability: result.capability! }]);
      await load();
    } catch { setNotice("Result unknown or refused. Reload the saved links before trying again."); }
    finally { setBusy(false); }
  }
  function create(v: VariationWorkspaceResponse["variations"][number]) {
    const r = v.revisions.find(r => r.id === v.currentRevisionId);
    if (!r) return;
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
    void command({ version: "v2-extra-link.v1", action: "create", commandId: crypto.randomUUID(),
      occurredAt: new Date().toISOString(), expectedVersion: r.revision, variationId: v.id, revisionId: r.id,
      token, expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
      photoIds });
  }
  return <main style={{ maxWidth: 760, margin: "0 auto", padding: 20, overflowWrap: "anywhere" }}>
    <h1>Customer agreement links</h1><p>Practice links go only to the local test inbox. A typed agreement still needs your approval below.</p>
    {notice && <p role="alert">{notice}</p>}
    <fieldset disabled={busy}><legend>Photos to include with the next link (optional)</legend>
      {state?.photos.length ? state.photos.map((photo, i) => <label key={photo.id} style={{ display: "block", margin: "12px 0" }}>
        <input type="checkbox" checked={photoIds.includes(photo.id)} onChange={e => setPhotoIds(ids => e.target.checked ? [...ids, photo.id] : ids.filter(id => id !== photo.id))} />
        Photo {i + 1} · received {new Date(photo.receivedAt).toLocaleString("en-GB")}
      </label>) : <p>No verified photos for this job yet.</p>}
    </fieldset>
    {state?.variations.variations.map(v => {
      const r = v.revisions.find(r => r.id === v.currentRevisionId);
      return <section key={v.id}><h2>{r?.description ?? v.description}</h2>
        {r && !r.approved && !r.rejected && <button disabled={busy} onClick={() => create(v)}>Make customer link for version {r.revision}</button>}
        {state.links.filter(l => l.variationId === v.id).map(l => <article key={l.id}>
          <p>£{l.amount} · {l.cancelledAt ? "Cancelled" : l.agreedAt ? `Customer agreed by link at ${l.agreedAt}: ${l.agreedBy}` : `Waiting until ${l.expiresAt}`}</p>
          {l.agreedAt && r?.id === l.revisionId && !r.approved && !r.rejected && <button disabled={busy} onClick={() => void command({
            version: "variation-command.v1", action: "approve", variationId: v.id, revisionId: r.id,
            approvalId: crypto.randomUUID(), attestation }, true)}>Customer agreed by link at {l.agreedAt}: approve</button>}
          {!l.agreedAt && !l.cancelledAt && <button disabled={busy} onClick={() => void command({ version: "v2-extra-link.v1", action: "cancel",
            commandId: crypto.randomUUID(), occurredAt: new Date().toISOString(), linkId: l.id, expectedVersion: l.expectedVersion })}>Cancel link</button>}
          {l.revisionId !== v.currentRevisionId && <p>Old version — make a fresh link.</p>}
        </article>)}
      </section>;
    })}
    <section aria-label="Local test inbox"><h2>Local test inbox</h2><p>Links created in this visit. Nothing is sent externally.</p>
      {inbox.map(l => <p key={l.linkId}><a href={`/customer/change/${l.capability}`} target="_blank" rel="noreferrer">Open customer link</a></p>)}
    </section>
  </main>;
}
