import { beforeEach, describe, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ list: vi.fn(), submit: vi.fn(), session: vi.fn(), context: {}, token: "10000000-0000-4000-8000-000000000001" }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: f.token }) }) }));
vi.mock("./synthetic-server", () => ({ syntheticPool: () => ({}) }));
vi.mock("@jobguard/db", () => ({
  ContractorRepository: class { resolveSession = f.session; },
  contractorSessionContext: async () => f.context,
  WormCommandRepository: class { listHolds = f.list; submit = f.submit; },
  WormCommandError: class extends Error { constructor(readonly code: string) { super(code); } },
}));
import { WormCommandError } from "@jobguard/db";
import { evidenceHoldInput } from "./evidence-hold-server";
import { GET, POST } from "../api/jobs/[id]/evidence-holds/route";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = () => ({ version: "evidence-hold.v1", commandId: id(3), idempotencyKey: id(4), evidenceId: id(5), action: "apply_hold" });
const req = (body: unknown = input(), origin: string | null = "https://holds.invalid") => new Request("https://holds.invalid/api/jobs/x/evidence-holds", {
  method: "POST", headers: origin ? { origin, "Content-Type": "application/json" } : {}, body: JSON.stringify(body),
});
const params = { params: Promise.resolve({ id: id(2) }) };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS", "https://holds.invalid");
  f.token = id(1); f.session.mockResolvedValue({ membershipId: id(6) });
  f.list.mockResolvedValue([{ evidenceId: id(5), action: "apply_hold", status: "queued", held: false }]);
  f.submit.mockResolvedValue({ id: id(3), status: "queued", object_key: "secret", actor_id: "private", result: { private: true } });
});
describe("session-only evidence hold transport", () => {
  it.each(["actorMembershipId", "actor", "tenantId", "tenant", "status", "object_key", "objectKey", "object_version_id", "objectVersionId", "policyVersion"])("strictly refuses client %s", async field => {
    const response = await POST(req({ ...input(), [field]: "forged" }), params);
    expect(response.status).toBe(400); expect(f.submit).not.toHaveBeenCalled();
  });
  it("refuses anchors and requires a release reference", () => {
    expect(evidenceHoldInput.safeParse({ ...input(), action: "request_anchor" }).success).toBe(false);
    expect(evidenceHoldInput.safeParse({ ...input(), action: "release_hold" }).success).toBe(false);
  });
  it("delegates exactly once using session actor and context, and returns a redacted requested receipt", async () => {
    const response = await POST(req(), params);
    expect(response.status).toBe(201); expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ version: "evidence-hold-result.v1", commandId: id(3), status: "queued", message: "Hold requested" });
    expect(f.submit).toHaveBeenCalledExactlyOnceWith(f.context, { ...input(), version: "worm.command.v1", policyVersion: "synthetic_d07_v1", actorMembershipId: id(6), jobId: id(2) });
  });
  it.each([null, "https://attacker.invalid"])("refuses missing or untrusted origin %s before session or database", async origin => {
    expect((await POST(req(input(), origin), params)).status).toBe(403); expect(f.session).not.toHaveBeenCalled();
  });
  it("fails closed outside synthetic mode and without a session", async () => {
    vi.stubEnv("JOBGUARD_ENV", "production"); expect((await POST(req(), params)).status).toBe(403);
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f.token = "";
    expect((await POST(req(), params)).status).toBe(401); expect(f.session).not.toHaveBeenCalled();
  });
  it("uses the same not-found for foreign jobs, foreign evidence and unknown items", async () => {
    f.list.mockResolvedValueOnce(null).mockResolvedValueOnce([]).mockResolvedValueOnce([{ evidenceId: id(9) }]);
    const results = [];
    for (let n = 0; n < 3; n++) {
      const response = await POST(req(), params); expect(response.status).toBe(404); results.push(await response.json());
    }
    expect(results[0]).toEqual(results[1]); expect(results[1]).toEqual(results[2]); expect(f.submit).not.toHaveBeenCalled();
  });
  it("preserves typed replay conflict and sanitized refusals", async () => {
    f.submit.mockRejectedValueOnce(new WormCommandError("WORM_REPLAY_CONFLICT"));
    const conflict = await POST(req(), params); expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ code: "WORM_REPLAY_CONFLICT" });
    f.submit.mockRejectedValueOnce(new Error("provider secret"));
    const unavailable = await POST(req(), params); expect(unavailable.status).toBe(503);
    expect(JSON.stringify(await unavailable.json())).not.toContain("secret");
  });
  it("refuses inactive owners on both reads and mutations without submitting", async () => {
    f.list.mockRejectedValue(new WormCommandError("WORM_REFUSED"));
    expect((await GET(new Request("https://holds.invalid"), params)).status).toBe(403);
    expect((await POST(req(), params)).status).toBe(403);
    expect(f.submit).not.toHaveBeenCalled();
  });
  it("returns a no-store typed failure for malformed JSON", async () => {
    const response = await POST(new Request("https://holds.invalid", { method: "POST", headers: { origin: "https://holds.invalid" }, body: "{" }), params);
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ code: "INVALID_INPUT" });
    expect(f.submit).not.toHaveBeenCalled();
  });
  it.each(["queued", "executing", "pending", "outcome_unknown", "refused", "cancelled"])("never calls %s an applied hold", async status => {
    f.list.mockResolvedValueOnce([{ evidenceId: id(5), action: "apply_hold", status, held: false }]);
    const response = await GET(new Request("https://holds.invalid"), params);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).items[0].message).not.toBe("Hold applied");
  });
  it("shows applied release and pending release truthfully", async () => {
    f.list.mockResolvedValueOnce([{ evidenceId: id(5), action: "release_hold", status: "queued", held: true }]);
    expect((await (await GET(new Request("https://holds.invalid"), params)).json()).items[0]).toMatchObject({ message: "Release requested", held: true });
    f.list.mockResolvedValueOnce([{ evidenceId: id(5), action: "release_hold", status: "applied", held: false }]);
    expect((await (await GET(new Request("https://holds.invalid"), params)).json()).items[0]).toMatchObject({ message: "Hold released", held: false });
  });
});

it.each([["WORM_REFUSED", 403], ["WORM_UNCONFIRMED", 503], ["WORM_REPLAY_CONFLICT", 409]] as const)(
  "LATER-SAFETY-26 maps %s to %s without internal detail", async (code, status) => {
    const error = new WormCommandError(code); error.message = "SELECT secret_key FROM private";
    f.submit.mockRejectedValueOnce(error);
    const response = await POST(req(), params);
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toMatch(/SELECT|secret_key|private/);
    if (status === 503) expect(body).toEqual({ code: "UNAVAILABLE", message: "The server could not confirm this request. Retry the same request." });
  });
