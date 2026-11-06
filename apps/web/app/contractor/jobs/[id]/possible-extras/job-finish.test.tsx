import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { FinishConfirmation, JobFinish } from "./job-finish";
vi.stubGlobal("React", React);
const jobId = "00000000-0000-4000-8000-000000000002";
const render = (canFinish: boolean, initialFinish: unknown = null) => renderToStaticMarkup(createElement(JobFinish, { jobId, canFinish, initialFinish }));
it("shows Finish job only when server checked owner authority", () => {
 expect(render(true)).toContain(">Finish job</button>");
 expect(render(false)).not.toContain("Finish job");
 expect(render(false, { jobId, finishedAt: "now", checkRan: true, promptsRaised: 1 })).not.toContain("Job finished");
});
it("presents one plain confirmation with confirm and cancel", () => {
 const html = renderToStaticMarkup(createElement(FinishConfirmation, { busy: false, confirm: () => undefined, cancel: () => undefined }));
 expect(html).toContain("Finish this job?"); expect(html).toContain("Confirm finish"); expect(html).toContain("Cancel");
 expect(render(true)).not.toContain("Confirm finish");
});
it("shows the recorded result after reload and does not offer another finish", () => {
 const html = render(true, { jobId, finishedAt: "2026-11-04T12:00:00Z", checkRan: true, promptsRaised: 2 });
 expect(html).toContain("Job finished"); expect(html).toContain("2 possible extras raised"); expect(html).not.toContain(">Finish job</button>");
 expect(render(true, { jobId: crypto.randomUUID(), finishedAt: "now", checkRan: true, promptsRaised: 9 })).not.toContain("Job finished");
});
