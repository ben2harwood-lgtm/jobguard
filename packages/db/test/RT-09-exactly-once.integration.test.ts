import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { issuePracticeSession, DEMO_TENANT_ID } from "@jobguard/db";
import { cluster, seedHomeOwner, type Cluster } from "./contractor-practice-session-fixtures.js";
import { CaptureApplication } from "../../../apps/api/src/capture/capture.application.js";
import type { CaptureWorkspaceResponse } from "../../../apps/api/src/capture/contracts.js";

// HEAD_UNDER_TEST=49755b620ccf0223e64575006cd4590c77595ca2.
// Risk severity: A03 P0 (price rewrite); A10 P2 (safe but untyped refusal); other cases P1 (loss/duplication/conflict).
// Real application, practice authorization, repositories, dispatcher and PostgreSQL.
// Synthetic deterministic parser; no model, audio upload or paid provider.
const words = "Fictional kitchen. Fit shelves £200.00.";
let c: Cluster;
let app: CaptureApplication;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  c = await cluster();
  await seedHomeOwner(c);
  app = new CaptureApplication(c.runtime, await issuePracticeSession(c.runtime));
}, 120_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
const input = () => ({ contractVersion: "job_capture_v1", requested_tenant_id: DEMO_TENANT_ID,
  captureId: randomUUID(), source: { kind: "text", text: words }, fixtureId: "deterministic-local-v1" });
function draft(view: CaptureWorkspaceResponse) {
  return { version: "proposal_review_v1" as const, jobId: view.jobId, reviewId: view.reviewId,
    proposalId: view.proposalId, revision: 0,
    lines: view.proposal.lines.map(line => ({ id: line.id, scopeItemId: line.scopeItemId,
      origin: "proposal" as const, description: "Fit shelves", room: "Kitchen", category: "Carpentry",
      quantity: "1", unit: "item", unitPricePence: 20000, disposition: "accepted" as const,
      dismissalReason: null, parentScopeItemIds: [], sourceExcerpt: words })),
    questions: view.proposal.questions.map(q => ({ id: randomUUID(), question: q.question.value,
      blocking: true, disposition: "answered" as const, answer: "Builder removes waste." })) };
}
async function saved() {
  const view = await app.capture(input());
  return app.save(view.jobId, { contractVersion: "proposal_review_command_v1", expectedRevision: 0, review: draft(view) });
}
const confirm = (view: CaptureWorkspaceResponse, commandId = randomUUID()) => app.confirm(view.jobId, {
  contractVersion: "proposal_review_confirm_v1", commandId, expectedRevision: view.review!.revision });
async function scopeCount(jobId: string) {
  return (await c.admin.query("SELECT count(*)::int n FROM app.scope_revision WHERE tenant_id=$1 AND job_id=$2", [DEMO_TENANT_ID, jobId])).rows[0].n;
}

