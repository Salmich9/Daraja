// Petit client Supabase maison : on n'utilise que 2 choses, appeler une fonction du serveur et recevoir les signaux de duel.
// Remplace @supabase/supabase-js (≈ 80 Ko de code inutile pour nous : connexion, fichiers, etc.).
import { SUPABASE_URL, SUPABASE_KEY } from './config.js'

// Appel d'une fonction serveur (RPC). En cas de refus, l'erreur porte le message du serveur (ex. 'session').
async function call(fn, args = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  })
  const txt = await r.text()
  let body = null
  try { body = txt ? JSON.parse(txt) : null } catch { body = txt }
  if (!r.ok) {
    const e = new Error(body?.message || 'HTTP ' + r.status)
    Object.assign(e, { code: body?.code, details: body?.details, hint: body?.hint, status: r.status, server: true })
    throw e
  }
  return body
}

// Écoute un canal de signaux (Realtime broadcast). Se reconnecte tout seul. Renvoie une fonction pour arrêter.
function listen(topic, event, onSignal) {
  let ws, hb, retry, stopped = false, delay = 1000, ref = 0
  const url = SUPABASE_URL.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + encodeURIComponent(SUPABASE_KEY) + '&vsn=1.0.0'
  const send = m => { try { ws.readyState === 1 && ws.send(JSON.stringify({ ...m, ref: String(++ref) })) } catch {} }
  const open = () => {
    if (stopped) return
    ws = new WebSocket(url)
    ws.onopen = () => {
      delay = 1000
      send({ topic: 'realtime:' + topic, event: 'phx_join', payload: { config: { broadcast: { self: false }, presence: { key: '' }, private: false } } })
      hb = setInterval(() => send({ topic: 'phoenix', event: 'heartbeat', payload: {} }), 25000)
    }
    ws.onmessage = e => { try { const m = JSON.parse(e.data); if (m.event === 'broadcast' && m.payload?.event === event) onSignal(m.payload.payload) } catch {} }
    ws.onclose = () => { clearInterval(hb); if (!stopped) { retry = setTimeout(open, delay); delay = Math.min(delay * 2, 30000) } }
    ws.onerror = () => { try { ws.close() } catch {} }
  }
  open()
  return () => { stopped = true; clearInterval(hb); clearTimeout(retry); try { ws.close() } catch {} }
}

export { call, listen }
