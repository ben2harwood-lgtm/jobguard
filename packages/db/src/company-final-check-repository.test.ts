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
function connection(fail: boolean | string = false) {
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    if (sql.includes("current_actor")) return { rows: [{ actor: actorId, tenant: tenantId }] };
    if (sql.includes("company_final_check_request_run") && typeof fail === "string") {
      throw Object.assign(new Error(fail), { code: "P0001" });
    }
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
  const sql = readFileSync(new URL("../migrations/0700_company_final_check.sql", import.meta.url), "utf8");
  for (const name of ["read", "terms", "disposition", "lock", "request_run", "reveal"]) {
    const body = sql.split(`CREATE FUNCTION app.company_final_check_${name}(`)[1]!.split("END $$;")[0]!;
    expect(body).toContain("app.bound_context_reader()");
    expect(body).toContain("app.company_final_check_authority(");
  }
  expect(sql).not.toMatch(/CREATE OR REPLACE|GRANT SELECT|CREATE ROLE|SET ROLE/u);
  const reveal = sql.split("CREATE FUNCTION app.company_final_check_reveal(")[1]!;
  expect(reveal.indexOf("'state','unlocked'")).toBeLessThan(reveal.indexOf("app.shadow_"));
});

it("adopts main's latest LS-142 request and reveal bodies after company authority", () => {
  const main = readFileSync(new URL("../migrations/0698_final_check_post_invoice_rerun.sql", import.meta.url), "utf8");
  const company = readFileSync(new URL("../migrations/0700_company_final_check.sql", import.meta.url), "utf8");
  const body = (sql: string, name: string) => sql.split(`FUNCTION app.${name}(`)[1]!.split("END $$;")[0]!;
  const mainRequest = body(main, "request_final_check_run");
  const companyRequest = body(company, "company_final_check_request_run");
  const requestAnchor = " SELECT * INTO m FROM app.final_check_manifest";
  expect(companyRequest.slice(companyRequest.indexOf(requestAnchor))).toBe(mainRequest.slice(mainRequest.indexOf(requestAnchor)));
  const revealAnchor = " SELECT * INTO l FROM app.final_account_lock";
  const mainReveal = body(main, "read_final_check_reveal"), companyReveal = body(company, "company_final_check_reveal");
  expect(companyReveal.slice(companyReveal.indexOf(revealAnchor))).toBe(mainReveal.slice(mainReveal.indexOf(revealAnchor)));
});

it.each(["FINAL_CHECK_PENDING", "FINAL_CHECK_SOURCE_CHANGED", "JOB_WORK_CLOSED"])("returns a typed LS-142 request refusal: %s", async code => {
  const db = connection(code);
  await expect(new CompanyFinalCheckRepository(db.pool).requestRun(context(), raw))
    .rejects.toMatchObject({ name: "CompanyFinalCheckError", code });
  expect(db.query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
});
