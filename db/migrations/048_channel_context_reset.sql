-- /reset support: a per-channel context boundary. The agent's turn history is
-- assembled only from messages created AFTER this timestamp; the visible chat is
-- left intact. NULL = no reset (default, full recent history).
ALTER TABLE channels ADD COLUMN IF NOT EXISTS context_reset_at timestamptz;
