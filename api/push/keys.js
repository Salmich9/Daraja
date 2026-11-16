// Génère une paire de clés VAPID pour la direction. Rien n'est stocké ni journalisé :
// la clé privée n'existe que dans cette réponse, à coller aussitôt dans les variables Vercel.
import webpush from 'web-push'
import { body, fail, reply, rpc } from '../_push.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false })
  try {
    const me = await rpc('daraja_push_who', { p_token: String(body(req).token || '') })
    if (me.role !== 'super') return reply(res, 403, { ok: false, error: 'forbidden' })
    const k = webpush.generateVAPIDKeys()
    reply(res, 200, { ok: true, publicKey: k.publicKey, privateKey: k.privateKey, alreadySet: !!process.env.VAPID_PRIVATE_KEY })
  } catch (e) { fail(res, e) }
}
