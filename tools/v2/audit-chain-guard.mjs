/** Q18 / V2-CI2: review pointers, never a verdict about transactional correctness.
 * Evidence convention in tools/v2/*seed*.test.mjs:
 * test("audit-chain: packages/db/src/example.ts#Repository.save", async () => {
 *   ... call the real command against PostgreSQL ...
 *   assert.equal(..., ..., "audit-chain: event");
 *   assert.equal(..., ..., "audit-chain: replay");
 *   assert.equal(..., ..., "audit-chain: rollback");
 * });
 * Each label belongs on the assertion proving that property. CI executes the
 * seed suite separately; reviewers check the assertions and command binding.
 * An adjacent // audit-chain: exempt <reason> is also a reviewable disposition.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const sourcePath = /^(?:packages\/db|apps\/api)\/src\/.*\.[cm]?tsx?$/u;
const seedPath = /^tools\/v2\/(?:[^/]+\/)*[^/]*seed[^/]*\.test\.mjs$/u;
const shaPattern = /^[a-f0-9]{40}$/u;
const walk = (node, visit) => { visit(node); ts.forEachChild(node, child => { walk(child, visit); }); };
const parse = (path, source) => {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  if (file.parseDiagnostics.length) throw new Error(`Cannot parse ${path}; refusing an incomplete scan.`);
  return file;
};
const propertyName = node => node && ts.isComputedPropertyName(node) ? propertyName(node.expression)
  : node && (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) ? node.text : undefined;
const callName = node => ts.isIdentifier(node) ? node.text : ts.isPropertyAccessExpression(node) ? node.name.text : undefined;

/** Head naming matters: #932 is a Codex E3 head stacked on a Claude D3 base. */
export function inV2Scope(eventName, event) {
  if (eventName === "push") return event.ref === "refs/heads/v2/main" && event.deleted !== true;
  if (eventName !== "pull_request") return false;
  const { base, head } = event.pull_request ?? {};
  if (typeof base?.ref !== "string" || typeof head?.ref !== "string") throw new Error("Missing PR branch identity.");
  return base.ref !== "main" && (base.ref === "v2/main" || base.ref.startsWith("codex/sandbox/v2-") || head.ref.startsWith("codex/sandbox/v2-"));
}

function functionName(node) {
  if (ts.isFunctionDeclaration(node)) return node.name?.text;
  if (ts.isMethodDeclaration(node)) {
    const method = propertyName(node.name);
    const owner = node.parent.name?.text;
    return method && (owner ? `${owner}.${method}` : method);
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const parent = node.parent;
    if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) return propertyName(parent.name);
  }
  return undefined;
}

