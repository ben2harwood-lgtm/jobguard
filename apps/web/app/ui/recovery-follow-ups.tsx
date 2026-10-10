"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { RECOVERY_FOLLOW_UP_EVENT_LABELS, RECOVERY_MESSAGE_CHANGED, recoveryFollowUpStateV1, type RecoveryFollowUpStateShape } from "@jobguard/core";
import { pounds } from "../lib/pounds";
import styles from "./recovery-follow-ups.module.css";

type State = RecoveryFollowUpStateShape;
type FollowUp = State["followUps"][number];
type Action = "schedule" | "advance_time" | "open_review" | "approve_reminder" | "cancel" | "deliver" | "revoke" | "reconcile";

const UNREADABLE_READ = "UNREADABLE_READ", UNREADABLE_COMMAND = "UNREADABLE_COMMAND";
const CHANGED = "Another window or a case change moved this on. The latest saved state is shown.";
const text: Record<string, string> = {
  RECOVERY_FOLLOW_UP_RUN_REQUIRED: "Start a fresh practice run from Jobs first: the follow-up runs on that run's practice clock.",
  RECOVERY_FOLLOW_UP_RUN_ARCHIVED: "That practice run was reset, so its clock has stopped. Start a fresh practice run to schedule a new follow-up.",
  RECOVERY_FOLLOW_UP_CLOCK_EXHAUSTED: "This practice run's clock has no time left to follow up in. Reset the practice run to get a fresh one.",
  RECOVERY_FOLLOW_UP_MESSAGE_NOT_DELIVERED: "A follow-up needs a message the practice provider has recorded. Approve and deliver the message first.",
  RECOVERY_FOLLOW_UP_CASE_NOT_ELIGIBLE: "This case has nothing outstanding to follow up.",
  RECOVERY_FOLLOW_UP_CHANGED: CHANGED, RECOVERY_FOLLOW_UP_STALE_REVISION: CHANGED, RECOVERY_FOLLOW_UP_COMMAND_CONFLICT: CHANGED,
  RECOVERY_FOLLOW_UP_ALREADY_ACTIVE: "This case already has a follow-up in progress.",
  RECOVERY_FOLLOW_UP_STOPPED: "This follow-up has stopped. Schedule a new reviewed one if you still want one.",
  RECOVERY_FOLLOW_UP_NOT_DUE: "Practice time has not reached this follow-up yet.",
  RECOVERY_FOLLOW_UP_REMINDER_REQUIRED: "Preview the reminder first, then approve that exact preview.",
  RECOVERY_FOLLOW_UP_REMINDER_APPROVED: "The reminder is approved. Revoke that approval first.",
  RECOVERY_FOLLOW_UP_COMPLETE: "This follow-up is finished: its reminder was recorded by the practice provider.",
  RECOVERY_MESSAGE_CHANGED: RECOVERY_MESSAGE_CHANGED, RECOVERY_MESSAGE_CONTENT_INVALID: RECOVERY_MESSAGE_CHANGED, RECOVERY_MESSAGE_STALE_REVISION: CHANGED,
  RECOVERY_MESSAGE_SOURCES_REQUIRED: "Build an evidence pack for this case first.",
  RECOVERY_MESSAGE_ATTACHMENT_APPROVAL_REQUIRED: "The evidence changed since it was approved. Build the pack again and approve it for attachment, then preview the reminder.",
  RECOVERY_MESSAGE_CASE_NOT_ELIGIBLE: "This case has no outstanding amount that a practice message can describe.",
  RECOVERY_MESSAGE_EXISTING_EFFECT: "This case already has an approved message. Revoke it first, or check its outcome.",
  RECOVERY_MESSAGE_REVOKED: "The approval was revoked. Nothing was sent.", RECOVERY_MESSAGE_BLOCKED: "Blocked: the message or its evidence changed after approval. Nothing was sent.",
  RECOVERY_MESSAGE_EXECUTION_PENDING: "Delivery is still in progress. Refresh shortly.", RECOVERY_MESSAGE_RECONCILE_REQUIRED: "The outcome is unknown. Check it before doing anything else.",
  RECOVERY_MESSAGE_ALREADY_DELIVERED: "This reminder was already recorded by the practice provider.",
  UNAUTHENTICATED: "Start the practice session again to continue.",
  [UNREADABLE_READ]: "The saved follow-up could not be read, so it was not used. The last good view is kept. Choose Refresh follow-up to try again.",
  [UNREADABLE_COMMAND]: "The server's answer to that action could not be read, so it was not used. The action may or may not have been saved. Choose Refresh follow-up to see what is recorded before trying again.",
};
const failureText = (code: string) => text[code] ?? "That did not work. The saved state is shown; try again.";
const refusalCode = (body: unknown, fallback: string) => {
  const code = typeof body === "object" && body !== null ? (body as { code?: unknown }).code : undefined;
  return typeof code === "string" && code ? code : fallback;
};
/** The answer as the screen's state, or undefined when it is not a usable answer for this case. */
export const usableFollowUpState = (body: unknown, caseId: string): State | undefined => {
  const parsed = recoveryFollowUpStateV1.safeParse(body);
  return parsed.success && parsed.data.caseId === caseId ? parsed.data : undefined;
};

