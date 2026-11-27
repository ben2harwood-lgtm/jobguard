"use client";
import { useEffect, useRef, useState } from "react";
type View = { jobId: string; revisionId: string; variationVersion: number; amount: string; description: string;
  photoIds: string[]; expectedVersion: number; agreedAt: string | null };
type AgreementCommand = { commandId: string; occurredAt: string; name: string };
export function nextAgreeState(result: "refused" | "unknown" | "read" | "unavailable", current: AgreementCommand | null) {
  return {
    command: result === "read" ? null : current,
    canCheckAgain: result === "refused",
    notice: result === "refused" ? "Agreement refused. Ask the builder for a fresh link."
      : result === "unknown" ? "Agreement result unknown. Retry to check the same agreement."
      : result === "unavailable" ? "This link is unavailable. Ask the builder for a fresh link." : "",
  };
}
export function CustomerExtraAgreement({ capability }: { capability: string }) {
  const [view, setView] = useState<View | null>(null), [name, setName] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const command = useRef<AgreementCommand | null>(null);
  const [canCheckAgain, setCanCheckAgain] = useState(false);
  function applyResult(result: Parameters<typeof nextAgreeState>[0]) {
    const next = nextAgreeState(result, command.current);
    command.current = next.command; setNotice(next.notice); setCanCheckAgain(next.canCheckAgain);
  }
  const endpoint = `/api/v2/extra-links/${encodeURIComponent(capability)}`;
  useEffect(() => {
    let active = true;
    setView(null); setNotice(""); command.current = null; setCanCheckAgain(false);
    void fetch(endpoint, { cache: "no-store" }).then(async r => {
      if (!r.ok) throw new Error();
      const value = await r.json() as View;
      if (active) setView(value);
    }).catch(() => { if (active) setNotice("This link is unavailable. Ask the builder for a fresh link."); });
    return () => { active = false; };
  }, [endpoint]);
  async function checkAgain() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const value = await response.json() as View;
      setView(value); applyResult("read");
    } catch { setView(null); applyResult("unavailable"); }
    finally { setBusy(false); }
  }
  async function agree() {
    if (!view || busy) return;
    setBusy(true); setNotice("");
    command.current ??= { commandId: crypto.randomUUID(), occurredAt: new Date().toISOString(), name: name.trim() };
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: "v2-extra-link.v1", action: "agree", ...command.current,
          expectedVersion: view.expectedVersion, jobId: view.jobId, revisionId: view.revisionId, amount: view.amount }) });
      if (!response.ok) { applyResult("refused"); return; }
      setView(await response.json() as View); setCanCheckAgain(false);
    } catch { applyResult("unknown"); }
    finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 640, margin: "0 auto", padding: 20, overflowWrap: "anywhere" }}>
    <h1>Agree to this extra</h1><p>Practice only — no message is sent and no payment is taken.</p>
    {notice && <p role="alert">{notice}</p>}
    {canCheckAgain && <button disabled={busy} onClick={() => void checkAgain()} style={{ minHeight: 44, padding: "10px 24px" }}>Check again</button>}
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
