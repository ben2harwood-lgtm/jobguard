import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
const { read, command } = vi.hoisted(() => ({ read: vi.fn(), command: vi.fn() }));
vi.mock("./rams.application.js", () => ({ RamsApplication: class { read = read; command = command; },
  RamsError: class extends Error { constructor(readonly code: string) { super(code); } } }));
vi.mock("@jobguard/db", () => ({ WorkPlanError: class extends Error { constructor(readonly code: string) { super(code); } } }));
vi.mock("../practice-access.js", () => ({ practiceCookie: () => "fictional-session" }));
import { RamsController } from "./rams.controller.js";
import { RamsError } from "./rams.application.js";
const request = { headers: { cookie: "jg_session=fictional-session", origin: "https://fictional.invalid" } };
let controller: RamsController;
beforeEach(() => {
  vi.clearAllMocks(); controller = new RamsController({} as Pool);
  vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  vi.stubEnv("AUTH_ALLOWED_ORIGIN", request.headers.origin);
});
afterEach(() => vi.unstubAllEnvs());
describe("Q06 standalone RAMS adapter uses the shared application", () => {
  it("returns persisted reads and passes the exact command", async () => {
    read.mockResolvedValue({ version: "rams-screen.v1", drafts: [] }); command.mockResolvedValue({ revision: 1 });
    expect(await controller.read(request, "job")).toEqual({ version: "rams-screen.v1", drafts: [] });
    expect(await controller.command(request, "job", { action: "generate" })).toEqual({ revision: 1 });
    expect(command).toHaveBeenCalledWith("job", { action: "generate" });
  });
  it("refuses a foreign or missing write origin", () => {
    for (const headers of [{ origin: "https://other.invalid" }, {}]) {
      expect(() => controller.command({ headers }, "job", {})).toThrow(expect.objectContaining({ status: 403 }));
    }
    expect(command).not.toHaveBeenCalled();
  });
  it("refuses flag-off and non-synthetic reads before touching the application", async () => {
    vi.stubEnv("JOBGUARD_LOCAL_V2", "0");
    await expect(controller.read(request, "job")).rejects.toMatchObject({ status: 404 });
    vi.stubEnv("JOBGUARD_LOCAL_V2", "1"); vi.stubEnv("JOBGUARD_ENV", "production_billing");
    await expect(controller.read(request, "job")).rejects.toMatchObject({ status: 404 });
    expect(read).not.toHaveBeenCalled();
  });
  it("maps the shared stale-revision refusal to HTTP 409", async () => {
    command.mockRejectedValue(new RamsError("RAMS_VERSION_CONFLICT"));
    await expect(controller.command(request, "job", {})).rejects.toMatchObject({ status: 409 });
  });
});
