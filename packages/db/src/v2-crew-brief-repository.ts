import { createHash } from "node:crypto";
import type { PoolClient, Pool } from "pg";
import { z } from "zod";
import { PracticeAccessError } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { splashbackDecoratingTemplate } from "./v2-splashback-decorating-template.js";
import { applyWorkPlanEdits, type WorkPlanEditRow, type WorkPlanScopeRow, type WorkPlanTask } from "./v2-work-plan-edits.js";
import type { WorkPlanTemplate } from "./v2-work-plan-repository.js";

const uuid = z.uuid().transform(value => value.toLowerCase());
const trade = z.string().trim().min(1).max(100);
export const crewBriefQueryV1 = z.strictObject({
  version: z.literal("v2-crew-brief-query.v1"),
  trade: trade.optional(),
});
export const crewBriefCommandV1 = z.strictObject({
  version: z.literal("v2-crew-brief-command.v1"),
  commandId: uuid,
  trade,
  expectedVersion: z.number().int().min(0).max(2_147_483_646),
  accessWindow: z.string().trim().min(1).max(200).refine(text => !text.includes("\0")),
  photoIds: z.array(uuid).max(20).refine(ids => new Set(ids).size === ids.length),
});

export type CrewBriefQuery = z.infer<typeof crewBriefQueryV1>;
export type CrewBriefCommand = z.infer<typeof crewBriefCommandV1>;

// Everything a trade receives. Built only from plan tasks, scope wording and the
// builder's chosen access window and photos: no price, value or finding source.
export type CrewBriefContent = {
  version: "v2-crew-brief.v1";
  trade: string;
  quoteRevisionId: string;
  accessWindow: string;
  tasks: {
    position: number;
    scopeItemId: string;
    title: string;
    scope: { description: string; quantity: string | null; unit: string | null };
    durationMinutes: number;
    visit: string | null;
    owner: string | null;
    proofNeeded: string[];
  }[];
  photos: { evidenceId: string; scopeItemId: string | null; contentType: string }[];
  proofNeeded: string[];
};

export type CrewBrief = {
  trade: string;
  version: number;
  commandId: string;
  actorMembershipId: string;
  recordedAt: Date;
  content: CrewBriefContent;
};

export class CrewBriefError extends Error {
  constructor(readonly code: "CREW_BRIEF_INVALID_QUERY" | "CREW_BRIEF_INVALID_COMMAND" | "CREW_BRIEF_EDITOR_REQUIRED" |
    "CREW_BRIEF_ACCEPTED_PLAN_REQUIRED" | "CREW_BRIEF_TEMPLATE_UNAVAILABLE" | "CREW_BRIEF_TRADE_NOT_FOUND" |
    "CREW_BRIEF_PHOTO_NOT_FOUND" | "CREW_BRIEF_VERSION_CONFLICT" | "CREW_BRIEF_COMMAND_CONFLICT") {
    super(code);
  }
}

type PlanKey = [tenantId: string, jobId: string, quoteRevisionId: string];
type BriefRow = Omit<CrewBrief, "content"> & { content: CrewBriefContent; accessWindow: string; photoIds: string[];
  expectedVersion: number };
type Receipt = { trade: string; expectedVersion: number; accessWindow: string; photoIds: string[];
  actorMembershipId: string; briefVersion: number };

const briefColumns = `trade, expected_version + 1 AS version, expected_version AS "expectedVersion",
  command_id AS "commandId", actor_membership_id AS "actorMembershipId", recorded_at AS "recordedAt",
  access_window AS "accessWindow", content,
  ARRAY(SELECT p.evidence_id::text FROM app.v2_crew_brief_photo p
    WHERE (p.tenant_id, p.job_id, p.trade, p.expected_version) = (b.tenant_id, b.job_id, b.trade, b.expected_version)
    ORDER BY p.position) AS "photoIds"`;

// Stored content comes back from jsonb with its keys reordered; compare by value.
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object" ? `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`
  : JSON.stringify(value);

const publicBrief = ({ accessWindow: _a, photoIds: _p, expectedVersion: _e, ...brief }: BriefRow): CrewBrief => brief;

