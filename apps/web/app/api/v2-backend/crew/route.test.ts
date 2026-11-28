import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@jobguard/api/identity";
import { CrewContactError, PracticeAccessError } from "@jobguard/db";

const { cookie, session, pair, workspace, list, record } = vi.hoisted(() => ({
  cookie: vi.fn(), session: vi.fn(), pair: vi.fn(), workspace: vi.fn(), list: vi.fn(), record: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: cookie }) }));
vi.mock("../../../lib/synthetic-server", async () => {
  const { NextResponse } = await import("next/server");
  return { hasSyntheticSession: session, syntheticPool: () => ({}),
    practiceFailure: (error: unknown) => error instanceof PracticeAccessError
      ? NextResponse.json({ code: error.code }, { status: error.code === "UNAUTHENTICATED" ? 401 : 403 }) : null };
});
vi.mock("../../../lib/linked-practice-entry", () => ({ enforcePracticePair: pair }));
vi.mock("../../../lib/workspace-server", () => ({ workspaceApplication: workspace }));
import { GET, POST } from "./route";

const sessionId = "11111111-1111-4111-8111-111111111111";
const allowed = "https://v2.jobguard.invalid";
const internal = "http://127.0.0.1:3400/api/v2-backend/crew";
const post = (body: unknown, headers: Record<string, string> = { origin: allowed }) => new Request(internal,
  { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
const command = { version: "crew-contact.v1", commandId: sessionId, crewId: sessionId, expectedRevision: 0,
  displayName: "Jordan Fictional", trade: "Electrician", phone: "07700900123", email: null };

beforeEach(() => {
  vi.clearAllMocks();
  cookie.mockReturnValue({ value: sessionId });
  session.mockReturnValue(true);
  pair.mockResolvedValue(false);
  workspace.mockResolvedValue({ crewContacts: { list, record } });
  list.mockResolvedValue([]);
  record.mockResolvedValue({ crewId: sessionId, revision: 1 });
  vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", allowed);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("JOBGUARD_LOCAL_V2", "1");
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("V2-C3C-UI crew route", () => {
  it("is not found outside V2, and reads or writes nothing", async () => {
    for (const value of ["", "0", "true"]) {
      vi.stubEnv("JOBGUARD_LOCAL_V2", value);
      expect((await GET()).status).toBe(404);
      expect((await POST(post(command))).status).toBe(404);
    }
    expect(workspace).not.toHaveBeenCalled();
  });

  it("lists and records through CrewContactApplication unchanged, after the browser pairing check", async () => {
    const read = await GET();
    expect(read.status).toBe(200);
    expect(read.headers.get("cache-control")).toBe("no-store");
    expect(await read.json()).toEqual({ crew: [] });
    expect(list).toHaveBeenCalledWith({ version: "crew-contact-query.v1" });
    const saved = await POST(post(command));
    expect(saved.status).toBe(201);
    expect(record).toHaveBeenCalledWith(command);
    expect(pair).toHaveBeenCalledTimes(2);
    expect(pair).toHaveBeenCalledWith(expect.anything(), sessionId);
  });

  it("refuses a linked session without its exact pairing before any read or write", async () => {
    for (const [error, status, code] of [[new PracticeAccessError("UNAUTHENTICATED"), 401, "UNAUTHENTICATED"],
      [new AuthError("UNAUTHENTICATED"), 401, "UNAUTHENTICATED"], [new AuthError("FORBIDDEN"), 403, "FORBIDDEN"]] as const) {
      pair.mockRejectedValue(error);
      for (const response of [await GET(), await POST(post(command))]) {
        expect(response.status).toBe(status);
        expect((await response.json()).code).toBe(code);
      }
    }
    expect(workspace).not.toHaveBeenCalled();
  });

  it("refuses no session, a foreign or missing origin, and a bad body, with nothing recorded", async () => {
    session.mockReturnValueOnce(false).mockReturnValueOnce(false);
    expect((await GET()).status).toBe(401);
    expect((await POST(post(command))).status).toBe(401);
    for (const headers of [{ origin: "https://other.invalid" }, {} as Record<string, string>]) {
      const response = await POST(post(command, headers));
      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe("ORIGIN_FORBIDDEN");
    }
    expect((await POST(post("{"))).status).toBe(400);
    expect(record).not.toHaveBeenCalled();
  });

  it("keeps the crew-contact codes", async () => {
    for (const [code, status, shown] of [["CREW_CONTACT_INVALID", 400, "CREW_CONTACT_INVALID"],
      ["CREW_CONTACT_VERSION_CONFLICT", 409, "CREW_CONTACT_VERSION_CONFLICT"],
      ["CREW_CONTACT_COMMAND_CONFLICT", 409, "CREW_CONTACT_COMMAND_CONFLICT"],
      ["CREW_CONTACT_EDITOR_REQUIRED", 403, "FORBIDDEN"]] as const) {
      record.mockRejectedValueOnce(new CrewContactError(code));
      const response = await POST(post(command));
      expect(response.status).toBe(status);
      expect((await response.json()).code).toBe(shown);
    }
  });
});
