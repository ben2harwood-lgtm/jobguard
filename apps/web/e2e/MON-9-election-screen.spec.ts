import { test, expect, type Page } from "@playwright/test";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
const loadCore = () => (new Function("specifier", "return import(specifier)") as
  (specifier: string) => Promise<typeof import("@jobguard/core")>)(pathToFileURL(join(process.cwd(), "../../packages/core/dist/index.js")).href);
const id = (n: number) => `d0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const path = `/jobs/${id(2)}/recovery-cases/${id(3)}/managed-recovery`;
const api = `**/api/jobs/${id(2)}/recovery-cases/${id(3)}/managed-recovery`;

// Native Chromium accessibility tree + WCAG text contrast and target checks.
// No network-loaded audit dependency; these checks cover this small form only.
async function accessible(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  const controls = nodes.filter(node => !node.ignored && ["radio", "checkbox", "button"].includes(String(node.role?.value)));
  expect(controls).toHaveLength(4);
  expect(controls.every(node => String(node.name?.value ?? "").trim().length > 0)).toBe(true);
  await cdp.detach();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-GB");
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  for (const control of await page.locator("main input, main button").all()) {
    const box = await control.boundingBox(); expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  const contrastFailures = await page.locator("main").evaluate(main => {
    const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (color: number[]) => color.map(v => { const c = v / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; })
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i]!, 0);
    return [...main.querySelectorAll("h1,p,label,legend,button:not(:disabled)")].filter(element => {
      const style = getComputedStyle(element);
      let ancestor: Element | null = element, background = [255, 255, 255];
      while (ancestor) {
        const color = getComputedStyle(ancestor).backgroundColor;
        if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") { background = rgb(color); break; }
        ancestor = ancestor.parentElement;
      }
      const a = luminance(rgb(style.color)), b = luminance(background);
      const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05) < (large ? 3 : 4.5);
    }).map(element => element.textContent);
  });
  expect(contrastFailures).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

// Browser transport fixture only. route.integration.test.ts and the existing
// managed-recovery PostgreSQL suites prove stored authority, replay and isolation.
for (const service of ["drafted_for_you", "solicitor_letter"] as const) {
  test(`${service}: explicit confirmation, unchanged fee and exact retry after a lost answer and reload`, async ({ page }) => {
    const core = await loadCore();
    let state: import("@jobguard/core").ManagedRecoveryState = { version: "managed-recovery-state.v1", environment: "synthetic_demo",
      tenantId: id(1), jobId: id(2), caseId: id(3), election: null, pursuitStartedAt: null };
    const choices = core.managedRecoveryCommandV1.shape.selection.options.map(option => ({
      label: `+${option.shape.points.value} points: ${option.shape.service.value === "drafted_for_you" ? "drafted for you" : "a solicitor letter"}`,
      command: { version: "managed-recovery-election-command.v1", caseId: id(3), termsVersion: core.MANAGED_RECOVERY_TERMS,
        selection: { service: option.shape.service.value, points: option.shape.points.value } },
    }));
    const view = () => ({ version: "managed-recovery-screen.v1", choices, termsVersion: core.MANAGED_RECOVERY_TERMS,
      successFeeLabel: "Unchanged 10% success fee", successFeeAmount: "£32.00",
      serviceChargeAmount: state.election ? (service === "drafted_for_you" ? "£16.00" : "£32.00") : null,
      preview: core.previewManagedRecoveryInvoice(state, { version: "managed-recovery-invoice-preview.v1", environment: "synthetic_demo",
        tenantId: id(1), jobId: id(2), caseId: id(3), cumulativeQualifyingPrincipal: { numerator: "32000", denominator: "1" } }),
      message: state.election ? "Your practice choice is saved for this case. Nothing has been issued or charged." : "Choose an optional practice service." });
    const bodies: unknown[] = [];
    await page.route(api, async route => {
      if (route.request().method() === "POST") {
        const command = route.request().postDataJSON(); bodies.push(command);
        state = core.electManagedRecovery(state, command, { environment: "synthetic_demo", tenantId: id(1), jobId: id(2), caseId: id(3),
          actorMembershipId: id(4), canApprove: true, now: "2026-11-04T09:00:00Z" });
        if (bodies.length === 1) { await route.abort("failed"); return; }
      }
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(view()) });
    });
    await page.goto(path);
    const main = page.getByRole("main");
    await expect(main.getByText(/Practice only — not on offer/)).toBeVisible();
    await expect(main.getByText("No service charge line in this preview.")).toBeVisible();
    await expect(main.getByText("Unchanged 10% success fee: £32.00")).toBeVisible();
    expect(bodies).toHaveLength(0);
    await accessible(page);
    const save = main.getByRole("button", { name: "Save practice choice" });
    await expect(save).toBeDisabled();
    const radio = main.getByRole("radio", { name: service === "drafted_for_you" ? "+5 points: drafted for you" : "+10 points: a solicitor letter" });
    await radio.focus(); await page.keyboard.press("Space"); await expect(radio).toBeChecked();
    await expect(save).toBeDisabled();
    await main.getByRole("checkbox").check(); await save.click();
    await expect(main.getByText("The result is uncertain. Retry the same choice to check it safely.")).toBeVisible();
    await page.reload();
    const retry = main.getByRole("button", { name: "Retry same choice" });
    await expect(retry).toBeEnabled(); await retry.click();
    await expect(main.getByText(/Your practice choice is saved/)).toBeVisible();
    expect(bodies).toHaveLength(2); expect(bodies[1]).toEqual(bodies[0]);
    await expect(main.getByText("Unchanged 10% success fee: £32.00")).toBeVisible();
    await expect(main.getByText(/Saved service charge preview/)).toBeVisible();
    await expect(main.getByRole("button", { name: "Save practice choice" })).toBeDisabled();
  });
}

test("pursuit refusal is plain and closes the form", async ({ page }) => {
  const core = await loadCore();
  const state = { version: "managed-recovery-state.v1", environment: "synthetic_demo", tenantId: id(1), jobId: id(2), caseId: id(3), election: null, pursuitStartedAt: null };
  await page.route(api, route => route.fulfill({ status: route.request().method() === "POST" ? 409 : 200, contentType: "application/json",
    body: JSON.stringify(route.request().method() === "POST" ? { code: "PURSUIT_ALREADY_STARTED", message: "Pursuit has already started. You cannot choose a managed-recovery service for this case." } : {
      version: "managed-recovery-screen.v1", preview: core.previewManagedRecoveryInvoice(state, { version: "managed-recovery-invoice-preview.v1", environment: "synthetic_demo", tenantId: id(1), jobId: id(2), caseId: id(3), cumulativeQualifyingPrincipal: { numerator: "0", denominator: "1" } }),
      termsVersion: core.MANAGED_RECOVERY_TERMS, successFeeLabel: "Unchanged 10% success fee", successFeeAmount: "£0.00", serviceChargeAmount: null, message: "Practice only",
      choices: [{ label: "+5 points: drafted for you", command: { version: "managed-recovery-election-command.v1", caseId: id(3), termsVersion: core.MANAGED_RECOVERY_TERMS, selection: { service: "drafted_for_you", points: 5 } } }],
    }) }));
  await page.goto(path);
  const main = page.getByRole("main");
  await main.getByRole("radio").check(); await main.getByRole("checkbox").check();
  await main.getByRole("button", { name: "Save practice choice" }).click();
  await expect(main.getByText(/Pursuit has already started/)).toBeVisible();
  await expect(main.getByRole("button", { name: "Save practice choice" })).toBeDisabled();
  await expect(main.getByRole("radio")).toBeDisabled();
});
