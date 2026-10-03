import "server-only";
import { createWorkspaceApplication } from "@jobguard/api/workspace";
import { syntheticPool } from "./synthetic-server";

let application: ReturnType<typeof createWorkspaceApplication> | undefined;
export function workspaceApplication() { if(process.env.JOBGUARD_ENV!=="synthetic_demo")throw Object.assign(new Error("Synthetic workflow is unavailable"),{code:"UNAUTHENTICATED"}); return application ??= createWorkspaceApplication({ pool: syntheticPool() }); }
