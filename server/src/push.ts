import { Router } from 'express'
import { db } from './db.js'
import { fcmSend } from './fcm.js'
import { sendWebPush, webPushConfigured, vapidPublicKey } from './webpush.js'

type PushOpts = {
  title: string
  body: string
  excludeUserId?: string | null
  data?: Record<string, unknown>
}

// Best-effort push to every registered device of the channel's workspace members
// (optionally excluding one user). Never throws - a notification failure must not
// affect the message/reply that triggered it.
export async function sendChannelPush(channelId: string, opts: PushOpts): Promise<void> {
  const title = opts.title
  const body = opts.body.slice(0, 178)
  const data: Record<string, string> = { channelId }
  for (const [k, v] of Object.entries(opts.data ?? {})) data[k] = String(v)

  // --- FCM (mobile) ---------------------------------------------------------
  try {
    const { rows } = await db.query<{ token: string }>(
      `SELECT DISTINCT pt.token
         FROM channels c
         JOIN workspace_members m ON m.workspace_id = c.workspace_id
         JOIN push_tokens pt ON pt.user_id = m.user_id
        WHERE c.id = $1 AND ($2::uuid IS NULL OR m.user_id <> $2::uuid)`,
      [channelId, opts.excludeUserId ?? null],
    )
    if (rows.length > 0) {
      const dead: string[] = []
      for (const { token } of rows) {
        if ((await fcmSend(token, title, body, data)) === 'invalid') dead.push(token)
      }
      if (dead.length > 0) {
        await db.query(`DELETE FROM push_tokens WHERE token = ANY($1::text[])`, [dead]).catch(() => {})
      }
    }
  } catch (e) {
    console.error('[push] FCM sendChannelPush failed:', (e as Error)?.message)
  }

  // --- Web Push (browser / closed-app desktop) ------------------------------
  if (!webPushConfigured()) return
  try {
    const { rows } = await db.query<{ endpoint: string; p256dh: string; auth: string }>(
      `SELECT DISTINCT ws.endpoint, ws.p256dh, ws.auth
         FROM channels c
         JOIN workspace_members m ON m.workspace_id = c.workspace_id
         JOIN web_push_subscriptions ws ON ws.user_id = m.user_id
         LEFT JOIN notification_prefs np ON np.user_id = m.user_id
        WHERE c.id = $1 AND ($2::uuid IS NULL OR m.user_id <> $2::uuid)
          AND (np.web_push IS NULL OR np.web_push = true)`,
      [channelId, opts.excludeUserId ?? null],
    )
    const deadEndpoints: string[] = []
    for (const s of rows) {
      const r = await sendWebPush({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }, { title, body, data })
      if (r === 'invalid') deadEndpoints.push(s.endpoint)
    }
    if (deadEndpoints.length > 0) {
      await db.query(`DELETE FROM web_push_subscriptions WHERE endpoint = ANY($1::text[])`, [deadEndpoints]).catch(() => {})
    }
  } catch (e) {
    console.error('[push] webpush sendChannelPush failed:', (e as Error)?.message)
  }
}

export const push = Router()

// Register (upsert) a device's Expo push token for the signed-in user.
push.post('/register', async (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false })
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  const platform = typeof req.body?.platform === 'string' ? req.body.platform.slice(0, 16) : 'android'
  if (!token || token.length < 20 || token.length > 4096) {
    return res.status(400).json({ ok: false, error: 'invalid push token' })
  }
  await db.query(
    `INSERT INTO push_tokens (user_id, token, platform)
     VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE
       SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, last_seen_at = now()`,
    [req.user.id, token, platform],
  )
  res.json({ ok: true })
})

// Remove a token (sign-out / notifications disabled).
push.post('/unregister', async (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false })
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : ''
  await db.query(`DELETE FROM push_tokens WHERE token = $1 AND user_id = $2`, [token, req.user.id])
  res.json({ ok: true })
})

// --- Browser Web Push (VAPID) ------------------------------------------------

// The VAPID public key the browser needs to subscribe. Public by design.
push.get('/vapid-public-key', (_req, res) => {
  const key = vapidPublicKey()
  if (!key) return res.status(503).json({ ok: false, error: 'web push not configured' })
  res.json({ ok: true, key })
})

// Store (upsert) a browser PushSubscription for the signed-in user.
push.post('/web/subscribe', async (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false })
  const sub = req.body?.subscription ?? req.body
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : ''
  const p256dh = typeof sub?.keys?.p256dh === 'string' ? sub.keys.p256dh : ''
  const auth = typeof sub?.keys?.auth === 'string' ? sub.keys.auth : ''
  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ ok: false, error: 'invalid subscription' })
  }
  const ua = (req.get('user-agent') ?? '').slice(0, 256)
  await db.query(
    `INSERT INTO web_push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent`,
    [req.user.id, endpoint, p256dh, auth, ua],
  )
  res.json({ ok: true })
})

// Remove a browser subscription (notifications disabled / sign-out).
push.post('/web/unsubscribe', async (req, res) => {
  if (!req.user) return res.status(401).json({ ok: false })
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : ''
  if (endpoint) {
    await db.query(`DELETE FROM web_push_subscriptions WHERE endpoint = $1 AND user_id = $2`, [endpoint, req.user.id])
  }
  res.json({ ok: true })
})
