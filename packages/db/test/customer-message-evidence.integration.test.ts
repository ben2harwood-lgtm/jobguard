import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { ShadowDetectionWorker } from "../../../apps/api/src/shadow-detection.worker.js";
import { ShadowDetectionRepository } from "../src/shadow-detection-repository.js";
import { ShadowObservationReader, FixtureObservationSources } from "../src/shadow-observation-reader.js";
import { withTenant } from "../src/tenant-context.js";
import { CUSTOMER_MESSAGE_SAFETY_TEXT, CUSTOMER_MESSAGE_SAFETY_FIXTURE } from "../src/customer-message-fixtures.js";
import { sourcesFixture, seedSource, closeWorkFixture, type SourceFixture } from "./job-sources-fixture.js";

describe("MON-5B stored synthetic customer-message worker slice; authenticated intake remains held", () => {
 let f: SourceFixture, shadow: Pool;
 beforeAll(async () => {
  f = await sourcesFixture();
  const login = `mon5b_${randomUUID().replaceAll("-", "")}`, credential = randomUUID();
  await f.admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${credential}'; GRANT jobguard_shadow TO ${login}`);
  shadow = new Pool({ ...f.admin.options, user: login, password: credential, max: 2 });
 }, 60000);
 afterAll(async () => { await shadow?.end(); await closeWorkFixture(f); });

 it("MP-15 MP-16 MP-17 MP-19 verified fixture messages reach the real worker once; mandatory safety disclosure is fee-ineligible and private", async () => {
  const { auth, jobId } = f.practice;
  const ordinary = await seedSource(f, "customer_message", "Please fit an outside tap.", "job-source:request-tap.v1");
  const before = await f.repository.read(auth.context, jobId, auth.digest, "customer_message");
  const reader = new ShadowObservationReader(f.runtime, new FixtureObservationSources([])), sink = new ShadowDetectionRepository(shadow);
  const worker = new ShadowDetectionWorker({ assertTermsRelation: () => reader.assertTermsRelation(), hasAcceptedTerms: context => reader.hasAcceptedTerms(context), read: (context, request) => reader.read(context, request), propose: async () => ({ proposals: [] }), persist: (context, request) => sink.persist(context, request) }, "synthetic_demo", () => "2026-10-13T12:00:00Z");
  await withTenant(f.runtime, auth.context, db => db.$client.query("SELECT app.accept_final_check_terms($1,$2,$3,$4)", [auth.context.tenantId, auth.membershipId, randomUUID(), "synthetic_final_check_terms.v1"]));
  const task = { version: "shadow-detection-task.v1", tenantId: auth.context.tenantId, jobId };
  await worker.start(); await worker.execute(auth.context, task);
  expect(await f.repository.read(auth.context, jobId, auth.digest, "customer_message")).toEqual(before);
  expect(before.messages).toContainEqual(expect.objectContaining({ id: ordinary.id, text: ordinary.text, evidence: { id: ordinary.evidenceId, objectVersionId: ordinary.version, sha256: ordinary.hash, serverReceivedAt: ordinary.at } }));
  const safety = await seedSource(f, "customer_message", CUSTOMER_MESSAGE_SAFETY_TEXT, CUSTOMER_MESSAGE_SAFETY_FIXTURE);
  await worker.execute(auth.context, task); await worker.execute(auth.context, task);
  const firings = (await f.admin.query("SELECT signal_id,decision_id,audit_event_id,rule,rule_version FROM app.shadow_must_surface_firing WHERE source_ref=$1", [safety.evidenceId])).rows;
  expect(firings).toHaveLength(1); const firing = firings[0]!;
  expect(firing).toMatchObject({ rule: "safety", rule_version: "shadow_attribution_policy_v3" });
  expect((await f.admin.query("SELECT state,disclosed_before_lock FROM app.shadow_commercial_signal WHERE id=$1", [firing.signal_id])).rows).toEqual([{ state: "surfaced_early", disclosed_before_lock: true }]);
  expect((await f.admin.query("SELECT reason FROM app.shadow_signal_ineligibility WHERE signal_id=$1 ORDER BY reason", [firing.signal_id])).rows).toEqual([{ reason: "disclosed_before_lock" }, { reason: "surfaced_early" }]);
  expect((await f.admin.query("SELECT classification FROM app.job_finding WHERE decision_id=$1", [firing.decision_id])).rows).toEqual([{ classification: "mandatory" }]);
  const audit = JSON.stringify((await f.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1", [auth.context.tenantId])).rows);
  expect(audit).not.toContain(CUSTOMER_MESSAGE_SAFETY_TEXT); expect(audit).not.toContain("Fictional Alex");
  const fresh = await new (await import("../src/job-source-repository.js")).JobSourceRepository(f.runtime).read(auth.context, jobId, auth.digest, "customer_message");
  expect(fresh.messages.find(message => message.id === safety.id)?.evidence.serverReceivedAt).toBe(safety.at);
 });
});
