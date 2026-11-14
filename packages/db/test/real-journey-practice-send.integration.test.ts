import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { CaptureApplication } from "../../../apps/api/src/capture/capture.application.js";
import { PracticeAccess } from "../../../apps/api/src/practice-access.js";
import { QuoteApplication } from "../../../apps/api/src/quote/quote.application.js";
import { cluster, seedHomeOwner, type Cluster } from "./contractor-practice-session-fixtures.js";
import { authenticatePracticeSession, issuePracticeSession } from "../src/practice-session.js";
import { startBlankPracticeCompany } from "../src/blank-practice-company.js";
import { JobPartiesRepository } from "../src/job-parties-repository.js";
import { QuoteDeliveryRepository } from "../src/quote-delivery-repository.js";
import { ActionExecutor } from "../src/outbox.js";

let c: Cluster;
const start = { version: "blank-practice-company.v1", action: "start" };
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); await seedHomeOwner(c); }, 240_000);
afterEach(() => vi.restoreAllMocks());
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

// Capture, review, pricing, exact issue and execution all use their real boundaries.
// No delivered, accepted or live facts are seeded.
async function quote(blank = true) {
  const token = blank ? await startBlankPracticeCompany(c.runtime, start) : await issuePracticeSession(c.runtime);
  const auth = await authenticatePracticeSession(c.runtime, token);
  const capture = new CaptureApplication(c.runtime, token);
  const own = await capture.capture({ contractVersion: "job_capture_v1", requested_tenant_id: auth.context.tenantId,
    captureId: randomUUID(), source: { kind: "text", text: "JOB: Fictional blue room\nITEM: Paint walls | £200.00" }, fixtureId: "deterministic-local-v1" });
  const jobId = own.jobId;
  const reviewed = await capture.save(jobId, { contractVersion: "proposal_review_command_v1", expectedRevision: 0, review: {
    version: "proposal_review_v1", reviewId: own.reviewId, proposalId: own.proposalId, jobId, revision: 0,
    lines: own.proposal.lines.map(line => ({ id: line.id, scopeItemId: line.scopeItemId, origin: "proposal", description: line.description.value,
      room: line.room, category: line.category, quantity: line.quantity.value ?? "1", unit: line.unit.value ?? "item", unitPricePence: line.unitPricePence.value,
      disposition: "accepted", dismissalReason: null, parentScopeItemIds: [], sourceExcerpt: line.sourceExcerpt })),
    questions: own.proposal.questions.map(q => ({ id: randomUUID(), question: q.question.value, blocking: true, disposition: "answered", answer: "Fictional builder removes waste" })),
  } });
  await capture.confirm(jobId, { contractVersion: "proposal_review_confirm_v1", commandId: randomUUID(), expectedRevision: reviewed.review!.revision });
  const parties = new JobPartiesRepository(c.runtime);
  const command = (data: object) => parties.command(auth.context, auth.membershipId, jobId,
    { version: "job-parties-command.v1", commandId: randomUUID(), ...data }, auth.digest);
  const customer = await command({ action: "create_customer", customer: { version: "customer.v1", name: "Fictional Customer", type: "person" } });
  const site = await command({ action: "create_site", site: { version: "site.v1", addressLines: ["1 Fictional Road"], town: "London", postcode: "SW1A 1AA" } });
  const view = await parties.view(auth.context, auth.membershipId, jobId, auth.digest);
  await command({ action: "bind", expectedJobRevision: view.jobRevision, parties: { version: "job-parties.v1", customerRevisionId: customer.revisionId, siteRevisionId: site.revisionId } });
  const app = new QuoteApplication(c.runtime, token), workspace = await app.get(jobId);
  await app.save(jobId, { contractVersion: "quote_draft_command_v1", draftId: randomUUID(), expectedRevision: 0, currency: "GBP", taxPolicyVersion: "candidate_m1_standard_v1", blockingQuestions: [],
    lines: workspace.scope.map(line => ({ ...line, id: randomUUID(), origin: "captured", included: true, exclusionReason: null, quantity: line.quantity ?? "1", unit: line.unit ?? "item", unitRatePence: line.unitRatePence ?? 20000,
      discountPercent: "0", taxTreatment: "standard_rate_20", rateProvenance: "entered", category: null, region: null })) });
  const preview = await app.preview(jobId, { version: "quote-preview-command.v1", recipient: "customer@fictional.invalid" });
  const input = { version: "quote-send-command.v1", commandId: randomUUID(), documentId: preview.view!.documentId, contentHash: preview.view!.contentHash, recipient: preview.view!.recipient };
  return { app, auth, token, jobId, input };
}
type Fixture = Awaited<ReturnType<typeof quote>>;
async function effects(f: Fixture) {
  return (await c.admin.query(`SELECT o.status,(SELECT count(*)::int FROM app.action_attempt a WHERE a.action_id=o.id) attempts,
    (SELECT count(*)::int FROM app.quote_send s WHERE s.document_id=$1) sends,
    (SELECT count(*)::int FROM app.audit_event e WHERE e.subject_ref=o.id::text AND e.event_type='outbox.succeeded') deliveries
    FROM app.action_outbox o JOIN app.quote_send s ON s.outbox_action_id=o.id WHERE s.document_id=$1`, [f.input.documentId])).rows;
}
it("blank-firm practice send executes once after issue", async () => {
  const f = await quote();
  const [first, concurrent] = await Promise.all([f.app.issue(f.jobId, f.input), f.app.issue(f.jobId, f.input)]);
  expect(first).toMatchObject({ documentId: f.input.documentId, contentHash: f.input.contentHash, recipient: f.input.recipient, status: "simulated_delivery", attempts: 1, receiptCount: 1 });
  expect(concurrent).toEqual(first);
  expect(await f.app.issue(f.jobId, f.input)).toEqual(first);
  expect(await f.app.issue(f.jobId, { ...f.input, commandId: randomUUID() })).toEqual(first);
  expect(await f.app.execute(f.jobId, { version: "quote-execute-command.v1", documentId: f.input.documentId, mode: "success" })).toEqual(first);
  expect(await f.app.deliveryView(f.jobId)).toEqual(first); // Lost response recovery.
  expect(await effects(f)).toEqual([{ status: "succeeded", attempts: 1, sends: 1, deliveries: 1 }]);
  expect((await f.app.acceptanceView(f.jobId)).activeAcceptance).toBeNull();
  expect((await f.app.activationView(f.jobId)).activation).toBeNull();
});
it("nonblank sessions queue until explicit manual success or timeout and reconciliation", async () => {
  const manual = await quote(false);
  expect(await manual.app.issue(manual.jobId, manual.input)).toMatchObject({ status: "queued", attempts: 0 });
  expect(await manual.app.execute(manual.jobId, { version: "quote-execute-command.v1", documentId: manual.input.documentId, mode: "success" }))
    .toMatchObject({ status: "simulated_delivery", attempts: 1 });
  const f = await quote(false);
  expect(await f.app.issue(f.jobId, f.input)).toMatchObject({ status: "queued", attempts: 0 });
  expect(await f.app.execute(f.jobId, { version: "quote-execute-command.v1", documentId: f.input.documentId, mode: "timeout" })).toMatchObject({ status: "outcome_unknown", attempts: 1 });
  expect(await f.app.issue(f.jobId, f.input)).toMatchObject({ status: "outcome_unknown", attempts: 1 });
  expect(await f.app.execute(f.jobId, { version: "quote-execute-command.v1", documentId: f.input.documentId, mode: "reconcile" })).toMatchObject({ status: "simulated_delivery", attempts: 1 });
});
it("refuses changed hash, document, recipient and payload without a send effect", async () => {
  const f = await quote();
  for (const patch of [{ contentHash: "0".repeat(64) }, { documentId: randomUUID() }, { recipient: "other@fictional.invalid" }, { blank: true }])
    await expect(f.app.issue(f.jobId, { ...f.input, ...patch })).rejects.toBeDefined();
  expect(await effects(f)).toEqual([]);
  await f.app.issue(f.jobId, f.input);
  const before = await effects(f);
  for (const commandId of [f.input.commandId, randomUUID()]) {
    for (const patch of [{ recipient: "other@fictional.invalid" }, { contentHash: "0".repeat(64) }])
      await expect(f.app.issue(f.jobId, { ...f.input, commandId, ...patch })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    expect(await effects(f)).toEqual(before);
  }
  expect(await f.app.issue(f.jobId, f.input)).toMatchObject({ status: "simulated_delivery", attempts: 1, receiptCount: 1 });
  expect(await effects(f)).toEqual(before);
});
it("refuses another blank firm's job, revoked and reset credentials", async () => {
  const f = await quote(), other = await startBlankPracticeCompany(c.runtime, start);
  await expect(new QuoteApplication(c.runtime, other).issue(f.jobId, f.input)).rejects.toThrow("NOT_FOUND");
  await startBlankPracticeCompany(c.runtime, { ...start, action: "reset" }, f.token);
  await expect(f.app.issue(f.jobId, f.input)).rejects.toThrow("UNAUTHENTICATED");
  expect(await effects(f)).toEqual([]);
  const revoked = await quote();
  await c.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [revoked.auth.digest]);
  await expect(revoked.app.issue(revoked.jobId, revoked.input)).rejects.toThrow("UNAUTHENTICATED");
  expect(await effects(revoked)).toEqual([]);
});
it("rechecks access after committed issue and refuses reset before any attempt", async () => {
  const f = await quote(), real = PracticeAccess.prototype.job;
  let checks = 0;
  vi.spyOn(PracticeAccess.prototype, "job").mockImplementation(async function (this: PracticeAccess, id) {
    checks++;
    if (checks === 2) await startBlankPracticeCompany(c.runtime, { ...start, action: "reset" }, f.token);
    return real.call(this, id);
  });
  await expect(f.app.issue(f.jobId, f.input)).rejects.toThrow("UNAUTHENTICATED");
  expect(await effects(f)).toEqual([{ status: "pending", attempts: 0, sends: 1, deliveries: 0 }]);
  await expect(new QuoteDeliveryRepository(c.runtime).execute(f.auth.context, f.jobId, f.input.documentId, "success")).rejects.toThrow();
});
it("retains executor expiry checks after issue commits", async () => {
  const f = await quote(), real = QuoteDeliveryRepository.prototype.issue;
  vi.spyOn(QuoteDeliveryRepository.prototype, "issue").mockImplementationOnce(async function (this: QuoteDeliveryRepository, ...args) {
    const saved = await real.apply(this, args);
    // Refusal-only fault: expire the saved outbox grant; never manufacture delivery.
    await c.admin.query("UPDATE app.action_outbox SET authorization_expires_at=clock_timestamp()-interval '1 second' WHERE id=(SELECT outbox_action_id FROM app.quote_send WHERE document_id=$1)", [f.input.documentId]);
    return saved;
  });
  expect(await f.app.issue(f.jobId, f.input)).toMatchObject({ status: "cancelled", attempts: 0, receiptCount: 0 });
  expect((await effects(f))[0]).toMatchObject({ deliveries: 0 });
});
it("executor failure stays unresolved and replay recovers the issued record", async () => {
  const f = await quote();
  const failure = vi.spyOn(ActionExecutor.prototype, "execute").mockRejectedValueOnce(new Error("INJECTED_EXECUTOR_FAILURE"));
  await expect(f.app.issue(f.jobId, f.input)).rejects.toThrow("INJECTED_EXECUTOR_FAILURE");
  failure.mockRestore();
  expect(await f.app.deliveryView(f.jobId)).toMatchObject({ status: "queued", attempts: 0 });
  expect(await f.app.issue(f.jobId, f.input)).toMatchObject({ status: "simulated_delivery", attempts: 1 });
  expect((await effects(f))[0]).toMatchObject({ sends: 1, deliveries: 1 });
});
it("an unknown blank-firm execution never triggers automatic reconciliation or another attempt", async () => {
  const f = await quote(), real = QuoteDeliveryRepository.prototype.execute;
  vi.spyOn(QuoteDeliveryRepository.prototype, "execute").mockImplementationOnce(function (this: QuoteDeliveryRepository, context, job, document) {
    return real.call(this, context, job, document, "timeout"); // Real executor's refusal-only timeout mode.
  });
  expect(await f.app.issue(f.jobId, f.input)).toMatchObject({ status: "outcome_unknown", attempts: 1 });
  expect(await f.app.issue(f.jobId, f.input)).toMatchObject({ status: "outcome_unknown", attempts: 1 });
  expect(await f.app.deliveryView(f.jobId)).toMatchObject({ status: "outcome_unknown", attempts: 1 });
  expect((await effects(f))[0]).toMatchObject({ status: "outcome_unknown", sends: 1, deliveries: 0 });
});