function sqlText(node, definitions, seen = new Set()) {
  if (!node) return "";
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map(span => ` ${span.literal.text}`).join("");
  if (ts.isTaggedTemplateExpression(node)) return sqlText(node.template, definitions, seen);
  if (ts.isIdentifier(node) && definitions.has(node.text) && !seen.has(node.text)) {
    seen.add(node.text);
    return sqlText(definitions.get(node.text), definitions, seen);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return sqlText(node.left, definitions, seen) + sqlText(node.right, definitions, seen);
  if (ts.isObjectLiteralExpression(node)) return sqlText(node.properties.find(p => propertyName(p.name) === "text")?.initializer, definitions, seen);
  return "";
}

// Include checked SQL operations: SELECT app.post_* is a write pointer too.
// This is a bounded source scan, not SQL data-flow or routine-body analysis.
function writes(sql) {
  const clean = sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\//gu, " ").replace(/"([a-zA-Z_][\w]*)"/gu, "$1");
  return [...clean.matchAll(/\b(?:INSERT\s+INTO|UPDATE(?!\s+SET\b)|DELETE\s+FROM)\s+(?:app\.)?([a-zA-Z_][\w]*)|\b(?:SELECT|CALL)\s+app\.((?:v2_)?(?:post|reverse|record|append|begin|complete|finish|save|set|create|update|delete|insert|issue|approve|accept|lock|confirm|transition|revoke|withdraw|cancel|mark|allocate|reconcile|generate)_[a-zA-Z_][\w]*)\s*\(/giu)]
    .map(match => match[2] ? `routine:app.${match[2]}` : `table:${match[1]}`);
}

/** changed ranges are 1-based, inclusive. Omitting them scans the whole file. */
export function scanCommands(path, source, changed) {
  const file = parse(path, source), definitions = new Map(), commands = new Map();
  walk(file, node => { if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) definitions.set(node.name.text, node.initializer); });
  function ownerOf(node) {
    for (let current = node.parent; current; current = current.parent) if (functionName(current)) return current;
    return file;
  }
  walk(file, node => {
    if (!ts.isCallExpression(node) && !ts.isTaggedTemplateExpression(node)) return;
    const name = ts.isCallExpression(node) ? callName(node.expression) : undefined;
    if (ts.isCallExpression(node) && !["query", "execute", "insert", "update", "delete"].includes(name)) return;
    const targets = ts.isCallExpression(node) ? writes(sqlText(node.arguments[0], definitions)) : writes(sqlText(node.template, definitions));
    // Crypto hash.update() is not a database write. Only conventional DB
    // receiver names qualify for ORM pointers; SQL query calls are separate.
    if (["insert", "update", "delete"].includes(name) && ts.isPropertyAccessExpression(node.expression) &&
      /^(?:db|database|tx|transaction)$/u.test(node.expression.expression.getText(file))) targets.push(`builder:${name}`);
    if (!targets.length) return;
    const owner = ownerOf(node), start = file.getLineAndCharacterOfPosition(owner.getStart(file)).line + 1;
    const end = file.getLineAndCharacterOfPosition(owner.end).line + 1;
    if (changed && !changed.some(([a, b]) => a <= end && b >= start)) return;
    const id = `${path}#${functionName(owner) ?? "<module>"}`;
    let command = commands.get(id);
    if (!command) {
      const comments = source.slice(owner.getFullStart(), owner.getStart(file));
      const exemption = /\/\/\s*audit-chain:\s*exempt\s+([^\r\n]+)/u.exec(comments)?.[1].trim();
      command = { id, method: functionName(owner)?.split(".").at(-1), line: start, targets: [], exemption, auditCall: false, payloadVersion: false };
      walk(owner, child => {
        if (ts.isCallExpression(child) && callName(child.expression) === "appendAuditBatch") command.auditCall = true;
        if ((ts.isPropertyAssignment(child) || ts.isShorthandPropertyAssignment(child)) && propertyName(child.name) === "references") {
          let object = child.initializer ?? child.name;
          if (ts.isIdentifier(object)) object = definitions.get(object.text);
          if (object && ts.isObjectLiteralExpression(object)) command.payloadVersion ||= object.properties.some(p => propertyName(p.name) === "version");
        }
      });
      commands.set(id, command);
    }
    command.targets = [...new Set([...command.targets, ...targets])];
  });
  return [...commands.values()];
}

/** Declarations point to real assertion calls inside non-skipped seed tests.
 * Static inspection cannot establish that a labelled assertion proves its claim.
 */
export function seedEvidence(path, source) {
  const file = parse(path, source), evidence = [];
  walk(file, node => {
    if (!ts.isCallExpression(node) || callName(node.expression) !== "test" || !ts.isStringLiteralLike(node.arguments[0])) return;
    const match = /^audit-chain: (\S+#\S+)$/u.exec(node.arguments[0].text);
    const body = node.arguments.at(-1);
    if (!match || !body || !(ts.isArrowFunction(body) || ts.isFunctionExpression(body))) return;
    // Only test(name, callback) is eligible: options may hide a skip or todo.
    if (node.arguments.length !== 2) return;
    const claims = new Set(), called = new Set();
    walk(body, child => {
      if (!ts.isCallExpression(child)) return;
      called.add(callName(child.expression));
      if (!ts.isPropertyAccessExpression(child.expression) || child.expression.expression.getText(file) !== "assert") return;
      if (!["equal", "strictEqual", "deepEqual", "deepStrictEqual", "ok", "rejects"].includes(child.expression.name.text)) return;
      const label = child.arguments.at(-1);
      if (label && ts.isStringLiteralLike(label)) {
        const claim = /^audit-chain: (event|replay|rollback)(?::|$)/u.exec(label.text)?.[1];
        if (claim) claims.add(claim);
      }
    });
    evidence.push({ id: match[1], path, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, claims: [...claims], called: [...called] });
  });
  return evidence;
}

export function assess(commands, evidence) {
  return commands.map(command => {
    const proof = evidence.find(item => item.id === command.id && item.called.includes(command.method) && ["event", "replay", "rollback"].every(claim => item.claims.includes(claim)));
    return { ...command, evidence: proof && `${proof.path}:${proof.line}`, missing: !command.exemption && !proof };
  });
}

export function report(result) {
  return [`## V2 audit-chain review pointers`, ``, `Base: ${result.base}; head: ${result.head}`, ``,
    "Static declarations only. The seed CI run and independent reviewer must verify event, exact replay, and forced-failure rollback in the same transaction.", "",
    ...result.commands.flatMap(command => [`- ${command.id}:${command.line} — ${command.targets.join(", ")}`,
      `  - ${command.exemption ? `EXEMPT (review required): ${command.exemption}` : command.evidence ? `Evidence case: ${command.evidence}` : "MISSING: named seed case asserting event, replay and rollback."}`,
      `  - Direct appendAuditBatch in function: ${command.auditCall ? "yes" : "not found (may use a helper or checked SQL operation)"}.${command.payloadVersion ? " FLAG: references contains forbidden version key." : ""}`]),
    ...(result.commands.length ? [] : ["No changed write candidates found."]), "",
    result.commands.some(command => command.missing) ? "FAIL: undisposed write pointers." : "Pointers disposed; this is not audit acceptance.", ""].join("\n");
}

export function inspectAuditChain({ cwd = process.cwd(), env = process.env,
  git = args => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }) } = {}) {
  const commit = ref => {
    if (typeof ref !== "string" || !ref || /[\r\n\0]/u.test(ref)) throw new Error("Missing or invalid comparison ref.");
    return git(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]).trim();
  };
  const eventName = env.GITHUB_EVENT_NAME ?? "local";
  let head = commit("HEAD"), base;
  if (eventName === "local") {
    if (env.GITHUB_ACTIONS === "true") throw new Error("Missing CI event; no local fallback.");
    base = commit(env.LANE_BASE_REF);
  } else {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
    if (!inV2Scope(eventName, event)) return { skipped: true };
    const target = eventName === "pull_request" ? event.pull_request.head.sha : event.after;
    const before = eventName === "pull_request" ? event.pull_request.base.sha : event.before;
    if (!shaPattern.test(target ?? "") || !shaPattern.test(before ?? "")) throw new Error("Missing CI comparison SHAs.");
    base = commit(before);
    head = commit(target);
    git(["merge-base", "--is-ancestor", head, "HEAD"]);
  }
  if (base === head) throw new Error("Self-comparison range; refusing a misleading pass.");
  const comparison = git(["merge-base", base, head]).trim();
  const paths = git(["diff", "--no-renames", "--diff-filter=ACMRT", "--name-only", "-z", comparison, head, "--"]).split("\0").filter(path => sourcePath.test(path));
  const commands = paths.flatMap(path => {
    const diff = git(["diff", "--no-renames", "--unified=0", comparison, head, "--", path]);
    const ranges = [...diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gmu)].map(([, line, count]) => [Number(line), Number(line) + Math.max(1, Number(count ?? 1)) - 1]);
    return scanCommands(path, git(["show", `${head}:${path}`]), ranges);
  });
  const seeds = git(["ls-tree", "-r", "--name-only", "-z", head, "--", "tools/v2/"]).split("\0").filter(path => seedPath.test(path));
  const evidence = seeds.flatMap(path => seedEvidence(path, git(["show", `${head}:${path}`])));
  return { base, head, commands: assess(commands, evidence) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = inspectAuditChain();
    const output = result.skipped ? "V2 audit-chain guard outside scope.\n" : report(result);
    process.stdout.write(output);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, output);
    if (result.commands?.some(command => command.missing)) process.exitCode = 1;
  } catch (error) { console.error(`V2 audit-chain guard failed: ${error.message}`); process.exitCode = 1; }
}
