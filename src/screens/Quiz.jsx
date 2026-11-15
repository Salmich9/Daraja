import React, { useEffect, useState } from 'react'
import { RV, ROLES, sfx, burst, buzz, flyPoints, imgSrc, rpc, waLink } from '../lib'
import { LevelBadge } from '../ui'

function OrderGame({ q, onAnswer, res }) {
  const [picked, setPicked] = useState([])
  const words = q.payload?.words || []
  const left = words.map((w, i) => ({ w, i })).filter(x => !picked.includes(x.i))
  useEffect(() => {
    if (!res && picked.length === words.length && words.length) onAnswer(null, picked.map(i => words[i]))
  }, [picked])
  return (
    <>
      <div className="slot">{picked.map(i => <span key={i} className="wchip in" onClick={() => !res && setPicked(picked.filter(x => x !== i))}>{words[i]}</span>)}</div>
      {res && !res.correct && res.solution && <div className="sub" style={{ marginBottom: 8 }}>Bonne phrase : <b className="acc">{res.solution.join(' ').replace(/ ([?,.!])/g, '$1')}</b></div>}
      <div>{left.map(x => <span key={x.i} className="wchip" onClick={() => !res && setPicked([...picked, x.i])}>{x.w}</span>)}</div>
      {!res && picked.length > 0 && <div className="sub" style={{ marginTop: 8 }}>Touche un mot placé pour le retirer</div>}
    </>
  )
}

function MatchGame({ q, onAnswer, res }) {
  const pairs = q.payload?.pairs || []
  const [right] = useState(() => pairs.map((p, i) => i).sort(() => Math.random() - 0.5))
  const [L, setL] = useState(null)
  const [done, setDone] = useState([])
  const [bad, setBad] = useState(null)
  const [mistakes, setMistakes] = useState(0)
  const tryPair = (l, r) => {
    if (l === r) {
      const nd = [...done, l]; setDone(nd); setL(null); buzz(15)
      if (nd.length === pairs.length) onAnswer(null, { mistakes })
    } else {
      setMistakes(mistakes + 1); setBad([l, r]); buzz(60); setTimeout(() => { setBad(null); setL(null) }, 450)
    }
  }
  return (
    <>
      {pairs.map((p, i) => (
        <div key={i} className="mrow">
          <span className={'mchip' + (done.includes(i) ? ' ok' : L === i ? ' sel' : '') + (bad && bad[0] === i ? ' shake bad' : '')}
            onClick={() => !res && !done.includes(i) && setL(i)}>{p[0]}</span>
          <span className={'mchip' + (done.includes(right[i]) ? ' ok' : '') + (bad && bad[1] === right[i] ? ' shake bad' : '')}
            onClick={() => !res && L !== null && !done.includes(right[i]) && tryPair(L, right[i])}>{pairs[right[i]][1]}</span>
        </div>
      ))}
      {!res && <div className="sub" style={{ textAlign: 'center', marginTop: 6 }}>Touche à gauche, puis sa paire à droite · {mistakes} erreur{mistakes > 1 ? 's' : ''}</div>}
    </>
  )
}

const QMODES = {
  daily: { load: t => rpc('daraja_quiz', { p_token: t }), start: (t, q) => rpc('daraja_q_start', { p_token: t, p_question: q }), answer: (t, q, c, a) => rpc('daraja_answer_v2', { p_token: t, p_question: q, p_choice: c, p_answer: a }) },
  test: { load: (t, x) => rpc('daraja_test_quiz', { p_token: t, p_venue: x.venue, p_post: x.post, p_kind: x.kind || null }), start: async () => ({ elapsed: 0 }), answer: (t, q, c, a) => rpc('daraja_test_answer', { p_token: t, p_question: q, p_choice: c, p_answer: a }) },
}

