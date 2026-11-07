"use client";
import { captureWorkspaceResponseV1 } from "@jobguard/api/capture-contracts";
import { quoteWorkspaceResponseV1 } from "@jobguard/api/quote-contracts";
import { z } from "zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { sessionResponseV1 } from "../../lib/contracts";
import { WalkIt } from "../../ui/jobguard-app";
import { ReviewProposal, type ReviewCaptureResult } from "../../ui/review-proposal";
import { WorkspaceShell } from "../../ui/workspace-shell";
import { ValuePage } from "../../ui/job-value";
import { Walkthrough, type WalkthroughStep } from "../../ui/walkthrough/walkthrough";
import { recoverCapture } from "../../demo-s/journey-launch";
import { core1000Source } from "../../demo-s/core-1000/journey-model";
import styles from "./voice-journey.module.css";
import { click, fill, reviewAndPrice, screen, text, until } from "./screen-actions";

export const stages = [
  ["Record a quote", "Talk through a made-up job using on-device voice. Type it in, or press Show me to see a sample. No real names or addresses. Show me uses labelled sample text; it does not record your microphone."],
  ["Check the quote lines", "Check the source excerpts and fix a line. Accept the lines, answer the questions, confirm scope and save a priced draft. Show me changes one description before saving."],
  ["Send the quote", "This part uses a prepared example job. Your own draft stays saved. Customer invitation before final-account lock is a prerequisite still to build. This example simulates delivery; nothing is sent."],
  ["Customer says yes", "This part uses a prepared example job. The existing control records builder-attested practice acceptance, not an authenticated customer response. Record it and start the practice job."],
  ["Add on-site evidence", "Attach the generated fictional photo, check file integrity and complete the stage. Never upload a real site photo in this exercise."],
  ["Price extra work", "Add a £125 fictional extra and approve its exact revision. Approval here is a builder's practice attestation; authenticated customer approval is not available on this pre-lock example."],
  ["Lock and run Final Check", "This part uses a prepared example job. Build the final bill, mark the baseline work done, accept the terms and lock. Run Final Check and load its saved result; it may take a few minutes. No finding is promised."],
  ["Invoice and simulated payment", "Issue the invoice from the checked bill. Record its full amount as a fictional practice receipt. A recorded receipt is not bank-confirmed payment and cannot earn a recovery fee."],
  ["Read the end report", "Open the report in pounds and follow its saved source links. These are the prepared job's figures, not savings on your own draft. The report does not guess money protected."],
] as const;

const progressSchema = z.object({ jobId: z.uuid(), prepared: z.union([z.uuid(), z.literal("")]), priced: z.boolean() });
export const progressKey = (tenantId: string) => `walk-3.progress:${tenantId}`;
// Storage carries navigation hints only. Server reads establish capture and quote progress.
export async function restoreProgress(raw: string | null) {
  try {
    const saved = progressSchema.parse(JSON.parse(raw ?? "null"));
    async function proposal(id: string) {
      const response = await fetch(`/api/jobs/${id}/proposal`, { cache: "no-store" });
      if (!response.ok) throw new Error("Unavailable saved job");
      const snapshot = captureWorkspaceResponseV1.parse(await response.json());
      if (snapshot.jobId !== id) throw new Error("Wrong saved job");
      return snapshot;
    }
    const capture = await proposal(saved.jobId);
    let priced = false, prepared = "", initialStep = 1;
    if (saved.priced) {
      try {
        const response = await fetch(`/api/jobs/${saved.jobId}/quotes`, { cache: "no-store" });
        if (response.ok) {
          const quote = quoteWorkspaceResponseV1.parse(await response.json());
          priced = quote.jobId === saved.jobId && quote.revisions.some(revision => revision.revision > 0);
        }
      } catch { /* An unverified flag is dropped, never assumed complete. */ }
    }
    if (priced) initialStep = 2;
    if (saved.prepared && priced) {
      try {
        const example = await proposal(saved.prepared);
        prepared = saved.prepared;
        if (["live", "invoiced", "paid"].includes(example.status)) initialStep = 4;
        else if (example.status === "accepted") initialStep = 3;
      } catch { /* Drop inaccessible examples. */ }
    }
    return { capture, priced, prepared, initialStep };
  } catch { return null; }
}

