import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.uuid().transform(value => value.toLowerCase());
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

/**
 * V2-F8: the builder taps one person (a crew record of the firm, or "Me") as on site
 * for one job and day. No location, IP address, device or user agent is accepted or kept.
 */
export const siteAttendanceCommandV1 = z.strictObject({
  version: z.literal("v2-site-attendance-command.v1"),
  commandId: uuid,
  day,
  person: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("crew"), crewId: uuid }),
    z.strictObject({ kind: z.literal("builder") }),
  ]),
  expectedVersion: z.number().int().min(0).max(2_147_483_646),
  onSite: z.boolean(),
  note: z.string().trim().min(1).max(500).nullable().optional(),
});
export const siteAttendanceQueryV1 = z.strictObject({ version: z.literal("v2-site-attendance-query.v1") });

export type SiteAttendanceCommand = z.infer<typeof siteAttendanceCommandV1>;
export type SiteAttendanceRecord = {
  day: string; personKind: "crew" | "builder"; personRef: string; crewId: string | null; revision: number;
  onSite: boolean; note: string | null; tappedByMembershipId: string; recordedAt: Date;
};
export type SiteAttendanceView = {
  version: "v2-site-attendance.v1"; today: string; days: string[]; me: string; records: SiteAttendanceRecord[];
};

export class SiteAttendanceError extends Error {
  constructor(readonly code: "SITE_ATTENDANCE_INVALID" | "SITE_ATTENDANCE_VERSION_CONFLICT" |
    "SITE_ATTENDANCE_COMMAND_CONFLICT" | "SITE_ATTENDANCE_EDITOR_REQUIRED" | "SITE_ATTENDANCE_DAY_OUT_OF_RANGE" |
    "CREW_CONTACT_UNAVAILABLE") {
    super(code);
  }
}

const columns = `day::text AS day, person_kind AS "personKind", person_ref AS "personRef", crew_id AS "crewId",
  revision, on_site AS "onSite", note, tapped_by_membership_id AS "tappedByMembershipId", recorded_at AS "recordedAt"`;

export class SiteAttendanceRepository {
  constructor(private readonly pool: Pool) {}

  /** The current revision of each person's tap on this job for today and the six days before it. */
  async list(context: VerifiedTenantContext, jobId: string, sessionId: string): Promise<SiteAttendanceView> {
    return withTenant(this.pool, context, async ({ $client: client }) => {
      const me = await this.editor(client, sessionId);
      // The site day is Europe/London's, matching the guard in migration 2016.
      const { rows: [window] } = await client.query<{ today: string; days: string[] }>(`
        WITH w AS (SELECT (clock_timestamp() AT TIME ZONE 'Europe/London')::date AS today)
        SELECT w.today::text AS today, array(SELECT (w.today - n)::text FROM generate_series(0, 6) n ORDER BY n) AS days
        FROM w`);
      const { today, days } = window!;
      const { rows } = await client.query<SiteAttendanceRecord>(`
        SELECT DISTINCT ON (day, person_kind, person_ref) ${columns} FROM app.v2_site_attendance
        WHERE job_id = $1 AND day BETWEEN $2::date - 6 AND $2::date
        ORDER BY day, person_kind, person_ref, revision DESC`, [jobId, today]);
      return { version: "v2-site-attendance.v1", today, days, me, records: rows };
    });
  }

