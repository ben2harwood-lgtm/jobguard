import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

const workspace = fileURLToPath(new URL("../../../", import.meta.url));
const dbSource = join(workspace, "packages/db/src");
const boundary = join(dbSource, "tenant-context.ts");
const excludedDirectories = new Set(["node_modules", "dist", ".next", "test", "tests", "__tests__"]);
function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return excludedDirectories.has(entry.name) ? [] : productionFiles(path);
    return /\.tsx?$/u.test(entry.name) && !/(?:^|\.)(?:test|tests|spec)\.tsx?$/u.test(entry.name) ? [path] : [];
  });
}
const roots = ["apps", "packages"].flatMap(directory => productionFiles(join(workspace, directory)));
const approved = [
  'audit-export-repository.ts#refuse:"audit-export-refusal"',
  // Ben's 6 Nov 2026 router-chat "Yes, option A": sixth reviewed opt-out.
  'enterprise-access-repository.ts#emergency:"identity-sso-required"',
  'enterprise-identity-repository.ts#admin:"identity-sso"',
  'enterprise-identity-repository.ts#allowed:"identity-sso"',
  'enterprise-identity-repository.ts#view:"identity-sso"',
  'oidc-repository.ts#create:"identity-oidc"',
  'shadow-detection-repository.ts#persist:"shadow-persist"',
  'sso-required-repository.ts#command:"identity-sso-required"',
  'sso-required-repository.ts#detail:"identity-sso-required"',
  'sso-required-repository.ts#view:"identity-sso-required"',
  // LP-6d closed practice-worker-switch-repository.ts#switchOff:"practice-switch-off"; switch-off now binds.
  'contractor-practice-session-repository.ts#revoke:"contractor-session-revoke"',
  'commercial-integrity-v3-repository.ts#read:"commercial-integrity-read"',
  'commercial-integrity-v3-repository.ts#readFamily:"commercial-integrity-read-family"',
  'evidence-pack-repository.ts#approveAttachment:"evidence-pack-approval"',
].sort();
const approval = "evidence-pack-repository.ts#approveAttachment";

