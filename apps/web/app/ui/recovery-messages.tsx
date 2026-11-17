"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { evidenceSourceV1 } from "@jobguard/core";
import { pounds } from "../lib/pounds";
import styles from "./recovery-messages.module.css";

const previewSchema = z.object({
  caseId: z.string(), jobId: z.string(), caseType: z.string(), caseRevision: z.number().int(),
  amountPence: z.number().int(), sourceRefs: z.array(z.string()), packId: z.string(),
  packRevision: z.number().int(), manifestHash: z.string(), attachmentHash: z.string(),
  sender: z.string(), recipient: z.string(), body: z.string(), currency: z.literal("GBP"),
  policyVersion: z.string(), contentHash: z.string(),
});
const messageSchema = previewSchema.extend({
  id: z.string(), revision: z.number().int(), status: z.string(),
  actionId: z.string().nullable().optional(), decisionId: z.string().nullable().optional(),
}).transform(message => ({ ...message, preview: previewSchema.parse(message) }));
const responseSchema = z.object({
  environment: z.literal("synthetic_demo"), realExternalActions: z.literal(0), messages: z.array(messageSchema),
});
const packsSchema = z.object({ packs: z.array(z.object({
  id: z.string(), revision: z.number().int(), manifestHash: z.string(), contentHash: z.string(),
  sources: z.array(evidenceSourceV1),
})) });
type Message = z.infer<typeof messageSchema>;
type Pack = z.infer<typeof packsSchema>["packs"][number];
type Draft = { recipient: string; body: string; amount: string; packId: string };
const changedMessage = "Review the changed message before approving";
const deliveryLabels: Record<string, string> = {
  previewed: "Preview — awaiting your approval", draft: "Preview — awaiting your approval",
  queued: "Queued — not sent", approved: "Queued — not sent",
  delivered: "Simulated delivery — nothing sent", succeeded: "Simulated delivery — nothing sent",
  simulated_delivery: "Simulated delivery — nothing sent",
  outcome_unknown: "Outcome unknown — check needed", retryable: "Definite failure — safe to retry",
  failed: "Definite failure — safe to retry", cancelled: "Cancelled — nothing sent",
  revoked: "Authorization revoked — nothing sent",
};
function draftOf(message: Message): Draft {
  return { recipient: message.preview.recipient, body: message.preview.body,
    amount: (message.preview.amountPence / 100).toFixed(2), packId: message.preview.packId };
}
function parsePounds(value: string): number | null {
  if (!/^\d{1,10}(?:\.\d{1,2})?$/u.test(value)) return null;
  const [whole = "0", fraction = ""] = value.split(".");
  const pence = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return pence <= 1_000_000_000_000n ? Number(pence) : null;
}

