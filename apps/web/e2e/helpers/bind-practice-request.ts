import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import type { PoolClient } from "pg";

/** Bind the current browser's actual practice credential in a fixture transaction. */
export async function bindPracticeRequest(client: PoolClient, page: Page, tenantId: string) {
  const token = (await page.context().cookies()).find(cookie => cookie.name === "jg_session")?.value;
  if (!token) throw new Error("Browser practice session missing");
  const digest = createHash("sha256").update(token).digest("hex");
  await client.query("SELECT app.bind_request('practice',$1,$2)", [digest, tenantId]);
}
