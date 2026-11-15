import React, { useEffect, useState, useCallback } from 'react'
import { RV, sfx, burst, buzz, imgSrc, rpc, waLink } from '../lib'
import { Avatar, Info } from '../ui'
import { MatchGame, OrderGame, Timer } from './Quiz'

function DuelCard({ duels, go, open }) {
  const list = duels || []
  const inc = list.find(d => d.status === 'pending' && !d.mine)
  const live = list.find(d => d.status === 'ready' || d.status === 'live')
  const t = live ? (live.status === 'live' ? 'Ton duel contre ' + live.other + ' est en cours' : live.other + ' est prêt, rejoins le duel') : inc ? inc.other + ' te défie !' : 'Défie un collègue'
  return (
    <div className={('card duelcard rise' + (inc || live ? ' hot' : '')) + ' u-cur-pointer'} onClick={() => (live || inc) ? open((live || inc).id) : go('duels')} >
      <div className="row u-gap-12" >
        <i className="ti ti-swords u-fs-30"  />
        <div className="u-flex-1">
          <div className="u-fw-700">{t}</div>
          <div className="sub">Duel en direct · 5 questions · +{RV.duel_win} au gagnant</div>
        </div>
        <i className="ti ti-chevron-right" />
      </div>
    </div>
  )
}

const DSTATUS = { pending: 'En attente de réponse', ready: 'Prêt : rejoins la salle', live: 'En cours', declined: 'Refusé', expired: 'Expiré', cancelled: 'Annulé', done: '' }

function Duels({ token, venue, toast, duels, reload, open }) {
  const [pickOpen, setPickOpen] = useState(false)
  const [mates, setMates] = useState([])
  useEffect(() => { reload() }, [])
  useEffect(() => { rpc('daraja_eotm', { p_token: token, p_venue: venue }).then(e => setMates(e.candidates || [])).catch(() => {}) }, [token, venue])
  const challenge = async id => {
    try {
      const r = await rpc('daraja_duel_new', { p_token: token, p_opponent: id })
      if (r.ok) { setPickOpen(false); toast('Défi envoyé ⚔️'); open(r.id) }
      else toast({ limit: '3 défis lancés par jour maximum', open: 'Un duel est déjà en cours avec cette personne', pair: '2 duels max par jour avec la même personne', role: 'Réservé aux équipiers', questions: 'Pas assez de questions actives' }[r.error] || 'Impossible')
    } catch { toast('Erreur') }
  }
  const respond = async (id, ok) => {
    try { const r = await rpc('daraja_duel_respond', { p_token: token, p_duel: id, p_accept: ok }); if (r.ok && ok) open(id); else { toast(ok ? 'Défi expiré' : 'Défi refusé'); reload() } } catch { toast('Erreur') }
  }
  const list = duels || []
  return (
    <div className="page">
      <div className="row between u-pos-relative" >
        <h1>Duels</h1>
        <Info text={`Tu envoies un défi. Ton collègue a 24 h pour accepter. Ensuite, vous vous retrouvez dans la salle et le duel démarre en direct : mêmes questions au même moment, ${RV.time} secondes chacune. Le plus de bonnes réponses gagne +${RV.duel_win} pièces ; à égalité, le plus rapide. 3 défis lancés par jour maximum. Touche pour fermer.`} />
      </div>
      <button className="btn pulse u-m-12px-0-6px"  onClick={() => setPickOpen(true)}><i className="ti ti-swords" /> Défier un collègue</button>
      {!duels ? <div className="sub">Chargement…</div> : !list.length ? <div className="sub u-mt-12" >Aucun duel pour l'instant. Lance le premier !</div> :
        list.map(d => (
          <div key={d.id} className={'lb' + (d.todo ? ' me' : '')}>
            <Avatar value={d.other_avatar} name={d.other} />
            <div style={{ flex: 1, minWidth: 0, cursor: d.todo || d.status === 'pending' ? 'pointer' : 'default' }} onClick={() => ['pending', 'ready', 'live'].includes(d.status) && open(d.id)}>
              <div>{d.mine ? 'Toi vs ' + d.other : d.other + ' vs toi'}</div>
              <div className="sub" style={{ color: d.won === true ? 'var(--good)' : d.todo ? 'var(--acc)' : undefined }}>
                {d.status === 'done' ? (d.won === true ? 'Gagné · +' + RV.duel_win : d.won === false ? 'Perdu' : d.my_score + d.other_score ? 'Égalité · +' + RV.duel_tie : 'Égalité') : d.status === 'pending' && !d.mine ? 'Te défie !' : DSTATUS[d.status]}
              </div>
            </div>
            {d.status === 'pending' && !d.mine ? <>
              <button className="mini" onClick={() => respond(d.id, true)}>Accepter</button>
              <button className="mini ghost" aria-label="Refuser" onClick={() => respond(d.id, false)}><i className="ti ti-x" /></button>
            </> : d.status === 'done' ? <b>{d.my_score} – {d.other_score}</b>
              : ['ready', 'live'].includes(d.status) ? <button className="mini" onClick={() => open(d.id)}>Rejoindre</button> : null}
          </div>
        ))}
      {pickOpen && <div className="sheet" onClick={() => setPickOpen(false)}>
        <div onClick={e => e.stopPropagation()} className="u-maxh-85dvh u-oy-auto">
          <h1>Qui veux-tu défier ?</h1>
          <div className="sub u-mb-14" >Il reçoit ta demande dans l'appli et a 24 h pour accepter</div>
          <div className="avgrid u-gtc-repeat3-1fr" >
            {mates.map(c => <div key={c.id} className="avpick u-br-16 u-p-6 u-ta-center"  onClick={() => challenge(c.id)}>
              <Avatar value={c.avatar} name={c.display} size={58} /><div className="u-fs-12 u-mt-4">{c.display}</div></div>)}
          </div>
        </div>
      </div>}
    </div>
  )
}

