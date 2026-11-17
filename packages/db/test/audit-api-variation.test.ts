import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { VariationApplication } from "../../../apps/api/src/variation/variation.application.js";
import { PracticeAccess } from "../../../apps/api/src/practice-access.js";
import { variationCommandV1 } from "../../../apps/api/src/variation/contracts.js";
import { VariationController } from "../../../apps/api/src/variation/variation.controller.js";
import { DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "../src/demo-seed.js";
import { VariationRepository, VariationRevisionConflict, insertPricedVariation, type VariationWorkspaceRow } from "../src/variation-repository.js";
import type { TenantTransaction } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { priceVariation, type VariationProposal } from "@jobguard/core";

vi.mock("../src/audit.js", async importOriginal => ({ ...await importOriginal<typeof import("../src/audit.js")>(), appendAuditBatch: vi.fn().mockResolvedValue(undefined) }));
afterEach(() => vi.restoreAllMocks());
const context = testTenantContext(DEMO_TENANT_ID), jobId = randomUUID();
const price = { quantity: "1", unit: "item", unitRatePence: 12500, direction: "addition" as const };
const attestation = "Builder-recorded practice acceptance — not an authenticated customer signature";
function item(): VariationWorkspaceRow {
  return { id: randomUUID(), scopeItemId: randomUUID(), existingScopeItemId: null,
    lineageParentScopeItemId: randomUUID(), description: "Fictional extra", captureText: "Fictional extra",
    state: "draft", currentRevisionId: null, revisions: [] };
}

/** Scripted persistence executes the real writers; it does not prove PostgreSQL isolation. */
function fixture(items: VariationWorkspaceRow[]) {
  const calls: string[] = [], rejections: unknown[][] = [], origins = new Map<string, string>();
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    calls.push(sql);
    const rows = (rows: unknown[]) => ({ rows, rowCount: rows.length });
    if (sql.includes("FROM app.variation WHERE") && sql.includes("FOR UPDATE")) {
      const v = items.find(v => v.id === values[1]);
      return rows(v ? [{ job_id: jobId, state: v.state, current_revision_id: v.currentRevisionId }] : []);
    }
    if (sql.includes("SELECT 1 FROM app.variation_revision")) return rows([{}]);
    if (sql.includes("FROM app.variation_approval")) {
      return rows(items.flatMap(v => v.revisions.filter(r => r.id === values[1] && r.approved).map(() => ({ id: randomUUID() }))));
    }
    if (sql.includes("INSERT INTO app.variation_revision")) {
      const v = items.find(v => v.id === values[16])!;
      v.revisions.push({ id: values[0] as string, revision: values[3] as number, description: values[5] as string,
        quantity: values[6] as string, unit: values[7] as string, unitRatePence: values[8] as number,
        signedDeltaPence: values[9] as number, contentHash: values[10] as string, approved: false, rejected: false,
        actor: `membership:${DEMO_MEMBERSHIP_ID}`, source: "synthetic://builder-entered" });
      return rows([]);
    }
    if (sql.includes("INSERT INTO app.variation_rate_observation")) return rows([]);
    if (sql.includes("INSERT INTO app.variation_approval")) {
      items.find(v => v.id === values[3])!.revisions.find(r => r.id === values[4])!.approved = true;
      return rows([{ id: values[0] }]);
    }
    if (sql.includes("INSERT INTO app.variation_rejection")) { rejections.push(values); return rows([]); }
    if (sql.startsWith("UPDATE app.variation")) {
      const priced = sql.includes("state='priced'");
      const v = items.find(v => v.id === values[priced ? 2 : 1])!;
      if (priced) { v.state = "priced"; v.currentRevisionId = values[0] as string; }
      else if (sql.includes("state='approved'")) v.state = "approved";
      else if (v.currentRevisionId === values[2]) v.state = "rejected";
      return rows([]);
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  const db = { $client: { query } } as unknown as TenantTransaction;
  const repo = new VariationRepository({} as Pool);
  vi.spyOn(PracticeAccess.prototype, "job").mockResolvedValue({ context } as Awaited<ReturnType<PracticeAccess["job"]>>);
  vi.spyOn(VariationRepository.prototype, "read").mockImplementation(async () => ({ baselinePence: 10000,
    capPence: 150, parentScopeItemId: randomUUID(), variations: items }));
  vi.spyOn(VariationRepository.prototype, "transact").mockImplementation(async (_context, fn) => fn(db));
  vi.spyOn(VariationRepository.prototype, "logBuilderExtra").mockImplementation(async (_context, raw) => {
    const capture = raw as { proposal: VariationProposal };
    const v = item(); Object.assign(v, capture.proposal); items.push(v); origins.set(v.id, "builder_logged");
    return { variationId: v.id };
  });
  const app = new VariationApplication({} as Pool);
  const revise = (v: VariationWorkspaceRow, expectedRevisionId: string | null, unitRatePence = 12500) => app.command(jobId, {
    version: "variation-command.v1", action: "revise", variationId: v.id, revisionId: randomUUID(),
    expectedRevisionId, description: v.description, price: { ...price, unitRatePence },
  });
  const approve = (v: VariationWorkspaceRow) => app.command(jobId, { version: "variation-command.v1", action: "approve",
    variationId: v.id, revisionId: v.currentRevisionId, approvalId: randomUUID(), attestation });
  const reject = (v: VariationWorkspaceRow, revisionId = v.currentRevisionId!) => repo.reject(db, DEMO_TENANT_ID,
    { id: randomUUID(), variationId: v.id, revisionId, actorMembershipId: DEMO_MEMBERSHIP_ID });
  async function initial(v: VariationWorkspaceRow, unitRatePence = 12500) {
    const proposal: VariationProposal = { version: "variation-proposal.v1", id: v.id, jobId, scopeItemId: v.scopeItemId,
      existingScopeItemId: v.existingScopeItemId, lineageParentScopeItemId: v.lineageParentScopeItemId,
      captureKind: "text", captureText: v.captureText, description: v.description, suggestion: null };
    return insertPricedVariation(db, DEMO_TENANT_ID, priceVariation({ id: randomUUID(), variationId: v.id,
      previous: null, proposal, description: v.description, contentHash: "a".repeat(64), confirmed: { ...price,
        unitRatePence, confirmedByMembershipId: DEMO_MEMBERSHIP_ID, rateProvenance: { kind: "human_entered",
          sourceRef: "synthetic://builder-entered", sourceHash: "8".repeat(64), rateVersion: "builder-price-v1" } } }));
  }
  return { app, db, calls, rejections, origins, revise, approve, reject, initial };
}

it("reject cannot cancel an approved revision", async () => {
  const v = item(), f = fixture([v]); await f.initial(v); await f.approve(v);
  await expect(f.reject(v)).rejects.toMatchObject({ code: "VARIATION_REVISION_CONFLICT" });
  expect(f.rejections).toEqual([]); expect(v.state).toBe("approved");
  expect(v.revisions.filter(r => v.state === "approved" && r.id === v.currentRevisionId && r.approved)
    .map(r => r.signedDeltaPence)).toEqual([12500]);
});

it("reject requires the targeted variation's current revision", async () => {
  const a = item(), b = item(), f = fixture([a, b]); await f.initial(a); await f.initial(b);
  await expect(f.reject(a, b.currentRevisionId!)).rejects.toMatchObject({ code: "VARIATION_REVISION_CONFLICT" });
  expect(f.rejections).toEqual([]); expect([a.state, b.state]).toEqual(["priced", "priced"]);
  expect((await f.app.get(jobId)).pendingExtrasPence).toBe(25000);
});

it("prices an existing unpriced capture", async () => {
  const f = fixture([]), captured = item();
  await f.app.command(jobId, { version: "variation-command.v1", action: "propose", proposalId: captured.id,
    scopeItemId: captured.scopeItemId, existingScopeItemId: null, lineageParentScopeItemId: captured.lineageParentScopeItemId,
    description: captured.description, captureText: captured.captureText, price: null });
  const view = await f.app.get(jobId), v = view.variations[0]!;
  await f.revise(v, null); await f.approve(v);
  expect(v.id).toBe(captured.id); expect(v.scopeItemId).toBe(captured.scopeItemId);
  expect(v.lineageParentScopeItemId).toBe(captured.lineageParentScopeItemId);
  expect(f.origins.get(v.id)).toBe("builder_logged"); expect(v.state).toBe("approved");
  expect(v.revisions.map(r => [r.revision, r.signedDeltaPence])).toEqual([[1, 12500]]);
  expect((await f.app.get(jobId)).approvedAdditionsPence).toBe(12500);
});

it("stale revise preserves newer approval", async () => {
  const v = item(), f = fixture([v]); await f.initial(v, 10000); const r1 = v.currentRevisionId;
  await f.revise(v, r1, 20000); await f.approve(v); const r2 = v.currentRevisionId;
  await expect(f.revise(v, r1, 11000)).rejects.toMatchObject({ code: "VARIATION_REVISION_CONFLICT" });
  expect(v.currentRevisionId).toBe(r2); expect(v.state).toBe("approved"); expect(v.revisions).toHaveLength(2);
  expect((await f.app.get(jobId)).approvedAdditionsPence).toBe(20000);
});

it("revise requires an explicit expected revision, including null for first pricing", () => {
  expect(variationCommandV1.safeParse({ version: "variation-command.v1", action: "revise", variationId: randomUUID(),
    revisionId: randomUUID(), description: "Fictional", price }).success).toBe(false);
});

it("the locked pricing writer refuses a predecessor that changed after the application read", async () => {
  const v = item(), f = fixture([v]), previous = await f.initial(v);
  const proposal: VariationProposal = { version: "variation-proposal.v1", id: v.id, jobId, scopeItemId: v.scopeItemId,
    existingScopeItemId: null, lineageParentScopeItemId: v.lineageParentScopeItemId,
    captureKind: "text", captureText: v.captureText, description: v.description, suggestion: null };
  const stale = priceVariation({ id: randomUUID(), variationId: v.id, previous, proposal, description: v.description,
    contentHash: "a".repeat(64), confirmed: { ...price, confirmedByMembershipId: DEMO_MEMBERSHIP_ID,
      rateProvenance: previous.rateProvenance } });
  await f.revise(v, previous.id, 20000); await f.approve(v);
  const before = f.calls.length;
  await expect(insertPricedVariation(f.db, DEMO_TENANT_ID, stale)).rejects.toMatchObject({ code: "VARIATION_REVISION_CONFLICT" });
  expect(f.calls.slice(before)).toHaveLength(1);
  expect(v.revisions).toHaveLength(2); expect(v.state).toBe("approved");
});

it("Nest exposes the typed revision conflict as HTTP 409", async () => {
  vi.spyOn(VariationApplication.prototype, "command").mockRejectedValue(new VariationRevisionConflict());
  await expect(new VariationController({} as Pool).post(jobId, {}, "jg_session=fixture"))
    .rejects.toMatchObject({ status: 409, response: { code: "VARIATION_REVISION_CONFLICT" } });
});
