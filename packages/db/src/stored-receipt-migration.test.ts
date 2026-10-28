import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { migrate, MIGRATION_URLS } from "./migrate.js";

const target = "0304_stored_receipt_case_allocation.sql";
const source = () => readFile(new URL(`../migrations/${target}`, import.meta.url), "utf8");

describe("M4-8-S part 2 migration submission", () => {
  it("submits all of 0304 in one query with bookkeeping before its final COMMIT", async () => {
    expect(MIGRATION_URLS.filter(url => url.pathname.endsWith(`/${target}`))).toHaveLength(1);
    const sent: string[] = [];
    const connection = { query: async (sql: string, values?: unknown[]) => {
      if (sql.startsWith("SELECT 1 FROM public.jobguard_schema_migration")) {
        return { rows: [], rowCount: values?.[0] === target ? 0 : 1 };
      }
      if (!sql.startsWith("CREATE TABLE IF NOT EXISTS")) sent.push(sql);
      return { rows: [], rowCount: 0 };
    } } as unknown as Pick<Pool, "query">;
    await migrate(connection);
    const sql = await source();
    const bookkeeping = `INSERT INTO public.jobguard_schema_migration(migration_name) VALUES('${target}') ON CONFLICT DO NOTHING;\n`;
    expect(sent).toEqual([sql.replace(/COMMIT;\s*$/u, `${bookkeeping}COMMIT;\n`)]);
    expect(sent[0]).toMatch(/^BEGIN;/u);
    expect(sent[0]).toContain("CREATE OR REPLACE FUNCTION app.read_receipt_allocation_facts");
    expect(sent[0]).toMatch(/FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow,jobguard_shadow_emergency_access;\nINSERT INTO public\.jobguard_schema_migration/u);
    // Ten complete dollar-quoted blocks, including the final reader routine.
    expect(sql.match(/\$\$/gu)).toHaveLength(20);
    expect(sent[0]).toMatch(/COMMIT;\n$/u);
  });

  it("keeps CASE expressions nested in approval IF predicates so their THEN cannot terminate the condition", async () => {
    const sql = await source();
    // PostgreSQL 42601: an unparenthesised CASE here ends PL/pgSQL's IF
    // expression at the CASE's THEN. These are both approval predicates.
    expect(sql).toContain("review.operation IS DISTINCT FROM (CASE WHEN action='reverse' THEN 'reversal' ELSE 'receipt' END)");
    expect(sql).toContain("request->>'action' IS DISTINCT FROM (CASE WHEN action='reverse' THEN 'review_reverse' ELSE 'review' END)");
    expect(sql).not.toMatch(/IS DISTINCT FROM CASE WHEN/gu);
  });
});
