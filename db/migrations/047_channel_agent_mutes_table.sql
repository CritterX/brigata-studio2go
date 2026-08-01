-- Per-room agent mute, decoupled from channel membership. The brigade UI lists
-- every workspace agent in every room; the per-room signal is mute/unmute. Row
-- present = muted in that channel, whether or not it's a channel_agents member.
CREATE TABLE IF NOT EXISTS channel_agent_mutes (
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  agent_id   uuid NOT NULL REFERENCES agents(id)   ON DELETE CASCADE,
  PRIMARY KEY (channel_id, agent_id)
);

-- Preserve any mutes already set via the earlier channel_agents.muted flag (046).
INSERT INTO channel_agent_mutes (channel_id, agent_id)
SELECT channel_id, agent_id FROM channel_agents WHERE muted = true
ON CONFLICT DO NOTHING;
