import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { appendAuditBatch } from "./audit.js";
import { QUOTE_SCOPE_LOCK_SQL } from "./quote-repository.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

// V2-C6. The builder adds a line to a priced quote before it is sent. The line is a new confirmed
// scope item, made the way review confirmation makes one (scope identity, first scope revision,
// scope progress). It carries no price: it reaches the quote only through the builder's next
// "Save draft revision", so totals, hashes and the missing_scope blocker work unchanged. A preview or send of
// an older revision is refused on the server (missing_scope), because coverage is checked under the same job lock.
export const quoteAddLineCommandV1 = z.object({
  version: z.literal("v2-quote-add-line.v1"),
  commandId: z.guid({ error: "Invalid uuid" }),
  description: z.string().trim().min(1).max(500),
  promptId: z.string().regex(/^[a-z0-9-]{1,40}$/u).optional(),
}).strict();
export type QuoteAddLineCommand = z.infer<typeof quoteAddLineCommandV1>;
export type QuoteAddLineReceipt = {
  version: "v2-quote-add-line-receipt.v1"; scopeItemId: string; scopeRevisionId: string; description: string; replayed: boolean;
};

export type QuoteAddLineErrorCode = "QUOTE_ADD_LINE_INVALID" | "QUOTE_NOT_EDITABLE" | "QUOTE_COMMAND_CONFLICT" | "QUOTE_EDITOR_REQUIRED";
export class QuoteAddLineError extends Error {
  constructor(readonly code: QuoteAddLineErrorCode) { super(code); this.name = "QuoteAddLineError"; }
}

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
// A UUID taken from a digest (version 8, RFC 9562 variant), so the same command always names the same rows.
function digestUuid(value: string) {
  const hex = sha256(value).slice(0, 32).split("");
  hex[12] = "8";
  hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * The command record lives in the rows it makes, so no new table is needed:
 * - the scope item id comes from (tenant, command id), so a command id names one item;
 * - the first scope revision id comes from that and the request digest (job, description, prompt),
 *   so a different body under the same command id finds no matching revision and is a conflict.
 */
export function quoteAddLineIds(tenantId: string, jobId: string, command: QuoteAddLineCommand) {
  const requestHash = sha256(JSON.stringify({ jobId, description: command.description, promptId: command.promptId ?? null }));
  return {
    requestHash,
    scopeItemId: digestUuid(`v2-quote-add-line:item:${tenantId}:${command.commandId}`),
    scopeRevisionId: digestUuid(`v2-quote-add-line:revision:${tenantId}:${command.commandId}:${requestHash}`),
  };
}

export class QuoteAddLineRepository {
  constructor(private readonly pool: Pool) {}

  async addLine(context: VerifiedTenantContext, jobId: string, sessionId: string, input: unknown): Promise<QuoteAddLineReceipt> {
    const parsed = quoteAddLineCommandV1.safeParse(input);
    if (!parsed.success) throw new QuoteAddLineError("QUOTE_ADD_LINE_INVALID");
    const command = parsed.data;
    const ids = quoteAddLineIds(context.tenantId, jobId, command);
    return withTenant(this.pool, context, async database => {
      const { $client: client } = database;
      const editor = await this.editor(client, sessionId);
      // One command id at a time, then one add or save at a time on this job's quote.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('v2_quote_add_line_command:' || $1))", [command.commandId]);
      // The same job lock that every quote preview and send takes before it checks scope coverage.
      await client.query(QUOTE_SCOPE_LOCK_SQL, [jobId]);
      await client.query("SELECT id FROM app.quote_draft WHERE tenant_id=$1 AND job_id=$2 FOR UPDATE", [context.tenantId, jobId]);

      const replay = await this.replay(client, context.tenantId, jobId, ids, command.description);
      if (replay) return replay;
      await this.assertEditable(client, context.tenantId, jobId);

      await client.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",
        [ids.scopeItemId, context.tenantId, jobId]);
      // Unpriced: the price is the builder's, on the quote line. Scope revisions require a number, so 0.
      await client.query(`INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,
        unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,$5,'1','item',0,0)`,
      [ids.scopeRevisionId, context.tenantId, jobId, ids.scopeItemId, command.description]);
      await client.query("INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id) VALUES($1,$2,$3)",
        [context.tenantId, jobId, ids.scopeItemId]);
      await appendAuditBatch(database, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${editor}`,
        eventType: "v2.quote.line_added", subjectType: "job", subjectRef: jobId,
        payload: {
          references: { commandId: command.commandId, jobId, scopeItemId: ids.scopeItemId, scopeRevisionId: ids.scopeRevisionId,
            ...(command.promptId && { promptId: command.promptId }) },
          // The description stays out of the payload; only the request digest is kept.
          hashes: { request: ids.requestHash },
          classifications: { action: "commercial" },
        } }]);
      return { version: "v2-quote-add-line-receipt.v1", scopeItemId: ids.scopeItemId, scopeRevisionId: ids.scopeRevisionId,
        description: command.description, replayed: false };
    });
  }

  private async replay(client: PoolClient, tenantId: string, jobId: string, ids: ReturnType<typeof quoteAddLineIds>,
    description: string): Promise<QuoteAddLineReceipt | null> {
    const { rows: [item] } = await client.query<{ job_id: string }>("SELECT job_id FROM app.scope_identity WHERE tenant_id=$1 AND id=$2",
      [tenantId, ids.scopeItemId]);
    if (!item) return null;
    const { rows: [revision] } = await client.query<{ id: string }>(`SELECT id FROM app.scope_revision
      WHERE tenant_id=$1 AND job_id=$2 AND scope_item_id=$3 AND revision=1 AND id=$4`, [tenantId, jobId, ids.scopeItemId, ids.scopeRevisionId]);
    if (item.job_id !== jobId || !revision) throw new QuoteAddLineError("QUOTE_COMMAND_CONFLICT");
    return { version: "v2-quote-add-line-receipt.v1", scopeItemId: ids.scopeItemId, scopeRevisionId: ids.scopeRevisionId,
      description, replayed: true };
  }

  // Only before the quote leaves: the job is still quoting, nothing is accepted, and the newest
  // quote document (if any) has not been sent. After that a new line is a change, never an edit.
  private async assertEditable(client: PoolClient, tenantId: string, jobId: string) {
    const { rows: [state] } = await client.query<{ editable: boolean }>(`SELECT j.status='quoting' AND j.accepted_quote_version_id IS NULL
        AND NOT EXISTS(SELECT 1 FROM app.quote_acceptance a WHERE (a.tenant_id,a.job_id)=(j.tenant_id,j.id))
        AND NOT EXISTS(SELECT 1 FROM app.quote_send s WHERE (s.tenant_id,s.job_id)=(j.tenant_id,j.id)) AS editable
      FROM app.job j WHERE j.tenant_id=$1 AND j.id=$2`, [tenantId, jobId]);
    if (!state?.editable) throw new QuoteAddLineError("QUOTE_NOT_EDITABLE");
  }

  // The signed-in person's membership, resolved from their verified credential and bound firm (as F8).
  private async editor(client: PoolClient, sessionId: string) {
    const digest = sha256(sessionId);
    const { rows: [editor] } = await client.query<{ id: string | null }>("SELECT app.v2_work_plan_editor($1) AS id", [digest]);
    if (!editor?.id) throw new QuoteAddLineError("QUOTE_EDITOR_REQUIRED");
    return editor.id;
  }
}
