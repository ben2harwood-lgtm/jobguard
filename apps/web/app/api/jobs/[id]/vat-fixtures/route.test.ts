import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { VatFixtureRepository } from "@jobguard/db";
import { VAT_FIXTURE_LABEL, VAT_SUPPORT_MATRIX_VERSION } from "@jobguard/core";
import { VatFixtureApplication } from "../../../../../../api/src/vat-fixture.application.js";
const state = vi.hoisted(() => ({ credentials: {} as Record<string, string>, authenticate: vi.fn(), findMembership: vi.fn(), app: null as unknown }));
vi.mock("@jobguard/api/workspace", async () => import("../../../../../../api/src/vat-fixture.application.js"));
vi.mock("../../../../lib/identity-server", () => ({ identityCredentials: async () => state.credentials, identityApplication: () => ({ allowedOrigin: "https://company.invalid" }) }));
vi.mock("../../../../lib/vat-fixture-server", () => ({ vatFixtureApplication: () => state.app }));
import { GET, POST } from "./route";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = () => ({ version: "vat.fixture-append.v1", commandId: id(4), jobId: id(2),
  book: { version: "vat.fixture-book.v1", matrixVersion: VAT_SUPPORT_MATRIX_VERSION, environment: "synthetic", label: VAT_FIXTURE_LABEL,
    supplierReference: "Fictional supplier", customerReference: "Fictional client", taxBasis: "net_after_retention", roundingVersion: "fixture_cumulative_group_half_up_v1" },
  document: { id: id(5), previousDocumentId: null, kind: "interim", documentReference: "Fictional one", documentDate: "2026-11-04",
    interimCertificationId: id(6), retentionProfileId: id(7), retentionReleaseId: null, creditOfDocumentId: null,
    groups: [{ treatment: "drc_20", cumulativeNetPence: 10000, retainedNetPence: 1000, eligibility: { source: "human_fixture", actorId: id(9), evidenceId: id(8),
      supplierVatRegistered: true, supplierVatNumber: "fictional-supplier-vat", customerVatRegistered: true, customerVatNumber: "fictional-customer-vat",
      customerEndUser: false, intermediarySupplier: false, constructionReverseChargeInScope: true, qualifyingBasisReference: "fictional qualification" } }] } });
