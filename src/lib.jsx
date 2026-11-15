import React from 'react'
import { call, listen } from './net.js'
import { AV_SEEDS, AV_STYLES, avFile } from './avatar-list.js'

const TK = 'daraja_token', VK = 'daraja_venue'

// Identifiant de ce téléphone (aléatoire, gardé sur l'appareil) : sert à ne bloquer que lui après trop de codes faux
function deviceId() {
  try {
    let d = localStorage.getItem('daraja_dev')
    if (!d) { d = Array.from(crypto.getRandomValues(new Uint8Array(12)), b => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('daraja_dev', d) }
    return d
  } catch { return null }
}

const store = {
  get: k => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch {} },
}

const MOCK = import.meta.env.VITE_MOCK === '1'

// Erreurs prévues par le serveur (refus normaux) : on ne les note pas dans le journal.
const EXPECTED = /^(session|forbidden|admin|self|staff|monday|month_not_over|week_not_over|already|amount|prize|duel|question|reward|kind|invalid|post|role|key|pin|no change)/
const sent = new Map()
let sentCount = 0
function reportError(message, place, detail) {
  try {
    const m = String(message || '?').slice(0, 300)
    const now = Date.now()
    if (MOCK || sentCount >= 20 || now - (sent.get(m) || 0) < 5 * 60 * 1000) return
    sent.set(m, now); sentCount++
    call('daraja_log_error', { p_token: store.get(TK) || '', p_message: m, p_place: String(place || '').slice(0, 80),
      p_detail: String(detail || '').slice(0, 1500), p_agent: ('v' + __VERSION__ + ' · ' + navigator.userAgent).slice(0, 200) }).then(() => {}, () => {})
  } catch {}
}

// État du réseau : passe à « hors ligne » quand un appel n'aboutit pas, revient dès qu'un appel réussit
let offline = false
const netSubs = new Set()
const setOffline = v => { if (v !== offline) { offline = v; netSubs.forEach(f => f(v)) } }
function useOffline() {
  const [v, setV] = React.useState(offline)
  React.useEffect(() => { netSubs.add(setV); return () => netSubs.delete(setV) }, [])
  return v
}

async function rpc(fn, args = {}) {
  if (MOCK) {
    if (localStorage.getItem('mock_net') === 'off' && fn !== 'daraja_me') { setOffline(true); throw new Error('Failed to fetch') }
    return (await import('./mock.js')).default(fn, args)
  }
  try { const r = await call(fn, args); setOffline(false); return r }
  catch (e) {
    if (!e.server) { setOffline(true); reportError('Réseau : ' + (e?.message || e), fn) }
    else { setOffline(false); if (!EXPECTED.test(e.message || '')) reportError(e.message || 'Erreur serveur', fn, [e.code, e.details, e.hint].filter(Boolean).join(' · ')) }
    throw e
  }
}

const LEVELS = [
  [0, 'Commis'], [200, 'Serveur'], [500, 'Vendeur'], [1000, 'Vendeur confirmé'],
  [2000, 'Expert'], [4000, 'Ambassadeur'], [7000, 'Légende'],
]

function level(earned) {
  let i = 0
  while (i < LEVELS.length - 1 && earned >= LEVELS[i + 1][0]) i++
  const next = LEVELS[i + 1]
  return { n: i + 1, name: LEVELS[i][1], from: LEVELS[i][0], to: next ? next[0] : null }
}

const initials = n => n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()

const fmt = n => (n ?? 0).toLocaleString('fr-FR')

const LV = { 1: ['Facile', 'lv1'], 2: ['Confirmé', 'lv2'], 3: ['Expert', 'lv3'] }



const AV_LIB = AV_STYLES.flatMap(st => AV_SEEDS.map(sd => st + ':' + sd))

const ROLES = [['manager', 'Manager', 'user-star'], ['directeur', 'Directeur', 'crown'], ['chef_cuisine', 'Chef cuisine', 'chef-hat'], ['chef_mixo', 'Chef mixologue', 'glass-cocktail']]

const waLink = (phone, text) => 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text)

