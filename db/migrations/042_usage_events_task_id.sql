-- Attribute a usage_event to the Agent-Inbox task that drove the turn, so cost
-- can be traced to the work that caused it. Nullable: most turns are interactive
-- chat, not task-driven. ON DELETE SET NULL keeps usage history if a task is
-- later removed.
ALTER TABLE usage_events
  ADD COLUMN IF NOT EXISTS task_id UUID REFERENCES agent_tasks(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_usage_events_task
  ON usage_events (task_id) WHERE task_id IS NOT NULL;
