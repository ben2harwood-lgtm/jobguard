"use client";
import { useEffect, useRef, useState } from "react";
import type { BrowserMandateCommand } from "../../api/subscription-mandate/route";

type Selection = Extract<BrowserMandateCommand["command"], { kind: "approve" }>["selection"];
type Screen = { version: "subscription-mandate-screen.v1"; sequence: number; csrfToken: string;
  snapshot: { record: null | { state: string; termsHash: string }; authorityCurrent: boolean; providerCancellation?: string };
  preview: { selection: Selection; termsText: string; termsHash: string; previewProof: string } };
const messages: Record<string, string> = {
  MANDATE_STALE: "This record changed. Refresh and review the current terms before trying again.",
  MANDATE_NOTICE_REAUTHORISATION_REQUIRED: "A changed price, allowance, frequency or scope needs fresh approval. Changes remain blocked until Ben approves the notice and reauthorisation policy.",
  MANDATE_INVALID: "These terms could not be approved. Refresh and review the exact terms again.",
  MANDATE_COMMAND_CONFLICT: "This command ID was already used for another request. Refresh before making a new choice.",
  MANDATE_TERMINAL: "This authority has already ended. Refresh to see its current state.",
  MANDATE_NOT_APPROVED: "There is no approved authority to end.",
  NOT_FOUND: "Practice terms are unavailable. Sign in as the company owner with a current session.",
};
const target = { minHeight: 44, minWidth: 44 };

export default function MandateScreen() {
  const [screen, setScreen] = useState<Screen | null>(null);
  const [plan, setPlan] = useState("Solo");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<BrowserMandateCommand | null>(null);
  async function refresh(selectedPlan = plan) {
    setScreen(null); setConsent(false); setMessage(""); setBusy(true);
    try {
      const response = await fetch(`/api/subscription-mandate?plan=${encodeURIComponent(selectedPlan)}`, { cache: "no-store" });
      const answer = await response.json();
      if (!response.ok) { setMessage(messages[answer.code] ?? "Practice terms are unavailable. Try again later."); return; }
      setScreen(answer);
    } catch { setMessage("Practice terms could not be loaded. Try again later."); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh("Solo"); }, []);
  async function send(kind: "approve" | "revoked" | "cancelled") {
    if (!screen || busy) return;
    if (!pending.current) {
      if (kind !== "approve" && !window.confirm(kind === "revoked" ? "Revoke this practice authority?" : "Cancel this practice agreement?")) return;
      const common = { version: "subscription-mandate-command.v1" as const, expectedSequence: screen.sequence };
      pending.current = { commandId: crypto.randomUUID(), command: kind === "approve"
        ? { ...common, kind, selection: screen.preview.selection, previewProof: screen.preview.previewProof }
        : { ...common, kind } };
    }
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/subscription-mandate", { method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", "x-csrf-token": screen.csrfToken }, body: JSON.stringify(pending.current) });
      const answer = await response.json();
      if (response.status >= 500) throw new Error("uncertain");
      pending.current = null; setUncertain(false);
      if (!response.ok) { setMessage(messages[answer.code] ?? "The server refused this request. Refresh before trying again."); setConsent(false); return; }
      await refresh();
      setMessage(`Server recorded ${answer.state}. ${answer.termsHash ? `Terms hash: ${answer.termsHash}. ` : ""}Nothing was collected.`);
    } catch {
      setUncertain(true);
      setMessage("The outcome is unknown. Retry the same request to check it safely; its command ID is kept.");
    } finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 760, margin: "0 auto", padding: 16, overflowWrap: "anywhere" }}>
    <h1>Practice terms and standing authority</h1>
    <p>Practice only. This wording still needs Ben’s approval. Nothing is collected from this screen.</p>
    <p>Only the listed renewals, extra-job charges within the monthly maximum, notices and fee collection with separate approval of each exact statement are covered. No automatic plan changes are permitted.</p>
    <p>Changed prices, allowances, frequency or scope need fresh approval and an approved notice policy.</p>
    <label>Plan <select style={target} value={plan} disabled={busy || uncertain} onChange={event => {
      setPlan(event.target.value); void refresh(event.target.value);
    }}><option>Solo</option><option>Builder</option></select></label>{" "}
    <button style={target} disabled={busy || uncertain} onClick={() => void refresh()}>Refresh terms</button>
    {screen && <>
      <p>Current state: {screen.snapshot.record?.state ?? "not approved"}. Authority: {screen.snapshot.authorityCurrent ? "current practice record only; no live authority" : "not current; no authority"}.</p>
      {screen.snapshot.record && <p>Recorded terms hash: {screen.snapshot.record.termsHash}</p>}
      {screen.snapshot.providerCancellation === "pending" && <p>Provider cancellation is pending. No provider has been contacted; in-flight outcomes still need reconciliation.</p>}
      <h2>Exact agreement text</h2>
      <pre data-testid="mandate-terms" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "inherit" }}>{screen.preview.termsText}</pre>
      <p>Preview terms hash: {screen.preview.termsHash}</p>
      <label style={{ display: "flex", alignItems: "center", minHeight: 44 }}>
        <input type="checkbox" style={target} checked={consent} disabled={busy || uncertain} onChange={event => setConsent(event.target.checked)} />
        I have read this exact practice agreement.
      </label>
      <button style={target} disabled={!consent || busy || uncertain} onClick={() => void send("approve")}>Approve practice terms</button>{" "}
      <button style={target} disabled={!screen.snapshot.record || busy || uncertain} onClick={() => void send("revoked")}>Revoke authority</button>{" "}
      <button style={target} disabled={!screen.snapshot.record || busy || uncertain} onClick={() => void send("cancelled")}>Cancel agreement</button>
      {uncertain && <button style={target} disabled={busy} onClick={() => void send(pending.current!.command.kind)}>Retry same request</button>}
    </>}
    {message && <p role="status">{message}</p>}
  </main>;
}
