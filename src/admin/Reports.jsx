import React, { useEffect, useState } from 'react'
import { first, fmt, rpc, waLink } from '../lib'
import { Avatar } from '../ui'

function profileOf(p, days) {
  if (!p.days_played) return 'off'
  if ((p.acc ?? 0) >= 75 && p.days_played >= Math.max(1, Math.ceil(days * 0.6))) return 'champ'
  return 'prog'
}

const PROF = {
  champ: ['Champions', 'trophy', 'var(--good)'],
  prog: ['En progrès', 'trending-up', 'var(--acc)'],
  off: ['Décrochés', 'zzz', 'var(--bad)'],
}

function relance(p, kind, per) {
  const n = first(p.display)
  if (kind === 'champ') return `Bravo ${n} ! ${p.acc} % de bonnes réponses ${per}, tu fais partie des meilleurs de l'équipe. Continue comme ça 🔥`
  if (kind === 'prog') return `Salut ${n} ! Tu joues le jeu sur Daraja (${p.days_played} jour${p.days_played > 1 ? 's' : ''} ${per}), c'est top. Petit conseil : prends 10 secondes pour lire l'explication après chaque réponse, ça paie vite. On croit en toi 💪`
  return `Salut ${n} ! On ne t'a pas vu sur Daraja ${per}. 3 minutes par jour suffisent : même avec des erreurs, tu gagnes des pièces de présence et des tickets pour le tirage du mois 🎟️ À tout de suite !`
}

function Reports({ token, me, venue, toast }) {
  const [per, setPer] = useState('week')
  const [r, setR] = useState(null)
  useEffect(() => { setR(null); rpc('daraja_report', { p_token: token, p_venue: venue, p_period: per }).then(setR).catch(() => setR({ staff: [], themes: [], traps: [] })) }, [token, venue, per])
  const perTxt = { day: "aujourd'hui", week: 'cette semaine', month: 'ce mois-ci' }[per]
  if (!r) return <div className="sub">Chargement…</div>
  const st = r.staff || []
  const groups = { champ: [], prog: [], off: [] }
  st.forEach(p => groups[profileOf(p, r.days)].push(p))
  groups.champ.sort((a, b) => b.acc - a.acc); groups.prog.sort((a, b) => b.days_played - a.days_played)
  const active = st.length - groups.off.length
  const accs = st.filter(p => p.acc != null)
  const avg = accs.length ? Math.round(accs.reduce((a, p) => a + p.acc, 0) / accs.length) : null
  const pts = st.reduce((a, p) => a + (p.pts || 0), 0)
  const summary = () => [
    `📊 Daraja · ${me.venue_name} · ${{ day: "Aujourd'hui", week: '7 derniers jours', month: '30 derniers jours' }[per]}`,
    `👥 ${active}/${st.length} actifs · 🎯 ${avg ?? '–'} % de bonnes réponses · ⭐ ${fmt(pts)} pièces gagnées`,
    groups.champ.length ? `🏆 Champions : ${groups.champ.map(p => first(p.display) + ' (' + p.acc + ' %)').join(', ')}` : '',
    groups.prog.length ? `📈 En progrès : ${groups.prog.map(p => first(p.display)).join(', ')}` : '',
    groups.off.length ? `💤 À relancer : ${groups.off.map(p => first(p.display)).join(', ')}` : '',
    r.themes?.length ? `📚 Thème à retravailler : ${r.themes[0].label} (${r.themes[0].acc} %)` : '',
    r.traps?.length ? `⚠️ Question piège : « ${r.traps[0].question} » (${r.traps[0].err} % d'erreurs)` : '',
    `🎁 ${r.gifts} cadeau${r.gifts > 1 ? 'x' : ''} · ⭐ ${r.reviews} avis client${r.reviews > 1 ? 's' : ''}`,
  ].filter(Boolean).join('\n')
  const copy = async () => { try { await navigator.clipboard.writeText(summary()); toast('Résumé copié') } catch { toast('Copie impossible') } }
  return (
    <>
      <div className="seg" style={{ marginTop: 10 }}>
        {[['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois']].map(([k, l]) => <button key={k} className={per === k ? 'on' : ''} onClick={() => setPer(k)}>{l}</button>)}
      </div>
      <div className="kpis">
        <div className="card"><b>{active}/{st.length}</b><span className="sub">actifs</span></div>
        <div className="card"><b>{avg ?? '–'}{avg != null ? ' %' : ''}</b><span className="sub">bonnes réponses</span></div>
        <div className="card"><b>{fmt(pts)}</b><span className="sub">pièces gagnées</span></div>
        <div className="card"><b>{r.gifts} · {r.reviews}</b><span className="sub">cadeaux · avis</span></div>
      </div>
      <button className="btn wa" onClick={copy}><i className="ti ti-copy" /> Copier le résumé pour WhatsApp</button>
      {Object.entries(groups).map(([k, list]) => list.length > 0 && (
        <div key={k}>
          <div className="grp"><i className={'ti ti-' + PROF[k][1]} style={{ color: PROF[k][2] }} /> {PROF[k][0]} · {list.length}</div>
          {list.map(p => (
            <div key={p.id} className="lb">
              <Avatar value={p.avatar} name={p.display} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>{p.display}</div>
                <div className="sub">{p.days_played} j · {p.acc != null ? p.acc + ' %' : '–'}{p.prev_acc != null && p.acc != null ? ' (' + (p.acc >= p.prev_acc ? '+' : '') + (p.acc - p.prev_acc) + ')' : ''} · {fmt(p.pts)} pièces{p.conduct ? ' · ' + p.conduct + ' faute' + (p.conduct > 1 ? 's' : '') : ''}</div>
              </div>
              {p.phone ? <a className="mini" style={{ background: '#25D366', color: '#fff', textDecoration: 'none' }} href={waLink(p.phone, relance(p, k, perTxt))} target="_blank" rel="noreferrer"><i className="ti ti-brand-whatsapp" /></a>
                : <span className="sub" style={{ fontSize: 11 }}>sans n°</span>}
            </div>
          ))}
        </div>
      ))}
      {r.themes?.length > 0 && <>
        <div className="sec">Maîtrise par thème</div>
        {[...r.themes].sort((a, b) => b.acc - a.acc).map(t => (
          <div key={t.cat} className="heat"><span>{t.label}</span><div className="bar"><div style={{ width: t.acc + '%', background: t.acc >= 75 ? 'var(--good)' : t.acc >= 50 ? 'var(--acc)' : 'var(--bad)' }} /></div><b style={{ width: 38, textAlign: 'right' }}>{t.acc} %</b></div>
        ))}
      </>}
      {r.traps?.length > 0 && <>
        <div className="sec">Questions pièges</div>
        {r.traps.map((t, k) => <div key={k} className="card" style={{ fontSize: 14 }}><div>{t.question}</div><div className="sub" style={{ marginTop: 4 }}>{t.theme} · <span style={{ color: 'var(--bad)' }}>{t.err} % d'erreurs</span> sur {t.n}</div></div>)}
      </>}
    </>
  )
}

export { profileOf, PROF, relance, Reports }
