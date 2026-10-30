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
  await expect(store.persist(testTenantContext(randomUUID()), f.request)).rejects.toMatchObject({ code: "SIGNED_EXPORT_FORBIDDEN" });
  await expect(store.persist(testTenantContext(f.tenantId), { ...f.request, recipient: "real@example.com" })).rejects.toThrow();
  expect(connect).not.toHaveBeenCalled();
});
it("holds outside the synthetic environment and hashes the entire approved signed bundle", async () => {
  vi.stubEnv("JOBGUARD_ENV", "production");
  const f = storeFixture(), store = new SignedEvidenceExportStore({} as Pool);
  await expect(store.persist(testTenantContext(f.tenantId), f.request)).rejects.toMatchObject({ code: "SIGNED_EXPORT_MODE_HELD" });
  expect(signedEvidenceBundleHash(f.bundle)).toBe(signedEvidenceBundleHash(structuredClone(f.bundle)));
  expect(signedEvidenceBundleHash({ ...f.bundle, payload: { ...f.bundle.payload, caseId: randomUUID() } })).not.toBe(signedEvidenceBundleHash(f.bundle));
});
