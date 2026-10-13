import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { parseObservation, sha256 } from "@jobguard/core";
import { ShadowDetectionWorker } from "./shadow-detection.worker.js";

const { testTenantContext } = await import(new URL("../../../packages/db/test/tenant-context-test-utils.ts", import.meta.url).href);
const { ShadowDetectionRepository } = await import(new URL("../../../packages/db/src/shadow-detection-repository.ts", import.meta.url).href);
const { ShadowObservationReader, FixtureObservationSources } = await import(new URL("../../../packages/db/src/shadow-observation-reader.ts", import.meta.url).href);

it("completes a pending mandatory firing when final-account locking races detection", async () => {
  const tenantId = "10000000-0000-4000-8000-000000000001";
  const jobId = "10000000-0000-4000-8000-000000000002";
  const at = "2026-10-12T00:00:00Z";
  const observation = parseObservation({
    version: "observation.v1", tenantId, jobId, kind: "note_or_voice", text: "outside tap",
    citations: [{ start: 0, end: 11, quote: "outside tap" }],
    evidence: { id: jobId, objectVersionId: "synthetic-v1", sha256: sha256("outside tap"), serverReceivedAt: at },
    facts: { workReference: "outside-tap", scopeArea: "job", description: "outside tap", status: "completed",
      estimatedValuePence: null, safetyImplication: true, customerClearlyRequested: false,
      needsPriorWrittenAgreement: false, significantWork: null, activeDispute: false,
      silenceMateriallyWorsensDispute: false, disclosureDuty: false },
  });
  // A contract double models the current PostgreSQL locked-job refusal. This
  // executes the actual worker, reader and sink, but is not a PostgreSQL proof.
  let locked = false;
  let signal: { id: string; state: string; disclosed_before_lock: boolean } | undefined;
  const decisions: string[] = [], firings: string[] = [], disclosures: string[] = [];
  const barrier = () => {
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done; });
    return { promise, resolve };
  };
  const persisted = barrier(), resume = barrier();
  const runtimeQuery = vi.fn(async (sql: string) => {
    if (sql.includes("to_regclass")) return { rows: [{ available: true }], rowCount: 1 };
    if (sql.includes("FROM app.final_check_terms_acceptance")) return { rows: [{}], rowCount: 1 };
    if (sql.includes("FROM app.job j JOIN app.job_commercial_track")) return { rows: [{ id: jobId }], rowCount: 1 };
    if (sql.includes("FROM app.final_account_lock")) return { rows: locked ? [{}] : [], rowCount: locked ? 1 : 0 };
    if (sql.includes("FROM app.evidence_object e")) return { rows: [{
      id: observation.evidence.id, object_version_id: observation.evidence.objectVersionId,
      sha256: observation.evidence.sha256, received: at, evidence_type: "site_note", text: observation.text,
    }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  const runtime = { query: runtimeQuery, connect: async () => ({ query: runtimeQuery, release: vi.fn() }) } as unknown as Pool;
  const shadow = { connect: async () => {
    let inserted: typeof signal;
    return { release: vi.fn(), query: async (sql: string, values?: unknown[]) => {
      if (sql.includes("INSERT INTO app.shadow_commercial_signal")) {
        inserted = { id: String(values![2]), state: "candidate", disclosed_before_lock: false };
        return { rows: [{ id: inserted.id }], rowCount: 1 };
      }
      if (sql.includes("UPDATE app.shadow_commercial_signal SET state='held_for_final_check'")) {
        inserted!.state = "held_for_final_check";
      }
      if (sql === "COMMIT" && inserted) {
        signal = inserted;
        persisted.resolve();
        await resume.promise;
      }
      if (sql.includes("SELECT id FROM app.shadow_commercial_signal")) return { rows: signal ? [{ id: signal.id }] : [], rowCount: signal ? 1 : 0 };
      if (sql.includes("app.surface_shadow_signal_early(")) {
        // 0133_shadow_detection.sql refuses BEFORE inserting any alert effects.
        if (locked) throw Object.assign(new Error("early surface requires an unlocked job"), { code: "55000" });
        decisions.push(String(values![4])); firings.push(String(values![3])); disclosures.push(String(values![5]));
        signal!.state = "surfaced_early"; signal!.disclosed_before_lock = true;
      }
      return { rows: [], rowCount: 0 };
    } };
  } } as unknown as Pool;
  const reader = new ShadowObservationReader(runtime, new FixtureObservationSources([observation]));
  const sink = new ShadowDetectionRepository(shadow);
  const worker = new ShadowDetectionWorker({
    assertTermsRelation: () => reader.assertTermsRelation(),
    hasAcceptedTerms: context => reader.hasAcceptedTerms(context),
    read: (context, request) => reader.read(context, request),
    propose: async () => ({ proposals: [] }),
    persist: (context, request) => sink.persist(context, request),
  }, "synthetic_demo", () => at);
  const context = testTenantContext(tenantId), task = { version: "shadow-detection-task.v1", tenantId, jobId };
  const failures: string[] = [];
  const recordFailure = (error: Error) => { failures.push(error.message); };
  await worker.start();
  const running = worker.execute(context, task).catch(recordFailure);
  await persisted.promise;
  // Commit the builder's lock while detection is paused after its signal commit.
  locked = true;
  resume.resolve();
  await running;
  await worker.execute(context, task).catch(recordFailure);
  const failureDetail = `Initial attempt and retry: ${failures.join("; ")}`;
  expect.soft(decisions, failureDetail).toHaveLength(1);
  expect.soft(firings, failureDetail).toHaveLength(1);
  expect.soft(disclosures, failureDetail).toHaveLength(1);
  expect(signal, failureDetail).not.toMatchObject({ state: "held_for_final_check", disclosed_before_lock: false });
});
