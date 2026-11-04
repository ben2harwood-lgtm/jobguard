import { describe, expect, it } from "vitest";
import { MissingObjectVersionError, sha256, storageEnvironmentSchema } from "./index.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

it("keeps process execution out of the storage barrel imported by db and the web Worker", () => {
  const visited = new Set<string>();
  function inspect(url: URL): void {
    if (visited.has(url.href)) return;
    visited.add(url.href);
    const source = ts.createSourceFile(fileURLToPath(url), readFileSync(url, "utf8"), ts.ScriptTarget.Latest);
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
      if ((ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly) ||
          (ts.isExportDeclaration(statement) && statement.isTypeOnly)) continue;
      const specifier = statement.moduleSpecifier;
      if (!specifier || !ts.isStringLiteral(specifier)) continue;
      expect(specifier.text).not.toMatch(/^(?:node:)?child_process$/u);
      if (specifier.text.startsWith(".")) inspect(new URL(specifier.text.replace(/\.js$/u, ".ts"), url));
    }
  }
  inspect(new URL("./index.ts", import.meta.url));
});
describe("storage boundary",()=>{it("validates private adapter configuration and hashes bytes",()=>{expect(storageEnvironmentSchema.parse({S3_ENDPOINT:"http://localhost:9000",S3_BUCKET:"evidence-private",S3_ACCESS_KEY_ID:"test",S3_SECRET_ACCESS_KEY:"test"}).S3_REGION).toBe("eu-west-2");expect(sha256(new Uint8Array([1]))).toHaveLength(64);});it("has a typed missing-version failure",()=>expect(new MissingObjectVersionError().code).toBe("MISSING_OBJECT_VERSION"));});
