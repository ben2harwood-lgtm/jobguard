import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.uuid().transform(value => value.toLowerCase());
const text = z.string().trim().min(1).max(100);

/** Practice-only crew contact. A correction is the next revision of the same crewId. */
export const crewContactV1 = z.strictObject({
  version: z.literal("crew-contact.v1"),
  commandId: uuid,
  crewId: uuid,
  expectedRevision: z.number().int().min(0).max(2_147_483_646),
  displayName: text,
  trade: text,
  // Ofcom drama ranges only; spaces are ignored.
  phone: z.string().transform(value => value.replace(/\s+/gu, ""))
    .pipe(z.string().regex(/^(07700900\d{3}|01632960\d{3}|02079460\d{3})$/u)),
  email: z.string().trim().toLowerCase().max(200)
    .regex(/^[a-z0-9._+-]{1,64}@([a-z0-9-]{1,63}\.)*invalid$/u).nullable().optional(),
});
export const crewContactQueryV1 = z.strictObject({ version: z.literal("crew-contact-query.v1") });

export type CrewContactCommand = z.infer<typeof crewContactV1>;
export type CrewContact = {
  crewId: string; revision: number; displayName: string; trade: string; phone: string; email: string | null;
  actorMembershipId: string; recordedAt: Date;
};

export class CrewContactError extends Error {
  constructor(readonly code: "CREW_CONTACT_INVALID" | "CREW_CONTACT_VERSION_CONFLICT" | "CREW_CONTACT_COMMAND_CONFLICT" |
    "CREW_CONTACT_EDITOR_REQUIRED") {
    super(code);
  }
}

const columns = `crew_id AS "crewId", revision, display_name AS "displayName", trade, phone, email,
  actor_membership_id AS "actorMembershipId", recorded_at AS "recordedAt"`;

export class CrewContactRepository {
  constructor(private readonly pool: Pool) {}

  /** The current revision of each of the signed-in firm's crew records. */
  async list(context: VerifiedTenantContext): Promise<CrewContact[]> {
    return withTenant(this.pool, context, async ({ $client }) => (await $client.query<CrewContact>(`
      SELECT DISTINCT ON (crew_id) ${columns} FROM app.v2_crew_contact
      ORDER BY crew_id, revision DESC`)).rows
      .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.crewId.localeCompare(b.crewId)));
  }

  async record(context: VerifiedTenantContext, sessionId: string, input: CrewContactCommand): Promise<CrewContact> {
    const parsed = crewContactV1.safeParse(input);
    if (!parsed.success) throw new CrewContactError("CREW_CONTACT_INVALID");
    const command = { ...parsed.data, email: parsed.data.email ?? null };
    return withTenant(this.pool, context, async database => {
      const { $client: client } = database;
      const digest = createHash("sha256").update(sessionId).digest("hex");
      // The signed-in person's membership, resolved from their verified credential and bound firm.
      const { rows: [editor] } = await client.query<{ id: string | null }>("SELECT app.v2_work_plan_editor($1) AS id", [digest]);
      if (!editor?.id) throw new CrewContactError("CREW_CONTACT_EDITOR_REQUIRED");

      // Serialise commands for one crew record so a race resolves to one revision.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('v2_crew_contact:' || $1))", [command.crewId]);
      const receipt = await this.replay(client, editor.id, command);
      if (receipt) return receipt;
      const { rows: [head] } = await client.query<{ revision: number }>(
        "SELECT max(revision) AS revision FROM app.v2_crew_contact WHERE crew_id = $1", [command.crewId]);
      if ((head?.revision ?? 0) !== command.expectedRevision) throw new CrewContactError("CREW_CONTACT_VERSION_CONFLICT");

      const saved = await client.query<CrewContact>(`
        INSERT INTO app.v2_crew_contact (tenant_id, firm_key, crew_id, revision, previous_revision, command_id,
          display_name, trade, phone, email, actor_membership_id)
        VALUES ($1, app.current_firm_profile_key(), $2, $3::int + 1, nullif($3::int, 0), $4, $5, $6, $7, $8, $9)
        RETURNING ${columns}`, [context.tenantId, command.crewId, command.expectedRevision, command.commandId,
        command.displayName, command.trade, command.phone, command.email, editor.id])
        .catch((error: { code?: string }) => {
          // A crewId another firm holds is refused as stale, never revealed.
          if (error.code === "23505") throw new CrewContactError("CREW_CONTACT_VERSION_CONFLICT");
          throw error;
        });
      const contact = saved.rows[0]!;
      // A replay returned above, so each recorded contact appends exactly one event in this transaction.
      await this.audit(database, editor.id, command, contact.revision);
      return contact;
    });
  }

  private audit(database: TenantTransaction, actor: string, command: CrewContactCommand & { email: string | null },
    revision: number) {
    const { displayName, trade, phone, email } = command;
    return appendAuditBatch(database, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`,
      eventType: "v2.crew_contact.recorded", subjectType: "crew_contact", subjectRef: command.crewId,
      payload: {
        references: { commandId: command.commandId, crewId: command.crewId,
          expectedRevision: String(command.expectedRevision), revision: String(revision) },
        // Name, phone and email stay out of the payload; only their digest is kept.
        hashes: { contact: createHash("sha256").update(JSON.stringify({ displayName, trade, phone, email })).digest("hex") },
        classifications: { action: "operational" },
      } }]);
  }

  private async replay(client: PoolClient, actor: string, command: CrewContactCommand & { email: string | null }) {
    const { rows: [receipt] } = await client.query<CrewContact & { matches: boolean }>(`
      SELECT ${columns}, (crew_id, revision - 1, display_name, trade, phone, email, actor_membership_id)
        IS NOT DISTINCT FROM ($2::uuid, $3::int, $4::text, $5::text, $6::text, $7::text, $8::uuid) AS matches
      FROM app.v2_crew_contact WHERE command_id = $1
    `, [command.commandId, command.crewId, command.expectedRevision, command.displayName, command.trade,
      command.phone, command.email, actor]);
    if (!receipt) return null;
    const { matches, ...saved } = receipt;
    if (!matches) throw new CrewContactError("CREW_CONTACT_COMMAND_CONFLICT");
    return saved;
  }
}
