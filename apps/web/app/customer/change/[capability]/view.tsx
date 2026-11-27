"use client";
import { useEffect, useRef, useState } from "react";
type View = { jobId: string; revisionId: string; variationVersion: number; amount: string; description: string;
  photoIds: string[]; expectedVersion: number; agreedAt: string | null };
export function CustomerExtraAgreement({ capability }: { capability: string }) {
  const [view, setView] = useState<View | null>(null), [name, setName] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const command = useRef<{ commandId: string; occurredAt: string; name: string } | null>(null);
  const endpoint = `/api/v2/extra-links/${encodeURIComponent(capability)}`;
  useEffect(() => {
    let active = true;
    setView(null); setNotice(""); command.current = null;
    void fetch(endpoint, { cache: "no-store" }).then(async r => {
      if (!r.ok) throw new Error();
      const value = await r.json() as View;
      if (active) setView(value);
    }).catch(() => { if (active) setNotice("This link is unavailable. Ask the builder for a fresh link."); });
    return () => { active = false; };
  }, [endpoint]);
  async function agree() {
    if (!view || busy) return;
    setBusy(true); setNotice("");
    command.current ??= { commandId: crypto.randomUUID(), occurredAt: new Date().toISOString(), name: name.trim() };
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: "v2-extra-link.v1", action: "agree", ...command.current,
          expectedVersion: view.expectedVersion, jobId: view.jobId, revisionId: view.revisionId, amount: view.amount }) });
      if (!response.ok) { setNotice("Agreement refused. Ask the builder for a fresh link."); return; }
      setView(await response.json() as View);
    } catch { setNotice("Agreement result unknown. Retry to check the same agreement."); }
    finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 640, margin: "0 auto", padding: 20, overflowWrap: "anywhere" }}>
    <h1>Agree to this extra</h1><p>Practice only — no message is sent and no payment is taken.</p>
    {notice && <p role="alert">{notice}</p>}
    {!view && !notice && <p>Loading extra…</p>}
    {view && <><h2>{view.description}</h2><p>Variation version {view.variationVersion}</p>
      <p style={{ fontSize: 28 }}><strong>£{view.amount}</strong> net change</p>
      {view.photoIds.map((id, i) => <img key={id} src={`${endpoint}/photos/${id}`} alt={`Photo ${i + 1} of this extra`} style={{ width: "100%", height: "auto" }} />)}
      {view.agreedAt ? <p role="status">Agreement recorded at {new Date(view.agreedAt).toLocaleString("en-GB")}. The builder will confirm this extra.</p> : <>
        <label>Your name<input maxLength={120} value={name} disabled={busy || command.current !== null} onChange={e => setName(e.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box", margin: "12px 0" }} /></label>
        <p>By selecting “I agree”, you agree to this description and net price. Your typed name is recorded for the builder.</p>
        <button disabled={busy || !name.trim()} onClick={() => void agree()} style={{ minHeight: 44, padding: "10px 24px" }}>I agree</button>
      </>}
    </>}
  </main>;
}
