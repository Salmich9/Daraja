import React, { useEffect, useState, useCallback } from 'react'
import { RV, burst, buzz, imgSrc, rpc } from '../lib'
import { Avatar, Info } from '../ui'
import { MatchGame, OrderGame, Timer } from './Quiz'

function DuelCard({ duels, go, open }) {
  const list = duels || []
  const inc = list.find(d => d.status === 'pending' && !d.mine)
  const live = list.find(d => d.status === 'ready' || d.status === 'live')
  const t = live ? (live.status === 'live' ? 'Ton duel contre ' + live.other + ' est en cours' : live.other + ' est prêt, rejoins le duel') : inc ? inc.other + ' te défie !' : 'Défie un collègue'
  return (
    <div className={'card duelcard rise' + (inc || live ? ' hot' : '')} onClick={() => (live || inc) ? open((live || inc).id) : go('duels')} style={{ cursor: 'pointer' }}>
      <div className="row" style={{ gap: 12 }}>
        <i className="ti ti-swords" style={{ fontSize: 30 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>{t}</div>
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
      else toast({ limit: '3 défis lancés par jour maximum', open: 'Un duel est déjà en cours avec cette personne', pair: 'Un seul duel par jour avec la même personne', role: 'Réservé aux équipiers', questions: 'Pas assez de questions actives' }[r.error] || 'Impossible')
    } catch { toast('Erreur') }
  }
  const respond = async (id, ok) => {
    try { const r = await rpc('daraja_duel_respond', { p_token: token, p_duel: id, p_accept: ok }); if (r.ok && ok) open(id); else { toast(ok ? 'Défi expiré' : 'Défi refusé'); reload() } } catch { toast('Erreur') }
  }
  const list = duels || []
  return (
    <div className="page">
      <div className="row between" style={{ position: 'relative' }}>
        <h1>Duels</h1>
        <Info text={`Tu envoies un défi. Ton collègue a 24 h pour accepter. Ensuite, vous vous retrouvez dans la salle et le duel démarre en direct : mêmes questions au même moment, ${RV.time} secondes chacune. Le plus de bonnes réponses gagne +${RV.duel_win} pièces ; à égalité, le plus rapide. 3 défis lancés par jour maximum. Touche pour fermer.`} />
      </div>
      <button className="btn pulse" style={{ margin: '12px 0 6px' }} onClick={() => setPickOpen(true)}><i className="ti ti-swords" /> Défier un collègue</button>
      {!duels ? <div className="sub">Chargement…</div> : !list.length ? <div className="sub" style={{ marginTop: 12 }}>Aucun duel pour l'instant. Lance le premier !</div> :
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
        <div onClick={e => e.stopPropagation()} style={{ maxHeight: '85dvh', overflowY: 'auto' }}>
          <h1>Qui veux-tu défier ?</h1>
          <div className="sub" style={{ marginBottom: 14 }}>Il reçoit ta demande dans l'appli et a 24 h pour accepter</div>
          <div className="avgrid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {mates.map(c => <div key={c.id} className="avpick" style={{ borderRadius: 16, padding: 6, textAlign: 'center' }} onClick={() => challenge(c.id)}>
              <Avatar value={c.avatar} name={c.display} size={58} /><div style={{ fontSize: 12, marginTop: 4 }}>{c.display}</div></div>)}
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
        <i className="ti ti-swords acc" style={{ fontSize: 44 }} />
        <div style={{ margin: '10px 0', display: 'flex', justifyContent: 'center' }}><Avatar value={d.other_avatar} name={d.other} size={64} /></div>
        <h1 style={{ fontSize: 24 }}>{ready ? d.other + ' est prêt !' : d.other + ' te défie !'}</h1>
        <div className="sub" style={{ marginBottom: 16 }}>{ready ? 'Rejoins la salle : le duel démarre dès que vous êtes deux' : 'Duel en direct · 5 questions · +' + RV.duel_win + ' au gagnant'}</div>
        {ready ? <button className="btn" onClick={() => { close(); open(d.id) }}>Rejoindre</button> : <>
          <button className="btn" onClick={() => respond(true)}>Accepter</button>
          <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => respond(false)}>Refuser</button>
        </>}
        <button className="btn ghost" style={{ marginTop: 8, border: 0 }} onClick={close}>Plus tard</button>
      </div>
    </div>
  )
}

