import React, { useEffect, useState } from 'react'

let storiesMod = null

const daysSince = () => { const a = new Date(); a.setHours(12, 0, 0, 0); return Math.round((a - new Date(2026, 9, 26, 12)) / 864e5) }

const SCAT = { sport: 'Sport', entrepreneur: 'Entrepreneur', restauration: 'Restauration', artiste: 'Artiste', pionnier: 'Pionnier' }

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
        <span className="catchip">{SCAT[s.cat] || s.cat}</span>
      </div>
      <div key={idx} className="rise">
        <h2>{s.title}</h2>
        <div className="acc" style={{ fontWeight: 600, marginBottom: 16 }}>{s.person}</div>
        {s.body.split(/\n+/).map((p, k) => <p key={k}>{p}</p>)}
        <div className="lesson"><i className="ti ti-bulb acc" /> {s.lesson}</div>
      </div>
      <div className="row" style={{ gap: 10, marginTop: 20 }}>
        <button className="btn ghost" disabled={back >= 30} onClick={() => { setBack(back + 1); window.scrollTo(0, 0) }}><i className="ti ti-chevron-left" /> La veille</button>
        <button className="btn ghost" disabled={back === 0} onClick={() => { setBack(back - 1); window.scrollTo(0, 0) }}>Suivante <i className="ti ti-chevron-right" /></button>
      </div>
    </div>
  )
}

export { storiesMod, daysSince, SCAT, Stories }