/**
 * The practice follow-up beside a recovery message. Time passing can only make a reminder ready to REVIEW; sending needs the builder to approve
 * that exact reminder, and delivery is the same M4-5-S practice sink. Every number and label here is read back from the saved answer.
 */
export function RecoveryFollowUps({ caseId, caseRevision, evidenceTick = 0 }: { caseId: string; caseRevision: number; evidenceTick?: number }) {
  const [state, setState] = useState<State | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const generation = useRef(0), locked = useRef(false), errorRef = useRef<HTMLParagraphElement>(null);
  const endpoint = `/api/recovery-cases/${caseId}/follow-ups`;
  const current = state ?? null;
  const followUp: FollowUp | null = current?.latest ?? null;

  const load = useCallback(async () => {
    const own = ++generation.current;
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" }), body: unknown = await response.json();
      if (own !== generation.current) return;
      if (!response.ok) throw new Error(refusalCode(body, "LOAD_FAILED"));
      const next = usableFollowUpState(body, caseId);
      if (!next) throw new Error(UNREADABLE_READ);
      setState(next); setError("");
    } catch (failure) { if (own === generation.current) setError(failureText(failure instanceof Error ? failure.message : "")); }
    finally { if (own === generation.current) setLoading(false); }
  }, [endpoint, caseId]);
  // The case revision changes when a claim moves and the tick when the evidence pack is rebuilt or approved: re-read what is saved either way.
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load, caseRevision, evidenceTick]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function act(action: Action) {
    if (locked.current || !current) return;
    locked.current = true; setBusy(true); setError("");
    const own = ++generation.current;
    const common = { version: "recovery-follow-up-command.v1", commandId: crypto.randomUUID() };
    try {
      let response: Response;
      if (action === "schedule") {
        if (!current.scheduling.sourceMessageId) throw new Error("RECOVERY_FOLLOW_UP_MESSAGE_NOT_DELIVERED");
        response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
          ...common, action, sourceMessageId: current.scheduling.sourceMessageId, expectedCaseRevision: current.scheduling.caseRevision }) });
      } else if (action === "deliver" || action === "revoke" || action === "reconcile") {
        // Delivering, revoking and checking a reminder are the M4-5-S message commands, unchanged: a reminder is a practice message.
        const reminder = followUp?.reminder;
        if (!reminder) throw new Error("RECOVERY_FOLLOW_UP_REMINDER_REQUIRED");
        response = await fetch(`/api/recovery-cases/${caseId}/messages/${reminder.messageId}/commands`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
          version: "recovery-message-command.v1", commandId: crypto.randomUUID(), action: action === "deliver" ? "advance" : action, messageId: reminder.messageId, expectedRevision: reminder.revision,
          ...(action === "deliver" ? { outcome: "success" } : {}) }) });
      } else {
        if (!followUp) throw new Error("RECOVERY_FOLLOW_UP_NOT_FOUND");
        const path = `${endpoint}/${followUp.id}/commands`;
        const reminder = followUp.reminder;
        const body = action === "advance_time" ? { ...common, action, followUpId: followUp.id }
          : action === "cancel" ? { ...common, action, followUpId: followUp.id, expectedRevision: followUp.revision }
          : action === "open_review" ? { ...common, action, followUpId: followUp.id, expectedRevision: followUp.revision, expectedCaseRevision: current.scheduling.caseRevision, packId: await currentPackId() }
          : { ...common, action, followUpId: followUp.id, expectedRevision: followUp.revision, messageId: reminder?.messageId, expectedMessageRevision: reminder?.revision,
              recipient: reminder?.recipient, body: reminder?.body, amountPence: reminder?.amountPence, packId: reminder?.packId, contentHash: reminder?.contentHash };
        response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      }
      const answer: unknown = await response.json();
      if (own !== generation.current) return;
      if (!response.ok) throw new Error(refusalCode(answer, "FAILED"));
      if (action === "deliver" || action === "revoke" || action === "reconcile") { await load(); return; }
      const next = usableFollowUpState(answer, caseId);
      if (!next) throw new Error(UNREADABLE_COMMAND);
      setState(next);
    } catch (failure) {
      const message = failureText(failure instanceof Error ? failure.message : "");
      // Whatever happened, show what is actually saved (never an optimistic or half-applied view), then say why.
      await load();
      setError(message);
    } finally { setBusy(false); locked.current = false; }
  }
  /** The current evidence pack comes from the saved message state, the one authority on which pack a preview must name. */
  async function currentPackId(): Promise<string> {
    const response = await fetch(`/api/recovery-cases/${caseId}/messages`, { cache: "no-store" }), body = await response.json() as { readiness?: { packId?: string | null } };
    if (!response.ok || !body.readiness?.packId) throw new Error("RECOVERY_MESSAGE_SOURCES_REQUIRED");
    return body.readiness.packId;
  }

  const clock = current?.run;
  const live = !!followUp && followUp.state !== "stopped" && followUp.state !== "delivered";
  const canAdvance = !!followUp && !!clock && !clock.archived && clock.fakeClockTick < clock.clockLimit;
  const reviewable = !!followUp && (followUp.state === "review_reminder" || followUp.state === "approval_needed");
  const previewed = !!followUp?.reminder && followUp.reminder.status === "previewed";
  const reminderStatus = followUp?.reminder?.status ?? null;
  const reminder = followUp?.reminder ?? null;
  return <section className={styles.panel} aria-labelledby={`follow-up-heading-${caseId}`} id="recovery-follow-ups" aria-busy={busy || loading}>
    <h4 id={`follow-up-heading-${caseId}`}>Follow up later</h4>
    <p>Practice only. A follow-up waits on this practice run&apos;s own clock. When practice time reaches it, a reminder becomes ready to <em>review</em>; passing time never approves or sends anything. Only your approval of the exact reminder does, and it still goes nowhere outside this sandbox.</p>
    {loading && !current && <p role="status">Loading the saved follow-up…</p>}
    {error && <p className={styles.error} role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
    {current && <dl className={styles.facts}>
      <div><dt>Practice clock</dt><dd data-testid="follow-up-clock">{clock ? `Tick ${clock.fakeClockTick} of ${clock.clockLimit}` : "No practice run yet"}</dd></div>
      <div><dt>Real external actions</dt><dd data-testid="follow-up-real-actions">{current.realExternalActions}</dd></div>
    </dl>}
    <div className={styles.actions}>
      <button type="button" disabled={busy || loading || !current?.scheduling.eligible} onClick={() => void act("schedule")}>Schedule a follow-up reminder</button>
      <button type="button" disabled={busy || loading || !canAdvance} onClick={() => void act("advance_time")}>Advance practice time</button>
      <button type="button" disabled={busy || loading} onClick={() => void load()}>Refresh follow-up</button>
    </div>
    {current && !current.scheduling.eligible && !followUp && current.scheduling.reason && <p data-testid="follow-up-not-ready">{failureText(`RECOVERY_FOLLOW_UP_${current.scheduling.reason}`)}</p>}
    {current && !followUp && !loading && <p>No follow-up is scheduled for this case yet.</p>}
    {followUp && <article className={styles.card} aria-label="Follow-up">
      <p className={styles.state} data-testid="follow-up-state" role="status">{followUp.label}</p>
      <dl className={styles.facts}>
        <div><dt>New simulated messages</dt><dd data-testid="new-simulated-messages">{followUp.newSimulatedMessages}</dd></div>
        <div><dt>Scheduled at</dt><dd data-testid="follow-up-created">Tick {followUp.createdTick}</dd></div>
        <div><dt>Due at</dt><dd data-testid="follow-up-due">Tick {followUp.dueTick} · {followUp.fixtureVersion}</dd></div>
        <div><dt>Scheduling owner</dt><dd data-testid="follow-up-owner">Practice fake clock · run <code>{followUp.owner.runId}</code></dd></div>
        <div><dt>Due Decision</dt><dd data-testid="follow-up-decision">{followUp.dueDecision ? (followUp.dueDecision.resolved ? "Approved by you" : "Pending — nothing authorized") : "Not due yet"}</dd></div>
      </dl>
      {followUp.state === "stopped" && <p data-testid="follow-up-stopped">{followUp.reopened
        ? "The case was reopened. This follow-up stays stopped; schedule a new reviewed follow-up if you want one."
        : followUp.stopReason === "cancelled" ? "You cancelled this follow-up." : followUp.stopReason === "run_archived" ? "This practice run was reset." : "The case moved on, so this follow-up ended."}</p>}
      {followUp.changedSinceReview && live && <p className={styles.changed} role="status" data-testid="follow-up-changed">The case has changed since you scheduled this. The reminder describes the case as it stands now.</p>}
      {reminder && <div className={styles.reminder}>
        <h5>Reminder preview</h5>
        <dl>
          <div><dt>Recipient</dt><dd data-testid="follow-up-recipient">{reminder.recipient}</dd></div>
          <div><dt>Net amount in this case</dt><dd data-testid="follow-up-amount">{pounds(reminder.amountPence)}</dd></div>
        </dl>
        <p data-testid="follow-up-body">{reminder.body}</p>
        <p>Message hash <code data-testid="follow-up-hash">{reminder.contentHash}</code> · case revision {reminder.caseRevision}</p>
        {reminder.changedSinceReview && reminderStatus === "previewed" && <p className={styles.changed} role="status" data-testid="follow-up-reminder-changed">{RECOVERY_MESSAGE_CHANGED}</p>}
        <p className={styles.state} data-testid="follow-up-delivery" role="status">{reminder.label}</p>
      </div>}
      <div className={styles.actions}>
        <button type="button" disabled={busy || loading || !reviewable} onClick={() => void act("open_review")}>Preview the reminder</button>
        <button type="button" disabled={busy || loading || !previewed || !!reminder?.changedSinceReview || !live} onClick={() => void act("approve_reminder")}>Approve this exact reminder</button>
        <button type="button" disabled={busy || loading || !live || reminderStatus === "queued" || reminderStatus === "executing" || reminderStatus === "outcome_unknown" || reminderStatus === "retryable"} onClick={() => void act("cancel")}>Cancel this follow-up</button>
      </div>
      {(reminderStatus === "queued" || reminderStatus === "retryable") && <div className={styles.actions}>
        <button type="button" disabled={busy || loading} onClick={() => void act("deliver")}>Deliver the reminder to the practice sink</button>
        <button type="button" disabled={busy || loading} onClick={() => void act("revoke")}>Revoke the reminder approval</button>
      </div>}
      {reminderStatus === "outcome_unknown" && <div className={styles.actions}>
        <p>The practice provider may or may not have recorded this reminder. Check before doing anything else.</p>
        <button type="button" disabled={busy || loading} onClick={() => void act("reconcile")}>Check the reminder outcome</button>
      </div>}
      <section className={styles.history} aria-label="Follow-up history">
        <h5>Follow-up history</h5>
        <ol data-testid="follow-up-history">{followUp.history.map(event => <li key={event.revision}>{RECOVERY_FOLLOW_UP_EVENT_LABELS[event.kind]}</li>)}</ol>
        {(current?.followUps.length ?? 0) > 1 && <p>{(current?.followUps.length ?? 1) - 1} earlier follow-up{current?.followUps.length === 2 ? "" : "s"} stopped or finished; this is the newest.</p>}
      </section>
    </article>}
    <p>Simulated messages recorded for follow-ups on this case: <span data-testid="follow-up-total-simulated">{current?.newSimulatedMessages ?? 0}</span></p>
  </section>;
}
