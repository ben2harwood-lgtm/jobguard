import { afterEach, beforeEach, expect, it, vi } from "vitest";

const job = "11111111-1111-4111-8111-111111111111";
const sources = vi.fn(), diary = vi.fn(), access = vi.fn();
vi.mock("@jobguard/db", async original => ({ ...(await original<typeof import("@jobguard/db")>()),
  SiteDaySummaryRepository: class { sources = sources; }, JobSourceRepository: class { read = diary; } }));
vi.mock("./practice-access.js", () => ({ PracticeAccess: class { job = access; } }));
const { SiteDaySummaryApplication, siteDaySummaryFailure } = await import("./site-day-summary.application.js");
const empty = { workDone: [], issues: [], deliveries: [], photos: [] };
const entry = (id: string, at: string) => ({ id, text: `Fictional note ${id.slice(0, 1)}`, onSite: true, evidence: { serverReceivedAt: at } });

beforeEach(() => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  access.mockResolvedValue({ context: { tenantId: "t" }, digest: "d" }); sources.mockResolvedValue(empty);
  diary.mockResolvedValue({ entries: [entry("22222222-2222-4222-8222-222222222222", "2026-11-24T09:00:00.000000Z"), entry("33333333-3333-4333-8333-333333333333", "2026-11-24T18:05:00.000000Z")] });
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it("defaults to today's site day, includes that day's diary notes and is 'so far' before 18:00", async () => {
  const app = new SiteDaySummaryApplication({} as never, "session", () => new Date("2026-11-24T12:00:00.000Z"));
  const summary = await app.read(job);
  expect(summary).toMatchObject({ date: "2026-11-24", state: "so_far", readAt: "2026-11-24T12:00:00.000Z" });
  expect(summary.notes.map(n => n.entryId)).toEqual(["22222222-2222-4222-8222-222222222222"]);
  expect(access).toHaveBeenCalledWith(job);
  expect(sources).toHaveBeenCalledWith({ tenantId: "t" }, job, { date: "2026-11-24", startsAt: "2026-11-23T18:00:00.000Z", closesAt: "2026-11-24T18:00:00.000Z" });
});
it("after 18:00 today is tomorrow's site day; a named past day reads as after the cut-off, with a read hash", async () => {
  const app = new SiteDaySummaryApplication({} as never, "session", () => new Date("2026-11-24T18:30:00.000Z"));
  const tonight = await app.read(job);
  expect(tonight).toMatchObject({ date: "2026-11-25", state: "so_far" });
  expect(tonight.notes.map(n => n.entryId)).toEqual(["33333333-3333-4333-8333-333333333333"]);
  expect(await app.read(job, { date: "2026-11-24" })).toMatchObject({ state: "after_cutoff", readHash: expect.stringMatching(/^[a-f0-9]{64}$/u) });
});
it("refuses bad queries, future days and pilot mode", async () => {
  const app = new SiteDaySummaryApplication({} as never, "session", () => new Date("2026-11-24T12:00:00.000Z"));
  await expect(app.read(job, { date: "2026-13-01" })).rejects.toMatchObject({ code: "INVALID_JOB_SOURCE_INPUT" });
  await expect(app.read(job, { day: "2026-11-24" })).rejects.toMatchObject({ code: "INVALID_JOB_SOURCE_INPUT" });
  const future = await app.read(job, { date: "2026-11-26" }).catch(error => error);
  expect(siteDaySummaryFailure(future)).toMatchObject({ status: 404, body: { code: "SITE_DAY_NOT_STARTED" } });
  expect(sources).not.toHaveBeenCalled();
  vi.stubEnv("JOBGUARD_ENV", "pilot_no_charge");
  expect(() => new SiteDaySummaryApplication({} as never, "session")).toThrow();
});
