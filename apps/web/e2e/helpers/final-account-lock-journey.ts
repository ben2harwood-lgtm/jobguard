import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { openLiveWatchdogJob } from "./capture-journey";
import { jsonResult } from "./customer-invoice-journey";

export async function prepareLockJob(page: Page) {
  await openLiveWatchdogJob(page);
  const jobId = (await page.locator(".quote-editor").getAttribute("data-job-id"))!;
  const tenantId = "11111111-1111-4111-8111-111111111111";
  await jsonResult(page.request.post("/api/decisions", { data: { version: "finding-evaluation-command.v1", commandId: randomUUID(), tenantId, jobId } }), "Evaluate proof requirement");
  const proofPath = `/api/jobs/${jobId}/proof`;
  const initial = await jsonResult(page.request.get(proofPath), "Read proof requirement");
  const proofCommand = (data: Record<string, unknown>) => jsonResult(page.request.post(proofPath, { data: { version: "practice-proof-command.v1", commandId: randomUUID(), ...data } }), "Prepare lock proof");
  const selected = await proofCommand({ action: "select_generated", scopeItemId: initial.scopeItemId, fixture: "completion-photo" });
  const finalized = await proofCommand({ action: "finalize", uploadId: selected.upload.id, objectVersionId: selected.upload.objectVersionId });
  expect(finalized.upload.state).toBe("verified");
  await proofCommand({ action: "complete", evidenceId: finalized.upload.evidenceId, scopeItemId: initial.scopeItemId });
  const final = await jsonResult(page.request.post(`/api/jobs/${jobId}/final-account`, { data: { version: "final-account.assemble.v1", commandId: randomUUID(), expectedRevision: 0 } }), "Build account for lock");
  expect(final.account.issueBlocked).toBe(false);
  await page.goto(`/jobs/${jobId}#final-account-title`);
  await expect(page.getByTestId("final-account-lock")).toBeVisible();
  return { jobId, tenantId, evidenceId: finalized.upload.evidenceId as string, account: final.account };
}

export async function finishDispositionsAndTerms(page: Page) {
  const panel = page.getByTestId("final-account-lock");
  // The panel is on screen while it still reads "Loading final account…"; count the dispositions only once the persisted view has loaded.
  await expect(panel.getByTestId("lock-state")).toHaveText("Final account review");
  const dispositions = panel.getByRole("combobox");
  for (let index = 0; index < await dispositions.count(); index++) {
    await dispositions.nth(index).selectOption("done");
    await expect(panel).toHaveAttribute("aria-busy", "false");
  }
  const terms = panel.getByRole("button", { name: "Accept final check terms", exact: true });
  if (await terms.isEnabled()) await terms.click();
  await expect(panel.getByRole("button", { name: "Complete final account", exact: true })).toBeEnabled();
}

/** Synthetic setup uses an actual login inheriting only the existing shadow role. */
export async function withSyntheticShadow<T>(tenantId: string, run: (pool: Pool, admin: Pool) => Promise<T>): Promise<T> {
  const credential = ["sbox", "e2e", "owner"].join("-");
  const admin = new Pool({ host: "127.0.0.1", port: 55432, database: "jobguard_synthetic_demo", user: "postgres", password: credential });
  const login = `sv4_web_${randomUUID().replaceAll("-", "")}`;
  const generated = randomUUID();
  let shadow: Pool | undefined;
  try {
    await admin.query(`CREATE ROLE "${login}" LOGIN PASSWORD '${generated}' IN ROLE jobguard_shadow NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    // pg discards a connection after a failed pool.query, so the tenant context travels with every new connection (startup option), not with one session.
    shadow = new Pool({ host: "127.0.0.1", port: 55432, database: "jobguard_synthetic_demo", user: login, password: generated, max: 1, options: `-c app.tenant_id=${tenantId}` });
    return await run(shadow, admin);
  } finally {
    await shadow?.end();
    await admin.query(`DROP ROLE IF EXISTS "${login}"`);
    await admin.end();
  }
}

export async function seedManySignals(tenantId: string, jobId: string, evidenceId: string) {
  await withSyntheticShadow(tenantId, async (shadow, admin) => {
    for (let index = 0; index < 25; index++) {
      const signalId = randomUUID();
      await shadow.query(`INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state)
        VALUES($1,$2,$3,$4,'unrecorded_extra','deterministic','synthetic_web.v1',clock_timestamp(),'Synthetic held extra','low','held_for_final_check')`, [tenantId, jobId, signalId, randomUUID()]);
      // SELECT by the administrator supplies the version-specific evidence fact;
      // INSERT itself is executed through the restricted shadow login.
      const row = (await admin.query("SELECT object_version_id,sha256,server_received_at::text AS received FROM app.evidence_object WHERE tenant_id=$1 AND job_id=$2 AND id=$3", [tenantId, jobId, evidenceId])).rows[0];
      expect(row).toBeDefined();
      await shadow.query("INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,$5,$6,$7)", [tenantId, jobId, signalId, evidenceId, row.object_version_id, row.sha256, row.received]);
    }
  });
}
