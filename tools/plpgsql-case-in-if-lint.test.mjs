import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { findBareCaseInIf, historicalCaseLocations, inspectMigrations, checkPlpgsqlCaseInIf } from "./plpgsql-case-in-if-lint.mjs";

const file = "fixture.sql", root = fileURLToPath(new URL("../", import.meta.url));
const wrap = body => `DO $guard$ BEGIN\n${body}\nEND $guard$;`;

test("bare IF and ELSIF CASE report exact physical lines, including nested IF", () => {
  const sql = wrap(`IF x = CASE WHEN flag THEN 1 ELSE 0 END THEN
    IF CASE WHEN flag THEN true END THEN NULL; END IF;
  ELSIF x = CASE flag WHEN true THEN 2 ELSE 1 END THEN NULL;
  END IF;`);
  assert.deepEqual(findBareCaseInIf(file, sql), ["fixture.sql:2", "fixture.sql:3", "fixture.sql:4"]);
});

test("parenthesized, nested CASE, subquery and array conditions are protected", () => {
  assert.deepEqual(findBareCaseInIf(file, wrap(`
    IF x = (CASE WHEN flag THEN CASE WHEN other THEN 1 END ELSE 0 END) THEN NULL;
    ELSIF EXISTS(SELECT 1 WHERE x=CASE WHEN flag THEN 1 END) THEN NULL;
    ELSIF a[CASE WHEN flag THEN 1 ELSE 2 END] = 1 THEN NULL;
    END IF;
  `)), []);
});

test("comments, quoted identifiers, ordinary/E strings and nested dollar literals are opaque", () => {
  assert.deepEqual(findBareCaseInIf(file, wrap(String.raw`
    -- IF CASE THEN
    /* outer /* IF CASE WHEN x THEN */ ELSIF CASE THEN */
    IF x = 'CASE WHEN x THEN ''IF CASE'' END' THEN
      RAISE NOTICE E'escaped \' IF CASE WHEN x THEN';
      RAISE NOTICE $text$ IF CASE WHEN x THEN $text$;
      PERFORM "IF", "CASE";
    END IF;
  `)), []);
});

test("keyword-looking dollar data and SQL-language bodies are not procedural IF conditions", () => {
  assert.deepEqual(findBareCaseInIf(file, `SELECT $data$ IF CASE WHEN x THEN $data$;
    CREATE FUNCTION f() RETURNS text LANGUAGE sql AS $$ SELECT 'IF CASE THEN'; $$;
    DO LANGUAGE plpython3u $body$ IF CASE WHEN x THEN $body$;`), []);
});

test("language before/after dollar body and plain quoted function body are inspected", () => {
  for (const sql of [
    `CREATE OR REPLACE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF CASE WHEN true THEN true END THEN NULL; END IF; END $$;`,
    `CREATE PROCEDURE f() AS $p$ BEGIN IF CASE WHEN true THEN true END THEN NULL; END IF; END $p$ LANGUAGE plpgsql;`,
    `CREATE FUNCTION f() RETURNS void AS 'BEGIN IF CASE WHEN true THEN true END THEN RAISE NOTICE ''IF CASE''; END IF; END' LANGUAGE "plpgsql";`,
  ]) assert.deepEqual(findBareCaseInIf(file, sql), ["fixture.sql:1"]);
});

test("DDL IF EXISTS and END IF cannot swallow or invent procedural conditions", () => {
  assert.deepEqual(findBareCaseInIf(file, wrap(`CREATE TABLE IF NOT EXISTS example AS SELECT CASE WHEN true THEN 1 END;
    IF true THEN NULL; END IF;
    <<again>> IF value = CASE WHEN true THEN 1 END THEN NULL; END IF;`)), ["fixture.sql:4"]);
});

test("protected comparison followed by a bare CASE still fails; adjacent bodies both scanned", () => {
  assert.deepEqual(findBareCaseInIf(file, wrap(`IF (x=1) AND CASE WHEN true THEN true END THEN NULL; END IF;`) + "\n" +
    wrap(`IF CASE WHEN false THEN false END THEN NULL; END IF;`)), ["fixture.sql:2", "fixture.sql:5"]);
});

