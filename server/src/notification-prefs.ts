// Per-user notification preferences (opt-out model: no row = all defaults on).
// Security notifications (new-sign-in) are NOT gated here - always sent.
import { Router } from 'express'
import { db } from './db.js'

export interface NotificationPrefs {
  email_mentions: boolean
  email_agent_events: boolean
  email_unread: boolean
  web_push: boolean
}
const DEFAULTS: NotificationPrefs = { email_mentions: true, email_agent_events: true, email_unread: true, web_push: true }

export async function getPrefs(userId: string): Promise<NotificationPrefs> {
  try {
    const { rows } = await db.query<NotificationPrefs>(
      `SELECT email_mentions, email_agent_events, email_unread, web_push FROM notification_prefs WHERE user_id = $1`,
      [userId],
    )
    return rows[0] ?? DEFAULTS
  } catch {
    return DEFAULTS
  }
}

// True if the given user allows a category. Fails OPEN (default on) so a prefs
// hiccup never silently suppresses a notification the user expects.
export async function prefAllows(userId: string, key: keyof NotificationPrefs): Promise<boolean> {
  const p = await getPrefs(userId)
  return p[key] !== false
}

export const notificationPrefs = Router()

notificationPrefs.get('/', async (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false })
  res.json({ ok: true, prefs: await getPrefs(req.user.id) })
})

notificationPrefs.put('/', async (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false })
  const b = req.body ?? {}
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
  const cur = await getPrefs(req.user.id)
  const next: NotificationPrefs = {
    email_mentions: bool(b.email_mentions, cur.email_mentions),
    email_agent_events: bool(b.email_agent_events, cur.email_agent_events),
    email_unread: bool(b.email_unread, cur.email_unread),
    web_push: bool(b.web_push, cur.web_push),
  }
  await db.query(
    `INSERT INTO notification_prefs (user_id, email_mentions, email_agent_events, email_unread, web_push)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE
       SET email_mentions = EXCLUDED.email_mentions,
           email_agent_events = EXCLUDED.email_agent_events,
           email_unread = EXCLUDED.email_unread,
           web_push = EXCLUDED.web_push,
           updated_at = now()`,
    [req.user.id, next.email_mentions, next.email_agent_events, next.email_unread, next.web_push],
  )
  res.json({ ok: true, prefs: next })
})