let rows: unknown[];
let canRead: boolean;
const query = vi.fn(async (sql: string, values?: unknown[]) => {
  if (sql.includes("FROM app.membership")) return { rows: canRead ? [{ id: id(3) }] : [] };
  if (!sql.includes("app.vat_fixture_records")) return { rows: [] };
  if (values?.[2] !== id(2)) throw new Error("VAT_FIXTURE_NOT_FOUND");
  if (values?.[3] === "append") rows.push({ input: JSON.parse(String(values[4])), actorId: id(3), recordHash: "a".repeat(64), matrixVersion: VAT_SUPPORT_MATRIX_VERSION, environment: "synthetic", label: VAT_FIXTURE_LABEL });
  return { rows: [{ result: rows }] };
});
beforeEach(() => {
  rows = []; canRead = true; vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  state.credentials = { sessionToken: "s".repeat(32), csrfToken: "c".repeat(24), tenantHeader: id(1), origin: "https://company.invalid" };
  state.authenticate.mockResolvedValue({ identityUserId: id(1), sessionId: id(3), csrfToken: "c".repeat(24) });
  state.findMembership.mockResolvedValue({ id: id(3), tenantId: id(1), identityUserId: id(1), role: "owner" });
  state.app = new VatFixtureApplication({ allowedOrigin: "https://company.invalid", provider: { authenticate: state.authenticate, findMembership: state.findMembership },
    principal: async () => state.authenticate() } as never,
    new VatFixtureRepository({ connect: async () => ({ query, release() {} }) } as unknown as Pool));
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
const params = (jobId = id(2)) => ({ params: Promise.resolve({ id: jobId }) });
const post = (raw: unknown = input(), jobId = id(2)) => POST(new Request("https://company.invalid/vat-fixtures", { method: "POST", body: JSON.stringify(raw) }), params(jobId));
const get = (jobId = id(2)) => GET(new Request("https://company.invalid/vat-fixtures"), params(jobId));
it("stores and reloads separate DRC figures; replay is one row and changed content is a typed conflict", async () => {
  const first = await post(); expect(first.status).toBe(201); expect(first.headers.get("Cache-Control")).toBe("no-store");
  expect((await post()).status).toBe(201); expect(rows).toHaveLength(1);
  const changed = input(); changed.document.documentReference = "different";
  const conflict = await post(changed); expect(conflict.status).toBe(409); expect(await conflict.json()).toMatchObject({ code: "CONFLICT" });
  const read = await get(); expect(read.headers.get("Cache-Control")).toBe("no-store");
  const body = await read.json(); expect(body.reconciliation.documents[0].cumulative).toMatchObject({ net: { pence: 10000 }, vatToSupplier: { pence: 0 }, reverseChargeVat: { pence: 1800 }, gross: { pence: 10000 }, retained: { pence: 1000 }, expectedCash: { pence: 9000 } });
  expect(body.issueRefusal).toContain("real issue is disabled"); expect(body.records[0].actorId).toBe(id(3));
});
it.each(["tenantId", "actor", "actorId", "enabled", "VAT_TREATMENTS_ENABLED"])("refuses forged %s without storing", async field => {
  const response = await post({ ...input(), [field]: id(1) }); expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code: "INVALID_INPUT" }); expect(rows).toHaveLength(0);
});
it("refuses missing, unsupported and conflicting eligibility with plain reasons and no default", async () => {
  for (const change of ["missing", "unsupported", "conflict"]) {
    const value = input();
    if (change === "missing") delete (value.document.groups[0]!.eligibility as Partial<typeof value.document.groups[number]["eligibility"]>).customerEndUser;
    if (change === "unsupported") value.document.groups[0]!.treatment = "unsupported";
    if (change === "conflict") value.document.groups[0]!.eligibility.customerEndUser = true;
    const result = await post(value); expect(result.status).toBe(400); expect((await result.json()).message.length).toBeGreaterThan(15); expect(rows).toHaveLength(0);
  }
});
it("refuses changed book fields in plain words and route/body mismatch", async () => {
  await post(); const value = input(); value.commandId = id(20); value.book.customerReference = "changed";
  const response = await post(value); expect(response.status).toBe(409); expect((await response.json()).message).toContain("fixed fields");
  expect((await post(input(), id(99))).status).toBe(400); expect(rows).toHaveLength(1);
});
it("refuses expired/revoked sessions, revoked membership, foreign origin, missing POST origin and wrong CSRF", async () => {
  state.authenticate.mockResolvedValueOnce(undefined); expect((await get()).status).toBe(401);
  state.authenticate.mockResolvedValueOnce(undefined); expect((await post()).status).toBe(401);
  state.findMembership.mockResolvedValueOnce(undefined); expect((await post()).status).toBe(403);
  for (const [key, value] of [["origin", "https://foreign.invalid"], ["origin", ""], ["csrfToken", "x".repeat(24)]]) {
    const old = state.credentials[key!]; state.credentials[key!] = value!; expect((await post()).status).toBe(403); state.credentials[key!] = old!;
  }
  expect(rows).toHaveLength(0);
});
it("maps foreign and unknown repository jobs to identical no-store refusals, and other environments to not-found", async () => {
  const a = await get(id(90)), b = await get(id(91)); expect(a.status).toBe(404); expect(await a.json()).toEqual(await b.json());
  vi.stubEnv("JOBGUARD_ENV", "production"); expect((await get()).status).toBe(404); expect((await post()).status).toBe(404);
  expect(rows).toHaveLength(0);
});

it("GET refuses without revealing VAT records and ignores request-supplied actors", async () => {
  await post(); canRead = false;
  for (const job of [id(2), id(99)]) {
    const response = await GET(new Request(`https://company.invalid/vat-fixtures?actor=${id(90)}&actorId=${id(90)}`,
      { headers: { "x-actor-id": id(90) } }), params(job));
    expect(response.status).toBe(403); expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({ version: "vat.fixture-error.v1", code: "FORBIDDEN", message: "You don't have permission." });
    expect(JSON.stringify(body)).not.toMatch(/fictional|vatNumber|records/u);
  }
  expect(query.mock.calls.filter(([sql]) => sql.includes("FROM app.membership")).map(([, values]) => values)).toEqual([[id(1), id(3)], [id(1), id(3)]]);
});
