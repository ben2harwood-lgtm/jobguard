import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { PracticeAccessError } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.uuid().transform(value => value.toLowerCase());
const instant = z.iso.datetime({ offset: true }).transform(value => new Date(value));
const label = (max: number) => z.string().trim().min(1).max(max).refine(text => !text.includes("\0"));
const expectedVersion = z.number().int().min(0).max(2_147_483_646);

export const walkQueryV1 = z.strictObject({
  version: z.literal("v2-walk-query.v1"),
  sessionId: uuid.optional(),
});
export const walkSessionCommandV1 = z.strictObject({
  version: z.literal("v2-walk-session-command.v1"),
  sessionId: uuid,
  deviceStartedAt: instant,
});
const entryBody = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("room"), room: label(80) }),
  z.strictObject({ kind: z.literal("note"), text: label(4000) }),
  z.strictObject({
    kind: z.literal("measurement"),
    // Same decimal rule as the d1 measurement record, which this feeds later.
    quantity: z.string().max(40).regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/u).refine(value => /[1-9]/u.test(value)),
    unit: label(40),
    text: label(4000).optional(),
  }),
  z.strictObject({ kind: z.literal("photo"), photoId: uuid, text: label(4000).optional() }),
]);
export const walkEntryCommandV1 = z.strictObject({
  version: z.literal("v2-walk-entry-command.v1"),
  sessionId: uuid,
  commandId: uuid,
  // The phone numbers entries in the order it captured them, from 1.
  captureOrder: z.number().int().min(1).max(100_000),
  expectedVersion,
  // The phone's own claim. Never used to choose a room.
  deviceCapturedAt: instant,
  entry: entryBody,
});

export type WalkQuery = z.input<typeof walkQueryV1>;
export type WalkSessionCommand = z.input<typeof walkSessionCommandV1>;
export type WalkEntryCommand = z.input<typeof walkEntryCommandV1>;
type ParsedEntryCommand = z.output<typeof walkEntryCommandV1>;

/** A device time this far from the server's receipt time is flagged. */
export const WALK_CLOCK_TOLERANCE_SECONDS = 300;

export type WalkSession = {
  sessionId: string;
  actorMembershipId: string;
  deviceStartedAt: Date;
  serverReceivedAt: Date;
};

export type WalkEntryRevision = {
  sessionId: string;
  captureOrder: number;
  commandId: string;
  expectedVersion: number;
  version: number;
  kind: "room" | "note" | "measurement" | "photo";
  room: string | null;
  text: string | null;
  quantity: string | null;
  unit: string | null;
  photoId: string | null;
  deviceCapturedAt: Date;
  serverReceivedAt: Date;
  actorMembershipId: string;
};

export type WalkEntryView = WalkEntryRevision & {
  /** The room entry this one is filed under, by capture order only. */
  roomCaptureOrder: number | null;
  linkedRoom: string | null;
  /** linked: filed under a room; no_room: nothing before it names one;
   * waiting: an earlier numbered entry has not arrived, so the room may still change. */
  link: "room" | "linked" | "no_room" | "waiting";
  clock: { differenceSeconds: number; flagged: boolean };
  /** Final verification of the photo's bytes, read live from the evidence upload with the same ID
   * on the same job. Never copied here. "not_uploaded" until such an upload exists. */
  photo: { state: "not_uploaded" | "pending" | "quarantined" | "verified" | "rejected"; verifiedAt: Date | null } | null;
};

export class WalkError extends Error {
  constructor(readonly code: "WALK_INVALID_QUERY" | "WALK_INVALID_COMMAND" | "WALK_EDITOR_REQUIRED" |
    "WALK_SESSION_CONFLICT" | "WALK_VERSION_CONFLICT" | "WALK_COMMAND_CONFLICT" | "WALK_PHOTO_REFUSED" |
    "WALK_PHOTO_ALREADY_FILED" | "WALK_ENTRY_KIND_FIXED") {
    super(code);
  }
}

