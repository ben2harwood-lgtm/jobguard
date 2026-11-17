import { expect, test, type Page } from '@playwright/test';
test.setTimeout(240_000);
const base = 'http://127.0.0.1:3000';
const B = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const banner = 'Practice sandbox — synthetic data; nothing is sent or charged';
async function startPractice(page: Page) {
  await page.goto('/admin/contractor');
  await B(page, 'Start generated contractor practice').click();
  await expect(page.getByTestId('contractor-revision')).toHaveText('0');
}
async function importSample(page: Page, label: RegExp, counts: string) {
  await page.getByLabel(label).check();
  await B(page, 'Import selected file').click();
  await expect(page.getByTestId('import-counts')).toHaveText(counts);
}
const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const identities = (page: Page, revision: number) => page.locator(`[data-testid="revision-${revision}"] code[title]`).evaluateAll(nodes => nodes.map(node => (node as HTMLElement).title));

test('the office imports generated files, sees a typed error on a refused row, revises orders, and the persisted state is the same after reload and in a second browser', async ({ page, browser }) => {
  await startPractice(page);
  // Reach the register from Jobs, the way an office user would.
  await page.goto('/');
  await page.getByRole('button', { name: 'Skip tour', exact: true }).click();
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('link', { name: 'Contractor work orders', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Work orders', level: 1 })).toBeVisible();
  await expect(page.getByTestId('register-status')).toHaveText('Persisted register loaded');
  await expect(page.getByText(banner, { exact: true })).toHaveCount(1);
  await expect(page.getByTestId('orders-table')).toHaveCount(0);

  // A file with problems: two good rows and five refused ones, each with its own typed error.
  await importSample(page, /Orders with problems/, '2 created · 0 revised · 0 unchanged · 5 refused (of 7 rows)');
  await expect(page.getByRole('heading', { name: 'Import results' })).toBeFocused();
  const expectations: Array<[number, string]> = [[3, 'UNKNOWN_SOR_CODE'], [4, 'QUANTITY_PRECISION'], [5, 'CONTRACTOR_PARTIES_REQUIRED'], [6, 'NEGATIVE_QUANTITY'], [7, 'MONEY_OUT_OF_RANGE']];
  for (const [row, code] of expectations) await expect(page.getByTestId(`receipt-row-${row}`)).toContainText(code);
  await expect(page.getByTestId('receipt-row-2')).toContainText('Created');
  await expect(page.getByTestId('receipt-row-8')).toContainText('Created');

  // The starter orders, then the same file again (a recorded replay that writes nothing).
  await importSample(page, /Starter orders/, '5 created · 0 revised · 0 unchanged · 0 refused (of 5 rows)');
  await B(page, 'Import selected file').click();
  await expect(page.getByRole('heading', { name: 'This file was already imported - nothing new was written' })).toBeVisible();
  await expect(page.getByTestId('orders-table').locator('tbody tr')).toHaveCount(7);

  // Revisions: two orders change, one is cancelled, one repeats unchanged.
  await importSample(page, /Revised orders/, '0 created · 3 revised · 1 unchanged · 0 refused (of 4 rows)');
  await expect(page.getByTestId('receipt-row-5')).toContainText('Unchanged (recorded)');
  await expect(page.getByTestId('order-WO-DEMO-0001')).toContainText('Live');
  await expect(page.getByTestId('order-WO-DEMO-0003')).toContainText('Cancelled');
  await expect(page.getByTestId('order-WO-DEMO-0004')).toContainText('1');

  // The revision view of an order: both revisions, the diff, and the same line identities.
  await page.getByRole('link', { name: 'Revisions of WO-DEMO-0002', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Order WO-DEMO-0002', level: 1 })).toBeVisible();
  await expect(page.getByTestId('current-revision')).toHaveText('2');
  await expect(page.getByTestId('job-state')).toHaveText('Live');
  await expect(page.getByTestId('job-team')).toHaveText('Fictional team');
  await expect(page.getByTestId('job-operatives')).toHaveText('1');
  await expect(page.getByTestId('diff-1')).toContainText('First revision: 2 lines added.');
  await expect(page.getByTestId('diff-2')).toHaveText('Changed since revision 1: priority; lines added 1, removed 0, changed 1.');
  const first = await identities(page, 1), second = await identities(page, 2);
  expect(first).toHaveLength(2); expect(second).toHaveLength(3);
  expect(second.slice(0, 2)).toEqual(first);
  await expect(page.getByTestId('revision-2').getByText('Added', { exact: true })).toHaveCount(1);
  await expect(page.getByTestId('revision-2').getByText('Changed', { exact: true })).toHaveCount(1);
  for (const text of ['Fictional Resident', 'resident-canary', '@resident']) await expect(page.getByText(text)).toHaveCount(0);
  const jobId = await page.getByTestId('job-id').innerText();

  // Reload and a second browser context show the same persisted state.
  await page.reload();
  await expect(page.getByTestId('current-revision')).toHaveText('2');
  await expect(page.getByTestId('job-state')).toHaveText('Live');
  expect(await identities(page, 2)).toEqual(second);
  const context = await browser.newContext(); await context.addCookies(await page.context().cookies());
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(other.getByTestId('current-revision')).toHaveText('2');
  await expect(other.getByTestId('job-id')).toHaveText(jobId);
  expect(await identities(other, 2)).toEqual(second);
  await other.goto('/contractor/work-orders');
  await expect(other.getByTestId('orders-table').locator('tbody tr')).toHaveCount(7);
  await expect(other.getByTestId('batch')).toHaveCount(3);

  // Services and transport: the register, a batch and the projections come from the same persisted rows; the contact never appears.
  const overview = await page.request.get('/api/contractor/work-order-imports');
  expect(overview.status()).toBe(200);
  const body = await overview.json(); expect(body.realExternalActions).toBe(0); expect(body.orders).toHaveLength(7);
  for (const forbidden of ['Fictional Resident', 'resident-canary', 'phone', 'email']) expect(JSON.stringify(body)).not.toContain(forbidden);
  const batch = await page.request.get(`/api/contractor/work-order-imports/${body.batches[0].id}`);
  expect(batch.status()).toBe(200); expect((await batch.json()).rows.length).toBeGreaterThan(0);
  // The owner imports and administers but holds no job.read: the job's own scheduling projection and an unknown id are the identical 404.
  const hidden = await page.request.get(`/api/contractor/jobs/${jobId}/assignments`), unknown = await page.request.get(`/api/contractor/jobs/${crypto.randomUUID()}/assignments`);
  expect(hidden.status()).toBe(404); expect(unknown.status()).toBe(404);
  expect(await hidden.json()).toEqual({ version: 'work-order-error.v1', code: 'NOT_FOUND', recoverable: false }); expect(await unknown.json()).toEqual(await hidden.json());
  expect((await page.request.get(`/api/contractor/jobs/${jobId}/site-visits`)).status()).toBe(404);
  // There is no scheduling write route, and an arbitrary upload or a cross-site write is refused.
  for (const method of ['post', 'put', 'delete'] as const) expect((await page.request[method](`/api/contractor/jobs/${jobId}/assignments`, { headers: { origin: base }, data: {} })).status()).toBe(405);
  const upload = await page.request.post('/api/contractor/work-order-imports', { headers: { origin: base }, data: { version: 'work-order-import-request.v1', environment: 'synthetic_demo', commandId: crypto.randomUUID(), source: { kind: 'csv', name: 'mine.csv', csv: 'version\r\n' } } });
  expect(upload.status()).toBe(403); expect((await upload.json()).code).toBe('UPLOAD_NOT_ALLOWED');
  const foreign = await page.request.post('/api/contractor/work-order-imports', { headers: { origin: 'https://foreign.invalid' }, data: {} });
  expect(foreign.status()).toBe(404);

  expect(await noSideScroll(page)).toBe(true);
  await page.goto('/contractor/work-orders');
  expect(await noSideScroll(page)).toBe(true);
  const button = B(page, 'Import selected file'); await button.focus(); await expect(button).toBeFocused();
  expect(await button.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
  const box = await button.boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `test-results/ENT-2-${test.info().project.name}.png`, fullPage: true });
  await context.close();
});

test('without a generated contractor practice the register asks you to start one, and a refused request never looks saved', async ({ page }) => {
  await page.goto('/contractor/work-orders');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Start the generated contractor practice first.');
  await expect(page.getByRole('main').getByRole('alert')).toBeFocused();
  await expect(page.getByRole('link', { name: 'Open contractor practice', exact: true })).toBeVisible();
  await expect(page.getByText(banner, { exact: true })).toHaveCount(1);
  expect((await page.request.get('/api/contractor/work-order-imports')).status()).toBe(401);
  expect((await page.request.get(`/api/contractor/work-orders/${crypto.randomUUID()}/revisions`)).status()).toBe(401);
  expect(await noSideScroll(page)).toBe(true);
});
