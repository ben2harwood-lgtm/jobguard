import { afterAll, beforeAll, expect, it } from "vitest";
import { Pool } from "pg";
import { startLp0Database, type Lp0Database } from "./lp-0-catalog.js";
import { checkPreflightDatabase } from "./deployment-preflight-checks.js";
// @ts-expect-error Local Node tool is intentionally JavaScript; Vitest resolves its imports.
import { requireLocalDatabase } from "../../../tools/deployment-preflight.mjs";

const A = "10000000-0000-4000-8000-000000000001";
const B = "20000000-0000-4000-8000-000000000002";
let disposable: Lp0Database | undefined;
let pool: Pool;
let tenantA = A, tenantB = B;
beforeAll(async () => {
  const supplied = process.env.PREFLIGHT_DATABASE_URL;
  if (supplied) {
    // Recheck even when invoked directly instead of through the CLI.
    const url = requireLocalDatabase(supplied);
    tenantA = process.env.PREFLIGHT_TENANT_A ?? "";
    tenantB = process.env.PREFLIGHT_TENANT_B ?? "";
    pool = new Pool({ connectionString: url, max: 1 });
  } else {
    disposable = await startLp0Database(59300);
    await disposable.admin.query(`INSERT INTO control_plane.tenant(id) VALUES($1),($2)`, [A, B]);
    await disposable.admin.query(`INSERT INTO app.account(id,tenant_id,name) VALUES($1,$1,'Fictional A'),($2,$2,'Fictional B')`, [A, B]);
    await disposable.bootstrapRuntimeLogin();
    pool = new Pool({ host: "127.0.0.1", port: disposable.port, database: disposable.databaseName,
      user: "jobguard_runtime", password: "synthetic-lp0-runtime-only", max: 1 });
  }
}, 300_000);
afterAll(async () => { await pool?.end(); await disposable?.stop(); });
it("passes supplied local database catalog and isolation checks only as the runtime role", async () => {
  const client = await pool.connect();
  try { await checkPreflightDatabase(client, tenantA, tenantB); }
  finally { client.release(); }
});
if (!process.env.PREFLIGHT_DATABASE_URL) it("refuses an owner before catalog/isolation checks", async () => {
  // A supplied target is tested with its one credential; no owner credential accepted.
  if (!disposable) throw new Error("DISPOSABLE_FIXTURE_REQUIRED");
  const client = await disposable.admin.connect();
  try { await expect(checkPreflightDatabase(client, A, B)).rejects.toThrow("PREFLIGHT_RUNTIME_ROLE_REQUIRED"); }
  finally { client.release(); }
});
it("refuses an empty fixture tenant rather than passing vacuously", async () => {
  const client = await pool.connect();
  try { await expect(checkPreflightDatabase(client, tenantA, "30000000-0000-4000-8000-000000000003")).rejects.toThrow("PREFLIGHT_FIXTURE_ACCOUNT_REQUIRED"); }
  finally { client.release(); }
});
