-- Per-user notification preferences. Absent row = all defaults on (opt-out
-- model). Security notifications (e.g. new-sign-in) are intentionally NOT here.
-- (email_* columns are carried for schema parity with the hosted product; the
-- standalone build ships web push, and email digests are only active if an SMTP
-- sender is configured.)
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id            UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_mentions     BOOLEAN NOT NULL DEFAULT true,
  email_agent_events BOOLEAN NOT NULL DEFAULT true,
  email_unread       BOOLEAN NOT NULL DEFAULT true,
  web_push           BOOLEAN NOT NULL DEFAULT true,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
