import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { migrate } from "../src/migrate.js";

const migrationName = "0144_job_work_state.sql";
const migrationUrl = new URL(`../migrations/${migrationName}`, import.meta.url);
type Token = { text: string; body?: string };

// Narrow lexical guard, not a PostgreSQL parser. Strings/comments are opaque;
// dollar bodies are checked separately. PostgreSQL execution remains mandatory.
function tokens(sql: string): Token[] {
  const result: Token[] = [];
  for (let i = 0; i < sql.length;) {
    if (/\s/u.test(sql[i]!)) { i++; continue; }
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i);
      i = end < 0 ? sql.length : end + 1;
      continue;
    }
    if (sql.startsWith("/*", i)) {
      let depth = 1;
      i += 2;
      while (depth && i < sql.length) {
        if (sql.startsWith("/*", i)) { depth++; i += 2; }
        else if (sql.startsWith("*/", i)) { depth--; i += 2; }
        else i++;
      }
      if (depth) throw new Error("Unterminated block comment");
      continue;
    }
    const escapeString = /^[eE]'/u.test(sql.slice(i));
    if (sql[i] === "'" || sql[i] === '"' || escapeString) {
      if (escapeString) i++;
      const quote = sql[i++]!;
      let closed = false;
      while (i < sql.length) {
        if (escapeString && sql[i] === "\\") { i += 2; continue; }
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) { i += 2; continue; }
          i++; closed = true; break;
        }
        i++;
      }
      if (!closed) throw new Error("Unterminated quoted token");
      result.push({ text: "<quoted>" });
      continue;
    }
    const delimiter = /^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/u.exec(sql.slice(i))?.[0];
    if (delimiter) {
      const start = i + delimiter.length;
      const end = sql.indexOf(delimiter, start);
      if (end < 0) throw new Error(`Unterminated dollar quote ${delimiter}`);
      result.push({ text: "<body>", body: sql.slice(start, end) });
      i = end + delimiter.length;
      continue;
    }
    const word = /^[a-zA-Z_][a-zA-Z_0-9$]*/u.exec(sql.slice(i))?.[0];
    result.push({ text: word?.toUpperCase() ?? sql[i]! });
    i += word?.length ?? 1;
  }
  return result;
}

function checkDelimiters(items: Token[]): void {
  const stack: string[] = [];
  for (const { text } of items) {
    if (text === "(" || text === "[") stack.push(text);
    if (text === ")" || text === "]") {
      if (stack.pop() !== (text === ")" ? "(" : "[")) throw new Error("Unbalanced parentheses/brackets");
    }
  }
  if (stack.length) throw new Error("Unbalanced parentheses/brackets");
}

// Covers the block forms used by 0144, including SQL CASE expressions. This
// deliberately makes no claim to validate arbitrary SQL or PL/pgSQL grammar.
function checkBlocks(items: Token[]): void {
  const stack: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const text = items[i]!.text;
    if (["BEGIN", "IF", "LOOP", "CASE"].includes(text)) stack.push(text);
    if (text === "END") {
      const next = items[i + 1]?.text;
      const expected = next === "IF" || next === "LOOP" || next === "CASE" ? next : undefined;
      const open = stack.pop();
      if (expected ? open !== expected : open !== "BEGIN" && open !== "CASE") throw new Error("Unbalanced BEGIN/IF/LOOP/CASE blocks");
      if (expected) i++;
    }
  }
  if (stack.length) throw new Error("Unbalanced BEGIN/IF/LOOP/CASE blocks");
}

