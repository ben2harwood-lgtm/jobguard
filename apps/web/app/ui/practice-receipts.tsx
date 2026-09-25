"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { practiceFeedResponseV1, type PracticeFeedResponse } from "@jobguard/api/practice-feed-contracts";
import { pounds } from "../lib/pounds";
import styles from "./practice-receipts.module.css";

const scenarios = [
  ["pending_384", "Pending gross £384"],
  ["settled_384", "Fake settlement event"],
  ["replay_event", "Replay the same event"],
  ["page_overlap", "Overlapping movement page"],
  ["alternate_representation", "Known alternate statement representation"],
  ["unknown_duplicate", "Unknown duplicate identity"],
] as const;
type Scenario = typeof scenarios[number][0];
type Action = "connect" | "advance" | "disconnect" | "reconcile_duplicate";
const stateLabels = {
  pending: "Pending — cannot qualify",
  settled: "Simulated settled movement",
  possible_duplicate: "Possible duplicate movement — review needed",
} as const;

export function PracticeReceipts({ jobId }: { jobId: string }) {
  const [view, setView] = useState<PracticeFeedResponse | null>(null);
  const [scenario, setScenario] = useState<Scenario>("pending_384");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  const requestGeneration = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const path = `/api/jobs/${encodeURIComponent(jobId)}/practice-feed`;

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true); setError("");
    try {
      const response = await fetch(path, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("load");
      const snapshot = practiceFeedResponseV1.parse(await response.json());
      if (generation === requestGeneration.current) setView(snapshot);
    } catch {
      if (generation === requestGeneration.current && !controller.signal.aborted) {
        setError("Practice receipts could not load. Try loading the saved facts again.");
      }
    } finally {
      if (generation === requestGeneration.current) setBusy(false);
    }
  }, [path]);

  useEffect(() => {
    setView(null); setNotice(""); void load();
    return () => { requestGeneration.current++; activeRequest.current?.abort(); };
  }, [load]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function act(action: Action) {
    if (!view || busy) return;
    const generation = ++requestGeneration.current;
    activeRequest.current?.abort();
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(path, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: "practice-feed-command.v1", commandId: crypto.randomUUID(),
          expectedRevision: view.revision, action, ...(action === "advance" ? { scenario } : {}) }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error("command");
      const snapshot = practiceFeedResponseV1.parse(body);
      if (generation !== requestGeneration.current) return;
      setView(snapshot);
      setNotice(action === "disconnect" ? "Practice feed disconnected. Saved movement facts are kept."
        : action === "connect" ? "Practice feed connected. Choose a generated event to run."
          : action === "reconcile_duplicate" ? "Generated duplicate reconciled. No eligible net has been allocated."
            : "Generated adapter event recorded. The saved movement facts are shown below.");
    } catch {
      if (generation === requestGeneration.current) {
        setError("The practice feed could not be updated. Load its saved state before trying again.");
      }
    } finally {
      if (generation === requestGeneration.current) setBusy(false);
    }
  }

  async function nextPage() {
    if (!view?.nextCursor || busy) return;
    const generation = ++requestGeneration.current;
    setBusy(true); setError("");
    try {
      const response = await fetch(`${path}?cursor=${encodeURIComponent(view.nextCursor)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("page");
      const snapshot = practiceFeedResponseV1.parse(await response.json());
      if (snapshot.revision !== view.revision) throw new Error("stale-page");
      if (generation === requestGeneration.current) {
        setView(previous => previous ? { ...snapshot,
          movements: [...new Map([...previous.movements, ...snapshot.movements].map(movement => [movement.id, movement])).values()],
        } : snapshot);
      }
    } catch {
      if (generation === requestGeneration.current) setError("The next movement page could not load. Load the saved facts again.");
    } finally {
      if (generation === requestGeneration.current) setBusy(false);
    }
  }

  const firstMovement = view?.movements.find(movement => movement.state !== "possible_duplicate");
  const duplicate = view?.movements.find(movement => movement.state === "possible_duplicate");
  const connected = view?.feedState === "connected";
  return <section id="practice-receipts" className={styles.panel} aria-labelledby="practice-receipts-title" aria-busy={busy}>
    <p className="eyebrow">recovery-18800 · generated receipt events</p>
    <h2 id="practice-receipts-title">Practice receipts</h2>
    <p>Use only the supplied fictional job and generated events. Do not enter real names, account details or invoices.</p>
    <p>This practice feed has no bank connection. Settlement alone never allocates money to a case.</p>
    {busy && <p role="status">{view ? "Checking the saved practice feed…" : "Loading practice receipts…"}</p>}
    {error && <div ref={errorRef} className={styles.error} role="alert" tabIndex={-1}>
      <p>{error}</p><button type="button" disabled={busy} onClick={() => void load()}>Load saved practice receipts</button>
    </div>}
    {notice && <p role="status">{notice}</p>}
    {view && <>
      <dl className={styles.facts}>
        <div><dt>Practice feed</dt><dd data-testid="practice-feed-state">{connected ? "Connected" : view.feedState === "disconnected" ? "Disconnected" : "Not connected"}</dd></div>
        <div><dt>Underlying movements</dt><dd data-testid="underlying-movement-count">{new Set(view.movements.map(movement => movement.underlyingMovementId)).size}</dd></div>
        <div><dt>Real external actions</dt><dd data-testid="practice-feed-real-external-actions">{view.realExternalActions}</dd></div>
      </dl>
      {view.feedState === "not_connected" && <button type="button" disabled={busy} onClick={() => void act("connect")}>Connect practice feed</button>}
      {connected && <>
        <div className={styles.actions}>
          <label htmlFor={`practice-receipt-scenario-${jobId}`}>Generated receipt scenario
            <select id={`practice-receipt-scenario-${jobId}`} value={scenario} disabled={busy} onChange={event => setScenario(event.target.value as Scenario)}>
              {scenarios.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button type="button" disabled={busy} onClick={() => void act("advance")}>Advance practice executor</button>
        </div>
        <p className={styles.muted}>Scenario choice is an unsaved draft. Advancing runs the server&apos;s generated adapter event.</p>
      </>}
      {view.movements.length === 0 && <p>No practice movements recorded yet.</p>}
      {firstMovement && <article className={styles.movement} aria-label="Generated receipt movement">
        <h3>Fictional customer receipt</h3>
        <dl className={styles.facts}>
          <div><dt>Gross receipt</dt><dd data-testid="movement-gross">{pounds(firstMovement.grossPence)}</dd></div>
          <div><dt>Movement state</dt><dd data-testid="movement-state">{stateLabels[firstMovement.state]}</dd></div>
          <div><dt>Allocated eligible net</dt><dd data-testid="allocated-eligible-net">{pounds(firstMovement.allocatedEligibleNetPence)}</dd></div>
        </dl>
        <p data-testid="movement-allocation-state">{firstMovement.eligibleForAllocation
          ? "Ready for a separate allocation review — nothing allocated"
          : "Ineligible for allocation"}</p>
      </article>}
      {duplicate && <div className={styles.warning}>
        <p data-testid="possible-duplicate-state">Possible duplicate movement — review needed</p>
        <p>These generated records may describe the same money. They remain ineligible until reconciled.</p>
        <p>Candidate gross {pounds(duplicate.grossPence)} · allocated eligible net {pounds(duplicate.allocatedEligibleNetPence)}</p>
        <button type="button" disabled={busy || !connected} onClick={() => void act("reconcile_duplicate")}>Reconcile generated duplicate</button>
      </div>}
      {connected && <div className={styles.actions}><button type="button" disabled={busy} onClick={() => void act("disconnect")}>Disconnect practice feed</button></div>}
      {view.feedState === "disconnected" && <p>New events are stopped. Past movement facts and their source history remain available.</p>}
      {view.nextCursor && <button type="button" disabled={busy} onClick={() => void nextPage()}>Load next movement page</button>}
      <details className={styles.details} data-testid="practice-receipt-sources">
        <summary>Practice receipt details and sources</summary>
        <dl>
          <dt>Job identity</dt><dd><code data-testid="receipt-job-id">{view.jobId}</code></dd>
          <dt>Practice account identity</dt><dd><code data-testid="practice-account-id">{view.accountId ?? "No account yet"}</code></dd>
          <dt>Saved revision</dt><dd data-testid="practice-feed-revision">{view.revision}</dd>
          <dt>Source event count</dt><dd data-testid="practice-feed-event-count">{view.eventCount}</dd>
          <dt>Adapter page cursor</dt><dd data-testid="practice-feed-cursor">{view.nextCursor ?? "No next page"}</dd>
        </dl>
        {view.movements.map(movement => <div key={movement.id}>
          <h3>{stateLabels[movement.state]}</h3>
          <p>Movement identity <code data-testid="receipt-movement-id">{movement.id}</code></p>
          <p>Underlying identity <code data-testid="receipt-underlying-id">{movement.underlyingMovementId}</code></p>
          <p>Saved source events</p><ul>{movement.eventIds.map(id => <li key={id}><code data-testid="receipt-event-id">{id}</code></li>)}</ul>
          <p>Validated source hashes</p><ul>{movement.sourceHashes.map(hash => <li key={hash}><code data-testid="receipt-source-hash">{hash}</code></li>)}</ul>
        </div>)}
      </details>
    </>}
  </section>;
}
