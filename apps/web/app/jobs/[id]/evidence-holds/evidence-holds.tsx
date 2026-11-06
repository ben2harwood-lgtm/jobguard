"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Item = { evidenceId: string; label: string; commandId: string | null; message: string;
  holdId: string | null; held: boolean; canApply: boolean; canRelease: boolean };
type Pending = { version: "evidence-hold.v1"; commandId: string; idempotencyKey: string;
  evidenceId: string; action: "apply_hold" | "release_hold"; releaseOf?: string };
const target = { minHeight: 44, minWidth: 44, maxWidth: "100%" } as const;
export function EvidenceHolds({ jobId }: { jobId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const locked = useRef(false);
  const key = `evidence-hold.v1:${jobId}`;
  const url = `/api/jobs/${encodeURIComponent(jobId)}/evidence-holds`;
  const refresh = useCallback(async () => {
    setItems([]); // A failed refresh must not leave stale authority on screen.
    try {
      const response = await fetch(url, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) { setMessage(body.message); return; }
      setItems(body.items);
    } catch { setMessage("Evidence holds could not be loaded. Refresh to try again."); }
  }, [url]);
  useEffect(() => {
    try { const saved = sessionStorage.getItem(key); if (saved) setPending(JSON.parse(saved)); }
    catch { setMessage("Saved request could not be read. Keep this screen open when retrying."); }
    void refresh();
  }, [key, refresh]);
  async function submit(action: Pending["action"]) {
    if (locked.current) return;
    const item = items.find(value => value.evidenceId === selected);
    if (!pending && !item) return;
    const request = pending ?? { version: "evidence-hold.v1" as const, commandId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(), evidenceId: item!.evidenceId, action,
      ...(action === "release_hold" ? { releaseOf: item!.holdId! } : {}) };
    // Persist before sending; uncertain results always retry this exact payload.
    try { sessionStorage.setItem(key, JSON.stringify(request)); }
    catch { setMessage("The request could not be saved for safe retry. No request was sent."); return; }
    setPending(request); locked.current = true; setBusy(true);
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), cache: "no-store" });
      const body = await response.json();
      setMessage(body.message);
      // The repository sanitizes database failures to WORM_REFUSED as well.
      // A 403 therefore cannot prove that COMMIT did not happen; keep the IDs.
      if (response.ok || [400, 401, 404, 409].includes(response.status)) { sessionStorage.removeItem(key); setPending(null); }
      await refresh();
    } catch { setMessage("The server has not confirmed the result. Retry the same request."); }
    finally { locked.current = false; setBusy(false); }
  }
  const item = items.find(value => value.evidenceId === selected);
  return <section style={{ maxWidth: "100%", overflowWrap: "anywhere" }} aria-label="Hold requests">
    <p role="status" aria-live="polite">{message}</p>
    <label htmlFor="hold-evidence">Synthetic evidence</label>{" "}
    <select id="hold-evidence" value={selected} disabled={busy || !!pending} onChange={event => setSelected(event.target.value)} style={target}>
      <option value="">Choose an item</option>
      {items.map((value, index) => <option key={value.evidenceId} value={value.evidenceId}>{index + 1}. {value.label}</option>)}
    </select>
    {items.length === 0 && <p>No holdable evidence is available.</p>}
    {item && <div><p>{item.message}</p><p>{item.held ? "Stored hold is applied." : "No applied hold is confirmed."}</p></div>}
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
      {pending ? <button style={target} disabled={busy} onClick={() => void submit(pending.action)}>Retry same request</button> : <>
        <button style={target} disabled={busy || !item?.canApply} onClick={() => void submit("apply_hold")}>Request hold</button>
        <button style={target} disabled={busy || !item?.canRelease} onClick={() => void submit("release_hold")}>Request release</button>
      </>}
      <button style={target} disabled={busy} onClick={() => void refresh()}>Refresh status</button>
    </div>
    <p>A different owner must release an applied hold. Releasing a hold leaves the evidence stored.</p>
  </section>;
}
