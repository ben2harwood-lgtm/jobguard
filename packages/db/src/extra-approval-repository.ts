import { z } from "zod";
import type { TenantTransaction } from "./tenant-context.js";
import { ExtraSourceError } from "./extra-evidence-pack-sources.js";
const queryV1 = z.object({ version: z.literal("extra-binding-query.v1"), jobId: z.guid({ error: "Invalid uuid" }), extraId: z.guid({ error: "Invalid uuid" }), bindingId: z.guid({ error: "Invalid uuid" }) }).strict();

/** Internal source-binding read only. No command writer, submission or authoritative approval projection. */
export async function loadExtraApprovalBinding(db: TenantTransaction, raw: unknown): Promise<string> {
  const parsed = queryV1.safeParse(raw);
  if (!parsed.success) throw new ExtraSourceError("EXTRA_SOURCE_INVALID");
  const schema = (await db.$client.query<{ present: boolean }>("SELECT to_regclass('app.extra_approval_revision_binding') IS NOT NULL present")).rows[0];
  if (!schema?.present) throw new ExtraSourceError("EXTRA_PACK_MIGRATION_REQUIRED");
  const input = parsed.data;
  const row = (await db.$client.query<{ content: string }>(`SELECT row_to_json(t)::text content FROM (SELECT tenant_id,id,job_id,variation_id,binding_version,logical_revision,source_kind,source_revision_id,source_hash,predecessor_binding_id,command_id,actor_membership_id,server_recorded_at,binding_hash
    FROM app.extra_approval_revision_binding WHERE tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid AND job_id=$1 AND variation_id=$2 AND id=$3) t`, [input.jobId, input.extraId, input.bindingId])).rows[0];
  if (!row) throw new ExtraSourceError("EXTRA_SOURCE_NOT_FOUND");
  return row.content;
}
