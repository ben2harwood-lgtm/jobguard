"use client";
import { useEffect, useState } from "react";
import { z } from "zod";
import { adoptJobV3, jobImportResultV3, jobImportSourceV1, type AdoptJobV3, type JobImportResultV3 } from "@jobguard/core";

const capacityAdmission = z.object({ outcome: z.enum(["admitted", "grace_place", "track_review_due"]), sourceHash: z.string().regex(/^[a-f0-9]{64}$/u) }).strict();
type Preview = { snapshot: AdoptJobV3; previewHash: string };
const liveHold = "Company live imports reserve capacity through the ordinary start rule. Shared practice live imports are unavailable.";
export function JobImport({ sourceJobId, company = false }: { sourceJobId: string; company?: boolean }) {
  const url = (jobId: string, action: string) => company ? `/api/meter/jobs/${jobId}/import-v3/${action}`
    : `/api/jobs/${jobId}/parties/import-v3${action === "read" || action === "adopt" ? "" : `/${action}`}`;
  async function request(path: string, init?: RequestInit) {
    if (!company) return fetch(path, init);
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    if (!response.ok) throw new Error("Sign in to your company before importing.");
    const session = await response.json() as { csrfToken?: string; memberships?: { tenantId: string }[] };
    const tenant = session.memberships?.[0]?.tenantId;
    if (!session.csrfToken || !tenant) throw new Error("Sign in to your company before importing.");
    return fetch(path, { ...init, headers: { ...init?.headers, "x-csrf-token": session.csrfToken, "x-tenant-id": tenant } });
  }
  const [bindingId, setBindingId] = useState<string | null>(null);
  const [stage, setStage] = useState<"live" | "invoiced">(company ? "live" : "invoiced");
  const [preview, setPreview] = useState<Preview | null>(null), [attest, setAttest] = useState(false);
  const [result, setResult] = useState<JobImportResultV3 | null>(null), [error, setError] = useState("");
  const [admission, setAdmission] = useState<z.infer<typeof capacityAdmission> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false), [commandId, setCommandId] = useState("");
  useEffect(() => {
    let active = true;
    void Promise.all([
      request(url(sourceJobId, "source"), { cache: "no-store" }),
      request(url(sourceJobId, "read"), { cache: "no-store" }),
    ]).then(async ([response, imported]) => {
      if (!response.ok) throw new Error("Customer and site could not load.");
      const view = jobImportSourceV1.parse(await response.json());
      if (active) setBindingId(view.bindingId);
      if (imported.ok) {
        const stored = await imported.json();
        const saved = jobImportResultV3.parse(stored.result);
        if (active) { setResult(saved); setAdmission(stored.meter?.admission ? capacityAdmission.parse(stored.meter.admission) : null); }
      } else if (imported.status !== 404) throw new Error("Stored import could not load.");
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [sourceJobId, company]);
  async function post(action: "preview" | "adopt") {
    setBusy(true); setError("");
    try {
      const response = await request(url(sourceJobId, action), {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(action === "preview"
          ? { version: "job-import-preview.v3", expectedBindingId: bindingId, fixtureId: "fictional-extension-v3", lifecyclePoint: stage }
          : { version: "job-parties-import.v3", commandId, expectedBindingId: bindingId, fixtureId: "fictional-extension-v3", lifecyclePoint: stage, previewHash: preview?.previewHash, attest }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.code === "METER_PLACE_SOURCE_HANDOFF_HELD" ? `${liveHold} No job has been imported.` : data.code === "PLAN_LIMIT_REACHED" ? "Your Solo plan and grace place are full. Move to Builder before importing another site." : data.reason ?? data.code ?? "Import unavailable");
      if (action === "preview") { setPreview({ snapshot: adoptJobV3.parse(data.snapshot), previewHash: data.previewHash }); setCommandId(crypto.randomUUID()); }
      else {
        const saved = jobImportResultV3.parse(data);
        setResult(saved);
        const stored = await request(url(saved.jobId, "read"), { cache: "no-store" });
        if (!stored.ok) throw new Error("Import saved; its capacity notice could not load. Open the saved import to retry.");
        const view = await stored.json();
        setAdmission(view.meter?.admission ? capacityAdmission.parse(view.meter.admission) : null);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Import unavailable"); }
    finally { setBusy(false); }
  }
  async function assessCatch() {
    if (!result) return;
    setBusy(true); setError("");
    try {
      const response = await request(url(result.jobId, "catch"), {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: "import-catch-command.v1", commandId: crypto.randomUUID(), baselineId: result.baselineId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.reason ?? data.code ?? "Catch assessment unavailable");
    } catch (e) { setError(e instanceof Error ? e.message : "Catch assessment unavailable"); }
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
    {result && <section aria-label="Imported job"><h2>Imported {result.lifecyclePoint} job</h2><p>Builder-attested imported baseline — weaker lineage than a customer-accepted quote</p>
      <p>{result.lifecyclePoint === "invoiced" ? "Counted places: 0 — imported at the invoiced stage." : "Capacity reserved through MON-1. Billing follows the ordinary start rule; no free import period."}</p><p>Linked overlapping jobs: {result.linkedJobIds.length}</p>
      {admission?.outcome === "grace_place" && <p role="status">This import uses your free grace place. Further Solo places require a move to Builder.</p>}
      {admission?.outcome === "track_review_due" && <p role="status">Track review due (track_review_due). Your import is admitted; your approved monthly maximum is unchanged.</p>}
      {result.linkedJobIds.map(id => <a key={id} href={`/jobs/${id}`}>Linked overlapping job: {id}</a>)}
      <p>Baseline reference: {result.baselineId}</p><p>Historical uploads and final-account locking for this imported baseline are unavailable.</p>
      <p>Pre-adoption evidence: £0.00 recovery fee — evidence from before adoption is permanently excluded (pre_adoption_evidence). This import contains no historical evidence or catches.</p>
      <p>The imported catch cannot be assessed until SV-6 attribution is connected. No catch, allocation or fee has been created.</p>
      <button disabled={busy} onClick={() => void assessCatch()}>Check imported catch</button>
      <a href={company ? `/meter/jobs/${result.jobId}/imports` : `/jobs/${result.jobId}/imports`}>Open saved import</a></section>}
    {error && <p role="alert">{error}</p>}
  </main>;
}
