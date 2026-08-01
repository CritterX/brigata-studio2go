// Browser Web Push (VAPID) - the closed-app desktop/browser counterpart to
// fcm.ts (mobile). Best-effort: a push failure must never break the message/turn
// that triggered it. Keys come from env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY /
// VAPID_SUBJECT); when unset, web push is simply a no-op (feature disabled).
import webpush from 'web-push'

const PUBLIC = process.env.VAPID_PUBLIC_KEY ?? ''
const PRIVATE = process.env.VAPID_PRIVATE_KEY ?? ''
const SUBJECT = process.env.VAPID_SUBJECT ?? 'mailto:chris@brigata.ai'

let configured = false
if (PUBLIC && PRIVATE) {
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE)
    configured = true
  } catch (e) {
    console.error('[webpush] VAPID config failed:', (e as Error)?.message)
  }
}

export function webPushConfigured(): boolean {
  return configured
}
export function vapidPublicKey(): string {
  return PUBLIC
}

export interface WebPushSub {
  endpoint: string
  p256dh: string
  auth: string
}

// Returns 'ok' | 'invalid' (subscription gone - caller should prune) | 'error'.
export async function sendWebPush(
  sub: WebPushSub,
  payload: { title: string; body: string; data?: Record<string, unknown> },
): Promise<'ok' | 'invalid' | 'error'> {
  if (!configured) return 'error'
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload),
      { TTL: 1800 },
    )
    return 'ok'
  } catch (e) {
    const code = (e as { statusCode?: number })?.statusCode
    // 404/410 = subscription expired/unsubscribed → prune it.
    if (code === 404 || code === 410) return 'invalid'
    console.error('[webpush] send failed:', code ?? (e as Error)?.message)
    return 'error'
  }
}
