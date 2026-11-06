"use client";
import { useEffect, useRef, useState } from "react";
import type { ManagedRecoveryState, previewManagedRecoveryInvoice } from "@jobguard/core";

type Selection = NonNullable<ManagedRecoveryState["election"]>["selection"];
type Choice = { label: string; command: { version: "managed-recovery-election-command.v1"; caseId: string;
  termsVersion: string; selection: Selection } };
type Command = Choice["command"] & { commandId: string };
export type ManagedRecoveryView = { version: "managed-recovery-screen.v1"; csrfToken: string;
  preview: ReturnType<typeof previewManagedRecoveryInvoice>; choices: Choice[]; termsVersion: string;
  successFeeLabel: string; successFeeAmount: string; serviceChargeAmount: string | null; message: string };

/** Retain the exact submitted body, including its ID, until a definitive server answer. */
export async function sendManagedRecoveryChoice(url: string, command: Command, csrfToken: string) {
  return fetch(url, { method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken }, body: JSON.stringify(command) });
}

export function ManagedRecoveryScreen({ jobId, caseId }: { jobId: string; caseId: string }) {
  const [view, setView] = useState<ManagedRecoveryView | null>(null);
  const [selected, setSelected] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState<Command | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading the practice case…");
  const [refused, setRefused] = useState(false);
  const sending = useRef(false);
  const url = `/api/jobs/${encodeURIComponent(jobId)}/recovery-cases/${encodeURIComponent(caseId)}/managed-recovery`;
  const storageKey = `managed-recovery:${jobId}:${caseId}`;

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
        const result = await response.json();
        if (!active) return;
        setMessage(result.message);
        if (!response.ok) { setView(null); return; }
        setView(result);
        const saved = sessionStorage.getItem(storageKey);
        if (saved) setPending(JSON.parse(saved) as Command);
      } catch { if (active) setMessage("The practice case is unavailable. Reload to try again."); }
    })();
    return () => { active = false; };
  }, [url, storageKey]);

  async function submit() {
    if (sending.current || !view) return;
    const choice = view.choices.find(item => item.command.selection.service === selected);
    if (!pending && (!choice || !confirmed)) return;
    const command = pending ?? { ...choice!.command, commandId: crypto.randomUUID() };
    sending.current = true;
    setBusy(true);
    try {
      // Persist before sending: a reload or lost response must not mint a new command.
      sessionStorage.setItem(storageKey, JSON.stringify(command));
      setPending(command);
      const response = await sendManagedRecoveryChoice(url, command, view.csrfToken);
      const result = await response.json();
      setMessage(result.message);
      if (response.ok) {
        setView(result); setPending(null); sessionStorage.removeItem(storageKey);
      } else if (response.status < 500) {
        setPending(null); sessionStorage.removeItem(storageKey); setRefused(true);
        // Never leave stale money/case details visible after access is refused.
        if (response.status === 404) setView(null);
      }
    } catch { setMessage("The result is uncertain. Retry the same choice to check it safely."); }
    finally { sending.current = false; setBusy(false); }
  }

  const locked = busy || !!pending || refused || !!view?.preview.serviceChargeInvoice;
  return <section aria-label="Per-case practice choice" style={{ overflowWrap: "anywhere" }}>
    <p role="status" aria-live="polite">{message}</p>
    {view && <>
      <p>Case: {view.preview.caseId}</p>
      <p>Terms version: {view.termsVersion}</p>
      <p>{view.successFeeLabel}: {view.successFeeAmount}</p>
      <p>Each optional choice is a service charge shown separately from the success fee.</p>
      <p>{view.preview.warning}. {view.preview.vatLabel}.</p>
      {view.preview.serviceChargeInvoice ? <p role="status">Saved service charge preview: {view.serviceChargeAmount}; +{view.preview.serviceChargeInvoice.points} points; terms {view.preview.serviceChargeInvoice.termsVersion}.</p>
        : <p>No service charge line in this preview.</p>}
      <form onSubmit={event => { event.preventDefault(); void submit(); }}>
        <fieldset disabled={locked}>
          <legend>Optional service for this case</legend>
          {view.choices.map(choice => <label key={choice.command.selection.service} style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 48, padding: 8 }}>
            <input type="radio" name="managed-service" value={choice.command.selection.service}
              checked={selected === choice.command.selection.service} onChange={event => { setSelected(event.target.value); setConfirmed(false); }}
              style={{ width: 44, height: 44, flexShrink: 0 }} />{choice.label}
          </label>)}
          <label style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 48, padding: 8 }}>
            <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} style={{ width: 44, height: 44, flexShrink: 0 }} />
            I confirm this case, my choice and the terms version shown above.
          </label>
        </fieldset>
        {pending && <p>The previous result is uncertain. Retry sends the exact same choice.</p>}
        <button type="submit" disabled={busy || refused || (!pending && (!selected || !confirmed || !!view.preview.serviceChargeInvoice))}
          style={{ minHeight: 44, minWidth: 44 }}>{pending ? "Retry same choice" : "Save practice choice"}</button>
      </form>
    </>}
  </section>;
}
