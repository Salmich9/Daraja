// Clé publique VAPID (publique par nature) et état de la configuration.
import { reply, vapidReady } from '../_push.js'

export default function handler(req, res) {
  reply(res, 200, { ready: vapidReady(), publicKey: process.env.VAPID_PUBLIC_KEY || null })
}
