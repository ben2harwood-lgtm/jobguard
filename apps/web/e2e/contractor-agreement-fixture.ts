import type { Page } from "@playwright/test";
import { Pool } from "pg";
import { seedActiveContractorAgreement } from "../../../packages/db/test/contractor-agreement-test-fixture.js";

/** Persist explicit fictional authority after real practice creation, before downstream commands. */
export async function installContractorAgreementFixture(page: Page) {
  await page.route("**/api/contractor?action=start", async route => {
    const response = await route.fetch();
    if (response.ok()) {
      const workspace = await response.json();
      const admin = new Pool({ host: "127.0.0.1", port: 55432, user: "postgres", password: "sbox-e2e-owner", database: "jobguard_synthetic_demo", max: 1 });
      try { await seedActiveContractorAgreement(admin, workspace.tenantId); } finally { await admin.end(); }
    }
    await route.fulfill({ response });
  });
}
