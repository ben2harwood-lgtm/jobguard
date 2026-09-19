import type { JobStatus } from "@jobguard/core";

export const jobStatusLabels: Readonly<Record<JobStatus,string>>={draft:"Being drafted",quoting:"Quote being prepared",accepted:"Customer said yes",live:"Work under way",invoiced:"Invoice recorded",paid:"Customer paid",lost:"Did not go ahead"};
export type WorkspaceSection="scope"|"quote"|"work"|"final-account";
export function mayOpenSavedQuote(status:JobStatus):boolean{return status!=="draft"&&status!=="lost";}
export function hasStartedWork(status:JobStatus):boolean{return status==="live"||status==="invoiced"||status==="paid";}
/** Navigation selects a view, never advances the lifecycle or supplies business facts. */
export function requestedWorkspaceSection(status:JobStatus,fragment:string):WorkspaceSection{
 if(!mayOpenSavedQuote(status))return "scope";
 if(fragment==="#quote")return "quote";
 if(fragment==="#work-proof")return hasStartedWork(status)?"work":"quote";
 if(fragment==="#final-account-title")return hasStartedWork(status)?"final-account":"quote";
 return "scope";
}
