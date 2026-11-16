// Outils partagés des routes /api/push (les fichiers qui commencent par « _ » ne sont pas des routes).
// Secrets : uniquement dans les variables Vercel (SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET).
// Rien de secret n'est jamais écrit dans une réponse ou un journal.
import webpush from 'web-push'
import { SUPABASE_URL } from '../src/config.js'

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

// Appel d'une fonction serveur avec la clé service (jamais exposée au téléphone).
export async function rpc(fn, args = {}) {
  if (!SERVICE) throw Object.assign(new Error('config'), { status: 503 })
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const txt = await r.text()
  let body = null
  try { body = txt ? JSON.parse(txt) : null } catch { body = null }
  if (!r.ok) throw Object.assign(new Error(body?.message === 'session' ? 'session' : 'server'), { status: body?.message === 'session' ? 401 : 500 })
  return body
}

export function vapidReady() {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

// Envoie une liste de notifications ; supprime les abonnements morts (404 / 410).
export async function sendAll(items) {
  if (!vapidReady()) throw Object.assign(new Error('vapid'), { status: 503 })
  webpush.setVapidDetails('https://daraja-nine.vercel.app', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY)
  let sent = 0, dropped = 0, failed = 0
  for (const it of items || []) {
    const payload = JSON.stringify({ title: it.title, body: it.body, url: it.url, tag: it.tag })
    for (const s of it.subs || []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 4 * 3600, urgency: 'normal' })
        sent++
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) { dropped++; await rpc('daraja_push_drop', { p_endpoint: s.endpoint }).catch(() => {}) }
        else failed++
      }
    }
  }
  return { sent, dropped, failed }
}

// Réponse JSON sans cache. En cas d'erreur, un code court seulement (jamais de détail interne).
export function reply(res, status, body) {
  res.setHeader('Cache-Control', 'no-store')
  res.status(status).json(body)
}

export function fail(res, e) {
  reply(res, e.status || 500, { ok: false, error: e.message === 'session' ? 'session' : e.message === 'vapid' ? 'vapid' : e.message === 'config' ? 'config' : 'server' })
}

export function body(req) {
  if (typeof req.body === 'string') { try { return JSON.parse(req.body) } catch { return {} } }
  return req.body || {}
}
