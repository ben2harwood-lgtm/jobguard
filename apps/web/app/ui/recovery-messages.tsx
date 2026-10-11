"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  RECOVERY_MESSAGE_CHANGED, RECOVERY_MESSAGE_EVENT_LABELS, RECOVERY_MESSAGE_STATUS_LABELS, parsePoundsToPence, recoveryMessageOutcomesV1,
} from "@jobguard/core";
import type { RecoveryMessageApplication } from "@jobguard/api/workspace";
import { pounds } from "../lib/pounds";
import { packSourceAnchor } from "./evidence-packs";
import styles from "./recovery-messages.module.css";
import { RecoveryFollowUps } from "./recovery-follow-ups";

type State = Awaited<ReturnType<RecoveryMessageApplication["read"]>>;
type View = NonNullable<State["latest"]>;
type Outcome = (typeof recoveryMessageOutcomesV1)[number];
type Draft = { recipient: string; body: string; amount: string };
type Action = "preview" | "approve" | "advance" | "revoke" | "reconcile";
const outcomeLabels: Record<Outcome, string> = {
  success: "Delivered to the practice sink",
  response_lost: "Delivered, but the answer is lost",
  no_response: "No answer, nothing recorded",
  definite_failure: "Practice provider refuses it",
  process_stopped: "Practice process stops before recording a result",
};
const notReady: Record<string, string> = {
  PACK_REQUIRED: "Build an evidence pack for this case first.",
  ATTACHMENT_APPROVAL_REQUIRED: "Approve the current evidence pack for attachment first.",
  CASE_NOT_ELIGIBLE: "This case has no outstanding amount that a practice message can describe.",
};
const UNREADABLE_READ = "UNREADABLE_READ", UNREADABLE_COMMAND = "UNREADABLE_COMMAND";

/**
 * What the screen reads from an answer, checked before any of it is adopted (round 10, Sol P3). The route answers with the API's
 * `recovery-message-response.v1` (apps/api/src/recovery-message.contracts.ts, which the web cannot import, so the literal is pinned here and
 * in the API's own test); a body that is not that, not this case's, or missing a field the screen reads is refused as a whole.
 * The checked answer is adopted as it came, not the parsed copy, so nothing the server added is dropped.
 */
