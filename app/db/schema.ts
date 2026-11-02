import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
  check,
  foreignKey,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  password: text("password").notNull(),
});
export const sessions = sqliteTable(
  "sessions",
  {
    token: text("token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: integer("expires").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);
export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    owner: text("owner")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    revision: integer("revision").notNull().default(0),
    updated: integer("updated").notNull(),
    mutationId: text("mutation_id").notNull().default(""),
    changeType: text("change_type").notNull().default("create"),
    structureRevision: integer("structure_revision").notNull().default(0),
  },
  (t) => [index("documents_owner_idx").on(t.owner)],
);
export const permissions = sqliteTable(
  "permissions",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.documentId, t.email] }),
    index("permissions_email_idx").on(t.email),
    check(
      "permissions_role_check",
      sql`${t.role} in ('viewer','commenter','editor')`,
    ),
  ],
);
export const versions = sqliteTable(
  "versions",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    created: integer("created").notNull(),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.revision] })],
);
export const documentStates = sqliteTable(
  "document_states",
  {
    documentId: text("document_id").notNull(),
    revision: integer("revision").notNull(),
    part: integer("part").notNull(),
    content: text("content").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.documentId, t.revision, t.part] }),
    foreignKey({
      columns: [t.documentId, t.revision],
      foreignColumns: [versions.documentId, versions.revision],
    }).onDelete("cascade"),
  ],
);
export const history = sqliteTable(
  "history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    revision: integer("revision").notNull(),
    changes: text("changes").notNull(),
    created: integer("created").notNull(),
  },
  (t) => [index("history_document_idx").on(t.documentId, t.revision)],
);
export const mutations = sqliteTable(
  "mutations",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    requestId: text("request_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    revision: integer("revision").notNull(),
    created: integer("created").notNull(),
  },
  (t) => [primaryKey({ columns: [t.documentId, t.requestId] })],
);
export const presence = sqliteTable(
  "presence",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    sessionToken: text("session_token")
      .notNull()
      .references(() => sessions.token, { onDelete: "cascade" }),
    cursor: text("cursor"),
    updated: integer("updated").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.documentId, t.clientId] }),
    index("presence_updated_idx").on(t.updated),
  ],
);
export const authRate = sqliteTable("auth_rate", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull(),
  expires: integer("expires").notNull(),
});