// All production workspace files are explicit roots. Resolution still follows imports,
// exports and inferred aliases, but unrelated dependencies are not added to this
// source-boundary program. Only the small native Promise libs are needed for awaited
// dynamic imports; no diagnostics or application type checking is performed here.
const options: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext, jsx: ts.JsxEmit.Preserve,
  noResolve: true, lib: ["lib.es5.d.ts", "lib.es2015.promise.d.ts"], types: [], skipLibCheck: true, noEmit: true,
};
const originalHost = ts.createCompilerHost(options, true);
const sourceCache = new Map<string, ts.SourceFile>();
function programWith(virtual: ReadonlyMap<string, string>, oldProgram?: ts.Program): ts.Program {
  const host: ts.CompilerHost = {
    ...originalHost,
    fileExists: file => virtual.has(resolve(file)) || originalHost.fileExists(file),
    readFile: file => virtual.get(resolve(file)) ?? originalHost.readFile(file),
    getSourceFile(file, languageVersion, onError) {
      const key = resolve(file), changed = virtual.get(key);
      if (changed !== undefined) return ts.createSourceFile(file, changed, languageVersion, true);
      const cached = sourceCache.get(key);
      if (cached) return cached;
      const source = originalHost.getSourceFile(file, languageVersion, onError);
      if (source) sourceCache.set(key, source);
      return source;
    },
  };
  return ts.createProgram({ rootNames: [...roots, ...virtual.keys()], options, host, ...(oldProgram ? { oldProgram } : {}) });
}
function inspect(program: ts.Program) {
  const checker = program.getTypeChecker(), deferred: string[] = [], late: string[] = [], ordinary: string[] = [], invalid: string[] = [];
  function target(declaration: ts.Signature["declaration"]) {
    if (!declaration || resolve(declaration.getSourceFile().fileName) !== boundary || !ts.isFunctionDeclaration(declaration)) return undefined;
    const name = declaration.name?.text;
    return name === "withTenant" || name === "bindAfterLocks" ? name : undefined;
  }
  for (const file of program.getRootFileNames()) {
    const source = program.getSourceFile(file);
    if (!source) throw new Error(`Missing production source: ${file}`);
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node)) {
        let ancestor: ts.Node | undefined = node.parent;
        while (ancestor && !ts.isMethodDeclaration(ancestor)) ancestor = ancestor.parent;
        const location = `${relative(dbSource, file)}#${ancestor?.name?.getText(source) ?? "<module>"}`;
        const name = target(checker.getResolvedSignature(node)?.declaration);
        // call/apply/bind must not hide a fourth argument from the literal-mode check.
        if (ts.isPropertyAccessExpression(node.expression) && ["call", "apply", "bind"].includes(node.expression.name.text) &&
          checker.getTypeAtLocation(node.expression.expression).getCallSignatures().some(signature => target(signature.declaration))) {
          invalid.push(`${location}: indirect binding invocation`);
        }
        if (name) {
          if (node.arguments.some(ts.isSpreadElement)) invalid.push(`${location}: spread binding arguments`);
          if (name === "bindAfterLocks") {
            late.push(location);
            if (node.arguments.length !== 2) invalid.push(`${location}: late binding requires two arguments`);
          } else if (node.arguments.length > 3) {
            const mode = node.arguments[3];
            if (node.arguments.length !== 4 || !mode || !ts.isStringLiteral(mode)) invalid.push(`${location}: mode must be one literal fourth argument`);
            deferred.push(`${location}:${mode && ts.isStringLiteral(mode) ? JSON.stringify(mode.text) : "<dynamic>"}`);
          } else ordinary.push(location);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return { deferred: deferred.sort(), late: late.sort(), ordinary, invalid };
}
function requireApproved(result: ReturnType<typeof inspect>) {
  expect(result.invalid).toEqual([]);
  expect(result.deferred).toEqual(approved);
  expect(result.late).toEqual([approval]);
}

it("permits only the nine retained and five reviewed boundaries across production workspace aliases", () => {
  const program = programWith(new Map()), result = inspect(program);
  requireApproved(result);
  for (const ordinary of [
    "practice-worker-switch-repository.ts#switchOn", "practice-worker-switch-repository.ts#state",
    "commercial-integrity-v3-repository.ts#review", "evidence-pack-repository.ts#generate",
    "evidence-pack-repository.ts#list", "evidence-pack-repository.ts#download",
  ]) {
    expect(result.ordinary).toContain(ordinary);
    expect(result.deferred.some(call => call.startsWith(`${ordinary}:`))).toBe(false);
  }

  const bridge = join(workspace, "apps/api/src/lp6b-mutation-bridge.ts"), barrel = join(workspace, "apps/api/src/lp6b-mutation-barrel.ts");
  const caller = join(workspace, "apps/api/src/lp6b-mutation-caller.ts"), unexpected = `${relative(dbSource, caller)}#run`;
  const shared = [
    [bridge, 'export { withTenant as rebound, bindAfterLocks as reboundLate } from "../../../packages/db/src/tenant-context.js";'],
    [barrel, 'export * from "./lp6b-mutation-bridge.js";'],
  ] as const;
  let previous = program;
  for (const expression of ["aliased", "localAlias", "namespace.rebound", "dynamicAlias"]) {
    const virtual = new Map<string, string>([...shared, [caller, `
      import { rebound as aliased } from "./lp6b-mutation-barrel.js";
      import * as namespace from "./lp6b-mutation-barrel.js";
      const localAlias = aliased;
      export class Unexpected {
        async run() {
          const { rebound: dynamicAlias } = await import("./lp6b-mutation-barrel.js");
          return ${expression}({} as never, {} as never, async () => {}, "practice-switch-off");
        }
      }
    `]]);
    const mutated = programWith(virtual, previous), found = inspect(mutated);
    // A valid existing label must not authorize a sixth new caller, including aliases.
    expect(found.deferred).toContain(`${unexpected}:"practice-switch-off"`);
    expect(found.deferred).toHaveLength(approved.length + 1);
    expect(() => requireApproved(found)).toThrow();
    previous = mutated;
  }
  const virtual = new Map<string, string>([...shared, [caller, `
    import * as namespace from "./lp6b-mutation-barrel.js";
    const lateAlias = namespace.reboundLate;
    export class Unexpected { run() { return lateAlias({} as never, {} as never); } }
  `]]);
  const found = inspect(programWith(virtual, previous));
  expect(found.late).toEqual([unexpected, approval].sort());
  expect(() => requireApproved(found)).toThrow();
});
