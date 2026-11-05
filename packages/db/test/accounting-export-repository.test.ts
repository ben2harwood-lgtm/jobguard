import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { AccountingExportRepository, storedAccountingRouteChangeV1, storedAccountingRoutePreviewV1 } from "../src/accounting-export-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { scope } from "../../../apps/api/src/accounting-export.test-fixtures.js";

const request = { version: 1, scope, from: "codat", to: "xero", connectionRevision: 1, consentRevision: 1 };
const confirmation = { ...request, commandId: randomUUID(), decisionId: randomUUID(), previewHash: "a".repeat(64),
 expiresAt: new Date(Date.now() + 60000).toISOString(), humanConfirmed: true, action: "accounting_export.route",
 status: "approved", tenantId: scope.tenantId };
it("refuses actor injection, broader scope and invalid decisions before opening a connection", async () => {
 const connect = vi.fn(), repo = new AccountingExportRepository({ connect } as never);
 for (const input of [{ ...confirmation, actorId: randomUUID() }, { ...confirmation, paid: true },
  { ...confirmation, humanConfirmed: false }, { ...confirmation, status: "dismissed" },
  { ...confirmation, action: "accounting_export.push" }, { ...confirmation, version: 2 },
  { ...confirmation, scope: { ...scope, jobId: undefined } },
  { ...confirmation, scope: { ...scope, allJobs: true } },
  { ...confirmation, scope: { ...scope, mapping: { ...scope.mapping, extraPermission: true } } },
  { ...confirmation, connectionRevision: 0 }]) {
  await expect(repo.routeChangeConfirm(testTenantContext(randomUUID()), "b".repeat(64), scope.sourceId, input)).rejects.toThrow("EXPORT_INVALID_INPUT");
 }
 for (const input of [{ ...request, actorId: randomUUID() }, confirmation, { ...request, to: "global" }]) {
  await expect(repo.routeChangePreview(testTenantContext(randomUUID()), "b".repeat(64), scope.sourceId, input)).rejects.toThrow("EXPORT_INVALID_INPUT");
 }
 expect(connect).not.toHaveBeenCalled();
});
it("validates versioned preview and stored change responses including immutable history IDs", () => {
 const artifact = { ...request, entries: [{ sourceId: "demo-old", artifact: { route: "codat" }, reference: "c".repeat(64),
  externalId: "demo-target", status: "pushed", attemptId: randomUUID(), attempts: 1 }] };
 const preview = { version: 1, artifact, previewHash: "a".repeat(64) };
 expect(storedAccountingRoutePreviewV1.parse(preview)).toEqual(preview);
 expect(storedAccountingRouteChangeV1.parse({ ...preview, commandId: confirmation.commandId,
  decisionId: confirmation.decisionId, actorId: randomUUID(), revision: 1 })).toMatchObject({ artifact });
 for (const value of [{ ...preview, version: 2 }, { ...preview, actorId: randomUUID() },
  { ...preview, artifact: { ...artifact, entries: [{ ...artifact.entries[0], status: "outcome_unknown" }] } }])
  expect(storedAccountingRoutePreviewV1.safeParse(value).success).toBe(false);
});
it.each(["routeChangePreview", "routeChangeConfirm"] as const)("%s uses the checked routine in a tenant transaction", async operation => {
 const context = testTenantContext(randomUUID());
 const tenantId = `demo-${context.tenantId}`;
 const input = { ...(operation === "routeChangePreview" ? request : confirmation),
  scope: { ...scope, tenantId, mapping: { ...scope.mapping, tenantId } },
  ...(operation === "routeChangeConfirm" ? { tenantId } : {}) };
 const result = { version: 1, artifact: { ...request, scope: input.scope, entries: [] }, previewHash: "a".repeat(64),
  ...(operation === "routeChangeConfirm" ? { commandId: confirmation.commandId, decisionId: confirmation.decisionId,
   actorId: randomUUID(), revision: 1 } : {}) };
 const query = vi.fn(async (sql: string, _values?: unknown[]) => ({ rows: sql.includes("app.accounting_export_route(") ? [{ result }] : [] }));
 const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
 const repo = new AccountingExportRepository({ connect } as never);
 expect(await repo[operation](context, "b".repeat(64), scope.sourceId, input)).toEqual(result);
 expect(query.mock.calls.map(c=>c[0])).toEqual(["BEGIN", "SELECT set_config('app.tenant_id', $1, true)",
  "SELECT app.accounting_export_route($1,$2,$3,$4,$5::jsonb) result", "COMMIT"]);
 expect(query.mock.calls[2]?.[1]).toEqual([context.tenantId, "b".repeat(64), operation, scope.sourceId, JSON.stringify(input)]);
 expect(release).toHaveBeenCalledOnce();
});
