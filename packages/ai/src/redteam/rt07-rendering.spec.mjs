import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const webRequire = createRequire(new URL('../../../../apps/web/package.json', import.meta.url));
const aiRequire = createRequire(new URL('../../package.json', import.meta.url));
const { test, expect } = webRequire('@playwright/test');
const viteRequire = createRequire(createRequire(aiRequire.resolve('vitest/package.json')).resolve('vite/package.json'));
const { build } = viteRequire('esbuild');
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
let bundle;
test.beforeAll(async () => {
  const output = await build({
    entryPoints: [fileURLToPath(new URL('./rt07-browser-entry.tsx', import.meta.url))], bundle: true, write: false,
    format: 'iife', platform: 'browser', jsx: 'automatic', nodePaths: [`${repo}/apps/web/node_modules`],
    define: { 'process.env.NODE_ENV': '"test"', 'process.env.NEXT_PUBLIC_JOBGUARD_V2_QUOTE_PROMPTS': '"0"' },
    plugins: [{ name: 'review-only-contracts', setup(build) {
      // The pricing branch is outside this scope-review harness; fail if entered accidentally.
      build.onResolve({ filter: /^\.\/quote-editor$/ }, () => ({ path: 'quote-editor', namespace: 'held-pricing' }));
      build.onLoad({ filter: /.*/, namespace: 'held-pricing' }, () => ({ contents: 'export function QuoteEditor() { throw new Error("Pricing is outside the RT-07 review harness"); }' }));
      build.onResolve({ filter: /^@jobguard\/api\/capture-contracts$/ }, () => ({ path: `${repo}/apps/api/src/capture/contracts.ts` }));
    } }],
  });
  bundle = output.outputFiles[0].text;
});
const cases = JSON.parse(readFileSync(new URL('./corpus/RT-07-injection.v1.json', import.meta.url), 'utf8'));
for (const [id, editedDescription] of [
  ['RT-07-073'], ['RT-07-075'], ['RT-07-077'],
  // Isolate the render boundary from the separately open F005 parser defect.
  ['RT-07-073', 'Fit panel labelled &lt;script&gt;'],
  ['RT-07-073', 'Fit panel labelled &lt;script&gt;alert(1)&lt;/script&gt;'],
]) test(`${id}${editedDescription ? ` edited: ${editedDescription}` : ''}: literal review, save and reopen; no HTML or dialog`, async ({ page }) => {
  const item = cases.find(item => item.id === id);
  const dialogs = [], errors = [], unexpectedRequests = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  page.on('pageerror', error => errors.push(error.message));
  let saved;
  await page.route('**/*', async route => {
    const request = route.request();
    if (request.url() === 'https://rt07.invalid/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="root"></div>' });
    if (request.url().endsWith('/review') && request.method() === 'POST') {
      const command = request.postDataJSON();
      saved = { ...saved, review: { ...command.review, revision: command.expectedRevision + 1 } };
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(saved) });
    }
    unexpectedRequests.push(request.url());
    return route.abort();
  });
  await page.goto('https://rt07.invalid/');
  await page.addScriptTag({ content: bundle });
  saved = await page.evaluate(text => window.rt07Capture(text), item.transcript);
  const description = page.locator('input[aria-label^="Description "]');
  await expect(description).toHaveValue(item.expect.lines[0].descriptionIncludes);
  if (editedDescription) await description.fill(editedDescription);
  const expectedDescription = editedDescription ?? item.expect.lines[0].descriptionIncludes;
  await expect(description).toHaveValue(expectedDescription);
  await expect(page.locator('.source pre')).toHaveText(item.transcript);
  await expect(page.locator('.review img, .review svg, .review iframe, .review script')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save review', exact: true }).click();
  await expect.poll(() => saved.review?.revision).toBe(1);
  expect(saved.review.lines[0].description).toBe(expectedDescription);
  expect(saved.source.text).toBe(item.transcript);
  await page.evaluate(result => window.rt07Mount(result), saved);
  await expect(description).toHaveValue(expectedDescription);
  await expect(page.locator('.source pre')).toHaveText(item.transcript);
  await expect(page.locator('.review img, .review svg, .review iframe, .review script')).toHaveCount(0);
  expect(dialogs).toEqual([]);
  expect(errors).toEqual([]);
  expect(unexpectedRequests).toEqual([]);
});
