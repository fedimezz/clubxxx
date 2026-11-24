-- Indexes for the hot read paths (dashboard, reports, notifications, audit log). Purely additive.
CREATE INDEX IF NOT EXISTS "attendances_clubId_checkInTime_idx" ON "attendances"("clubId", "checkInTime");
CREATE INDEX IF NOT EXISTS "attendances_userId_clubId_checkInTime_idx" ON "attendances"("userId", "clubId", "checkInTime");
CREATE INDEX IF NOT EXISTS "notifications_clubId_sentAt_idx" ON "notifications"("clubId", "sentAt");
CREATE INDEX IF NOT EXISTS "notifications_userId_sentAt_idx" ON "notifications"("userId", "sentAt");
CREATE INDEX IF NOT EXISTS "activity_logs_clubId_createdAt_idx" ON "activity_logs"("clubId", "createdAt");