export class CrewBriefRepository {
  constructor(private readonly pool: Pool, private readonly template: WorkPlanTemplate = splashbackDecoratingTemplate) {}

  // Latest brief per trade, marked current when the plan would still produce the same brief.
  read(context: VerifiedTenantContext, jobId: string, query: CrewBriefQuery) {
    return withTenant(this.pool, context, async ({ $client }) => {
      await this.requireJob($client, context.tenantId, jobId);
      const { rows } = await $client.query<BriefRow>(`
        SELECT DISTINCT ON (trade) ${briefColumns} FROM app.v2_crew_brief b
        WHERE (tenant_id, job_id) = ($1, $2) AND ($3::text IS NULL OR trade = $3)
        ORDER BY trade, expected_version DESC
      `, [context.tenantId, jobId, query.trade ?? null]);
      const tasks = rows.length ? await this.planTasks($client, context.tenantId, jobId).catch(() => null) : null;
      return Promise.all(rows.map(async row => {
        const rebuilt = tasks && await this.compose($client, tasks, row.trade, row.accessWindow, row.photoIds)
          .catch(() => null);
        return { ...publicBrief(row), current: rebuilt !== null && canonical(rebuilt) === canonical(row.content) };
      }));
    });
  }

  async generate(context: VerifiedTenantContext, jobId: string, sessionId: string, input: CrewBriefCommand) {
    const parsed = crewBriefCommandV1.safeParse(input);
    if (!parsed.success) throw new CrewBriefError("CREW_BRIEF_INVALID_COMMAND");
    const command = parsed.data;
    return withTenant(this.pool, context, async ({ $client }) => {
      const digest = createHash("sha256").update(sessionId).digest("hex");
      const { rows: [actor] } = await $client.query<{ id: string | null }>(
        "SELECT app.v2_work_plan_editor($1) AS id", [digest],
      );
      if (!actor?.id) throw new CrewBriefError("CREW_BRIEF_EDITOR_REQUIRED");
      // Serialise with plan edits and quote saves on the same job.
      await this.requireJob($client, context.tenantId, jobId, true);

      const { rows: [prior] } = await $client.query<Receipt>(`
        SELECT trade, expected_version AS "expectedVersion", access_window AS "accessWindow",
          photo_ids::text[] AS "photoIds", actor_membership_id AS "actorMembershipId", brief_version AS "briefVersion"
        FROM app.v2_crew_brief_command WHERE (tenant_id, job_id, command_id) = ($1, $2, $3)
      `, [context.tenantId, jobId, command.commandId]);
      if (prior) {
        if (prior.actorMembershipId !== actor.id || prior.trade !== command.trade ||
          prior.expectedVersion !== command.expectedVersion || prior.accessWindow !== command.accessWindow ||
          JSON.stringify(prior.photoIds) !== JSON.stringify(command.photoIds)) {
          throw new CrewBriefError("CREW_BRIEF_COMMAND_CONFLICT");
        }
        return publicBrief((await this.revision($client, context.tenantId, jobId, prior.trade, prior.briefVersion))!);
      }

      const { rows: [latest] } = await $client.query<BriefRow>(`
        SELECT ${briefColumns} FROM app.v2_crew_brief b WHERE (tenant_id, job_id, trade) = ($1, $2, $3)
        ORDER BY expected_version DESC LIMIT 1
      `, [context.tenantId, jobId, command.trade]);
      if ((latest?.version ?? 0) !== command.expectedVersion) throw new CrewBriefError("CREW_BRIEF_VERSION_CONFLICT");

      const tasks = await this.planTasks($client, context.tenantId, jobId);
      const content = await this.compose($client, tasks, command.trade, command.accessWindow, command.photoIds);
      const key = [context.tenantId, jobId, command.trade, command.expectedVersion];
      // Generating the same brief again keeps the one current brief.
      const unchanged = latest && canonical(latest.content) === canonical(content);
      if (!unchanged) {
        const { rowCount } = await $client.query(`
          INSERT INTO app.v2_crew_brief (tenant_id, job_id, trade, expected_version, command_id, quote_revision_id,
            access_window, content, actor_membership_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING
        `, [...key, command.commandId, content.quoteRevisionId, command.accessWindow, JSON.stringify(content), actor.id]);
        if (!rowCount) throw new CrewBriefError("CREW_BRIEF_VERSION_CONFLICT");
        await $client.query(`
          INSERT INTO app.v2_crew_brief_photo (tenant_id, job_id, trade, expected_version, position, evidence_id)
          SELECT $1, $2, $3, $4, photo.position, photo.id
          FROM unnest($5::uuid[]) WITH ORDINALITY AS photo(id, position)
        `, [...key, command.photoIds]);
      }
      const briefVersion = unchanged ? latest!.expectedVersion : command.expectedVersion;
      await $client.query(`
        INSERT INTO app.v2_crew_brief_command (tenant_id, job_id, command_id, trade, expected_version, access_window,
          photo_ids, brief_version, actor_membership_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [context.tenantId, jobId, command.commandId, command.trade, command.expectedVersion, command.accessWindow,
        command.photoIds, briefVersion, actor.id]);
      return publicBrief((await this.revision($client, context.tenantId, jobId, command.trade, briefVersion))!);
    });
  }

  private async requireJob(client: PoolClient, tenantId: string, jobId: string, lock = false) {
    if (lock) await client.query("SELECT 1 FROM app.quote_draft WHERE (tenant_id, job_id) = ($1, $2) FOR UPDATE", [tenantId, jobId]);
    const { rowCount } = await client.query("SELECT 1 FROM app.job WHERE (tenant_id, id) = ($1, $2)", [tenantId, jobId]);
    if (!rowCount) throw new PracticeAccessError("NOT_FOUND");
  }

  private async revision(client: PoolClient, tenantId: string, jobId: string, trade: string, version: number) {
    const { rows: [row] } = await client.query<BriefRow>(`
      SELECT ${briefColumns} FROM app.v2_crew_brief b WHERE (tenant_id, job_id, trade, expected_version) = ($1, $2, $3, $4)
    `, [tenantId, jobId, trade, version]);
    return row;
  }

  // The accepted plan's tasks with every builder edit applied. This reads only
  // identifiers, scope wording and edits: never the agreement's money.
  private async planTasks(client: PoolClient, tenantId: string, jobId: string) {
    const { rows: [head] } = await client.query<{ quoteRevisionId: string | null; templateKey: string | null }>(`
      SELECT q.quote_revision_id AS "quoteRevisionId", p.template_key AS "templateKey"
      FROM app.job j
      LEFT JOIN app.job_activation a ON (a.tenant_id, a.job_id) = (j.tenant_id, j.id)
      LEFT JOIN app.quote_document_version q ON (q.tenant_id, q.job_id, q.id) = (j.tenant_id, j.id,
        COALESCE(a.accepted_document_id, j.accepted_quote_version_id, (
          SELECT x.document_id FROM app.quote_acceptance x WHERE (x.tenant_id, x.job_id) = (j.tenant_id, j.id)
          ORDER BY x.recorded_at DESC, x.document_version DESC, x.id DESC LIMIT 1
        )))
      LEFT JOIN app.v2_work_plan p ON (p.tenant_id, p.job_id, p.quote_revision_id) = (j.tenant_id, j.id, q.quote_revision_id)
      WHERE (j.tenant_id, j.id) = ($1, $2)
    `, [tenantId, jobId]);
    if (!head?.quoteRevisionId || !head.templateKey) throw new CrewBriefError("CREW_BRIEF_ACCEPTED_PLAN_REQUIRED");
    if (head.templateKey !== this.template.key) throw new CrewBriefError("CREW_BRIEF_TEMPLATE_UNAVAILABLE");
    const key: PlanKey = [tenantId, jobId, head.quoteRevisionId];

    const { rows: scope } = await client.query<WorkPlanScopeRow>(`
      SELECT l.scope_item_id, jsonb_build_object('description', l.description, 'category', l.category,
        'quantity', l.quantity_decimal, 'unit', l.unit) AS source, t.template_task_key
      FROM app.quote_line l LEFT JOIN app.v2_work_plan_task t
        USING (tenant_id, job_id, quote_revision_id, scope_item_id)
      WHERE (l.tenant_id, l.job_id, l.quote_revision_id) = ($1, $2, $3) AND l.included
      ORDER BY l.ordinal, t.position
    `, key);
    const base = scope.flatMap((row, index): WorkPlanTask[] => {
      if (row.template_task_key === null) return [];
      const task = this.template.tasks.find(entry => entry.key === row.template_task_key);
      if (!task) throw new CrewBriefError("CREW_BRIEF_TEMPLATE_UNAVAILABLE");
      const { category: _category, ...details } = task;
      return [{ ...details, position: index + 1, scopeItemId: row.scope_item_id,
        dependsOn: task.dependsOn.map(templateTaskKey => ({ scopeItemId: row.scope_item_id, templateTaskKey })) }];
    });
    const { rows: edits } = await client.query<WorkPlanEditRow>(`
      WITH RECURSIVE history AS (
        SELECT quote_revision_id, previous_plan_revision_id, 0 AS distance FROM app.v2_work_plan
        WHERE (tenant_id, job_id, quote_revision_id) = ($1, $2, $3)
        UNION ALL
        SELECT p.quote_revision_id, p.previous_plan_revision_id, h.distance + 1
        FROM history h JOIN app.v2_work_plan p ON (p.tenant_id, p.job_id, p.quote_revision_id)
          = ($1, $2, h.previous_plan_revision_id)
      )
      SELECT e.scope_item_id, e.template_task_key, e.quote_revision_id, e.changes,
        jsonb_build_object('description', l.description, 'category', l.category,
          'quantity', l.quantity_decimal, 'unit', l.unit) AS source
      FROM history h JOIN app.v2_work_plan_edit e ON (e.tenant_id, e.job_id, e.quote_revision_id) = ($1, $2, h.quote_revision_id)
      JOIN app.quote_line l ON (l.tenant_id, l.job_id, l.quote_revision_id, l.scope_item_id)
        = (e.tenant_id, e.job_id, e.quote_revision_id, e.scope_item_id)
      ORDER BY h.distance DESC, e.expected_version
    `, key);
    const { tasks, sources } = applyWorkPlanEdits(scope, base, edits);
    return { tenantId, jobId, quoteRevisionId: head.quoteRevisionId, tasks, sources };
  }

  private async compose(client: PoolClient, plan: Awaited<ReturnType<CrewBriefRepository["planTasks"]>>,
    trade: string, accessWindow: string, photoIds: string[]): Promise<CrewBriefContent> {
    const tasks = plan.tasks.filter(task => task.trade === trade);
    if (!tasks.length) throw new CrewBriefError("CREW_BRIEF_TRADE_NOT_FOUND");
    const { rows: found } = await client.query<CrewBriefContent["photos"][number]>(`
      SELECT o.id AS "evidenceId", o.scope_item_id AS "scopeItemId", o.content_type AS "contentType"
      FROM app.evidence_object o JOIN app.job j ON (j.tenant_id, j.id) = (o.tenant_id, o.job_id)
      WHERE o.tenant_id = $1 AND o.job_id = $2 AND o.id = ANY($3::uuid[])
        AND o.kind = 'original' AND o.content_type LIKE 'image/%'
    `, [plan.tenantId, plan.jobId, photoIds]);
    const photos = photoIds.map(id => found.find(photo => photo.evidenceId === id));
    if (photos.some(photo => !photo)) throw new CrewBriefError("CREW_BRIEF_PHOTO_NOT_FOUND");
    return {
      version: "v2-crew-brief.v1", trade, quoteRevisionId: plan.quoteRevisionId, accessWindow,
      tasks: tasks.map((task, index) => {
        const source = plan.sources.get(task.scopeItemId)!;
        return { position: index + 1, scopeItemId: task.scopeItemId, title: task.title,
          scope: { description: source.description, quantity: source.quantity, unit: source.unit },
          durationMinutes: task.durationMinutes, visit: task.scheduledDate ?? null, owner: task.assignee ?? null,
          proofNeeded: [...task.proofPoints] };
      }),
      photos: photos as CrewBriefContent["photos"],
      proofNeeded: [...new Set(tasks.flatMap(task => task.proofPoints))],
    };
  }
}
