import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import { expect, it, vi } from "vitest";
import { CompanyFinalCheckRepository } from "./company-final-check-repository.js";
import { verifiedTenantContextFromMembership, type AuthenticatedMembership } from "./tenant-context.js";
const tenantId = "10000000-0000-4000-8000-000000000001";
const actorId = "20000000-0000-4000-8000-000000000002";
const jobId = "30000000-0000-4000-8000-000000000003";
const raw = { version: "company-final-check.v1", jobId };
const context = () => verifiedTenantContextFromMembership({ tenantId, membershipId: actorId,
  identityUserId: "40000000-0000-4000-8000-000000000004" } as AuthenticatedMembership,
  { kind: "real", credential: "a".repeat(64) });
function connection(fail = false) {
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    if (sql.includes("current_actor")) return { rows: [{ actor: actorId, tenant: tenantId }] };
    if (sql.includes("company_final_check_read")) {
      if (fail) throw Object.assign(new Error("COMPANY_FINAL_CHECK_FORBIDDEN"), { code: "42501" });
      return { rows: [{ result: { version: "company-final-check-read.v1", draft: null } }] };
    }
    return { rows: [] };
  });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  return { query, release, connect, pool: { connect } as unknown as Pool };
}
it("binds the real session first and passes only job identifiers to company SQL", async () => {
  const db = connection();
  await expect(new CompanyFinalCheckRepository(db.pool).read(context(), raw)).resolves.toMatchObject({ draft: null });
  expect(db.query.mock.calls.map(c => c[0])).toEqual(["BEGIN", "SELECT app.bind_request($1, $2, $3)",
    "SELECT app.current_actor() actor, app.current_tenant() tenant", "SELECT set_config('app.tenant_id', $1, true)",
    "SET LOCAL lock_timeout='5s'", "SELECT app.company_final_check_read($1) result", "COMMIT"]);
  expect(db.query.mock.calls[1]?.[1]).toEqual(["real", "a".repeat(64), tenantId]);
  expect(db.query.mock.calls[5]?.[1]).toEqual([jobId]);
});
it.each(["actorMembershipId", "tenantId", "kind"])("rejects supplied %s before connecting", async key => {
  const db = connection();
  await expect(new CompanyFinalCheckRepository(db.pool).read(context(), { ...raw, [key]: actorId }))
    .rejects.toMatchObject({ code: "INVALID_COMPANY_FINAL_CHECK_INPUT" });
  expect(db.connect).not.toHaveBeenCalled();
});
it("rolls back a database authority refusal and returns a typed error", async () => {
  const db = connection(true);
  await expect(new CompanyFinalCheckRepository(db.pool).read(context(), raw)).rejects.toMatchObject({ code: "COMPANY_FINAL_CHECK_FORBIDDEN" });
  expect(db.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
  expect(db.release).toHaveBeenCalledOnce();
});
it("keeps every company entry point bound and the pre-lock reveal branch before hidden reads", () => {
  const sql = readFileSync(new URL("../migrations/0951_company_final_check.sql", import.meta.url), "utf8");
  for (const name of ["read", "terms", "disposition", "lock", "request_run", "reveal"]) {
    const body = sql.split(`CREATE FUNCTION app.company_final_check_${name}(`)[1]!.split("END $$;")[0]!;
    expect(body).toContain("app.bound_context_reader()");
    expect(body).toContain("app.company_final_check_authority(");
  }
  expect(sql).not.toMatch(/CREATE OR REPLACE|GRANT SELECT|CREATE ROLE|SET ROLE/u);
  const reveal = sql.split("CREATE FUNCTION app.company_final_check_reveal(")[1]!;
  expect(reveal.indexOf("'state','unlocked'")).toBeLessThan(reveal.indexOf("app.shadow_"));
});
