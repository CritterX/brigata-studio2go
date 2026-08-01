// Direct Firebase Cloud Messaging (HTTP v1) sender. Uses the service-account key
// (FCM_SERVICE_ACCOUNT_PATH) to mint an OAuth token and post messages to the
// device tokens registered by the mobile app. No third-party push service.
import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'

type ServiceAccount = { client_email: string; private_key: string; project_id: string }

let sa: ServiceAccount | null | undefined
function loadSA(): ServiceAccount | null {
  if (sa !== undefined) return sa
  const p = process.env.FCM_SERVICE_ACCOUNT_PATH
  if (!p) { sa = null; return null }
  try {
    sa = JSON.parse(readFileSync(p, 'utf8')) as ServiceAccount
  } catch (e) {
    console.error('[fcm] cannot read service account:', (e as Error)?.message)
    sa = null
  }
  return sa
}

export function fcmConfigured(): boolean {
  return loadSA() !== null
}

let cached: { token: string; exp: number } | null = null
async function accessToken(): Promise<string | null> {
  const s = loadSA()
  if (!s) return null
  const now = Math.floor(Date.now() / 1000)
  if (cached && cached.exp > now + 60) return cached.token
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: s.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`
  const sig = createSign('RSA-SHA256').update(unsigned).sign(s.private_key, 'base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${sig}`,
    }),
  })
  if (!res.ok) {
    console.error('[fcm] token exchange failed:', res.status, (await res.text().catch(() => '')).slice(0, 200))
    return null
  }
  const j = (await res.json()) as { access_token: string; expires_in?: number }
  cached = { token: j.access_token, exp: now + (j.expires_in ?? 3600) }
  return j.access_token
}

// Send one message. Returns 'invalid' when the token is dead (caller prunes it).
export async function fcmSend(
  deviceToken: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<'ok' | 'invalid' | 'fail'> {
  const s = loadSA()
  if (!s) return 'fail'
  const at = await accessToken()
  if (!at) return 'fail'
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${s.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: { token: deviceToken, notification: { title, body }, data, android: { priority: 'high' } },
    }),
  })
  if (res.ok) return 'ok'
  const txt = await res.text().catch(() => '')
  // Prune on token-specific errors only: 404/UNREGISTERED/NOT_FOUND, or a 400
  // whose message calls out the registration token. Avoid pruning on other 400s
  // (which could be a transient request problem, not a dead token).
  if (
    res.status === 404 ||
    /UNREGISTERED|NOT_FOUND/i.test(txt) ||
    (res.status === 400 && /registration token/i.test(txt))
  ) return 'invalid'
  console.error('[fcm] send failed:', res.status, txt.slice(0, 200))
  return 'fail'
}
