import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CANCELLATION_KIT_LABEL, quoteDocumentV1, renderQuotePdf } from "@jobguard/core";
import { JobPartiesRepository } from "../src/job-parties-repository.js";
import { QuoteRepository } from "../src/quote-repository.js";
import { QuoteDeliveryRepository } from "../src/quote-delivery-repository.js";
import { QuoteDocumentRepository } from "../src/quote-document-repository.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { createWorkFixture, closeWorkFixture, seedWorkJob, type WorkFixture } from "./job-work-state-fixtures.js";

describe("MON-5B persisted synthetic quote cancellation kit", () => {
 let f: WorkFixture;
 beforeAll(async () => { f = await createWorkFixture(); }, 60000);
 afterAll(async () => { vi.unstubAllEnvs(); await closeWorkFixture(f); });
 it("MP-21 MP-22 both quote creation paths persist and reload the companion in the exact immutable PDF snapshot", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const a = await prepareQuote(f), draft = a.draft;
  const preview = await new QuoteDeliveryRepository(f.runtime).preview(a.context, a.jobId, "customer@example.invalid");
  expect(preview.document.quoteRevisionId).toBe(draft.id);
  expect(preview.document.cancellationKit?.label).toBe(CANCELLATION_KIT_LABEL);
  await expect(new QuoteDocumentRepository(f.runtime).create(a.context, { jobId: a.jobId, documentId: randomUUID(), quoteRevisionId: randomUUID(), objectVersionId: randomUUID(), document: preview.document })).rejects.toThrow("QUOTE_SNAPSHOT_MISMATCH");
  const second = await new QuoteDocumentRepository(f.runtime).create(a.context, { jobId: a.jobId, documentId: randomUUID(), quoteRevisionId: draft.id, objectVersionId: randomUUID(), document: { ...preview.document, cancellationKit: undefined, documentVersion: 2, reference: "Q-SECOND" } });
  const rows = await withTenant(f.runtime, a.context, async db => (await db.$client.query("SELECT id,snapshot,content_hash FROM app.quote_document_version WHERE job_id=$1 ORDER BY document_version", [a.jobId])).rows);
  expect(rows).toHaveLength(2);
  for (const row of rows) {
   const snapshot = quoteDocumentV1.parse(row.snapshot), pdf = renderQuotePdf(snapshot);
   expect(snapshot.cancellationKit?.label).toBe(CANCELLATION_KIT_LABEL);
   expect(createHash("sha256").update(pdf).digest("hex")).toBe(row.content_hash);
   expect(new TextDecoder().decode(pdf)).toContain("Practice cancellation request");
   const reload = await new QuoteDeliveryRepository(f.runtime).pdf(a.context, a.jobId, row.id);
   expect(reload.pdf).toEqual(pdf);
  }
  expect(rows[1]!.content_hash).toBe(second.content_hash);
  expect(await withTenant(f.runtime, testTenantContext(randomUUID()), async db => (await db.$client.query("SELECT id FROM app.quote_document_version WHERE job_id=$1", [a.jobId])).rows)).toEqual([]);
  const counts = await f.admin.query("SELECT (SELECT count(*)::int FROM app.action_outbox WHERE tenant_id=$1) sends,(SELECT count(*)::int FROM app.journal WHERE tenant_id=$1) journals", [a.tenantId]);
  expect(counts.rows).toEqual([{ sends: 0, journals: 0 }]);
 });
 it("excludes a business customer on both creation paths and keeps kit data out of audit", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const a = await prepareQuote(f);
  const parties = new JobPartiesRepository(f.runtime);
  const old = await parties.view(a.context, a.actorId, a.jobId);
  const customer = await parties.command(a.context, a.actorId, a.jobId, { version: "job-parties-command.v1", action: "create_customer", commandId: randomUUID(), customer: { version: "customer.v1", type: "business", name: "Fictional Business" } });
  await parties.command(a.context, a.actorId, a.jobId, { version: "job-parties-command.v1", action: "correct", commandId: randomUUID(), expectedJobRevision: old.jobRevision, reason: "Fictional business quote fixture", parties: { version: "job-parties.v1", customerRevisionId: customer.revisionId, siteRevisionId: old.current!.siteRevisionId, payingPartyRevisionId: null } });
  const preview = await new QuoteDeliveryRepository(f.runtime).preview(a.context, a.jobId, "customer@example.invalid");
  expect(preview.document.cancellationKit).toBeUndefined();
  const created = await new QuoteDocumentRepository(f.runtime).create(a.context, { jobId: a.jobId, documentId: randomUUID(), quoteRevisionId: a.draft.id, objectVersionId: randomUUID(), document: { ...preview.document, documentVersion: 2, reference: "Q-BUSINESS" } });
  expect(new TextDecoder().decode(created.pdf)).not.toContain("Practice cancellation request");
  const audit = (await f.admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1", [a.tenantId])).rows;
  const payload = JSON.stringify(audit);
  for (const privateValue of ["Fictional Business", "customer@example.invalid", "Practice cancellation request", CANCELLATION_KIT_LABEL]) expect(payload).not.toContain(privateValue);
 });
 it("replays old frozen documents without retrofitting a kit, then attaches it to a new version", async () => {
  vi.stubEnv("JOBGUARD_ENV", "pilot_no_charge");
  const a = await prepareQuote(f), delivery = new QuoteDeliveryRepository(f.runtime), documents = new QuoteDocumentRepository(f.runtime);
  const legacy = await delivery.preview(a.context, a.jobId, "customer@example.invalid");
  expect(legacy.document.cancellationKit).toBeUndefined();
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const replay = await delivery.preview(a.context, a.jobId, "customer@example.invalid");
  expect(replay).toEqual(legacy);
  const input = { jobId: a.jobId, documentId: randomUUID(), quoteRevisionId: a.draft.id, objectVersionId: randomUUID(), document: legacy.document };
  const persisted = await documents.create(a.context, input);
  expect(persisted).toEqual({ id: legacy.documentId, content_hash: legacy.hash, pdf: legacy.pdf });
  await expect(documents.create(a.context, { ...input, document: { ...legacy.document, reference: "CHANGED" } })).rejects.toThrow("QUOTE_DOCUMENT_VERSION_CONFLICT");
  const next = await documents.create(a.context, { ...input, document: { ...legacy.document, documentVersion: 2, reference: "Q-NEW" } });
  expect(new TextDecoder().decode(next.pdf)).toContain("Practice cancellation request");
  expect((await delivery.pdf(a.context, a.jobId, legacy.documentId)).pdf).toEqual(legacy.pdf);
 });

});

async function prepareQuote(f: WorkFixture) {
 const a = await seedWorkJob(f), scopeRevisionId = randomUUID();
 await withTenant(f.admin, a.context, async db => {
  await db.$client.query("UPDATE app.job SET status='quoting' WHERE id=$1", [a.jobId]);
  await db.$client.query("INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Fictional work','1','item',1000,1000)", [scopeRevisionId, a.tenantId, a.jobId, a.scopeId]);
 });
 const draft = await new QuoteRepository(f.runtime).saveDraft(a.context, { jobId: a.jobId, draftId: randomUUID(), expectedRevision: 0, currency: "GBP", taxPolicyVersion: "candidate_m1_standard_v1", effectiveAt: new Date(), lines: [{ id: randomUUID(), scopeItemId: a.scopeId, scopeRevisionId, description: "Fictional work", origin: "captured", included: true, exclusionReason: null, quantity: "1", unit: "item", unitRatePence: 1000, discountPercent: "0", taxTreatment: "standard_rate_20", rateProvenance: "entered", category: "Other", region: "London" }] });
 return { ...a, draft };
}
