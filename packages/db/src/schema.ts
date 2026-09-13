import {
  index,
  foreignKey,
  pgSchema,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const identity = pgSchema("identity");
export const controlPlane = pgSchema("control_plane");
export const app = pgSchema("app");

/** Global identity data is deliberately outside the tenant/business schema. */
export const identityUsers = identity.table("identity_user", {
  id: uuid("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Restricted bootstrap registry; business code uses app.account after tenancy is established. */
export const tenants = controlPlane.table("tenant", {
  id: uuid("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = app.table(
  "account",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 200 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("account_tenant_id_id_uq").on(table.tenantId, table.id),
    index("account_tenant_id_idx").on(table.tenantId),
  ],
);

export const memberships = app.table(
  "membership",
  {
    id: uuid("id").notNull(),
    tenantId: uuid("tenant_id").notNull(),
    accountId: uuid("account_id").notNull(),
    identityUserId: uuid("identity_user_id")
      .notNull()
      .references(() => identityUsers.id),
    role: varchar("role", { length: 40 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    index("membership_tenant_user_idx").on(table.tenantId, table.identityUserId),
    foreignKey({
      columns: [table.tenantId, table.accountId],
      foreignColumns: [accounts.tenantId, accounts.id],
      name: "membership_tenant_account_fk",
    }),
  ],
);

export type Account = typeof accounts.$inferSelect;
export type Membership = typeof memberships.$inferSelect;

export const evidenceUploads = app.table("evidence_upload", {
  id: uuid("id").notNull(), tenantId: uuid("tenant_id").notNull(), jobId: uuid("job_id").notNull(),
  scopeItemId: uuid("scope_item_id"), objectKey: varchar("object_key", { length: 1024 }).notNull(),
  expectedSha256: varchar("expected_sha256", { length: 64 }).notNull(),
  expectedContentType: varchar("expected_content_type", { length: 100 }).notNull(),
  maximumBytes: varchar("maximum_bytes").notNull(), retentionClass: varchar("retention_class", { length: 40 }).notNull(),
  state: varchar("state", { length: 20 }).notNull(), rejectionCode: varchar("rejection_code", { length: 50 }),
  objectVersionId: varchar("object_version_id", { length: 1024 }), deviceCapturedAt: timestamp("device_captured_at", { withTimezone: true }),
  serverReceivedAt: timestamp("server_received_at", { withTimezone: true }).notNull(), serverVerifiedAt: timestamp("server_verified_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
}, (table) => [primaryKey({ columns: [table.tenantId, table.id] })]);

export const evidenceObjects = app.table("evidence_object", {
  id: uuid("id").notNull(), tenantId: uuid("tenant_id").notNull(), uploadId: uuid("upload_id"),
  jobId: uuid("job_id").notNull(), scopeItemId: uuid("scope_item_id"), kind: varchar("kind", { length: 20 }).notNull(),
  originalEvidenceId: uuid("original_evidence_id"), evidenceType: varchar("evidence_type", { length: 40 }).notNull(),
  objectKey: varchar("object_key", { length: 1024 }).notNull(), objectVersionId: varchar("object_version_id", { length: 1024 }).notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(), byteLength: varchar("byte_length").notNull(),
  contentType: varchar("content_type", { length: 100 }).notNull(), retentionClass: varchar("retention_class", { length: 40 }).notNull(),
  deviceCapturedAt: timestamp("device_captured_at", { withTimezone: true }), serverReceivedAt: timestamp("server_received_at", { withTimezone: true }).notNull(),
  serverVerifiedAt: timestamp("server_verified_at", { withTimezone: true }).notNull(),
}, (table) => [primaryKey({ columns: [table.tenantId, table.id] })]);