test("malformed lexical boundaries do not silently pass", () => {
  for (const sql of ["/* unclosed", "SELECT 'unclosed", "DO $$ BEGIN NULL; END $wrong$;"])
    assert.throws(() => findBareCaseInIf(file, sql), /unterminated/u);
});

test("the real historical regression is rejected without changing its migration", () => {
  const migration = readFileSync(join(root, "packages/db/migrations/0144_job_work_state.sql"), "utf8");
  const fixed = "(CASE WHEN NEW.kind='finished_cancelled' THEN 'finished_on_site' ELSE 'closed' END)";
  assert.ok(migration.includes(fixed));
  assert.deepEqual(findBareCaseInIf(file, migration), []);
  assert.equal(findBareCaseInIf(file, migration.replace(fixed, fixed.slice(1, -1))).length, 1);
});

test("historical allowlist is a fixed reviewed list, not a discovered baseline", () => {
  assert.deepEqual(historicalCaseLocations, []);
  assert.ok(Object.isFrozen(historicalCaseLocations));
});

test("the complete migration inventory passes with exactly the historical exceptions", () => {
  const inventory = inspectMigrations(root);
  assert.ok(inventory.files > 0);
  assert.equal(inventory.files, readdirSync(join(root, "packages/db/migrations")).filter(name => name.endsWith(".sql")).length);
  assert.deepEqual(inventory.locations, [...historicalCaseLocations]);
  assert.deepEqual(checkPlpgsqlCaseInIf(root), { files: inventory.files, grandfathered: historicalCaseLocations.length });
});

test("CLI reports a new bad file, exits nonzero and never edits SQL", () => {
  const directory = mkdtempSync(join(tmpdir(), "jg-case-if-"));
  try {
    mkdirSync(join(directory, "packages/db/migrations"), { recursive: true });
    const path = join(directory, "packages/db/migrations/9999_new.sql"), sql = wrap("IF CASE WHEN true THEN true END THEN NULL; END IF;");
    writeFileSync(path, sql);
    const result = spawnSync(process.execPath, [join(root, "tools/plpgsql-case-in-if-lint.mjs")], { cwd: directory, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /9999_new\.sql:2: CASE in IF\/ELSIF condition must be parenthesized/u);
    assert.equal(readFileSync(path, "utf8"), sql);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("CLI is callable from the existing lint entry and succeeds on the repository", () => {
  assert.match(readFileSync(join(root, "tools/lint.mjs"), "utf8"), /execFileSync\(process\.execPath, \["tools\/plpgsql-case-in-if-lint\.mjs"\]/u);
  assert.match(execFileSync(process.execPath, [join(root, "tools/plpgsql-case-in-if-lint.mjs")], { cwd: root, encoding: "utf8" }), /migrations checked/u);
});


test("escape-string routine bodies preserve physical source lines and quoted notice text", () => {
  const bad = String.raw`CREATE FUNCTION f() RETURNS void AS E'BEGIN\nIF \x43ASE WHEN true THEN true END THEN RAISE NOTICE \'IF CASE THEN\'; END IF; END' LANGUAGE plpgsql;`;
  assert.deepEqual(findBareCaseInIf(file, bad), ["fixture.sql:1"]);
  const good = String.raw`CREATE FUNCTION f() RETURNS void AS E'BEGIN\nIF (CASE WHEN true THEN true END) THEN RAISE NOTICE \'IF CASE THEN\'; END IF; END' LANGUAGE plpgsql;`;
  assert.deepEqual(findBareCaseInIf(file, good), []);
});

test("signature casts and a parameter named language do not hide the actual routine body", () => {
  assert.deepEqual(findBareCaseInIf(file, `CREATE FUNCTION f(language text DEFAULT CAST('x' AS text)) RETURNS void
    AS $$ BEGIN IF CASE WHEN true THEN true END THEN NULL; END IF; END $$ LANGUAGE plpgsql;`), ["fixture.sql:2"]);
});