function checkMigration(sql: string): { bodies: number; conditions: number } {
  const outer = tokens(sql);
  checkDelimiters(outer);
  let bodies = 0, conditions = 0;
  for (const { body } of outer) {
    if (body === undefined) continue;
    bodies++;
    const inner = tokens(body);
    checkDelimiters(inner);
    for (let i = 0; i < inner.length; i++) {
      const keyword = inner[i]!.text;
      if ((keyword !== "IF" || inner[i - 1]?.text === "END") && keyword !== "ELSIF") continue;
      conditions++;
      let depth = 0, terminated = false;
      for (let j = i + 1; j < inner.length; j++) {
        const text = inner[j]!.text;
        // pl_gram.y read_sql_construct stops at the first THEN at depth zero.
        // An SQL CASE at that depth leaves an incomplete expression at its THEN.
        if (text === "CASE" && depth === 0) throw new Error("CASE in IF/ELSIF must be parenthesized");
        if (text === "THEN" && depth === 0) { terminated = true; break; }
        if (text === ";") break;
        if (text === "(" || text === "[") depth++;
        if (text === ")" || text === "]") depth--;
      }
      if (!terminated) throw new Error("Unterminated IF/ELSIF condition");
    }
    checkBlocks(inner);
  }
  return { bodies, conditions };
}

describe("CH-4 migration syntax without PostgreSQL", () => {
  it("checks the on-site diary replacement bodies and CASE conditions in migration 0505", async () => {
    const file = await readFile(new URL("../migrations/0505_onsite_diary_admission.sql", import.meta.url), "utf8");
    const checked = checkMigration(file);
    expect(checked.bodies).toBe(4);
    expect(checked.conditions).toBeGreaterThan(40);
  });
  it("checks every dollar body and IF/ELSIF condition in the exact query migrate sends", async () => {
    const queries: string[] = [];
    await migrate({ query: async (sql: string, values?: unknown[]) => {
      queries.push(sql);
      return { rows: [], rowCount: values?.[0] === migrationName ? 0 : 1 };
    } } as Parameters<typeof migrate>[0]);
    const file = await readFile(migrationUrl, "utf8");
    const combined = file.replace(/COMMIT;\s*$/u,
      `INSERT INTO public.jobguard_schema_migration(migration_name) VALUES('${migrationName}') ON CONFLICT DO NOTHING;\nCOMMIT;\n`);
    expect(queries.filter(sql => sql === combined)).toHaveLength(1);
    const checked = checkMigration(file);
    expect(checked.bodies).toBe(13); // ten functions, three DO blocks
    expect(checked.conditions).toBeGreaterThan(50);
  });

  it("rejects the original unparenthesized CASE regression in the whole migration", async () => {
    const fixed = "(CASE WHEN NEW.kind='finished_cancelled' THEN 'finished_on_site' ELSE 'closed' END)";
    const file = await readFile(migrationUrl, "utf8");
    expect(file).toContain(`latest.kind IS DISTINCT FROM ${fixed}`);
    expect(() => checkMigration(file.replace(`latest.kind IS DISTINCT FROM ${fixed}`,
      `latest.kind IS DISTINCT FROM ${fixed.slice(1, -1)}`))).toThrow("CASE in IF/ELSIF must be parenthesized");
  });

  it("allows protected CASE expressions and ignores keywords/delimiters in comments and strings", () => {
    expect(checkMigration(`DO $guard$ BEGIN
      -- IF CASE THEN $$ (
      /* outer /* IF CASE */ ) */
      IF (CASE WHEN true THEN true ELSE false END) THEN
        RAISE NOTICE 'IF CASE THEN $$ ( ''quoted''';
      ELSIF EXISTS(SELECT 1 WHERE true=CASE WHEN true THEN true END) THEN
        RAISE NOTICE E'escaped \\' IF CASE';
      END IF;
    END $guard$;`)).toEqual({ bodies: 1, conditions: 2 });
  });

  it.each([
    ["DO $$ BEGIN RETURN; END $broken$;", "Unterminated dollar quote"],
    ["DO $$ BEGIN IF (true THEN RETURN; END IF; END $$;", "Unbalanced parentheses"],
    ["DO $$ BEGIN IF true; END $$;", "Unterminated IF/ELSIF"],
    ["DO $$ BEGIN RETURN; $$;", "Unbalanced BEGIN/IF/LOOP/CASE"],
    ["DO $$ BEGIN IF true THEN RETURN; END $$;", "Unbalanced BEGIN/IF/LOOP/CASE"],
    ["SELECT 'unclosed", "Unterminated quoted token"],
    ["/* unclosed", "Unterminated block comment"],
  ])("rejects incomplete lexical/condition structure: %s", (sql, error) => {
    expect(() => checkMigration(sql)).toThrow(error);
  });
});
