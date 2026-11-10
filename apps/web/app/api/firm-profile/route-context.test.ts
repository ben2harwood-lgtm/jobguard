// Route + real package repository/context wiring; PostgreSQL is a protocol fake here.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { verifiedTenantContextFromMembership, type AuthenticatedMembership } from "@jobguard/db";
const state = vi.hoisted(() => ({ identityToken: undefined as string | undefined, session: vi.fn(), context: vi.fn(), query: vi.fn(), connect: vi.fn(), release: vi.fn() }));
vi.mock("@jobguard/api/identity", () => ({ AuthError: class extends Error {}, identityStatus: () => ({ code: "UNAUTHENTICATED", status: 401 }) }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => name === "jobguard_session" ? (state.identityToken ? { value: state.identityToken } : undefined) : { value: "a0000000-0000-4000-8000-000000000001" } }) }));
vi.mock("../../lib/identity-server", () => ({ identityApplication: () => ({ session: state.session, context: state.context, allowedOrigin: "http://localhost:3000" }) }));
vi.mock("../../lib/synthetic-server", () => ({ syntheticPool: () => ({ query: state.query, connect: state.connect }), practiceFailure: () => null }));
import { GET, POST } from "./route";
const tenant = "a0000000-0000-4000-8000-000000000002", actor = "a0000000-0000-4000-8000-000000000003", user = "a0000000-0000-4000-8000-000000000004";
let practice = false;
beforeEach(() => {
 vi.clearAllMocks(); state.identityToken = undefined; practice = false;
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 state.connect.mockResolvedValue({ query: state.query, release: state.release });
 state.query.mockImplementation(async (sql: string) => {
  if (sql.includes("authenticate_practice_session")) return { rows: [{ tenant_id: tenant, membership_id: actor, identity_user_id: user }] };
  if (sql.includes("current_actor() actor")) return { rows: [{ actor, tenant }] };
  if (sql.includes("SELECT role,app.current_firm_profile_key()")) return { rows: [{ role: "owner", company_key: practice ? null : tenant }] };
  if (sql.includes("SELECT id,app.current_firm_profile_key()")) return { rows: [{ id: actor, company_key: null }] };
  if (sql.includes("to_regclass")) return { rows: [{ present: true }] };
  if (sql.includes("FROM app.firm_profile")) return { rows: practice ? [] : [{ trading_name: "Fictional Oak Works", address_lines: [], contact_email: "", contact_phone: "" }] };
  return { rows: [] };
 });
});
afterEach(() => vi.unstubAllEnvs());
it("reads a signed-in company's saved profile through the actual package repository", async () => {
 state.identityToken = "fictional-identity-session";
 state.session.mockResolvedValue({ memberships: [{ tenantId: tenant }], csrfToken: "csrf" });
 state.context.mockResolvedValue(verifiedTenantContextFromMembership({ tenantId: tenant, membershipId: actor, identityUserId: user } as AuthenticatedMembership, { kind: "real", credential: "a".repeat(64) }));
 const response = await GET();
 expect(response.status).toBe(200);
 expect(await response.json()).toMatchObject({ profile: { tradingName: "Fictional Oak Works" }, isPractice: false, canSave: true });
 expect(state.query).toHaveBeenCalledWith("SELECT app.bind_request($1, $2, $3)", ["real", "a".repeat(64), tenant]);
 expect(state.release).toHaveBeenCalled();
});
it("reads blank practice as a sample profile and refuses its save through the actual repository", async () => {
 practice = true;
 const response = await GET();
 expect(response.status).toBe(200);
 expect(await response.json()).toMatchObject({ profile: null, isPractice: true, canSave: false });
 expect(state.query).toHaveBeenCalledWith("SELECT app.bind_request($1, $2, $3)", ["practice", expect.any(String), tenant]);
 const request = new Request("http://localhost:3000/api/firm-profile", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ version: "firm-profile.v1", tradingName: "Refused", addressLines: [], contactEmail: "", contactPhone: "" }) });
 expect((await POST(request)).status).toBe(403);
 expect(state.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO app.firm_profile"))).toBe(false);
});
