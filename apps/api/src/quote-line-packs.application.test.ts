import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const job = "11111111-1111-4111-8111-111111111111", lineId = "22222222-2222-4222-8222-222222222222", revisionId = "33333333-3333-4333-8333-333333333333";
const workspace = vi.fn(), confirmed = vi.fn(), access = vi.fn();
vi.mock("@jobguard/db", async original => ({ ...(await original<typeof import("@jobguard/db")>()),
  QuoteRepository: class { readWorkspace = workspace; }, QuoteLinePackRepository: class { revisionConfirmed = confirmed; } }));
vi.mock("./practice-access.js", () => ({ PracticeAccess: class { job = access; } }));
const { QuoteLinePacksApplication } = await import("./quote-line-packs.application.js");
const { jobSourceFailure } = await import("./job-source.errors.js");
const line = (change: Record<string, unknown> = {}) => ({ id: lineId, quantity: "6", unit: "m²", included: true, ...change });
const withLine = (change?: Record<string, unknown>) => workspace.mockResolvedValue({ revisions: [{ id: revisionId, lines: [line(change)] }] });
const example = { packSize: "1.2", packUnit: "m²", wastage: "1.10", onSite: "1" };

beforeEach(() => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  access.mockResolvedValue({ context: { tenantId: "t" }, digest: "d" }); confirmed.mockResolvedValue(true); withLine();
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("QW-6 pack count on a quote line", () => {
  it("6 m² with 10% wastage in 1.2 m² packs is 6 packs: 1 already on site, order 5", async () => {
    const app = new QuoteLinePacksApplication({} as never, "session");
    expect(await app.read(job, lineId, example)).toEqual({
      version: "pack-count.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: job, lineId,
      line: { quantity: "6", unit: "m²", confirmed: true }, packSizeSaved: false,
      status: "calculated", grossPacks: "6", packsOnSiteUsed: "1", packsToOrder: "5",
    });
    expect(access).toHaveBeenCalledWith(job);
    expect(confirmed).toHaveBeenCalledWith({ tenantId: "t" }, job, revisionId);
  });
  it("counts nothing on site when onSite is left out, and never uses more on-site packs than needed", async () => {
    const app = new QuoteLinePacksApplication({} as never, "session");
    expect(await app.read(job, lineId, { ...example, onSite: undefined })).toMatchObject({ grossPacks: "6", packsOnSiteUsed: "0", packsToOrder: "6" });
    expect(await app.read(job, lineId, { ...example, onSite: "9" })).toMatchObject({ grossPacks: "6", packsOnSiteUsed: "6", packsToOrder: "0" });
  });
  it.each([
    ["measurement", "an unissued quote", (): unknown => confirmed.mockResolvedValue(false), example],
    ["measurement", "an excluded line", (): unknown => withLine({ included: false }), example],
    ["measurement", "a line with no quantity", (): unknown => withLine({ quantity: null }), example],
    ["measurement", "a line with no unit", (): unknown => withLine({ unit: null }), example],
    ["product", "no pack details", (): unknown => undefined, { wastage: "1.10" }],
    ["pack_size", "no pack size", (): unknown => undefined, { ...example, packSize: undefined }],
    ["pack_size", "no pack unit", (): unknown => undefined, { ...example, packUnit: undefined }],
    ["pack_size", "a zero pack size", (): unknown => undefined, { ...example, packSize: "0" }],
    ["unit_mismatch", "packs sold in a different unit", (): unknown => undefined, { ...example, packUnit: "each" }],
    ["wastage_multiplier", "no wastage", (): unknown => undefined, { ...example, wastage: undefined }],
    ["wastage_multiplier", "a malformed wastage", (): unknown => undefined, { ...example, wastage: "10%" }],
    ["set_aside_packs", "a negative on-site count", (): unknown => undefined, { ...example, onSite: "-1" }],
    ["set_aside_packs", "a part pack on site", (): unknown => undefined, { ...example, onSite: "1.5" }],
  ] as const)("asks for %s on %s", async (reason, _label, arrange, query) => {
    arrange();
    const app = new QuoteLinePacksApplication({} as never, "session");
    expect(await app.read(job, lineId, Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined))))
      .toMatchObject({ status: "needs_input", reason, packSizeSaved: false });
  });
  it("hides lines from other jobs and malformed line ids as not found", async () => {
    const app = new QuoteLinePacksApplication({} as never, "session");
    workspace.mockResolvedValue({ revisions: [{ id: revisionId, lines: [line({ id: "44444444-4444-4444-8444-444444444444" })] }] });
    expect(jobSourceFailure(await app.read(job, lineId, example).catch(e => e))).toMatchObject({ status: 404, body: { code: "NOT_FOUND" } });
    expect(jobSourceFailure(await app.read(job, "not-a-line", example).catch(e => e))).toMatchObject({ status: 404, body: { code: "NOT_FOUND" } });
    expect(confirmed).not.toHaveBeenCalled();
  });
  it("refuses unknown or oversized query fields before reading, and pilot mode", async () => {
    const app = new QuoteLinePacksApplication({} as never, "session");
    expect(jobSourceFailure(await app.read(job, lineId, { ...example, price: "1" }).catch(e => e))).toMatchObject({ status: 400 });
    expect(jobSourceFailure(await app.read(job, lineId, { ...example, packSize: "1".repeat(41) }).catch(e => e))).toMatchObject({ status: 400 });
    expect(access).not.toHaveBeenCalled();
    vi.stubEnv("JOBGUARD_ENV", "pilot_no_charge");
    expect(() => new QuoteLinePacksApplication({} as never, "session")).toThrow();
  });
});