export const RECOVERY_MESSAGE_ANSWER_VERSION = "recovery-message-response.v1";
const str = z.string(), whole = z.number().int().nonnegative();
const known = (labels: Readonly<Record<string, string>>) => z.string().refine(value => Object.hasOwn(labels, value));
const messageAnswer = (caseId: string) => {
  const view = z.object({
    id: str.min(1), revision: whole, status: known(RECOVERY_MESSAGE_STATUS_LABELS), changedSinceReview: z.boolean(), superseded: z.boolean(), claimAbandoned: z.boolean(),
    message: z.object({ caseId: z.literal(caseId), packId: str.min(1), caseRevision: whole, amountPence: whole, sender: str, recipient: str, body: str, contentHash: str, attachmentHash: str }),
    attachment: z.object({ packRevision: whole, sources: z.array(z.object({ sourceId: str, version: whole, label: str, content: str, contentHash: str })) }),
    approval: z.object({ outboxActionId: str }).nullable(),
    history: z.array(z.object({ revision: whole, kind: known(RECOVERY_MESSAGE_EVENT_LABELS) })),
  });
  return z.object({
    version: z.literal(RECOVERY_MESSAGE_ANSWER_VERSION), caseId: z.literal(caseId),
    readiness: z.object({ eligible: z.boolean(), reason: str.nullable(), caseRevision: whole, packId: str.nullable() }),
    messages: z.array(view), latest: view.nullable(),
    sink: z.array(z.object({ outboxActionId: str, recipient: str, contentHash: str, attachmentHash: str })), sinkCount: whole, realExternalActions: z.literal(0),
  });
};
/** The answer as the screen's state, or undefined when it is not a usable answer for this case. */
export const usableMessageState = (body: unknown, caseId: string): State | undefined => messageAnswer(caseId).safeParse(body).success ? body as State : undefined;
/** The code of a refusal body, or the fallback when the body is not an object carrying one: a refusal never raises a JavaScript error. */
const refusalCode = (body: unknown, fallback: string) => {
  const code = typeof body === "object" && body !== null ? (body as { code?: unknown }).code : undefined;
  return typeof code === "string" && code ? code : fallback;
};
const failureText = (code: string, action: Action) => {
  if (action === "approve" && /CHANGED|STALE_REVISION|EXPIRED|INVALID_COMMAND|CONTENT_INVALID/u.test(code)) return RECOVERY_MESSAGE_CHANGED;
  const text: Record<string, string> = {
    RECOVERY_MESSAGE_CHANGED: RECOVERY_MESSAGE_CHANGED,
    RECOVERY_MESSAGE_STALE_REVISION: "Another window changed this message. The latest saved state is shown.",
    RECOVERY_MESSAGE_EXPIRED: "This preview is too old to approve. Preview the current message again.",
    RECOVERY_MESSAGE_REVOKED: "The approval was revoked. Nothing was sent.",
    RECOVERY_MESSAGE_BLOCKED: "Blocked: the message or its evidence changed after approval. Nothing was sent.",
    RECOVERY_MESSAGE_RECONCILE_REQUIRED: "The outcome is unknown. Check it before doing anything else.",
    RECOVERY_MESSAGE_ALREADY_DELIVERED: "This message was already recorded by the practice provider.",
    RECOVERY_MESSAGE_EXISTING_EFFECT: "This case already has an approved message. Revoke it first, or check its outcome.",
    RECOVERY_MESSAGE_NOT_REVOCABLE: "This approval can no longer be revoked.",
    RECOVERY_MESSAGE_NOT_RECONCILABLE: "There is no unknown outcome to check.",
    RECOVERY_MESSAGE_EXECUTION_PENDING: "Delivery is still in progress. Refresh shortly.",
    RECOVERY_MESSAGE_DELIVERY_INTERRUPTED: "The practice delivery process stopped. Refresh to see its saved claim; check the outcome when it becomes uncertain.",
    RECOVERY_MESSAGE_SOURCES_REQUIRED: notReady.PACK_REQUIRED!, RECOVERY_MESSAGE_ATTACHMENT_APPROVAL_REQUIRED: notReady.ATTACHMENT_APPROVAL_REQUIRED!,
    RECOVERY_MESSAGE_CASE_NOT_ELIGIBLE: notReady.CASE_NOT_ELIGIBLE!, UNAUTHENTICATED: "Start the practice session again to continue.",
    [UNREADABLE_READ]: "The saved messages could not be read, so they were not used. The last good view is kept. Choose Refresh saved messages to try again.",
    [UNREADABLE_COMMAND]: "The server's answer to that action could not be read, so it was not used. The action may or may not have been saved. Choose Refresh saved messages to see what is recorded before trying again.",
  };
  return text[code] ?? "That did not work. The saved state is shown; try again.";
};
const draftOf = (view: View): Draft => ({ recipient: view.message.recipient, body: view.message.body, amount: (view.message.amountPence / 100).toFixed(2) });
function draftPence(value: string): number | null { try { return parsePoundsToPence(value.trim()); } catch { return null; } }

