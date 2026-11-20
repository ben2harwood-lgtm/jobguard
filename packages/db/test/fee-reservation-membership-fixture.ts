import type { Pool } from "pg";
import { id } from "../../../apps/api/src/fee-collection/test-fixture.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const membershipId = id(2), userId = id(80);

export function feeFixtureContext(tenantId: string) {
  return testTenantContext(tenantId, { membershipId });
}

export async function seedFeeFixtureTenant(admin: Pool, tenantId: string) {
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenantId]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING", [userId]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$1,'Fictional fee reservation firm')", [tenantId]);
  await admin.query(
    "INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$2,$3,'owner')",
    [membershipId, tenantId, userId],
  );
}
