"use client";
import { useEffect, useState } from "react";
import { adoptJobV3, jobImportResultV3, jobPartiesWorkspaceV1, type AdoptJobV3, type JobImportResultV3 } from "@jobguard/core";

type Preview = { snapshot: AdoptJobV3; previewHash: string };
const liveHold = "Live imports are unavailable until the counting ledger can reserve the grace place safely. No job has been imported.";
export function JobImport({ sourceJobId }: { sourceJobId: string }) {
  const [bindingId, setBindingId] = useState<string | null>(null);
  const [stage, setStage] = useState<"live" | "invoiced">("invoiced");
  const [preview, setPreview] = useState<Preview | null>(null), [attest, setAttest] = useState(false);
  const [result, setResult] = useState<JobImportResultV3 | null>(null), [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false), [commandId, setCommandId] = useState("");
  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch(`/api/jobs/${sourceJobId}/parties`, { cache: "no-store" }),
      fetch(`/api/jobs/${sourceJobId}/parties/import-v3`, { cache: "no-store" }),
    ]).then(async ([response, imported]) => {
      if (!response.ok) throw new Error("Customer and site could not load.");
      const view = jobPartiesWorkspaceV1.parse(await response.json());
      if (active) setBindingId(view.current?.bindingId ?? null);
      if (imported.ok) {
        const stored = await imported.json();
        const saved = jobImportResultV3.parse(stored.result);
        if (active) setResult(saved);
      } else if (imported.status !== 404) throw new Error("Stored import could not load.");
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sourceJobId]);
  async function post(action: "preview" | "adopt") {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/jobs/${sourceJobId}/parties/import-v3${action === "preview" ? "/preview" : ""}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action === "preview"
          ? { version: "job-import-preview.v3", expectedBindingId: bindingId, fixtureId: "fictional-extension-v3", lifecyclePoint: stage }
          : { version: "job-parties-import.v3", commandId, expectedBindingId: bindingId, fixtureId: "fictional-extension-v3", lifecyclePoint: stage, previewHash: preview?.previewHash, attest }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.code === "METER_PLACE_SOURCE_HANDOFF_HELD" ? liveHold : data.code ?? "Import unavailable");
      if (action === "preview") { setPreview({ snapshot: adoptJobV3.parse(data.snapshot), previewHash: data.previewHash }); setCommandId(crypto.randomUUID()); }
      else setResult(jobImportResultV3.parse(data));
    } catch (e) { setError(e instanceof Error ? e.message : "Import unavailable"); }
    finally { setBusy(false); }
  }
  return <main className="workspace-page">
    <a href={`/jobs/${sourceJobId}`}>← Source job</a><h1>Import a fictional job under v3 terms</h1>
    <p>Practice sandbox — synthetic data; nothing is sent or charged</p>
    <p>Uses this job’s saved customer and site. The supplied £3,000 baseline is builder-attested, with weaker lineage than a customer-accepted quote.</p>
    {!bindingId && <p>Save the source job’s customer and site first.</p>}
    {!loading && !result && <><label>Import stage<select value={stage} disabled={busy} onChange={e => { setStage(e.target.value as typeof stage); setPreview(null); setAttest(false); }}>
      <option value="invoiced">Already invoiced</option><option value="live">Live work</option></select></label>
      <p>{stage === "invoiced" ? "An already invoiced import never counts as a job on the go." : liveHold}</p>
      <button disabled={loading || !bindingId || busy} onClick={() => void post("preview")}>Preview import</button>
      {preview && <section aria-label="Import preview"><h2>Review the import</h2>
        <p>{preview.snapshot.baseline.description} — £3,000.00</p><p>Terms: synthetic_demo_import.v3; reference_fee_policy_v3. No v1 cap or historic billing.</p>
        <label><input type="checkbox" checked={attest} disabled={busy} onChange={e => setAttest(e.target.checked)}/>{preview.snapshot.attestation.wording}</label>
        <button disabled={!attest || busy} onClick={() => void post("adopt")}>Confirm import</button></section>}</>}
    {result && <section aria-label="Imported job"><h2>Imported invoiced job</h2><p>Builder-attested imported baseline — weaker lineage than a customer-accepted quote</p>
      <p>Counted places: 0 — imported at the invoiced stage.</p><p>Linked overlapping jobs: {result.linkedJobIds.length}</p>
      <p>Baseline reference: {result.baselineId}</p><p>Historical uploads and final-account locking for this imported baseline are unavailable.</p>
      <p>Pre-adoption evidence: £0.00 recovery fee — evidence from before adoption is permanently excluded (pre_adoption_evidence). This import contains no historical evidence or catches.</p>
      <a href={`/jobs/${result.jobId}/imports`}>Open saved import</a></section>}
    {error && <p role="alert">{error}</p>}
  </main>;
}