function Timer({ q, deadline, onEnd, stopped }) {
  const [left, setLeft] = useState(() => Math.max(0, deadline - Date.now()))
  useEffect(() => {
    if (stopped) return
    let raf, fired = false
    const tick = () => {
      const l = Math.max(0, deadline - Date.now()); setLeft(l)
      if (l <= 0 && !fired) { fired = true; onEnd(); return }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [deadline, stopped])
  const total = (q.limit || 6) * 1000
  const pct = Math.max(0, Math.min(100, (left / total) * 100))
  const sec = Math.ceil(left / 1000)
  const lastTick = React.useRef(null)
  useEffect(() => { if (!stopped && sec > 0 && sec <= 3 && lastTick.current !== sec) { lastTick.current = sec; sfx('tick') } }, [sec, stopped])
  return (
    <div className={'timer' + (sec <= 2 && !stopped ? ' hot' : '')}>
      <div className="tbar"><div style={{ width: pct + '%' }} /></div>
      <span>{stopped ? '' : sec + ' s'}</span>
    </div>
  )
}

function Quiz({ token, me, done, mode = 'daily', ctx = {}, onEnd }) {
  const M = QMODES[mode]
  const [data, setData] = useState(null)
  const [i, setI] = useState(0)
  const [res, setRes] = useState(null)
  const [pick, setPick] = useState(null)
  const [score, setScore] = useState(0)
  const [pts, setPts] = useState(0)
  const [combo, setCombo] = useState(0)
  const [err, setErr] = useState('')
  const [shake, setShake] = useState(false)
  const [bonus, setBonus] = useState(0)
  const [deadline, setDeadline] = useState(null)
  const [round, setRound] = useState(0)
  const busy = React.useRef(false)

  useEffect(() => {
    setData(null); setScore(0); setPts(0); setI(0)
    M.load(token, ctx).then(d => {
      setData(d)
      setScore(d.correct || 0)
      setPts(d.today_points || 0)
      ;(d.questions || []).forEach(q => { if (q.kind === 'image' && q.payload?.img) { const im = new Image(); im.src = imgSrc(q.payload.img) } })
      const first = (d.questions || []).findIndex(q => !(d.answered || []).includes(q.id))
      setI(first === -1 ? (d.questions || []).length : first)
    }).catch(() => setErr('Impossible de charger le défi'))
  }, [token, mode, ctx.duel, round])
  const qs = data?.questions || []
  const q = qs[i]
  useEffect(() => {
    if (!q || res) return
    setDeadline(null)
    M.start(token, q.id, ctx).then(r => setDeadline(Date.now() + ((q.limit || 6) - (r?.elapsed || 0)) * 1000)).catch(() => setDeadline(Date.now() + (q.limit || 6) * 1000))
  }, [q?.id])
  useEffect(() => { if (data && i >= qs.length && qs.length && score >= 4) setTimeout(() => { burst(60); sfx('win') }, 200) }, [i, data])

  if (err) return <div className="page" style={{ textAlign: 'center', paddingTop: 60 }}><div className="err">{err}</div><button className="btn" style={{ marginTop: 14 }} onClick={() => { setErr(''); setRes(null); setPick(null); setRound(r => r + 1) }}>Recharger</button><button className="btn ghost" style={{ marginTop: 10 }} onClick={done}>Retour</button></div>
  if (!data) return <div className="page sub">Le barman prépare tes questions…</div>
  if (!qs.length) return <div className="page"><h1>Défi</h1><div className="sub">Pas encore de questions.</div><button className="btn ghost" style={{ marginTop: 16 }} onClick={done}>Retour</button></div>

  if (i >= qs.length) return (
    <div className="page" style={{ textAlign: 'center', paddingTop: 60 }}>
      <i className={'ti ' + (score >= 4 ? 'ti-trophy' : score >= 2 ? 'ti-thumb-up' : 'ti-mood-smile') + ' acc pop'} style={{ fontSize: 64 }} />
      <h1 style={{ fontSize: 34 }}>{score}/{qs.length}</h1>
      {mode === 'daily' && <>
        <div className="acc" style={{ fontSize: 20, fontWeight: 600, margin: '6px 0' }}>+{pts + bonus} pièces</div>
        {bonus > 0 && <div className="sub">dont +3 de présence{bonus > 3 ? ' et +' + (bonus - 3) + ' de série' : ''} · +1 ticket</div>}
      </>}
      {mode === 'test' && <div className="sub" style={{ margin: '6px 0' }}>Mode test : rien n'est enregistré</div>}
      <div className="sub" style={{ margin: '8px 0 22px' }}>{score === qs.length ? 'Sans faute. Respect.' : score >= 3 ? 'Belle soirée en vue !' : 'Demain, on remet ça. Chaque erreur t\'apprend quelque chose.'}</div>
      {mode === 'test' && <button className="btn" style={{ marginBottom: 10 }} onClick={() => setRound(round + 1)}>Encore un quiz test</button>}
      <button className={mode === 'test' ? 'btn ghost' : 'btn'} onClick={() => { onEnd && onEnd(); done() }}>Retour</button>
      {mode === 'daily' && <TalkCard token={token} me={me} />}
    </div>
  )

  const kind = q.kind || 'qcm'
  const answer = async (k, ans) => {
    if (res || busy.current) return
    busy.current = true
    setPick(k)
    try {
      const r = await M.answer(token, q.id, k ?? -1, ans ?? null, ctx)
      setRes(r)
      if (r.score != null) setScore(r.score); else if (r.correct) setScore(s => s + 1)
      if (r.today_points != null) setPts(r.today_points)
      if (r.streak_bonus > 0) setTimeout(() => flyPoints('+' + r.streak_bonus + ' série'), 900)
      if (r.presence > 0 || r.streak_bonus > 0) setBonus((r.presence || 0) + (r.streak_bonus || 0))
      if (r.correct) { const c = combo + 1; setCombo(c); sfx(c >= 3 ? 'combo' : 'good'); burst(c >= 3 ? 50 : 28); if (mode === 'daily') flyPoints('+' + r.points); buzz(20) }
      else { setCombo(0); setShake(true); sfx(r.timeout || k === -1 ? 'late' : 'bad'); buzz(120); setTimeout(() => setShake(false), 450) }
    } catch { setErr('Erreur réseau, réessaie') }
    busy.current = false
  }
  const timeout = () => answer(-1, null)
  const next = () => { setRes(null); setPick(null); setDeadline(null); setI(i + 1) }
  const optClass = k => res ? (k === res.answer_idx && kind !== 'order' && kind !== 'match' ? 'ok' : k === pick ? 'ko' : '') : (k === pick ? 'sel' : '')
  const ready = deadline != null

  return (
    <div className="page" style={res ? { paddingBottom: 260 } : null}>
      <div className="row between sub" style={{ marginBottom: 8 }}>
        <span>{mode === 'test' ? 'Test' : 'Manche'} {i + 1}/{qs.length} · {q.theme}</span>
        {combo >= 2 ? <span className="combo pop"><i className="ti ti-bolt" /> Combo x{combo}</span> : <LevelBadge level={q.level} />}
      </div>
      {ready ? <Timer key={q.id} q={q} deadline={deadline} onEnd={timeout} stopped={!!res} /> : <div className="timer"><div className="tbar" /></div>}

      {!ready ? <div className="sub" style={{ textAlign: 'center', marginTop: 40 }}>Prêt ?</div> :
      <div className={shake ? 'shake' : ''}>
        {kind === 'tf' && <>
          <div className="card tfcard rise">
            <i className="ti ti-glass-cocktail acc" style={{ fontSize: 30 }} />
            <div style={{ fontSize: 18, lineHeight: 1.45, marginTop: 10 }}>{q.question}</div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <button className={'btn tfb no ' + optClass(1)} onClick={() => answer(1)}><i className="ti ti-x" /> Faux</button>
            <button className={'btn tfb yes ' + optClass(0)} onClick={() => answer(0)}><i className="ti ti-check" /> Vrai</button>
          </div>
        </>}

        {kind === 'image' && <>
          <div className="card qimg rise"><img src={imgSrc(q.payload?.img)} alt="" width="150" height="150" decoding="async" /></div>
          <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.35, margin: '4px 0 12px' }}>{q.question}</div>
          {q.options.map((o, k) => <button key={k} className={'opt ' + optClass(k)} onClick={() => answer(k)}>
            {res && k === res.answer_idx && <i className="ti ti-check" style={{ color: 'var(--good)', marginRight: 6 }} />}{o}</button>)}
        </>}

        {kind === 'scene' && <>
          <div className="bubble-in rise">{q.question}</div>
          <div className="sub" style={{ margin: '14px 0 8px' }}>Ta meilleure réplique ?</div>
          {q.options.map((o, k) => <button key={k} className={'opt reply ' + optClass(k)} onClick={() => answer(k)}>{o}</button>)}
        </>}

        {kind === 'price' && <>
          <div style={{ fontSize: 19, fontWeight: 600, marginBottom: 14 }}><i className="ti ti-scale acc" /> {q.question}</div>
          <div className="grid2">
            {q.options.map((o, k) => <button key={k} className={'opt pricecard ' + optClass(k)} onClick={() => answer(k)}>{o}</button>)}
          </div>
        </>}

        {kind === 'order' && <>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}><i className="ti ti-language acc" /> {q.question}</div>
          <OrderGame key={q.id} q={q} res={res} onAnswer={answer} />
        </>}

        {kind === 'match' && <>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}><i className="ti ti-arrows-shuffle acc" /> {q.question}</div>
          <MatchGame key={q.id} q={q} res={res} onAnswer={answer} />
        </>}

        {kind === 'qcm' && <>
          <div style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.4, marginBottom: 18 }}>{q.question}</div>
          {q.options.map((o, k) => <button key={k} className={'opt ' + optClass(k)} onClick={() => answer(k)}>
            {res && k === res.answer_idx && <i className="ti ti-check" style={{ color: 'var(--good)', marginRight: 6 }} />}{o}
          </button>)}
        </>}
      </div>}

      {res && (() => {
        const late = !res.correct && (res.timeout || pick === -1)
        const good = kind === 'tf' ? ['Vrai', 'Faux'][res.answer_idx] : q.options?.[res.answer_idx]
        const showGood = !res.correct && good != null && kind !== 'order' && kind !== 'match'
        return <div className={'fb ' + (res.correct ? 'win' : 'lose')}>
          <div className="fbhead">
            <span className="fbic"><i className={'ti ' + (res.correct ? 'ti-check' : late ? 'ti-stopwatch' : 'ti-x')} /></span>
            <b>{res.correct ? 'Bien joué !' : late ? 'Temps écoulé !' : 'Raté !'}</b>
            {res.correct && mode === 'daily' && <span className="fbpts">+{res.points || RV.answer}</span>}
          </div>
          {showGood && <div className="fbgood">Bonne réponse : <b>{good}</b></div>}
          {res.explanation && <div className="fbtxt">{res.explanation}</div>}
          <button className="btn fbbtn" onClick={next}>{i + 1 < qs.length ? 'Continuer' : 'Voir mon score'}</button>
        </div>
      })()}
    </div>
  )
}

