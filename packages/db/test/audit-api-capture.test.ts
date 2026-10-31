import { fakeAuditAppend } from "./audit-protocol-fixture.js";
import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProposalReview } from "@jobguard/core";
import { CaptureApplication } from "../../../apps/api/src/capture/capture.application.js";
import { PracticeAccess } from "../../../apps/api/src/practice-access.js";
import { ConfirmProposalReview, ProposalReviewRepository, reviewContentHash } from "../src/review-repository.js";
import type { ConsequentialCommand } from "../src/commands.js";
import type { TenantTransaction } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const tenantId = "11111111-1111-4111-8111-111111111111";
const context = testTenantContext(tenantId);
const reviewFixture = (): ProposalReview => ({
  version: "proposal_review_v1", reviewId: randomUUID(), proposalId: randomUUID(), jobId: randomUUID(), revision: 1,
  lines: [{ id: randomUUID(), scopeItemId: randomUUID(), origin: "proposal", description: "Fictional work",
    room: "Kitchen", category: "Work", quantity: "3", unit: "item", unitPricePence: 2500,
    disposition: "accepted", dismissalReason: null, parentScopeItemIds: [], sourceExcerpt: "Fictional work" }], questions: [],
});
const command = (review: ProposalReview): ConsequentialCommand => ({
  version: "command.v1", commandId: randomUUID(), commandType: "confirm_proposal_review",
  semanticKey: `job:${review.jobId}:confirm:${review.proposalId}`, actorMembershipId: randomUUID(),
  subjectType: "job", subjectRef: review.jobId, action: { actionType: "confirm_scope", recipient: null,
    contentHash: reviewContentHash(review), aggregateRevision: review.revision, amountPence: null, currency: null,
    policyVersion: "synthetic-audit-test", expiresAt: new Date(Date.now() + 300000) },
});

