import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ account: {} as Record<string, unknown>, lock: {} as Record<string, unknown>,
  profile: {} as Record<string, unknown>, parties: {} as Record<string, unknown>, extras: [] as unknown[], quantities: [] as unknown[], query: vi.fn() }));
vi.mock("@jobguard/config", () => ({ requirePilotG1: vi.fn() }));
vi.mock("@jobguard/db", () => ({
  FinalAccountCommandService: class { read = async () => state.account; },
  FinalAccountLockRepository: class { read = async () => state.lock; },
  FirmProfileRepository: class { read = async () => ({ profile: state.profile }); },
  JobPartiesRepository: class { view = async () => ({ current: state.parties }); },
  withTenant: async (_pool: unknown, _context: unknown, fn: (db: unknown) => unknown) => fn({ $client: { query: state.query } }),
}));
import { pilotInvoiceDraft } from "./pilot-invoice-draft.js";
import { pilotDraftStatements } from "@jobguard/core";
const id = "f1500000-0000-4000-8000-000000000001";
const access = vi.fn();
const make = () => pilotInvoiceDraft({} as never, { tenantId: "tenant" } as never, access);
const checklist = { ...Object.fromEntries(Object.keys(pilotDraftStatements).map(key => [key, true])), vatNumber: "GB123456789" };
async function input(app = make()) { return { version: "pilot-invoice-draft.v1", binding: (await app.read(id)).binding, checklist, format: "preview" }; }
beforeEach(() => {
  access.mockReset().mockResolvedValue({ membershipId: "owner" });
  state.account = { id, revision: 1, sourceHash: "a".repeat(64), taxPolicyVersion: "candidate_m1_standard_v1", issueBlocked: false,
    lines: [{ kind: "baseline", sourceId: id, description: "Work", netPence: 1003, approvalId: null }],
    totals: { net: { pence: 1003 }, tax: { pence: 201 }, total: { pence: 1204 } } };
  state.lock = { lock: { id }, checkStatus: "completed", captures: [] };
  state.profile = { tradingName: "Fictional builder", addressLines: ["1 Fictional Street"] };
  state.parties = { customerRevisionId: id, payingPartyRevisionId: id, customer: { type: "person", name: "Homeowner" },
    payingParty: { type: "person" }, site: { addressLines: ["2 Fictional Street"], town: "London", postcode: "SW1A 1AA" } };
  state.extras = []; state.quantities = [];
  state.query.mockReset().mockImplementation(async (sql: string) => ({ rows: sql.includes("FROM app.variation") ? state.extras : state.quantities }));
});
it("prepares repeated exact drafts using reads only", async () => {
  const app = make(), raw = await input(app);
  for (let i = 0; i < 3; i++) expect(await app.prepare(id, raw)).toMatchObject({ grossPence: 1204, candidateVatPence: 201 });
  expect(state.query.mock.calls.every(([sql]) => (sql as string).trim().startsWith("SELECT"))).toBe(true);
  expect(access.mock.calls.every(([job, owner]) => job === id && owner === true)).toBe(true);
});
it("rejects revoked owner, wrong tenant/job and missing lock/check before exposing a draft", async () => {
  for (const code of ["TENANT_FORBIDDEN", "NOT_FOUND"]) {
    access.mockRejectedValueOnce(new Error(code)); await expect(make().read(id)).rejects.toThrow(code);
  }
  for (const lock of [{ lock: null, checkStatus: "completed" }, { lock: { id }, checkStatus: "pending" }]) {
    state.lock = lock; await expect(make().read(id)).rejects.toThrow("REVIEW_INCOMPLETE");
  }
});
it("rejects old bindings after account, approved extra, party or profile change", async () => {
  for (const change of [() => { state.account.revision = 2; }, () => { state.profile.tradingName = "Changed"; },
    () => { state.parties.site = { addressLines: ["Changed"] }; }, () => { state.lock.captures = [{ id: "changed extra" }]; }]) {
    const app = make(), raw = await input(app); change(); await expect(app.prepare(id, raw)).rejects.toThrow("STALE_REVISION");
  }
  state.extras = [{ sourceId: "new extra", approvalId: "approved" }];
  await expect(make().read(id)).rejects.toThrow("STALE_REVISION");
});
it("rejects unsupported and unknown cases without returning a VAT fallback", async () => {
  const app = make(), raw = await input(app);
  for (const key of Object.keys(pilotDraftStatements)) await expect(app.prepare(id, {
    ...raw, checklist: { ...checklist, [key]: false },
  })).rejects.toThrow("REVIEW_INCOMPLETE");
  state.parties.customer = { type: "business", name: "Business" };
  await expect(app.prepare(id, await input(app))).rejects.toThrow("REVIEW_INCOMPLETE");
});

it("binds a preview to its job and rejects nonstandard saved tax treatment", async () => {
  const app = make(), raw = await input(app);
  await expect(app.prepare("f1500000-0000-4000-8000-000000000002", raw)).rejects.toThrow("STALE_REVISION");
  state.quantities = [{ id, taxTreatment: "reduced_rate_5" }];
  await expect(app.prepare(id, await input(app))).rejects.toThrow("REVIEW_INCOMPLETE");
});
it("uses only approved saved variation lines and preserves their recorded quantity and rate", async () => {
  const baseline = (state.account.lines as unknown[])[0];
  state.account.lines = [baseline, { kind: "variation", sourceId: "approved-extra", approvalId: "approval", description: "Approved shelf", netPence: 5 }];
  state.account.pending = [{ description: "Unconfirmed finding", netPence: 9999 }];
  state.account.totals = { net: { pence: 1008 }, tax: { pence: 202 }, total: { pence: 1210 } };
  state.extras = [{ sourceId: "approved-extra", approvalId: "approval", quantity: "1", unit: "item", unitRatePence: "5" }];
  const app = make(), draft = await app.prepare(id, await input(app));
  expect(draft.lines).toHaveLength(2);
  expect(draft.lines[1]).toMatchObject({ description: "Approved shelf", quantity: "1", unit: "item", unitRatePence: 5, netPence: 5 });
  expect(JSON.stringify(draft)).not.toContain("Unconfirmed finding");
});
it("checks G1 before preview-source or export reads", async () => {
  const { requirePilotG1 } = await import("@jobguard/config");
  for (const operation of [() => make().read(id), () => make().prepare(id, {})]) {
    vi.mocked(requirePilotG1).mockImplementationOnce(() => { throw new Error("G1_PENDING"); });
    await expect(operation()).rejects.toThrow("G1_PENDING");
  }
  expect(access).not.toHaveBeenCalled();
});
