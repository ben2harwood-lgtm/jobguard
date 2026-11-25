import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { appendAuditBatch } from "./audit.js";
import { nextStockMaterialBasis, type StockMaterialBasis, type StockMaterialChanges } from "./v2-stock-material-basis.js";
import { MaterialsEnquiryRepository } from "./v2-materials-enquiry-repository.js";
import { PracticeAccessError } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.uuid().transform(value => value.toLowerCase());
const packs = z.string().regex(/^[1-9][0-9]{0,8}$/u);
const envelope = {
  version: z.literal("v2-stock-command.v1"), commandId: uuid, deliveryId: uuid,
  expectedVersion: z.number().int().min(0).max(2_147_483_646),
};
export const stockQueryV1 = z.strictObject({ version: z.literal("v2-stock-query.v1") });
export const stockCommandV1 = z.discriminatedUnion("action", [
  z.strictObject({ ...envelope, action: z.literal("add_forecast"), scopeItemId: uuid,
    lineKey: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/u),
    supplier: z.string().trim().min(1).max(200).refine(value => !value.includes("\0")),
    packsExpected: packs, forecastDate: z.iso.date() }),
  z.strictObject({ ...envelope, action: z.literal("confirm_date"), confirmedDate: z.iso.date() }),
  z.strictObject({ ...envelope, action: z.literal("record_receipt"), packsReceived: packs }),
]);
export type StockCommand = z.infer<typeof stockCommandV1>;
export type StockQuery = z.infer<typeof stockQueryV1>;
export class StockError extends Error {
  constructor(readonly code: "STOCK_INVALID_COMMAND" | "STOCK_INVALID_QUERY" | "STOCK_EDITOR_REQUIRED" |
    "STOCK_VERSION_CONFLICT" | "STOCK_COMMAND_CONFLICT" | "STOCK_INVALID_TRANSITION" | "STOCK_RECEIPT_EXCEEDS_EXPECTED") {
    super(code);
  }
}

type Delivery = {
  deliveryId: string; scopeItemId: string; lineKey: string; materialLineRevision: number;
  version: number; commandId: string; supplier: string; packsExpected: string; forecastDate: string;
  confirmedDate: string | null; status: "forecast" | "date_confirmed" | "delivered"; packsReceived: string;
  receivedByMembershipId: string | null; receivedAt: Date | null; actorMembershipId: string; recordedAt: Date;
};
const columns = `delivery_id AS "deliveryId", scope_item_id AS "scopeItemId", line_key AS "lineKey",
  material_line_revision AS "materialLineRevision", expected_version + 1 AS version, command_id AS "commandId",
  supplier, packs_expected::text AS "packsExpected", forecast_date::text AS "forecastDate",
  confirmed_date::text AS "confirmedDate", status, packs_received::text AS "packsReceived",
  received_by_membership_id AS "receivedByMembershipId", received_at AS "receivedAt",
  actor_membership_id AS "actorMembershipId", recorded_at AS "recordedAt"`;

/** Only physically received packs enter stock; a confirmed date still promises no stock. */
export function stockPosition(setAsidePacks: string, requiredPacks: string | null, receipts: readonly string[]) {
  const receivedPacks = receipts.reduce((total, value) => total + BigInt(value), 0n);
  const available = BigInt(setAsidePacks) + receivedPacks;
  const short = requiredPacks === null ? null : BigInt(requiredPacks) - available;
  return { setAsidePacks, receivedPacks: String(receivedPacks), availablePacks: String(available), requiredPacks,
    shortPacks: short === null ? null : String(short > 0n ? short : 0n) };
}

export class StockRepository {
  constructor(private readonly pool: Pool) {}

