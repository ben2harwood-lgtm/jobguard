import type { Pool } from "pg";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ withTenant: vi.fn(), query: vi.fn() }));
vi.mock("./tenant-context.js", async original => ({ ...await original<typeof import("./tenant-context.js")>(), withTenant: mocks.withTenant }));
import { EnterpriseFeeRepository } from "./enterprise-fee-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";
const id = "00000000-0000-4000-8000-000000000001";
const context = verifiedTenantContextForQueuedJob(id), pool = {} as Pool;
const input = { version: "northside-fee-derive.v1", commandId: id, period: "2026-11" };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.withTenant.mockImplementation(async (_pool, _context, work) => work({ $client: { query: mocks.query } }));
  mocks.query.mockResolvedValue({ rows: [{ result: { derivationId: id, replayed: false } }] });
});
it("rejects client-chosen agreement, tenant, authority and malformed month before SQL", async () => {
  const repo = new EnterpriseFeeRepository(pool);
  for (const bad of [{ ...input, agreementVersionId: id }, { ...input, tenantId: id }, { ...input, status: "active" }, { ...input, period: "2026-13" }])
    await expect(repo.deriveNorthside(context, id, bad)).rejects.toMatchObject({ code: "INVALID_FEE_INPUT" });
  expect(mocks.withTenant).not.toHaveBeenCalled();
});
it("passes only the bound session, command and month; SQL authority failures remain closed", async () => {
  const repo = new EnterpriseFeeRepository(pool);
  expect(await repo.deriveNorthside(context, id, input)).toEqual({ derivationId: id, replayed: false });
  expect(mocks.withTenant).toHaveBeenCalledWith(pool, context, expect.any(Function));
  expect(mocks.query).toHaveBeenCalledWith("SELECT app.ef_derive_northside($1,$2,$3) result", [id, id, "2026-11"]);
  mocks.query.mockRejectedValueOnce({ code: "42501", message: "private diagnostics" });
  await expect(repo.deriveNorthside(context, id, input)).rejects.toMatchObject({ code: "EXTRA_FORBIDDEN" });
});
