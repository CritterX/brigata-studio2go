-- Per-agent web access opt-out. Web tools (WebSearch/WebFetch) are the default
-- source of untrusted internet content; letting the owner disable them shrinks
-- the attack surface. Default TRUE = today's behavior.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS web_enabled BOOLEAN NOT NULL DEFAULT TRUE;
