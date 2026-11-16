// « Envoyer un test à moi » : direction seulement (vérifié côté Supabase), vers ses propres appareils.
import { body, fail, reply, rpc, sendAll } from '../_push.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { ok: false })
  try {
    const r = await rpc('daraja_push_test', { p_token: String(body(req).token || '') })
    reply(res, 200, { ok: true, ...(await sendAll(r.items)) })
  } catch (e) { fail(res, e) }
}
