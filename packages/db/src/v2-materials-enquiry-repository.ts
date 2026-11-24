import { createHash } from "node:crypto";
import { calculateMaterialPackCount, materialQuantityV1 } from "@jobguard/core";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { PracticeAccessError } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.uuid().transform(value => value.toLowerCase());
const version = z.number().int().min(0).max(2_147_483_646);
// The shared schema's BigInt check requires a syntactically valid decimal.
const decimal = z.string().max(40).regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,6})?$/u).pipe(materialQuantityV1);
const text = (max: number) => z.string().trim().min(1).max(max).refine(value => !value.includes("\0"));

const lineChanges = z.strictObject({
  product: text(200).nullable().optional(),
  packSize: z.strictObject({ quantity: decimal, unit: text(40) }).nullable().optional(),
  wastageMultiplier: decimal.nullable().optional(),
  setAsidePacks: z.string().regex(/^(0|[1-9][0-9]{0,8})$/u).optional(),
  supplier: text(200).nullable().optional(),
  neededBy: z.iso.date().nullable().optional(),
  suppliedBy: z.enum(["builder", "customer"]).optional(),
  notes: text(2000).nullable().optional(),
  packsOverride: z.string().regex(/^[1-9][0-9]{0,8}$/u).nullable().optional(),
  removed: z.boolean().optional(),
}).refine(changes => Object.values(changes).some(value => value !== undefined));

export const materialsQueryV1 = z.strictObject({ version: z.literal("v2-materials-query.v1") });
export const materialLineCommandV1 = z.strictObject({
  version: z.literal("v2-material-line-command.v1"),
  commandId: uuid,
  scopeItemId: uuid,
  lineKey: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/u),
  expectedVersion: version,
  changes: lineChanges,
});
export const materialEnquiryCommandV1 = z.strictObject({
  version: z.literal("v2-material-enquiry-generate.v1"),
  commandId: uuid,
  // The enquiry version the builder last saw; zero before the first one.
  expectedVersion: version,
});

export type MaterialsQuery = z.infer<typeof materialsQueryV1>;
export type MaterialLineCommand = z.infer<typeof materialLineCommandV1>;
export type MaterialEnquiryCommand = z.infer<typeof materialEnquiryCommandV1>;
type LineChanges = MaterialLineCommand["changes"];

export class MaterialsError extends Error {
  constructor(readonly code: "MATERIALS_INVALID_QUERY" | "MATERIALS_INVALID_COMMAND" | "MATERIALS_EDITOR_REQUIRED" |
    "MATERIALS_VERSION_CONFLICT" | "MATERIALS_COMMAND_CONFLICT") {
    super(code);
  }
}

type PackSize = { quantity: string; unit: string };
type MeasurementBasis = { version: number; quantity: string; unit: string; confirmed: boolean };
type LineInputs = {
  product: string | null;
  packSize: PackSize | null;
  wastageMultiplier: string | null;
  setAsidePacks: string;
  supplier: string | null;
  neededBy: string | null;
  suppliedBy: "builder" | "customer";
  notes: string | null;
  packsOverride: string | null;
  removed: boolean;
};
type LineState = LineInputs & {
  scopeItemId: string;
  lineKey: string;
  version: number;
  overrideBasisPacks: string | null;
  updatedByMembershipId: string;
  updatedAt: Date;
};
type Question = { scopeItemId: string; lineKey: string; product: string | null;
  reason: "measurement" | "product" | "pack_size" | "unit_mismatch" | "wastage_multiplier" | "set_aside_packs" |
    "supplier" | "needed_by" };
type Calculation =
  | { status: "calculated"; grossPacks: string; setAsidePacksUsed: string; calculatedPacks: string;
      neededPacks: string; builderPacks: string | null; packsClash: boolean }
  | { status: "needs_input"; reason: Question["reason"] };
type EnquiryLine = { scopeItemId: string; lineKey: string; product: string; packSize: PackSize;
  grossPacks: string; setAsidePacksUsed: string; neededPacks: string; calculatedPacks: string;
  builderPacks: string | null; packsClash: boolean; notes: string | null };
