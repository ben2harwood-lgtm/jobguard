import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ actor: vi.fn(), run: vi.fn(), targets: vi.fn(), end: vi.fn(), state: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@jobguard/db", () => ({
  PracticeWorkerSwitchRepository: class { state = h.state; },
  northsideRun: h.run, northsideSwitchTargets: h.targets, northsideTargets: {},
  northsideFacts: vi.fn(async () => ({ companyName: "Fictional Northside" })),
  northsideOwnActions: vi.fn(async () => []),
}));
vi.mock("../../lib/northside-server", () => ({
  demoActor: h.actor, demoContext: async () => ({}),
  json: (body: unknown) => Response.json(body),
  failure: () => Response.json({ code: "DEMO_UNAVAILABLE" }, { status: 503 }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "tester-session" }) }) }));
vi.mock("@jobguard/api/workspace", () => ({
  createPracticeWorkerSwitchApplication: () => ({ end: h.end }),
  assertPracticeWorkerSwitchMode: () => undefined,
  practiceWorkerSwitchHttpFailure: () => ({ status: 503, body: { code: "SWITCH_UNAVAILABLE" } }),
}));
vi.mock("../../lib/synthetic-server", () => ({ syntheticPool: () => ({}) }));
import { GET } from "./route";
import { POST as returnToOwner } from "../contractor/practice/acting-as/end/route";

const tester = "00000000-0000-4000-8000-000000000001";
const targets = ["operative", "surveyor", "supervisor", "finance", "client_approver"].map((role, i) => ({
  role, membershipId: `00000000-0000-4000-8000-00000000000${i + 2}`,
}));
const actor = (membershipId: string, role: string) => h.actor.mockResolvedValue({ pool: {}, member: { membershipId }, role, sessionId: "tester-session" });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "https://practice.invalid");
  h.run.mockResolvedValue({ testerMembershipId: tester, settings: { version: "northside-settings.v1" } });
  h.targets.mockResolvedValue(targets);
  h.state.mockResolvedValue({ state: "owner" });
  actor(tester, "owner");
});
afterEach(() => vi.unstubAllEnvs());

describe("Northside switch target disclosure (handler doubles)", () => {
  it("returns the fictional switch targets to the run's tester", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).targetsToSwitch).toEqual(targets);
    expect(h.targets).toHaveBeenCalledOnce();
  });

  it.each(["operative", "client_approver", "owner"])("hides targets from a non-tester %s", async role => {
    actor(targets[0]!.membershipId, role);
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).targetsToSwitch).toEqual([]);
    expect(h.targets).not.toHaveBeenCalled();
  });

  it.each(["operative", "client_approver"])("keeps the tester's independent return-to-owner path while acting as %s", async role => {
    const worker = targets.find(target => target.role === role)!;
    actor(worker.membershipId, role);
    h.state.mockResolvedValue({ state: "acting" });
    expect((await (await GET()).json()).targetsToSwitch).toEqual(targets);
    expect(h.state).toHaveBeenCalledWith({}, "tester-session");
    // NorthsidePractice's Return to owner button calls this endpoint without a target ID.
    h.end.mockImplementation(async () => { actor(tester, "owner"); return { state: "owner" }; });
    const body = { version: "practice-worker-switch-off.v1", commandId: "00000000-0000-4000-8000-000000000009" };
    const response = await returnToOwner(new Request("https://practice.invalid/api/contractor/practice/acting-as/end", {
      method: "POST", headers: { origin: "https://practice.invalid", "content-type": "application/json" }, body: JSON.stringify(body),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: "owner" });
    expect(h.end).toHaveBeenCalledWith({ version: "contractor-principal.v1", sessionId: "tester-session" }, body);
    expect((await (await GET()).json()).targetsToSwitch).toEqual(targets);
  });

  it("hides targets when the switch state lookup fails", async () => {
    actor(targets[0]!.membershipId, "operative");
    h.state.mockRejectedValue(new Error("switch state unavailable"));
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).targetsToSwitch).toEqual([]);
    expect(h.targets).not.toHaveBeenCalled();
  });

  it("returns no targets before a run exists", async () => {
    h.run.mockResolvedValue(null);
    expect((await (await GET()).json()).targetsToSwitch).toEqual([]);
    expect(h.targets).not.toHaveBeenCalled();
  });
});
