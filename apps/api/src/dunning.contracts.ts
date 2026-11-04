import type { DunningRepository } from "@jobguard/db";

/** Public workbench response contract; no database code is loaded by clients. */
export type DunningView = Awaited<ReturnType<DunningRepository["read"]>>;
