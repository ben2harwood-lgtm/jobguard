import { describe, expect, it } from "vitest";
import { jobStatuses } from "@jobguard/core";
import { hasStartedWork, jobStatusLabels, mayOpenSavedQuote, requestedWorkspaceSection } from "./workspace-lifecycle";
describe("saved workspace navigation",()=>{
 it.each(jobStatuses)("has a distinct truthful label for %s",status=>{expect(jobStatusLabels[status]).toBeTruthy();if(status!=="draft")expect(jobStatusLabels[status]).not.toBe(jobStatusLabels.draft)});
 it.each(["draft","lost"] as const)("never turns %s into an active quote via an anchor",status=>{for(const hash of["#quote","#work-proof","#final-account-title"]){expect(requestedWorkspaceSection(status,hash)).toBe("scope")}expect(mayOpenSavedQuote(status)).toBe(false)});
 it.each(["quoting","accepted"] as const)("takes %s to the quote rather than inventing started work",status=>{expect(requestedWorkspaceSection(status,"#work-proof")).toBe("quote");expect(requestedWorkspaceSection(status,"#final-account-title")).toBe("quote");expect(hasStartedWork(status)).toBe(false)});
 it.each(["live","invoiced","paid"] as const)("opens real saved work and final-account sections for %s",status=>{expect(requestedWorkspaceSection(status,"#work-proof")).toBe("work");expect(requestedWorkspaceSection(status,"#final-account-title")).toBe("final-account");expect(requestedWorkspaceSection(status,"#quote")).toBe("quote")});
 it("does not interpret arbitrary fragments as selectors or state",()=>{for(const fragment of["","#scope","#paid","#production","#<script>"]){expect(requestedWorkspaceSection("live",fragment)).toBe("scope")}});
});
