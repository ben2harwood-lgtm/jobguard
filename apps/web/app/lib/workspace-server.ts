import "server-only";
import { createWorkspaceApplication } from "@jobguard/api/workspace";
import { syntheticPool } from "./synthetic-server";

let application: ReturnType<typeof createWorkspaceApplication> | undefined;
export function workspaceApplication() { return application ??= createWorkspaceApplication({ pool: syntheticPool() }); }
