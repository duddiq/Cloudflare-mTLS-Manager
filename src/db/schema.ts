import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  email: text("email").primaryKey(),
  role: text("role").notNull().default("user"),
  createdAt: text("created_at").notNull(),
});

export const certificates = sqliteTable("certificates", {
  id: text("id").primaryKey(), // Cloudflare Certificate ID
  issuedTo: text("issued_to").notNull().references(() => users.email), // User who owns the cert
  commonName: text("common_name").notNull(),
  validityDays: integer("validity_days").notNull(),
  certificatePem: text("certificate_pem").notNull(),
  status: text("status").notNull(), // e.g. "active", "revoked"
  expiresOn: text("expires_on").notNull(),
  fingerprintSha256: text("fingerprint_sha256"),
  serialNumber: text("serial_number"),
  createdAt: text("created_at").notNull(),
});

export const appMetadata = sqliteTable("app_metadata", {
  key: text("key").primaryKey(),
  value: text("value"),
});

export const hostnameAssociations = sqliteTable("hostname_associations", {
  hostname: text("hostname").primaryKey(),
  mtlsCertificateId: text("mtls_certificate_id"),
  createdAt: text("created_at").notNull(),
});
