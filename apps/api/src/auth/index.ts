/** Server-only composition seam; browser consumers must not import this entrypoint. */
export * from "./identity.application.js";
export * from "./identity-http.js";
export * from "./auth-provider.js";
export * from "./principal-bridge.js";
export * from "./identity-email.js";
export * from "./persisted-auth-provider.js";
export * from "./synthetic-session.js";

export * from "./sso/sso.application.js";
export * from "./sso/sso.contracts.js";
export * from "./sso/sso-required.application.js";
export * from "./sso/sso-required.contracts.js";

export * from "./customer-signin.js";

export * from "./customer-variation.js";
