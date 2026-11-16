// Passe d'envoi. Lancée par la tâche planifiée Vercel (Authorization: Bearer CRON_SECRET),
// par « Vérifier maintenant » (direction), ou juste après un événement (nouveau défi, cadeau remis…) par une session valide.
// Les règles (heures, plafonds, une seule fois) sont appliquées côté Supabase : relancer n'envoie jamais deux fois.
import { body, fail, reply, rpc, sendAll } from '../_push.js'

export default async function handler(req, res) {
  const cron = process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`
  try {
    if (!cron) {
      if (req.method !== 'POST') return reply(res, 401, { ok: false })
      await rpc('daraja_push_who', { p_token: String(body(req).token || '') })
    }
    const r = await rpc('daraja_push_claim', {})
    const out = r.items?.length ? await sendAll(r.items) : { sent: 0, dropped: 0, failed: 0 }
    reply(res, 200, { ok: true, mode: r.mode, quiet: !!r.quiet, notifications: r.items?.length || 0, ...out })
  } catch (e) { fail(res, e) }
}
