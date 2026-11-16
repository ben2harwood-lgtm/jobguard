import { afterEach, beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ authenticate: vi.fn(), pair: vi.fn(), blank: vi.fn(), demo: vi.fn(), withTenant: vi.fn(), query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "b690f3c7-0d23-4c83-bca2-5f60ce9a0f19" }) }) }));
vi.mock("./linked-practice-entry", () => ({ enforcePracticePair: f.pair }));
vi.mock("@jobguard/db", async original => ({ ...await original<typeof import("@jobguard/db")>(), authenticatePracticeSession: f.authenticate, isBlankPracticeCompanyForContext: f.blank, readSyntheticDemo: f.demo, withTenant: f.withTenant }));
import { PracticeAccessError, RequestBindingRefusedError } from "@jobguard/db";
import { practiceFailure, syntheticWorkspace } from "./synthetic-server";
import { GET as sessionRoute } from "../api/session/route";

beforeEach(() => {
 vi.clearAllMocks();
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("DATABASE_URL", "postgresql://unused.practice.invalid/fictional");
 f.authenticate.mockResolvedValue({ digest: "namespace-digest", context: { tenantId: "linked-firm" } });
 f.pair.mockResolvedValue(true); f.blank.mockResolvedValue(false);
 f.demo.mockResolvedValue({ tenant: { id: "demo-firm" }, tenants: [{ id: "demo-firm", name: "Demo firm" }] });
 f.query.mockResolvedValue({ rows: [{ id: "fictional-job", title: "Fictional work", status: "draft", revision: 1 }] });
 f.withTenant.mockImplementation((_pool, _context, fn) => fn({ $client: { query: f.query } }));
});
afterEach(() => vi.unstubAllEnvs());

it.each([true, false])("linked session reports its credential tenant even after a chooser launch (blank=%s)", async blank => {
 f.blank.mockResolvedValue(blank);
 const response = await sessionRoute();
 expect(response.status).toBe(200);
 expect(await response.json()).toMatchObject({ tenants: [{ id: "linked-firm", name: "Builder's practice firm" }], blankCompany: blank, linkedCompany: true });
 expect((await syntheticWorkspace()).jobs[0]?.tenantId).toBe("linked-firm");
 expect(f.query).toHaveBeenCalledWith(expect.any(String), ["linked-firm", "namespace-digest"]);
 expect(f.demo).not.toHaveBeenCalled();
});

it("keeps demo metadata for an unlinked nonblank session", async () => {
 f.pair.mockResolvedValue(false);
 expect((await syntheticWorkspace()).tenants).toEqual([{ id: "demo-firm", name: "Demo firm" }]);
 expect(f.demo).toHaveBeenCalledOnce();
});

it.each([
 [new RequestBindingRefusedError("practice"), 401, "UNAUTHENTICATED"],
 [new RequestBindingRefusedError("real"), 403, "FORBIDDEN"],
 [new RequestBindingRefusedError("contractor_practice"), 403, "FORBIDDEN"],
 [new PracticeAccessError("UNAUTHENTICATED"), 401, "UNAUTHENTICATED"],
 [new PracticeAccessError("NOT_FOUND"), 404, "NOT_FOUND"],
 [new PracticeAccessError("SYNTHETIC_MODE_REQUIRED"), 403, "SYNTHETIC_MODE_REQUIRED"],
] as const)("returns only the established public code for %s", async (error, status, code) => {
 const response = practiceFailure(error)!;
 expect(response.status).toBe(status);
 expect(response.headers.get("Cache-Control")).toBe("no-store");
 expect(await response.json()).toEqual({ code });
});
it.each([
 Object.assign(new Error("private business SQL marker"), { code: "42501" }),
 Object.assign(new Error("private forged error marker"), { code: "FORBIDDEN", name: "RequestBindingRefusedError" }),
])("leaves ordinary SQL errors and forged error names to their existing handlers", error => {
 expect(practiceFailure(error)).toBeNull();
});
