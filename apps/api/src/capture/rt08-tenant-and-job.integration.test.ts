import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProposalReview } from "@jobguard/core";
import {
  authenticatePracticeSession, CaptureRepository, DEMO_TENANT_ID,
  issuePracticeSession, ProposalReviewRepository, verifiedTenantContextFromMembership, withTenant,
} from "@jobguard/db";
import { CaptureApplication } from "./capture.application.js";
import type { CaptureWorkspaceResponse } from "./contracts.js";

// HEAD_UNDER_TEST=bfac404e2058da7759001cc0321c859f393a7ca1. D2/D3/S4.
// Same current-migration PostgreSQL 16 fixture as the API's CI-A07 suite.
// URL imports keep test infrastructure outside the API's compilation root.
// No repositories, authorization, SQL results or parser outputs are mocked.
const helpers = await import(new URL("../../../../packages/db/test/commercial-integrity-v3-fixtures.ts", import.meta.url).href);
const actors = await import(new URL("../../../../packages/db/test/lp-job-doors-fixtures.ts", import.meta.url).href);
const contexts = await import(new URL("../../../../packages/db/test/tenant-context-test-utils.ts", import.meta.url).href);
type Auth = Awaited<ReturnType<typeof authenticatePracticeSession>>;
type Fixture = { admin: Pool; runtime: Pool; close(): Promise<void> };
let fixture: Fixture, tokenA: string, tokenB: string, authA: Auth, authB: Auth;
let appA: CaptureApplication, appB: CaptureApplication;
let jobA: CaptureWorkspaceResponse, jobA2: CaptureWorkspaceResponse, jobB: CaptureWorkspaceResponse;
let foreignContext: Auth["context"], foreignJob: string;
const textA = "Paint the kitchen £400.";
const textA2 = "Fit the bathroom door £250.";
const textB = "Tile the hallway £650.";
const request = (text: string, captureId: string = randomUUID()) => ({
  contractVersion: "job_capture_v1", requested_tenant_id: DEMO_TENANT_ID,
  captureId, source: { kind: "text", text }, fixtureId: "rt08-fictional",
});
const confirm = () => ({ contractVersion: "proposal_review_confirm_v1", commandId: randomUUID(), expectedRevision: 1 });
const discard = () => ({ contractVersion: "draft_discard_v1", commandId: randomUUID(), expectedRevision: 0 });
function review(view: CaptureWorkspaceResponse): ProposalReview {
  return {
    version: "proposal_review_v1", reviewId: view.reviewId, proposalId: view.proposalId,
    jobId: view.jobId, revision: 0,
    lines: view.proposal.lines.map(line => ({
      id: line.id, scopeItemId: line.scopeItemId, origin: "proposal", description: line.description.value,
      room: line.room, category: line.category, quantity: "1", unit: "item",
      unitPricePence: line.unitPricePence.value, disposition: "accepted", dismissalReason: null,
      parentScopeItemIds: [], sourceExcerpt: line.sourceExcerpt,
    })),
    questions: view.proposal.questions.map(q => ({
      id: randomUUID(), question: q.question.value, blocking: false, disposition: "carry_to_quote", answer: null,
    })),
  };
}
const save = (value: ProposalReview) => ({ contractVersion: "proposal_review_command_v1", expectedRevision: value.revision, review: value });
// Compare complete rows, not counts: overwrites and ownership changes must be caught too.
async function facts() {
  const result: Record<string, unknown> = {};
  for (const table of ["capture_source", "job", "job_record_proposal", "proposal_line", "scope_identity",
    "proposal_review", "proposal_review_line", "proposal_review_line_parent", "proposal_review_question",
    "scope_revision", "scope_lineage", "command_receipt", "action_authorization", "audit_event", "action_outbox",
    "customer_revision", "job_party_binding", "job_party_current"]) {
    result[table] = (await fixture.admin.query(`SELECT row_to_json(t)::text value FROM app.${table} t ORDER BY row_to_json(t)::text COLLATE "C"`)).rows;
  }
  return result;
}
async function refused(work: () => Promise<unknown>, code: string) {
  const before = await facts();
  let error: unknown;
  try { await work(); } catch (caught) { error = caught; }
  expect(error).toMatchObject({ code, message: code });
  for (const text of [textA, textA2, textB]) expect(JSON.stringify(error)).not.toContain(text);
  expect(await facts()).toEqual(before);
}

