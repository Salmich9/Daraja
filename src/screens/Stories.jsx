import React, { useEffect, useRef, useState } from 'react'

let storiesMod = null

const daysSince = () => { const a = new Date(); a.setHours(12, 0, 0, 0); return Math.round((a - new Date(2026, 9, 26, 12)) / 864e5) }

// Découpe le texte en cartes courtes (≈ 300 caractères max), sans couper une phrase
const chunk = body => body.split(/\n+/).flatMap(p => {
  if (p.length <= 320) return [p]
  const out = []; let cur = ''
  for (const ph of p.match(/[^.!?]+[.!?]+["»]?\s*|[^.!?]+$/g) || [p]) { if (cur && (cur + ph).length > 300) { out.push(cur.trim()); cur = '' } cur += ph }
  if (cur.trim()) out.push(cur.trim()); return out
})

const SCAT = { sport: 'Sport', entrepreneur: 'Entrepreneur', restauration: 'Restauration', artiste: 'Artiste', pionnier: 'Pionnier' }

function StoryCards({ s }) {
  const cards = [{ cover: true }, ...chunk(s.body).map(t => ({ t })), { lesson: true }]
  const [k, setK] = useState(0)
  const x0 = useRef(null)
  const go = d => setK(v => Math.max(0, Math.min(cards.length - 1, v + d)))
  const c = cards[k]
  return (
    <div className="stcards">
      <div className="stbars">{cards.map((_, i) => <i key={i} className={i <= k ? 'on' : ''} />)}</div>
      <div className="stcard" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); go(e.clientX - r.left < r.width / 3 ? -1 : 1) }}
        onTouchStart={e => { x0.current = e.touches[0].clientX }} onTouchEnd={e => { const dx = e.changedTouches[0].clientX - (x0.current ?? 0); if (Math.abs(dx) > 40) { e.preventDefault(); go(dx < 0 ? 1 : -1) } }}>
        <div key={k} className="stin">
          {c.cover && <><span className="catchip">{SCAT[s.cat] || s.cat}</span><h2>{s.title}</h2><div className="acc" style={{ fontWeight: 700, fontSize: 18 }}>{s.person}</div><div className="sub sthint">Touche pour lire <i className="ti ti-chevron-right" /></div></>}
          {c.t && <p>{c.t}</p>}
          {c.lesson && <><i className="ti ti-bulb acc" style={{ fontSize: 40 }} /><div className="stlesson">{s.lesson}</div></>}
        </div>
      </div>
      <div className="row between sub" style={{ marginTop: 8 }}><span>{k + 1} / {cards.length}</span>{k < cards.length - 1 ? <span>Touche à droite pour avancer</span> : <span>Fin de l'histoire</span>}</div>
    </div>
  )
}

function Stories() {
  const [list, setList] = useState(storiesMod)
  const [back, setBack] = useState(0)
  useEffect(() => { if (!storiesMod) import('../stories.json').then(m => { storiesMod = m.default; setList(m.default) }) }, [])
  if (!list) return <div className="page sub">On ouvre le livre…</div>
  const n = list.length, idx = (((daysSince() - back) % n) + n) % n, s = list[idx]
  const d = new Date(); d.setDate(d.getDate() - back)
  return (
    <div className="page story">
      <div className="row between">
        <span className="sub" style={{ textTransform: 'capitalize' }}>{back === 0 ? "Aujourd'hui" : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
      </div>
      <StoryCards key={idx} s={s} />
      <div className="row" style={{ gap: 10, marginTop: 20 }}>
        <button className="btn ghost" disabled={back >= 30} onClick={() => { setBack(back + 1); window.scrollTo(0, 0) }}><i className="ti ti-chevron-left" /> Histoire d'hier</button>
        <button className="btn ghost" disabled={back === 0} onClick={() => { setBack(back - 1); window.scrollTo(0, 0) }}>Plus récente <i className="ti ti-chevron-right" /></button>
      </div>
    </div>
  )
}

export { storiesMod, daysSince, SCAT, Stories }
