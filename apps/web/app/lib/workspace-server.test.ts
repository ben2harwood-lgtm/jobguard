import { afterEach, beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ token: undefined as string | undefined, pair: vi.fn(), create: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => name === "jg_session" && f.token !== undefined ? { value: f.token } : undefined }) }));
vi.mock("./linked-practice-entry", () => ({ enforcePracticePair: f.pair }));
vi.mock("./synthetic-server", () => ({ syntheticPool: () => "pool",
  hasSyntheticSession: (value: string | undefined) => !!value && /^[0-9a-f-]{36}$/u.test(value) }));
vi.mock("@jobguard/api/workspace", () => ({ createWorkspaceApplication: f.create }));
import { PracticeAccessError } from "@jobguard/db";
import { workspaceApplication } from "./workspace-server";

const session = "b690f3c7-0d23-4c83-bca2-5f60ce9a0f19";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  f.token = session; f.pair.mockResolvedValue(true); f.create.mockReturnValue({ app: true });
});
afterEach(() => vi.unstubAllEnvs());

it("V2-PAIR-1: checks the linked browser pairing before building the workspace", async () => {
  expect(await workspaceApplication()).toEqual({ app: true });
  expect(f.pair).toHaveBeenCalledWith("pool", session);
  expect(f.pair.mock.invocationCallOrder[0]).toBeLessThan(f.create.mock.invocationCallOrder[0]!);
  expect(f.create).toHaveBeenCalledWith({ pool: "pool", sessionId: session });
});

it("V2-PAIR-1: a linked session without its exact pairing gets no workspace at all", async () => {
  f.pair.mockRejectedValue(new PracticeAccessError("UNAUTHENTICATED"));
  await expect(workspaceApplication()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(f.create).not.toHaveBeenCalled();
});

it("leaves a missing or malformed session to the workspace's own refusal, and refuses outside the practice stack", async () => {
  for (const token of [undefined, "not-a-session"]) {
    f.token = token;
    await workspaceApplication();
    expect(f.create).toHaveBeenLastCalledWith({ pool: "pool", sessionId: token });
  }
  expect(f.pair).not.toHaveBeenCalled();
  vi.stubEnv("JOBGUARD_ENV", "production");
  await expect(workspaceApplication()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});
