-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "discord_user_id" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_guilds" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "guild_name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "discord_user_id" TEXT,
    "voice_channel_id" TEXT,
    "node_name" TEXT NOT NULL DEFAULT 'lavalink-node-1',
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_guilds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_guilds_user_id_idx" ON "user_guilds"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_guilds_guild_id_idx" ON "user_guilds"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "user_guilds_user_id_guild_id_key" ON "user_guilds"("user_id", "guild_id");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_guilds_user_id_fkey'
    ) THEN
        ALTER TABLE "user_guilds" ADD CONSTRAINT "user_guilds_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
