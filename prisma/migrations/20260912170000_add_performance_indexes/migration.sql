-- Performance optimization indexes for high concurrency and fast soft-delete lookups
CREATE INDEX IF NOT EXISTS "users_deleted_at_idx" ON "users"("deleted_at");
CREATE INDEX IF NOT EXISTS "users_email_deleted_at_idx" ON "users"("email", "deleted_at");
CREATE INDEX IF NOT EXISTS "users_is_active_deleted_at_idx" ON "users"("is_active", "deleted_at");

-- Performance index for audit logs entity queries
CREATE INDEX IF NOT EXISTS "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

