import React from 'react'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_KEY } from './config.js'
import { AV_SEEDS, AV_STYLES, avFile } from './avatar-list.js'

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

const TK = 'daraja_token', VK = 'daraja_venue'

const store = {
  get: k => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch {} },
}

const MOCK = import.meta.env.VITE_MOCK === '1'

async function rpc(fn, args = {}) {
  if (MOCK) return (await import('./mock.js')).default(fn, args)
  const { data, error } = await sb.rpc(fn, args)
  if (error) throw error
  return data
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

export { avFile, sb, TK, store, MOCK, rpc, LEVELS, level, initials, fmt, LV, AV_SEEDS, AV_STYLES, AV_LIB, ROLES, waLink, burst, flyPoints, buzz, nextGift, imgSrc, first, iso, monday, dshort, LINE, TIERS, FAM, VK }
