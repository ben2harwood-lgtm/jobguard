"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { StatementView } from "../lib/enterprise-statement-types";
import { exactPounds } from "./contractor-billing";
import styles from "./work-orders.module.css";
export type { StatementView } from "../lib/enterprise-statement-types";
const pounds = (pence: number) => exactPounds({ numerator: String(pence), denominator: "1" });
async function post<T>(action: string, body: unknown): Promise<T> {
  const response = await fetch(`/api/contractor/statements/${action}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const value = await response.json();
  if (!response.ok) throw new Error(value.code ?? "OUTCOME_UNKNOWN");
  return value as T;
}
export function StatementDetails({ view }: { view: StatementView }) {
  const s = view.statement;
  return <section aria-label="Stored statement">
    <h2>Statement {s.period} · revision {s.revision}</h2>
    <p data-testid="statement-total">Statement delta: {pounds(s.totalDeltaPence)}</p>
    <p>Statement {s.id} · hash <code className={styles.ident}>{s.contentHash}</code> · {s.superseded ? "Superseded" : s.dispute ? "Disputed" : s.approval ? "Approved" : "Prepared"}</p>
    {s.sections.map(section => <details key={section.agreementVersionId}><summary>Agreement {section.agreementVersionId} · delta {pounds(section.deltaPence)}</summary>
      <p>Cumulative fee {pounds(section.cumulativeFeePence)} less prior net posted {pounds(section.priorNetPostedPence)}. Derivation {section.derivationId}.</p>
      {view.derivations.filter(d => d.id === section.derivationId).map(d => <div key={d.id}>
        <p>Qualifying principal: {exactPounds(d.qualifyingPrincipal)} · recorded cutoff {d.recordedCutoff} · input <code className={styles.ident}>{d.inputHash}</code></p>
        <ul>{d.contributions.map((c, index) => <li key={index}>Extra {c.extraId} · {c.originKind} · principal {exactPounds(c.qualifyingPrincipal)} · export {c.exportLineId} · allocation {c.allocationId} · run {c.runId} · rule {c.rule}</li>)}</ul>
      </div>)}
    </details>)}
    <h3>Synthetic fee journals</h3>
    {view.postings.length ? view.postings.map(p => <details key={p.id}><summary>{p.kind}: {pounds(p.amountPence)}</summary><p>Journal {p.id} · agreement {p.agreementVersionId} · compensates {p.compensatesFeeId ?? "none"}</p><ul>{p.lines.map(l => <li key={l.account}>{l.account}: debit {pounds(l.debitPence)}, credit {pounds(l.creditPence)}</li>)}</ul></details>) : <p>No journals posted for this statement.</p>}
  </section>;
}
export function EnterpriseStatement() {
  const [view, setView] = useState<StatementView | null>(null), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const read = async (statementId: string) => setView(await post<StatementView>("read", { version: "enterprise-fee-screen-read.v1", statementId }));
  async function run(work: () => Promise<void>) {
    setBusy(true); setMessage(""); setView(null);
    try { await work(); } catch (error) { setMessage(`Request refused (${error instanceof Error ? error.message : "OUTCOME_UNKNOWN"}). Reload the stored statement before retrying an unknown outcome.`); }
    finally { setBusy(false); }
  }
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget), period = String(data.get("period"));
    void run(async () => {
      await post("derive", { version: "enterprise-fee-derive.v1", commandId: crypto.randomUUID(), agreementVersionId: data.get("agreement"), period });
      const result = await post<{ statementId: string }>("prepare", { version: "enterprise-fee-prepare-statement.v1", commandId: crypto.randomUUID(), period });
      await read(result.statementId);
    });
  }
  const s = view?.statement;
  return <main className={styles.main}>
    <Link href="/northside">Practice roles</Link>{" · "}<Link href="/contractor/dashboard">Dashboard</Link>
    <h1>Monthly contractor statement</h1>
    <p>Fictional practice only. Proposed 10% terms, no platform charge. No real money is collected. Agreement versions are provisioned by operations in the synthetic database; this screen cannot create or change terms.</p>
    <p role="status">{busy ? "Loading…" : message}</p>
    <form onSubmit={prepare}><label>Fictional agreement version ID <input name="agreement" required /></label><label>Statement month <input name="period" type="month" required /></label><button disabled={busy}>Derive and prepare statement</button></form>
    <form onSubmit={e => { e.preventDefault(); const id = String(new FormData(e.currentTarget).get("statement")); void run(() => read(id)); }}><label>Stored statement ID <input name="statement" required /></label><button disabled={busy}>Reload stored statement</button></form>
    {view && <StatementDetails view={view} />}
    {s && !s.superseded && !s.dispute && <div>
      {!s.approval && <button disabled={busy} onClick={() => void run(async () => { await post("approve", { version: "enterprise-fee-approve-statement.v1", commandId: crypto.randomUUID(), statementId: s.id, contentHash: s.contentHash, totalDeltaPence: s.totalDeltaPence, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() }); await read(s.id); })}>Approve exact statement (practice)</button>}
      {s.approval && <button disabled={busy} onClick={() => void run(async () => { await post("post", { version: "enterprise-fee-post-statement.v1", commandId: crypto.randomUUID(), statementId: s.id, authorizationId: s.approval!.authorizationId }); await read(s.id); })}>Post approved statement (practice)</button>}
    </div>}
  </main>;
}
