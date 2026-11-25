import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

test("the signed RAMS prints every section and the signature without the app shell", async ({ page }, testInfo) => {
  // The HTTPS RAMS journey signs a real seeded draft. This isolated document
  // exercises pagination in both regular CI viewport projects without signing in.
  const designed = join(__dirname, "../app/(designed)");
  const styles = await Promise.all(
    ["design.css", "design-fit.css", "design-tools.css", "jobs/[id]/rams/rams.css"]
      .map(file => readFile(join(designed, file), "utf8")),
  );
  const headings = ["Sequence of work", "Site rules", "Welfare", "Emergency contacts"];
  const sections = headings.map((heading, index) => {
    // Long edited sections are valid. Give each its own end marker to detect
    // clipping inside a section even when its heading is still visible.
    const notes = Array.from({ length: 24 }, (_, line) => `Fictional entry ${line + 1} in section ${index + 1}. `).join("\n");
    return `<section class="card"><div class="card-head"><div><h2>${heading}</h2></div></div>
      <p class="rams-section-text card-body">${notes}\nEnd of checked section ${index + 1}.</p></section>`;
  });
  const signature = "Signed by Fictional Builder on 25 November 2026 at 05:00";
  await page.route("**/*", route => route.abort());
  await page.setContent(`<!doctype html><html><head><style>${styles.join("\n")}</style></head><body>
    <div class="jgd"><div class="rr-app rr-is-inner" data-persona="owner">
      <aside class="rr-rail">Main navigation</aside><main id="main" class="rr-main">
      <header class="rr-header">Search jobs</header><div id="reference-content" class="rr-inner-content">
      <div class="work-heading">Keep the work ready</div>
      <section class="jgd-legacy jgd-tools" aria-label="Job workspace"><div class="rams-page">
      <div class="rams-controls">Reload draft</div><article id="rams-document">
      <h1>Risk assessment, method statement and construction phase plan</h1>
      <p>Signed — read-only</p>${sections.join("")}<section><h2>Builder signature</h2><p>${signature}</p></section>
      </article></div></section></div></main><nav class="rr-mobile-nav">Mobile navigation</nav></div></div>
    </body></html>`);
  const path = testInfo.outputPath("signed-rams.pdf");
  await page.pdf({ path, format: "A4", printBackground: true });
  await testInfo.attach("signed RAMS", { path, contentType: "application/pdf" });
  const text = execFileSync("pdftotext", [path, "-"], { encoding: "utf8" });
  const pages = text.split("\f").map(part => part.replace(/\s+/gu, " ").trim()).filter(Boolean);
  expect(pages.length).toBeGreaterThan(1);
  const printed = pages.join(" ");
  for (const [index, heading] of headings.entries()) {
    expect(printed).toContain(heading);
    expect(printed).toContain(`End of checked section ${index + 1}.`);
  }
  expect(printed).toContain("Builder signature");
  expect(pages.at(-1)).toContain(signature);
  expect(printed).not.toMatch(/Main navigation|Search jobs|Keep the work ready|Reload draft|Mobile navigation/u);
});
