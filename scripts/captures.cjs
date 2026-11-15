// Captures d'écran de tous les écrans (mode démo), pour comparer avant / après une modification.
// Usage : VITE_MOCK=1 npx vite build --outDir /tmp/demo && npx vite preview --outDir /tmp/demo --port 5072
//         puis : node scripts/captures.cjs 5072 dossier_sortie   (nécessite Playwright installé)
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const PORT = process.argv[2] || '5072', OUT = process.argv[3] || 'captures';
require('fs').mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch(); const today = new Date().toLocaleDateString('fr-CA');
  const flows = [
    ['staff', 'home', []], ['staff', 'board', ['nav button[aria-label=board]']], ['staff', 'stories', ['nav button[aria-label=stories]']],
    ['staff', 'shop', ['nav button[aria-label=shop]']], ['staff', 'profile', ['nav button[aria-label=profile]']],
    ['staff', 'rules', ['nav button[aria-label=profile]', 'button:has-text("Règles du jeu")']],
    ['staff', 'quiz', ['button:has-text("Jouer")']], ['staff', 'duels', ['.duelcard']],
    ['super', 'admin', ['nav button[aria-label=admin]']], ['super', 'reports', ['nav button[aria-label=admin]', '.admgrp button:has-text("Suivi")']],
    ['super', 'attendance', ['nav button[aria-label=admin]', '.tabs button:has-text("Pointage")']],
    ['super', 'settings', ['nav button[aria-label=admin]', '.admgrp button:has-text("Réglages")']],
    ['super', 'gifts', ['nav button[aria-label=admin]', '.admgrp button:has-text("Réglages")', '.tabs button:has-text("Cadeaux")']],
    ['super', 'draw', ['nav button[aria-label=admin]', '.admgrp button:has-text("Réglages")', '.tabs button:has-text("Tirage")']],
    ['super', 'conduct', ['nav button[aria-label=admin]', '.tabs button:has-text("Conduite")']],
    ['super', 'test', ['nav button[aria-label=profile]', 'button:has-text("Mode test")']],
  ]
  const errs = {}
  for (const port of [PORT]) for (const [role, name, clicks] of flows) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await ctx.addInitScript(([t, r]) => { localStorage.setItem('daraja_token','x'); localStorage.setItem('daraja_quote_day', t); localStorage.setItem('daraja_lv_me','9'); localStorage.setItem('mock_role', r); localStorage.setItem('mock_duel','pending'); Math.random = () => 0.42 }, [today, role]);
    const p = await ctx.newPage(); p.on('pageerror', e => { (errs[port + name] ||= []).push(e.message) });
    await p.goto(`http://localhost:${port}/`); await p.waitForTimeout(1200);
    const inv = await p.$('button:has-text("Plus tard")'); if (inv) { await inv.click({ force: true }); await p.waitForTimeout(300) }
    for (const c of clicks) { await p.click(c, { force: true }); await p.waitForTimeout(900) }
    await p.waitForTimeout(1500);
    const miss = await p.evaluate(() => [...document.querySelectorAll('i.ti')].filter(e => { const c = getComputedStyle(e, '::before').content; return !c || c === 'none' || c === 'normal' }).map(e => e.className));
    if (miss.length) (errs['MISSING ' + port + name] ||= []).push(...new Set(miss));
    await p.screenshot({ path: `${OUT}/${name}.png` }); await ctx.close();
  }
  console.log(JSON.stringify(errs)); await b.close();
})();