export function approvedExtraDone() {
  const amount = text("approved-additions");
  return /^£[\d,]+\.\d{2}$/.test(amount) && amount !== "£0.00";
}
export const evidenceDone = () => text("stage-status") === "Complete" &&
  text("proof-state") === "File integrity checked · synthetic example" && !text("stage-review");

export async function addOnSiteEvidence(_: HTMLElement, signal: AbortSignal) {
  // The saved proof read can arrive after Show me starts on a resumed job.
  // Wait for that read, then use only the controls the saved state still needs.
  await until(() => evidenceDone() || !!screen()?.querySelector(
    '.proof-actions button:not(:disabled)',
  ), signal);
  if (evidenceDone()) return;
  if (text("proof-state") === "Not attached") {
    await click("Attach generated practice image", signal);
    await until(() => text("proof-state") !== "Not attached", signal);
  }
  if (text("proof-state") === "Uploading") await click("Check file integrity", signal);
  await until(() => text("proof-state") === "File integrity checked · synthetic example", signal);
  if (!evidenceDone()) await click("Complete this stage", signal);
}

export const finalCheckDone = () => text("final-check-status").startsWith("JobGuard's final check found");

export function VoiceJourney() {
  const [tenantId, setTenantId] = useState(""), [capture, setCapture] = useState<ReviewCaptureResult | null>(null);
  const [screenVersion, setScreenVersion] = useState(0);
  const [initialStep, setInitialStep] = useState(0);
  const [prepared, setPrepared] = useState(""), [report, setReport] = useState(false), [tour, setTour] = useState(true);
  const [error, setError] = useState(""), [preparing, setPreparing] = useState(false);
  const current = useRef({ capture, prepared, report, tenantId }); current.current = { capture, prepared, report, tenantId };
  const ownPriced = useRef(false), preparingRef = useRef(false);
  useEffect(() => {
    // WALK-2 owns creation and privacy. Reading this route alone never creates example jobs.
    void (async () => {
      const started = await fetch("/api/practice-company", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: "blank-practice-company.v1", action: "start" }) });
      if (!started.ok) throw new Error("The empty practice firm could not load. Return to the practice company and try again.");
      const response = await fetch("/api/session", { cache: "no-store" });
      if (!response.ok) throw new Error("The practice session could not load.");
      const session = sessionResponseV1.parse(await response.json());
      const tenant = session.tenants[0]!.id;
      let restored = null;
      try { restored = await restoreProgress(sessionStorage.getItem(progressKey(tenant))); } catch { /* Storage may be unavailable. */ }
      if (restored) {
        setCapture(restored.capture); setPrepared(restored.prepared); ownPriced.current = restored.priced;
        setInitialStep(restored.initialStep);
        if (restored.prepared) history.replaceState(null, "", `${location.pathname}${location.search}${restored.initialStep >= 4 ? "#work-proof" : "#quote"}`);
      } else {
        try { sessionStorage.removeItem(progressKey(tenant)); } catch { /* Storage may be unavailable. */ }
      }
      // Evidence and later steps are re-read from the prepared screen, never restored as completed flags.
      setTenantId(tenant);
    })().catch(reason => setError((reason as Error).message));
  }, []);
  function remember(priced = ownPriced.current) {
    const { capture, prepared } = current.current;
    if (!capture) return;
    try { sessionStorage.setItem(progressKey(current.current.tenantId), JSON.stringify({ jobId: capture.jobId, prepared, priced })); } catch { /* The journey also works without storage. */ }
  }
  useEffect(() => { if (tenantId) remember(); }, [tenantId, capture, prepared]);
  async function prepare() {
    if (preparingRef.current || current.current.prepared) return;
    preparingRef.current = true; setPreparing(true); setError("");
    try {
      // Keep the same capture request on retry, including after an unknown outcome.
      const key = `walk-3.prepared:${tenantId}:${current.current.capture?.jobId}`;
      let id = sessionStorage.getItem(key);
      if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(key, id); }
      setPrepared(await recoverCapture(id, core1000Source));
    } catch (reason) { setError((reason as Error).message); }
    finally { preparingRef.current = false; setPreparing(false); }
  }
  const steps = useMemo<WalkthroughStep[]>(() => {
    const done = [
      () => !!current.current.capture,
      () => { if (!ownPriced.current && !current.current.prepared && Number(text("quote-revision")) > 0) { ownPriced.current = true; remember(true); } return ownPriced.current; },
      () => !!current.current.prepared && text("quote-delivery") === "Simulated delivery — nothing sent",
      () => !!screen()?.querySelector('[data-testid="activation-policy"]'),
      evidenceDone,
      approvedExtraDone,
      finalCheckDone,
      () => !!text("invoice-gross") && text("invoice-balance") === "GBP 0.00",
      () => current.current.report && !!text("value-invoiced-gross") && text("value-invoiced-gross") !== "No recorded outcome yet",
    ];
    const actions: WalkthroughStep["autoAction"][] = [
      async (_, signal) => {
        await fill("#walk-source", core1000Source);
        await click("Make my draft", signal);
      },
      async (_, signal) => {
        const input = screen().querySelector<HTMLInputElement>('.review-line input[aria-label^="Description "]');
        if (!input && current.current.capture?.status !== "draft") {
          if (!screen().querySelector(".quote-editor")) await click("Price the work", signal);
          await until(() => screen().querySelector(".quote-editor")?.getAttribute("data-quote-ready") === "true", signal);
          await click("Save draft revision", signal);
          return;
        }
        if (!input) throw new Error("Check the captured lines first.");
        await fill(`[aria-label=${JSON.stringify(input.getAttribute("aria-label"))}]`, `${input.value} carefully`);
        await reviewAndPrice(signal);
      },
      async (_, signal) => {
        if (!current.current.prepared) document.getElementById("walk-prepare")?.click();
        await until(() => !!current.current.prepared, signal);
        // The prepared example uses the existing real job screens, never inserted end-state facts.
        if (screen().querySelector(".review-line")) await reviewAndPrice(signal);
        else {
          await until(() => !!screen().querySelector(".review-line, .quote-editor, .confirmed-scope"), signal);
          if (screen().querySelector(".review-line")) await reviewAndPrice(signal);
          else if (!screen().querySelector(".quote-editor")) await click("Price the work", signal);
        }
        if (!text("party-customer")) await click("Save customer and site", signal);
        await until(() => !!text("party-customer"), signal);
        await click("Preview immutable quote", signal);
        await click("Simulate sending this quote", signal);
        await click("Continue fake worker", signal);
      },
      async (_, signal) => { await click("Record practice acceptance", signal); await click("Start this practice job", signal); },
      addOnSiteEvidence,
      async (_, signal) => {
        if (!screen().querySelector(".variation-list article")) {
          await fill('.variation-entry input:not([aria-label])', "Extra preparation");
          await fill('[aria-label="Variation price (£, optional)"]', "125.00");
          await click("Add proposed variation", signal);
        }
        await click("Approve exact revision", signal);
      },
      async (_, signal) => {
        if (!text("final-gross")) await click("Build final account", signal);
        const selects = [...screen().querySelectorAll<HTMLSelectElement>('select[aria-label^="Disposition "]')];
        await until(() => screen().querySelectorAll('select[aria-label^="Disposition "]').length > 0, signal);
        for (const select of (selects.length ? selects : screen().querySelectorAll<HTMLSelectElement>('select[aria-label^="Disposition "]'))) {
          await fill(`[aria-label=${JSON.stringify(select.getAttribute("aria-label"))}]`, "done");
          await until(() => screen().querySelector('[data-testid="final-account-lock"]')?.getAttribute("aria-busy") === "false", signal);
        }
        const terms = [...screen().querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Accept final check terms");
        if (terms && !terms.disabled) await click("Accept final check terms", signal);
        await click("Complete final account", signal);
        // Reload the existing screen's read models after the immutable lock commits.
        await until(() => text("lock-state") === "Final account completed", signal);
        await click("Load the saved final check", signal);
        await click("Run the final check (practice)", signal);
        while (!done[6]!()) {
          await new Promise(resolve => setTimeout(resolve, 3000)); signal.throwIfAborted();
          await click("Load the saved final check", signal);
        }
      },
      async (_, signal) => {
        // Keep the checked bill mounted; refreshing would reopen the scope screen.
        history.replaceState(null, "", `${location.pathname}${location.search}#final-account-title`);
        await until(() => !!text("final-gross") && !!text("final-check-status"), signal);
        if (!text("invoice-gross")) await click("Issue and simulate this invoice", signal);
        await until(() => !!text("invoice-gross"), signal);
        // Invoice issue and receipt history load independently. Wait for the real
        // receipt form rather than treating the issued invoice as form readiness.
        await until(() => {
          const input = screen().querySelector<HTMLInputElement>('[data-testid="uiwire12-receipt-amount"]');
          return !!input && !input.disabled && !input.closest("fieldset[disabled]");
        }, signal);
        const amount = text("invoice-balance").replace("GBP ", "").replaceAll(",", "");
        await fill('[data-testid="uiwire12-receipt-amount"]', amount);
        await fill('[data-testid="uiwire12-receipt-reference"]', "Fictional walkthrough receipt");
        await click("Record practice receipt", signal);
      },
      () => { document.getElementById("walk-report")?.click(); },
    ];
    return stages.map(([title, words], index) => ({ id: `walk-${index + 1}`, title, words, target: index === 2 ? "#walk-prepare, #walk-screen" : "#walk-screen", spotlightTarget: () => screen()?.querySelector<HTMLElement>("[data-walk-action]") ?? (index === 2 ? document.getElementById("walk-prepare") : null), isDone: done[index]!, autoAction: actions[index]!, timeoutMs: index === 6 ? 240_000 : 30_000 }));
  }, []);
  return <>
    <header className="workspace-page"><a href="/practice-company">Back to your practice firm and reset</a><h1>Walk your first practice job</h1>
      <p>Made-up data only. Do not enter real customer names or addresses. Nothing is sent or charged.</p>
      <p>Show me and Play the whole thing use sample text instead of recording audio. Voice, when available, stays on your device.</p>
      {!tour && <button onClick={() => setTour(true)}>Open guided walkthrough</button>}
      {capture && <p>Your own draft: <a href={`/jobs/${capture.jobId}`}>Open your saved job</a>. It is kept separately from the prepared example.</p>}
      {capture && !prepared && <section><h2>Continue with the prepared example</h2><p>This part uses a prepared example job. Sending to a simulated customer and customer acceptance are not yet supported for your own draft before lock. The example uses simulated sending and builder-recorded practice acceptance.</p><button id="walk-prepare" disabled={preparing} onClick={() => void prepare()}>Use the prepared example job</button></section>}
      {prepared && <aside aria-label="Simulated customer"><h2>Prepared example · simulated customer</h2><p>This part uses a prepared example job. No invitation is sent. The customer view is not connected here; acceptance and extra approval use explicit builder practice attestations.</p><p>Use the quote preview below to inspect the exact fictional document.</p><button id="walk-refresh" onClick={() => setScreenVersion(value => value + 1)}>Refresh the prepared job</button><button id="walk-report" onClick={() => setReport(true)}>Open the saved end report</button>{report && <button onClick={() => setReport(false)}>Return to the prepared job</button>}</aside>}
      {error && <p role="alert">{error}</p>}
    </header>
    <div id="walk-screen" className={styles.screen} tabIndex={-1}>
      {!tenantId ? <p role="status">Loading your private practice firm…</p> : prepared ? report ? <ValuePage jobId={prepared} /> : <WorkspaceShell key={`${prepared}:${screenVersion}`} jobId={prepared} /> : capture ? <ReviewProposal result={capture} back={() => location.assign("/practice-company")} /> : <WalkIt tenantId={tenantId} initialText="" close={() => location.assign("/practice-company")} onCaptured={setCapture} />}
    </div>
    {tenantId && tour && <Walkthrough initialIndex={initialStep} steps={steps} onClose={() => setTour(false)} />}
  </>;
}
