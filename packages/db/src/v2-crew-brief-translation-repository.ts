import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { appendAuditBatch } from "./audit.js";
import { PracticeAccessError } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import type { CrewBriefContent } from "./v2-crew-brief-repository.js";
import { briefLanguages, briefTextsForTranslation, FakeTranslator, translatedBriefContent, type Lang } from "./v2-brief-translator.js";

const fields = {
  trade: z.string().trim().min(1).max(100),
  expectedVersion: z.number().int().min(1).max(2_147_483_647),
  lang: z.enum(briefLanguages.map(language => language.code)),
};
export const crewBriefTranslationQueryV1 = z.strictObject({
  version: z.literal("v2-crew-brief-translation-query.v1"), ...fields,
});
export const crewBriefTranslationCommandV1 = z.strictObject({
  version: z.literal("v2-crew-brief-translation-command.v1"),
  commandId: z.uuid().transform(value => value.toLowerCase()), ...fields,
});
export type CrewBriefTranslationQuery = z.infer<typeof crewBriefTranslationQueryV1>;
export type CrewBriefTranslationCommand = z.infer<typeof crewBriefTranslationCommandV1>;
export type CrewBriefTranslation = {
  trade: string; briefVersion: number; lang: Lang; provider: "fake"; commandId: string;
  content: CrewBriefContent; sourceTextHash: string; actorMembershipId: string; createdAt: Date;
};
export class CrewBriefTranslationError extends Error {
  constructor(readonly code: "CREW_BRIEF_TRANSLATION_INVALID_QUERY" | "CREW_BRIEF_TRANSLATION_INVALID_COMMAND" |
    "CREW_BRIEF_TRANSLATION_VERSION_CONFLICT" | "CREW_BRIEF_TRANSLATION_COMMAND_CONFLICT" |
    "CREW_BRIEF_TRANSLATION_EDITOR_REQUIRED" | "CREW_BRIEF_TRANSLATION_EXISTS_CONFLICT") { super(code); }
}
const columns = `trade, expected_version + 1 AS "briefVersion", lang, provider, command_id AS "commandId",
  content, source_text_hash AS "sourceTextHash", actor_membership_id AS "actorMembershipId", created_at AS "createdAt"`;
const sha = (text: string) => createHash("sha256").update(text).digest("hex");

export class CrewBriefTranslationRepository {
  constructor(private readonly pool: Pool) {}

  async read(context: VerifiedTenantContext, jobId: string, sessionId: string, input: CrewBriefTranslationQuery) {
    const parsed = crewBriefTranslationQueryV1.safeParse(input);
    if (!parsed.success) throw new CrewBriefTranslationError("CREW_BRIEF_TRANSLATION_INVALID_QUERY");
    const query = parsed.data;
    return withTenant(this.pool, context, async ({ $client }) => {
      await this.editor($client, sessionId);
      const { rows: [row] } = await $client.query<CrewBriefTranslation>(`SELECT ${columns}
        FROM app.v2_crew_brief_translation WHERE (tenant_id, job_id, trade, expected_version, lang) = ($1,$2,$3,$4,$5)`,
      [context.tenantId, jobId, query.trade, query.expectedVersion - 1, query.lang]);
      if (!row) throw new PracticeAccessError("NOT_FOUND");
      return row;
    });
  }

  async translate(context: VerifiedTenantContext, jobId: string, sessionId: string, input: CrewBriefTranslationCommand) {
    const parsed = crewBriefTranslationCommandV1.safeParse(input);
    if (!parsed.success) throw new CrewBriefTranslationError("CREW_BRIEF_TRANSLATION_INVALID_COMMAND");
    const command = parsed.data;
    return withTenant(this.pool, context, async database => {
      const { $client } = database;
      const actor = await this.editor($client, sessionId);
      // Same first business lock as brief generation, so a new brief cannot race this insert.
      await $client.query("SELECT 1 FROM app.quote_draft WHERE (tenant_id, job_id) = ($1,$2) FOR UPDATE",
        [context.tenantId, jobId]);
      const { rows: [prior] } = await $client.query<CrewBriefTranslation>(`SELECT ${columns}
        FROM app.v2_crew_brief_translation WHERE (tenant_id, job_id, command_id) = ($1,$2,$3)`,
      [context.tenantId, jobId, command.commandId]);
      if (prior) {
        if (prior.trade !== command.trade || prior.briefVersion !== command.expectedVersion ||
          prior.lang !== command.lang || prior.actorMembershipId !== actor) {
          throw new CrewBriefTranslationError("CREW_BRIEF_TRANSLATION_COMMAND_CONFLICT");
        }
        return prior;
      }
      const { rows: [brief] } = await $client.query<{ content: CrewBriefContent; briefVersion: number }>(`
        SELECT content, expected_version + 1 AS "briefVersion" FROM app.v2_crew_brief
        WHERE (tenant_id, job_id, trade) = ($1,$2,$3) ORDER BY expected_version DESC LIMIT 1`,
      [context.tenantId, jobId, command.trade]);
      if (!brief || brief.briefVersion !== command.expectedVersion) {
        throw new CrewBriefTranslationError("CREW_BRIEF_TRANSLATION_VERSION_CONFLICT");
      }
      const key = [context.tenantId, jobId, command.trade, command.expectedVersion - 1, command.lang];
      const { rowCount: exists } = await $client.query(`SELECT 1 FROM app.v2_crew_brief_translation
        WHERE (tenant_id, job_id, trade, expected_version, lang) = ($1,$2,$3,$4,$5)`, key);
      if (exists) throw new CrewBriefTranslationError("CREW_BRIEF_TRANSLATION_EXISTS_CONFLICT");
      const texts = briefTextsForTranslation(brief.content);
      // Fake only: deterministic and offline. No business network call inside this transaction.
      const translated = await new FakeTranslator().translate({ texts, target: command.lang });
      const content = translatedBriefContent(brief.content, translated);
      const { rows: [saved] } = await $client.query<CrewBriefTranslation>(`INSERT INTO app.v2_crew_brief_translation
        (tenant_id, job_id, trade, expected_version, lang, provider, command_id, content, source_text_hash, actor_membership_id)
        VALUES ($1,$2,$3,$4,$5,'fake',$6,$7,$8,$9) RETURNING ${columns}`,
      [...key, command.commandId, JSON.stringify(content), sha(JSON.stringify(texts)), actor]);
      await appendAuditBatch(database, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`,
        eventType: "v2.crew_brief.translated", subjectType: "job", subjectRef: jobId,
        payload: { references: { commandId: command.commandId, briefVersion: String(command.expectedVersion),
          lang: command.lang, provider: "fake" }, hashes: { trade: sha(command.trade), sourceText: saved!.sourceTextHash },
        classifications: { action: "operational" } } }]);
      return saved!;
    });
  }

  private async editor(client: PoolClient, sessionId: string) {
    const { rows: [actor] } = await client.query<{ id: string | null }>(
      "SELECT app.v2_work_plan_editor($1) AS id", [sha(sessionId)]);
    if (!actor?.id) throw new CrewBriefTranslationError("CREW_BRIEF_TRANSLATION_EDITOR_REQUIRED");
    return actor.id;
  }
}
