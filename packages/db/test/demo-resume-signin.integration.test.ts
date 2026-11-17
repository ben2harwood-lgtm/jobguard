import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { IdentityRepository } from "../src/identity-repository.js";
import { SmallBuilderDemoRepository } from "../src/small-builder-demo-repository.js";
import { PersistedAuthProvider } from "../../../apps/api/src/auth/persisted-auth-provider.js";
import { FixtureIdentityEmail } from "../../../apps/api/src/auth/identity-email.js";
import { IdentityApplication } from "../../../apps/api/src/auth/identity.application.js";
import { SmallBuilderDemoApplication } from "../../../apps/api/src/small-builder-demo.application.js";
import { subscriptionAuthority } from "../../../apps/api/src/subscription.authority.js";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { closeTestPools } from "./pool-test-utils.js";

const origin = "https://jobguard.invalid", code = "12345678";
let c: Cluster, identityPool: Pool;
const provider = () => new PersistedAuthProvider(new IdentityRepository(identityPool),
  "fictional-demo-resume-secret-at-least-32-characters", new FixtureIdentityEmail(),
  "synthetic_demo", Date.now, () => code);
const identity = () => new IdentityApplication(provider(), origin);
type Credentials = { sessionToken: string; csrfToken: string; tenantHeader: string; origin: string };
async function signIn(email: string, purpose: "signup" | "signin" | "invitation", invitationId?: string) {
  const app = identity();
  await app.request({ version: "identity-request.v1", email, purpose, ...(invitationId ? { invitationId } : {}) }, randomUUID(), origin);
  const session = await app.verify({ version: "identity-verify.v1", email, purpose, code, ...(invitationId ? { invitationId } : {}) }, origin);
  const current = await app.session(session.sessionToken);
  return { current, credentials: { ...session, tenantHeader: current.memberships[0]!.tenantId, origin } };
}
const execute = (credentials: Credentials, operation: "create" | "read" | "snapshot" | "report", runId: string | null, input: unknown = {}) =>
  new SmallBuilderDemoApplication(subscriptionAuthority(identity()), new SmallBuilderDemoRepository(c.runtime))
    .execute(credentials, operation, runId, input);

beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  c = await cluster();
  await c.admin.query("ALTER ROLE jobguard_identity LOGIN PASSWORD 'demo-resume-fixture'");
  identityPool = new Pool({ ...c.config, database: "jobguard_synthetic_demo", user: "jobguard_identity", password: "demo-resume-fixture", max: 2 });
}, 240_000);
afterAll(async () => {
  await closeTestPools(identityPool);
  await c?.close();
  vi.unstubAllEnvs();
});

it("resumes only the creator's saved run through fresh entered-code sign-in and current company authority", async () => {
  const email = `${randomUUID()}@practice.invalid`, owner = await signIn(email, "signup");
  const command = { contractVersion: "small-builder-demo.create.v1", commandId: randomUUID(), scenario: "core-1000" };
  const run = await execute(owner.credentials, "create", null, command);
  if (!("runId" in run)) throw new Error("Expected saved run");
  const snapshot = { contractVersion: "small-builder-demo.report-snapshot.v1", commandId: randomUUID(), expectedRunRevision: 1 };
  const report = await execute(owner.credentials, "snapshot", run.runId, snapshot);
  await c.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [owner.current.principal.sessionId]);

  const fresh = await signIn(email, "signin");
  expect(fresh.current.principal.id).toBe(owner.current.principal.id);
  expect(fresh.current.principal.sessionId).not.toBe(owner.current.principal.sessionId);
  expect(fresh.current.memberships).toEqual(owner.current.memberships);
  expect(fresh.credentials.sessionToken).not.toBe(owner.credentials.sessionToken);
  expect(fresh.credentials.csrfToken).not.toBe(owner.credentials.csrfToken);
  expect(await execute(fresh.credentials, "read", run.runId)).toEqual(run);
  expect(await execute(fresh.credentials, "create", null, command)).toEqual(run);
  expect(await execute(fresh.credentials, "snapshot", run.runId, snapshot)).toEqual(report);
  expect(await execute(fresh.credentials, "report", run.runId)).toEqual(report);
  for (const operation of ["read", "report"] as const) {
    await expect(execute(owner.credentials, operation, run.runId)).rejects.toThrow("DEMO_FORBIDDEN");
    await expect(execute({ ...fresh.credentials, csrfToken: owner.credentials.csrfToken }, operation, run.runId)).rejects.toThrow("DEMO_FORBIDDEN");
  }

  const recipient = `${randomUUID()}@practice.invalid`;
  const invitation = await identity().invite({ version: "identity-invitation.v1", requested_tenant_id: fresh.credentials.tenantHeader, email: recipient, role: "admin" }, fresh.credentials);
  const colleague = await signIn(recipient, "invitation", invitation.id);
  expect(colleague.credentials.tenantHeader).toBe(fresh.credentials.tenantHeader);
  const outsider = await signIn(`${randomUUID()}@practice.invalid`, "signup");
  for (const other of [colleague, outsider]) {
    for (const operation of ["read", "report"] as const) {
      await expect(execute(other.credentials, operation, run.runId)).rejects.toThrow("DEMO_NOT_FOUND");
    }
  }
  await expect(execute(colleague.credentials, "create", null, command)).rejects.toThrow("DEMO_COMMAND_CONFLICT");
  await expect(execute({ ...outsider.credentials, tenantHeader: fresh.credentials.tenantHeader }, "read", run.runId)).rejects.toThrow("DEMO_FORBIDDEN");
  expect((await c.admin.query("SELECT count(*)::int n FROM app.small_builder_demo_run WHERE tenant_id=$1", [fresh.credentials.tenantHeader])).rows[0].n).toBe(1);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.small_builder_demo_report WHERE tenant_id=$1", [fresh.credentials.tenantHeader])).rows[0].n).toBe(1);
});
