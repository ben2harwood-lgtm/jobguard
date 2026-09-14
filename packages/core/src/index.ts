/** Domain-only package. Network, database, vendor and platform imports are forbidden. */
export const CORE_PACKAGE = "@jobguard/core" as const;
export * from "./allocation.js";
export * from "./fee.js";
export * from "./job.js";
export * from "./capture.js";
export * from "./money.js";
export * from "./quantity.js";
export * from "./rational.js";
export * from "./tax.js";
