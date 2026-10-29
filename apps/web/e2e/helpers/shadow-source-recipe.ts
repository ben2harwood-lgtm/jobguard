import { createHash, randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { Pool } from "pg";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { E2E_RUNTIME_URL } from "../global-setup";
import { withSyntheticShadow } from "./final-account-lock-journey";

/** The pre-lock worker leg of the recipe. All originals were written through
 * product HTTP routes. Uses the real reader, detector and restricted sink;
 * never inserts signals, classifications, approvals or settlement fixtures. */
export async function holdShadowRecipeSources(tenantId: string, jobId: string) {
 if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new Error("SYNTHETIC_MODE_REQUIRED");
 // Playwright loads tests as CJS; use the existing global-setup ESM bridge.
 const nativeImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("@jobguard/db")>;
 const { decodePracticePhoto, generatePracticePng, ShadowDetectionRepository, ShadowObservationReader, verifiedTenantContextForQueuedJob } = await nativeImport(pathToFileURL(join(process.cwd(), "../../packages/db/dist/index.js")).href);
 const coreImport = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<typeof import("@jobguard/core")>;
 const { detectShadowObservations } = await coreImport(pathToFileURL(join(process.cwd(), "../../packages/core/dist/index.js")).href);
 const runtime = new Pool({ connectionString: E2E_RUNTIME_URL, max: 1 });
 const hash = (fixture: "completion-photo" | "j3-drainage-photo") => createHash("sha256").update(generatePracticePng(fixture)).digest("hex");
 try {
  await withSyntheticShadow(tenantId, async shadow => {
   const context = verifiedTenantContextForQueuedJob(tenantId);
   const reader = new ShadowObservationReader(runtime, { async decode(source) {
    return source.kind === "completion_photo" ? decodePracticePhoto(source.sha256, hash("completion-photo"), hash("j3-drainage-photo")) : null;
   } });
   expect(await reader.hasAcceptedTerms(context)).toBe(true);
   const { observations, captures } = await reader.read(context, { version: "shadow-observation-read.v1", jobId });
   expect(observations.map(o => o.facts.estimatedValuePence).sort()).toEqual([30000, 50000]);
   await expect(reader.read(verifiedTenantContextForQueuedJob(randomUUID()), { version: "shadow-observation-read.v1", jobId })).rejects.toThrow("OBSERVATION_JOB_UNAVAILABLE");
   await expect(reader.read(context, { version: "shadow-observation-read.v1", jobId: randomUUID() })).rejects.toThrow("OBSERVATION_JOB_UNAVAILABLE");
   const sink = new ShadowDetectionRepository(shadow);
   const batch = { version: "shadow-detection-batch.v1" as const, jobId, observations, captures,
    proposals: detectShadowObservations(observations, captures, new Date().toISOString()) };
   await expect(sink.persist(context, { ...batch, jobId: randomUUID() })).rejects.toThrow("DETECTION_BINDING_MISMATCH");
   await expect(sink.persist(verifiedTenantContextForQueuedJob(randomUUID()), batch)).rejects.toThrow("DETECTION_BINDING_MISMATCH");
   await sink.persist(context, batch);
   await sink.persist(context, batch); // Worker replay creates no second signal.
   const held = (await shadow.query("SELECT state,estimated_value_pence FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2 ORDER BY estimated_value_pence", [tenantId, jobId])).rows;
   expect(held).toEqual([{ state: "held_for_final_check", estimated_value_pence: "30000" }, { state: "held_for_final_check", estimated_value_pence: "50000" }]);
  });
 } finally { await runtime.end(); }
}