const sessionProjection = `id AS "sessionId", actor_membership_id AS "actorMembershipId",
  device_started_at AS "deviceStartedAt", server_received_at AS "serverReceivedAt"`;
const entryProjection = `session_id AS "sessionId", capture_order AS "captureOrder", command_id AS "commandId",
  expected_version AS "expectedVersion", expected_version + 1 AS version, kind, room_label AS room,
  note_text AS text, quantity, unit, photo_id AS "photoId",
  device_captured_at AS "deviceCapturedAt", server_received_at AS "serverReceivedAt",
  actor_membership_id AS "actorMembershipId"`;

function fields(command: ParsedEntryCommand) {
  const { entry } = command;
  return {
    kind: entry.kind,
    room: entry.kind === "room" ? entry.room : null,
    text: entry.kind === "room" ? null : entry.text ?? null,
    quantity: entry.kind === "measurement" ? entry.quantity : null,
    unit: entry.kind === "measurement" ? entry.unit : null,
    photoId: entry.kind === "photo" ? entry.photoId : null,
  };
}

/** Files each entry under the room active when it was captured, using capture order alone. */
export function foldWalkEntries(
  latest: (WalkEntryRevision & { photoState: string | null; photoVerifiedAt: Date | null })[],
): WalkEntryView[] {
  const ordered = [...latest].sort((a, b) => a.captureOrder - b.captureOrder);
  let room: WalkEntryRevision | null = null;
  let expected = 1;
  let gap = false;
  return ordered.map(({ photoState, photoVerifiedAt, ...entry }) => {
    if (entry.captureOrder !== expected) gap = true;
    expected = entry.captureOrder + 1;
    const differenceSeconds = Math.round((entry.serverReceivedAt.getTime() - entry.deviceCapturedAt.getTime()) / 1000);
    const view: WalkEntryView = {
      ...entry,
      roomCaptureOrder: entry.kind === "room" ? entry.captureOrder : room?.captureOrder ?? null,
      linkedRoom: entry.kind === "room" ? entry.room : room?.room ?? null,
      link: entry.kind === "room" ? "room" : gap ? "waiting" : room ? "linked" : "no_room",
      clock: { differenceSeconds, flagged: Math.abs(differenceSeconds) > WALK_CLOCK_TOLERANCE_SECONDS },
      photo: entry.kind === "photo"
        ? { state: (photoState ?? "not_uploaded") as NonNullable<WalkEntryView["photo"]>["state"],
          verifiedAt: photoState === "verified" ? photoVerifiedAt : null }
        : null,
    };
    if (entry.kind === "room") room = entry;
    return view;
  });
}

export class WalkRepository {
  constructor(private readonly pool: Pool) {}

  read(context: VerifiedTenantContext, jobId: string, sessionId?: string) {
    return withTenant(this.pool, context, async ({ $client }) => {
      const { rows: sessions } = await $client.query<WalkSession>(`
        SELECT ${sessionProjection} FROM app.v2_walk_session
        WHERE (tenant_id, job_id) = ($1, $2) AND ($3::uuid IS NULL OR id = $3)
        ORDER BY server_received_at, id
      `, [context.tenantId, jobId, sessionId ?? null]);
      const { rows: entries } = await $client.query<WalkEntryRevision & { photoState: string | null; photoVerifiedAt: Date | null }>(`
        SELECT e.*, u.state AS "photoState", u.server_verified_at AS "photoVerifiedAt"
        FROM (
          SELECT DISTINCT ON (session_id, capture_order) ${entryProjection}
          FROM app.v2_walk_entry
          WHERE (tenant_id, job_id) = ($1, $2) AND ($3::uuid IS NULL OR session_id = $3)
          ORDER BY session_id, capture_order, expected_version DESC
        ) e
        LEFT JOIN app.evidence_upload u ON (u.tenant_id, u.id, u.job_id) = ($1, e."photoId", $2)
      `, [context.tenantId, jobId, sessionId ?? null]);
      return sessions.map(session => ({
        ...session,
        entries: foldWalkEntries(entries.filter(entry => entry.sessionId === session.sessionId)),
      }));
    });
  }

