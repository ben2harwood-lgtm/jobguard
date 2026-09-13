import {
  index,
  foreignKey,
  integer,
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

export const evidenceUploads = app.table(
  "evidence_upload",
  {
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    id: uuid("id").notNull(),
    jobId: uuid("job_id").notNull(),
    scopeId: uuid("scope_id"),
    idempotencyKey: varchar("idempotency_key", { length: 200 }).notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    evidenceType: varchar("evidence_type", { length: 40 }).notNull(),
    contentType: varchar("content_type", { length: 100 }).notNull(),
    retentionClass: varchar("retention_class", { length: 40 }).notNull(),
    state: varchar("state", { length: 30 }).notNull(),
    objectKey: varchar("object_key", { length: 500 }).notNull(),
    objectVersionId: varchar("object_version_id", { length: 200 }),
    expectedSha256: varchar("expected_sha256", { length: 64 }).notNull(),
    expectedBytes: integer("expected_bytes").notNull(),
    captureTime: timestamp("capture_time", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    uniqueIndex("evidence_upload_tenant_idempotency_uq").on(table.tenantId, table.idempotencyKey),
  ],
);

export const evidenceItems = app.table(
  "evidence_item",
  {
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    id: uuid("id").notNull(),
    uploadId: uuid("upload_id").notNull(),
    jobId: uuid("job_id").notNull(),
    scopeId: uuid("scope_id"),
    evidenceType: varchar("evidence_type", { length: 40 }).notNull(),
    artifactRole: varchar("artifact_role", { length: 20 }).notNull(),
    originalEvidenceId: uuid("original_evidence_id"),
    retentionClass: varchar("retention_class", { length: 40 }).notNull(),
    state: varchar("state", { length: 20 }).notNull(),
    objectKey: varchar("object_key", { length: 500 }).notNull(),
    objectVersionId: varchar("object_version_id", { length: 200 }).notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    byteLength: integer("byte_length").notNull(),
    contentType: varchar("content_type", { length: 100 }).notNull(),
    captureTime: timestamp("capture_time", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.id] }),
    foreignKey({ columns: [table.tenantId, table.uploadId], foreignColumns: [evidenceUploads.tenantId, evidenceUploads.id], name: "evidence_item_tenant_upload_fk" }),
    foreignKey({ columns: [table.tenantId, table.originalEvidenceId], foreignColumns: [table.tenantId, table.id], name: "evidence_item_tenant_original_fk" }),
  ],
);

export type Account = typeof accounts.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
