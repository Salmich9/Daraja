// Abonner ou désabonner CET appareil. La session PIN est vérifiée par le serveur Supabase :
// on ne peut s'abonner (ou couper) qu'à son propre nom.
import { body, fail, reply, rpc } from '../_push.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false })
  const b = body(req)
  try {
    if (b.off) {
      await rpc('daraja_push_unsub', { p_token: String(b.token || ''), p_endpoint: String(b.endpoint || '') })
    } else {
      const s = b.subscription || {}
      await rpc('daraja_push_sub', { p_token: String(b.token || ''), p_endpoint: String(s.endpoint || ''),
        p_p256dh: String(s.keys?.p256dh || ''), p_auth: String(s.keys?.auth || ''), p_device: String(b.device || '').slice(0, 80) })
    }
    reply(res, 200, { ok: true })
  } catch (e) { fail(res, e) }
}
