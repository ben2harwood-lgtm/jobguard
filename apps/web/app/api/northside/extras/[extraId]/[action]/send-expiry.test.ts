import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { z } from "zod";

const h = vi.hoisted(() => ({ issue: vi.fn(), recover: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@jobguard/db", () => ({
  ExtraApprovalRepository: class { issueClientApproval = h.issue; },
  northsideExtras: async () => [extra],
  northsideRun: async () => ({}),
  northsideApprovalArtifact: h.recover,
}));
vi.mock("../../../../../lib/identity-server.js", () => ({
  identityApplication: () => ({ provider: { digest: () => "c".repeat(64) } }),
}));
vi.mock("../../../../../lib/northside-server", () => ({
  demoActor: async () => ({ pool: {}, member: {}, role: "surveyor" }),
  demoContext: async () => ({}),
  requireOrigin: () => undefined,
  bodyOf: (request: Request) => request.json(),
  parseDemoBody: (schema: z.ZodType, raw: unknown) => schema.parse(raw),
  json: (body: unknown) => Response.json(body),
  failure: () => Response.json({}, { status: 503 }),
}));
import { POST } from "./route";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const extra = { extraId: id(1), jobId: id(2), requestId: id(3), revisionHash: "a".repeat(64), netPence: 1000,
  clientApproverMembershipId: id(4), clientApproverEmail: "client@fictional.invalid" };
const send = () => POST(new Request("https://practice.invalid/api/northside", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ version: "northside-command.v1", commandId: id(5), jobId: extra.jobId,
    requestId: extra.requestId, revisionHash: extra.revisionHash, netPence: extra.netPence }),
}), { params: Promise.resolve({ extraId: extra.extraId, action: "send" }) });

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-06T12:02:00Z"));
  h.recover.mockResolvedValue(null);
  h.issue.mockResolvedValue({ linkId: id(6) });
});
afterEach(() => vi.useRealTimers());

it("issues new sends minutes inside the database cap even with the app clock two minutes ahead", async () => {
  expect((await send()).status).toBe(200);
  const expiresAt = h.issue.mock.calls[0]![2].expiresAt as Date;
  const databaseNow = new Date("2026-11-06T12:00:00Z").getTime();
  const sevenDays = 7 * 24 * 60 * 60_000;
  expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
  expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + sevenDays - 5 * 60_000);
  expect(expiresAt.getTime()).toBeLessThanOrEqual(databaseNow + sevenDays - 3 * 60_000);
});

it("reuses the stored expiry on retries rather than extending or shortening it", async () => {
  const expiresAt = "2026-11-10T12:00:00.000Z";
  h.recover.mockResolvedValue({ jobId: extra.jobId, extraId: extra.extraId, revisionHash: extra.revisionHash,
    approverMembershipId: extra.clientApproverMembershipId,
    artifact: { requestId: extra.requestId, netPence: extra.netPence, recipient: extra.clientApproverEmail,
      token: "a".repeat(43), expiresAt } });
  expect((await send()).status).toBe(200);
  expect(h.issue.mock.calls[0]![2].expiresAt).toEqual(new Date(expiresAt));
});
