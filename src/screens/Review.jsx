import React, { useEffect, useState } from 'react'
import { rpc } from '../lib'

// Relecture du défi : chaque question, ta réponse, la bonne réponse et l'explication.
// Le serveur ne la donne qu'une fois le défi fini, et la retire dès que le défi suivant est lancé.
const ICON = { ok: 'ti-check', ko: 'ti-x', late: 'ti-stopwatch' }

function Item({ it, n }) {
  const p = it.pick || {}
  const st = it.ok ? 'ok' : p.late ? 'late' : 'ko'
  const opts = it.kind === 'tf' ? (it.options?.length ? it.options : ['Vrai', 'Faux']) : it.options || []
  return (
    <div className={'card rv ' + st}>
      <div className="row between u-mb-6"><span className="sub">{n}. {it.theme}</span>
        <span className={'rvst ' + st}><i className={'ti ' + ICON[st]} /> {it.ok ? 'Juste' : p.late ? 'Temps écoulé' : 'Raté'}</span></div>
      <div className="u-fw-600 u-mb-10 u-lh-1_4">{it.question}</div>
      {['qcm', 'scene', 'price', 'image', 'tf'].includes(it.kind) && opts.map((o, k) => {
        const good = k === it.answer_idx, mine = p.c === k
        return <div key={k} className={'rvopt' + (good ? ' good' : mine ? ' bad' : '')}>
          <i className={'ti ' + (good ? 'ti-check' : mine ? 'ti-x' : 'ti-point')} /><span>{o}</span>{mine && <small>ta réponse</small>}
        </div>
      })}
      {it.kind === 'order' && it.solution && <div className="rvopt good"><i className="ti ti-check" /><span>{it.solution.join(' ').replace(/ ([?,.!])/g, '$1')}</span></div>}
      {it.kind === 'match' && (it.pairs || []).map((pr, k) => <div key={k} className="rvopt good"><i className="ti ti-arrows-right-left" /><span>{pr[0]} · {pr[1]}</span></div>)}
      {it.explanation && <div className="rvx">{it.explanation}</div>}
    </div>
  )
}

export function Review({ token, back }) {
  const [d, setD] = useState(null)
  const [only, setOnly] = useState(false)
  useEffect(() => { rpc('daraja_quiz_review', { p_token: token }).then(setD).catch(() => setD({ ok: false })) }, [token])
  if (!d) return <div className="page sub">Chargement…</div>
  const items = (d.items || []).filter(it => !only || !it.ok)
  return (
    <div className="page">
      <button className="mini ghost" onClick={back}><i className="ti ti-chevron-left" /> Retour</button>
      {!d.ok ? <div className="card u-ta-center u-mt-14"><i className="ti ti-hourglass acc u-fs-32" /><div className="u-mt-8">Rien à relire pour l'instant</div><div className="sub">Termine le défi du jour pour revoir tes réponses.</div></div> : <>
        <div className="row between u-m-12px-0">
          <h1 className="u-m-0">{d.today ? 'Mon défi du jour' : 'Mon dernier défi'}</h1>
          <b className="acc u-fs-22">{d.score}/{d.total}</b>
        </div>
        {d.score < d.total && <div className="seg u-mb-12">
          <button className={!only ? 'on' : ''} onClick={() => setOnly(false)}>Tout</button>
          <button className={only ? 'on' : ''} onClick={() => setOnly(true)}>Mes erreurs</button>
        </div>}
        {items.map(it => <Item key={it.question} it={it} n={d.items.indexOf(it) + 1} />)}
      </>}
    </div>
  )
}
