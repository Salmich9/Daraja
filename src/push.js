// Notifications push côté téléphone. Rien ne se déclenche à l'ouverture :
// le service worker n'est enregistré que lorsque la personne touche « Activer ».
import { MOCK } from './lib'

const ua = () => navigator.userAgent || ''
export const isIOS = () => /iPhone|iPad|iPod/.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true

// 'ok' | 'install' (iPhone hors appli installée) | 'denied' | 'none' (navigateur sans push)
export function pushSupport() {
  if (MOCK) return localStorage.getItem('mock_push_support') || 'ok'
  if (isIOS() && !standalone()) return 'install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'none'
  if (Notification.permission === 'denied') return 'denied'
  return 'ok'
}

const device = () => {
  const u = ua()
  const os = isIOS() ? 'iPhone' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'PC' : 'Appareil'
  return os + (standalone() ? ' · appli' : ' · navigateur')
}

const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(r, c => c.charCodeAt(0)) }

async function post(path, body) {
  const r = await fetch('/api/push/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || j.ok === false) throw new Error(j.error || 'server')
  return j
}

// Abonnement en cours sur CET appareil (sans rien enregistrer s'il n'y en a pas)
export async function pushActive() {
  if (MOCK) return localStorage.getItem('mock_push') === '1'
  if (pushSupport() !== 'ok') return false
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = await reg?.pushManager.getSubscription()
  return !!sub
}

export async function pushOn(token) {
  if (MOCK) { localStorage.setItem('mock_push', '1'); return true }
  const perm = await Notification.requestPermission()   // demandé sur un toucher, jamais à l'ouverture
  if (perm !== 'granted') throw new Error('denied')
  const cfg = await fetch('/api/push/config').then(r => r.json())
  if (!cfg.ready || !cfg.publicKey) throw new Error('vapid')
  const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
  await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(cfg.publicKey) })
  await post('subscribe', { token, subscription: sub.toJSON(), device: device() })
  return true
}

export async function pushOff(token) {
  if (MOCK) { localStorage.removeItem('mock_push'); return true }
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = await reg?.pushManager.getSubscription()
  if (sub) { await post('subscribe', { token, off: true, endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe() }
  return true
}

// Après un événement (nouveau duel, validation…) : passe d'envoi immédiate, sans attendre la tâche du soir.
// Sans effet si les notifications sont coupées ; ne bloque jamais l'écran.
export function pushKick(token) {
  if (MOCK || !token) return
  fetch('/api/push/tick', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }), keepalive: true }).catch(() => {})
}

export const pushAdmin = {
  test: token => MOCK ? Promise.resolve({ sent: 1 }) : post('test', { token }),
  tick: token => MOCK ? Promise.resolve({ notifications: 0, sent: 0, quiet: false }) : post('tick', { token }),
  keys: token => MOCK ? Promise.resolve({ publicKey: 'BMock…publique', privateKey: 'mock-cle-privee-montree-une-seule-fois', alreadySet: false }) : post('keys', { token }),
  config: () => MOCK ? Promise.resolve({ ready: localStorage.getItem('mock_vapid') !== '0' }) : fetch('/api/push/config').then(r => r.json()),
}
