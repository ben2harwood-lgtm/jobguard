import { createHmac, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { beforeEach, expect, it, vi } from "vitest";
const ports = vi.hoisted(() => ({ job: vi.fn(), issue: vi.fn(), hold: vi.fn(), state: vi.fn(), inputs: vi.fn() }));
vi.mock("./practice-access.js", () => ({ PracticeAccess: class { job = ports.job; } }));
vi.mock("@jobguard/db", async () => ({ customerSigninLink: (await import(new URL("../../../packages/db/src/outbox.ts", import.meta.url).href)).customerSigninLink, ShadowDemoGuideRepository: class { issueCustomerLink = ports.issue; requestSourceHold = ports.hold; sourceHoldState = ports.state; reviewInputs = ports.inputs; } }));
import { customerSigninLink } from "@jobguard/db";
import { ShadowDemoGuideApplication, shadowDemoGuideFailure } from "./shadow-demo-guide.application.js";
const tenantId = randomUUID(), jobId = randomUUID(), customerId = randomUUID(), context = { tenantId };
const app = (environment = "synthetic_demo") => new ShadowDemoGuideApplication({} as Pool, randomUUID(), environment);
const command = { version: "shadow-guide-customer-link.v1", customerId };
beforeEach(() => { vi.clearAllMocks(); ports.job.mockResolvedValue({ context, digest: "a".repeat(64) }); });
it.each(["production", "staging", undefined])("%s refuses every helper before authority or any write", async environment => {
 const refused = new ShadowDemoGuideApplication({} as Pool, randomUUID(), environment as string);
 for (const call of [() => refused.requestSourceHold(jobId), () => refused.sourceHoldState(jobId), () => refused.reviewInputs(jobId), () => refused.issueCustomerLink(jobId, command, value => value)]) await expect(call()).rejects.toMatchObject({ code: "SYNTHETIC_MODE_REQUIRED" });
 expect(ports.job).not.toHaveBeenCalled(); for (const port of [ports.issue, ports.hold, ports.state, ports.inputs]) expect(port).not.toHaveBeenCalled();
});
it("a job outside this practice session stops before the helper runs", async () => {
 ports.job.mockRejectedValue(new Error("NOT_FOUND"));
 await expect(app().reviewInputs(jobId)).rejects.toThrow("NOT_FOUND"); expect(ports.inputs).not.toHaveBeenCalled();
});
it("the link binds the job and customer, stores only the digest of its secret, and refuses other fields", async () => {
 const digests: string[] = [];
 const issued = await app().issueCustomerLink(jobId, command, value => { digests.push(value); return "b".repeat(64); });
 const secret = issued.path.split("/").at(-1)!;
 expect(issued.path).toBe(`/customer/sign-in#${tenantId}/${jobId}/${customerId}/${secret}`); expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/u);
 const reference = ports.issue.mock.calls[0]![5];
 expect(digests).toEqual([`customer-delivery:${reference}`, `customer-link:${secret}`]);
 expect(ports.issue).toHaveBeenCalledWith(context, jobId, customerId, "a".repeat(64), "b".repeat(64), reference);
 ports.issue.mockClear();
 for (const raw of [{}, { ...command, tenantId }, { ...command, recipient: "someone@example.invalid" }, { version: "shadow-guide-customer-link.v1", customerId: "x" }]) await expect(app().issueCustomerLink(jobId, raw, value => value)).rejects.toMatchObject({ code: "INVALID_SHADOW_GUIDE_COMMAND" });
 expect(ports.issue).not.toHaveBeenCalled();
});
it("failures use a closed list and never carry SQL detail", () => {
 expect(shadowDemoGuideFailure(new Error("DEMO_SOURCE_HOLD_LOCKED"))).toEqual({ status: 409, code: "DEMO_SOURCE_HOLD_LOCKED" });
 expect(shadowDemoGuideFailure(Object.assign(new Error("CUSTOMER_LINK_RATE_LIMITED"), { code: "P0001" }))).toEqual({ status: 409, code: "CUSTOMER_LINK_RATE_LIMITED" });
 expect(shadowDemoGuideFailure(new Error("relation app.secret does not exist"))).toEqual({ status: 503, code: "SHADOW_GUIDE_UNAVAILABLE" });
});

it("the worker rebuilds the page link from the reference and matches the grant token digest", async () => {
 const digest = (value: string) => createHmac("sha256", "fictional-demo-signin-key").update(value).digest("hex");
 const issued = await app().issueCustomerLink(jobId, command, digest);
 const [, , , , tokenDigest, reference] = ports.issue.mock.calls[0]!;
 expect(reference).toMatch(new RegExp(`^customer-signin-reference\\.v1:${tenantId}/${jobId}/${customerId}/[A-Za-z0-9_-]{43}$`));
 const delivered = customerSigninLink(reference, digest);
 expect(delivered).toBe(issued.path);
 expect(digest(`customer-link:${delivered.split("/").at(-1)!}`)).toBe(tokenDigest);
 expect(reference).not.toContain(issued.path.split("/").at(-1)!);
});