function LiveDuel({ token, id, back, toast, refresh }) {
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
  useEffect(() => { if (st?.status === 'done' && !celebrated.current) { celebrated.current = true; if (st.winner) burst(90); refresh() } }, [st?.status])
  if (!st) return <div className="page sub">Connexion au duel…</div>
  const now = Date.now() / 1000 + off.current
  const Head = () => (
    <div className="duelhead">
      <div><Avatar value={st.me.avatar} name={st.me.display} size={42} me /><div className="sub">Toi</div></div>
      <b className="big acc">{st.my_score}<span className="sub" style={{ fontSize: 22 }}> – </span>{st.their_score}</b>
      <div><Avatar value={st.other.avatar} name={st.other.display} size={42} /><div className="sub">{st.other.display}</div></div>
    </div>
  )
  const cancel = async () => { try { await rpc('daraja_duel_cancel', { p_token: token, p_duel: id }); back() } catch { toast('Erreur') } }
  const respond = async ok => { try { await rpc('daraja_duel_respond', { p_token: token, p_duel: id, p_accept: ok }); ok ? load() : back() } catch { toast('Erreur') } }

  if (['declined', 'expired', 'cancelled'].includes(st.status)) return (
    <div className="page" style={{ textAlign: 'center', paddingTop: 70 }}>
      <i className="ti ti-mood-sad acc" style={{ fontSize: 56 }} />
      <h1>{{ declined: 'Défi refusé', expired: 'Défi expiré', cancelled: 'Duel annulé' }[st.status]}</h1>
      <button className="btn" style={{ marginTop: 20 }} onClick={back}>Retour</button>
    </div>
  )
  if (st.status === 'pending') return (
    <div className="page" style={{ textAlign: 'center', paddingTop: 50 }}>
      <Head />
      {st.mine ? <>
        <div className="sub" style={{ margin: '24px 0' }}><span className="waitdot" /> Défi envoyé à {st.other.display}. Reste ici : le duel démarre dès qu'il accepte et vous êtes deux.</div>
        <button className="btn ghost" onClick={back}>Plus tard</button>
        <button className="btn ghost" style={{ marginTop: 8, border: 0, color: 'var(--muted)' }} onClick={cancel}>Annuler le défi</button>
      </> : <>
        <h1 style={{ margin: '24px 0 16px' }}>{st.other.display} te défie !</h1>
        <button className="btn" onClick={() => respond(true)}>Accepter</button>
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => respond(false)}>Refuser</button>
      </>}
    </div>
  )
  if (st.status === 'ready') return (
    <div className="page" style={{ textAlign: 'center', paddingTop: 50 }}>
      <Head />
      <h1 style={{ marginTop: 24 }}>Salle d'attente</h1>
      <div className="sub" style={{ margin: '10px 0 24px' }}>{st.other.online ? <><span className="online" /> {st.other.display} est là, ça démarre…</> : <><span className="waitdot" /> En attente de {st.other.display}. Le duel démarre dès que vous êtes deux.</>}</div>
      <button className="btn ghost" onClick={back}>Plus tard</button>
      <button className="btn ghost" style={{ marginTop: 8, border: 0, color: 'var(--muted)' }} onClick={cancel}>Annuler le duel</button>
    </div>
  )
  if (st.status === 'done') {
    const w = st.winner
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: 50 }}>
        <Head />
        <i className={'ti ' + (w === true ? 'ti-trophy' : w === false ? 'ti-mood-smile' : 'ti-scale') + ' acc pop'} style={{ fontSize: 64, display: 'block', marginTop: 20 }} />
        <h1 style={{ fontSize: 30 }}>{w === true ? 'Victoire !' : w === false ? 'Défaite' : 'Égalité'}</h1>
        <div className="acc" style={{ fontWeight: 600, marginBottom: 20 }}>{w === true ? '+' + RV.duel_win + ' pièces' : w === false ? 'La revanche t\'attend' : st.my_score > 0 ? '+' + RV.duel_tie + ' pièces chacun' : 'Aucun point'}</div>
        {(st.questions || []).map((q, k) => { const a = (st.answers || [])[k] || {}; return (
          <div key={q.id} className="lb" style={{ fontSize: 13, textAlign: 'left' }}>
            <i className={'ti ti-' + (a.me?.ok ? 'circle-check' : 'circle-x')} style={{ color: a.me?.ok ? 'var(--good)' : 'var(--bad)', fontSize: 18 }} />
            <span style={{ flex: 1 }}>{q.question}</span>
            <i className={'ti ti-' + (a.them?.ok ? 'circle-check' : 'circle-x')} style={{ color: a.them?.ok ? 'var(--good)' : 'var(--bad)', fontSize: 18 }} />
          </div>) })}
        <button className="btn" style={{ marginTop: 20 }} onClick={back}>Retour aux duels</button>
      </div>
    )
  }
  // live
  const slots = st.slots || []
  if (!slots.length || now < slots[0]) {
    const c = Math.max(1, Math.ceil((slots[0] || now) - now))
    return <div className="page" style={{ textAlign: 'center', paddingTop: 50 }}><Head /><div className="countdown pop" key={c}>{c}</div><div className="sub">Prépare-toi !</div></div>
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
      if (r.ok) { setMine(m => ({ ...m, [idx]: r })); if (r.correct) { burst(25); buzz(20) } else buzz(120); load() }
      else setMine(m => ({ ...m, [idx]: { correct: false, late: true } }))
    } catch { setMine(m => { const n = { ...m }; delete n[idx]; return n }) }
  }
  const nextIn = Math.max(0, Math.ceil((slots[idx + 1] || (end + 4)) - now))
  const cls = k => !myRes || myRes.pending ? '' : k === (myRes.answer_idx ?? server.answer_idx) ? 'ok' : ''
  return (
    <div className="page">
      <Head />
      <div className="sub" style={{ textAlign: 'center', margin: '6px 0 10px' }}>Manche {idx + 1}/{slots.length}{q ? ' · ' + q.theme : ''}</div>
      {!q ? <div className="sub" style={{ textAlign: 'center' }}>…</div> : <>
        {answering ? <Timer key={'t' + idx} q={{ limit: lim }} deadline={(end - off.current) * 1000} onEnd={() => {}} stopped={false} /> : <div className="timer"><div className="tbar" /></div>}
        {q.kind === 'image' && <div className="card qimg"><img src={imgSrc(q.payload?.img)} alt="" width="130" height="130" /></div>}
        {q.kind === 'scene' ? <div className="bubble-in">{q.question}</div> : <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.35, marginBottom: 12 }}>{q.question}</div>}
        {q.kind === 'order' ? <OrderGame key={'o' + idx} q={q} res={myRes || (!answering ? {} : null)} onAnswer={play} />
          : q.kind === 'match' ? <MatchGame key={'m' + idx} q={q} res={myRes || (!answering ? {} : null)} onAnswer={play} />
          : q.kind === 'tf' ? <div className="row" style={{ gap: 10, marginTop: 10 }}>
              <button className={'btn tfb no ' + cls(1)} disabled={!answering} onClick={() => play(1)}><i className="ti ti-x" /> Faux</button>
              <button className={'btn tfb yes ' + cls(0)} disabled={!answering} onClick={() => play(0)}><i className="ti ti-check" /> Vrai</button></div>
          : (q.options || []).map((o, k) => <button key={k} className={'opt ' + cls(k)} disabled={!answering} onClick={() => play(k)}>{o}</button>)}
        {!answering && <div className="card rise" style={{ fontSize: 14, marginTop: 10 }}>
          <div className="row between" style={{ marginBottom: 6 }}>
            <span><b style={{ color: myRes?.correct ? 'var(--good)' : 'var(--bad)' }}>{myRes?.pending ? '…' : myRes?.correct ? 'Toi : bonne réponse' : myRes ? 'Toi : raté' : 'Toi : temps écoulé'}</b></span>
            <span className="sub">{server.them ? (server.them.ok ? st.other.display + ' ✓' : st.other.display + ' ✗') : now < end ? st.other.display + ' réfléchit…' : st.other.display + ' ⏱'}</span>
          </div>
          {(myRes?.explanation || server.explanation) && <div className="sub">{myRes?.explanation || server.explanation}</div>}
          <div className="sub" style={{ marginTop: 6 }}>{idx + 1 < slots.length ? 'Manche suivante dans ' + nextIn + ' s' : 'Résultat dans ' + nextIn + ' s'}</div>
        </div>}
      </>}
    </div>
  )
}

export { DuelCard, DSTATUS, Duels, DuelInvite, LiveDuel }