it.each(["recipient", "content_hash", "revoked_at"])("executor refuses changed %s after issue commits", async field => {
  const f = await quote(), real = QuoteDeliveryRepository.prototype.issue;
  vi.spyOn(QuoteDeliveryRepository.prototype, "issue").mockImplementationOnce(async function (this: QuoteDeliveryRepository, ...args) {
    const saved = await real.apply(this, args);
    if (field === "revoked_at") await c.admin.query("UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE id=(SELECT authorization_id FROM app.action_outbox WHERE id=(SELECT outbox_action_id FROM app.quote_send WHERE document_id=$1))", [f.input.documentId]);
    else await c.admin.query(`UPDATE app.action_outbox SET ${field}=$2 WHERE id=(SELECT outbox_action_id FROM app.quote_send WHERE document_id=$1)`,
      [f.input.documentId, field === "recipient" ? '["changed@fictional.invalid"]' : "0".repeat(64)]);
    return saved;
  });
  await expect(f.app.issue(f.jobId, f.input)).rejects.toThrow("FAKE_EXECUTOR_DID_NOT_ADVANCE");
  expect(await f.app.deliveryView(f.jobId)).toMatchObject({ status: "queued", attempts: 0, receiptCount: 0 });
  expect((await effects(f))[0]).toMatchObject({ sends: 1, deliveries: 0 });
});
it("changed party binding makes the immutable preview stale before issue", async () => {
  const f = await quote(), parties = new JobPartiesRepository(c.runtime);
  const customer = await parties.command(f.auth.context, f.auth.membershipId, f.jobId, { version: "job-parties-command.v1", commandId: randomUUID(),
    action: "create_customer", customer: { version: "customer.v1", name: "Other Fictional Customer", type: "person" } }, f.auth.digest);
  const current = await parties.view(f.auth.context, f.auth.membershipId, f.jobId, f.auth.digest);
  await parties.command(f.auth.context, f.auth.membershipId, f.jobId, { version: "job-parties-command.v1", commandId: randomUUID(), action: "correct",
    expectedJobRevision: current.jobRevision, reason: "Correct fictional customer", parties: { version: "job-parties.v1", customerRevisionId: customer.revisionId,
      siteRevisionId: current.current!.siteRevisionId } }, f.auth.digest);
  await expect(f.app.issue(f.jobId, f.input)).rejects.toThrow("QUOTE_CHANGED");
  expect(await effects(f)).toEqual([]);
});