function DuelInvite({ d, token, close, open, toast }) {
  const respond = async ok => {
    try { const r = await rpc('daraja_duel_respond', { p_token: token, p_duel: d.id, p_accept: ok }); close(); if (r.ok && ok) open(d.id); else if (!r.ok) toast('Défi expiré') } catch { toast('Erreur') }
  }
  const ready = d.status === 'ready' || d.status === 'live'
  return (
    <div className="sheet center" onClick={close}>
      <div className="lvup pop" onClick={e => e.stopPropagation()}>
        <i className="ti ti-swords acc u-fs-44"  />
        <div className="u-m-10px-0 u-d-flex u-jc-center"><Avatar value={d.other_avatar} name={d.other} size={64} /></div>
        <h1 className="u-fs-24">{ready ? d.other + ' est prêt !' : d.other + ' te défie !'}</h1>
        <div className="sub u-mb-16" >{ready ? 'Rejoins la salle : le duel démarre dès que vous êtes deux' : 'Duel en direct · 5 questions · +' + RV.duel_win + ' au gagnant'}</div>
        {ready ? <button className="btn" onClick={() => { close(); open(d.id) }}>Rejoindre</button> : <>
          <button className="btn" onClick={() => respond(true)}>Accepter</button>
          <button className="btn ghost u-mt-8"  onClick={() => respond(false)}>Refuser</button>
        </>}
        <button className="btn ghost u-mt-8 u-bd-0"  onClick={close}>Plus tard</button>
      </div>
    </div>
  )
}

