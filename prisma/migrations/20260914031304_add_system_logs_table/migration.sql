-- CreateEnum
CREATE TYPE "LogSource" AS ENUM ('BACKEND', 'FRONTEND');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('INFO', 'WARN', 'ERROR', 'FATAL');

-- CreateTable
CREATE TABLE "system_logs" (
    "id" TEXT NOT NULL,
    "source" "LogSource" NOT NULL,
    "level" "LogLevel" NOT NULL,
    "context" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack_trace" TEXT,
    "metadata" JSONB,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_logs_source_level_idx" ON "system_logs"("source", "level");

-- CreateIndex
CREATE INDEX "system_logs_created_at_idx" ON "system_logs"("created_at");

-- CreateIndex
CREATE INDEX "system_logs_user_id_idx" ON "system_logs"("user_id");

-- AddForeignKey
ALTER TABLE "system_logs" ADD CONSTRAINT "system_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
