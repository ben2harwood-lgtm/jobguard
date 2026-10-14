"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { pounds } from "../../lib/pounds";
import styles from "../../northside/northside.module.css";

type Extra = { extraId: string; jobId: string; orderReference: string; description: string; note: string; state: string; hasPhoto: boolean; residentConfirmed: boolean; quotedPence: number | null; netPence: number | null; requestId: string | null;
  steps: Array<{ index: number; role: string; done: boolean }>; nextStepIndex: number | null; nextStepRole: string | null; clientRequired: boolean; linkIssued: boolean; linkClosed: string | null; outcome: string | null };
type Rate = { code: string; description: string; unit: string; ratePence: number };
const words: Record<string, string> = { logged: "Logged", awaiting_approval: "Waiting for approval", approved: "Approved", rejected: "Not approved" };
async function act(extra: Extra, action: string, body: Record<string, unknown>) {
  const r = await fetch(`/api/northside/extras/${extra.extraId}/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: extra.jobId, commandId: crypto.randomUUID(), ...body }) });
  return { ok: r.ok, body: await r.json().catch(() => ({})) };
}

/** One list for the people who move an extra along: the surveyor prices it, the supervisor submits and approves, the owner sends it to the client. Each sees only the button for their step. */
export function ExtraApprovals() {
  const [role, setRole] = useState(""), [extras, setExtras] = useState<Extra[] | null>(null), [rates, setRates] = useState<Record<string, Rate[]>>({}), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ extraId: string; path: string; recipient: string } | null>(null);
  const [pick, setPick] = useState<Record<string, { code: string; quantity: string }>>({});
  const load = useCallback(async () => {
    const r = await fetch("/api/northside/extras", { cache: "no-store" });
    if (r.status === 401) { setError("Sign in to the practice first (open the practice hub)."); setExtras([]); return; }
    const body = await r.json(); setRole(body.role); setExtras(body.extras); setRates(body.rates ?? {});
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function run(extra: Extra, action: string, body: Record<string, unknown> = {}) {
    setBusy(true); setError("");
    try {
      const r = await act(extra, action, body); if (!r.ok) throw new Error(`That step was refused (${r.body.code}).`);
      if (action === "send") setLink({ extraId: extra.extraId, path: r.body.path, recipient: r.body.recipient });
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <main className={styles.page}>
    <Link href="/northside">Practice hub</Link>
    <h1>Extras to move along</h1>
    <p className={styles.note}>Practice data. You are signed in as <strong data-testid="approvals-role">{role || "…"}</strong>. Nothing is sent: the client link below is shown here instead of emailed.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {extras === null ? <p role="status">Loading…</p> : extras.length === 0 ? <p data-testid="no-extras">No extras to show.</p> : extras.map(x => {
      const card = pick[x.extraId] ?? { code: rates[x.jobId]?.[0]?.code ?? "", quantity: "1" };
      const rate = rates[x.jobId]?.find(r => r.code === card.code), qty = Number(card.quantity);
      const total = rate && Number.isInteger(qty) && qty > 0 ? rate.ratePence * qty : null;
      const status = x.outcome ? words[x.outcome] ?? x.outcome : x.state === "logged" && x.quotedPence !== null ? "Priced - ready to submit" : words[x.state] ?? x.state;
      return <section key={x.extraId} className={styles.card} data-testid="extra-card" aria-label={`Extra on ${x.orderReference}`}>
        <h2>{x.orderReference}: {x.description}</h2>
        <p>{x.note}</p>
        <p><span className={styles.pill} data-testid="extra-state">{status}</span> {x.hasPhoto && "Photo attached · "}{x.residentConfirmed && "Resident confirmed · "}{(x.netPence ?? x.quotedPence) !== null && <span data-testid="extra-amount">{pounds((x.netPence ?? x.quotedPence)!)}</span>}</p>
        {x.steps.length > 0 && <ol className={styles.steps} data-testid="extra-steps">{x.steps.map(s => <li key={s.index}>{s.role.replace("_", " ")}: {s.done ? "done" : x.outcome ? "-" : "waiting"}</li>)}</ol>}
        {role === "surveyor" && x.state === "logged" && x.quotedPence === null && rates[x.jobId] && <div>
          <div className={styles.row}><label htmlFor={`rate-${x.extraId}`}>Rate card item</label><select id={`rate-${x.extraId}`} value={card.code} onChange={e => setPick({ ...pick, [x.extraId]: { ...card, code: e.target.value } })}>{rates[x.jobId]!.map(r => <option key={r.code} value={r.code}>{r.code} - {r.description} ({pounds(r.ratePence)} per {r.unit})</option>)}</select></div>
          <div className={styles.row}><label htmlFor={`qty-${x.extraId}`}>Quantity measured</label><input id={`qty-${x.extraId}`} inputMode="numeric" value={card.quantity} onChange={e => setPick({ ...pick, [x.extraId]: { ...card, quantity: e.target.value } })} /></div>
          <p>Price: <strong data-testid="price-preview">{total === null ? "-" : pounds(total)}</strong></p>
          <div className={styles.actions}><button disabled={busy || total === null} onClick={() => void run(x, "price", { sorCode: card.code, quantity: qty })}>Price this extra</button></div></div>}
        {role === "supervisor" && x.state === "logged" && x.quotedPence !== null && x.requestId === null && <div className={styles.actions}><button disabled={busy} onClick={() => void run(x, "submit")}>Submit for approval</button></div>}
        {role === "supervisor" && x.state === "awaiting_approval" && x.nextStepRole === "supervisor" && <div className={styles.actions}><button disabled={busy} onClick={() => void run(x, "approve")}>Approve as supervisor</button></div>}
        {role === "owner" && x.state === "awaiting_approval" && x.nextStepRole === "client_approver" && !x.linkIssued && <div className={styles.actions}><button disabled={busy} onClick={() => void run(x, "send")}>Approve sending to the client (practice)</button></div>}
        {x.linkIssued && x.state === "awaiting_approval" && <p data-testid="link-issued">Client link issued (practice - nothing was emailed).</p>}
        {link?.extraId === x.extraId && <p>Practice client link for {link.recipient}: <a data-testid="client-link" className={styles.link} href={link.path}>{link.path}</a></p>}
      </section>;
    })}
  </main>;
}
