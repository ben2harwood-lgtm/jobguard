import { z } from "zod";
import type { TenantTransaction } from "./tenant-context.js";

const commercialOutboundModeV1Schema = z.enum(["enabled", "paused"]);

/** Deployment-only override. No command, body, queue payload or callback can resume claims. */
export async function commercialOutboundClaimsEnabled(db: TenantTransaction): Promise<boolean> {
  const mode = commercialOutboundModeV1Schema.safeParse(process.env.JOBGUARD_COMMERCIAL_OUTBOUND ?? "enabled");
  if (!mode.success) throw new Error("INVALID_COMMERCIAL_OUTBOUND_MODE");
  if (mode.data === "paused") return false;
  const result = await db.$client.query<{ enabled: boolean }>(
    "SELECT outbound_control.claims_enabled() AS enabled",
  );
  return result.rows[0]?.enabled === true;
}
