"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

const uuid = z.string().uuid();
const review = z.object({
  version: z.literal("recovery-billability-review.v1"), productionEnabled: z.literal(false),
  command: z.object({ commandId: uuid, claimedEligiblePrincipalPence: z.number().int().nonnegative().safe(), reasons: z.string() }),
  snapshot: z.object({ caseType: z.string(), builderCaptured: z.boolean(), disclosedBeforeLock: z.boolean() }),
  assessment: z.object({ classification: z.enum(["eligible_for_review", "non_billable"]), exclusions: z.array(z.string()) }),
});
export const billabilityView = z.object({
  version: z.literal("recovery-billability-view.v1"), caseId: uuid, caseRevision: z.number().int().positive(),
  lines: z.array(z.object({ workId: uuid, lineId: uuid })),
  reviews: z.array(z.object({ workId: uuid, lineId: uuid, review, approved: z.boolean() })),
});
type View = z.infer<typeof billabilityView>;
type Attempt = { body: Record<string, unknown>; uncertain: boolean };
const unknownAnswer = "The server has not confirmed the result. Retry the same request; it may already be saved.";
export function billabilityAnswer(status: number, body: unknown, commandId: unknown): boolean {
  const saved = z.union([
    review.extend({ command: z.object({ commandId: uuid }) }),
    z.object({ version: z.literal("recovery-billability-approval.v1"), productionEnabled: z.literal(false), command: z.object({ commandId: uuid }) }),
  ]).safeParse(body);
  return status === 200 && saved.success && saved.data.command.commandId === commandId;
}
const exclusionCopy: Record<string, string> = {
  missing_proof: "Verified evidence is missing",
  uncertain_basis: "The cause, amount or tax basis is uncertain",
  builder_capture: "The builder already captured this item",
  disclosed_before_lock: "This catch was disclosed before the final-account lock",
  unavailable_case_allocation: "Settled recovery money is not available for this case",
  unclassified_or_missing_facts: "Required recovery facts are missing",
  failed_d03_predicate: "The recovery evidence does not meet the eligibility rules",
  missing_or_wrong_final_account_lock: "The required final-account lock does not match",
  principal_exceeds_claim_or_allocation: "The principal exceeds the claim or available allocation",
  no_remaining_principal: "No qualifying principal remains",
};
const target = { minHeight: 44, minWidth: 44 };
export function BillabilityScreen({ jobId, caseId }: { jobId: string; caseId: string }) {
  const endpoint = `/api/jobs/${encodeURIComponent(jobId)}/recovery-cases/${encodeURIComponent(caseId)}/billability`;
  const storageKey = `billability-request:${endpoint}`;
  const [view, setView] = useState<View | null>(null), [line, setLine] = useState("");
  const [principal, setPrincipal] = useState(""), [reasons, setReasons] = useState("");
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Attempt | null>(null);
  const sending = useRef(false);
  async function refresh() {
    try {
      const response = await fetch(endpoint, { cache: "no-store", credentials: "same-origin" });
      const data = billabilityView.safeParse(await response.json());
      if (!response.ok || !data.success || data.data.caseId !== caseId) throw new Error();
      setView(data.data);
    } catch { setView(null); setMessage("This review is unavailable for this session. Sign in and refresh to try again."); }
  }
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) { setPending({ body: JSON.parse(stored) as Record<string, unknown>, uncertain: true }); setMessage(unknownAnswer); }
    } catch { setMessage("The saved request could not be read. Check the stored reviews before sending another request."); }
    void refresh();
    // Each mounted screen has one fixed case and endpoint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);
  async function send(body: Record<string, unknown>) {
    if (sending.current) return;
    sending.current = true; setBusy(true);
    const earlierUnknown = pending?.uncertain === true;
    try {
      // Write before sending. A reload or lost response must retain the same ID and payload.
      sessionStorage.setItem(storageKey, JSON.stringify(body));
      setPending({ body, uncertain: true });
      const response = await fetch(endpoint, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
      const answer: unknown = await response.json();
      if (billabilityAnswer(response.status, answer, body.commandId)) {
        sessionStorage.removeItem(storageKey); setPending(null);
        const result = review.safeParse(answer);
        setMessage(result.success && result.data.assessment.classification === "non_billable"
          ? "Review recorded: this recovery is not billable. See the server's exclusions below."
          : body.action === "approve" ? "Simulation approval recorded. No fee is authorised." : "Review recorded. A different person must approve it.");
        await refresh();
      } else {
        const refusal = z.object({ version: z.literal("recovery-billability-error.v1"), code: z.string(), message: z.string() }).safeParse(answer);
        const known = refusal.success && [400, 404, 409, 422].includes(response.status);
        setMessage(known ? `${refusal.data.message}${earlierUnknown ? ` ${unknownAnswer}` : ""}` : unknownAnswer);
        if (known && !earlierUnknown) { sessionStorage.removeItem(storageKey); setPending(null); }
      }
    } catch { setMessage(unknownAnswer); }
    finally { sending.current = false; setBusy(false); }
  }
  function base(workId: string, lineId: string) {
    return { version: "recovery-billability-command.v1", commandId: crypto.randomUUID(), caseId, workId, lineId, expectedCaseRevision: view!.caseRevision };
  }
  return <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, overflowWrap: "anywhere" }}>
    <h1>Review recovery billability</h1>
    <p>Simulation only — no fees are authorised or collected. Owner and adviser approval for D01–D03 and D13 is still needed. Live gates stay closed.</p>
    <p>Use your practice session to record a review. A different person signs in with their synthetic owner session to inspect and approve it.</p>
    {message && <p role="alert">{message}</p>}
    <button style={target} disabled={busy} onClick={() => void refresh()}>Refresh stored reviews</button>
    {pending && <button style={target} disabled={busy} onClick={() => void send(pending.body)}>Retry same request</button>}
    {view && <>
      <p>Case revision {view.caseRevision}</p>
      {view.lines.length === 0 && <p>No stored bound lines are available for review.</p>}
      <form onSubmit={event => {
        event.preventDefault();
        const selected = view.lines.find(item => `${item.workId}/${item.lineId}` === line);
        if (!selected || !/^(0|[1-9][0-9]*)$/.test(principal) || !Number.isSafeInteger(Number(principal))) { setMessage("Pick a line and enter a whole-pence amount."); return; }
        void send({ ...base(selected.workId, selected.lineId), action: "review", claimedEligiblePrincipalPence: Number(principal), reasons });
      }}>
        <fieldset style={{ minWidth: 0 }} disabled={busy || !!pending}><legend>Record a human review</legend>
          <label htmlFor="billability-line">Stored line</label>
          <select id="billability-line" style={{ ...target, width: "100%" }} required value={line} onChange={event => setLine(event.target.value)}>
            <option value="">Choose a line</option>{view.lines.map(item => <option key={`${item.workId}/${item.lineId}`} value={`${item.workId}/${item.lineId}`}>{item.lineId} · Work {item.workId}</option>)}
          </select>
          <label htmlFor="billability-principal">Claimed eligible principal (whole pence)</label>
          <input id="billability-principal" style={{ ...target, width: "100%", boxSizing: "border-box" }} inputMode="numeric" pattern="[0-9]+" required value={principal} onChange={event => setPrincipal(event.target.value)} />
          <label htmlFor="billability-reasons">Reasons for this review</label>
          <textarea id="billability-reasons" style={{ ...target, width: "100%", boxSizing: "border-box" }} required maxLength={2000} value={reasons} onChange={event => setReasons(event.target.value)} />
          <button style={target} type="submit">Record review</button>
        </fieldset>
      </form>
      <h2>Stored reviews</h2>
      {view.reviews.length === 0 && <p>No reviews recorded.</p>}
      {view.reviews.map(item => <article key={item.review.command.commandId}>
        <h3>Line {item.lineId}</h3>
        <p>Category: {item.review.snapshot.caseType.replaceAll("_", " ")}</p>
        <p>Attribution: {item.review.snapshot.builderCaptured ? "builder captured" : "absent from builder captures"}; {item.review.snapshot.disclosedBeforeLock ? "disclosed before lock" : "not disclosed before lock"}.</p>
        <p>Claimed eligible principal: {item.review.command.claimedEligiblePrincipalPence} pence</p>
        <p>Reasons: {item.review.command.reasons}</p>
        <p>Server classification: {item.review.assessment.classification.replaceAll("_", " ")}</p>
        <p>Exclusions: {item.review.assessment.exclusions.map(value => exclusionCopy[value] ?? value.replaceAll("_", " ")).join(", ") || "None recorded"}</p>
        <p>{item.approved ? "Historical simulation approval recorded; current entitlement is always rechecked." : "Awaiting second-person approval."}</p>
        <button style={target} disabled={busy || !!pending || item.approved} onClick={() => void send({ ...base(item.workId, item.lineId), action: "approve", reviewCommandId: item.review.command.commandId })}>Approve review</button>
      </article>)}
    </>}
  </main>;
}
