import test from "node:test";
import assert from "node:assert/strict";
import { checkAiProviderBoundarySource, checkAiProviderBoundary } from "./ai-provider-boundary-lint.mjs";

const file = "apps/api/src/feature.ts";
test("dark provider construction must go directly through AiGateway", () => {
  assert.deepEqual(checkAiProviderBoundarySource(file,
    'import { createDarkClaudeProvider } from "@jobguard/ai"; new AiGateway(createDarkClaudeProvider(config, transport));'), []);
  for (const source of [
    'createDarkClaudeProvider(config, transport).execute(request);',
    'const provider = createDarkClaudeProvider(config, transport);',
    'const factory = createDarkClaudeProvider;',
    'import { createDarkClaudeProvider as bypass } from "@jobguard/ai";',
    'const { createDarkClaudeProvider: bypass } = ai;',
    'new AiGateway(ai.createDarkClaudeProvider(config, transport));',
    'ai["createDarkClaudeProvider"](config, transport);',
    'ai[`createDarkClaudeProvider`](config, transport);',
    'export { createDarkClaudeProvider as bypass } from "@jobguard/ai";',
  ]) assert.ok(checkAiProviderBoundarySource(file, source).length, source);
});
test("computed provider namespace access cannot bypass the gateway", () => {
  for (const source of [
    'ai[name](config, transport);',
    'ai?.[name](config, transport);',
    '(ai)[name](config, transport);',
    'import * as providers from "@jobguard/ai"; providers[name](config, transport);',
    'import * as providers from "./claude-provider.js"; providers[name](config, transport);',
  ]) assert.ok(checkAiProviderBoundarySource(file, source).length, source);
  assert.deepEqual(checkAiProviderBoundarySource(file, 'const value = ordinary[name];'), []);
});
test("the factory definition is allowed only in its adapter", () => {
  const source = 'export function createDarkClaudeProvider() {}';
  assert.deepEqual(checkAiProviderBoundarySource("packages/ai/src/claude-provider.ts", source), []);
  assert.ok(checkAiProviderBoundarySource(file, source).length);
});
test("all current application and package sources respect the gateway boundary", () => {
  assert.doesNotThrow(() => checkAiProviderBoundary());
});
