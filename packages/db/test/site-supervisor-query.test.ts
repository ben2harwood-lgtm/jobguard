import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { recordSupervisorQuery } from "../src/site-supervisor-query.js";
import { verifiedTenantContextFromMembership, type AuthenticatedMembership } from "../src/tenant-context.js";
vi.mock("../src/tenant-context.js", async original => ({ ...await original<typeof import("../src/tenant-context.js")>(), withTenant: async (db: unknown, _ctx: unknown, work: (db: unknown) => unknown) => work(db) }));
const id = "11111111-1111-4111-8111-111111111111";
const actor = { tenantId: id, membershipId: id, identityUserId: id } as AuthenticatedMembership;
const ctx = verifiedTenantContextFromMembership(actor);
const body = { version: "record-site-supervisor-query.v1", commandId: id, orderLineScopeItemId: id, sorCode: "FIT-LOCK", quantity: "1", expectedOrderRevisionId: id };
it("refuses a cross-tenant actor and a raw amount before SQL", async () => {
 const query = vi.fn(), pool = { $client: { query } } as unknown as Pool;
 await expect(recordSupervisorQuery(pool, ctx, { ...actor, tenantId: "22222222-2222-4222-8222-222222222222" }, id, body)).rejects.toMatchObject({ code: "NOT_FOUND" });
 await expect(recordSupervisorQuery(pool, ctx, actor, id, { ...body, amount: 100 })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
 expect(query).not.toHaveBeenCalled();
});
it.each(["NOT_FOUND", "ORDER_LINE_NOT_FOUND", "INVALID_QUANTITY", "COMMAND_CONFLICT"])("preserves checked refusal %s", async message => {
 const query = vi.fn().mockRejectedValue(new Error(message)), pool = { $client: { query } } as unknown as Pool;
 await expect(recordSupervisorQuery(pool, ctx, actor, id, body)).rejects.toMatchObject({ code: message === "COMMAND_CONFLICT" ? "IDEMPOTENCY_CONFLICT" : message });
 expect(query).toHaveBeenCalledWith("SELECT app.ent3_supervisor_query($1,$2,$3::jsonb) result", [id, actor.membershipId, JSON.stringify(body)]);
});
it("loads the actual source-authored proof and reviewed LP-0 additions", async () => {
 const { loadMigrationProofs } = await import("./migration-proof-loader.js");
 const { loadReviewedInventory } = await import("./lp-0-catalog.js");
 const proofs = loadMigrationProofs().proofs;
 const proof = proofs.find(p => p.migration === "0744_site_supervisor_query.sql");
 expect(proof?.tenancy).toEqual([{ relname: "site_supervisor_query", before: null, after: { relrowsecurity: true, relforcerowsecurity: true, guarded: true, owner: "jobguard_migration" } }]);
 const { inventory } = await loadReviewedInventory();
 expect(inventory.entries.some(e => e.key === "acl|routine|function:app.ent3_supervisor_query(uuid,uuid,jsonb)|jobguard_runtime|EXECUTE|-")).toBe(true);
});