export function RecoveryMessages({ caseId, caseRevision }: { caseId: string; caseRevision: number }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [packs, setPacks] = useState<Pack[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<"success" | "retryable" | "outcome_unknown">("success");
  const generation = useRef(0), actionLock = useRef(false), errorRef = useRef<HTMLParagraphElement>(null);
  const endpoint = `/api/recovery-cases/${caseId}/messages`;
  const current = messages.at(-1), preview = current?.preview;
  const dirty = !!current && !!draft && JSON.stringify(draftOf(current)) !== JSON.stringify(draft);

  const load = useCallback(async () => {
    const own = ++generation.current;
    setLoading(true); setError("");
    try {
      const [messageResponse, packResponse] = await Promise.all([
        fetch(endpoint, { cache: "no-store" }),
        fetch(`/api/recovery-cases/${caseId}/evidence-packs`, { cache: "no-store" }),
      ]);
      if (!messageResponse.ok || !packResponse.ok) throw new Error("Saved messages could not load. Try again.");
      const state = responseSchema.parse(await messageResponse.json());
      const packState = packsSchema.parse(await packResponse.json());
      if (own !== generation.current) return;
      setMessages(state.messages); setPacks(packState.packs);
      setDraft(state.messages.at(-1) ? draftOf(state.messages.at(-1)!) : null);
    } catch (cause) {
      if (own === generation.current) setError(cause instanceof Error ? cause.message : "Saved messages could not load.");
    } finally { if (own === generation.current) setLoading(false); }
  }, [caseId, endpoint]);

  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function post(command: object) {
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) });
    const value: unknown = await response.json();
    if (!response.ok) {
      const problem = z.object({ message: z.string().optional(), code: z.string().optional() }).parse(value);
      if (["RECOVERY_MESSAGE_CHANGED", "RECOVERY_MESSAGE_STALE", "INVALID_MESSAGE_COMMAND"].includes(problem.code ?? "")) throw new Error(changedMessage);
      throw new Error(problem.message ?? problem.code ?? "The message could not be saved.");
    }
    const state = responseSchema.parse(value);
    setMessages(state.messages); setDraft(state.messages.at(-1) ? draftOf(state.messages.at(-1)!) : null);
  }

  async function act(action: "preview" | "approve" | "advance" | "retry" | "reconcile" | "cancel") {
    if (actionLock.current) return;
    actionLock.current = true; setBusy(true); setError("");
    try {
      if (action === "preview") {
        const response = await fetch(`/api/recovery-cases/${caseId}/evidence-packs`, { cache: "no-store" });
        if (!response.ok) throw new Error("The evidence pack could not load. Try again.");
        const saved = packsSchema.parse(await response.json()).packs;
        setPacks(saved);
        const pack = saved.at(-1);
        if (!pack) throw new Error("Build and inspect an evidence pack before previewing this message.");
        await post({ version: "recovery-message-preview.v1", commandId: crypto.randomUUID(), expectedCaseRevision: caseRevision, packId: pack.id });
      } else if (current) {
        const approval = action === "approve" && draft ? {
          recipient: draft.recipient, body: draft.body, amountPence: parsePounds(draft.amount),
          packId: draft.packId, contentHash: current.preview.contentHash,
        } : {};
        if (action === "approve" && "amountPence" in approval && approval.amountPence === null) throw new Error(changedMessage);
        await post({ version: "recovery-message-command.v1", commandId: crypto.randomUUID(),
          action, messageId: current.id, expectedRevision: current.revision,
          ...approval, ...(action === "advance" ? { outcome } : {}),
        });
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The message could not be saved."); }
    finally { setBusy(false); actionLock.current = false; }
  }

  const attachment = packs.find(pack => pack.id === preview?.packId);
  const canApprove = current && ["draft", "previewed"].includes(current.status);
  const canAdvance = current && ["approved", "queued"].includes(current.status);
  const canRetry = current && ["retryable", "failed"].includes(current.status);
  const canCancel = current && ["draft", "previewed", "approved", "queued", "retryable", "failed"].includes(current.status);
  return <section className={styles.panel} aria-labelledby={`pursuit-heading-${caseId}`} id="recovery-messages" aria-busy={busy || loading}>
    <h4 id={`pursuit-heading-${caseId}`}>Review a factual practice message</h4>
    <p>Use the supplied fictional records and recipients. The amount and attachment come from this case; a message does not prove that a claim is true.</p>
    {loading && <p role="status">Loading saved messages…</p>}
    {error && <p className={styles.error} role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
    <div className={styles.actions}>
      <button type="button" disabled={busy || loading} onClick={() => void act("preview")}>Preview factual message</button>
      <button type="button" disabled={busy || loading} onClick={() => void load()}>Refresh saved messages</button>
    </div>
    {!loading && messages.length === 0 && <p>No practice messages yet. Build an evidence pack, then preview the exact message.</p>}
    {current && preview && draft && <>
      <dl>
        <div><dt>Net amount from this case</dt><dd data-testid="pursuit-claim-net">{pounds(preview.amountPence)}</dd></div>
        <div><dt>Sender</dt><dd data-testid="pursuit-sender">{preview.sender}</dd></div>
        <div><dt>Recipient in saved preview</dt><dd data-testid="pursuit-recipient">{preview.recipient}</dd></div>
      </dl>
      <p data-testid="pursuit-body">{preview.body}</p>
      <details>
        <summary>Inspect message amount and record sources</summary>
        <p>Case <code data-testid="pursuit-case-id">{preview.caseId}</code> · revision {preview.caseRevision}</p>
        <p>Job <code data-testid="pursuit-job-id">{preview.jobId}</code></p>
        <ul>{preview.sourceRefs.map(source => <li key={source}>{source}</li>)}</ul>
        <p>Attachment pack <code data-testid="pursuit-pack-id">{preview.packId}</code> · revision {preview.packRevision}</p>
        <p>Message hash <code data-testid="pursuit-content-hash">{preview.contentHash}</code></p>
        <p>Manifest hash <code>{preview.manifestHash}</code></p>
        <p>Attachment hash <code data-testid="pursuit-attachment-hash">{preview.attachmentHash}</code></p>
        <p>Policy {preview.policyVersion}</p>
        {attachment?.sources.map(source => <details className={styles.source} key={`${source.sourceId}:${source.version}`}>
          <summary>{source.label} · source version {source.version}</summary>
          <p>Source <code>{source.sourceId}</code> · job <code>{source.jobId}</code></p>
          <pre>{source.content}</pre>
        </details>)}
        <a href={`/api/recovery-cases/${caseId}/evidence-packs/${preview.packId}/download`} download>Download this message&apos;s exact attachment</a>
      </details>
      {canApprove && <>
        <p className={styles.draft}>{dirty ? "Unsaved practice edits — review required before approval." : "Review the saved preview. Changes below are unsaved practice edits."}</p>
        <label>Practice recipient<input value={draft.recipient} onChange={event => setDraft({ ...draft, recipient: event.target.value })} /></label>
        <label>Practice message body<textarea rows={4} value={draft.body} onChange={event => setDraft({ ...draft, body: event.target.value })} /></label>
        <label>Practice amount (£)<input inputMode="decimal" value={draft.amount} onChange={event => setDraft({ ...draft, amount: event.target.value })} /></label>
        <label>Practice attachment<select value={draft.packId} onChange={event => setDraft({ ...draft, packId: event.target.value })}>
          {packs.map(pack => <option key={pack.id} value={pack.id}>Evidence pack revision {pack.revision}</option>)}
          <option value="00000000-0000-4000-8000-000000000000">No attachment — review required</option>
        </select></label>
        <button type="button" className="primary" disabled={busy} onClick={() => void act("approve")}>Approve and simulate this message</button>
      </>}
      <p className={styles.status} data-testid="pursuit-delivery" role="status">{deliveryLabels[current.status] ?? "Message status needs checking"}</p>
      {canAdvance && <>
        <label>Practice delivery result<select value={outcome} onChange={event => setOutcome(event.target.value as typeof outcome)}>
          <option value="success">Simulated delivery</option><option value="retryable">Definite failure</option><option value="outcome_unknown">Unknown outcome</option>
        </select></label>
        <button type="button" disabled={busy} onClick={() => void act("advance")}>Advance practice delivery</button>
      </>}
      <div className={styles.actions}>
        {canRetry && <button type="button" disabled={busy} onClick={() => void act("retry")}>Retry this authorized message</button>}
        {current.status === "outcome_unknown" && <button type="button" disabled={busy} onClick={() => void act("reconcile")}>Reconcile practice receipt</button>}
        {canCancel && <button type="button" disabled={busy} onClick={() => void act("cancel")}>Cancel this practice message</button>}
      </div>
      <section className={styles.history} aria-label="Saved message history">
        <h5>Saved message history</h5>
        <ol>{messages.map(message => <li key={message.id}>
          <p>{deliveryLabels[message.status] ?? "Message status needs checking"} · {message.preview.recipient}</p>
          <p>Message <code>{message.id}</code> · revision {message.revision}</p>
          {message.actionId && <p>Authorized action <code data-testid={message.id === current.id ? "pursuit-action-id" : undefined}>{message.actionId}</code></p>}
        </li>)}</ol>
      </section>
    </>}
  </section>;
}
