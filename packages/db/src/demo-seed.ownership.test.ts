import type { Pool } from "pg";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { VerifiedTenantContext } from "./tenant-context.js";

const fixture = vi.hoisted(() => ({
 query: vi.fn(), issue: vi.fn(), authenticate: vi.fn(), preview: vi.fn(), start: vi.fn(),
 saveDraft: vi.fn(), send: vi.fn(), execute: vi.fn(),
}));
vi.mock("./tenant-context.js", () => ({
 withTenant: async (_pool: unknown, _context: unknown, fn: (db: unknown) => unknown) => fn({ $client: { query: fixture.query } }),
}));
vi.mock("./synthetic-party-fixture.js", () => ({ seedSyntheticPartyFixture: vi.fn() }));
vi.mock("./practice-session.js", () => ({ issuePracticeSession: fixture.issue, authenticatePracticeSession: fixture.authenticate }));
vi.mock("./quote-repository.js", () => ({ QuoteRepository: class { saveDraft = fixture.saveDraft; } }));
vi.mock("./quote-delivery-repository.js", () => ({ QuoteDeliveryRepository: class {
 preview = fixture.preview; issue = fixture.send; execute = fixture.execute;
} }));
vi.mock("./activation-repository.js", () => ({ PracticeActivationRepository: class { start = fixture.start; } }));
import { DEMO_TENANT_ID, prepareActivationFixtureV3, seedActivationFixturesV3 } from "./demo-seed.js";

const pool = {} as Pool;
const context = { tenantId: DEMO_TENANT_ID } as VerifiedTenantContext;
const practiceContext = { tenantId: DEMO_TENANT_ID } as VerifiedTenantContext;
const digest = "a".repeat(64);
beforeEach(() => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 vi.resetAllMocks();
 fixture.query.mockResolvedValue({ rows: [{ revision: 0 }] });
 fixture.issue.mockResolvedValue("fictional-token");
 fixture.authenticate.mockResolvedValue({ context: practiceContext, digest });
 fixture.preview.mockResolvedValue({ documentId: "fictional-document", hash: "fictional-hash", document: { documentVersion: 1, totalPence: 120000 } });
});
afterEach(() => vi.unstubAllEnvs());

it("assigns a firm before preview and uses its authenticated context for quote commands", async () => {
 const job = await prepareActivationFixtureV3(pool, context, "Fictional job", 100000);
 const insert = fixture.query.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO app.job("));
 expect(insert?.[1]).toEqual([job, DEMO_TENANT_ID, "Fictional job", digest]);
 expect(insert?.[0]).toContain("'capture'");
 expect(fixture.issue).toHaveBeenCalledOnce();
 expect(fixture.preview).toHaveBeenCalledWith(practiceContext, job, "fixture-customer@example.invalid");
 expect(fixture.send.mock.calls[0]?.[0]).toBe(practiceContext);
 expect(fixture.execute.mock.calls[0]?.[0]).toBe(practiceContext);
});

it("keeps an explicitly supplied practice firm", async () => {
 const job = await prepareActivationFixtureV3(pool, practiceContext, "Owned job", 100000, pool, 100000, digest);
 expect(fixture.issue).not.toHaveBeenCalled();
 expect(fixture.authenticate).not.toHaveBeenCalled();
 expect(fixture.preview).toHaveBeenCalledWith(practiceContext, job, "fixture-customer@example.invalid");
 expect(fixture.query.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO app.job("))?.[1]?.[3]).toBe(digest);
});

it("seeds all three activation jobs in one owned firm", async () => {
 const jobs = await seedActivationFixturesV3(pool, pool, context);
 expect(Object.keys(jobs)).toEqual(["core-1000", "recovery-18800", "shadow-30000"]);
 expect(fixture.issue).toHaveBeenCalledOnce();
 const inserts = fixture.query.mock.calls.filter(([sql]) => sql.startsWith("INSERT INTO app.job("));
 expect(inserts).toHaveLength(3);
 expect(inserts.map(([, args]) => args[3])).toEqual([digest, digest, digest]);
 expect(fixture.preview.mock.calls.every(([ctx]) => ctx === practiceContext)).toBe(true);
 expect(fixture.start.mock.calls.every(([ctx]) => ctx === practiceContext)).toBe(true);
});

it.each(["pilot_no_charge", "production"])("refuses %s before creating a practice session", async environment => {
 vi.stubEnv("JOBGUARD_ENV", environment);
 await expect(prepareActivationFixtureV3(pool, context, "Refused", 100000)).rejects.toMatchObject({ code: "DEMO_SEED_ENVIRONMENT_FORBIDDEN" });
 await expect(seedActivationFixturesV3(pool, pool, context)).rejects.toMatchObject({ code: "DEMO_SEED_ENVIRONMENT_FORBIDDEN" });
 expect(fixture.issue).not.toHaveBeenCalled();
 expect(fixture.query).not.toHaveBeenCalled();
});
