import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { FinishConfirmation, JobFinish, finishRefusalMessage } from "./job-finish";
// Finish controls are independent of the inbox child's workspace runtime imports.
vi.mock("../../../../ui/possible-extras", () => ({ PossibleExtras: () => null }));
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
const failure = (code: string) => ({ version: "enterprise-live-prompt-error.v1", code, message: "private server detail" });
it("explains a non-live job without inviting the same retry", () => {
 expect(finishRefusalMessage(409, failure("JOB_NOT_LIVE"))).toBe("This job cannot be finished in its present state. Reload to check its current status.");
});
it("covers open visits and stale state without claiming which conflict occurred", () => {
 expect(finishRefusalMessage(409, failure("PROMPT_CONFLICT"))).toBe("The job state has changed or a site visit is still open. Close any open visit first, then reload to check the recorded job state.");
});
it.each(["UNAUTHENTICATED", "EXTRA_FORBIDDEN", "ORIGIN_FORBIDDEN", "MODE_FORBIDDEN", "PROMPT_PRACTICE_ONLY"])("keeps %s refusals neutral", code => {
 expect(finishRefusalMessage(code === "UNAUTHENTICATED" ? 401 : 403, failure(code))).toBe("This request is not permitted. Check your session and access, then reload.");
});
it.each([failure("FUTURE_CODE"), failure("INVALID_PROMPT_COMMAND"), null, "private server detail", { code: "JOB_NOT_LIVE" }, { version: "other.v1", code: "JOB_NOT_LIVE" }])("uses fixed definitive guidance for an unknown 4xx body %j", body => {
 expect(finishRefusalMessage(400, body)).toBe("The server refused this finish request. Reload to check the current job state before continuing.");
});
it("does not disclose job state from an access refusal even with a mismatched body", () => {
 expect(finishRefusalMessage(403, failure("JOB_NOT_LIVE"))).toBe("This request is not permitted. Check your session and access, then reload.");
});
