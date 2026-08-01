-- Browser Web Push (VAPID) subscriptions - the closed-app desktop/browser
-- counterpart to push_tokens (FCM mobile). One row per browser PushSubscription;
-- keyed by its unique endpoint so a re-subscribe upserts rather than duplicates.
CREATE TABLE IF NOT EXISTS web_push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_web_push_sub_user ON web_push_subscriptions (user_id);