  async startSession(context: VerifiedTenantContext, jobId: string, credential: string, input: WalkSessionCommand) {
    const parsed = walkSessionCommandV1.safeParse(input);
    if (!parsed.success) throw new WalkError("WALK_INVALID_COMMAND");
    const command = parsed.data;
    return withTenant(this.pool, context, async ({ $client }) => {
      const actor = await this.editor($client, credential);
      const { rows: [job] } = await $client.query("SELECT 1 FROM app.job WHERE (tenant_id, id) = ($1, $2)",
        [context.tenantId, jobId]);
      if (!job) throw new PracticeAccessError("NOT_FOUND");
      const { rows: [created] } = await $client.query<WalkSession>(`
        INSERT INTO app.v2_walk_session (tenant_id, job_id, id, actor_membership_id, device_started_at)
        VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING RETURNING ${sessionProjection}
      `, [context.tenantId, jobId, command.sessionId, actor, command.deviceStartedAt]);
      if (created) return created;
      const { rows: [prior] } = await $client.query<WalkSession>(`
        SELECT ${sessionProjection} FROM app.v2_walk_session WHERE (tenant_id, job_id, id) = ($1, $2, $3)
      `, [context.tenantId, jobId, command.sessionId]);
      if (!prior || prior.actorMembershipId !== actor ||
        prior.deviceStartedAt.getTime() !== command.deviceStartedAt.getTime()) {
        throw new WalkError("WALK_SESSION_CONFLICT");
      }
      return prior;
    });
  }

