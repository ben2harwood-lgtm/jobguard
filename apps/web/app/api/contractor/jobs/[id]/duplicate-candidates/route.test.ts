import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ mark: vi.fn(), unlink: vi.fn(), read: vi.fn(), actor: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@jobguard/db", async () => {
 const { z } = await import("zod");
 class ExtraApprovalError extends Error { constructor(readonly code: string) { super(code); } }
 return { ExtraApprovalError, markDuplicateV1: z.object({ version: z.literal("mark-duplicate.v1"), commandId: z.guid(), jobId: z.guid(), duplicateId: z.guid(), canonicalId: z.guid() }).strict(),
  ExtraApprovalRepository: class { markDuplicate = mocks.mark; }, ExtraRepository: class { unlinkDuplicate = mocks.unlink; }, readExtraDuplicateCandidates: mocks.read };
});
vi.mock("./transport", async () => {

 return { duplicateActor: mocks.actor, duplicateJson: (body: unknown) => Response.json(body, { headers: { "cache-control": "no-store" } }),
 duplicateFailure: (error: { code: string }) => Response.json({ code: error.code }, { status: error.code === "ORIGIN_FORBIDDEN" ? 403 : error.code === "INVALID_COMMAND" ? 400 : 409, headers: { "cache-control": "no-store" } }) };
});
import { GET, POST } from "./route";
import { POST as UNLINK } from "../duplicate-unlinks/route";
const id = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const route = { params: Promise.resolve({ id: id(1) }) };
const request = (body: unknown, origin = "http://localhost:3000") => new Request("http://localhost:3000/api/contractor", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
const mark = { version: "mark-duplicate.v1", commandId: id(2), duplicateId: id(3), canonicalId: id(4) };
const unlink = { version: "extra-duplicate-unlink.v1", commandId: id(2), linkId: id(5), expectedRevision: 1, reasonCode: "linked_in_error" };
beforeEach(() => { vi.clearAllMocks(); mocks.actor.mockResolvedValue({ pool: "pool", context: "context", actor: { membershipId: id(6) } }); mocks.mark.mockResolvedValue({ linkId: id(5) }); mocks.unlink.mockResolvedValue({ unlinkId: id(7) }); });
it("binds authority to the session and job to the path; no-store on both reads and writes", async () => {
 mocks.read.mockResolvedValue({ groups: [] });
 expect((await GET(request({}), route)).headers.get("cache-control")).toBe("no-store");
 const response = await POST(request(mark), route); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
 expect(mocks.mark).toHaveBeenCalledWith("context", { membershipId: id(6) }, { ...mark, jobId: id(1) });
 await UNLINK(request(unlink), route);
 expect(mocks.unlink).toHaveBeenCalledWith("context", { ...unlink, jobId: id(1), actorMembershipId: id(6) });
});
it("refuses authority fields, job selectors, malformed JSON and untrusted origins before mutation", async () => {
 for (const [handler, body] of [[POST, mark], [UNLINK, unlink]] as const) {
  for (const field of ["tenantId", "actorMembershipId", "role", "serverRecordedAt", "origin", "jobId"]) expect((await handler(request({ ...body, [field]: id(8) }), route)).status).toBe(400);
  expect((await handler(new Request("http://localhost:3000/api/contractor", { method: "POST", headers: { origin: "http://localhost:3000" }, body: "{" }), route)).status).toBe(400);
  expect((await handler(request(body, "https://evil.invalid"), route)).status).toBe(403);
 }
 expect(mocks.mark).not.toHaveBeenCalled(); expect(mocks.unlink).not.toHaveBeenCalled();
});
it("preserves replay bodies and displays repository conflicts and stale/export refusals", async () => {
 for (const code of ["COMMAND_CONFLICT", "STALE_REVISION", "EXTRA_EXPORTED", "UNLINK_FORBIDDEN"]) {
  mocks.unlink.mockRejectedValueOnce({ code }); const r = await UNLINK(request(unlink), route); expect(await r.json()).toEqual({ code });
 }
 const a = await POST(request(mark), route), b = await POST(request(mark), route); expect(await a.json()).toEqual(await b.json());
});