  async record(context: VerifiedTenantContext, jobId: string, sessionId: string,
    input: SiteAttendanceCommand): Promise<SiteAttendanceRecord> {
    const parsed = siteAttendanceCommandV1.safeParse(input);
    if (!parsed.success) throw new SiteAttendanceError("SITE_ATTENDANCE_INVALID");
    const command = { ...parsed.data, note: parsed.data.note ?? null };
    return withTenant(this.pool, context, async database => {
      const { $client: client } = database;
      const editor = await this.editor(client, sessionId);
      const crewId = command.person.kind === "crew" ? command.person.crewId : null;
      const personRef = crewId ?? editor;

      // Serialise uses of one command id first (on any job), then taps for one person on one job
      // and day, so a reused id and a race each resolve to one saved tap.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('v2_site_attendance_command:' || $1))", [command.commandId]);
      // Serialise taps for one person on one job and day, so a race resolves to one revision.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('v2_site_attendance:' || $1))",
        [`${jobId}:${command.day}:${command.person.kind}:${personRef}`]);
      const receipt = await this.replay(client, jobId, editor, command, crewId);
      if (receipt) return receipt;
      const { rows: [head] } = await client.query<{ revision: number | null }>(`
        SELECT max(revision) AS revision FROM app.v2_site_attendance
        WHERE job_id = $1 AND day = $2::date AND person_kind = $3 AND person_ref = $4`,
      [jobId, command.day, command.person.kind, personRef]);
      if ((head?.revision ?? 0) !== command.expectedVersion) throw new SiteAttendanceError("SITE_ATTENDANCE_VERSION_CONFLICT");

      const saved = await client.query<SiteAttendanceRecord>(`
        INSERT INTO app.v2_site_attendance (tenant_id, job_id, day, person_kind, crew_id, builder_membership_id,
          revision, expected_version, command_id, on_site, note, tapped_by_membership_id)
        VALUES ($1, $2, $3::date, $4, $5, $6, $7::int + 1, $7::int, $8, $9, $10, $11)
        RETURNING ${columns}`, [context.tenantId, jobId, command.day, command.person.kind, crewId,
        command.person.kind === "builder" ? editor : null, command.expectedVersion, command.commandId,
        command.onSite, command.note, editor])
        .catch((error: { code?: string; message?: string }) => {
          if (error.message === "CREW_CONTACT_UNAVAILABLE") throw new SiteAttendanceError("CREW_CONTACT_UNAVAILABLE");
          if (error.message === "SITE_ATTENDANCE_DAY_OUT_OF_RANGE") throw new SiteAttendanceError("SITE_ATTENDANCE_DAY_OUT_OF_RANGE");
          if (error.code === "22007" || error.code === "22008") throw new SiteAttendanceError("SITE_ATTENDANCE_INVALID");
          // A concurrent first tap, or a command id reused for another person, is refused as stale.
          if (error.code === "23505") throw new SiteAttendanceError("SITE_ATTENDANCE_VERSION_CONFLICT");
          throw error;
        });
      const record = saved.rows[0]!;
      // A replay returned above, so each recorded tap appends exactly one event in this transaction.
      await this.audit(database, editor, jobId, command, record);
      return record;
    });
  }

  // The signed-in person's membership, resolved from their verified credential and bound firm.
  private async editor(client: PoolClient, sessionId: string) {
    const digest = createHash("sha256").update(sessionId).digest("hex");
    const { rows: [editor] } = await client.query<{ id: string | null }>("SELECT app.v2_work_plan_editor($1) AS id", [digest]);
    if (!editor?.id) throw new SiteAttendanceError("SITE_ATTENDANCE_EDITOR_REQUIRED");
    return editor.id;
  }

  private audit(database: TenantTransaction, actor: string, jobId: string,
    command: SiteAttendanceCommand & { note: string | null }, record: SiteAttendanceRecord) {
    return appendAuditBatch(database, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`,
      eventType: "v2.site_attendance.recorded", subjectType: "job", subjectRef: jobId,
      payload: {
        references: { commandId: command.commandId, jobId, day: record.day, personKind: record.personKind,
          personRef: record.personRef, expectedVersion: String(command.expectedVersion), revision: String(record.revision),
          onSite: String(record.onSite) },
        // The note stays out of the payload; only its digest is kept.
        ...(command.note !== null && { hashes: { note: createHash("sha256").update(command.note).digest("hex") } }),
        classifications: { action: "operational" },
      } }]);
  }

  private async replay(client: PoolClient, jobId: string, actor: string,
    command: SiteAttendanceCommand & { note: string | null }, crewId: string | null) {
    const { rows: [receipt] } = await client.query<SiteAttendanceRecord & { matches: boolean }>(`
      SELECT ${columns}, (job_id, day, person_kind, crew_id, expected_version, on_site, note, tapped_by_membership_id)
        IS NOT DISTINCT FROM ($2::uuid, $3::date, $4::text, $5::uuid, $6::int, $7::boolean, $8::text, $9::uuid) AS matches
      FROM app.v2_site_attendance WHERE command_id = $1
    `, [command.commandId, jobId, command.day, command.person.kind, crewId, command.expectedVersion, command.onSite,
      command.note, actor]).catch((error: { code?: string }) => {
      if (error.code === "22007" || error.code === "22008") throw new SiteAttendanceError("SITE_ATTENDANCE_INVALID");
      throw error;
    });
    if (!receipt) return null;
    const { matches, ...saved } = receipt;
    if (!matches) throw new SiteAttendanceError("SITE_ATTENDANCE_COMMAND_CONFLICT");
    return saved;
  }
}
