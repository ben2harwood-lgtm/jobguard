import { afterEach, expect, it, vi } from "vitest";
import type { IdentityRepository } from "@jobguard/db";
import { pilotApprovalFixture, unavailablePilotApproval, unavailablePilotApprovals } from "@jobguard/config/test/pilot-approval";
import { customerActions, CustomerRefused, CustomerSigninApplication } from "./customer-signin.js";
import { IdentityApplication } from "./identity.application.js";
import { PersistedAuthProvider } from "./persisted-auth-provider.js";

const origin = "https://boundary.invalid";
const email = "fictional@boundary.invalid";
function identity() {
  const query = vi.fn();
  const transaction = vi.fn();
  const repository = { pool: { query }, transaction } as unknown as IdentityRepository;
  const provider = new PersistedAuthProvider(repository, "fictional isolated identity test key", undefined, "pilot_no_charge");
  return { provider, app: new IdentityApplication(provider, origin), query, transaction };
}

afterEach(() => vi.unstubAllEnvs());

it.each(unavailablePilotApprovals)("refuses builder and customer identity operations before storage when G1 evidence is %s", async (_name, value) => {
  for (const [key, input] of Object.entries(unavailablePilotApproval(value))) vi.stubEnv(key, input);
  const { provider, app, query, transaction } = identity();
  for (const purpose of ["signin", "invitation"] as const) {
    await expect(provider.requestCode({ email, purpose, ip: "fixture" })).rejects.toThrow("PILOT_G1_CLOSED");
    await expect(provider.verifyCode(email, purpose, "12345678")).rejects.toThrow("PILOT_G1_CLOSED");
  }
  await expect(app.invite({
    version: "identity-invitation.v1", requested_tenant_id: "10000000-0000-4000-8000-000000000001", email, role: "operative",
  }, { origin, sessionToken: "s".repeat(43), csrfToken: "c".repeat(32) })).rejects.toThrow("PILOT_G1_CLOSED");
  await expect(provider.authenticate("s".repeat(43))).resolves.toBeUndefined();

  const customer = new CustomerSigninApplication(app, "pilot_no_charge");
  for (const action of customerActions) {
    await expect(customer.run(action, {}, { headers: { origin } })).rejects.toBeInstanceOf(CustomerRefused);
  }
  expect(query).not.toHaveBeenCalled();
  expect(transaction).not.toHaveBeenCalled();
});

it("keeps fictional email routing and the practice portal unavailable after G1 opens", async () => {
  for (const [key, value] of Object.entries(pilotApprovalFixture().env)) vi.stubEnv(key, value);
  const { provider, app, transaction, query } = identity();
  await expect(provider.requestCode({ email, purpose: "signin", ip: "fixture" })).rejects.toThrow("D04");
  await expect(new CustomerSigninApplication(app, "pilot_no_charge").run("signin", {}, { headers: { origin } })).rejects.toBeInstanceOf(CustomerRefused);
  expect(transaction).not.toHaveBeenCalled();
  expect(query).not.toHaveBeenCalled();
});
