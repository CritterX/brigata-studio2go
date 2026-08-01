-- Per-room agent mute (flag on membership; superseded by the mutes table in 047,
-- kept for the backfill path). Row/flag present = muted in that channel.
ALTER TABLE channel_agents ADD COLUMN IF NOT EXISTS muted boolean NOT NULL DEFAULT false;