  async recordEntry(context: VerifiedTenantContext, jobId: string, credential: string, input: WalkEntryCommand,
    replayed = false): Promise<WalkEntryRevision> {
    const parsed = walkEntryCommandV1.safeParse(input);
    if (!parsed.success) throw new WalkError("WALK_INVALID_COMMAND");
    const command = parsed.data;
    const entry = fields(command);
    const slot = [context.tenantId, jobId, command.sessionId, command.captureOrder];
    return withTenant(this.pool, context, async ({ $client }) => {
      const actor = await this.editor($client, credential);
      const { rows: [session] } = await $client.query<{ version: number }>(`
        SELECT COALESCE((
          SELECT max(expected_version) + 1 FROM app.v2_walk_entry
          WHERE (tenant_id, job_id, session_id, capture_order) = ($1, $2, $3, $4)
        ), 0) AS version
        FROM app.v2_walk_session WHERE (tenant_id, job_id, id) = ($1, $2, $3)
      `, slot);
      if (!session) throw new PracticeAccessError("NOT_FOUND");

      // An exact retry replays what was first stored, whatever has happened since.
      const prior = await this.byCommand($client, context.tenantId, jobId, command.commandId);
      if (prior) return this.replay(prior, command, entry, actor);

      if (entry.photoId) {
        // A photo already known on another job is refused. Another firm's walk rows are hidden here,
        // so the tenant-wide unique index on the photo ID refuses those at insert.
        const { rows: [photo] } = await $client.query<{ otherJob: boolean; filed: boolean }>(`
          SELECT EXISTS (
              SELECT FROM app.evidence_upload WHERE (tenant_id, id) = ($1, $3) AND job_id <> $2
            ) OR EXISTS (
              SELECT FROM app.v2_walk_entry WHERE (tenant_id, photo_id) = ($1, $3) AND job_id <> $2
            ) AS "otherJob",
            EXISTS (
              SELECT FROM app.v2_walk_entry
              WHERE (tenant_id, job_id, photo_id) = ($1, $2, $3) AND expected_version = 0
                AND (session_id, capture_order) IS DISTINCT FROM ($4::uuid, $5::integer)
            ) AS filed
        `, [context.tenantId, jobId, entry.photoId, command.sessionId, command.captureOrder]);
        if (photo!.otherJob) throw new WalkError("WALK_PHOTO_REFUSED");
        if (photo!.filed) throw new WalkError("WALK_PHOTO_ALREADY_FILED");
      }
      if (command.expectedVersion > 0 && session.version === command.expectedVersion) {
        const { rows: [original] } = await $client.query<{ kind: string; photoId: string | null }>(`
          SELECT kind, photo_id AS "photoId" FROM app.v2_walk_entry
          WHERE (tenant_id, job_id, session_id, capture_order, expected_version) = ($1, $2, $3, $4, 0)
        `, slot);
        if (original?.kind !== entry.kind || original.photoId !== entry.photoId) {
          throw new WalkError("WALK_ENTRY_KIND_FIXED");
        }
      }

      if (session.version === command.expectedVersion) {
        // Uniqueness arbitrates concurrent writes to the same slot and version.
        const { rows: [saved] } = await $client.query<WalkEntryRevision>(`
          INSERT INTO app.v2_walk_entry (tenant_id, job_id, session_id, capture_order, expected_version, command_id,
            kind, room_label, note_text, quantity, unit, photo_id, device_captured_at, actor_membership_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
          ON CONFLICT ON CONSTRAINT v2_walk_entry_pkey DO NOTHING RETURNING ${entryProjection}
        `, [...slot, command.expectedVersion, command.commandId, entry.kind, entry.room, entry.text,
          entry.quantity, entry.unit, entry.photoId, command.deviceCapturedAt, actor]);
        if (saved) return saved;
        const raced = await this.byCommand($client, context.tenantId, jobId, command.commandId);
        if (raced) return this.replay(raced, command, entry, actor);
      }
      throw new WalkError("WALK_VERSION_CONFLICT");
    }).catch((error: { code?: string; constraint?: string; message?: string }) => {
      if (error.code === "23505" && error.constraint === "v2_walk_entry_photo_once") throw new WalkError("WALK_PHOTO_REFUSED");
      if (error.code === "23514" && error.message === "V2_WALK_PHOTO_OTHER_JOB") throw new WalkError("WALK_PHOTO_REFUSED");
      // A concurrent exact retry of the same command lost the race: replay the stored one.
      if (error.code === "23505" && error.constraint === "v2_walk_entry_tenant_id_job_id_command_id_key" && !replayed) {
        return this.recordEntry(context, jobId, credential, input, true);
      }
      throw error;
    });
  }

  private async editor(client: { query: Pool["query"] }, credential: string) {
    const digest = createHash("sha256").update(credential).digest("hex");
    const { rows: [actor] } = await client.query<{ id: string | null }>("SELECT app.v2_walk_editor($1) AS id", [digest]);
    if (!actor?.id) throw new WalkError("WALK_EDITOR_REQUIRED");
    return actor.id;
  }

  private async byCommand(client: { query: Pool["query"] }, tenantId: string, jobId: string, commandId: string) {
    const { rows: [prior] } = await client.query<WalkEntryRevision>(`
      SELECT ${entryProjection} FROM app.v2_walk_entry WHERE (tenant_id, job_id, command_id) = ($1, $2, $3)
    `, [tenantId, jobId, commandId]);
    return prior;
  }

  private replay(prior: WalkEntryRevision, command: ParsedEntryCommand, entry: ReturnType<typeof fields>, actor: string) {
    if (prior.actorMembershipId !== actor || prior.sessionId !== command.sessionId ||
      prior.captureOrder !== command.captureOrder || prior.expectedVersion !== command.expectedVersion ||
      prior.deviceCapturedAt.getTime() !== command.deviceCapturedAt.getTime() || prior.kind !== entry.kind ||
      prior.room !== entry.room || prior.text !== entry.text || prior.quantity !== entry.quantity ||
      prior.unit !== entry.unit || prior.photoId !== entry.photoId) {
      throw new WalkError("WALK_COMMAND_CONFLICT");
    }
    return prior;
  }
}