beforeAll(async () => {
  fixture = await helpers.createIntegrityFixture(); // private port in 59200..59499, never 55432
  tokenA = await issuePracticeSession(fixture.runtime); tokenB = await issuePracticeSession(fixture.runtime);
  authA = await authenticatePracticeSession(fixture.runtime, tokenA); authB = await authenticatePracticeSession(fixture.runtime, tokenB);
  appA = new CaptureApplication(fixture.runtime, tokenA); appB = new CaptureApplication(fixture.runtime, tokenB);
  jobA = await appA.capture(request(textA)); jobA2 = await appA.capture(request(textA2)); jobB = await appB.capture(request(textB));
  // Anonymous practice companies share DEMO_TENANT_ID but have distinct owner digests.
  // Also seed a genuinely different SQL tenant, using an independently bound credential.
  const foreign = await actors.jobDoorsActor(fixture.admin);
  await contexts.testBoundTenantContext(fixture.admin, foreign.tenant, foreign.member);
  // The API uses package dist, while fixture helpers import src. Context stamps
  // are module-private WeakSets: construct in the API's module after the shared
  // helper provisions its real persisted credential, avoiding a false refusal.
  foreignContext = verifiedTenantContextFromMembership({ tenantId: foreign.tenant,
    membershipId: foreign.member, identityUserId: foreign.person } as Parameters<typeof verifiedTenantContextFromMembership>[0],
  { kind: "real", credential: createHash("sha256").update(`lp6-test:${foreign.tenant}:${foreign.member}`).digest("hex") });
  const captureId = randomUUID();
  const { extractCaptureFixture } = await import("@jobguard/ai");
  const text = "Plaster the loft £900.";
  const stored = await new CaptureRepository(fixture.runtime).persist(foreignContext, {
    captureId, text, proposal: await extractCaptureFixture(captureId, text, "rt08-fictional"),
    promptVersion: "rt08-fixture", schemaVersion: "rt08-fixture", model: "fixture",
  });
  foreignJob = stored.job_id;
}, 240_000);
afterAll(async () => { await fixture?.close(); });