function burst(n = 30) {
  const host = document.getElementById('fx')
  if (!host) return
  const cols = ['#F2B544', '#7BE0B5', '#FF7A59', '#2BB39A', '#D9480F', '#F2C230', '#FF9A5A']
  for (let i = 0; i < n; i++) {
    const d = document.createElement('i')
    d.className = 'conf'
    d.style.left = Math.random() * 100 + '%'
    d.style.background = cols[i % cols.length]
    d.style.animationDelay = Math.random() * 0.25 + 's'
    d.style.transform = `rotate(${Math.random() * 360}deg)`
    host.appendChild(d)
    setTimeout(() => d.remove(), 1700)
  }
}

function flyPoints(text) {
  const host = document.getElementById('fx')
  if (!host) return
  const d = document.createElement('div')
  d.className = 'flypts'
  d.textContent = text
  host.appendChild(d)
  setTimeout(() => d.remove(), 1300)
}

// Sons du jeu, fabriqués à la volée (aucun fichier à télécharger). Coupables dans le profil, réglage gardé sur le téléphone.
const SK = 'daraja_sound'
let actx = null
const soundOn = () => { try { return localStorage.getItem(SK) !== '0' } catch { return true } }
const setSound = on => { try { localStorage.setItem(SK, on ? '1' : '0') } catch {} }
const TUNES = {
  good: [[784, 0, .09], [1175, .08, .16]],
  combo: [[784, 0, .07], [988, .06, .07], [1319, .12, .18]],
  bad: [[196, 0, .18, 'triangle'], [147, .12, .22, 'triangle']],
  late: [[330, 0, .12, 'triangle'], [262, .14, .2, 'triangle']],
  tick: [[1400, 0, .04, 'square', .05]],
  win: [[523, 0, .12], [659, .12, .12], [784, .24, .12], [1047, .36, .35], [784, .5, .08], [1047, .58, .45]],
  level: [[392, 0, .1], [523, .1, .1], [659, .2, .1], [784, .3, .1], [1047, .4, .5]],
  coin: [[988, 0, .06], [1319, .06, .25]],
  duel: [[220, 0, .15, 'sawtooth', .08], [330, .16, .15, 'sawtooth', .08], [440, .32, .3, 'sawtooth', .08]],
}
function sfx(name) {
  if (!soundOn() || !TUNES[name]) return
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)()
    if (actx.state === 'suspended') actx.resume()
    const t0 = actx.currentTime + .01
    for (const [f, at, dur, type = 'sine', vol = .16] of TUNES[name]) {
      const o = actx.createOscillator(), g = actx.createGain()
      o.type = type; o.frequency.value = f
      g.gain.setValueAtTime(0, t0 + at); g.gain.linearRampToValueAtTime(vol, t0 + at + .012); g.gain.exponentialRampToValueAtTime(.0001, t0 + at + dur)
      o.connect(g).connect(actx.destination); o.start(t0 + at); o.stop(t0 + at + dur + .05)
    }
  } catch {}
}

function buzz(ms = 30) { try { navigator.vibrate && navigator.vibrate(ms) } catch {} }

function nextGift(rewards, pts) {
  const sorted = [...rewards].sort((a, b) => a.cost - b.cost)
  return sorted.find(r => r.cost > pts) || sorted[sorted.length - 1]
}

const imgSrc = n => '/img/' + n + '.svg'

const TIERS = [['plaisir', 'Petits plaisirs'], ['temps', 'Du temps pour toi'], ['bon', 'Bons et cadeaux'], ['experience', 'Expériences'], ['gros', 'Gros lots']]

const LINE = { blanche: ['Blanche', 'lb-w'], grise: ['Grise', 'lb-g'], rouge: ['Rouge', 'lb-r'] }

const dshort = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

const FAM = { salle: 'Salle', bar: 'Bar', cuisine: 'Cuisine', support: 'Accueil, sécurité et support' }

const first = n => (n || '').split(' ')[0]

const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')

const monday = (off = 0) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * off); return d }

// Règles du jeu : remplies par le serveur avec le profil (daraja_me.rules), seule source des chiffres affichés
const RV = {}

export { deviceId, useOffline, listen, sfx, soundOn, setSound, RV, reportError, avFile, TK, store, MOCK, rpc, LEVELS, level, initials, fmt, LV, AV_SEEDS, AV_STYLES, AV_LIB, ROLES, waLink, burst, flyPoints, buzz, nextGift, imgSrc, first, iso, monday, dshort, LINE, TIERS, FAM, VK }
