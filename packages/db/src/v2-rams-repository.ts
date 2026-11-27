import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { appendAuditBatch } from "./audit.js";
import { PracticeAccessError } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import type { WorkPlan } from "./v2-work-plan-repository.js";
import { editRamsSections, RamsError, ramsCommandV1, ramsDraftV1, ramsHash, ramsPlanHash, ramsReadyToSign, ramsSections,
  ramsJobV1, type RamsDraft, type RamsJob } from "./v2-rams-draft.js";

export class RamsRepository {
  constructor(private readonly pool: Pool) {}

  private requireMode() {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") {
      throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
    }
  }

  async read(context: VerifiedTenantContext, jobId: string): Promise<RamsDraft[]> {
    this.requireMode();
    return withTenant(this.pool, context, async ({ $client }) => {
      const { rows } = await $client.query<{ snapshot: unknown }>(`
        SELECT snapshot FROM app.v2_rams_draft WHERE (tenant_id, job_id) = ($1,$2) ORDER BY revision
      `, [context.tenantId, jobId]);
      return rows.map(row => ramsDraftV1.parse(row.snapshot));
    });
  }

  async command(context: VerifiedTenantContext, jobId: string, sessionId: string, raw: unknown, plan: WorkPlan,
    job: RamsJob): Promise<RamsDraft> {
    this.requireMode();
    const parsed = ramsCommandV1.safeParse(raw);
    if (!parsed.success) throw new RamsError("RAMS_INVALID_COMMAND");
    const command = parsed.data;
    return withTenant(this.pool, context, async database => {
      const client = database.$client;
      const digest = createHash("sha256").update(sessionId).digest("hex");
      const { rows: [editor] } = await client.query<{ id: string | null }>("SELECT app.v2_work_plan_editor($1) AS id", [digest]);
      if (!editor?.id) throw new PracticeAccessError("UNAUTHENTICATED");
      // Same lock as quote saves and plan edits. All business locks precede audit.
      const locked = await client.query(`SELECT 1 FROM app.quote_draft WHERE (tenant_id,job_id)=($1,$2) FOR UPDATE`,
        [context.tenantId, jobId]);
      if (!locked.rowCount) throw new PracticeAccessError("NOT_FOUND");
      const requestHash = ramsHash({ actor: editor.id, command });
      const { rows: [replay] } = await client.query<{ request_hash: string; snapshot: unknown }>(`
        SELECT request_hash, snapshot FROM app.v2_rams_draft WHERE (tenant_id,job_id,command_id)=($1,$2,$3)
      `, [context.tenantId, jobId, command.commandId]);
      if (replay) {
        if (replay.request_hash !== requestHash) throw new RamsError("RAMS_COMMAND_CONFLICT");
        return ramsDraftV1.parse(replay.snapshot);
      }
      const { rows: [last] } = await client.query<{ snapshot: unknown }>(`
        SELECT snapshot FROM app.v2_rams_draft WHERE (tenant_id,job_id)=($1,$2) ORDER BY revision DESC LIMIT 1
      `, [context.tenantId, jobId]);
      const previous = last ? ramsDraftV1.parse(last.snapshot) : undefined;
      if ((previous?.revision ?? 0) !== command.expectedVersion) throw new RamsError("RAMS_VERSION_CONFLICT");
      // Recheck the plan after acquiring the lock: the supplied projection may have raced an edit or quote save.
      const { rows: [source] } = await client.query<{ quote_revision_id: string; plan_version: number; recorded_at: Date }>(`
        SELECT p.quote_revision_id,
          COALESCE((SELECT max(e.expected_version)+1 FROM app.v2_work_plan_edit e
            WHERE (e.tenant_id,e.job_id,e.quote_revision_id)=(p.tenant_id,p.job_id,p.quote_revision_id)),0) AS plan_version,
          clock_timestamp() AS recorded_at
        FROM app.v2_work_plan p JOIN app.quote_draft d USING (tenant_id,job_id)
        JOIN app.job j ON (j.tenant_id,j.id)=(p.tenant_id,p.job_id)
        LEFT JOIN app.job_activation a ON (a.tenant_id,a.job_id)=(j.tenant_id,j.id)
        LEFT JOIN app.quote_document_version q ON (q.tenant_id,q.job_id,q.id)=(j.tenant_id,j.id,
          COALESCE(a.accepted_document_id,j.accepted_quote_version_id,(
            SELECT x.document_id FROM app.quote_acceptance x WHERE (x.tenant_id,x.job_id)=(j.tenant_id,j.id)
            ORDER BY x.recorded_at DESC,x.document_version DESC,x.id DESC LIMIT 1)))
        WHERE (p.tenant_id,p.job_id,p.quote_revision_id)=($1,$2,$3)
          AND p.quote_revision_id=COALESCE(q.quote_revision_id,d.current_revision_id)
      `, [context.tenantId, jobId, command.quoteRevisionId]);
      if (!source || plan.jobId !== jobId || plan.quoteRevisionId !== source.quote_revision_id ||
        command.expectedPlanVersion !== source.plan_version || plan.version !== source.plan_version) {
        throw new RamsError("RAMS_PLAN_CHANGED");
      }
      if (command.action !== "generate" && (!previous || previous.quoteRevisionId !== source.quote_revision_id ||
        previous.planVersion !== source.plan_version)) throw new RamsError("RAMS_PLAN_CHANGED");
      // An approved extra or replacement changes the work without a plan edit, so compare the work itself too.
      const planHash = ramsPlanHash(plan);
      if (command.action !== "generate" && previous?.planHash !== undefined && previous.planHash !== planHash) {
        throw new RamsError("RAMS_PLAN_CHANGED");
      }
      let sections = previous?.sections ?? [];
      if (command.action === "generate") sections = ramsSections(plan, previous);
      if (command.action === "edit") sections = editRamsSections(sections, command.sectionKey, command.text);
      if (command.action === "sign") {
        if (previous?.status !== "draft") throw new RamsError("RAMS_DRAFT_REQUIRED");
        if (!ramsReadyToSign(sections)) throw new RamsError("RAMS_INCOMPLETE");
      }
      const recordedAt = source.recorded_at.toISOString();
      const snapshot: RamsDraft = {
        version: "rams-draft.v1", environment: "synthetic_demo", jobId, revision: command.expectedVersion + 1,
        documentVersion: (previous?.documentVersion ?? 0) + Number(command.action === "generate" || previous?.status === "signed"),
        quoteRevisionId: source.quote_revision_id, planVersion: source.plan_version,
        status: command.action === "sign" ? "signed" : "draft", sections,
        actorMembershipId: editor.id, recordedAt,
        signedBy: command.action === "sign" ? editor.id : null, signedAt: command.action === "sign" ? recordedAt : null,
        signedName: command.action === "sign" ? command.signerName : null,
        // Edits and signing keep the details the builder has been checking; only a new draft takes the current ones.
        job: ramsJobV1.parse(command.action === "generate" ? job : previous?.job ?? job),
        planHash,
      };
      await client.query(`INSERT INTO app.v2_rams_draft
        (tenant_id,job_id,command_id,revision,quote_revision_id,plan_version,request_hash,snapshot,actor_membership_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [context.tenantId, jobId, command.commandId, snapshot.revision, source.quote_revision_id,
        source.plan_version, requestHash, JSON.stringify(snapshot), editor.id]);
      const verb = { generate: "generated", edit: "section_edited", sign: "signed" }[command.action];
      await appendAuditBatch(database, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${editor.id}`,
        eventType: `v2.rams_draft.${verb}`, subjectType: "job", subjectRef: jobId,
        payload: { references: { commandId: command.commandId, quoteRevisionId: source.quote_revision_id,
          draftRevision: String(snapshot.revision), planVersion: String(source.plan_version) },
        hashes: { snapshot: ramsHash(snapshot) }, classifications: { action: "operational" } } }]);
      return snapshot;
    });
  }
}
