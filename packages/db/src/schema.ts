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
