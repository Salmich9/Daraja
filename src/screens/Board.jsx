import React, { useEffect, useState } from 'react'
import { fmt, rpc } from '../lib'
import { Avatar, Info } from '../ui'

const UNIT = { savoir: ' XP', assiduite: ' j', progression: ' %' }
const BOARDS = [
  ['savoir', 'Savoir', 'brain', v => fmt(v) + ' XP', 'XP gagnée aux quiz ce mois-ci, sur les bonnes réponses.'],
  ['assiduite', 'Assiduité', 'calendar-check', v => v + ' j', 'Nombre de jours où tu as terminé ton défi ce mois-ci. Même avec des erreurs, chaque jour compte.'],
  ['progression', 'Progression', 'trending-up', v => (v > 0 ? '+' : '') + v + ' %', 'Ta précision ce mois-ci comparée au mois dernier. Il faut au moins 10 réponses sur chaque mois pour apparaître.'],
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
    <div className="page u-pb-170" >
      <div className="row between u-pos-relative" >
        <h1>Classements</h1>
        <Info text={b[4] + ' Remise à zéro chaque 1er du mois. Touche pour fermer.'} />
      </div>
      <div className="sub u-tt-capitalize" >{month} · {me.venue_name}</div>
      <div className="seg u-mt-12" >
        {BOARDS.map(([k, l, ic]) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}><i className={'ti ti-' + ic} /> {l}</button>)}
      </div>
      {!list ? <div className="sub">Chargement…</div> : !shown.length ? <div className="sub">Personne encore. Sois le premier.</div> : <>
        <div className="podium">
          {[1, 0, 2].map(k => shown[k] && <div key={k} className={'pod p' + (k + 1) + (shown[k].id === me.id ? ' me' : '')}>
            {k === 0 && <i className="ti ti-crown crown" />}
            <Avatar value={shown[k].avatar} name={shown[k].name} size={k === 0 ? 68 : 54} me={shown[k].id === me.id} />
            <div className="podname">{shown[k].id === me.id ? 'Toi' : shown[k].name}</div>
            <div className="podval">{b[3](shown[k].val)}</div>
            <div className="podbase">{k + 1}</div>
          </div>)}
        </div>
        {shown.slice(3).map((p, j) => { const k = j + 3; return (
          <div key={p.id} className={'lb rise ' + (p.id === me.id ? 'me' : '')} style={{ animationDelay: j * 0.03 + 's' }}>
            <span className="u-w-22 u-fw-600">{k + 1}</span>
            <Avatar value={p.avatar} name={p.name} />
            <span style={{ flex: 1, fontWeight: p.id === me.id ? 600 : 400 }}>{p.id === me.id ? 'Toi' : p.name}{p.streak >= 3 && <span className="sub"> <i className="ti ti-flame u-c-E8833A"  />{p.streak}</span>}</span>
            <span className="u-fw-600">{b[3](p.val)}</span>
          </div>) })}
        {(() => {
          const i = shown.findIndex(p => p.id === me.id)
          if (i < 0) return null
          const ahead = shown[i - 1], behind = shown[i + 1]
          const msg = ahead ? <>Plus que <b>{Math.max(1, ahead.val - shown[i].val + 1)}{UNIT[kind]}</b> pour dépasser {ahead.name}</>
            : behind ? <>Tu mènes avec <b>{shown[i].val - behind.val}{UNIT[kind]}</b> d'avance</> : <>Tu mènes le classement</>
          return <div className="mybar rise"><b className="myrank">{i === 0 ? '1er' : (i + 1) + 'e'}</b><Avatar value={me.avatar} name={me.display} size={34} me /><div className="u-flex-1"><div className="u-fw-700">Toi · {b[3](shown[i].val)}</div><div className="sub">{msg}</div></div></div>
        })()}
      </>}
      {kind === 'progression' && waiting.length > 0 && <div className="sub u-mt-12" >{waiting.length} personne{waiting.length > 1 ? 's' : ''} sans assez de réponses pour comparer</div>}
    </div>
  )
}

export { BOARDS, Board }
