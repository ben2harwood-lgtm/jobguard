import "server-only";
import { cookies } from "next/headers";
import { createWorkspaceApplication } from "@jobguard/api/workspace";
import { syntheticPool } from "./synthetic-server";

/** Request-scoped: never retain one caller's session in a global application. */
export async function workspaceApplication() {
 if(process.env.JOBGUARD_ENV!=="synthetic_demo")throw Object.assign(new Error("Synthetic workflow is unavailable"),{code:"UNAUTHENTICATED"});
 return createWorkspaceApplication({pool:syntheticPool(),sessionId:(await cookies()).get("jg_session")?.value});
}
