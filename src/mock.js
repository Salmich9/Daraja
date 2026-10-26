const V = () => localStorage.getItem('daraja_venue') || 'baro'
const ppl = [
  ['Amina', 'fun-emoji:Citron', 92, 6, 1240, '212600000001'], ['Youssef', 'bottts:Shaker', 81, 5, 980, '212600000002'],
  ['Salma', 'big-smile:Safran', 64, 4, 610, '212600000003'], ['Karim', 'croodles:Olive', 55, 3, 420, null],
  ['Hind', 'fun-emoji:Momo', 0, 0, 30, '212600000005'], ['Omar', 'bottts:Tonic', 0, 0, 0, '212600000006'],
]
const staff = ppl.map(([n, av, acc, d, pts, ph], i) => ({ id: 's' + i, name: n + ' B.', display: n, alias: null, avatar: av, phone: ph, post: ['serveur', 'bartender', 'hotesse', 'plongeur', 'securite', 'cuisinier'][i], post_label: ['Serveur', 'Bartender', "Hôtesse d'accueil", 'Plongeur', 'Agent de sécurité', 'Cuisinier'][i], family: ['salle', 'bar', 'salle', 'cuisine', 'support', 'cuisine'][i], role: 'staff', points: pts, mission_done: i === 0, days_played: d, answered: d * 5, acc: d ? acc : null, prev_acc: d ? acc - 6 + i * 2 : null, pts, conduct: i === 3 ? 1 : 0, streak: d }))
const rewards = [
  ['Jus frais ou mocktail offert', 'glass', 100, 'plaisir', []], ['Café ou boisson offerte', 'coffee', 150, 'plaisir', []],
  ['Partir 1 h plus tôt', 'door-exit', 500, 'temps', [{ key: 'late', label: 'Moins de 10 min de retard sur 30 jours, sans absence injustifiée', ok: true }]],
  ['½ journée off', 'sun', 1200, 'temps', [{ key: 'clean', label: 'Aucune ligne grise ou rouge depuis 30 jours', ok: true }, { key: 'days', label: '20 jours de quiz sur les 30 derniers jours', ok: false, have: 14, need: 20 }]],
  ['Places de cinéma pour 2', 'movie', 800, 'bon', []], ['Barbier, hammam ou spa', 'bath', 1200, 'bon', []],
  ['Dîner pour 2 à Baromètre ou ZamaZama', 'tools-kitchen-2', 1800, 'experience', []], ['Week-end à Agafay ou Essaouira', 'tent', 8000, 'gros', [{ key: 'recid', label: 'Pas de récidive depuis 90 jours', ok: true }]],
].map(([name, icon, cost, tier, checks], i) => ({ id: 'r' + i, name, icon, cost, tier, checks, stock: i === 7 ? 1 : null, active: i < 6, conditions: i === 3 ? { clean_days: 30, min_days: 20 } : {}, library: i >= 6 }))
const days = (k) => { const out = []; const m = new Date(); m.setDate(m.getDate() - ((m.getDay() + 6) % 7) - 7); for (let i = 0; i < 7; i++) { const d = new Date(m); d.setDate(d.getDate() + i); out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')) } return out }
export default async function mock(fn, a) {
  const v = a.p_venue || V()
  switch (fn) {
    case 'daraja_me': return { id: 'me', name: 'Salmane Tazi', display: 'Salmane', alias: null, avatar: 'fun-emoji:Zama', role: localStorage.getItem('mock_role') || 'super', venue: v, venue_name: v === 'zz' ? 'ZamaZama' : 'Baromètre', points: 1130, earned: 1450, month: 640, rank: 2, streak: 6, flame: 'lit', next_bonus: 35, quiz_done: false, tickets: 9, avis: 1, perfect: 2, gifts: 1, exemplary: true, pending_ack: 0, direction_todo: 0 }
    case 'daraja_rewards': return rewards.filter(r => r.active)
    case 'daraja_mission': return { title: "Raconte l'histoire d'un cocktail signature à 3 tables différentes", family: 'salle', done: false, days_left: 4 }
    case 'daraja_draw_info': return { tickets: 9, days_left: 5, last: { month: '2026-09', prize: 'Dîner pour 2', winner: 'Youssef', me: false } }
    case 'daraja_leaderboard2': return staff.map(s => ({ id: s.id, name: s.display, avatar: s.avatar, streak: s.streak, val: a.p_kind === 'assiduite' ? s.days_played * 3 : a.p_kind === 'progression' ? (s.days_played ? s.acc - s.prev_acc : null) : s.pts })).sort((x, y) => (y.val ?? -999) - (x.val ?? -999))
    case 'daraja_contacts': return []
    case 'daraja_admin': return { reviews: [], gifts: [{ id: 'g1', name: 'Amina B.', note: 'Café ou boisson offerte' }], staff }
    case 'daraja_admin_missions': return { salle: "Raconte l'histoire d'un cocktail signature à 3 tables différentes", bar: 'Présente la Mixology Class à 3 clients', cuisine: 'Zéro produit sans étiquette dans ta zone toute la semaine', support: "Accueille chaque client par un bonjour et un sourire 5 soirs d'affilée" }
    case 'daraja_admin_contacts': return {}
    case 'daraja_report': return { days: 7, staff, themes: [{ cat: 'vins', label: 'Vins et accords', acc: 48, n: 40 }, { cat: 'anglais', label: 'Anglais', acc: 63, n: 30 }, { cat: 'cocktails', label: 'Cocktails et spiritueux', acc: 77, n: 52 }, { cat: 'hospitalite', label: 'Hospitalité et règlement', acc: 88, n: 61 }], traps: [{ question: 'Quel cépage domine le Médoc ?', theme: 'Vins', err: 71, n: 7 }], gifts: 2, reviews: 1 }
    case 'daraja_admin_attendance': { const d = days(); return staff.map((s, i) => ({ id: s.id, display: s.display, name: s.name, late: i === 2 ? 25 : i === 1 ? 4 : 0, absent: i === 4 ? 1 : 0, bonus: i < 2, days: d.slice(0, 6).map((day, k) => ({ day, status: i === 4 && k === 2 ? 'absent' : i === 3 && k === 4 ? 'recup' : k === 5 && i === 5 ? 'repos' : 'present', late: i === 2 && k === 1 ? 25 : i === 1 && k === 3 ? 4 : 0, late_ok: false, source: 'pdf' })) })) }
    case 'daraja_settings': return { levels: [{ key: 'level:1', label: 'Facile', enabled: true }, { key: 'level:2', label: 'Confirmé', enabled: true }, { key: 'level:3', label: 'Expert', enabled: false }], cats: [['hospitalite', 'Hospitalité et règlement', 1, 27], ['cuisine', 'Cuisine et hygiène', 1, 19], ['securite', 'Sécurité', 1, 10], ['carte', 'Notre carte', 1, 31], ['vins', 'Vins et accords', 0, 41]].map(([k, l, e, c]) => ({ key: 'cat:' + k, label: l, enabled: !!e, count: c })) }
    case 'daraja_admin_rewards': return rewards
    case 'daraja_posts': return [{ id: 'serveur', family: 'salle', label: 'Serveur' }]
    case 'daraja_quote': return { kind: 'proverbe', body: 'Petit à petit, l\'oiseau fait son nid.', author: 'Proverbe' }
    default: return { ok: true }
  }
}
