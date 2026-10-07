import { describe, expect, it } from "vitest";
import ts from "typescript";
const root = decodeURIComponent(new URL(".", import.meta.url).pathname).replace(/\/(?:src|dist)\/shadow-domain\/$/u, "/src/shadow-domain/");
const readFileSync = (file: string, _encoding: string) => { const value = ts.sys.readFile(file); if (value === undefined)
    throw new Error(`Missing source ${file}`); return value; };
const resolve = (base: string, path: string) => decodeURIComponent(new URL(path, `file://${base.endsWith("/") ? base : base + "/"}`).pathname);
const production = (dir: string): string[] => ts.sys.readDirectory(dir, [".ts"], ["**/*.test.ts"]);
describe("SV-1 shadow domain", () => {
    it("shadow consumers delegate to SH-1", () => {
        const seen = new Set<string>(), visit = (file: string) => {
            if (seen.has(file))
                return;
            seen.add(file);
            const text = readFileSync(file, "utf8"), ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
            const walk = (node: ts.Node) => {
                if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
                    if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
                        const target = node.moduleSpecifier.text;
                        expect(target === "zod" || target.startsWith(".")).toBe(true);
                        if (target.startsWith(".")) {
                            const dependency = decodeURIComponent(new URL(target.replace(/\.js$/u, ".ts"), `file://${file}`).pathname);
                            expect(dependency).toContain("/packages/core/src/");
                            visit(dependency);
                        }
                    }
                if (ts.isCallExpression(node)) {
                    expect(node.expression.getText(ast)).not.toMatch(/^(?:fetch|require|import|eval|Math\.round)$/u);
                }
                ts.forEachChild(node, walk);
            };
            walk(ast);
        };
        const files = production(root);
        for (const file of files)
            visit(file);
        const fee = readFileSync(resolve(root, "success-fee.ts"), "utf8");
        const feeAst = ts.createSourceFile("success-fee.ts", fee, ts.ScriptTarget.Latest, true), calls = new Set<string>();
        const actualCalls = (node: ts.Node) => { if (ts.isCallExpression(node) && ts.isIdentifier(node.expression))
            calls.add(node.expression.text); ts.forEachChild(node, actualCalls); };
        actualCalls(feeAst);
        expect(calls.has("calculateCumulativeFee")).toBe(true);
        expect(calls.has("allocateReceiptToLines")).toBe(true);
        expect(calls.has("sumExactPence")).toBe(true);
        // New production modules contain no monetary multiplication/division or copied rounding loop.
        for (const file of files) {
            const ast = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
            const inspect = (node: ts.Node) => { if (ts.isBinaryExpression(node))
                expect([ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken].includes(node.operatorToken.kind)).toBe(false); ts.forEachChild(node, inspect); };
            inspect(ast);
        }
        expect(fee).toMatch(/import\s*\{[^}]*calculateCumulativeFee[^}]*\}\s*from "\.\.\/cumulative-fee\.js"/u);
        expect(fee).toMatch(/import\s*\{[^}]*allocateReceiptToLines[^}]*\}\s*from "\.\.\/receipt-allocation\.js"/u);
        expect(fee).toMatch(/\bcalculateCumulativeFee\s*\(/u);
        expect(fee).toMatch(/\ballocateReceiptToLines\s*\(/u);
        for (const file of files) {
            const text = readFileSync(file, "utf8");
            expect(text).not.toMatch(/(?:function|const)\s+(?:calculateCumulativeFee|allocateReceiptToLines|divideRounded|multiplyRatio|roundHalfEven|gcd)\b/u);
            expect(text).not.toMatch(/\b(?:divideRounded|multiplyRatio|Math\.round)\s*\(/u);
            expect(text).not.toMatch(/from\s+["'](?:node:|@jobguard\/(?:db|ai|config)|@aws|@anthropic|stripe|pg|postgres)/u);
        }
        const signal = readFileSync(resolve(root, "signal.ts"), "utf8");
        expect(signal).not.toMatch(/\b(?:createAttributionFacts|createEligibilityFacts|createSuccessFeeInput|deriveShadowSuccessFee|parseShadowOrigin)\s*\(/u);
        expect(readFileSync(resolve(root, "lock.ts"), "utf8")).toContain('import { sha256 } from "../evidence-pack.js"');
    });
});