function LiveDuel({ token, id, back, toast, refresh, open }) {
  const [st, setSt] = useState(null)
  const [mine, setMine] = useState({})
  const [, tick] = useState(0)
  const off = React.useRef(0)
  const celebrated = React.useRef(false)
  const load = useCallback(() => rpc('daraja_duel_state', { p_token: token, p_duel: id }).then(s => { off.current = s.now - Date.now() / 1000; setSt(s) }).catch(() => {}), [token, id])
  useEffect(() => {
    load()
    const a = setInterval(load, 1000), b = setInterval(() => tick(x => x + 1), 200)
    return () => { clearInterval(a); clearInterval(b) }
  }, [load])
  useEffect(() => { if (st?.status === 'done' && !celebrated.current) { celebrated.current = true; if (st.winner) { burst(90); sfx('win') } refresh() } if (st?.status === 'live') sfx('duel') }, [st?.status])
  if (!st) return <div className="page sub">Connexion au duel…</div>
  const now = Date.now() / 1000 + off.current
  const Head = () => (
    <div className="duelhead">
      <div><Avatar value={st.me.avatar} name={st.me.display} size={42} me /><div className="sub">Toi</div></div>
      <b className="big acc">{st.my_score}<span className="sub u-fs-22" > – </span>{st.their_score}</b>
      <div><Avatar value={st.other.avatar} name={st.other.display} size={42} /><div className="sub">{st.other.display}</div></div>
    </div>
  )
  const rematch = async () => {
    try {
      const r = await rpc('daraja_duel_rematch', { p_token: token, p_duel: id })
      if (r.ok) { toast('Revanche envoyée ⚔️'); open(r.id) }
      else toast({ pair: 'Déjà 2 duels aujourd\'hui ensemble : revanche demain', limit: '3 défis lancés par jour maximum', open: 'Un duel est déjà en cours avec cette personne' }[r.error] || 'Impossible')
    } catch { toast('Erreur') }
  }
  const cancel = async () => { try { await rpc('daraja_duel_cancel', { p_token: token, p_duel: id }); back() } catch { toast('Erreur') } }
  const respond = async ok => { try { await rpc('daraja_duel_respond', { p_token: token, p_duel: id, p_accept: ok }); ok ? load() : back() } catch { toast('Erreur') } }

  if (['declined', 'expired', 'cancelled'].includes(st.status)) return (
    <div className="page u-ta-center u-pt-70" >
      <i className="ti ti-mood-sad acc u-fs-56"  />
      <h1>{{ declined: 'Défi refusé', expired: 'Défi expiré', cancelled: 'Duel annulé' }[st.status]}</h1>
      <button className="btn u-mt-20"  onClick={back}>Retour</button>
    </div>
  )
  const left = st.expires ? Math.max(0, st.expires - now) : null
  const leftTxt = left == null ? '' : left >= 3600 ? Math.floor(left / 3600) + ' h ' + String(Math.floor(left % 3600 / 60)).padStart(2, '0') : Math.ceil(left / 60) + ' min'
  const first = st.other.display.split(' ')[0]
  const nudge = st.other.phone && <a className="btn wa u-mt-10"  href={waLink(st.other.phone, `Salut ${first} ! Je t'attends pour un duel sur Daraja ⚔️ ${location.origin}`)} target="_blank" rel="noreferrer"><i className="ti ti-brand-whatsapp" /> Préviens {first}</a>
  const versus = (
    <div className="vs">
      <div className="vsside"><Avatar value={st.me.avatar} name={st.me.display} size={84} me /><b>Toi</b><span className="sub"><span className="online" />prêt</span></div>
      <div className="vsmid">VS</div>
      <div className="vsside"><Avatar value={st.other.avatar} name={st.other.display} size={84} /><b>{first}</b>
        <span className="sub">{st.other.online ? <><span className="online" />là</> : <><span className="waitdot" />{st.status === 'pending' && st.mine ? 'doit accepter' : 'pas encore là'}</>}</span></div>
    </div>
  )
  if (st.status === 'pending') return (
    <div className="page u-ta-center u-pt-40" >
      {versus}
      {st.mine ? <>
        <h1 className="u-m-22px-0-6px">Défi envoyé</h1>
        <div className="sub u-mb-6" >Le duel démarre dès que {first} accepte et que vous êtes là tous les deux.</div>
        {leftTxt && <div className="expire"><i className="ti ti-hourglass" /> Expire dans {leftTxt}</div>}
        {nudge}
        <button className="btn ghost u-mt-10"  onClick={back}>Plus tard</button>
        <button className="btn ghost u-mt-8 u-bd-0 u-c-muted"  onClick={cancel}>Annuler le défi</button>
      </> : <>
        <h1 className="u-m-22px-0-16px">{first} te défie !</h1>
        <button className="btn big" onClick={() => respond(true)}>Accepter</button>
        <button className="btn ghost u-mt-8"  onClick={() => respond(false)}>Refuser</button>
      </>}
    </div>
  )
  if (st.status === 'ready') return (
    <div className="page u-ta-center u-pt-40" >
      {versus}
      <h1 className="u-m-22px-0-6px">{st.other.online ? 'Ça démarre !' : 'Salle d\'attente'}</h1>
      <div className="sub u-mb-6" >{st.other.online ? first + ' est là. Prépare-toi…' : 'Reste ici : le duel démarre dès que ' + first + ' arrive.'}</div>
      {!st.other.online && leftTxt && <div className="expire"><i className="ti ti-hourglass" /> Expire dans {leftTxt}</div>}
      {!st.other.online && nudge}
      <button className="btn ghost u-mt-10"  onClick={back}>Plus tard</button>
      <button className="btn ghost u-mt-8 u-bd-0 u-c-muted"  onClick={cancel}>Annuler le duel</button>
    </div>
  )
  if (st.status === 'done') {
    const w = st.winner
    return (
      <div className="page u-ta-center u-pt-50" >
        <Head />
        <i className={('ti ' + (w === true ? 'ti-trophy' : w === false ? 'ti-mood-smile' : 'ti-scale') + ' acc pop') + ' u-fs-64 u-d-block u-mt-20'}  />
        <h1 className="u-fs-30">{w === true ? 'Victoire !' : w === false ? 'Défaite' : 'Égalité'}</h1>
        <div className="acc u-fw-600 u-mb-20" >{w === true ? '+' + RV.duel_win + ' pièces' : w === false ? 'La revanche t\'attend' : st.my_score > 0 ? '+' + RV.duel_tie + ' pièces chacun' : 'Aucun point'}</div>
        {(st.questions || []).map((q, k) => { const a = (st.answers || [])[k] || {}; return (
          <div key={q.id} className="lb u-fs-13 u-ta-left" >
            <i className={'ti ti-' + (a.me?.ok ? 'circle-check' : 'circle-x')} style={{ color: a.me?.ok ? 'var(--good)' : 'var(--bad)', fontSize: 18 }} />
            <span className="u-flex-1">{q.question}</span>
            <i className={'ti ti-' + (a.them?.ok ? 'circle-check' : 'circle-x')} style={{ color: a.them?.ok ? 'var(--good)' : 'var(--bad)', fontSize: 18 }} />
          </div>) })}
        <button className="btn big u-mt-20"  onClick={rematch}><i className={'ti ' + (w === true ? 'ti-refresh' : 'ti-swords')} /> {w === true ? 'Rejouer contre ' : 'Revanche contre '}{st.other.display}</button>
        <button className="btn ghost u-mt-10"  onClick={back}>Retour aux duels</button>
      </div>
    )
  }
  // live
  const slots = st.slots || []
  if (!slots.length || now < slots[0]) {
    const c = Math.max(1, Math.ceil((slots[0] || now) - now))
    return <div className="page u-ta-center u-pt-50" ><Head /><div className="countdown pop" key={c}>{c}</div><div className="sub">Prépare-toi !</div></div>
  }
  let idx = 0
  slots.forEach((s, k) => { if (now >= s) idx = k })
  const q = (st.questions || [])[idx]
  const lim = (st.limits || [])[idx] || 6
  const end = slots[idx] + lim
  const server = (st.answers || [])[idx] || {}
  const myRes = mine[idx] || (server.me ? { correct: server.me.ok, answer_idx: server.answer_idx, explanation: server.explanation, solution: server.solution } : null)
  const answering = now < end && !myRes
  const play = async (k, a) => {
    if (mine[idx]) return
    setMine(m => ({ ...m, [idx]: { pending: true } }))
    try {
      const r = await rpc('daraja_duel_play', { p_token: token, p_duel: id, p_idx: idx, p_choice: k ?? -1, p_answer: a ?? null })
      if (r.ok) { setMine(m => ({ ...m, [idx]: r })); if (r.correct) { burst(25); buzz(20); sfx('good') } else { buzz(120); sfx('bad') } load() }
      else setMine(m => ({ ...m, [idx]: { correct: false, late: true } }))
    } catch { setMine(m => { const n = { ...m }; delete n[idx]; return n }) }
  }
  const nextIn = Math.max(0, Math.ceil((slots[idx + 1] || (end + 4)) - now))
  const cls = k => !myRes || myRes.pending ? '' : k === (myRes.answer_idx ?? server.answer_idx) ? 'ok' : ''
  return (
    <div className="page">
      <Head />
      <div className="sub u-ta-center u-m-6px-0-10px" >Manche {idx + 1}/{slots.length}{q ? ' · ' + q.theme : ''}</div>
      {!q ? <div className="sub u-ta-center" >…</div> : <>
        {answering ? <Timer key={'t' + idx} q={{ limit: lim }} deadline={(end - off.current) * 1000} onEnd={() => {}} stopped={false} /> : <div className="timer"><div className="tbar" /></div>}
        {q.kind === 'image' && <div className="card qimg"><img src={imgSrc(q.payload?.img)} alt="" width="130" height="130" /></div>}
        {q.kind === 'scene' ? <div className="bubble-in">{q.question}</div> : <div className="u-fs-18 u-fw-600 u-lh-1_35 u-mb-12">{q.question}</div>}
        {q.kind === 'order' ? <OrderGame key={'o' + idx} q={q} res={myRes || (!answering ? {} : null)} onAnswer={play} />
          : q.kind === 'match' ? <MatchGame key={'m' + idx} q={q} res={myRes || (!answering ? {} : null)} onAnswer={play} />
          : q.kind === 'tf' ? <div className="row u-gap-10 u-mt-10" >
              <button className={'btn tfb no ' + cls(1)} disabled={!answering} onClick={() => play(1)}><i className="ti ti-x" /> Faux</button>
              <button className={'btn tfb yes ' + cls(0)} disabled={!answering} onClick={() => play(0)}><i className="ti ti-check" /> Vrai</button></div>
          : (q.options || []).map((o, k) => <button key={k} className={'opt ' + cls(k)} disabled={!answering} onClick={() => play(k)}>{o}</button>)}
        {!answering && <div className="card rise u-fs-14 u-mt-10" >
          <div className="row between u-mb-6" >
            <span><b style={{ color: myRes?.correct ? 'var(--good)' : 'var(--bad)' }}>{myRes?.pending ? '…' : myRes?.correct ? 'Toi : bonne réponse' : myRes ? 'Toi : raté' : 'Toi : temps écoulé'}</b></span>
            <span className="sub">{server.them ? (server.them.ok ? st.other.display + ' ✓' : st.other.display + ' ✗') : now < end ? st.other.display + ' réfléchit…' : st.other.display + ' ⏱'}</span>
          </div>
          {(myRes?.explanation || server.explanation) && <div className="sub">{myRes?.explanation || server.explanation}</div>}
          <div className="sub u-mt-6" >{idx + 1 < slots.length ? 'Manche suivante dans ' + nextIn + ' s' : 'Résultat dans ' + nextIn + ' s'}</div>
        </div>}
      </>}
    </div>
  )
}

export { DuelCard, DSTATUS, Duels, DuelInvite, LiveDuel }