type EnquiryContent = {
  groups: { supplier: string; neededBy: string; lines: EnquiryLine[] }[];
  questions: Question[];
  customerSupplied: { scopeItemId: string; lineKey: string; product: string | null; neededBy: string | null;
    notes: string | null }[];
};
type BasisEntry = { scopeItemId: string; lineKey: string; lineVersion: number;
  measurement: MeasurementBasis | null; inputs: LineInputs };
type EnquiryRow = { version: number; commandId: string; basisDigest: string; basis: BasisEntry[];
  content: EnquiryContent; actorMembershipId: string; generatedAt: Date };

const emptyLine: LineInputs = { product: null, packSize: null, wastageMultiplier: null, setAsidePacks: "0",
  supplier: null, neededBy: null, suppliedBy: "builder", notes: null, packsOverride: null, removed: false };
// Inputs whose change alters a pack count, as opposed to how the enquiry is grouped or annotated.
const quantityChanges = new Set(["added", "measurement", "confirmation", "product", "pack_size", "wastage_multiplier",
  "set_aside_packs", "supplied_by", "packs_override", "removed"]);
const inputNames: Record<keyof LineInputs, string> = { product: "product", packSize: "pack_size",
  wastageMultiplier: "wastage_multiplier", setAsidePacks: "set_aside_packs", supplier: "supplier",
  neededBy: "needed_by", suppliedBy: "supplied_by", notes: "notes", packsOverride: "packs_override", removed: "removed" };

