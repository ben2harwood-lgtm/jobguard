"use client";
import { useCallback, useEffect, useState } from "react";
import { pounds } from "../lib/pounds";
import styles from "./northside.module.css";

type Step = { role: string; timeLimitMinutes: number; escalationRole: string; alternateRoles: string[] };
type Practice = {
  role: string; membershipId: string; testerMembershipId?: string; settingsHash?: string;
  targetsToSwitch: Array<{ membershipId: string; role: string }>;
  settings?: { version: string; label: string; notice: string; journey: string[]; linkLifetimeMinutes: number; photoUploadLifetimeMinutes: number;
    rules: { proceedLimit: { pence: number }; bands: Array<{ upToPence: number | null; steps: Step[] }>;
      clientApproval: { kind: string; abovePence?: number; beforeWorkAbovePence?: number; timeLimitMinutes?: number }; evidence: { photosRequired: boolean; residentConfirmationRequired: boolean } } };
  recentActions: Array<{ sourceId: string; sourceKind: string; actorRole: string; actorMembershipId: string; testerMembershipId: string; switchId: string | null; settingsVersion: string; settingsHash: string }>;
};
/** One persisted owner session, explicitly ended before each next role. These calls are #225's product endpoints. */
export function NorthsidePractice() {
  const [practice, setPractice] = useState<Practice | null>(null), [state, setState] = useState("owner"), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [summary, switched] = await Promise.all([fetch("/api/northside", { cache: "no-store" }), fetch("/api/contractor/practice/acting-as", { cache: "no-store" })]);
    if (summary.ok) setPractice(await summary.json());
    if (switched.ok) setState((await switched.json()).state);
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function change(membershipId?: string) {
    setBusy(true); setError("");
    const post = async (url: string, version: string) => {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version, commandId: crypto.randomUUID() }) });
      if (!r.ok) throw new Error(`Practice switch refused (${(await r.json()).code}).`);
    };
    try {
      const current = await fetch("/api/contractor/practice/acting-as", { cache: "no-store" });
      if (!current.ok) throw new Error("Practice switch state unavailable.");
      if ((await current.json()).state !== "owner") await post("/api/contractor/practice/acting-as/end", "practice-worker-switch-off.v1");
      if (membershipId) await post(`/api/contractor/practice/workers/${membershipId}/acting-as`, "practice-worker-switch-on.v1");
      window.location.reload();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  if (!practice?.settings) return null;
  const s = practice.settings, client = s.rules.clientApproval;
  return <section className={styles.card} aria-label="Practice roles and demo settings">
    <p data-testid="actual-actor">Acting as {practice.role} ({practice.membershipId}); performed by practice owner ({practice.testerMembershipId}).</p>
    <p>Practice sandbox — fictional roles share this tester&apos;s session. Switch state: {state}.</p>
    {error && <p role="alert">{error}</p>}
    <div className={styles.actions}>
      <button disabled={busy || state === "owner"} onClick={() => void change()}>Return to owner</button>
      {practice.targetsToSwitch.map(target => <button key={target.membershipId} disabled={busy || (state === "acting" && target.membershipId === practice.membershipId)} onClick={() => void change(target.membershipId)}>Act as {target.role}</button>)}
    </div>
    <details data-testid="demo-settings"><summary>Demo settings</summary>
      <p>{s.notice}</p><p>Stored version {s.version}; hash <span className={styles.link}>{practice.settingsHash}</span>.</p>
      <ul>
        <li>Journey: {s.journey.join(" → ")} — {s.label}</li>
        <li>Proceed comparison X: {pounds(s.rules.proceedLimit.pence)} — {s.label}. This grants no permission to start work.</li>
        {s.rules.bands.map((band, index) => <li key={index}>Band {band.upToPence === null ? "above the previous band" : `up to ${pounds(band.upToPence)}`}: {band.steps.map(step => `${step.role}; ${step.timeLimitMinutes} minutes; alternate ${step.alternateRoles.join(", ") || "none"}; escalation ${step.escalationRole}`).join(" then ")} — {s.label}</li>)}
        <li>Client approval above {pounds(client.abovePence ?? 0)}; before-work comparison Y above {pounds(client.beforeWorkAbovePence ?? 0)}; {client.timeLimitMinutes} minutes — {s.label}. X/Y grant no permission to start work.</li>
        <li>Photo {s.rules.evidence.photosRequired ? "required" : "optional"}; resident confirmation {s.rules.evidence.residentConfirmationRequired ? "required" : "optional"} — {s.label}</li>
        <li>Local link lifetime {s.linkLifetimeMinutes} minutes; photo upload lifetime {s.photoUploadLifetimeMinutes} minutes — {s.label}</li>
      </ul>
      <p>Timers and escalation are not scheduled. Work timing is unavailable; approval-before-work has not been derived.</p>
    </details>
    <details><summary>My stored action attribution</summary><ul data-testid="action-attribution">{practice.recentActions.map(a => <li key={`${a.sourceKind}:${a.sourceId}`}>Acting as {a.actorRole} ({a.actorMembershipId}); performed by {a.testerMembershipId}. {a.sourceKind}: {a.sourceId}; switch {a.switchId ?? "owner"}; {a.settingsVersion}; <span className={styles.link}>{a.settingsHash}</span>.</li>)}</ul></details>
  </section>;
}
