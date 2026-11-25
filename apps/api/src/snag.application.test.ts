import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SnagError } from "@jobguard/core";
import { PracticeAccessError, WatchdogError } from "@jobguard/db";

const job = "11111111-1111-4111-8111-111111111111", snag = "22222222-2222-4222-8222-222222222222", command = "33333333-3333-4333-8333-333333333333";
const read = vi.fn(), add = vi.fn(), revise = vi.fn(), recordEvent = vi.fn(), photo = vi.fn(), access = vi.fn(), materialPool = vi.fn();
vi.mock("@jobguard/db", async original => ({ ...(await original<typeof import("@jobguard/db")>()),
  practiceMaterialPool: (...args: unknown[]) => { materialPool(...args); return "practice-pool"; },
  SnagRepository: class { read = read; add = add; revise = revise; recordEvent = recordEvent; photo = photo; } }));
vi.mock("./practice-access.js", () => ({ PracticeAccess: class { job = access; } }));
const { SnagApplication, snagFailure } = await import("./snag.application.js");
const row = { id: snag, revision: 1, title: "Fictional cracked tile", location: null, assigneeLabel: null, dueOn: "2026-11-23", createdAt: "2026-11-20T09:00:00.000Z",
  createdByMembershipId: "m", events: [], photos: [] };
const app = () => new SnagApplication({} as never, "session", () => new Date("2026-11-24T12:00:00.000Z"));

beforeEach(() => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  access.mockResolvedValue({ context: { tenantId: "t" }, digest: "d".repeat(64) }); read.mockResolvedValue([row]);
});
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("QW-4 snag application", () => {
  it("checks the session owns the job before reading, through the practice-bound pool, and derives overdue on the UK date", async () => {
    const list = await app().list(job);
    expect(access).toHaveBeenCalledWith(job);
    expect(materialPool).toHaveBeenCalledWith({}, "d".repeat(64));
    expect(read).toHaveBeenCalledWith({ tenantId: "t" }, job);
    expect(list).toMatchObject({ version: "snag-list.v1", asOf: "2026-11-24", counts: { open: 1, overdue: 1 }, snags: [{ id: snag, state: "open", overdue: true }] });
  });
  it("refuses another session's job before any repository call", async () => {
    access.mockRejectedValue(new PracticeAccessError("NOT_FOUND"));
    await expect(app().list(job)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(app().save(job, { version: "snag.v1", action: "add", commandId: command, snagId: snag, title: "Fictional" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(app().event(job, snag, { version: "snag-event.v1", commandId: command, action: "mark_fixed" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(materialPool).not.toHaveBeenCalled();
    for (const write of [read, add, revise, recordEvent, photo]) expect(write).not.toHaveBeenCalled();
  });
  it("adds, revises and records events, answering with the list", async () => {
    await app().save(job, { version: "snag.v1", action: "add", commandId: command, snagId: snag, title: " Fictional cracked tile ", assigneeLabel: "Dave (sparky)" });
    expect(add).toHaveBeenCalledWith({ tenantId: "t" }, job, expect.objectContaining({ title: "Fictional cracked tile", assigneeLabel: "Dave (sparky)", location: null, dueOn: null }));
    await app().save(job, { version: "snag.v1", action: "revise", commandId: command, snagId: snag, expectedRevision: 1, title: "Fictional cracked tile" });
    expect(revise).toHaveBeenCalledTimes(1);
    expect((await app().event(job, snag, { version: "snag-event.v1", commandId: command, action: "mark_checked" })).version).toBe("snag-list.v1");
    expect(recordEvent).toHaveBeenCalledWith({ tenantId: "t" }, job, snag, { version: "snag-event.v1", commandId: command, action: "mark_checked" });
  });
  it("refuses bad input and a bad snag id before writing", async () => {
    await expect(app().save(job, { version: "snag.v1", action: "add", commandId: command, snagId: snag, title: "" })).rejects.toEqual(new SnagError("INVALID_SNAG_INPUT"));
    await expect(app().event(job, "not-a-snag", { version: "snag-event.v1", commandId: command, action: "mark_fixed" })).rejects.toEqual(new SnagError("INVALID_SNAG_INPUT"));
    await expect(app().photo(job, snag, { version: "snag-photo.v1", action: "begin", commandId: command, fixture: "phone-camera" })).rejects.toEqual(new SnagError("INVALID_SNAG_INPUT"));
    expect(add).not.toHaveBeenCalled(); expect(recordEvent).not.toHaveBeenCalled(); expect(photo).not.toHaveBeenCalled();
  });
  it("passes photo steps through with no external action", async () => {
    photo.mockResolvedValue({ uploadId: command, objectVersionId: "synthetic-snag-completion-photo" });
    expect(await app().photo(job, snag, { version: "snag-photo.v1", action: "begin", commandId: command, fixture: "completion-photo" }))
      .toEqual({ version: "snag-photo-result.v1", environment: "synthetic_demo", jobId: job, snagId: snag, uploadId: command, objectVersionId: "synthetic-snag-completion-photo", realExternalActions: 0 });
  });
  it("refuses pilot mode", async () => {
    vi.stubEnv("JOBGUARD_ENV", "pilot_no_charge");
    expect(() => new SnagApplication({} as never, "session")).toThrow();
    vi.stubEnv("JOBGUARD_ENV", "production");
    expect(() => new SnagApplication({} as never, "session")).toThrow();
  });
  it("maps refusals to statuses, and leaves others to the job-source mapping", () => {
    expect(snagFailure(new SnagError("SNAG_NOT_FOUND"))).toMatchObject({ status: 404, body: { code: "SNAG_NOT_FOUND" } });
    expect(snagFailure(new SnagError("INVALID_SNAG_INPUT"))?.status).toBe(400);
    for (const code of ["SNAG_COMMAND_CONFLICT", "SNAG_TRANSITION_REFUSED", "SNAG_CHECKER_MUST_DIFFER", "PHOTO_LIMIT_REACHED"] as const) expect(snagFailure(new SnagError(code))?.status).toBe(409);
    expect(snagFailure(new WatchdogError("JOB_NOT_LIVE"))).toEqual({ status: 409, body: { code: "JOB_NOT_LIVE" } });
    expect(snagFailure(new Error("other"))).toBeNull();
  });
});
