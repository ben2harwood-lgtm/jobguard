import { z } from "zod";
import { withTenant } from "@jobguard/db";
import type { Pool } from "pg";
import type { IdentityApplication } from "../auth/identity.application.js";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "../auth/principal-bridge.js";
import { ConnectorInputError } from "./inbound.js";
const fixture = z.string().regex(/^fixture:[a-z0-9_-]{1,112}$(?![\s\S])/u);
const caps = z.array(z.enum(["work_order", "billing_status", "materials_issue"])).min(1).max(3);
const version = z.literal("connector-machine-command.v1");
export const machineCommandV1 = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("provision"), version, clientContract: fixture, namespace: fixture,
    tokenHash: z.string().regex(/^[a-f0-9]{64}$(?![\s\S])/u), keyRef: fixture, expiresAt: z.iso.datetime(), capabilities: caps }).strict(),
  z.object({ operation: z.literal("widen"), version, capabilities: caps }).strict(),
  z.object({ operation: z.literal("rotate"), version, keyRef: fixture }).strict(),
  z.object({ operation: z.literal("revoke"), version }).strict(),
  z.object({ operation: z.literal("disconnect"), version }).strict(),
]);
/** Human management always enters the normal membership bridge; SQL rechecks owner.
 * No runtime composition or activation route is installed by this dark slice. */
export class FictionalMachineManagement {
  constructor(private readonly identity: IdentityApplication, private readonly pool: Pool) {}
  async command(credentials: TenantRequestCredentials, commandId: string, connectionId: string, raw: unknown) {
    try {
      if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new ConnectorInputError();
      const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
      const { operation, ...input } = machineCommandV1.parse(raw);
      z.guid().parse(commandId); z.guid().parse(connectionId);
      const digest = this.identity.provider.digest(`session:${credentials.sessionToken}`);
      return await withTenant(this.pool, context, async db => (await db.$client.query(
        "SELECT app.connector_machine_command($1,$2,$3,$4,$5,$6::jsonb) value",
        [context.tenantId, digest, commandId, connectionId, operation, JSON.stringify(input)],
      )).rows[0]?.value);
    } catch { throw new ConnectorInputError(); }
  }
}
