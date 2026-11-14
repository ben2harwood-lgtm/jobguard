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
import { Walkthrough, viewerPlayback, type WalkthroughStep } from "../../ui/walkthrough/walkthrough";
import { recoverCapture } from "../../demo-s/journey-launch";
import { core1000Source } from "../../demo-s/core-1000/journey-model";
import styles from "./voice-journey.module.css";
import { rememberWalkJob, resumeWalkthrough } from "./resume";
import { click, fill, reviewAndPrice, screen, text, until } from "./screen-actions";

export const stages = [
  ["Record a quote", "Talk through a made-up job using on-device voice. Type it in, or press Show me to see a sample. No real names or addresses. Show me uses labelled sample text; it does not record your microphone."],
  ["Check the quote lines", "Check the source excerpts and fix a line. Accept the lines, answer the questions, confirm scope and save a priced draft. Show me changes one description before saving."],
  ["Send the quote", "Continue on your own saved job. Save customer and site in the highlighted form first. After saving, go to Preview immutable quote, then Simulate sending this quote and Continue fake worker. Customer invitation is still to build. Delivery is simulated; nothing is sent."],
  ["Customer says yes", "The existing control records builder-attested practice acceptance, not an authenticated customer response. Record it and start the practice job."],
  ["Add on-site evidence", "Attach the generated fictional photo, check file integrity and complete the stage. The customer asks for one more thing. You do it, but forget to add it to the bill. Save the fictional loft-hatch diary note as evidence, not a priced extra. Never upload a real site photo in this exercise."],
  ["Price extra work", "Add a £125 fictional extra and approve its exact revision. Here, the builder records approval of the exact practice revision; this practice job cannot receive approval from the customer."],
  ["Lock and run Final Check", "Build the final bill, mark the baseline work done, accept the terms and lock. JobGuard checks your records against the bill. Run Final Check and load its saved result; it may take a few minutes. Inspect the fitted loft hatch and the answers before continuing."],
  ["Invoice and simulated payment", "Answer Yes — this was extra work and price the draft catch at £300. It stays a proposal awaiting customer approval, outside the locked bill; no supplementary invoice is issued here. Issue the invoice from the checked bill. Record its full amount as a fictional practice receipt. A recorded receipt is not bank-confirmed payment and cannot earn a recovery fee."],
  ["Read the end report", "Open the report in pounds and follow its saved source links. These are your practice job's recorded figures. The report does not guess money protected."],
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
    if (priced) {
      initialStep = 2;
      if (["accepted", "live", "invoiced", "paid"].includes(capture.status)) {
        const resumed = await resumeWalkthrough(new URLSearchParams({ walkJob: saved.jobId, ...(saved.prepared ? { walkExample: saved.prepared } : {}) }));
        return { capture, priced, prepared: resumed.prepared, initialStep: resumed.index };
      }
    }
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

export const partiesSaved = () => !!text("party-binding-id").trim() && !!text("party-customer").trim();
export const partiesTarget = () => !partiesSaved()
  ? screen()?.querySelector<HTMLElement>('form[aria-label="Customer and site details"] button[type="submit"]') ?? null
  : [...(screen()?.querySelectorAll<HTMLButtonElement>(".quote-editor button") ?? [])].find(button => button.textContent === "Preview immutable quote") ?? null;

export const missedWorkDiary = "Fictional practice diary: fitted loft hatch. Estimated extra: £300 net.";
export const missedWorkSaved = () => [...(screen()?.querySelectorAll('[data-testid="diary-entry"]') ?? [])].some(entry => entry.textContent?.includes(missedWorkDiary));
export async function saveMissedWork(signal: AbortSignal) {
  await until(() => screen()?.querySelector('[data-testid="job-diary"]')?.getAttribute("aria-busy") === "false", signal);
  if (missedWorkSaved()) return;
  await fill("#diary-text", missedWorkDiary);
  await click("Save note", signal);
  await until(missedWorkSaved, signal);
}

export async function priceFoundExtra(_: HTMLElement, signal: AbortSignal) {
  // Confirm via Final Check, then reload the product's saved variation list.
  const finding = screen()?.querySelector('[data-testid="final-check-item"]');
  if (!finding?.textContent?.includes("fitted loft hatch")) throw new Error("Inspect the saved loft-hatch finding before continuing.");
  if (!finding.querySelector('[data-testid="final-check-disposition"]')) {
    await click("Yes — this was extra work", signal);
    await until(() => !!screen()?.querySelector('[data-testid="final-check-disposition"]'), signal);
  }
  document.getElementById("walk-refresh")?.click();
  let row: HTMLElement | undefined;
  await until(() => {
    row = [...screen().querySelectorAll<HTMLElement>(".variation-list article")].find(item => item.textContent?.includes("fitted loft hatch"));
    return !!row;
  }, signal);
  async function press(name: string) {
    let button: HTMLButtonElement | undefined;
    await until(() => {
      button = [...row!.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === name && !item.disabled);
      return !!button;
    }, signal);
    row!.scrollIntoView({ block: "center", behavior: "instant" });
    signal.throwIfAborted(); button!.click();
  }
  const latest = row!.querySelectorAll(".variation-revision");
  if (latest[latest.length - 1]?.querySelector("strong")?.textContent?.endsWith("· £300.00")) return;
  await press("Change price");
  await until(() => !!screen().querySelector('[aria-label="New price fitted loft hatch"]'), signal);
  await fill('[aria-label="New price fitted loft hatch"]', "300.00");
  await press("Save new proposed revision");
  await until(() => !screen().querySelector('[aria-label="New price fitted loft hatch"]'), signal);
}

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

export function stageWords(index: number, prepared: string) {
  const words = stages[index]![1];
  if (!prepared || ![2, 3, 6, 8].includes(index)) return words;
  return `This part uses a prepared example job. ${index === 8 ? "These are the prepared job's figures. " : ""}${words.replace("Continue on your own saved job. ", "").replace("These are your practice job's recorded figures. ", "")}`;
}

/** A failed own-job control ends that attempt and offers a separate explicit choice. */
export async function ownJobAction(action: (signal: AbortSignal) => Promise<void>, signal: AbortSignal, fallback: () => Promise<void>, timeoutMs: number) {
  const controller = new AbortController();
  const bounded = AbortSignal.any([signal, controller.signal]);
  if (viewerPlayback.has(signal)) viewerPlayback.add(bounded);
  const timer = setTimeout(() => controller.abort(new Error("The own-job control stayed unavailable.")), timeoutMs);
  try { await action(bounded); }
  catch (reason) {
    if (signal.aborted) throw reason;
    await fallback();
    throw reason;
  } finally { clearTimeout(timer); }
}

export function VoiceJourney() {
  const [tenantId, setTenantId] = useState(""), [capture, setCapture] = useState<ReviewCaptureResult | null>(null);
  const [screenVersion, setScreenVersion] = useState(0);
  const [resumeIndex, setResumeIndex] = useState(0);
  const [ownWorkspace, setOwnWorkspace] = useState(false), [fallbackNeeded, setFallbackNeeded] = useState(false);
  const [prepared, setPrepared] = useState(""), [report, setReport] = useState(false), [tour, setTour] = useState(true);
  const [error, setError] = useState(""), [preparing, setPreparing] = useState(false);
  const [ownChosen, setOwnChosen] = useState(true), [tourVersion, setTourVersion] = useState("");
  const current = useRef({ capture, prepared, report, tenantId, ownChosen }); current.current = { capture, prepared, report, tenantId, ownChosen };
  const ownPriced = useRef(false), preparingRef = useRef(false);
  useEffect(() => {
    // WALK-2 owns creation and privacy. Reading this route alone never creates example jobs.
    void (async () => {
      const started = await fetch("/api/practice-company", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: "blank-practice-company.v1", action: "start" }) });
      if (!started.ok) throw new Error("The empty practice firm could not load. Return to the practice company and try again.");
      const response = await fetch("/api/session", { cache: "no-store" });
      if (!response.ok) throw new Error("The practice session could not load.");
      const session = sessionResponseV1.parse(await response.json());
      const params = new URLSearchParams(location.search);
      const saved = await resumeWalkthrough(params);
      const chosen = !saved.prepared && (params.get("walkOwn") === "1" || saved.capture?.source.kind !== "browser_local_transcript");
      if (chosen) {
        const url = new URL(location.href); url.searchParams.set("walkOwn", "1");
        history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      }
      setOwnChosen(chosen);
      setCapture(saved.capture); setPrepared(saved.prepared);
      setResumeIndex(saved.index);
      ownPriced.current = saved.index >= 2;
      setOwnWorkspace(saved.index >= 2);
      if (saved.index >= 2) {
        const url = new URL(location.href);
        url.hash = saved.index >= 6 ? "final-account-title" : saved.index >= 4 ? "work-proof" : "";
        history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      }
      setTenantId(session.tenants[0]!.id);
    })().catch(reason => setError((reason as Error).message));
  }, []);
  function remember(priced = ownPriced.current) {
    const { capture, prepared } = current.current;
    if (!capture) return;
    try { sessionStorage.setItem(progressKey(current.current.tenantId), JSON.stringify({ jobId: capture.jobId, prepared, priced })); } catch { /* The journey also works without storage. */ }
  }
  useEffect(() => { if (tenantId) remember(); }, [tenantId, capture, prepared]);
  async function prepare(restartTour = true) {
    if (preparingRef.current || current.current.prepared) return;
    preparingRef.current = true; setPreparing(true); setError("");
    try {
      // Keep the same capture request on retry, including after an unknown outcome.
      const key = `walk-3.prepared:${current.current.tenantId}:${current.current.capture?.jobId}`;
      let id = sessionStorage.getItem(key);
      if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(key, id); }
      const jobId = await recoverCapture(id, core1000Source);
      // A different job must not inherit the own job's open quote view.
      const url = new URL(location.href);
      history.replaceState(null, "", `${url.pathname}${url.search}`);
      rememberWalkJob("walkExample", jobId);
      current.current.prepared = jobId;
      setResumeIndex(2); setPrepared(jobId); setReport(false);
      if (restartTour) setTourVersion(jobId);
    } catch (reason) { setError((reason as Error).message); }
    finally { preparingRef.current = false; setPreparing(false); }
  }
  const steps = useMemo<WalkthroughStep[]>(() => {
    const done = [
      () => !!current.current.capture,
      () => {
        if (!ownPriced.current && !current.current.prepared && Number(text("quote-revision")) > 0) {
          ownPriced.current = true; remember(true); setOwnWorkspace(true);
          // The tour owns spotlight scrolling; open pricing without a fragment scroll.
          history.replaceState(null, "", `${location.pathname}${location.search}`);
        }
        return ownPriced.current;
      },
      () => text("quote-delivery") === "Simulated delivery — nothing sent",
      () => !!screen()?.querySelector('[data-testid="activation-policy"]'),
      () => evidenceDone() && missedWorkSaved(),
      approvedExtraDone,
      finalCheckDone,
      () => !!text("invoice-gross") && text("invoice-balance") === "GBP 0.00",
      () => current.current.report && !!text("value-invoiced-gross") && text("value-invoiced-gross") !== "No recorded outcome yet",
    ];
    const actions: WalkthroughStep["autoAction"][] = [
      async (_, signal, present) => {
        await fill("#walk-source", core1000Source);
        await present?.("Read the sample work", core1000Source);
        signal.throwIfAborted();
        await click("Make my draft", signal);
        await until(() => !!current.current.capture, signal);
        await present?.("Read your saved draft", "Check the saved work items and their source excerpts before continuing.");
      },
      async (_, signal) => {
        const input = screen().querySelector<HTMLInputElement>('.review-line input[aria-label^="Description "]');
        if (!input) {
          if (screen().querySelector(".confirmed-scope")) await click("Price the work", signal);
          await until(() => screen().querySelector(".quote-editor")?.getAttribute("data-quote-ready") === "true", signal);
          await click("Save draft revision", signal);
          await until(() => Number(text("quote-revision")) > 0, signal);
          return;
        }
        await fill(`[aria-label=${JSON.stringify(input.getAttribute("aria-label"))}]`, `${input.value} carefully`);
        await reviewAndPrice(signal);
      },
      async (_, signal) => {
        if (!current.current.prepared && !ownPriced.current) throw new Error("The own job has no saved priced revision.");
        // Both paths use the existing real job screens, never inserted end-state facts.
        if (screen().querySelector(".review-line")) await reviewAndPrice(signal);
        else {
          await until(() => !!screen().querySelector(".review-line, .quote-editor, .confirmed-scope"), signal);
          if (screen().querySelector(".review-line")) await reviewAndPrice(signal);
          else if (!screen().querySelector(".quote-editor")) await click("Price the work", signal);
        }
        // An open editor can still be loading or have no saved revision.
        await until(() => screen().querySelector(".quote-editor")?.getAttribute("data-quote-ready") === "true", signal);
        if (!(Number(text("quote-revision")) > 0)) {
          await click("Save draft revision", signal);
          await until(() => Number(text("quote-revision")) > 0, signal);
        }
        if (!partiesSaved()) await click("Save customer and site", signal);
        await until(partiesSaved, signal);
        await click("Preview immutable quote", signal);
        await click("Simulate sending this quote", signal);
        await click("Continue fake worker", signal);
      },
      async (_, signal) => {
        if (!screen().querySelector('[data-testid="activation-policy"]')) {
          // The real acceptance control disappears once acceptance is saved.
          const accept = [...screen().querySelectorAll("button")].some(button => button.textContent === "Record practice acceptance");
          if (accept) await click("Record practice acceptance", signal);
          await click("Start this practice job", signal);
          // The control returns before its request. Remount only after the saved
          // activation is rendered, so the workspace reload sees a started job.
          await until(() => !!screen()?.querySelector('[data-testid="activation-policy"]'), signal);
        }
        // The prepared example starts without a fragment. Select work before
        // remounting so the live proof controls are rendered instead of scope.
        history.replaceState(null, "", `${location.pathname}${location.search}#work-proof`);
        setScreenVersion(value => value + 1);
      },
      async (target, signal) => { await addOnSiteEvidence(target, signal); await saveMissedWork(signal); },
      async (_, signal) => {
        if (!screen().querySelector(".variation-list article")) {
          await fill('.variation-entry input:not([aria-label])', "Extra preparation");
          await fill('[aria-label="Variation price (£, optional)"]', "125.00");
          await click("Add proposed variation", signal);
        }
        await click("Approve exact revision", signal);
      },
      async (_, signal) => {
        await until(() => [...screen().querySelectorAll("button")].some(button => ["Build final account", "Rebuild from approved sources"].includes(button.textContent ?? "")), signal);
        if (text("lock-state") !== "Final account completed") {
          if (text("work-state") !== "Finished on site") await click("Finished on site", signal);
          await until(() => text("work-state") === "Finished on site", signal);
          if (!text("final-gross")) await click("Build final account", signal);
          else await click("Rebuild from approved sources", signal);
        }
        await until(() => !!text("lock-state"), signal);
        if (text("lock-state") !== "Final account completed") {
          const selects = [...screen().querySelectorAll<HTMLSelectElement>('select[aria-label^="Disposition "]')];
          await until(() => screen().querySelectorAll('select[aria-label^="Disposition "]').length > 0, signal);
          for (const select of (selects.length ? selects : screen().querySelectorAll<HTMLSelectElement>('select[aria-label^="Disposition "]'))) {
            await fill(`[aria-label=${JSON.stringify(select.getAttribute("aria-label"))}]`, "done");
            await until(() => screen().querySelector('[data-testid="final-account-lock"]')?.getAttribute("aria-busy") === "false", signal);
          }
          const terms = [...screen().querySelectorAll<HTMLButtonElement>("button")].find(b => b.textContent === "Accept final check terms");
          if (terms && !terms.disabled) await click("Accept final check terms", signal);
          await click("Rebuild from approved sources", signal);
          await until(() => screen().querySelector('[data-testid="final-account-lock"]')?.getAttribute("aria-busy") === "false", signal);
          await click("Complete final account", signal);
        }
        // Reload the existing screen's read models after the immutable lock commits.
        await until(() => text("lock-state") === "Final account completed", signal);
        await click("Load the saved final check", signal);
        await until(() => screen().querySelector('[data-testid="final-check-reveal"]')?.getAttribute("aria-busy") === "false", signal);
        if (!done[6]!()) await click("Run the final check (practice)", signal);
        while (!done[6]!()) {
          await new Promise(resolve => setTimeout(resolve, 3000)); signal.throwIfAborted();
          await click("Load the saved final check", signal);
        }
        const result = screen().querySelector<HTMLElement>('[data-testid="final-check-item"]');
        if (!result?.textContent?.includes("fitted loft hatch")) throw new Error("The saved final check has no loft-hatch finding. Inspect it before continuing.");
        screen().querySelectorAll("[data-walk-action]").forEach(element => element.removeAttribute("data-walk-action"));
        result.setAttribute("data-walk-action", "true");
        result.scrollIntoView({ block: "center", behavior: "instant" });
      },
      async (target, signal) => {
        // Reload the saved catch with the final-account editor open.
        history.replaceState(null, "", `${location.pathname}${location.search}#final-account-title`);
        await priceFoundExtra(target, signal);
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
      async (_, signal) => {
        document.getElementById("walk-report")?.click();
        await until(() => !!screen()?.querySelector(".value-page h1"), signal);
        screen().querySelector<HTMLElement>(".value-page h1")?.scrollIntoView({ block: "start", behavior: "instant" });
      },
    ];
    // Proof renders after the step-4 remount's saved activation read. Wait for
    // its next control (or saved status), never the workspace's first control.
    return stages.map(([title], index) => ({ id: `walk-${index + 1}`, title, words: stageWords(index, prepared), target: index === 0 ? '#walk-screen #walk-source, #walk-screen .review-line' : index === 1 ? '#walk-screen .review-line input, #walk-screen .confirmed-scope button.primary, #walk-screen .quote-editor button.primary' : index === 2 ? '#walk-screen form[aria-label="Customer and site details"] button[type="submit"]' : index === 4 ? '#work-proof .proof-actions button:not(:disabled), #work-proof [data-testid="stage-status"]' : index === 6 || index === 7 ? "#final-check" : "#walk-screen",
      spotlightTarget: () => index === 2 ? partiesTarget() : (index === 8 ? screen()?.querySelector<HTMLElement>(".value-page h1") : screen()?.querySelector<HTMLElement>("[data-walk-action]")) ?? (index === 0 ? screen()?.querySelector<HTMLElement>("#walk-source, .review-line") ?? null : index === 1 ? screen()?.querySelector<HTMLElement>('.review-line input, .confirmed-scope button.primary') ?? [...(screen()?.querySelectorAll<HTMLButtonElement>(".quote-editor button") ?? [])].find(button => button.textContent === "Save draft revision") ?? null : index === 3 ? screen()?.querySelector<HTMLElement>('[aria-label="Live activation"] h2') ?? null : index === 5 ? screen()?.querySelector<HTMLElement>('[data-testid="approved-additions"]') ?? null : null), isDone: () => (index < 2 || !!current.current.prepared || current.current.ownChosen) && done[index]!(), autoAction: async (target, signal, present) => {
      // Keep the microphone walkthrough's existing prepared example separate
      // from the captured voice draft. Sample and typed tours keep their own job.
      if (index >= 2 && !current.current.prepared && !current.current.ownChosen) {
        await prepare(false);
        signal.throwIfAborted();
        if (!current.current.prepared) throw new Error("The prepared example could not load. Try again.");
        await until(() => screen()?.querySelector('[data-testid="workspace-job-id"]')?.getAttribute("data-job-id") === current.current.prepared, signal);
      }
      if (done[index]!()) return;
      const action = async (bounded: AbortSignal) => { await actions[index]!(target, bounded, present); if (index !== 8) await until(done[index]!, bounded); };
      if (index < 2 || current.current.prepared) return action(signal);
      await ownJobAction(action, signal, async () => { setFallbackNeeded(true); setError("Your own job could not continue. Check the screen, or explicitly choose Use the prepared example job. Nothing has been marked complete."); }, index === 6 ? 237_000 : 27_000);
    }, timeoutMs: index === 6 ? 240_000 : 30_000 }));
  }, [prepared]);
  const activeJob = prepared || (ownWorkspace ? capture?.jobId : "");
  return <>
    <header className="workspace-page"><a href="/practice-company">Back to your practice firm and reset</a><h1>Walk your first practice job</h1>
      <p>Made-up data only. Do not enter real customer names or addresses. Nothing is sent or charged.</p>
      <p>Show me and Play the whole thing use sample text instead of recording audio. Voice, when available, stays on your device.</p>
      {!tour && <button onClick={() => setTour(true)}>Open guided walkthrough</button>}
      {capture && <p>Your own draft: <a href={`/jobs/${capture.jobId}`}>Open your saved job</a>.</p>}
      {capture && !prepared && (ownWorkspace || fallbackNeeded) && <section><h2>Continue with the prepared example</h2><p>{fallbackNeeded ? "A control on your own job could not continue. " : ownChosen ? "The tour continues on your own saved job. " : "The microphone tour continues with a separate prepared example; your voice draft stays saved. "}The example uses simulated sending and builder-recorded practice acceptance.</p><button id="walk-prepare" disabled={preparing} onClick={() => void prepare()}>Use the prepared example job</button><button disabled={preparing} aria-pressed={ownChosen} onClick={() => {
        const url = new URL(location.href); url.searchParams.set("walkOwn", "1");
        history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        current.current.ownChosen = true; setOwnChosen(true);
      }}>Continue on my own saved job</button></section>}
      {activeJob && <aside aria-label="Simulated customer"><h2>{prepared ? "Prepared example · simulated customer" : "Your own job · simulated customer"}</h2><p>{prepared ? "This part uses a prepared example job. " : ""} No invitation is sent. The customer view is not connected here; acceptance and extra approval use explicit builder practice attestations.</p><p>Use the quote preview below to inspect the exact fictional document.</p><button id="walk-refresh" onClick={() => setScreenVersion(value => value + 1)}>{prepared ? "Refresh the prepared job" : "Refresh the saved job"}</button><button id="walk-report" onClick={() => setReport(true)}>Open the saved end report</button>{report && <button onClick={() => setReport(false)}>{prepared ? "Return to the prepared job" : "Return to the saved job"}</button>}</aside>}
      {error && <p role="alert">{error}</p>}
    </header>
    <div id="walk-screen" className={styles.screen} tabIndex={-1}>
      {!tenantId ? <p role="status">Loading your private practice firm…</p> : activeJob ? report ? <ValuePage jobId={activeJob} /> : <WorkspaceShell key={`${activeJob}:${screenVersion}`} jobId={activeJob} initialPricing /> : capture ? <ReviewProposal result={capture} back={() => location.assign("/practice-company")} /> : <WalkIt tenantId={tenantId} initialText="" close={() => location.assign("/practice-company")} onCaptured={result => { rememberWalkJob("walkJob", result.jobId);
        if (result.source.kind === "browser_local_transcript") {
          const url = new URL(location.href); url.searchParams.delete("walkOwn");
          history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
          current.current.ownChosen = false; setOwnChosen(false);
        }
        setCapture(result); }} />}
    </div>
    {tenantId && tour && <Walkthrough key={tourVersion || "own"} steps={steps} initialIndex={resumeIndex} onClose={() => setTour(false)} />}
  </>;
}
