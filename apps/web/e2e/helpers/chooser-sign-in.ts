import { createHmac } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { E2E_ADMIN_DATABASE_URL, E2E_AUTH_CODE_SECRET } from "../global-setup";

// Release only this spec's disposable request-window fixtures, as DEMO-S-chooser does.
const emails: string[] = [];
export async function releaseChooserSignIns() {
  if (!emails.length) return;
  const pool = new Pool({ connectionString: E2E_ADMIN_DATABASE_URL, max: 1 });
  try {
    await pool.query(`DELETE FROM identity.request_window w USING identity.challenge c
      WHERE c.email=ANY($1::text[]) AND w.requested_at=c.requested_at AND w.ip_digest=$2`,
    [emails, createHmac("sha256", E2E_AUTH_CODE_SECRET).update("ip:web-bootstrap").digest("hex")]);
  } finally { await pool.end(); emails.length = 0; }
}
export async function signInForChooser(page: Page) {
  await page.goto("/sign-in");
  const email = `demo-s-${crypto.randomUUID()}@practice.invalid`;
  emails.push(email);
  await page.getByLabel("Fictional email address").fill(email);
  await page.getByRole("button", { name: "Request code", exact: true }).click();
  const code = await page.getByTestId("fixture-code").textContent();
  await page.getByLabel("Eight-digit code").fill(code!);
  await page.getByRole("button", { name: "Verify code" }).click();
  await expect(page.getByRole("heading", { name: "Signed in", exact: true })).toBeVisible();
}