  async read(context: VerifiedTenantContext, jobId: string) {
    // D3 remains the single source for material inputs and its exact pack calculation.
    const materials = await new MaterialsEnquiryRepository(this.pool).read(context, jobId);
    return withTenant(this.pool, context, async ({ $client }) => {
      const { rows: deliveries } = await $client.query<Delivery>(`
        SELECT DISTINCT ON (delivery_id) ${columns} FROM app.v2_stock_delivery
        WHERE (tenant_id, job_id) = ($1,$2) ORDER BY delivery_id, expected_version DESC
      `, [context.tenantId, jobId]);
      // D3's current view identifies the exact material version we are displaying. Ignore edits
      // newer than that view if one arrived between the two reads.
      const active = materials.lines.filter(line => !line.removed);
      const key = (line: { scopeItemId: string; lineKey: string }) => line.scopeItemId + "/" + line.lineKey;
      const currentVersions = new Map(active.map(line => [key(line), line.version - 1]));
      const { rows: revisions } = await $client.query<{ scopeItemId: string; lineKey: string;
        revision: number; changes: StockMaterialChanges }>(`
        SELECT scope_item_id AS "scopeItemId", line_key AS "lineKey", expected_version AS revision, changes
        FROM app.v2_material_line WHERE (tenant_id, job_id) = ($1,$2)
        ORDER BY scope_item_id, line_key, expected_version
      `, [context.tenantId, jobId]);
      const bases = new Map<string, StockMaterialBasis>();
      for (const edit of revisions) {
        const id = key(edit);
        if (edit.revision <= (currentVersions.get(id) ?? -1)) {
          bases.set(id, nextStockMaterialBasis(bases.get(id), edit.changes, edit.revision));
        }
      }
      const lines = active.map(line => {
        const basis = bases.get(key(line));
        const since = basis?.product != null && basis.packSize != null ? basis.since : null;
        const receipts = since == null ? [] : deliveries.filter(delivery => delivery.scopeItemId === line.scopeItemId &&
          delivery.lineKey === line.lineKey && delivery.materialLineRevision >= since &&
          delivery.materialLineRevision < line.version).map(delivery => delivery.packsReceived);
        return { scopeItemId: line.scopeItemId, lineKey: line.lineKey, product: line.product,
          ...stockPosition(basis && since != null ? basis.confirmedSetAside : "0",
            line.calculation.status === "calculated" ? line.calculation.grossPacks : null, receipts) };
      });
      return { jobId, lines, deliveries };
    });
  }