const REASONS = [
  ['Discuter d\'un sujet', 'j\'aimerais discuter d\'un sujet avec vous'],
  ['Demander un entretien', 'j\'aimerais avoir un entretien avec vous'],
  ['Débattre d\'une réponse', 'j\'aimerais débattre d\'une réponse du défi Daraja d\'aujourd\'hui'],
  ['Proposer une idée', 'j\'ai une idée à vous proposer'],
  ['Signaler un souci', 'j\'aimerais vous parler d\'un souci'],
  ['Autre', 'j\'aimerais vous parler de quelque chose'],
]

function TalkCard({ token, me }) {
  const [contacts, setContacts] = useState([])
  const [why, setWhy] = useState(0)
  useEffect(() => { rpc('daraja_contacts', { p_token: token }).then(setContacts).catch(() => {}) }, [token])
  if (!contacts.length) return null
  const msg = c => `Bonjour${c.name ? ' ' + c.name.split(' ')[0] : ''}, c'est ${me.name} (${me.venue_name}). ${REASONS[why][1].charAt(0).toUpperCase() + REASONS[why][1].slice(1)}. Est-ce qu'on peut en parler quand vous avez un moment ? Merci`
  return (
    <div className="card rise" style={{ textAlign: 'left', marginTop: 22 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}><i className="ti ti-message-circle acc" /> Envie d'en parler ?</div>
      <div className="chips">{REASONS.map((r, k) => <button key={k} className={'chip ' + (why === k ? 'on' : '')} onClick={() => setWhy(k)}>{r[0]}</button>)}</div>
      {ROLES.filter(([k]) => contacts.find(c => c.role === k)).map(([k, label, ic]) => {
        const c = contacts.find(x => x.role === k)
        return <a key={k} className="who" href={waLink(c.phone, msg(c))} target="_blank" rel="noreferrer">
          <i className={'ti ti-' + ic + ' acc'} /><span style={{ flex: 1 }}>{label}{c.name ? ' · ' + c.name : ''}</span><i className="ti ti-brand-whatsapp wa-ic" />
        </a>
      })}
      <div className="sub" style={{ marginTop: 6 }}>WhatsApp s'ouvre avec le message prêt : il reste à envoyer.</div>
    </div>
  )
}

export { OrderGame, MatchGame, QMODES, Timer, Quiz, REASONS, TalkCard }
