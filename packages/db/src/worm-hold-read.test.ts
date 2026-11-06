import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { beforeEach, expect, it, vi } from "vitest";
import { WormCommandRepository } from "./worm-command-repository.js";
import type { VerifiedTenantContext } from "./tenant-context.js";
const f = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("./tenant-context.js", () => ({ withTenant: async (_pool: unknown, _context: unknown, work: (db: unknown) => unknown) => work({ $client: { query: f.query } }) }));
const context = { tenantId: randomUUID() } as VerifiedTenantContext;
const actor = randomUUID(), job = randomUUID();
const repo = new WormCommandRepository({} as Pool, true);
beforeEach(() => f.query.mockReset());
it("requires dark mode and valid IDs before touching the database", async () => {
  await expect(new WormCommandRepository({} as Pool).listHolds(context, actor, job)).rejects.toThrow("DARK_ONLY");
  await expect(repo.listHolds(context, actor, "bad")).rejects.toThrow("INVALID_INPUT");
  expect(f.query).not.toHaveBeenCalled();
});
it("refuses a non-owner, revoked or removed member before reading a job", async () => {
  f.query.mockResolvedValue({ rows: [] });
  await expect(repo.listHolds(context, actor, job)).rejects.toThrow("WORM_REFUSED");
  expect(f.query).toHaveBeenCalledTimes(1);
  expect(f.query.mock.calls[0]![0]).toMatch(/m.role='owner'/);
  expect(f.query.mock.calls[0]![0]).toContain("m.revoked_at IS NULL");
  expect(f.query.mock.calls[0]![0]).toContain("contractor_membership_revocation");
});
it("returns indistinguishable absence for an unknown or foreign job", async () => {
  f.query.mockResolvedValueOnce({ rows: [{ identity_user_id: actor }] }).mockResolvedValueOnce({ rows: [] });
  expect(await repo.listHolds(context, actor, job)).toBeNull();
  expect(f.query.mock.calls[1]![1]).toEqual([context.tenantId, job]);
});
it("uses tenant/job-scoped registered versions and stored applied state without storage keys", async () => {
  f.query.mockResolvedValueOnce({ rows: [{ identity_user_id: actor }] }).mockResolvedValueOnce({ rows: [{ id: job }] }).mockResolvedValueOnce({ rows: [] });
  expect(await repo.listHolds(context, actor, job)).toEqual([]);
  const [sql, args] = f.query.mock.calls[2]!;
  expect(args).toEqual([context.tenantId, job, actor]);
  expect(sql).toContain("app.worm_synthetic_version");
  expect(sql).toContain("h.identity_user_id<>$3::uuid");
  expect(sql).toContain("r.status='applied'");
  expect(sql).toContain("c.action IN ('apply_hold','release_hold')");
  expect(sql.split("FROM app.worm_synthetic_version")[0]).not.toMatch(/object_key|object_version_id|imprint/);
});