/** `evidenceTick` changes whenever the evidence pack beside this panel is rebuilt or approved, so readiness is re-read from the server. */
export function RecoveryMessages({ caseId, caseRevision, evidenceTick = 0 }: { caseId: string; caseRevision: number; evidenceTick?: number }) {
  const [state, setState] = useState<State | null>(null), [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("success");
  const generation = useRef(0), locked = useRef(false), errorRef = useRef<HTMLParagraphElement>(null);
  const endpoint = `/api/recovery-cases/${caseId}/messages`;
  const view = state?.latest ?? null;

  const adopt = useCallback((next: State) => { setState(next); setDraft(next.latest ? draftOf(next.latest) : null); }, []);
  const load = useCallback(async () => {
    const own = ++generation.current;
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" }), body: unknown = await response.json();
      if (own !== generation.current) return;
      if (!response.ok) throw new Error(refusalCode(body, "LOAD_FAILED"));
      const next = usableMessageState(body, caseId);
      if (!next) throw new Error(UNREADABLE_READ);
      adopt(next); setError("");
    } catch (failure) { if (own === generation.current) setError(failureText(failure instanceof Error ? failure.message : "", "reconcile")); }
    finally { if (own === generation.current) setLoading(false); }
  }, [endpoint, caseId, adopt]);
  // The case revision changes when a claim moves, so the saved preview is re-read and its change state recomputed.
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load, caseRevision, evidenceTick]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function act(action: Action) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError("");
    const own = ++generation.current;
    try {
      let response: Response;
      if (action === "preview") {
        if (!state?.readiness.packId) throw new Error("RECOVERY_MESSAGE_SOURCES_REQUIRED");
        response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
          version: "recovery-message-preview.v1", commandId: crypto.randomUUID(), expectedCaseRevision: state.readiness.caseRevision, packId: state.readiness.packId }) });
      } else {
        if (!view) throw new Error("RECOVERY_MESSAGE_NOT_FOUND");
        const pence = draft ? draftPence(draft.amount) : null;
        const extra = action === "approve"
          ? { recipient: draft?.recipient ?? "", body: draft?.body ?? "", amountPence: pence ?? 0, packId: view.message.packId, contentHash: view.message.contentHash }
          : action === "advance" ? { outcome } : {};
        if (action === "approve" && pence === null) throw new Error("RECOVERY_MESSAGE_CHANGED");
        response = await fetch(`${endpoint}/${view.id}/commands`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
          version: "recovery-message-command.v1", commandId: crypto.randomUUID(), action, messageId: view.id, expectedRevision: view.revision, ...extra }) });
      }
      const body: unknown = await response.json();
      if (own !== generation.current) return;
      if (!response.ok) throw new Error(refusalCode(body, "FAILED"));
      const next = usableMessageState(body, caseId);
      if (!next) throw new Error(UNREADABLE_COMMAND);
      adopt(next);
    } catch (failure) {
      const text = failureText(failure instanceof Error ? failure.message : "", action);
      // Whatever happened, show what is actually saved (never an optimistic or half-applied view), then say why.
      await load();
      setError(text);
    } finally { setBusy(false); locked.current = false; }
  }

  const edited = !!view && !!draft && (draft.recipient !== view.message.recipient || draft.body !== view.message.body || draftPence(draft.amount) !== view.message.amountPence);
  const showChanged = !!view && (edited || view.changedSinceReview);
  const awaiting = !!view && view.status === "previewed" && !view.superseded;
  const existingEffect = state?.messages.some(message => !!message.approval && !["revoked", "blocked"].includes(message.status));
  const sourceAnchor = (source: View["attachment"]["sources"][number]) => `pack-source-${view!.message.packId}-${view!.id}-${packSourceAnchor(source.sourceId, source.version)}`;
  const canRun = !!view && (view.status === "queued" || view.status === "retryable");
  return <section className={styles.panel} aria-labelledby={`pursuit-heading-${caseId}`} id="recovery-messages" aria-busy={busy || loading}>
    <h4 id={`pursuit-heading-${caseId}`}>Review a factual practice message</h4>
    <p>Practice only. The amount, sender, recipient and attachment come from this case and its approved evidence pack; nothing is sent to anyone, and a message does not prove that a claim is true.</p>
    {loading && !state && <p role="status">Loading saved messages…</p>}
    {error && <p className={styles.error} role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
    {state && !state.readiness.eligible && state.readiness.reason && <p data-testid="pursuit-not-ready">{notReady[state.readiness.reason]}</p>}
    <div className={styles.actions}>
      <button type="button" disabled={busy || loading || !state?.readiness.eligible || existingEffect} onClick={() => void act("preview")}>Preview factual message</button>
      <button type="button" disabled={busy || loading} onClick={() => void load()}>Refresh saved messages</button>
    </div>
    {state && state.messages.length === 0 && !loading && <p>No practice message has been previewed for this case yet.</p>}
    {view && draft && <>
      <article className={styles.preview} aria-label="Message preview">
        <dl>
          <div><dt>Net amount in this case</dt><dd data-testid="pursuit-claim-net">{pounds(view.message.amountPence)}</dd></div>
          <div><dt>Sender</dt><dd data-testid="pursuit-sender">{view.message.sender}</dd></div>
          <div><dt>Recipient</dt><dd data-testid="pursuit-recipient">{view.message.recipient}</dd></div>
          <div><dt>Attachment</dt><dd>Evidence pack revision <span data-testid="pursuit-pack-revision">{view.attachment.packRevision}</span> · digest <code data-testid="pursuit-attachment-hash">{view.message.attachmentHash}</code></dd></div>
        </dl>
        <p data-testid="pursuit-body">{view.message.body}</p>
        <h5>Sources this message relies on</h5>
        <ul data-testid="pursuit-sources">{view.attachment.sources.map(source => <li key={`${source.sourceId}:${source.version}`}>
          <a href={`#${sourceAnchor(source)}`}>{source.label} · exact version {source.version}</a></li>)}</ul>
        <section aria-label="Saved attachment source explorer">
          <p>Saved evidence pack <code>{view.message.packId}</code> · revision {view.attachment.packRevision}. These are the exact records used by this message; current evidence may have changed.</p>
          {view.attachment.sources.map(source => <details key={`${source.sourceId}:${source.version}`} id={sourceAnchor(source)}>
            <summary>{source.label} · exact version {source.version}</summary>
            <p>Source identity <code>{source.sourceId}</code> · version {source.version}</p>
            <p>SHA-256 <code>{source.contentHash}</code></p>
            <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{source.content}</pre>
          </details>)}
        </section>
        <a href={`/api/recovery-cases/${caseId}/evidence-packs/${view.message.packId}/download`} download>Download this message&apos;s exact attachment (.txt)</a>
        <p>Message hash <code data-testid="pursuit-content-hash">{view.message.contentHash}</code> · case revision {view.message.caseRevision}</p>
      </article>
      {showChanged && <p className={styles.changed} role="status" data-testid="pursuit-changed">{RECOVERY_MESSAGE_CHANGED}</p>}
      {awaiting && <>
        <p>Edit the practice fields only to see the approval refuse them: approval binds the exact saved preview, and edits are never saved.</p>
        <label>Practice recipient<input value={draft.recipient} onChange={event => setDraft({ ...draft, recipient: event.target.value })} autoComplete="off" /></label>
        <label>Practice message body<textarea rows={4} value={draft.body} onChange={event => setDraft({ ...draft, body: event.target.value })} /></label>
        <label>Practice amount (£)<input inputMode="decimal" value={draft.amount} onChange={event => setDraft({ ...draft, amount: event.target.value })} autoComplete="off" /></label>
        <button type="button" disabled={busy || view.changedSinceReview} onClick={() => void act("approve")}>Approve this exact message</button>
      </>}
      <p className={styles.status} data-testid="pursuit-delivery" role="status">{RECOVERY_MESSAGE_STATUS_LABELS[view.status]}</p>
      {canRun && <>
        <label>Practice delivery result to simulate<select value={outcome} onChange={event => setOutcome(event.target.value as Outcome)}>
          {recoveryMessageOutcomesV1.map(item => <option key={item} value={item}>{outcomeLabels[item]}</option>)}</select></label>
        <div className={styles.actions}>
          <button type="button" disabled={busy} onClick={() => void act("advance")}>Advance practice delivery</button>
          <button type="button" disabled={busy} onClick={() => void act("revoke")}>Revoke approval</button>
        </div>
      </>}
      {view.claimAbandoned && <p role="status">The delivery process stopped before its result was recorded. Check the practice provider before attempting anything else.</p>}
      {view.status === "outcome_unknown" && <div className={styles.actions}>
        <p>The practice provider may or may not have recorded this message. Check before doing anything else.</p>
        <button type="button" disabled={busy} onClick={() => void act("reconcile")}>Check outcome</button>
      </div>}
      <section className={styles.sink} aria-label="Practice sink">
        <h5>Practice sink — nothing leaves this practice sandbox</h5>
        <p>This is the practice provider&apos;s own record. JobGuard learns of it by delivery, or by checking an unknown outcome.</p>
        <p>Records held: <span data-testid="pursuit-sink-count">{state!.sinkCount}</span> · real external actions: <span data-testid="pursuit-real-actions">{state!.realExternalActions}</span></p>
        <ul>{state!.sink.map(row => <li key={row.outboxActionId} data-testid="pursuit-sink-row">To {row.recipient} · message hash <code>{row.contentHash}</code> · attachment <code>{row.attachmentHash}</code></li>)}</ul>
      </section>
      <section className={styles.history} aria-label="Delivery and checking history">
        <h5>Delivery and checking history</h5>
        <ol data-testid="pursuit-history">{view.history.map(event => <li key={event.revision}>{RECOVERY_MESSAGE_EVENT_LABELS[event.kind]}</li>)}</ol>
        {state!.messages.length > 1 && <p>{state!.messages.length - 1} earlier preview{state!.messages.length === 2 ? "" : "s"} replaced by this one.</p>}
      </section>
    </>}
    <RecoveryFollowUps caseId={caseId} caseRevision={caseRevision} evidenceTick={evidenceTick} />
  </section>;
}
