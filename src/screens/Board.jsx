import React, { useEffect, useState } from 'react'
import { fmt, rpc } from '../lib'
import { Avatar, Info } from '../ui'

const BOARDS = [
  ['savoir', 'Savoir', 'brain', v => fmt(v) + ' pts', 'Points gagnés aux quiz ce mois-ci, sur les bonnes réponses.'],
  ['assiduite', 'Assiduité', 'calendar-check', v => v + ' j', 'Nombre de jours où tu as terminé ton défi ce mois-ci. Même avec des erreurs, chaque jour compte.'],
  ['progression', 'Progression', 'trending-up', v => (v > 0 ? '+' : '') + v + ' pts', 'Ta précision ce mois-ci comparée au mois dernier. Il faut au moins 10 réponses sur chaque mois pour apparaître.'],
]

function Board({ token, me, venue }) {
  const [kind, setKind] = useState('savoir')
  const [list, setList] = useState(null)
  useEffect(() => { setList(null); rpc('daraja_leaderboard2', { p_token: token, p_venue: venue, p_kind: kind }).then(setList).catch(() => setList([])) }, [token, venue, kind])
  const month = new Date().toLocaleDateString('fr-FR', { month: 'long' })
  const b = BOARDS.find(x => x[0] === kind)
  const shown = (list || []).filter(p => p.val != null)
  const waiting = (list || []).filter(p => p.val == null)
  return (
    <div className="page">
      <div className="row between" style={{ position: 'relative' }}>
        <h1>Classements</h1>
        <Info text={b[4] + ' Remise à zéro chaque 1er du mois. Touche pour fermer.'} />
      </div>
      <div className="sub" style={{ textTransform: 'capitalize' }}>{month} · {me.venue_name}</div>
      <div className="seg" style={{ marginTop: 12 }}>
        {BOARDS.map(([k, l, ic]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}><i className={'ti ti-' + ic} /> {l}</button>)}
      </div>
      {!list ? <div className="sub">Chargement…</div> : !shown.length ? <div className="sub">Personne encore. Sois le premier.</div> :
        shown.map((p, k) => (
          <div key={p.id} className={'lb rise ' + (p.id === me.id ? 'me' : '')} style={{ animationDelay: k * 0.03 + 's' }}>
            <span className={k < 3 ? 'acc' : ''} style={{ width: 22, fontWeight: 600 }}>{k < 3 ? <i className="ti ti-medal" /> : k + 1}</span>
            <Avatar value={p.avatar} name={p.name} />
            <span style={{ flex: 1, fontWeight: p.id === me.id ? 600 : 400 }}>{p.id === me.id ? 'Toi' : p.name}{p.streak >= 3 && <span className="sub"> <i className="ti ti-flame" style={{ color: '#E8833A' }} />{p.streak}</span>}</span>
            <span className={k < 3 ? 'acc' : ''} style={{ fontWeight: 600 }}>{b[3](p.val)}</span>
          </div>
        ))}
      {kind === 'progression' && waiting.length > 0 && <div className="sub" style={{ marginTop: 12 }}>{waiting.length} personne{waiting.length > 1 ? 's' : ''} sans assez de réponses pour comparer</div>}
    </div>
  )
}

export { BOARDS, Board }
