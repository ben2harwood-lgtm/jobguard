import { createHash } from "node:crypto";
import { materialQuantityV1 } from "@jobguard/core";
import type { Pool } from "pg";
import { z } from "zod";
import { PracticeAccessError } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.uuid().transform(value => value.toLowerCase());
export const measurementQueryV1 = z.strictObject({
  version: z.literal("v2-measurement-query.v1"),
  scopeItemId: uuid.optional(),
});
export const measurementCommandV1 = z.strictObject({
  version: z.literal("v2-measurement-command.v1"),
  scopeItemId: uuid,
  commandId: uuid,
  expectedVersion: z.number().int().min(0).max(2_147_483_646),
  // The shared schema's BigInt check requires a syntactically valid decimal.
  quantity: z.string().max(40).regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/u).pipe(materialQuantityV1),
  unit: z.string().trim().min(1).max(40).refine(unit => !unit.includes("\0")),
  confirmed: z.boolean(),
});

export type MeasurementQuery = z.infer<typeof measurementQueryV1>;
export type MeasurementCommand = z.infer<typeof measurementCommandV1>;
export type Measurement = {
  scopeItemId: string;
  commandId: string;
  expectedVersion: number;
  version: number;
  quantity: string;
  unit: string;
  source: "builder_typed";
  confirmed: boolean;
  actorMembershipId: string;
  recordedAt: Date;
  confirmedByMembershipId: string | null;
  confirmedAt: Date | null;
};

export class MeasurementError extends Error {
  constructor(readonly code: "MEASUREMENT_INVALID_QUERY" | "MEASUREMENT_INVALID_COMMAND" |
    "MEASUREMENT_EDITOR_REQUIRED" | "MEASUREMENT_VERSION_CONFLICT" | "MEASUREMENT_COMMAND_CONFLICT") {
    super(code);
  }
}

const projection = `scope_item_id AS "scopeItemId", command_id AS "commandId",
  expected_version AS "expectedVersion", expected_version + 1 AS version, quantity, unit, source, confirmed,
  actor_membership_id AS "actorMembershipId", recorded_at AS "recordedAt",
  CASE WHEN confirmed THEN actor_membership_id END AS "confirmedByMembershipId",
  CASE WHEN confirmed THEN recorded_at END AS "confirmedAt"`;

export class MeasurementRepository {
  constructor(private readonly pool: Pool) {}

  read(context: VerifiedTenantContext, jobId: string, scopeItemId?: string) {
    return withTenant(this.pool, context, async ({ $client }) => {
      const { rows } = await $client.query<({ version: null } | Measurement) & { itemId: string }>(`
        SELECT s.id AS "itemId", m.*
        FROM app.scope_identity s
        LEFT JOIN LATERAL (
          SELECT ${projection} FROM app.v2_measurement
          WHERE (tenant_id, job_id, scope_item_id) = (s.tenant_id, s.job_id, s.id)
          ORDER BY expected_version DESC LIMIT 1
        ) m ON true
        WHERE (s.tenant_id, s.job_id) = ($1, $2) AND s.state <> 'retired'
          AND ($3::uuid IS NULL OR s.id = $3)
        ORDER BY s.id
      `, [context.tenantId, jobId, scopeItemId ?? null]);
      return rows.map(({ itemId, ...measurement }) => ({
        scopeItemId: itemId,
        version: measurement.version ?? 0,
        measurement: measurement.version === null ? null : measurement,
      }));
    });
  }

  async save(context: VerifiedTenantContext, jobId: string, sessionId: string, input: MeasurementCommand) {
    const parsed = measurementCommandV1.safeParse(input);
    if (!parsed.success) throw new MeasurementError("MEASUREMENT_INVALID_COMMAND");
    const command = parsed.data;
    const key = [context.tenantId, jobId, command.scopeItemId];
    return withTenant(this.pool, context, async ({ $client }) => {
      const digest = createHash("sha256").update(sessionId).digest("hex");
      const { rows: [actor] } = await $client.query<{ id: string | null }>(
        "SELECT app.v2_work_plan_editor($1) AS id", [digest],
      );
      if (!actor?.id) throw new MeasurementError("MEASUREMENT_EDITOR_REQUIRED");

      const { rows: [scope] } = await $client.query<{ version: number }>(`
        SELECT COALESCE((
          SELECT max(expected_version) + 1 FROM app.v2_measurement
          WHERE (tenant_id, job_id, scope_item_id) = ($1, $2, $3)
        ), 0) AS version
        FROM app.scope_identity
        WHERE (tenant_id, job_id, id) = ($1, $2, $3) AND state <> 'retired'
        FOR SHARE
      `, key);
      if (!scope) throw new PracticeAccessError("NOT_FOUND");

      if (scope.version === command.expectedVersion) {
        // Uniqueness arbitrates concurrent edits and exact retries at the same version.
        const { rows: [saved] } = await $client.query<Measurement>(`
          INSERT INTO app.v2_measurement (tenant_id, job_id, scope_item_id, command_id, expected_version,
            quantity, unit, source, confirmed, actor_membership_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'builder_typed',$8,$9)
          ON CONFLICT DO NOTHING RETURNING ${projection}
        `, [...key, command.commandId, command.expectedVersion, command.quantity, command.unit, command.confirmed, actor.id]);
        if (saved) return saved;
      }

      const { rows: [prior] } = await $client.query<Measurement>(`
        SELECT ${projection} FROM app.v2_measurement WHERE (tenant_id, job_id, command_id) = ($1, $2, $3)
      `, [context.tenantId, jobId, command.commandId]);
      if (!prior) throw new MeasurementError("MEASUREMENT_VERSION_CONFLICT");
      if (prior.actorMembershipId !== actor.id || prior.scopeItemId !== command.scopeItemId ||
        prior.expectedVersion !== command.expectedVersion || prior.quantity !== command.quantity ||
        prior.unit !== command.unit || prior.confirmed !== command.confirmed) {
        throw new MeasurementError("MEASUREMENT_COMMAND_CONFLICT");
      }
      return prior;
    });
  }
}
