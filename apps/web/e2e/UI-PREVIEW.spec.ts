import { test, expect, type Page } from '@playwright/test';

// Real Next route tests. These are not the offline compatibility harness.
// When testing a production build outside Vercel preview, start it with
// JOBGUARD_UI_PREVIEW=1. Never enable this route on Vercel production.
async function role(page: Page, persona: string) {
  await page.getByLabel('Fictional role', { exact: true }).selectOption(persona);
}
async function navigation(page: Page, label: string) {
  const desktop = page.getByRole('navigation', { name: 'Workspace navigation', exact: true });
  if (!(await desktop.isVisible())) await page.getByRole('button', { name: 'Toggle navigation', exact: true }).click();
  await desktop.getByRole('button', { name: new RegExp(`^${label}`) }).click();
}

const enabledPreview = process.env.VERCEL_ENV !== 'production'
  && (process.env.CI !== 'true' || process.env.JOBGUARD_UI_PREVIEW === '1' || process.env.VERCEL_ENV === 'preview');

test('preview is closed on the normal production-mode CI host', async ({ request }) => {
  test.skip(enabledPreview, 'This run explicitly enables the isolated preview.');
  const response = await request.get('/preview');
  expect(response.status()).toBe(404);
});

test.describe('explicitly enabled preview', () => {
  test.skip(!enabledPreview, 'Requires JOBGUARD_UI_PREVIEW=1 on an isolated test host; not evidence of a passed journey.');

test('design capture, pricing and exact-revision approvals survive reload', async ({ page }) => {
  await page.goto('/preview');
  await page.getByRole('button', { name: 'Log an extra', exact: true }).first().click();
  await page.getByLabel('What is the extra work?', { exact: true }).fill('Fit a replacement sink trap');
  await page.getByLabel('Why is this outside the work order?', { exact: true }).fill('The fictional order instructs tap replacement only.');
  await page.getByRole('button', { name: /Attach fictional evidence/ }).click();
  await page.getByLabel(/I have reviewed the fictional description/).check();
  await page.getByRole('button', { name: 'Record fictional extra', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Fit a replacement sink trap', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Fit a replacement sink trap', exact: true })).toBeVisible();
  await expect(page.getByText('Unpriced', { exact: true })).toBeVisible();
  await role(page, 'surveyor');
  await navigation(page, 'Review queue');
  await page.getByRole('button', { name: /Fit a replacement sink trap/ }).click();
  await page.getByLabel('Illustrative net price (£)', { exact: true }).fill('123.45');
  await page.getByRole('button', { name: 'Save fictional price', exact: true }).click();
  await role(page, 'supervisor');
  await navigation(page, 'Review queue');
  await page.getByRole('button', { name: /Fit a replacement sink trap/ }).click();
  await page.getByRole('button', { name: 'Submit for supervisor review', exact: true }).click();
  await page.getByRole('button', { name: 'Approve this revision', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm fictional approval', exact: true }).click();
  await role(page, 'client');
  await page.getByRole('button', { name: /Fit a replacement sink trap/ }).click();
  await page.getByRole('button', { name: 'Approve this revision', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm fictional approval', exact: true }).click();
  await page.reload();
  await expect(page.getByText('Approved in this design · not billed or paid', { exact: true })).toBeVisible();
  await expect(page.getByText('£123.45', { exact: true }).first()).toBeVisible();
});

test('client and pre-lock builder views do not expose internal findings', async ({ page }) => {
  await page.goto('/preview#view=billing&person=client');
  await expect(page.getByRole('heading', { name: 'Ready for billing', exact: true })).toHaveCount(0);
  await role(page, 'builder');
  await page.getByRole('button', { name: 'Final account', exact: true }).click();
  await expect(page.getByText('Additional boxing-in described in a job note', { exact: true })).toHaveCount(0);
});

test('all mapped views are reachable and explicitly labelled specimens', async ({ page }) => {
  await page.goto('/preview#view=catalogue&person=finance');
  await expect(page.getByTestId('screen-card')).toHaveCount(143);
  for (const index of [0, 24, 37, 43, 67, 82, 94, 117, 124, 142]) {
    await page.getByTestId('screen-card').nth(index).click();
    await expect(page.getByText('Layout specimen', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'All screens', exact: true }).click();
  }
});

test('an unavailable practice service cannot become a successful example', async ({ page }) => {
  // Failure fixture only: no successful server command is mocked here.
  await page.route('**/api/northside**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"code":"UNAVAILABLE"}' }));
  await page.goto('/preview');
  await page.getByRole('button', { name: 'Practice service', exact: false }).click();
  await page.getByRole('button', { name: 'Connect to practice service', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Practice records unavailable', exact: true })).toBeVisible();
  await expect(page.locator('.jg-practice-extras .jg-card')).toHaveCount(0);
  await expect(page.getByText('Server response validated', { exact: true })).toHaveCount(0);
});

test('mobile capture remains usable at 360 and 390 pixels', async ({ page }) => {
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/preview');
    await expect(page.getByRole('heading', { name: 'Good morning, Alex.', exact: true })).toBeVisible();
    await page.getByRole('navigation', { name: 'Mobile navigation', exact: true }).getByRole('button', { name: 'Log extra', exact: true }).click();
    await expect(page.getByLabel('What is the extra work?', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

});