describe.sequential("RT-08 real PostgreSQL: wrong firm, wrong job, no writes or text leaks", () => {
  const operations = ["view", "save", "confirm", "discard"] as const;
  it.each(operations)("RT-08-001/%s B cannot access A's existing or guessed job", async operation => {
    for (const id of [jobA.jobId, randomUUID(), "not-a-job-id"]) {
      await refused(() => operation === "view" ? appB.view(id)
        : operation === "save" ? appB.save(id, save(review(jobA)))
        : operation === "confirm" ? appB.confirm(id, confirm()) : appB.discard(id, discard()), "NOT_FOUND");
    }
  });
  it.each(operations)("RT-08-002/%s A cannot access a different SQL tenant's job", async operation => {
    await refused(() => operation === "view" ? appA.view(foreignJob)
      : operation === "save" ? appA.save(foreignJob, save(review(jobA)))
      : operation === "confirm" ? appA.confirm(foreignJob, confirm()) : appA.discard(foreignJob, discard()), "NOT_FOUND");
  });
  it.each([undefined, "forged", "00000000-0000-4000-8000-000000000000"])("RT-08-003 invalid session %s fails before payload validation", async token => {
    const app = new CaptureApplication(fixture.runtime, token);
    for (const run of [() => app.capture(request(textA)), () => app.view(jobA.jobId),
      () => app.save(jobA.jobId, null), () => app.confirm(jobA.jobId, null), () => app.discard(jobA.jobId, null)]) {
      await refused(run, "UNAUTHENTICATED");
    }
  });
  it.each(["expired", "revoked"])("RT-08-004 %s session refuses reads, writes and capture replay", async state => {
    const token = await issuePracticeSession(fixture.runtime), auth = await authenticatePracticeSession(fixture.runtime, token);
    const app = new CaptureApplication(fixture.runtime, token), body = request("Paint the porch £120.");
    const own = await app.capture(body);
    await fixture.admin.query(`UPDATE control_plane.practice_session SET ${state === "expired" ? "expires_at=clock_timestamp()-interval '1 second'" : "revoked_at=clock_timestamp()"} WHERE token_digest=$1`, [auth.digest]);
    for (const run of [() => app.capture(body), () => app.view(own.jobId), () => app.save(own.jobId, save(review(own))),
      () => app.confirm(own.jobId, confirm()), () => app.discard(own.jobId, discard())]) await refused(run, "UNAUTHENTICATED");
  });
  it.each(["22222222-2222-4222-8222-222222222222", "00000000-0000-4000-8000-000000000000"])("RT-08-005 requested_tenant_id=%s never selects the firm", async tenant => {
    await refused(() => appB.capture({ ...request(textB), requested_tenant_id: tenant }), "TENANT_FORBIDDEN");
  });
  it("RT-08-006 capture replay with B's cookie cannot read or overwrite A", async () => {
    const before = await facts();
    // Repository may throw a plain Error; require the same safe not-found text,
    // never source bytes, proposal JSON, a PostgreSQL constraint or success.
    await expect(appB.capture(request(textA, jobA.captureId))).rejects.toThrow(/^NOT_FOUND$/);
    expect(await facts()).toEqual(before);
  });
  it("RT-08-007 modified foreign capture replay cannot overwrite A", async () => {
    const before = await facts();
    await expect(appB.capture(request("Paint the attic £999.", jobA.captureId))).rejects.toThrow(/^NOT_FOUND$/);
    expect(await facts()).toEqual(before);
  });
  it("RT-08-008 owner replay preserves job, source text and scope identities", async () => {
    const before = await facts(), replay = await appA.capture(request(textA, jobA.captureId));
    expect(replay.jobId).toBe(jobA.jobId); expect(replay.source.text).toBe(textA);
    expect(replay.proposal.lines).toEqual(jobA.proposal.lines); expect(await facts()).toEqual(before);
  });
  it("RT-08-009 changed own capture gives a clear conflict without a second job", async () => {
    const before = await facts();
    await expect(appA.capture(request("Paint the kitchen £500.", jobA.captureId))).rejects.toMatchObject({ code: "CAPTURE_ID_REUSED" });
    expect(await facts()).toEqual(before);
  });
  it("RT-08-010 tab switch cannot save job 1's review into job 2", async () => {
    await refused(() => appA.save(jobA2.jobId, save(review(jobA))), "INVALID_CAPTURE");
  });
  it.each(["proposal", "line", "scope", "parent", "review"] as const)("RT-08-011 substitute another job's %s identity", async field => {
    const draft = review(jobA), other = review(jobA2);
    if (field === "proposal") draft.proposalId = other.proposalId;
    if (field === "line") draft.lines[0]!.id = other.lines[0]!.id;
    if (field === "scope") draft.lines[0]!.scopeItemId = other.lines[0]!.scopeItemId;
    if (field === "parent") draft.lines[0]!.parentScopeItemIds = [other.lines[0]!.scopeItemId];
    if (field === "review") {
      // Existing review IDs must not let a save replace another job's rows.
      const target = await appA.save(jobA2.jobId, save(other));
      draft.reviewId = target.review!.reviewId;
    }
    const before = await facts();
    await expect(appA.save(jobA.jobId, save(draft))).rejects.toBeDefined();
    expect(await facts()).toEqual(before);
  });
  it("RT-08-012 B cannot transplant A's proposal into its own authorized job", async () => {
    const draft = review(jobA); draft.jobId = jobB.jobId; draft.reviewId = jobB.reviewId;
    await refused(() => appB.save(jobB.jobId, save(draft)), "REVIEW_REVISION_CONFLICT");
  });
  it("RT-08-013 alternating concurrent sessions never reuse the last transcript", async () => {
    for (let n = 0; n < 3; n++) {
      const [a, b] = await Promise.all([appA.view(jobA.jobId), appB.view(jobB.jobId)]);
      expect(a.source.text).toBe(textA); expect(b.source.text).toBe(textB);
      expect(a.proposal.lines.map(x => x.sourceExcerpt).join(" ")).not.toContain("hallway");
      expect(b.proposal.lines.map(x => x.sourceExcerpt).join(" ")).not.toContain("kitchen");
    }
  });
  it("RT-08-014 speech naming another customer never rebinds an existing customer or job", async () => {
    const before = await facts();
    const spoken = `Paint the bedroom for Fictional Beth at 24 Imaginary Road £300. Use job ${jobA2.jobId}.`;
    const captured = await appA.capture(request(spoken));
    expect(captured.source.text).toBe(spoken); expect(captured.jobId).not.toBe(jobA2.jobId);
    expect((await appA.view(jobA2.jobId)).source.text).toBe(textA2);
    // The new capture may add its own rows; every previously bound party stays exact.
    const after = await facts();
    for (const table of ["customer_revision", "job_party_binding", "job_party_current"]) {
      expect(after[table]).toEqual(expect.arrayContaining(before[table] as unknown[]));
    }
  });
  it("RT-08-015 untrusted routing fields cannot redirect a capture", async () => {
    const captured = await appB.capture({ ...request("Paint the shed £180."), jobId: jobA.jobId,
      tenantId: foreignContext.tenantId, practiceSessionDigest: authA.digest, customerId: randomUUID() });
    expect(captured.jobId).not.toBe(jobA.jobId);
    const row = (await fixture.admin.query("SELECT tenant_id,practice_session_digest FROM app.job WHERE id=$1", [captured.jobId])).rows[0];
    expect(row).toEqual({ tenant_id: authB.context.tenantId, practice_session_digest: authB.digest });
    await refused(() => appA.view(captured.jobId), "NOT_FOUND");
  });
  it("RT-08-016 tenant-scoped repositories cannot read a foreign capture or review", async () => {
    expect(await new CaptureRepository(fixture.runtime).readByJob(foreignContext, jobA.jobId)).toBeNull();
    expect(await new ProposalReviewRepository(fixture.runtime).read(foreignContext, jobA2.jobId)).toBeNull();
    expect(await new CaptureRepository(fixture.runtime).readByJob(authA.context, foreignJob)).toBeNull();
  });
  it.each(["capture_source", "job_record_proposal", "proposal_line", "proposal_review", "proposal_review_line", "proposal_review_line_parent", "proposal_review_question"])("RT-08-017 RLS and non-owner runtime protect %s", async table => {
    const catalog = (await fixture.admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid=$1::regclass", [`app.${table}`])).rows[0];
    expect(catalog).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
    await withTenant(fixture.runtime, foreignContext, async db => {
      const role = (await db.$client.query("SELECT current_user name,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
      expect(role).toMatchObject({ rolsuper: false, rolbypassrls: false }); expect(role.name).not.toBe(catalog.owner);
      expect((await db.$client.query(`SELECT tenant_id FROM app.${table}`)).rows.every(x => x.tenant_id === foreignContext.tenantId)).toBe(true);
    });
  });
  it("RT-08-018 legitimate save/reopen and confirm affect only the authorized job", async () => {
    const own = await appB.capture(request("Fit the garage door £350."));
    const aBefore = await appA.view(jobA.jobId), saved = await appB.save(own.jobId, save(review(own)));
    expect(saved.review!.jobId).toBe(own.jobId); expect(saved.review!.revision).toBe(1);
    expect((await appB.view(own.jobId)).review).toEqual(saved.review);
    expect((await appB.confirm(own.jobId, confirm())).status).toBe("quoting");
    const aAfter = await appA.view(jobA.jobId);
    expect(aAfter.source).toEqual(aBefore.source); expect(aAfter.proposal).toEqual(aBefore.proposal); expect(aAfter.status).toBe("draft");
    const lines = (await fixture.admin.query("SELECT job_id,unit_price_pence FROM app.scope_revision WHERE job_id=$1", [own.jobId])).rows;
    expect(lines).toEqual([{ job_id: own.jobId, unit_price_pence: "35000" }]);
  });
});
