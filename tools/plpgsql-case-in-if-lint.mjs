import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Exact immutable historical exceptions, pinned independently by the test.
// Never discover/add exceptions automatically. PostgreSQL CI remains mandatory.
export const historicalCaseLocations = Object.freeze([]);

// Adapted from the existing narrow lexer in job-work-state-syntax.test.ts.
// This is a CASE-in-IF guard, not a SQL parser or a dynamic-SQL evaluator.
function tokens(sql, firstLine = 1, physicalLines) {
  const result = [];
  let i = 0, line = firstLine;
  const advance = end => {
    for (; i < end; i++) if (sql[i] === "\n") line++;
  };
  for (; i < sql.length;) {
    if (/\s/u.test(sql[i])) { advance(i + 1); continue; }
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i);
      advance(end < 0 ? sql.length : end + 1); continue;
    }
    if (sql.startsWith("/*", i)) {
      let depth = 1, end = i + 2;
      while (depth && end < sql.length) {
        if (sql.startsWith("/*", end)) { depth++; end += 2; }
        else if (sql.startsWith("*/", end)) { depth--; end += 2; }
        else end++;
      }
      if (depth) throw new Error(`line ${line}: unterminated block comment`);
      advance(end); continue;
    }
    const tokenLine = physicalLines?.[i] ?? line;
    const escaped = /^[eE]'/u.test(sql.slice(i));
    if (sql[i] === "'" || sql[i] === '"' || escaped) {
      const start = i + (escaped ? 1 : 0), quote = sql[start];
      let end = start + 1, closed = false;
      for (; end < sql.length; end++) {
        if (escaped && sql[end] === "\\") { end++; continue; }
        if (sql[end] !== quote) continue;
        if (sql[end + 1] === quote) { end++; continue; }
        closed = true; break;
      }
      if (!closed) throw new Error(`line ${line}: unterminated quoted token`);
      // Quoted literals stay opaque unless selected as a routine body below.
      result.push({ text: "<quoted>", line: tokenLine, escaped,
        body: quote === "'" ? sql.slice(start + 1, end) : undefined,
        value: quote === '"' ? sql.slice(start + 1, end).replace(/""/gu, '"').toUpperCase() : undefined });
      advance(end + 1); continue;
    }
    const delimiter = /^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/u.exec(sql.slice(i))?.[0];
    if (delimiter) {
      const start = i + delimiter.length, end = sql.indexOf(delimiter, start);
      if (end < 0) throw new Error(`line ${line}: unterminated dollar quote ${delimiter}`);
      result.push({ text: "<body>", body: sql.slice(start, end), line: tokenLine, dollar: true });
      advance(end + delimiter.length); continue;
    }
    const word = /^[a-zA-Z_][a-zA-Z_0-9$]*/u.exec(sql.slice(i))?.[0];
    result.push({ text: word?.toUpperCase() ?? sql[i], line: tokenLine });
    advance(i + (word?.length ?? 1));
  }
  return result;
}