describe("RT-09 API exactly-once paths", () => {
  it("RT-09-A01 simultaneous capture replays create one job and one reserved line", async () => {
    const request = input();
    const [a, b] = await Promise.all([app.capture(request), app.capture(structuredClone(request))]);
    expect(a.jobId).toBe(b.jobId); expect(a.captureId).toBe(request.captureId);
    expect(a.source.text).toBe(words); expect(b.source.text).toBe(words);
    expect(a.proposal.lines).toHaveLength(1);
    expect(b.proposal.lines[0]!.scopeItemId).toBe(a.proposal.lines[0]!.scopeItemId);
    expect((await c.admin.query("SELECT count(*)::int n FROM app.job_record_proposal WHERE capture_id=$1", [request.captureId])).rows[0].n).toBe(1);
  });
  it("RT-09-A02 lost capture reply recovers the original job with a new application instance", async () => {
    const token = await issuePracticeSession(c.runtime), request = input();
    const a = await new CaptureApplication(c.runtime, token).capture(request);
    const b = await new CaptureApplication(c.runtime, token).capture(request);
    expect(b.jobId).toBe(a.jobId); expect(b.proposal.lines).toEqual(a.proposal.lines); expect(b.source.text).toBe(words);
  });
  it("RT-09-A03 changed words under an existing capture identity conflict without rewriting", async () => {
    const request = input(), original = await app.capture(request);
    await expect(app.capture({ ...request, source: { kind: "text", text: "Fictional kitchen. Fit shelves £250.00." } })).rejects.toMatchObject({ code: "CAPTURE_ID_REUSED" });
    expect((await app.view(original.jobId)).source.text).toBe(words);
  });
  it("RT-09-A04 same saved revision in two tabs permits one edit and a typed conflict", async () => {
    const view = await saved(), first = structuredClone(view.review!), second = structuredClone(view.review!);
    first.lines[0]!.description = "Fit shelves and brackets";
    second.lines[0]!.description = "Fit shelves and supports";
    const replies = await Promise.allSettled([first, second].map(review => app.save(view.jobId, {
      contractVersion: "proposal_review_command_v1", expectedRevision: review.revision, review })));
    expect(replies.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(replies.filter(r => r.status === "rejected")).toHaveLength(1);
    expect((replies.find(r => r.status === "rejected") as PromiseRejectedResult).reason).toMatchObject({ code: "REVIEW_REVISION_CONFLICT" });
    const winner = (replies.find(r => r.status === "fulfilled") as PromiseFulfilledResult<CaptureWorkspaceResponse>).value;
    expect((await app.view(view.jobId)).review).toEqual(winner.review);
  });
  it("RT-09-A05 a lost save reply replay is a clear conflict and preserves the committed edit", async () => {
    const view = await saved(), review = structuredClone(view.review!);
    review.lines[0]!.description = "Fit shelves and brackets";
    const request = { contractVersion: "proposal_review_command_v1", expectedRevision: review.revision, review };
    const committed = await app.save(view.jobId, request);
    await expect(app.save(view.jobId, request)).rejects.toMatchObject({ code: "REVIEW_REVISION_CONFLICT" });
    expect((await app.view(view.jobId)).review).toEqual(committed.review);
  });
  it("RT-09-A06 stale confirm cannot promote another tab's changed review", async () => {
    const view = await saved(), changed = structuredClone(view.review!);
    changed.lines[0]!.description = "Fit shelves and brackets";
    await app.save(view.jobId, { contractVersion: "proposal_review_command_v1", expectedRevision: changed.revision, review: changed });
    await expect(confirm(view)).rejects.toMatchObject({ code: "REVIEW_REVISION_CONFLICT" });
    expect(await scopeCount(view.jobId)).toBe(0);
    expect((await app.view(view.jobId)).review!.lines[0]!.description).toBe("Fit shelves and brackets");
  });
  it.each(["same", "different"] as const)("RT-09-A07-%s duplicate confirm IDs never promote two canonical lines", async kind => {
    const view = await saved(), id = randomUUID();
    const replies = await Promise.allSettled([confirm(view, id), confirm(view, kind === "same" ? id : randomUUID())]);
    expect(replies.some(r => r.status === "fulfilled")).toBe(true);
    for (const reply of replies) if (reply.status === "rejected") expect(["COMMAND_CONFLICT", "REVIEW_REVISION_CONFLICT"]).toContain(reply.reason.code);
    expect(await scopeCount(view.jobId)).toBe(1);
    expect((await app.view(view.jobId)).status).toBe("quoting");
  });
  it("RT-09-A08 save after confirm cannot silently overwrite canonical work", async () => {
    const view = await saved(); await confirm(view);
    const changed = structuredClone(view.review!); changed.lines[0]!.description = "Fit shelves and brackets";
    await expect(app.save(view.jobId, { contractVersion: "proposal_review_command_v1", expectedRevision: changed.revision, review: changed })).rejects.toMatchObject({ code: "REVIEW_REVISION_CONFLICT" });
    expect(await scopeCount(view.jobId)).toBe(1);
    expect((await app.view(view.jobId)).review!.lines[0]!.description).toBe("Fit shelves");
  });
  it.each(["same", "different"] as const)("RT-09-A09-%s duplicate discard IDs produce one terminal outcome or clear conflict", async kind => {
    const view = await app.capture(input()), id = randomUUID();
    const request = (commandId: string) => ({ contractVersion: "draft_discard_v1", commandId, expectedRevision: 0 });
    const replies = await Promise.allSettled([app.discard(view.jobId, request(id)), app.discard(view.jobId, request(kind === "same" ? id : randomUUID()))]);
    expect(replies.some(r => r.status === "fulfilled")).toBe(true);
    for (const reply of replies) if (reply.status === "rejected") expect(["COMMAND_CONFLICT", "REVIEW_REVISION_CONFLICT", "DISCARD_DRAFT_REFUSED"]).toContain(reply.reason.code);
    expect((await app.view(view.jobId)).status).toBe("lost");
    expect(await scopeCount(view.jobId)).toBe(0);
  });
  it.fails("RT-09-A10 [RT-09-F003] stale discard after confirmation returns a clear typed conflict", async () => {
    const view = await saved();
    await confirm(view);
    // Order the two requests deliberately: confirmation has committed, but the
    // old draft screen still holds revision 0 when its Discard request arrives.
    // This pins the stale side of the race rather than depending on scheduling.
    const refusal = await app.discard(view.jobId, { contractVersion: "draft_discard_v1", commandId: randomUUID(), expectedRevision: 0 })
      .then(() => null, error => error as { code: string; message: string });
    const final = await app.view(view.jobId);
    expect(final.status).toBe("quoting"); expect(final.source.text).toBe(words);
    expect(await scopeCount(view.jobId)).toBe(1);
    expect(refusal).toMatchObject({ code: "REVIEW_REVISION_CONFLICT" });
  });
});
