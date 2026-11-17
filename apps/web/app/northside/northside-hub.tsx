"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { NorthsidePractice } from "./northside-practice";
import { pounds } from "../lib/pounds";
import styles from "./northside.module.css";

type Summary = { role: string; seeded: boolean; targets: { clients: number; operatives: number; ordersPerMonth: number; month: string }; facts: { companyName: string | null; clients: number; operatives: number; ordersThisMonth: number; orderValuePence: number; extras: number } };
async function post(url: string, body: unknown) { const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) }; }

/** The practice hub: start the generated contractor, see counted facts, reset to a new run. */
export function NorthsideHub() {
  const [summary, setSummary] = useState<Summary | null>(null), [signedOut, setSignedOut] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState("Loading…");
  const [loading, setLoading] = useState(false), [loadFailed, setLoadFailed] = useState(false);
  const loadAlert = useRef<HTMLParagraphElement>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(""); setStatus("Loading…");
    try {
    const r = await fetch("/api/northside", { cache: "no-store" });
    if (r.status === 401) { setSignedOut(true); setSummary(null); setStatus("No practice is running yet."); return; }
    if (!r.ok && r.status < 500) { setLoadFailed(false); setError("The practice could not be loaded."); return; }
    if (!r.ok) throw new Error("The practice could not be loaded.");
    const stored = await r.json();
    setSignedOut(false); setSummary(stored); setLoadFailed(false); setStatus("Loaded from the stored practice");
    } catch {
      setLoadFailed(true); setError("The practice could not be loaded."); setStatus("Practice not loaded.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (loadFailed && error && !loading) loadAlert.current?.focus(); }, [loadFailed, error, loading]);
  async function start(first: boolean) {
    setBusy(true); setError("");
    try {
      if (!first) {
        const current = await fetch("/api/contractor/practice/acting-as", { cache: "no-store" });
        if (!current.ok) throw new Error("The earlier practice switch could not be read.");
        if ((await current.json()).state !== "owner") {
          const ended = await post("/api/contractor/practice/acting-as/end", { version: "practice-worker-switch-off.v1", commandId: crypto.randomUUID() });
          if (!ended.ok) throw new Error("The earlier practice switch could not be ended.");
        }
        const revoked = await post("/api/contractor/practice/session/revoke", { version: "contractor-practice-session-revoke.v1" }); if (!revoked.ok) throw new Error("The earlier run could not be closed."); }
      const session = await post("/api/session", {}); if (!session.ok) throw new Error("A practice session could not be started.");
      const started = await post("/api/contractor?action=start", { version: "contractor-practice.v1", environment: "synthetic_demo" }); if (!started.ok) throw new Error("The practice organisation could not be started.");
      setStatus("Generating Northside Property Services through the commands…");
      const seeded = await post("/api/northside", { version: "northside-command.v1", action: "seed" }); if (!seeded.ok) throw new Error(`The generated contractor could not be made (${seeded.body.code ?? seeded.status}).`);
      await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const f = summary?.facts;
  return <main className={styles.page}>
    <Link href="/">Back to Jobs</Link>
    <h1>{f?.companyName ?? "Northside Property Services"} <span className={styles.pill}>generated, fictional</span></h1>
    <p className={styles.note} data-testid="northside-label">Practice data only. Every address ends in .invalid and nothing is sent. A reset starts a new run and keeps the earlier audit records.</p>
    <p role="status" data-testid="northside-status">{status}</p>
    {error && <p role="alert" className={styles.error} ref={loadAlert} tabIndex={-1}>{error}</p>}
    {loadFailed && <button disabled={loading} onClick={() => void load()}>Try again</button>}
    {signedOut && <section className={styles.card}><h2>No practice running</h2><button disabled={busy} onClick={() => void start(true)}>Start Northside practice</button></section>}
    {summary && <>
      {summary.seeded && <NorthsidePractice />}
      <p>Signed in as <strong data-testid="northside-role">{summary.role}</strong></p>
      {!summary.seeded && summary.role === "owner" && <section className={styles.card}><h2>Not generated yet</h2><button disabled={busy} onClick={() => void (async () => { setBusy(true); setError(""); try { const seeded = await post("/api/northside", { version: "northside-command.v1", action: "seed" }); if (!seeded.ok) throw new Error(`The generated contractor could not be made (${seeded.body.code ?? seeded.status}).`); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } })()}>Generate Northside Property Services</button></section>}
      {summary.seeded && f && <section className={styles.card} aria-label="Counted facts"><h2>Counted from the seeded records</h2>
        <ul className={styles.facts}>
          <li><span>Clients</span><strong data-testid="fact-clients">{f.clients}</strong></li>
          <li><span>Operatives</span><strong data-testid="fact-operatives">{f.operatives}</strong></li>
          <li><span>Work orders issued in {summary.targets.month}</span><strong data-testid="fact-orders">{f.ordersThisMonth}</strong></li>
          <li><span>Value of those orders</span><strong data-testid="fact-value">{pounds(f.orderValuePence)}</strong></li>
          <li><span>Extras logged</span><strong data-testid="fact-extras">{f.extras}</strong></li>
        </ul></section>}
      <section className={styles.card}><h2>Walk the journey</h2>
        <ul>
          <li><Link href="/contractor/work-orders">Finance: find the work order and open billing</Link></li>
          <li><Link href="/contractor/statements">Finance: monthly statement</Link></li>
          <li><Link href="/contractor/dashboard">Contractor dashboard and sample baseline import</Link></li>
          <li><Link href="/site/extra">Operative: log an extra (phone)</Link></li>
          <li><Link href="/approvals/extras">Surveyor, supervisor and owner: price, approve, prepare a local client request</Link></li>
        </ul></section>
      {summary.role === "owner" && <section className={styles.card}><h2>Reset</h2><p>Starts a new run with a new generated contractor. The earlier run and its audit records stay.</p><button disabled={busy} onClick={() => void start(false)}>Reset practice (new run)</button></section>}
    </>}
  </main>;
}
