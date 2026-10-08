import { afterEach, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, VariationRepository, practiceOwnedJobsSql } from "@jobguard/db";
import { createHash } from "node:crypto";
import { VariationApplication } from "./variation.application.js";

const session = "18000000-0000-4000-8000-000000000001";
const job = "18000000-0000-4000-8000-000000000002";
const input = {
 version: "variation-command.v1", action: "propose", proposalId: "18000000-0000-4000-8000-000000000003",
 scopeItemId: "18000000-0000-4000-8000-000000000004", existingScopeItemId: null, lineageParentScopeItemId: null,
 captureText: "Fictional outside tap fitted", description: "Synthetic tap",
 price: { quantity: "1", unit: "item", unitRatePence: 80000, direction: "addition" },
};
// Ownership is whatever the shared practice-session resolver runs (main's recursive practice_owned_job query);
// recognising it by the resolver's own SQL prefix keeps this test from pinning a copied literal.
const isOwnershipQuery = (sql: string) => sql.startsWith(practiceOwnedJobsSql());
const view = { baselinePence: 10000, capPence: 150, parentScopeItemId: input.scopeItemId, variations: [] };
function fixture(ownsJob: boolean, authenticates = true) {
 const query = vi.fn(async (sql: string) => ({ rows:
  sql.includes("authenticate_practice_session") && authenticates
   ? [{ tenant_id: DEMO_TENANT_ID, membership_id: DEMO_MEMBERSHIP_ID, identity_user_id: DEMO_IDENTITY_USER_ID }]
   : isOwnershipQuery(sql) && ownsJob ? [{ id: job }] : [],
 }));
 const connect = vi.fn(async () => ({ query, release: vi.fn() }));
 const pool = { query, connect } as unknown as Pool;
 const capture = vi.spyOn(VariationRepository.prototype, "logBuilderExtra").mockResolvedValue({ variationId: input.proposalId });
 const read = vi.spyOn(VariationRepository.prototype, "read").mockResolvedValue(view);
 const transact = vi.spyOn(VariationRepository.prototype, "transact");
 return { pool, query, connect, capture, read, transact };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it.each([true, false])("owned propose preserves LogBuilderExtra provenance (priced: %s)", async priced => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const f = fixture(true), app = new VariationApplication(f.pool, session);
 const command = priced ? input : { ...input, price: null };
 await app.command(job, command);
 expect(f.capture).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ tenantId: DEMO_TENANT_ID }), {
  version: "log-builder-extra.v1",
  proposal: { version: "variation-proposal.v1", id: input.proposalId, jobId: job, scopeItemId: input.scopeItemId,
   existingScopeItemId: null, lineageParentScopeItemId: null, captureKind: "text", captureText: input.captureText,
   description: input.description, suggestion: null },
  actorMembershipId: DEMO_MEMBERSHIP_ID, deviceId: null, deviceCapturedAt: null,
  price: priced ? { ...input.price, confirmedByMembershipId: DEMO_MEMBERSHIP_ID,
   rateProvenance: { kind: "human_entered", sourceRef: "synthetic://builder-entered", sourceHash: "8".repeat(64), rateVersion: "builder-price-v1" } } : null,
 });
 expect(f.transact).not.toHaveBeenCalled();
 const calls = f.query.mock.calls as unknown as [string, unknown[]?][];
 const digest = createHash("sha256").update(session).digest("hex");
 const ownership = calls.flatMap(([sql, values], index) => isOwnershipQuery(sql)
  ? [{ values, order: f.query.mock.invocationCallOrder[index]! }] : []);
 // One ownership check guards the propose command and one guards the response read, both on the session digest.
 expect(ownership.map(call => call.values)).toEqual([[DEMO_TENANT_ID, job, digest], [DEMO_TENANT_ID, job, digest]]);
 // Ownership is proven before the capture runs; the second check belongs to the read that follows it.
 const [captured] = f.capture.mock.invocationCallOrder;
 expect(ownership[0]!.order).toBeLessThan(captured!);
 expect(ownership[1]!.order).toBeGreaterThan(captured!);
 expect(calls.flatMap(([, values]) => values ?? [])).not.toContain(session);
});

it.each(["missing", "invented", "stranger"])("%s session is refused before capture, reads, parsing or replay", async scenario => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const f = fixture(false, scenario === "stranger");
 const app = new VariationApplication(f.pool, scenario === "missing" ? undefined : session);
 const code = scenario === "stranger" ? "NOT_FOUND" : "UNAUTHENTICATED";
 await expect(app.get(job)).rejects.toMatchObject({ code });
 for (const raw of [input, input, { ...input, action: "revise" }, { ...input, action: "approve" }, { ...input, action: "reject" }, {}]) {
  await expect(app.command(job, raw)).rejects.toMatchObject({ code });
 }
 expect(f.capture).not.toHaveBeenCalled();
 expect(f.read).not.toHaveBeenCalled();
 expect(f.transact).not.toHaveBeenCalled();
 if (scenario !== "stranger") expect(f.connect).not.toHaveBeenCalled();
});