// Stored JSON comes back with PostgreSQL's key order, so compare canonically.
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(key =>
    `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

const lineId = (line: { scopeItemId: string; lineKey: string }) => `${line.scopeItemId}/${line.lineKey}`;
const byLine = (a: { scopeItemId: string; lineKey: string }, b: { scopeItemId: string; lineKey: string }) =>
  lineId(a) < lineId(b) ? -1 : lineId(a) > lineId(b) ? 1 : 0;

function fold(state: LineInputs, changes: LineChanges, overrideBasis: string | null): LineInputs & { overrideBasisPacks?: string | null } {
  const next: LineInputs & { overrideBasisPacks?: string | null } = { ...state };
  for (const key of Object.keys(inputNames) as (keyof LineInputs)[]) {
    if (changes[key] !== undefined) (next as Record<string, unknown>)[key] = changes[key];
  }
  if (changes.packsOverride !== undefined) next.overrideBasisPacks = changes.packsOverride === null ? null : overrideBasis;
  return next;
}

function calculate(line: LineInputs & { overrideBasisPacks: string | null }, measurement: MeasurementBasis | null): Calculation {
  const result = calculateMaterialPackCount({
    measurement,
    wastageMultiplier: line.wastageMultiplier,
    product: line.product === null ? null : { packSize: line.packSize },
    confirmedUsablePacksSetAside: BigInt(line.setAsidePacks),
  });
  if (result.status === "needs_input") return result;
  const calculatedPacks = String(result.neededPacks);
  // A builder's pack count still fits only while the sum it replaced is unchanged.
  const fits = line.packsOverride !== null && line.overrideBasisPacks === calculatedPacks;
  return { status: "calculated", grossPacks: String(result.grossPacks), setAsidePacksUsed: String(result.setAsidePacksUsed),
    calculatedPacks, neededPacks: fits ? line.packsOverride! : calculatedPacks, builderPacks: line.packsOverride,
    packsClash: line.packsOverride !== null && !fits };
}

function changedInputs(before: BasisEntry | undefined, after: BasisEntry | undefined) {
  if (!before) return ["added"];
  if (!after) return ["removed"];
  const changed: string[] = [];
  const [was, now] = [before.measurement, after.measurement];
  if (canonical(was && { quantity: was.quantity, unit: was.unit }) !== canonical(now && { quantity: now.quantity, unit: now.unit })) {
    changed.push("measurement");
  }
  if ((was?.confirmed ?? false) !== (now?.confirmed ?? false)) changed.push("confirmation");
  for (const [key, name] of Object.entries(inputNames) as [keyof LineInputs, string][]) {
    if (canonical(before.inputs[key]) !== canonical(after.inputs[key])) changed.push(name);
  }
  return changed;
}

export class MaterialsEnquiryRepository {
  constructor(private readonly pool: Pool) {}

  read(context: VerifiedTenantContext, jobId: string) {
    return withTenant(this.pool, context, async ({ $client }) => {
      const live = await this.live($client, context.tenantId, jobId);
      const latest = await this.enquiry($client, context.tenantId, jobId);
      return this.view(jobId, live, latest);
    });
  }

  async saveLine(context: VerifiedTenantContext, jobId: string, sessionId: string, input: MaterialLineCommand) {
    const parsed = materialLineCommandV1.safeParse(input);
    if (!parsed.success) throw new MaterialsError("MATERIALS_INVALID_COMMAND");
    const command = parsed.data;
    const key = [context.tenantId, jobId, command.scopeItemId, command.lineKey];
    return withTenant(this.pool, context, async ({ $client }) => {
      const actor = await this.editor($client, sessionId);
      const { rows: [scope] } = await $client.query<{ version: number }>(`
        SELECT COALESCE((
          SELECT max(expected_version) + 1 FROM app.v2_material_line
          WHERE (tenant_id, job_id, scope_item_id, line_key) = ($1, $2, $3, $4)
        ), 0) AS version
        FROM app.scope_identity
        WHERE (tenant_id, job_id, id) = ($1, $2, $3) AND state <> 'retired'
        FOR SHARE
      `, key);
      if (!scope) throw new PracticeAccessError("NOT_FOUND");

      if (scope.version === command.expectedVersion) {
        let basis: string | null = null;
        if (command.changes.packsOverride) {
          const live = await this.live($client, context.tenantId, jobId);
          const prior = live.lines.find(line => lineId(line) === lineId(command)) ?? { ...emptyLine, overrideBasisPacks: null };
          const next = fold(prior, command.changes, null);
          const calculation = calculate({ ...next, overrideBasisPacks: null }, live.measurements.get(command.scopeItemId) ?? null);
          basis = calculation.status === "calculated" ? calculation.calculatedPacks : null;
        }
        // Uniqueness arbitrates concurrent edits and exact retries at the same version.
        const { rows: [saved] } = await $client.query<LineReceipt>(`
          INSERT INTO app.v2_material_line (tenant_id, job_id, scope_item_id, line_key, expected_version, command_id,
            changes, override_basis_packs, actor_membership_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT DO NOTHING RETURNING ${lineReceipt}
        `, [...key, command.expectedVersion, command.commandId, JSON.stringify(command.changes), basis, actor]);
        if (saved) return saved;
      }

      const { rows: [prior] } = await $client.query<LineReceipt & { matches: boolean }>(`
        SELECT ${lineReceipt}, (scope_item_id, line_key, expected_version, changes, actor_membership_id)
          = ($3::uuid, $4::varchar, $5::integer, $6::jsonb, $7::uuid) AS matches
        FROM app.v2_material_line WHERE (tenant_id, job_id, command_id) = ($1, $2, $8)
      `, [context.tenantId, jobId, command.scopeItemId, command.lineKey, command.expectedVersion,
        JSON.stringify(command.changes), actor, command.commandId]);
      if (!prior) throw new MaterialsError("MATERIALS_VERSION_CONFLICT");
      const { matches, ...receipt } = prior;
      if (!matches) throw new MaterialsError("MATERIALS_COMMAND_CONFLICT");
      return receipt;
    });
  }

  async generate(context: VerifiedTenantContext, jobId: string, sessionId: string, input: MaterialEnquiryCommand) {
    const parsed = materialEnquiryCommandV1.safeParse(input);
    if (!parsed.success) throw new MaterialsError("MATERIALS_INVALID_COMMAND");
    const command = parsed.data;
    return withTenant(this.pool, context, async ({ $client }) => {
      const actor = await this.editor($client, sessionId);
      const replayed = await this.enquiry($client, context.tenantId, jobId, { commandId: command.commandId });
      const live = await this.live($client, context.tenantId, jobId);
      if (replayed) {
        if (replayed.version !== command.expectedVersion + 1 || replayed.actorMembershipId !== actor) {
          throw new MaterialsError("MATERIALS_COMMAND_CONFLICT");
        }
        return this.view(jobId, live, replayed);
      }

      const latest = await this.enquiry($client, context.tenantId, jobId);
      // Generating from unchanged inputs returns the enquiry that is already current.
      if (latest?.basisDigest === live.digest) return this.view(jobId, live, latest);
      if ((latest?.version ?? 0) !== command.expectedVersion) throw new MaterialsError("MATERIALS_VERSION_CONFLICT");
      const inserted = await $client.query(`
        INSERT INTO app.v2_material_enquiry (tenant_id, job_id, version, command_id, basis_digest, basis, content,
          actor_membership_id)
        SELECT tenant_id, id, $3, $4, $5, $6, $7, $8 FROM app.job WHERE (tenant_id, id) = ($1, $2)
        ON CONFLICT DO NOTHING
      `, [context.tenantId, jobId, command.expectedVersion + 1, command.commandId, live.digest,
        JSON.stringify(live.basis), JSON.stringify(live.content), actor]);
      if (!inserted.rowCount) {
        // A concurrent generate or an exact retry won the same version.
        const winner = await this.enquiry($client, context.tenantId, jobId, { version: command.expectedVersion + 1 });
        if (winner?.commandId === command.commandId && winner.actorMembershipId === actor) return this.view(jobId, live, winner);
        if (winner?.basisDigest === live.digest) return this.view(jobId, live, winner);
        throw new MaterialsError("MATERIALS_VERSION_CONFLICT");
      }
      const saved = await this.enquiry($client, context.tenantId, jobId, { commandId: command.commandId });
      return this.view(jobId, live, saved!);
    });
  }

  private async editor(client: PoolClient, sessionId: string) {
    const digest = createHash("sha256").update(sessionId).digest("hex");
    const { rows: [actor] } = await client.query<{ id: string | null }>("SELECT app.v2_work_plan_editor($1) AS id", [digest]);
    if (!actor?.id) throw new MaterialsError("MATERIALS_EDITOR_REQUIRED");
    return actor.id;
  }

  private async enquiry(client: PoolClient, tenantId: string, jobId: string,
    where: { commandId?: string; version?: number } = {}) {
    const { rows: [row] } = await client.query<EnquiryRow>(`
      SELECT version, command_id AS "commandId", basis_digest AS "basisDigest", basis, content,
        actor_membership_id AS "actorMembershipId", generated_at AS "generatedAt"
      FROM app.v2_material_enquiry
      WHERE (tenant_id, job_id) = ($1, $2) AND ($3::uuid IS NULL OR command_id = $3) AND ($4::integer IS NULL OR version = $4)
      ORDER BY version DESC LIMIT 1
    `, [tenantId, jobId, where.commandId ?? null, where.version ?? null]);
    return row;
  }

  // Folds the builder's line revisions and the latest measurements into today's inputs and sums.
  private async live(client: PoolClient, tenantId: string, jobId: string) {
    const { rows: revisions } = await client.query<{ scopeItemId: string; lineKey: string; expectedVersion: number;
      changes: LineChanges; overrideBasisPacks: string | null; actorMembershipId: string; recordedAt: Date }>(`
      SELECT l.scope_item_id AS "scopeItemId", l.line_key AS "lineKey", l.expected_version AS "expectedVersion",
        l.changes, l.override_basis_packs::text AS "overrideBasisPacks", l.actor_membership_id AS "actorMembershipId",
        l.recorded_at AS "recordedAt"
      FROM app.v2_material_line l JOIN app.scope_identity s
        ON (s.tenant_id, s.job_id, s.id) = (l.tenant_id, l.job_id, l.scope_item_id)
      WHERE (l.tenant_id, l.job_id) = ($1, $2) AND s.state <> 'retired'
      ORDER BY l.scope_item_id, l.line_key, l.expected_version
    `, [tenantId, jobId]);
    const { rows: measured } = await client.query<MeasurementBasis & { scopeItemId: string }>(`
      SELECT DISTINCT ON (scope_item_id) scope_item_id AS "scopeItemId", expected_version + 1 AS version,
        quantity, unit, confirmed
      FROM app.v2_measurement WHERE (tenant_id, job_id) = ($1, $2)
      ORDER BY scope_item_id, expected_version DESC
    `, [tenantId, jobId]);
    const measurements = new Map(measured.map(({ scopeItemId, ...measurement }) => [scopeItemId, measurement]));

    const states = new Map<string, LineState>();
    for (const revision of revisions) {
      const id = lineId(revision);
      const prior = states.get(id) ?? { ...emptyLine, overrideBasisPacks: null };
      const { overrideBasisPacks, ...inputs } = fold(prior, revision.changes, revision.overrideBasisPacks);
      states.set(id, { ...prior, ...inputs, overrideBasisPacks: overrideBasisPacks === undefined ? prior.overrideBasisPacks : overrideBasisPacks,
        scopeItemId: revision.scopeItemId, lineKey: revision.lineKey, version: revision.expectedVersion + 1,
        updatedByMembershipId: revision.actorMembershipId, updatedAt: revision.recordedAt });
    }

    const lines = [...states.values()].sort(byLine).map(line => {
      const measurement = measurements.get(line.scopeItemId) ?? null;
      return { ...line, measurement, calculation: calculate(line, measurement) };
    });
    const basis: BasisEntry[] = lines.map(({ scopeItemId, lineKey, version: lineVersion, measurement, ...line }) => ({
      scopeItemId, lineKey, lineVersion, measurement,
      inputs: Object.fromEntries(Object.keys(emptyLine).map(key => [key, line[key as keyof LineInputs]])) as LineInputs,
    }));
    const digest = createHash("sha256").update(canonical(basis)).digest("hex");

    const content: EnquiryContent = { groups: [], questions: [], customerSupplied: [] };
    const groups = new Map<string, EnquiryContent["groups"][number]>();
    for (const line of lines) {
      if (line.removed) continue;
      const { scopeItemId, lineKey, product, neededBy, notes, calculation } = line;
      // Customer-supplied items are listed apart and never enter a question to a merchant.
      if (line.suppliedBy === "customer") {
        content.customerSupplied.push({ scopeItemId, lineKey, product, neededBy, notes });
        continue;
      }
      if (calculation.status === "needs_input") {
        content.questions.push({ scopeItemId, lineKey, product, reason: calculation.reason });
        continue;
      }
      if (line.supplier === null || neededBy === null) {
        content.questions.push({ scopeItemId, lineKey, product, reason: line.supplier === null ? "supplier" : "needed_by" });
        continue;
      }
      const groupKey = canonical([line.supplier, neededBy]);
      const group = groups.get(groupKey) ?? { supplier: line.supplier, neededBy, lines: [] };
      groups.set(groupKey, group);
      const { status: _status, ...packs } = calculation;
      group.lines.push({ scopeItemId, lineKey, product: product!, packSize: line.packSize!, ...packs, notes });
    }
    content.groups = [...groups.values()].sort((a, b) =>
      a.supplier.localeCompare(b.supplier, "en-GB") || (a.neededBy < b.neededBy ? -1 : a.neededBy > b.neededBy ? 1 : 0));
    return { lines, measurements, basis, digest, content };
  }

  private view(jobId: string, live: Awaited<ReturnType<MaterialsEnquiryRepository["live"]>>, row: EnquiryRow | undefined) {
    const lines = live.lines.map(({ overrideBasisPacks: _basis, ...line }) => line);
    if (!row) return { jobId, lines, enquiry: null };
    const before = new Map(row.basis.map(entry => [lineId(entry), entry]));
    const after = new Map(live.basis.map(entry => [lineId(entry), entry]));
    const outOfDate = [...new Set([...before.keys(), ...after.keys()])].sort().flatMap(id => {
      const changed = changedInputs(before.get(id), after.get(id));
      if (!changed.length) return [];
      const { scopeItemId, lineKey } = (after.get(id) ?? before.get(id))!;
      return [{ scopeItemId, lineKey, changed, quantities: changed.some(name => quantityChanges.has(name)) }];
    });
    return { jobId, lines, enquiry: { version: row.version, commandId: row.commandId, generatedAt: row.generatedAt,
      generatedByMembershipId: row.actorMembershipId, current: row.basisDigest === live.digest, outOfDate,
      ...row.content } };
  }
}

type LineReceipt = { commandId: string; scopeItemId: string; lineKey: string; expectedVersion: number; version: number;
  actorMembershipId: string; recordedAt: Date };
const lineReceipt = `command_id AS "commandId", scope_item_id AS "scopeItemId", line_key AS "lineKey",
  expected_version AS "expectedVersion", expected_version + 1 AS version, actor_membership_id AS "actorMembershipId",
  recorded_at AS "recordedAt"`;

export type MaterialsView = Awaited<ReturnType<MaterialsEnquiryRepository["read"]>>;
