import { describe, expect, it, vi } from "vitest";
import { SubscriptionApplication, subscriptionFailure } from "./subscription.application.js";
const command = { version: "subscription-command.v1", kind: "onboarding", usualPlaces: 8, siteStaffLogExtras: false };
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function fixture(environment = "synthetic_demo") {
 const repository = { command: vi.fn().mockResolvedValue({ hypothetical: true }), read: vi.fn().mockResolvedValue({ hypothetical: true }) };
 const credentials = { sessionToken: "s".repeat(32), requestedTenantId: id, csrfToken: "c".repeat(24), origin: "https://jobguard.invalid" };
 const provider = { authenticate: vi.fn().mockResolvedValue({ identityUserId: id, sessionId: id, csrfToken: "c".repeat(24) }), findMembership: vi.fn().mockResolvedValue({ id, identityUserId: id, tenantId: id, role: "owner", email: "owner@example.invalid" }) };
 const authority = { provider, allowedOrigin: credentials.origin, environment: () => environment, resolve: vi.fn().mockResolvedValue({ credentials, digest: "a".repeat(64) }) };
 return { repository, authority, app: new SubscriptionApplication(authority as never, repository as never) };
}
describe("subscription application", () => {
 it("server resolves current authority for every call", async () => {
  const f=fixture(); await f.app.command("session",id,command); await f.app.read("session");
  expect(f.authority.resolve).toHaveBeenCalledTimes(2);
  expect(f.authority.provider.authenticate).toHaveBeenCalledTimes(2);
  expect(f.authority.provider.findMembership).toHaveBeenCalledTimes(2);
  f.authority.resolve.mockRejectedValue(new Error("revoked foreign tenant"));
  await expect(f.app.command("session",id,command)).rejects.toThrow("SUBSCRIPTION_UNAVAILABLE");
  expect(f.repository.command).toHaveBeenCalledTimes(1);
 });
 it("client facts cannot authorize a subscription", async () => {
  const f=fixture();
  for(const extra of [{tenantId:id},{actor:id},{executor:true},{price:0}]) await expect(f.app.command("session",id,{...command,...extra})).rejects.toThrow("INVALID_SUBSCRIPTION_INPUT");
  expect(f.repository.command).not.toHaveBeenCalled();
 });
 it("non-synthetic execution refuses", async () => {
  const f=fixture("production"); await expect(f.app.command("session",id,command)).rejects.toThrow("SUBSCRIPTION_SYNTHETIC_ONLY");
  expect(f.repository.command).not.toHaveBeenCalled();
 });
 it("typed failures disclose no foreign company facts", () => {
  expect(subscriptionFailure(new Error("foreign company secret"))).toEqual({version:"subscription-error.v1",code:"SUBSCRIPTION_UNAVAILABLE"});
 });
});