  async execute(context: VerifiedTenantContext, jobId: string, sessionId: string, raw: StockCommand) {
    const parsed = stockCommandV1.safeParse(raw);
    if (!parsed.success) throw new StockError("STOCK_INVALID_COMMAND");
    const command = parsed.data;
    return withTenant(this.pool, context, async database => {
      const { $client } = database;
      const digest = createHash("sha256").update(sessionId).digest("hex");
      const { rows: [editor] } = await $client.query<{ id: string | null }>("SELECT app.v2_work_plan_editor($1) AS id", [digest]);
      if (!editor?.id) throw new StockError("STOCK_EDITOR_REQUIRED");
      const actor = editor.id;
      // Serialize a job's delivery appends before inspecting replay and revision state.
      // This domain lock precedes the audit head, which is always the final lock.
      await $client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`v2-stock/${context.tenantId}/${jobId}`]);
      const { rowCount } = await $client.query("SELECT id FROM app.job WHERE (tenant_id,id)=($1,$2)",
        [context.tenantId, jobId]);
      if (!rowCount) throw new PracticeAccessError("NOT_FOUND");
      const { rows: [replay] } = await $client.query<Delivery & { matches: boolean }>(`
        SELECT ${columns}, command = $4::jsonb AND actor_membership_id = $5::uuid AS matches
        FROM app.v2_stock_delivery WHERE (tenant_id,job_id,command_id)=($1,$2,$3)
      `, [context.tenantId, jobId, command.commandId, JSON.stringify(command), actor]);
      if (replay) {
        const { matches, ...receipt } = replay;
        if (!matches) throw new StockError("STOCK_COMMAND_CONFLICT");
        return receipt;
      }
      const { rows: [prior] } = await $client.query<Delivery>(`
        SELECT ${columns} FROM app.v2_stock_delivery WHERE (tenant_id,job_id,delivery_id)=($1,$2,$3)
        ORDER BY expected_version DESC LIMIT 1
      `, [context.tenantId, jobId, command.deliveryId]);
      if ((prior?.version ?? 0) !== command.expectedVersion) throw new StockError("STOCK_VERSION_CONFLICT");
      let next: Pick<Delivery, "scopeItemId" | "lineKey" | "materialLineRevision" | "supplier" | "packsExpected" |
        "forecastDate" | "confirmedDate" | "status" | "packsReceived" | "receivedByMembershipId" | "receivedAt">;
      if (command.action === "add_forecast") {
        if (prior) throw new StockError("STOCK_INVALID_TRANSITION");
        const { rows: [line] } = await $client.query<{ revision: number }>(`
          SELECT max(l.expected_version) AS revision FROM app.v2_material_line l JOIN app.scope_identity s
            ON (s.tenant_id,s.job_id,s.id)=(l.tenant_id,l.job_id,l.scope_item_id)
          WHERE (l.tenant_id,l.job_id,l.scope_item_id,l.line_key)=($1,$2,$3,$4) AND s.state <> 'retired'
          HAVING count(*) > 0 AND COALESCE((array_agg((l.changes->>'removed')::boolean
            ORDER BY l.expected_version DESC) FILTER (WHERE l.changes ? 'removed'))[1],false) = false
        `, [context.tenantId, jobId, command.scopeItemId, command.lineKey]);
        if (!line) throw new PracticeAccessError("NOT_FOUND");
        next = { scopeItemId: command.scopeItemId, lineKey: command.lineKey, materialLineRevision: line.revision,
          supplier: command.supplier, packsExpected: command.packsExpected, forecastDate: command.forecastDate,
          confirmedDate: null, status: "forecast", packsReceived: "0", receivedByMembershipId: null, receivedAt: null };
      } else {
        if (!prior) throw new PracticeAccessError("NOT_FOUND");
        next = { ...prior };
        if (command.action === "confirm_date") {
          if (prior.status === "delivered") throw new StockError("STOCK_INVALID_TRANSITION");
          next.confirmedDate = command.confirmedDate;
          next.status = "date_confirmed";
        } else {
          const received = BigInt(prior.packsReceived) + BigInt(command.packsReceived);
          if (received > BigInt(prior.packsExpected)) throw new StockError("STOCK_RECEIPT_EXCEEDS_EXPECTED");
          next.packsReceived = String(received);
          next.status = "delivered";
          next.receivedByMembershipId = actor;
          // Server time, rather than a caller-supplied receipt timestamp.
          next.receivedAt = new Date();
        }
      }
      const { rows: [saved] } = await $client.query<Delivery>(`
        INSERT INTO app.v2_stock_delivery (tenant_id,job_id,delivery_id,scope_item_id,line_key,material_line_revision,
          expected_version,command_id,command,supplier,packs_expected,forecast_date,confirmed_date,status,packs_received,
          received_by_membership_id,received_at,actor_membership_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING ${columns}
      `, [context.tenantId, jobId, command.deliveryId, next.scopeItemId, next.lineKey, next.materialLineRevision,
        command.expectedVersion, command.commandId, JSON.stringify(command), next.supplier, next.packsExpected,
        next.forecastDate, next.confirmedDate, next.status, next.packsReceived, next.receivedByMembershipId, next.receivedAt, actor]);
      const verb = { add_forecast: "forecast_added", confirm_date: "date_confirmed", record_receipt: "receipt_recorded" }[command.action];
      await appendAuditBatch(database, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`,
        eventType: `v2.stock.${verb}`, subjectType: "job", subjectRef: jobId,
        payload: { references: { commandId: command.commandId, deliveryId: command.deliveryId,
          scopeItemId: saved!.scopeItemId, lineKey: saved!.lineKey, deliveryVersion: String(saved!.version) },
        hashes: { command: createHash("sha256").update(JSON.stringify(command)).digest("hex") },
        classifications: { action: "operational" } } }]);
      return saved!;
    });
  }
}
export type StockView = Awaited<ReturnType<StockRepository["read"]>>;