/** Scripted SQL responses reproduce application defects; they do not prove PostgreSQL guarantees. */
class RecordedSql {
  readonly calls: Array<{ sql: string; values: unknown[] }> = [];
  readonly originals: Array<{ id: string; scope_item_id: string }>;
  receipt: { request_hash: string; status: string; result?: unknown } | undefined;
  status = "draft";
  authorizations = 0;
  completions = 0;
  constructor(readonly review: ProposalReview) {
    this.originals = review.lines.filter(line => line.origin === "proposal").map(line => ({ id: line.id, scope_item_id: line.scopeItemId }));
  }
  query = async (sql: string, values: unknown[] = []) => {
    this.calls.push({ sql, values });
    const rows = (items: unknown[]) => ({ rows: items, rowCount: items.length });
    if (sql.startsWith("SELECT app.begin_command(")) {
      const input = JSON.parse(values[6] as string);
      for (const key of ['commandId','decisionId','resolutionId','authorizationId']) delete input[key];
      input.action.expiresAt = {}; // same server-generated expiry exclusion as begin_command
      const requestHash = JSON.stringify([values[0], ...values.slice(2,6), input]);
      if (this.receipt) {
        if (this.receipt.request_hash !== requestHash || this.receipt.status !== "succeeded") throw new Error("COMMAND_CONFLICT");
        return rows([{ result: { kind: "replay", result: this.receipt.result } }]);
      }
      this.receipt = { request_hash: requestHash, status: "processing" }; this.authorizations++;
      return rows([{ result: { kind: "claim", decisionId: randomUUID(), resolutionId: randomUUID(), authorizationId: randomUUID() } }]);
    }
    if (sql.startsWith("SELECT app.complete_command(")) {
      const result = { jobId: this.review.jobId, reviewId: this.review.reviewId, jobRevision: 1, status: "quoting" };
      this.receipt!.status = "succeeded"; this.receipt!.result = result; this.completions++;
      return rows([{ result }]);
    }
    if (sql.includes("INSERT INTO app.command_receipt")) {
      if (this.receipt) return rows([]);
      this.receipt = { request_hash: values[4] as string, status: "processing" };
      return rows([{ command_id: values[0] }]);
    }
    if (sql.includes("SELECT request_hash,status,result")) return rows(this.receipt ? [this.receipt] : []);
    if (sql.includes("UPDATE app.command_receipt")) {
      this.receipt!.status = "succeeded"; this.receipt!.result = JSON.parse(values[2] as string); return rows([]);
    }
    if (sql.includes("FROM app.membership")) return rows([{ role: "owner" }]);
    if (sql.includes("FROM app.proposal_line")) return rows(this.originals);
    if (sql.includes("SELECT proposal FROM app.job_record_proposal")) return rows([{ proposal: { questions: [] } }]);
    if (sql.includes("FROM app.proposal_review")) return rows(sql.includes("OR proposal_id") ? [] : [{ revision: this.review.revision, state: "reviewing" }]);
    if (sql.includes("SELECT 1 FROM app.scope_identity")) return rows([{}]);
    if (sql.includes("SELECT revision,status FROM app.job")) return rows([{ revision: 0, status: this.status }]);
    if (sql.includes("app.start_quote_from_review")) { this.status = "quoting"; return rows([{ revision: 1 }]); }
    if (sql.includes("FROM app.append_audit(")) return rows(fakeAuditAppend(values[0] as string, tenantId));
    if (sql.includes("AS tenant_id")) return rows([{ tenant_id: tenantId }]);
    if (sql.includes("current_setting('app.tenant_id') tenant")) return rows([{ tenant: tenantId }]);
    if (sql.includes("lock_audit_head")) return rows([]);
    if (sql.includes("clock_timestamp() AS occurred_at")) return rows([{ occurred_at: new Date() }]);
    if (/^(BEGIN|COMMIT|ROLLBACK|SELECT set_config|INSERT INTO|UPDATE app\.|DELETE FROM|SELECT app.advance_audit_head)/u.test(sql)) return rows([]);
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  transaction() { return { $client: { query: this.query } } as unknown as TenantTransaction; }
  pool() { return { connect: async () => ({ query: this.query, release() {} }) } as unknown as Pool; }
  inserts(table: string) { return this.calls.filter(call => (table === "audit_event" ? call.sql.includes("FROM app.append_audit(") : call.sql.includes(`INSERT INTO app.${table}`))); }
}

afterEach(() => vi.restoreAllMocks());
describe("night audit capture regressions (scripted SQL)", () => {
  it.each([["3", 2500, 7500], ["2.5", 101, 252]] as const)("capture confirmation calculates exact scope totals: %s × %i", async (quantity, price, total) => {
    const review = reviewFixture(); review.lines[0]!.quantity = quantity; review.lines[0]!.unitPricePence = price;
    const db = new RecordedSql(review);
    await new ConfirmProposalReview(review).mutate(db.transaction(), command(review));
    expect(db.inserts("scope_revision")[0]!.values[8]).toBe(total);
  });

  it.each(["omitted", "replaced"])("confirmation requires reconciliation of every captured identity: %s", async kind => {
    const review = reviewFixture();
    review.lines.push({ ...review.lines[0]!, id: randomUUID(), scopeItemId: randomUUID(), description: "Second fictional work" });
    const db = new RecordedSql(review);
    const submitted = { ...review, revision: 0, lines: kind === "omitted" ? review.lines.slice(0, 1)
      : [review.lines[0]!, { ...review.lines[1]!, scopeItemId: randomUUID() }] };
    await expect(new ProposalReviewRepository(db.pool()).save(context, submitted, 0)).rejects.toMatchObject({ code: "REVIEW_REVISION_CONFLICT" });
    expect(db.status).toBe("draft");
    expect(db.inserts("scope_revision")).toHaveLength(0);
    expect(db.inserts("proposal_review")).toHaveLength(0);
  });

  it.each(["omitted", "replaced", "relabeled", "duplicate"])("confirmation rechecks a previously stored review against captured identities: %s", async kind => {
    const original = reviewFixture();
    original.lines.push({ ...original.lines[0]!, id: randomUUID(), scopeItemId: randomUUID() });
    const db = new RecordedSql(original);
    const review = structuredClone(original);
    if (kind === "omitted") review.lines.pop();
    if (kind === "replaced") review.lines[1]!.scopeItemId = randomUUID();
    if (kind === "relabeled") { review.lines[1]!.origin = "human"; review.lines[1]!.sourceExcerpt = null; }
    if (kind === "duplicate") review.lines.push({ ...review.lines[0]!, id: randomUUID(), origin: "human", sourceExcerpt: null });
    await expect(new ConfirmProposalReview(review).mutate(db.transaction(), command(review))).rejects.toMatchObject({ code: "REVIEW_REVISION_CONFLICT" });
    expect(db.status).toBe("draft");
    expect(db.inserts("scope_revision")).toHaveLength(0);
  });

  it.each(["split", "merged"] as const)("keeps explicit %s parents and promotes only their accepted child", async disposition => {
    const review = reviewFixture(); review.lines[0]!.disposition = disposition;
    if (disposition === "merged") review.lines.push({ ...review.lines[0]!, id: randomUUID(), scopeItemId: randomUUID() });
    const parents = review.lines.map(line => line.scopeItemId), childId = randomUUID();
    review.lines.push({ ...review.lines[0]!, id: randomUUID(), scopeItemId: childId, origin: "human",
      sourceExcerpt: null, disposition: "accepted", parentScopeItemIds: parents });
    const db = new RecordedSql(review);
    await new ConfirmProposalReview(review).mutate(db.transaction(), command(review));
    expect(db.inserts("scope_revision").map(call => call.values[3])).toEqual([childId]);
    expect(db.inserts("scope_lineage").map(call => call.values.slice(2))).toEqual(parents.map(parent => [parent, childId, disposition === "merged" ? "merge" : "split"]));
    expect(db.calls.filter(call => call.sql.includes("state='retired'")).map(call => call.values[2])).toEqual(parents);
  });

  it("keeps an unknown accepted rate unknown", async () => {
    const review = reviewFixture(); review.lines[0]!.unitPricePence = null;
    const db = new RecordedSql(review);
    await new ConfirmProposalReview(review).mutate(db.transaction(), command(review));
    expect(db.inserts("scope_revision")[0]!.values.slice(7)).toEqual([null, null]);
  });

  it.each([null, "1"])("dismissed human additions neither block nor enter canonical scope: quantity %s", async quantity => {
    const review = reviewFixture(); const scopeItemId = randomUUID();
    review.lines.push({ ...review.lines[0]!, id: randomUUID(), scopeItemId, origin: "human", quantity,
      unit: quantity === null ? null : "item", sourceExcerpt: null, disposition: "dismissed", dismissalReason: "Not required" });
    const db = new RecordedSql(review);
    await new ConfirmProposalReview(review).mutate(db.transaction(), command(review));
    expect(db.status).toBe("quoting");
    expect(db.inserts("scope_revision").filter(call => call.values[3] === scopeItemId)).toHaveLength(0);
    expect(db.inserts("scope_progress").filter(call => call.values[2] === scopeItemId)).toHaveLength(0);
    expect(db.calls.some(call => call.sql.includes("state='retired'") && call.values[2] === scopeItemId)).toBe(true);
  });

  it("confirmation replay survives a lost response", async () => {
    const review = reviewFixture(); const db = new RecordedSql(review);
    vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue({ context } as never);
    vi.spyOn(ProposalReviewRepository.prototype, "read").mockResolvedValue(review);
    const app = new CaptureApplication(db.pool());
    vi.spyOn(app, "view").mockResolvedValue({ jobId: review.jobId, status: "quoting" } as never);
    const now = Date.now(); const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const input = { contractVersion: "proposal_review_confirm_v1", commandId: randomUUID(), expectedRevision: 1 };
    const first = await app.confirm(review.jobId, input);
    clock.mockReturnValue(now + 1000);
    await expect(app.confirm(review.jobId, input)).resolves.toEqual(first);
    expect(db.receipt?.status).toBe("succeeded");
    expect(db.authorizations).toBe(1);
    expect(db.completions).toBe(1); // complete_command owns the command audit now.
    expect(db.inserts("scope_revision")).toHaveLength(1);
  });
});
