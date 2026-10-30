import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { SignedEvidenceExportStore, signedEvidenceBundleHash } from "../src/signed-evidence-export-store.js";
import { storeFixture } from "./signed-evidence-export-store-fixture.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

afterEach(() => vi.unstubAllEnvs());
it("refuses cross-tenant storage and non-synthetic recipients before touching a connection", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const f = storeFixture(), connect = vi.fn(), store = new SignedEvidenceExportStore({ connect } as unknown as Pool);
  await expect(store.persist(testTenantContext(randomUUID()), f.actor, f.request)).rejects.toMatchObject({ code: "SIGNED_EXPORT_FORBIDDEN" });
  await expect(store.persist(testTenantContext(f.tenantId), f.actor, { ...f.request, recipient: "real@example.com" })).rejects.toThrow();
  expect(connect).not.toHaveBeenCalled();
});
it("holds outside the synthetic environment and hashes the entire approved signed bundle", async () => {
  vi.stubEnv("JOBGUARD_ENV", "production");
  const f = storeFixture(), store = new SignedEvidenceExportStore({} as Pool);
  await expect(store.persist(testTenantContext(f.tenantId), f.actor, f.request)).rejects.toMatchObject({ code: "SIGNED_EXPORT_MODE_HELD" });
  expect(signedEvidenceBundleHash(f.bundle)).toBe(signedEvidenceBundleHash(structuredClone(f.bundle)));
  expect(signedEvidenceBundleHash({ ...f.bundle, payload: { ...f.bundle.payload, caseId: randomUUID() } })).not.toBe(signedEvidenceBundleHash(f.bundle));
});

it("refuses a request-supplied actor different from the session before touching a connection", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const f = storeFixture(), connect = vi.fn(), store = new SignedEvidenceExportStore({ connect } as unknown as Pool);
  await expect(store.persist(testTenantContext(f.tenantId), f.actor, {
    ...f.request, actorMembershipId: randomUUID(),
  })).rejects.toMatchObject({ code: "SIGNED_EXPORT_FORBIDDEN" });
  expect(connect).not.toHaveBeenCalled();
});

it("checks session user ownership before looking up a stored export", async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const f = storeFixture();
  const query = vi.fn(async () => ({ rows: [], rowCount: 0 })), release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  const store = new SignedEvidenceExportStore({ connect } as unknown as Pool);
  await expect(store.persist(testTenantContext(f.tenantId), f.actor, f.request))
    .rejects.toMatchObject({ code: "SIGNED_EXPORT_FORBIDDEN" });
  expect(query).toHaveBeenCalledWith(expect.stringContaining("identity_user_id=$3"),
    [f.tenantId, f.actor.membershipId, f.actor.identityUserId]);
  expect(query).not.toHaveBeenCalledWith(expect.stringContaining("FROM app.signed_evidence_export"), expect.anything());
  expect(query).toHaveBeenLastCalledWith("ROLLBACK");
  expect(release).toHaveBeenCalledOnce();
});