// Decode only a selected single-quoted routine body, never arbitrary SQL data.
// Preserve the source's physical line for escapes that introduce logical newlines.
function bodyTokens(body) {
  if (body.dollar) return tokens(body.body, body.line);
  let text = "", line = body.line;
  const lines = [], sql = body.body;
  const escapes = { b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
  for (let i = 0; i < sql.length;) {
    let value = sql[i], consumed = 1;
    if (sql.startsWith("''", i)) { value = "'"; consumed = 2; }
    else if (body.escaped && sql[i] === "\\") {
      const escape = /^\\(?:x([0-9a-fA-F]{1,2})|u([0-9a-fA-F]{4})|U([0-9a-fA-F]{8})|([0-7]{1,3})|([\s\S]))/u.exec(sql.slice(i));
      if (!escape) throw new Error(`line ${line}: unfinished escape in routine body`);
      consumed = escape[0].length;
      value = escape[1] || escape[2] || escape[3] ? String.fromCodePoint(parseInt(escape[1] ?? escape[2] ?? escape[3], 16))
        : escape[4] ? String.fromCodePoint(parseInt(escape[4], 8)) : (escapes[escape[5]] ?? escape[5]);
    }
    text += value;
    for (let j = 0; j < value.length; j++) lines.push(line);
    for (const character of sql.slice(i, i + consumed)) if (character === "\n") line++;
    i += consumed;
  }
  return tokens(text, body.line, lines);
}

function bodyFailures(file, body) {
  const items = bodyTokens(body), failures = [];
  for (let i = 0; i < items.length; i++) {
    const keyword = items[i].text, previous = items[i - 1]?.text;
    // A procedural IF begins a statement. Do not mistake DDL IF [NOT] EXISTS,
    // quoted identifiers or END IF for a new condition. Labels end with >>.
    const startsStatement = previous === undefined || ["BEGIN", "THEN", "ELSE", ";"].includes(previous)
      || (previous === ">" && items[i - 2]?.text === ">");
    if (keyword !== "ELSIF" && !(keyword === "IF" && startsStatement)) continue;
    let depth = 0;
    for (let j = i + 1; j < items.length; j++) {
      const token = items[j];
      // PL/pgSQL reads up to THEN at depth zero. A bare CASE's THEN ends
      // that read early; a containing parenthesis/bracket protects the CASE.
      if (token.text === "CASE" && depth === 0) {
        failures.push(`${file}:${token.line}`); break;
      }
      if (token.text === ";" || (token.text === "THEN" && depth === 0)) break;
      if (token.text === "(" || token.text === "[") depth++;
      if (token.text === ")" || token.text === "]") depth--;
    }
  }
  return failures;
}

export function findBareCaseInIf(file, sql) {
  const failures = [];
  let statement = [];
  const inspect = () => {
    const isDo = statement[0]?.text === "DO";
    const isRoutine = statement[0]?.text === "CREATE"
      && statement.some(t => t.text === "FUNCTION" || t.text === "PROCEDURE");
    if (!isDo && !isRoutine) return;
    const languageIndex = statement.findLastIndex(t => t.text === "LANGUAGE");
    const language = languageIndex < 0 ? undefined : statement[languageIndex + 1];
    if ((language?.value ?? language?.text ?? (isDo ? "PLPGSQL" : "")) !== "PLPGSQL") return;
    const body = isDo ? statement.find(t => t.body !== undefined)
      : statement.find((t, i) => t.body !== undefined && statement[i - 1]?.text === "AS");
    if (!body || body.body === undefined) throw new Error(`${file}: cannot locate the PL/pgSQL body`);
    failures.push(...bodyFailures(file, body));
  };
  for (const token of tokens(sql)) {
    if (token.text === ";") { inspect(); statement = []; }
    else statement.push(token);
  }
  inspect();
  return [...new Set(failures)];
}

export function inspectMigrations(root = process.cwd()) {
  const directory = join(root, "packages/db/migrations"), locations = [];
  const files = readdirSync(directory).filter(name => name.endsWith(".sql")).sort();
  for (const name of files) {
    const file = `packages/db/migrations/${name}`;
    try { locations.push(...findBareCaseInIf(file, readFileSync(join(directory, name), "utf8"))); }
    catch (error) { throw new Error(`${file}: ${error.message}`, { cause: error }); }
  }
  return { files: files.length, locations };
}

export function checkPlpgsqlCaseInIf(root = process.cwd()) {
  const result = inspectMigrations(root);
  const historical = new Set(historicalCaseLocations), found = new Set(result.locations);
  const failures = result.locations.filter(location => !historical.has(location))
    .map(location => `${location}: CASE in IF/ELSIF condition must be parenthesized`);
  for (const location of historical) if (!found.has(location)) failures.push(`${location}: stale historical CASE exception`);
  if (failures.length) throw new Error(failures.join("\n"));
  return { files: result.files, grandfathered: historical.size };
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const result = checkPlpgsqlCaseInIf();
    console.log(`PL/pgSQL CASE-in-IF lint: ${result.files} migrations checked; ${result.grandfathered} fixed historical exceptions.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
