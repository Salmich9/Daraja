// Ouvre chaque écran de l'appli en mode démo (sans réseau) et échoue si l'un d'eux plante.
// Usage : npm run test:screens   (lancé aussi à chaque mise en ligne)
import { build } from 'vite'
import { JSDOM, VirtualConsole } from 'jsdom'
import fs from 'fs'
import path from 'path'
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
await build({ configFile: path.join(root, 'scripts/vite.screens.config.js'), root })
const code = fs.readFileSync(path.join(root, 'node_modules/.screens/app.js'), 'utf8')
const wait = ms => new Promise(r => setTimeout(r, ms))

// Parcours : [rôle, nom, étapes] ; une étape = sélecteur à toucher
const FLOWS = [
  ['staff', 'Accueil', []], ['staff', 'Défi du jour', ['button.btn.pulse']], ['staff', 'Duels', ['.duelcard']],
  ['staff', 'Classement', ['nav button[aria-label=board]']], ['staff', 'Histoires', ['nav button[aria-label=stories]']],
  ['staff', 'Boutique', ['nav button[aria-label=shop]']], ['staff', 'Profil', ['nav button[aria-label=profile]']],
  ['staff', 'Règles', ['nav button[aria-label=profile]', 'text:Règles du jeu']],
  ['super', 'Admin équipe', ['nav button[aria-label=admin]']],
  ['super', 'Admin pointage', ['nav button[aria-label=admin]', 'text:Pointage']],
  ['super', 'Admin conduite', ['nav button[aria-label=admin]', 'text:Conduite']],
  ['super', 'Admin rapports', ['nav button[aria-label=admin]', 'text:Suivi']],
  ['super', 'Admin erreurs', ['nav button[aria-label=admin]', 'text:Suivi', 'text:Erreurs']],
  ['super', 'Admin questions', ['nav button[aria-label=admin]', 'text:Réglages']],
  ['super', 'Admin tirage', ['nav button[aria-label=admin]', 'text:Réglages', 'text:Tirage']],
  ['super', 'Admin cadeaux', ['nav button[aria-label=admin]', 'text:Réglages', 'text:Cadeaux']],
  ['staff', 'Guide', ['button.helpfab', 'text:Suivant', 'text:Suivant', 'text:Suivant', 'text:C\'est parti !']],
  ['staff', 'Carte & ventes', ['[data-go=formation]']],
  ['super', 'Admin à vendre', ['nav button[aria-label=admin]', 'text:À vendre']],
  ['super', 'Admin charte', ['nav button[aria-label=admin]', 'text:Réglages', 'text:Charte']],
  ['super', 'Admin notifications', ['nav button[aria-label=admin]', 'text:Réglages', 'text:🔔 Notifications']],
  ['super', 'Mode test', ['nav button[aria-label=profile]', 'text:Mode test']],
  ['super', 'Admin évaluations', ['nav button[aria-label=admin]', 'text:Évaluations']],
  ['super', 'Admin fiche évaluation', ['nav button[aria-label=admin]', 'text:Évaluations', '.evrow', 'text:Progression']],
  ['super', 'Admin validation', ['nav button[aria-label=admin]', 'text:Évaluations', '.evpend', 'text:Renvoyer']],
  ['admin', 'Manager évaluations', ['nav button[aria-label=admin]', 'text:Évaluations', '.evrow']],
  ['super', 'Admin grille évaluation', ['nav button[aria-label=admin]', 'text:Réglages', 'text:Évaluation', 'text:Managers']],
  ['staff', 'Bilan du mois', ['button.btn'], { mock_eval_new: '1' }],
  ['super', 'Notification évaluations', [], { _q: '?go=evals', _expect: 'progressent' }],
]

let fail = 0
for (const [role, name, steps, extra] of FLOWS) {
  const errors = []
  const vc = new VirtualConsole()
  vc.on('jsdomError', e => { if (!/Not implemented/.test(e.message)) errors.push(e.message) })
  vc.on('error', (...a) => { const m = a.join(' '); if (!/act\(|Not implemented|Download the React DevTools/.test(m)) errors.push(m) })
  const { _q = '', _expect, ...store } = extra || {}
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' + _q, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc })
  const w = dom.window
  const today = new Date().toLocaleDateString('fr-CA')
  Object.entries({ daraja_token: 'x', daraja_quote_day: today, daraja_lv_me: '9', daraja_guide_me: '1', mock_role: role, mock_duel: 'pending', daraja_sound: '0', ...store }).forEach(([k, v]) => w.localStorage.setItem(k, v))
  w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = () => {}
  w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  w.addEventListener('error', e => errors.push(e.message))
  w.addEventListener('unhandledrejection', e => errors.push(String(e.reason?.message || e.reason)))
  try { w.eval(code) } catch (e) { errors.push(e.message) }
  await wait(600)
  const later = w.document.querySelector('.sheet button.ghost') // ferme l'invitation de duel si elle s'ouvre
  if (later && /Plus tard/.test(later.textContent)) later.click()
  for (const s of steps) {
    await wait(350)
    const el = s.startsWith('text:') ? [...w.document.querySelectorAll('button')].find(b => b.textContent.includes(s.slice(5))) : w.document.querySelector(s)
    if (!el) { errors.push('introuvable : ' + s); break }
    el.click()
  }
  await wait(700)
  const txt = w.document.body.textContent
  if (/Oups, petit souci/.test(txt)) errors.push('écran « Oups » affiché')
  if (txt.trim().length < 20) errors.push('écran vide')
  if (_expect && !txt.includes(_expect)) errors.push('attendu à l\'écran : ' + _expect)
  if (errors.length) { fail++; console.log('FAIL', name, '→', [...new Set(errors)].slice(0, 3).join(' | ')) } else console.log('OK  ', name)
  w.close()
}
console.log(fail ? fail + ' écran(s) en échec' : 'Tous les écrans s\'ouvrent sans erreur')
process.exit(fail ? 1 : 0)
