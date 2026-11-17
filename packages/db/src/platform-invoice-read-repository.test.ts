import { expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { PlatformInvoiceDocument } from "@jobguard/core";
import { PlatformInvoiceReadRepository } from "./platform-invoice-read-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";
const tenant = "10000000-0000-4000-8000-000000000001";
const context = verifiedTenantContextForQueuedJob(tenant);
const doc = (issuerId: string, kind: string, number: string, originalNumber: string | null = null) =>
  ({ number, request: { issuerId, kind, originalNumber } }) as PlatformInvoiceDocument;
it("uses the scoped routine and groups credits by issuer as well as number", async () => {
  const documents = [doc("a", "invoice", "SIM-PLATFORM-1"), doc("b", "invoice", "SIM-PLATFORM-1"), doc("b", "credit_note", "SIM-PLATFORM-2", "SIM-PLATFORM-1")];
  const query = vi.fn(async (sql: string) => ({ rows: sql.startsWith("SELECT app.platform_invoice_read") ? documents.map(document => ({ document })) : [] }));
  const release = vi.fn(), pool = { connect: async () => ({ query, release }) } as unknown as Pool;
  const result = await new PlatformInvoiceReadRepository(pool).read(context, "a".repeat(64));
  expect(result.map(group => group.credits.length)).toEqual([0, 1]);
  expect(query).toHaveBeenCalledWith("SELECT app.platform_invoice_read($1,$2) AS document", [tenant, "a".repeat(64)]);
  expect(query.mock.calls.map(([sql]) => sql)).toEqual(["BEGIN", "SELECT set_config('app.tenant_id', $1, true)", "SELECT app.platform_invoice_read($1,$2) AS document", "COMMIT"]);
  expect(release).toHaveBeenCalledOnce();
});
it("refuses malformed digests before opening a connection", async () => {
  const connect = vi.fn();
  await expect(new PlatformInvoiceReadRepository({ connect } as unknown as Pool).read(context, "bad")).rejects.toThrow("PLATFORM_INVOICE_FORBIDDEN");
  expect(connect).not.toHaveBeenCalled();
});
it("maps database refusal and rolls back without writes", async () => {
  const query = vi.fn(async (sql: string) => { if (sql.startsWith("SELECT app.platform_invoice_read")) throw { code: "42501" }; return { rows: [] }; });
  const pool = { connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
  await expect(new PlatformInvoiceReadRepository(pool).read(context, "a".repeat(64))).rejects.toThrow("PLATFORM_INVOICE_FORBIDDEN");
  expect(query).toHaveBeenLastCalledWith("ROLLBACK");
});
