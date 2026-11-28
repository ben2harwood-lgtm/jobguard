import "server-only";
import { cookies } from "next/headers";
import { createWorkspaceApplication } from "@jobguard/api/workspace";
import { enforcePracticePair } from "./linked-practice-entry";
import { hasSyntheticSession, syntheticPool } from "./synthetic-server";

/** Request-scoped: never retain one caller's session in a global application. */
export async function workspaceApplication() {
 if(process.env.JOBGUARD_ENV!=="synthetic_demo")throw Object.assign(new Error("Synthetic workflow is unavailable"),{code:"UNAUTHENTICATED"});
 const sessionId=(await cookies()).get("jg_session")?.value;
 // V2-PAIR-1: a linked practice session must carry its exact browser pairing (identity cookie and pairing
 // receipt) on every route that uses the workspace, before anything is read or written. Others pass unchanged.
 if(hasSyntheticSession(sessionId))await enforcePracticePair(syntheticPool(),sessionId);
 return createWorkspaceApplication({pool:syntheticPool(),sessionId});
}
