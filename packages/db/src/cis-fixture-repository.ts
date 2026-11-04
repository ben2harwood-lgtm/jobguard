import type { Pool } from "pg";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { appendCisFixtureStatement, cisFixtureBookV1, reconcileCisFixtures, CisDeductionError,
  CIS_FIXTURE_LABEL, CIS_POLICY_VERSION, type CisFixtureBook } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext, type TenantTransaction } from "./tenant-context.js";

const id = z.guid().transform(value => value.toLowerCase());
const actorV1 = z.object({ membershipId: id, identityUserId: id }).strict();
const fixtureV1 = cisFixtureBookV1.omit({ tenantId: true, jobId: true }).extend({
  statements: cisFixtureBookV1.shape.statements.length(1),
  verifications: z.array(cisFixtureBookV1.shape.verifications.element).max(1000),
});
const commandV1 = z.object({ version: z.literal("cis.persist-fixture.v1"), commandId: id, jobId: id, fixture: fixtureV1 }).strict();
const fixedV1 = cisFixtureBookV1.omit({ statements: true, payments: true, verifications: true });
const payloadV1 = z.object({ fixed: fixedV1.nullable(),
  statement: cisFixtureBookV1.shape.statements.element,
  payments: cisFixtureBookV1.shape.payments, verifications: z.array(cisFixtureBookV1.shape.verifications.element).max(1000),
}).strict();
const recordV1 = z.object({ commandId: id, actor: actorV1, requestHash: z.string().regex(/^[a-f0-9]{64}$/u),
  recordHash: z.string().regex(/^[a-f0-9]{64}$/u), intact: z.literal(true),
  environment: z.literal("synthetic"), label: z.literal(CIS_FIXTURE_LABEL),
  policyVersion: z.literal(CIS_POLICY_VERSION), rateNumerator: z.number().int(), rateDenominator: z.literal(100),
  payload: payloadV1 }).strict();

export class CisFixturePersistenceError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "NOT_FOUND" | "CONFLICT" | "UNAVAILABLE") {
    super(`CIS_FIXTURE_${code}`); this.name = "CisFixturePersistenceError";
  }
}
function fail(code: CisFixturePersistenceError["code"]): never { throw new CisFixturePersistenceError(code); }

/** Dark fixture lineage only. Neither identity-shaped fixture fields nor hashes prove HMRC/human approval. */
export class CisFixtureRepository {
  constructor(private readonly pool: Pool) {}
  private async guarded<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch (error) {
      if (error instanceof CisFixturePersistenceError || error instanceof CisDeductionError) throw error;
      const message = error instanceof Error ? error.message : "";
      if (message === "CIS_FIXTURE_NOT_FOUND") fail("NOT_FOUND");
      if (message === "CIS_FIXTURE_CONFLICT" || (error as { code?: string })?.code === "23505") fail("CONFLICT");
      fail("UNAVAILABLE");
    }
  }
  private async rows(db: TenantTransaction, context: VerifiedTenantContext, jobId: string) {
    const result: unknown = (await db.$client.query("SELECT app.cis_fixture_records($1,$2,NULL,NULL) result",
      [context.tenantId, jobId])).rows[0]?.result;
    return z.array(recordV1).max(1000).parse(result);
  }
  private rebuild(records: z.infer<typeof recordV1>[], tenantId: string, jobId: string) {
    const fixed = records[0]?.payload.fixed;
    if (!fixed || fixed.tenantId !== tenantId || fixed.jobId !== jobId) fail("UNAVAILABLE");
    if (records.slice(1).some(row => row.payload.fixed !== null)) fail("UNAVAILABLE");
    const book = cisFixtureBookV1.parse({ ...fixed,
      verifications: records.flatMap(row => row.payload.verifications), payments: records.flatMap(row => row.payload.payments),
      statements: records.map(row => row.payload.statement) });
    const reconciliation = reconcileCisFixtures(book);
    records.forEach((row, index) => {
      if (row.rateNumerator !== reconciliation.statements[index]!.rateNumerator) fail("UNAVAILABLE");
    });
    return { environment: "synthetic" as const, label: CIS_FIXTURE_LABEL,
      lineage: "fixture lineage only; no verified evidence, HMRC verification or human approval is asserted" as const,
      records, book, reconciliation };
  }
  async read(context: VerifiedTenantContext, jobId: string) {
    const parsed = id.safeParse(jobId); if (!parsed.success) fail("INVALID_INPUT");
    return this.guarded(() => withTenant(this.pool, context, async db => {
      const records = await this.rows(db, context, parsed.data);
      if (!records.length) fail("NOT_FOUND");
      return this.rebuild(records, context.tenantId, parsed.data);
    }));
  }
  async command(context: VerifiedTenantContext, actor: z.infer<typeof actorV1>, raw: unknown) {
    const input = commandV1.safeParse(raw), principal = actorV1.safeParse(actor);
    if (!input.success || !principal.success) fail("INVALID_INPUT");
    return this.guarded(() => withTenant(this.pool, context, async db => {
      // The SQL read takes this same transaction-scoped book lock, including an empty book.
      const records = await this.rows(db, context, input.data.jobId);
      const { statements, payments, verifications, ...suppliedFixed } = input.data.fixture;
      const fixed = { ...suppliedFixed, tenantId: context.tenantId, jobId: input.data.jobId };
      if (records.length && !isDeepStrictEqual(records[0]!.payload.fixed, fixed)) fail("CONFLICT");
      const request = { ...input.data, actor: principal.data };
      const requestHash = (await db.$client.query("SELECT app.final_lock_hash($1::jsonb) hash", [JSON.stringify(request)])).rows[0]?.hash as string;
      const prior = records.find(row => row.commandId === input.data.commandId);
      if (prior) {
        if (prior.requestHash !== requestHash) fail("CONFLICT");
        // SQL authenticates again even for an exact retry; a revoked actor cannot replay.
        await db.$client.query("SELECT app.cis_fixture_records($1,$2,$3::jsonb,$4::jsonb)",
          [context.tenantId, input.data.jobId, JSON.stringify(principal.data), JSON.stringify({ ...prior.payload,
            commandId: input.data.commandId, requestHash, rateNumerator: prior.rateNumerator })]);
        return this.rebuild(records, context.tenantId, input.data.jobId);
      }
      const previous = records.length ? this.rebuild(records, context.tenantId, input.data.jobId).book : null;
      const full: CisFixtureBook = { ...fixed, verifications: [...(previous?.verifications ?? []), ...verifications],
        payments: [...(previous?.payments ?? []), ...payments], statements: [...(previous?.statements ?? []), ...statements] };
      // append's exact-retry branch validates the complete candidate history, including newly linked payments.
      const book = appendCisFixtureStatement(full, statements[0]);
      const result = reconcileCisFixtures(book).statements.at(-1)!;
      const payload = { fixed: previous ? null : fixed, statement: statements[0]!, payments, verifications };
      await db.$client.query("SELECT app.cis_fixture_records($1,$2,$3::jsonb,$4::jsonb)",
        [context.tenantId, input.data.jobId, JSON.stringify(principal.data), JSON.stringify({ ...payload,
          commandId: input.data.commandId, requestHash, rateNumerator: result.rateNumerator })]);
      return this.rebuild(await this.rows(db, context, input.data.jobId), context.tenantId, input.data.jobId);
    }));
  }
}
