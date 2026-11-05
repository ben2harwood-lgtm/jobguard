import { expect, test } from '@playwright/test';
// Rendering transport fixture only; real approval/RLS/read-only checks are in evidence-bundle-screen.integration.test.ts.
// Runs headless in the configured mobile-360 and desktop projects. No static domain-package import.
const id = '10000000-0000-4000-8000-000000000001';
test('practice bundle states, safe failures and refresh clear stale content', async ({ page }) => {
  let reason: string | null = null, unavailable = false;
  await page.route('**/api/contractor/jobs/*/bundle-check?*', route => route.fulfill({ status: unavailable ? 404 : 200,
    contentType: 'application/json', body: JSON.stringify(unavailable ? { code: 'NOT_FOUND' } : {
      version: 'contractor-bundle-check.v1', reason, manifestDigest: reason ? null : 'a'.repeat(64),
      sections: ['origin', 'approval', 'export', 'invoice', 'payment'].map(name => ({ name, state: reason ? 'not_checked' : ['origin', 'approval'].includes(name) ? 'present' : 'absent' })),
      report: reason ? null : { version: 'evidence-bundle-verification.v1', manifestHash: 'a'.repeat(64), findings: ['UNTRUSTED_MANIFEST', 'CHECKPOINT_MISSING', 'ABSENT_SECTIONS'],
        absent: [], altered: [], content: 'intact', checkpoint: 'missing', authorityBound: false, sourceComplete: false,
        exportIntegrityComplete: false, externallyVerified: false, externalClaims: 'externally_unverified', limitations: 'Synthetic only' },
    }) }));
  await page.goto(`/contractor/jobs/${id}/bundle-check?extraId=${id}&requestId=${id}`);
  const main = page.getByRole('main');
  await expect(main.getByText(/not proof of workmanship or customer agreement/)).toBeVisible();
  await main.getByRole('button', { name: 'Check bundle' }).click();
  await expect(main.getByRole('heading', { name: 'Not complete', exact: true })).toBeVisible();
  for (const name of ['export', 'invoice', 'payment']) await expect(main.getByText(`${name}: Absent`, { exact: true })).toBeVisible();
  await expect(main.getByText(/Checkpoint: missing/)).toBeVisible();
  for (const [code, text] of [['MISSING_ORIGINAL', 'An original file is missing'], ['WRONG_VERSION', 'An original file has the wrong version'],
    ['ALTERED_FILE', 'An original file has changed'], ['APPROVAL_OR_SCOPE_INVALID', 'Approval is stale']]) {
    reason = code!; await main.getByRole('button', { name: 'Check bundle' }).click();
    await expect(main.getByRole('alert')).toContainText(text!);
    await expect(main.getByText(/Manifest digest:/)).toHaveCount(0);
  }
  unavailable = true; await main.getByRole('button', { name: 'Check bundle' }).click();
  await expect(main.getByRole('alert')).toContainText('Bundle check unavailable');
  await expect(main.getByText('origin: Not checked', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
