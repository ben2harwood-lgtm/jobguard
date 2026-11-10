import { withTenant } from "../src/tenant-context.js";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import {
  asFixtureTenant, closeLockFixture, createLockFixture, LOCK_OWNER,
  prepareLock, publishEmptyCompletion, seedAccount, type LockFixture,
} from "./sv5pre-fixtures.js";

// Find by suffix so landing can renumber this migration without changing tests.
const migration = MIGRATION_URLS.find(url => url.pathname.endsWith("_invoice_line_vat_signed_split.sql"))!;
const allocation = (sql: string) => {
  const start = sql.indexOf(" FOR item IN WITH ");
  const end = sql.indexOf(" FROM ranked LOOP", start) + " FROM ranked LOOP".length;
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return { start, end, text: sql.slice(start, end) };
};

describe("LATER-SAFETY-90 source preservation", () => {
  it("preserves every predecessor guard, statement and security setting outside VAT allocation", async () => {
    const before = await readFile(new URL("../migrations/0524_practice_invoice_closed_job.sql", import.meta.url), "utf8");
    const after = await readFile(migration, "utf8");
    const body = (sql: string) => sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION"));
    const withoutAllocation = (sql: string) => {
      // Exclude only the explanatory comments immediately before the new CTE.
      const clean = body(sql).replace(/ -- Mixed-sign lines[^\n]*\n -- invoices[^\n]*\n/, "");
      const range = allocation(clean);
      return clean.slice(0, range.start) + clean.slice(range.end);
    };
    expect(withoutAllocation(after)).toBe(withoutAllocation(before));
  });
});

describe("LATER-SAFETY-90 real PostgreSQL signed invoice VAT", () => {
  let f: LockFixture;
  beforeAll(async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    // Includes every main migration and this forward migration on a fresh DB.
    f = await createLockFixture();
    await migrate(f.admin); // Already-applied migrations remain a no-op.
  }, 120_000);
  afterAll(async () => { if (f) await closeLockFixture(f); vi.unstubAllEnvs(); });

  async function issue(nets: number[]) {
    const a = await seedAccount(f.admin, randomUUID(), nets.reduce((sum, net) => sum + net, 0));
    // Owner-only synthetic fixture setup, before the immutable lock. No runtime
    // permissions or production writer/guard are changed by this setup.
    await asFixtureTenant(f.admin, a.tenantId, async db => {
      await db.query("SET LOCAL session_replication_role='replica'");
      await db.query("UPDATE app.final_account_line SET net_pence=$1 WHERE tenant_id=$2 AND id=$3", [nets[0], a.tenantId, a.lineId]);
      for (const [index, net] of nets.entries()) {
        if (index === 0) continue;
        const source = randomUUID();
        await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal)
          SELECT $1,tenant_id,job_id,final_account_revision_id,'baseline',$2,scope_item_id,$2,'Fictional signed invoice line',$3,$4
          FROM app.final_account_line WHERE tenant_id=$5 AND id=$6`, [randomUUID(), source, net, index + 1, a.tenantId, a.lineId]);
      }
    });
    const repo = await prepareLock(f, a);
    await repo.lock(a.context, a.input);
    await publishEmptyCompletion(f, a);
    const command = randomUUID();
    const invoice = await withTenant(f.runtime, a.context, async tx => {
      const db = tx.$client;
      const args = [a.tenantId, a.jobId, a.revisionId, LOCK_OWNER, command, "practice-customer@example.invalid", "2026-11-06"];
      const first = (await db.query("SELECT * FROM app.issue_practice_customer_invoice($1,$2,$3,$4,$5,$6,$7::date)", args)).rows[0]!;
      expect((await db.query("SELECT * FROM app.issue_practice_customer_invoice($1,$2,$3,$4,$5,$6,$7::date)", args)).rows[0]).toEqual(first);
      return first;
    });
    const lines = (await f.admin.query(`SELECT l.final_account_line_id id,l.net_pence,l.tax_pence,l.gross_pence
      FROM app.final_account_invoiced_line l JOIN app.final_account_line source ON(source.tenant_id,source.id)=(l.tenant_id,l.final_account_line_id)
      WHERE l.tenant_id=$1 AND l.invoice_id=$2 ORDER BY source.ordinal`, [a.tenantId, invoice.invoice_id])).rows;
    const tax = (await f.admin.query("SELECT tax_pence FROM app.customer_invoice WHERE tenant_id=$1 AND id=$2", [a.tenantId, invoice.invoice_id])).rows[0]!.tax_pence;
    expect(lines.reduce((sum, line) => sum + BigInt(line.tax_pence), 0n)).toBe(BigInt(tax));
    for (const line of lines) expect(BigInt(line.gross_pence)).toBe(BigInt(line.net_pence) + BigInt(line.tax_pence));
    return { a, invoice, lines };
  }

  it("issues +1000/-500 as VAT +200/-100 and exposes the correct gross to recovery allocation", async () => {
    const { a, invoice, lines } = await issue([1000, -500]);
    expect(lines.map(line => [line.net_pence, line.tax_pence, line.gross_pence])).toEqual([
      ["1000", "200", "1200"], ["-500", "-100", "-600"],
    ]);
    const sources = await asFixtureTenant(f.runtime, a.tenantId, db => db.query(
      "SELECT id,net_pence,gross_pence FROM app.recovery_allocation_invoice_lines($1,$2,$3)", [a.tenantId, a.jobId, invoice.invoice_id]));
    // Recovery allocates positive lines only; the omission's signed gross is
    // retained in the invoice binding, rather than turning into eligible cash.
    expect(sources.rows).toEqual([{ id: lines[0]!.id, net_pence: "1000", gross_pence: "1200" }]);
  });

  it("keeps the existing all-positive largest-remainder split, including a smaller line winning the penny", async () => {
    const { lines } = await issue([1001, 502]);
    expect(lines.map(line => line.tax_pence)).toEqual(["200", "101"]);
  });

  it("puts signed rounding leftovers on positive lines, even when omissions outnumber them", async () => {
    const { lines } = await issue([7, -1, -1, -1, -1]);
    expect(lines.map(line => line.tax_pence)).toEqual(["5", "-1", "-1", "-1", "-1"]);
  });

  it("keeps zero-sum invoice VAT unchanged", async () => {
    const { lines } = await issue([1000, -1000]);
    expect(lines.map(line => line.tax_pence)).toEqual(["0", "0"]);
  });

  it("kills the abs-weight mutation on an actually issued mixed-sign invoice and restores the migration", async () => {
    const sql = await readFile(migration, "utf8");
    const mutant = sql.replace("CASE WHEN signed_net>0 THEN net ELSE abs(net) END weight", "abs(net) weight");
    expect(mutant).not.toBe(sql);
    try {
      await f.admin.query(mutant);
      const { lines } = await issue([1000, -500]);
      expect(lines.map(line => line.tax_pence)).toEqual(["67", "33"]);
      expect(lines.map(line => line.tax_pence)).not.toEqual(["200", "-100"]);
    } finally {
      await f.admin.query(sql);
    }
    expect((await issue([1000, -500])).lines.map(line => line.tax_pence)).toEqual(["200", "-100"]);
  });
});
