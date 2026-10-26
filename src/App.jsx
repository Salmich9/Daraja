import React, { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_KEY } from './config.js'

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
const TK = 'daraja_token', VK = 'daraja_venue'
const store = {
  get: k => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch {} },
}

const MOCK = import.meta.env.VITE_MOCK === '1'
async function rpc(fn, args = {}) {
  if (MOCK) return (await import('./mock.js')).default(fn, args)
  const { data, error } = await sb.rpc(fn, args)
  if (error) throw error
  return data
}

const LEVELS = [
  [0, 'Commis'], [200, 'Serveur'], [500, 'Vendeur'], [1000, 'Vendeur confirmé'],
  [2000, 'Expert'], [4000, 'Ambassadeur'], [7000, 'Légende'],
]
function level(earned) {
  let i = 0
  while (i < LEVELS.length - 1 && earned >= LEVELS[i + 1][0]) i++
  const next = LEVELS[i + 1]
  return { n: i + 1, name: LEVELS[i][1], from: LEVELS[i][0], to: next ? next[0] : null }
}
const initials = n => n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()
const fmt = n => (n ?? 0).toLocaleString('fr-FR')
const LV = { 1: ['Facile', 'lv1'], 2: ['Confirmé', 'lv2'], 3: ['Expert', 'lv3'] }
function LevelBadge({ level }) {
  const [name, cls] = LV[level] || LV[1]
  return <span className={'lv ' + cls}><span className="lvdots">{[1, 2, 3].map(n => <i key={n} className={n <= level ? 'on' : ''} />)}</span>{name} · +{10 * (level || 1)}</span>
}


const AV_SEEDS = ['Shaker', 'Glacon', 'Citron', 'Olive', 'Safran', 'Zama', 'Momo', 'Tonic']
const AV_LIB = ['fun-emoji', 'bottts', 'big-smile', 'croodles'].flatMap(st => AV_SEEDS.map(sd => st + ':' + sd))
let avMod = null
const avReady = import('./avatars.js').then(m => { avMod = m; return m })
function Avatar({ value, name, size = 34, me: isMe }) {
  const [, force] = useState(0)
  useEffect(() => { if (!avMod && value) avReady.then(() => force(x => x + 1)) }, [value])
  const svg = avMod ? avMod.render(value) : null
  return (
    <div className={'av' + (isMe ? ' meav' : '')} style={{ width: size, height: size, fontSize: Math.round(size / 2.6) }}>
      {svg ? <span className="avsvg" dangerouslySetInnerHTML={{ __html: svg }} /> : initials(name || '?')}
    </div>
  )
}
const ROLES = [['manager', 'Manager', 'user-star'], ['directeur', 'Directeur', 'crown'], ['chef_cuisine', 'Chef cuisine', 'chef-hat'], ['chef_mixo', 'Chef mixologue', 'glass-cocktail']]
const waLink = (phone, text) => 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text)

function Info({ text }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="info" aria-label="Info" onClick={() => setOpen(o => !o)}><i className="ti ti-info-circle" /></button>
      {open && <div className="bubble" style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 4, marginTop: 6 }} onClick={() => setOpen(false)}>{text}</div>}
    </>
  )
}

function Toast({ msg }) { return msg ? <div className="toast">{msg}</div> : null }

function Login({ onToken }) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const press = async d => {
    if (busy) return
    setErr('')
    const p = (pin + d).slice(0, 4)
    setPin(p)
    if (p.length === 4) {
      setBusy(true)
      try {
        const r = await rpc('daraja_login', { p_pin: p })
        if (r?.token) onToken(r.token)
        else if (r?.locked) { setErr('Trop d\'essais, réessaie dans 10 min'); setPin('') }
        else { setErr('Code incorrect'); setPin('') }
      } catch { setErr('Connexion impossible'); setPin('') }
      setBusy(false)
    }
  }
  return (
    <div className="page" style={{ paddingTop: 70, textAlign: 'center' }}>
      <i className="ti ti-flask-2 acc" style={{ fontSize: 40 }} />
      <h1 style={{ fontSize: 32 }}>Daraja</h1>
      <div className="sub">Ton code à 4 chiffres</div>
      <div className="dots">{[0, 1, 2, 3].map(i => <span key={i} className={i < pin.length ? 'f' : ''} />)}</div>
      <div className="err">{err}</div>
      <div className="pad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => <button key={d} onClick={() => press(String(d))}>{d}</button>)}
        <span />
        <button onClick={() => press('0')}>0</button>
        <button aria-label="Effacer" onClick={() => setPin(pin.slice(0, -1))} style={{ border: 0, background: 'none' }}><i className="ti ti-backspace" /></button>
      </div>
    </div>
  )
}

function burst(n = 30) {
  const host = document.getElementById('fx')
  if (!host) return
  const cols = ['#F2B544', '#7BE0B5', '#FF7A59', '#2BB39A', '#D9480F', '#F2C230', '#FF9A5A']
  for (let i = 0; i < n; i++) {
    const d = document.createElement('i')
    d.className = 'conf'
    d.style.left = Math.random() * 100 + '%'
    d.style.background = cols[i % cols.length]
    d.style.animationDelay = Math.random() * 0.25 + 's'
    d.style.transform = `rotate(${Math.random() * 360}deg)`
    host.appendChild(d)
    setTimeout(() => d.remove(), 1700)
  }
}
function flyPoints(text) {
  const host = document.getElementById('fx')
  if (!host) return
  const d = document.createElement('div')
  d.className = 'flypts'
  d.textContent = text
  host.appendChild(d)
  setTimeout(() => d.remove(), 1300)
}
function buzz(ms = 30) { try { navigator.vibrate && navigator.vibrate(ms) } catch {} }

function QuoteSplash({ token, me, close }) {
  const [q, setQ] = useState(null)
  const [k, setK] = useState(0)
  useEffect(() => { rpc('daraja_quote', { p_token: token, p_random: false }).then(setQ).catch(() => close()) }, [token])
  const day = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const icon = { proverbe: 'ti-leaf', citation: 'ti-quote', histoire: 'ti-book-2', motivation: 'ti-rocket', encouragement: 'ti-heart-handshake' }
  return (
    <div className="page splash">
      <div className="sub" style={{ textTransform: 'capitalize', letterSpacing: '.5px' }}>{day} · le mot du jour</div>
      {q && <div key={k} className="rise">
        <i className={'ti ' + (icon[q.kind] || 'ti-quote') + ' acc'} style={{ fontSize: 36, display: 'block', margin: '28px 0 10px' }} />
        <div className="qbody">{q.kind === 'histoire' ? q.body : '« ' + q.body + ' »'}</div>
        {q.author && <div className="sub" style={{ marginTop: 12 }}>{q.author}</div>}
      </div>}
      <div style={{ marginTop: 'auto' }}>
        <button className="btn" onClick={close}>C'est parti, {me.name.split(' ')[0]}</button>
      </div>
    </div>
  )
}

function LevelRing({ earned, size = 66 }) {
  const lv = level(earned)
  const pct = lv.to ? (earned - lv.from) / (lv.to - lv.from) : 1
  const r = size / 2 - 6, c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="7" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--acc)" strokeWidth="7" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="ringbar" />
      <text x="50%" y="55%" textAnchor="middle" fill="var(--fg)" fontSize="15" fontWeight="600">N{lv.n}</text>
    </svg>
  )
}

function nextGift(rewards, pts) {
  const sorted = [...rewards].sort((a, b) => a.cost - b.cost)
  return sorted.find(r => r.cost > pts) || sorted[sorted.length - 1]
}

function GiftProgress({ r, pts, onClick }) {
  if (!r) return null
  const pct = Math.min(100, Math.round((pts / r.cost) * 100))
  const left = Math.max(0, r.cost - pts)
  const near = pct >= 80 && left > 0
  return (
    <div className={'card gp ' + (near ? 'near' : '') + (left === 0 ? ' ready' : '')} onClick={onClick}>
      <div className="row between">
        <span><i className={'ti ti-' + r.icon + ' acc'} /> {r.name}</span>
        <span className="acc" style={{ fontWeight: 600, fontSize: 13 }}>{left === 0 ? 'À toi !' : near ? 'Presque !' : pct + ' %'}</span>
      </div>
      <div className="bar" style={{ height: 9, margin: '9px 0 6px' }}><div style={{ width: pct + '%', height: 9 }} /></div>
      <div className="sub">{left === 0 ? 'Touche pour l\'échanger' : <>Plus que <b className="acc">{fmt(left)} pts</b>{left <= 90 ? ' : un quiz parfait et c\'est à toi' : ''}</>}</div>
    </div>
  )
}

function Home({ token, me, venue, go }) {
  const [rewards, setRewards] = useState([])
  useEffect(() => { rpc('daraja_rewards', { p_token: token, p_venue: venue }).then(setRewards).catch(() => {}) }, [token, venue])
  const lv = level(me.earned)
  return (
    <div className="page">
      <div className="row between" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 10, cursor: 'pointer' }} onClick={() => go('profile')}>
          <Avatar value={me.avatar} name={me.display} size={46} me />
          <div><div className="sub">{me.venue_name}</div><h1 style={{ margin: 0 }}>Salut {me.display.split(' ')[0]}</h1></div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <i className={'ti ti-flame flame ' + (['out', 'new'].includes(me.flame) ? 'off' : me.flame)} />
          <div className="sub">{me.streak} jour{me.streak > 1 ? 's' : ''}</div>
        </div>
      </div>
      {me.flame === 'danger' && <div className="card danger rise"><b><i className="ti ti-flame" /> Flamme en danger</b><div className="sub">Tu n'as pas joué hier. Joue aujourd'hui pour sauver tes {me.streak} jours.</div></div>}
      {me.flame === 'out' && <div className="card rise" style={{ border: '1px solid var(--line)' }}><b><i className="ti ti-snowflake" style={{ color: '#85B7EB' }} /> Flamme éteinte</b><div className="sub">Rallume-la aujourd'hui : chaque jour de série rapporte un bonus qui grandit.</div></div>}
      <div className="card row" style={{ gap: 14, cursor: 'pointer' }} onClick={() => go('profile')}>
        <LevelRing earned={me.earned} />
        <div>
          <div className="big acc" style={{ fontSize: 28 }}>{fmt(me.points)}</div>
          <div className="sub">{lv.name}{me.role === 'staff' ? ' · ' + (me.rank === 1 ? '1er' : me.rank + 'e') + ' du mois' : ''}</div>
        </div>
      </div>
      <div className="card" style={{ position: 'relative' }}>
        <div className="row between">
          <div><div style={{ fontSize: 17, fontWeight: 600 }}>Défi du jour</div><div className="sub">5 manches · jusqu'à +90 pts{!me.quiz_done && me.next_bonus > 5 ? ' · bonus série +' + me.next_bonus : ''}</div></div>
          <Info text="Chaque jour : vrai ou faux, scènes client, anglais, associations… 2 manches faciles, 2 confirmées, 1 experte. Chaque jour de série ajoute +5 pts de bonus (jusqu'à +100). Un jour manqué : la flamme est en danger. Deux jours : elle s'éteint. Touche pour fermer." />
        </div>
        <div className="row" style={{ gap: 6, margin: '12px 0 14px' }}>
          {[1, 1, 2, 2, 3].map((l, i) => <span key={i} className={'ddot l' + l} />)}
        </div>
        {me.quiz_done
          ? <button className="btn ghost" onClick={() => go('quiz')}><i className="ti ti-check" /> Défi relevé, à demain</button>
          : <button className="btn pulse" onClick={() => go('quiz')}>Jouer <i className="ti ti-player-play" /></button>}
      </div>
      <GiftProgress r={nextGift(rewards, me.points)} pts={me.points} onClick={() => go('shop')} />
      {me.role === 'staff' && <MissionCard token={token} />}
      {me.role === 'staff' && <DrawCard token={token} me={me} venue={venue} />}
      <div className="card row" style={{ gap: 12, cursor: 'pointer' }} onClick={() => go('stories')}>
        <i className="ti ti-book-2 acc" style={{ fontSize: 28 }} />
        <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>L'histoire du jour</div><div className="sub">Partis de zéro, arrivés au sommet</div></div>
        <i className="ti ti-chevron-right sub" />
      </div>
    </div>
  )
}

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

function Quiz({ token, me, done }) {
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

  useEffect(() => {
    rpc('daraja_quiz', { p_token: token }).then(d => {
      setData(d)
      setScore(d.correct || 0)
      setPts(d.today_points || 0)
      const first = (d.questions || []).findIndex(q => !(d.answered || []).includes(q.id))
      setI(first === -1 ? (d.questions || []).length : first)
    }).catch(() => setErr('Impossible de charger le défi'))
  }, [token])
  useEffect(() => { if (data && i >= (data.questions || []).length && score >= 4) setTimeout(() => burst(60), 200) }, [i, data])

  if (err) return <div className="page"><div className="err">{err}</div></div>
  if (!data) return <div className="page sub">Le barman prépare tes questions…</div>
  const qs = data.questions || []
  if (!qs.length) return <div className="page"><h1>Défi du jour</h1><div className="sub">Pas encore de questions.</div></div>

  if (i >= qs.length) return (
    <div className="page" style={{ textAlign: 'center', paddingTop: 60 }}>
      <i className={'ti ' + (score >= 4 ? 'ti-trophy' : score >= 2 ? 'ti-thumb-up' : 'ti-mood-smile') + ' acc pop'} style={{ fontSize: 64 }} />
      <h1 style={{ fontSize: 34 }}>{score}/{qs.length}</h1>
      <div className="acc" style={{ fontSize: 20, fontWeight: 600, margin: '6px 0' }}>+{pts + bonus} points</div>
      {bonus > 0 && <div className="sub">dont +3 de présence{bonus > 3 ? ' et +' + (bonus - 3) + ' de série' : ''}</div>}
      <div className="sub" style={{ marginBottom: 22 }}>{score === qs.length ? 'Sans faute. Respect.' : score >= 3 ? 'Belle soirée en vue !' : 'Demain, on remet ça. Chaque erreur t\'apprend quelque chose.'}</div>
      <button className="btn" onClick={done}>Retour</button>
      <TalkCard token={token} me={me} />
    </div>
  )

  const q = qs[i]
  const kind = q.kind || 'qcm'
  const answer = async (k, ans) => {
    if (res) return
    setPick(k)
    try {
      const r = await rpc('daraja_answer_v2', { p_token: token, p_question: q.id, p_choice: k ?? -1, p_answer: ans ?? null })
      setRes(r)
      if (r.score != null) setScore(r.score)
      if (r.today_points != null) setPts(r.today_points)
      if (r.streak_bonus > 0) setTimeout(() => flyPoints('+' + r.streak_bonus + ' série'), 900)
      if (r.presence > 0 || r.streak_bonus > 0) setBonus((r.presence || 0) + (r.streak_bonus || 0))
      if (r.correct) { const c = combo + 1; setCombo(c); burst(c >= 3 ? 50 : 28); flyPoints('+' + r.points); buzz(20) }
      else if (r.correct === false) { setCombo(0); setShake(true); buzz(120); setTimeout(() => setShake(false), 450) }
    } catch { setErr('Erreur réseau, réessaie') }
  }
  const next = () => { setRes(null); setPick(null); setI(i + 1) }
  const optClass = k => res ? (k === res.answer_idx && kind !== 'order' && kind !== 'match' ? 'ok' : k === pick ? 'ko' : '') : (k === pick ? 'sel' : '')

  return (
    <div className="page">
      <div className="row between sub" style={{ marginBottom: 8 }}>
        <span>Manche {i + 1}/{qs.length} · {q.theme}</span>
        {combo >= 2 ? <span className="combo pop"><i className="ti ti-bolt" /> Combo x{combo}</span> : <LevelBadge level={q.level} />}
      </div>
      <div className="bar" style={{ marginBottom: 18 }}><div style={{ width: `${(i / qs.length) * 100}%` }} /></div>

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
      </div>

      {res && <div className="rise">
        <div className="card" style={{ fontSize: 14, lineHeight: 1.45, marginTop: 12 }}>
          <b style={{ color: res.correct ? 'var(--good)' : 'var(--bad)' }}>{res.correct ? 'Bien joué ! +' + (res.points || 10) : 'Raté, mais retiens bien :'}</b>
          {res.explanation ? ' ' + res.explanation : ''}
        </div>
        <button className="btn" onClick={next}>{i + 1 < qs.length ? 'Manche suivante' : 'Voir mon score'}</button>
      </div>}
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

function ProfileEdit({ token, me, close, done }) {
  const [alias, setAlias] = useState(me.alias || '')
  const [av, setAv] = useState(me.avatar || AV_LIB[0])
  const [err, setErr] = useState('')
  const save = async () => {
    if (alias.trim().length > 24) { setErr('24 caractères maximum'); return }
    try {
      const r = await rpc('daraja_set_profile', { p_token: token, p_alias: alias, p_avatar: av })
      if (r.ok) done(); else setErr('Vérifie ton alias')
    } catch { setErr('Erreur, réessaie') }
  }
  return (
    <div className="sheet" onClick={close}>
      <div onClick={e => e.stopPropagation()} style={{ maxHeight: '88dvh', overflowY: 'auto' }}>
        <div style={{ textAlign: 'center' }}><Avatar value={av} name={me.name} size={86} me /></div>
        <div className="sub" style={{ margin: '14px 0 6px' }}>Mon alias (visible au classement)</div>
        <input value={alias} maxLength={24} placeholder={me.name} onChange={e => { setAlias(e.target.value); setErr('') }} />
        <div className="sub" style={{ marginBottom: 10 }}>Nom complet gardé par la direction : {me.name}</div>
        <div className="avgrid">
          {AV_LIB.map(v => <div key={v} className={'avpick ' + (v === av ? 'on' : '')} onClick={() => setAv(v)}><Avatar value={v} name="" size={56} /></div>)}
        </div>
        <div className="err">{err}</div>
        <button className="btn" onClick={save}>Enregistrer</button>
      </div>
    </div>
  )
}

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

const TIERS = [['plaisir', 'Petits plaisirs'], ['temps', 'Du temps pour toi'], ['bon', 'Bons et cadeaux'], ['experience', 'Expériences'], ['gros', 'Gros lots']]
function Shop({ token, me, venue, refresh, toast }) {
  const [items, setItems] = useState(null)
  const [sel, setSel] = useState(null)
  const [claim, setClaim] = useState(null)
  const [contacts, setContacts] = useState([])
  const load = useCallback(() => rpc('daraja_rewards', { p_token: token, p_venue: venue }).then(setItems).catch(() => setItems([])), [token, venue])
  useEffect(() => { rpc('daraja_contacts', { p_token: token, p_venue: venue }).then(setContacts).catch(() => {}) }, [token, venue])
  useEffect(() => { load() }, [load])
  const buy = async () => {
    try {
      const r = await rpc('daraja_redeem', { p_token: token, p_reward: sel.id })
      if (r.ok) { setClaim(sel); burst(60); refresh(); load() }
      else toast(r.error === 'blocked' ? 'Boutique bloquée suite à une faute grave' : r.error === 'conditions' ? 'Une condition n\'est pas encore remplie' : r.error === 'stock' ? 'Plus en stock' : 'Pas assez de points')
    } catch { toast('Erreur, réessaie') }
    setSel(null)
  }
  const mgr = contacts.find(c => c.role === 'manager') || contacts.find(c => c.role === 'directeur')
  const card = r => {
    const unmet = (r.checks || []).filter(c => !c.ok)
    const ok = me.points >= r.cost
    const pct = Math.max(0, Math.min(100, Math.round((me.points / r.cost) * 100)))
    const near = !ok && pct >= 80
    return (
      <div key={r.id} className={'card gift ' + (ok && !unmet.length ? 'ready' : near ? 'near' : 'locked')} onClick={() => setSel(r)}>
        {near && <span className="tag">Presque !</span>}
        {ok && !unmet.length && <span className="tag">Dispo</span>}
        <i className={'ti ti-' + r.icon + ' acc'} />
        <div style={{ fontSize: 14, margin: '6px 0', minHeight: 36 }}>{r.name}</div>
        <div className="bar" style={{ margin: '0 0 6px' }}><div style={{ width: pct + '%' }} /></div>
        <div className={ok || near ? 'acc' : 'sub'} style={{ fontWeight: 600, fontSize: 13 }}>{ok ? fmt(r.cost) + ' pts' : 'encore ' + fmt(r.cost - me.points)}</div>
        {unmet.length > 0 && <div className="lockline"><i className="ti ti-lock" /> {unmet.length} condition{unmet.length > 1 ? 's' : ''}</div>}
        {r.stock != null && r.stock <= 3 && <div className="sub" style={{ fontSize: 11 }}>Plus que {r.stock}</div>}
      </div>
    )
  }
  const tiers = items ? [...TIERS, [null, 'Autres']].map(([k, l]) => [l, items.filter(r => k ? r.tier === k : !TIERS.find(t => t[0] === r.tier))]).filter(([, l]) => l.length) : []
  return (
    <div className="page">
      <div className="row between" style={{ marginBottom: 6 }}>
        <h1>Boutique</h1>
        <div className="acc" style={{ fontWeight: 600 }}>{fmt(me.points)} pts</div>
      </div>
      {!items ? <div className="sub">Chargement…</div> : tiers.map(([l, list]) => (
        <div key={l}>
          <div className="sec">{l}</div>
          <div className="grid2">{list.map(card)}</div>
        </div>
      ))}
      {claim && <div className="sheet" onClick={() => setClaim(null)}>
        <div onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
          <i className={'ti ti-' + claim.icon + ' acc pop'} style={{ fontSize: 48 }} />
          <h1>Gagné !</h1>
          <div className="sub" style={{ marginBottom: 18 }}>{claim.name} · ton manager a été prévenu dans l'appli</div>
          {mgr && <a className="btn wa" href={waLink(mgr.phone, `Bonjour${mgr.name ? ' ' + mgr.name.split(' ')[0] : ''} ! J'ai gagné le cadeau « ${claim.name} » sur Daraja (${fmt(claim.cost)} pts). Quand est-ce que je peux le récupérer ? ${me.name}, ${me.venue_name}`)} target="_blank" rel="noreferrer"><i className="ti ti-brand-whatsapp" /> Réclamer sur WhatsApp</a>}
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setClaim(null)}>Plus tard</button>
        </div>
      </div>}
      {sel && (() => {
        const unmet = (sel.checks || []).filter(c => !c.ok)
        const enough = me.points >= sel.cost
        return <div className="sheet" onClick={() => setSel(null)}>
          <div onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <i className={'ti ti-' + sel.icon + ' acc'} style={{ fontSize: 40 }} />
            <h1>{sel.name}</h1>
            <div className="sub" style={{ marginBottom: 10 }}>{fmt(sel.cost)} points · le manager te le remet</div>
            {(sel.checks || []).map(c => (
              <div key={c.key} className="cond">
                <i className={'ti ti-' + (c.ok ? 'circle-check' : 'circle-x')} style={{ color: c.ok ? 'var(--good)' : 'var(--bad)', fontSize: 18 }} />
                <span style={{ flex: 1 }}>{c.label}{c.key === 'days' && !c.ok ? ' · ' + c.have + '/' + c.need : ''}</span>
              </div>
            ))}
            <div style={{ height: 14 }} />
            {enough && !unmet.length ? <button className="btn" onClick={buy}>Échanger</button>
              : <div className="sub" style={{ marginBottom: 6 }}>{!enough ? 'Plus que ' + fmt(sel.cost - me.points) + ' pts' : 'Encore un petit effort sur les conditions'}</div>}
            <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setSel(null)}>Fermer</button>
          </div>
        </div>
      })()}
    </div>
  )
}

function Profile({ token, me, logout, toast, refresh }) {
  const lv = level(me.earned)
  const [avis, setAvis] = useState(false)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState(false)
  const pct = lv.to ? Math.round(((me.earned - lv.from) / (lv.to - lv.from)) * 100) : 100
  const badges = [
    ['flame', 'Série 7', me.streak >= 7], ['target', 'Sans faute', me.perfect >= 1],
    ['star', 'Cité en avis', me.avis >= 1], ['gift', '1er cadeau', me.gifts >= 1],
    ['bolt', 'Expert', me.earned >= 2000], ['crown', 'Légende', me.earned >= 7000],
    ['shield-check', 'Exemplaire', me.exemplary],
  ]
  const send = async () => {
    if (!note.trim()) { setErr('Colle le lien ou décris l\'avis'); return }
    try { await rpc('daraja_report_review', { p_token: token, p_note: note.trim() }); toast('Envoyé au manager'); setAvis(false); setNote('') }
    catch { setErr('Erreur, réessaie') }
  }
  return (
    <div className="page">
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ display: 'inline-block', position: 'relative', cursor: 'pointer' }} onClick={() => setEdit(true)}>
          <Avatar value={me.avatar} name={me.display} size={86} me />
          <span className="editdot"><i className="ti ti-pencil" /></span>
        </div>
        <h1 style={{ marginTop: 8 }}>{me.display}</h1>
        {me.alias && <div className="sub">{me.name}</div>}
        <div className="acc" style={{ fontSize: 14 }}>Niveau {lv.n} · {lv.name}</div>
      </div>
      <div className="card">
        <div className="row between" style={{ fontSize: 13, marginBottom: 8 }}>
          <span>{lv.to ? `Vers niveau ${lv.n + 1}` : 'Niveau max'}</span>
          <span className="acc">{fmt(me.earned)}{lv.to ? ' / ' + fmt(lv.to) : ''}</span>
        </div>
        <div className="bar"><div style={{ width: pct + '%' }} /></div>
      </div>
      <div className="sec">Badges</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {badges.map(([ic, l, on]) => <div key={l} className={'badge ' + (on ? '' : 'off')}><div><i className={'ti ti-' + (on ? ic : 'lock')} /></div>{l}</div>)}
      </div>
      <div className="card row" style={{ gap: 12, marginTop: 12 }}>
        <i className={'ti ti-flame flame ' + (['out', 'new'].includes(me.flame) ? 'off' : me.flame)} style={{ fontSize: 36 }} />
        <div><div style={{ fontWeight: 600 }}>{me.streak} jour{me.streak > 1 ? 's' : ''} de série</div>
          <div className="sub">Prochain défi : bonus série +{me.next_bonus} pts{me.next_bonus >= 100 ? ' (max)' : ''}</div></div>
      </div>
      {me.role === 'staff' && <MyConduct token={token} toast={toast} refresh={refresh} />}
      {edit && <ProfileEdit token={token} me={me} close={() => setEdit(false)} done={() => { setEdit(false); refresh(); toast('Profil mis à jour') }} />}
      <button className="btn ghost" style={{ marginTop: 24 }} onClick={() => setAvis(true)}><i className="ti ti-star" /> Un client m'a cité dans un avis</button>
      <button className="btn ghost" style={{ marginTop: 10, color: 'var(--muted)' }} onClick={logout}><i className="ti ti-logout" /> Me déconnecter</button>
      {avis && <div className="sheet" onClick={() => setAvis(false)}>
        <div onClick={e => e.stopPropagation()}>
          <h1>Avis client</h1>
          <div className="sub" style={{ marginBottom: 12 }}>+100 pts après validation du manager</div>
          <textarea rows={3} placeholder="Lien Google ou Tripadvisor" value={note} onChange={e => { setNote(e.target.value); setErr('') }} />
          <div className="err">{err}</div>
          <button className="btn" onClick={send}>Envoyer</button>
        </div>
      </div>}
    </div>
  )
}

function Admin({ token, me, venue, toast }) {
  const [d, setD] = useState(null)
  const [pts, setPts] = useState(null)
  const [add, setAdd] = useState(false)
  const [tab, setTab] = useState('team')
  const [missions, setMissions] = useState({})
  const v = me.venue
  const load = useCallback(() => rpc('daraja_admin', { p_token: token, p_venue: venue }).then(setD).catch(() => setD({ reviews: [], gifts: [], staff: [] })), [token, venue])
  useEffect(() => { load() }, [load])
  useEffect(() => { rpc('daraja_admin_missions', { p_token: token, p_venue: venue }).then(setMissions).catch(() => {}) }, [token, venue])
  const act = async (fn, args, msg) => { try { await rpc(fn, { p_token: token, ...args }); toast(msg); load() } catch { toast('Erreur') } }
  if (!d) return <div className="page sub">Chargement…</div>
  const T = [['team', 'Équipe'], ['report', 'Rapports'], ['att', 'Pointage'], ['conduct', 'Conduite' + (me.direction_todo ? ' · ' + me.direction_todo : '')],
    ['quiz', 'Questions'], ['draw', 'Tirage'], ...(me.role === 'super' ? [['gifts', 'Cadeaux']] : [])]
  return (
    <div className="page">
      <div className="row between" style={{ marginBottom: 6 }}>
        <h1>Admin</h1>
        <button className="mini" onClick={() => setAdd(true)}><i className="ti ti-user-plus" /> Équipier</button>
      </div>
      <div className="sub">{me.venue_name}</div>
      <div className="tabs">{T.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'conduct' && <Conduct token={token} me={me} venue={venue} staff={d.staff} toast={toast} />}
      {tab === 'report' && <Reports token={token} me={me} venue={v} toast={toast} />}
      {tab === 'att' && <Attendance token={token} venue={v} toast={toast} />}
      {tab === 'quiz' && <QuizSettings token={token} venue={v} toast={toast} />}
      {tab === 'draw' && <DrawAdmin token={token} me={me} venue={v} toast={toast} />}
      {tab === 'gifts' && <RewardsAdmin token={token} toast={toast} />}
      {tab === 'team' && <>
      <div className="sec"><i className="ti ti-star acc" /> Avis clients à valider</div>
      {!d.reviews.length && <div className="sub">Rien en attente</div>}
      {d.reviews.map(r => (
        <div key={r.id} className="lb">
          <div style={{ flex: 1, minWidth: 0 }}><div>{r.name}</div><div className="sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.note}</div></div>
          <button className="mini" onClick={() => act('daraja_admin_review', { p_event: r.id, p_ok: true }, '+100 pts validés')}>+100</button>
          <button className="mini ghost" aria-label="Refuser" onClick={() => act('daraja_admin_review', { p_event: r.id, p_ok: false }, 'Refusé')}><i className="ti ti-x" /></button>
        </div>
      ))}

      <div className="sec"><i className="ti ti-gift acc" /> Cadeaux à remettre</div>
      {!d.gifts.length && <div className="sub">Rien en attente</div>}
      {d.gifts.map(g => (
        <div key={g.id} className="lb">
          <span style={{ flex: 1 }}>{g.name} · {g.note}</span>
          <button className="mini" onClick={() => act('daraja_admin_deliver', { p_event: g.id }, 'Marqué remis')}>Remis</button>
        </div>
      ))}

      <ContactsAdmin token={token} venue={venue} toast={toast} />
      <div className="sec"><i className="ti ti-users acc" /> Équipe · poste, mission, bonus</div>
      {d.staff.map(s => (
        <div key={s.id} className="lb" style={{ cursor: 'pointer' }} onClick={() => setPts(s)}>
          <Avatar value={s.avatar} name={s.name} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div>{s.name}{s.role === 'admin' && <span className="sub"> · manager</span>}</div>
            <div className="sub">{s.post_label || 'Poste à définir'}{s.mission_done ? ' · mission ✓' : ''}{!s.phone ? ' · sans numéro' : ''}</div>
          </div>
          <span className="acc">{fmt(s.points)}</span>
          <i className="ti ti-chevron-right sub" />
        </div>
      ))}
      </>}
      {pts && <StaffSheet token={token} s={pts} mission={missions[pts.family]} close={() => setPts(null)} act={act} toast={toast} reload={load} />}
      {add && <AddStaff token={token} me={me} venue={venue} close={() => setAdd(false)} done={() => { setAdd(false); load(); toast('Équipier ajouté') }} />}
    </div>
  )
}


const LINE = { blanche: ['Blanche', 'lb-w'], grise: ['Grise', 'lb-g'], rouge: ['Rouge', 'lb-r'] }
const Pill = ({ line }) => <span className={'pill ' + (LINE[line] || LINE.blanche)[1]}>{(LINE[line] || LINE.blanche)[0]}</span>
const dshort = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })

function MyConduct({ token, toast, refresh }) {
  const [c, setC] = useState(null)
  const load = useCallback(() => rpc('daraja_conduct_mine', { p_token: token }).then(setC).catch(() => setC(null)), [token])
  useEffect(() => { load() }, [load])
  if (!c) return null
  const ack = async id => { try { await rpc('daraja_conduct_ack', { p_token: token, p_record: id }); toast('Pris en compte'); load(); refresh() } catch { toast('Erreur') } }
  return (
    <>
      <div className="sec" style={{ position: 'relative' }}>Ma conduite <Info text="Visible par toi et ta direction seulement, jamais au classement. Chaque mois sans grise ni rouge te rapporte +100 points." /></div>
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="sub">Jours sans faute</div>
        <div className="big acc">{c.days_clean}</div>
      </div>
      <div className="grid3">
        <div className="card" style={{ textAlign: 'center', margin: 0 }}><Pill line="blanche" /><div style={{ fontSize: 20, marginTop: 6 }}>{c.blanche}</div></div>
        <div className="card" style={{ textAlign: 'center', margin: 0 }}><Pill line="grise" /><div style={{ fontSize: 20, marginTop: 6 }}>{c.grise}</div></div>
        <div className="card" style={{ textAlign: 'center', margin: 0 }}><Pill line="rouge" /><div style={{ fontSize: 20, marginTop: 6 }}>{c.rouge}</div></div>
      </div>
      {c.records.map(r => (
        <div key={r.id} className="card" style={{ marginTop: 10, border: r.ack ? 0 : '1px solid var(--acc)' }}>
          <div className="row between"><Pill line={r.line} /><span className="sub">{dshort(r.at)} · −{r.malus}</span></div>
          <div style={{ fontSize: 14, margin: '8px 0 4px' }}>{r.behavior}</div>
          <div className="sub">{r.sanction}{r.escalation ? ' · ' + r.escalation : ''}</div>
          {!r.ack && <button className="btn" style={{ marginTop: 10, padding: 10 }} onClick={() => ack(r.id)}>J'ai pris connaissance</button>}
        </div>
      ))}
    </>
  )
}

function Conduct({ token, me, venue, staff, toast }) {
  const [mode, setMode] = useState('add')
  return (
    <>
      <div className="seg" style={{ marginTop: 14 }}>
        <button className={mode === 'add' ? 'on' : ''} onClick={() => setMode('add')}>Signaler</button>
        <button className={mode === 'reg' ? 'on' : ''} onClick={() => setMode('reg')}>Registre</button>
      </div>
      {mode === 'add' ? <ConductAdd token={token} me={me} staff={staff} toast={toast} done={() => setMode('reg')} /> : <Register token={token} me={me} venue={venue} toast={toast} />}
    </>
  )
}

function ConductAdd({ token, me, staff, toast, done }) {
  const [rules, setRules] = useState([])
  const [who, setWho] = useState('')
  const [dom, setDom] = useState('')
  const [rule, setRule] = useState(null)
  const [prev, setPrev] = useState(null)
  const [facts, setFacts] = useState('')
  const [wit, setWit] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { rpc('daraja_conduct_rules', { p_token: token }).then(setRules).catch(() => setRules([])) }, [token])
  useEffect(() => {
    setPrev(null)
    if (who && rule) rpc('daraja_conduct_preview', { p_token: token, p_staff: who, p_rule: rule.id }).then(setPrev).catch(() => setPrev(null))
  }, [token, who, rule])
  const doms = [...new Set(rules.map(r => r.domain))]
  const team = staff.filter(s => s.id !== me.id)
  const save = async () => {
    if (!who) { setErr('Choisis un équipier'); return }
    if (!rule) { setErr('Choisis un comportement'); return }
    if (facts.trim().length < 3) { setErr('Décris les faits'); return }
    setBusy(true)
    try {
      const r = await rpc('daraja_conduct_add', { p_token: token, p_staff: who, p_rule: rule.id, p_facts: facts, p_witnesses: wit, p_applied: '' })
      if (r.ok) { toast('Inscrit et verrouillé · −' + r.result.malus); done() }
      else setErr(r.error === 'direction' ? 'Réservé à la direction' : 'Vérifie les champs')
    } catch { setErr('Erreur, réessaie') }
    setBusy(false)
  }
  return (
    <>
      <select value={who} onChange={e => { setWho(e.target.value); setErr('') }}>
        <option value="">Équipier…</option>
        {team.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <div className="chips">
        {doms.map(d => <button key={d} className={'chip ' + (dom === d ? 'on' : '')} onClick={() => { setDom(d); setRule(null) }}>{d}</button>)}
      </div>
      {dom && rules.filter(r => r.domain === dom).map(r => (
        <button key={r.id} className={'opt ' + (rule?.id === r.id ? 'sel' : '')} style={{ opacity: r.locked ? .45 : 1 }}
          onClick={() => { if (r.locked) { toast('Réservé à la direction'); return } setRule(r); setErr('') }}>
          <Pill line={r.line} /> {r.locked && <i className="ti ti-lock" />} <span style={{ marginLeft: 4 }}>{r.behavior}</span>
        </button>
      ))}
      {prev && (
        <div className="card" style={{ border: '1px solid var(--acc)' }}>
          <div className="row between" style={{ marginBottom: 6 }}><span className="sub">Calcul automatique</span><Pill line={prev.line} /></div>
          {prev.escalation && <div style={{ fontSize: 13, marginBottom: 4 }}>{prev.escalation}</div>}
          <div style={{ fontSize: 14 }}>{prev.sanction}</div>
          <div style={{ color: 'var(--bad)', fontWeight: 600, fontSize: 14, marginTop: 4 }}>Malus −{prev.malus} pts</div>
          {prev.line === 'rouge' && <div className="sub" style={{ marginTop: 6 }}>Rouge : rapport le jour même, entretien, notification écrite signée.</div>}
        </div>
      )}
      <textarea rows={3} placeholder="Faits constatés (heure, lieu, ce qui s'est passé)" value={facts} onChange={e => { setFacts(e.target.value); setErr('') }} />
      <input placeholder="Témoins (facultatif)" value={wit} onChange={e => setWit(e.target.value)} />
      <div className="err">{err}</div>
      <button className="btn" disabled={busy} onClick={save}><i className="ti ti-lock" /> Valider et verrouiller</button>
    </>
  )
}

function Register({ token, me, venue, toast }) {
  const [list, setList] = useState(null)
  const [open, setOpen] = useState(null)
  const load = useCallback(() => rpc('daraja_conduct_register', { p_token: token, p_venue: venue }).then(setList).catch(() => setList([])), [token, venue])
  useEffect(() => { load() }, [load])
  const notify = async id => { try { await rpc('daraja_conduct_notify', { p_token: token, p_record: id }); toast('Notification enregistrée'); load() } catch { toast('Erreur') } }
  if (!list) return <div className="sub">Chargement…</div>
  if (!list.length) return <div className="sub" style={{ marginTop: 10 }}>Aucune inscription. Bonne nouvelle.</div>
  return list.map(r => (
    <div key={r.id} className="lb" style={{ flexDirection: 'column', alignItems: 'stretch', cursor: 'pointer' }} onClick={() => setOpen(open === r.id ? null : r.id)}>
      <div className="row between">
        <span style={{ fontWeight: 600 }}>{r.staff}</span>
        <span className="row" style={{ gap: 6 }}>
          <Pill line={r.line} />
          {r.needs_direction ? <span className="sub" style={{ color: 'var(--bad)' }}>à notifier</span>
            : r.ack ? <i className="ti ti-checks acc" /> : <i className="ti ti-lock sub" />}
        </span>
      </div>
      <div className="sub" style={{ marginTop: 3 }}>{dshort(r.at)} · {r.behavior}</div>
      {open === r.id && (
        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.5 }}>
          <div><b>Sanction :</b> {r.sanction}{r.escalation ? ' (' + r.escalation + ')' : ''}</div>
          <div><b>Faits :</b> {r.facts}</div>
          {r.witnesses && <div><b>Témoins :</b> {r.witnesses}</div>}
          <div className="sub">Par {r.by} · −{r.malus} pts · {r.ack ? 'lu par le salarié' : 'pas encore lu'}</div>
          {r.line === 'rouge' && !r.notified && me.role === 'super' && <button className="mini" style={{ marginTop: 8 }} onClick={e => { e.stopPropagation(); notify(r.id) }}>Notification signée remise</button>}
        </div>
      )}
    </div>
  ))
}


function ContactsAdmin({ token, venue, toast }) {
  const [c, setC] = useState(null)
  const [open, setOpen] = useState(false)
  useEffect(() => { rpc('daraja_admin_contacts', { p_token: token, p_venue: venue }).then(setC).catch(() => setC({})) }, [token, venue])
  if (!c) return null
  const set = (k, f, v) => setC({ ...c, [k]: { ...(c[k] || {}), [f]: v } })
  const save = async k => {
    try {
      const r = await rpc('daraja_admin_set_contact', { p_token: token, p_venue: venue, p_role: k, p_name: c[k]?.name || '', p_phone: c[k]?.phone || '' })
      toast(r.ok ? 'Contact enregistré' : 'Numéro invalide')
    } catch { toast('Erreur') }
  }
  const n = ROLES.filter(([k]) => c[k]?.phone).length
  return (
    <>
      <div className="sec" style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}><i className="ti ti-brand-whatsapp wa-ic" /> Contacts WhatsApp · {n}/4 <i className={'ti ti-chevron-' + (open ? 'up' : 'down')} /></div>
      {open && ROLES.map(([k, label, ic]) => (
        <div key={k} className="card" style={{ padding: 10 }}>
          <div className="sub" style={{ marginBottom: 6 }}><i className={'ti ti-' + ic} /> {label}</div>
          <input placeholder="Prénom" value={c[k]?.name || ''} onChange={e => set(k, 'name', e.target.value)} />
          <div className="row" style={{ gap: 8 }}>
            <input placeholder="06 12 34 56 78" inputMode="tel" value={c[k]?.phone || ''} onChange={e => set(k, 'phone', e.target.value)} style={{ marginBottom: 0 }} />
            <button className="mini" onClick={() => save(k)}>OK</button>
          </div>
        </div>
      ))}
    </>
  )
}

let postsCache = null
function usePosts(token) {
  const [p, setP] = useState(postsCache || [])
  useEffect(() => { if (!postsCache) rpc('daraja_posts', { p_token: token }).then(x => { postsCache = x; setP(x) }).catch(() => {}) }, [token])
  return p
}
const FAM = { salle: 'Salle', bar: 'Bar', cuisine: 'Cuisine', support: 'Accueil, sécurité et support' }
function PostSelect({ token, value, onChange }) {
  const posts = usePosts(token)
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="">Poste…</option>
      {Object.entries(FAM).map(([f, l]) => <optgroup key={f} label={l}>{posts.filter(p => p.family === f).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</optgroup>)}
    </select>
  )
}

function StaffSheet({ token, s, mission, close, act, toast, reload }) {
  const [post, setPost] = useState(s.post || '')
  const [phone, setPhone] = useState(s.phone || '')
  const [pick, setPick] = useState(null)
  const [note, setNote] = useState('')
  const saveInfo = async () => {
    try {
      const r = await rpc('daraja_admin_update_staff', { p_token: token, p_staff: s.id, p_post: post || null, p_phone: phone })
      if (r?.ok === false) toast(r.error === 'phone' ? 'Numéro invalide' : 'Vérifie les champs'); else { toast('Fiche à jour'); reload() }
    } catch { toast('Erreur') }
  }
  const opts = [[50, 'Bonus 50', 'ti-plus'], [100, 'Bonus 100', 'ti-star'], [200, 'Bonus 200', 'ti-sparkles'], [500, 'Bonus 500', 'ti-trophy']]
  return (
    <div className="sheet" onClick={close}>
      <div onClick={e => e.stopPropagation()} style={{ maxHeight: '88dvh', overflowY: 'auto' }}>
        <div className="row" style={{ marginBottom: 12 }}><Avatar value={s.avatar} name={s.name} size={46} /><div><h1 style={{ margin: 0 }}>{s.name}</h1>{s.alias && <div className="sub">alias : {s.alias}</div>}</div></div>
        <div className="sub" style={{ marginBottom: 6 }}>Poste (choisit ses questions et sa mission)</div>
        <PostSelect token={token} value={post} onChange={setPost} />
        <input placeholder="WhatsApp : 06 12 34 56 78" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} />
        <button className="btn ghost" onClick={saveInfo}>Enregistrer la fiche</button>
        {mission && <div className={'card mission' + (s.mission_done ? ' done' : '')} style={{ marginTop: 14 }}>
          <div className="sub">Mission de la semaine</div>
          <div style={{ fontWeight: 600, margin: '4px 0 10px' }}>{mission}</div>
          {s.mission_done ? <div className="acc"><i className="ti ti-check" /> Validée · +10</div>
            : <button className="mini" onClick={() => { act('daraja_admin_validate_mission', { p_staff: s.id }, 'Mission validée · +10'); close() }}>Valider la mission · +10</button>}
        </div>}
        <div className="sec">Bonus</div>
        <div className="grid2" style={{ marginBottom: 10 }}>
          {opts.map(o => <button key={o[1]} className={'opt ' + (pick === o ? 'sel' : '')} style={{ margin: 0, textAlign: 'center' }} onClick={() => setPick(o)}>
            <i className={'ti ' + o[2]} style={{ color: 'var(--good)' }} /> +{o[0]}</button>)}
        </div>
        {pick && <>
          <input placeholder="Motif (facultatif)" value={note} onChange={e => setNote(e.target.value)} />
          <button className="btn" onClick={() => { act('daraja_admin_points', { p_staff: s.id, p_kind: 'bonus', p_amount: pick[0], p_note: note || pick[1] }, '+' + pick[0] + ' pts · ' + s.name); close() }}>Donner +{pick[0]}</button>
        </>}
        <div className="sub" style={{ marginTop: 10 }}>Pour une faute, passe par l'onglet Conduite</div>
      </div>
    </div>
  )
}

function AddStaff({ token, me, venue, close, done }) {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [role, setRole] = useState('staff')
  const [post, setPost] = useState('')
  const [phone, setPhone] = useState('')
  const [err, setErr] = useState('')
  const save = async () => {
    if (!name.trim()) { setErr('Entre un prénom'); return }
    if (!/^\d{4}$/.test(pin)) { setErr('Le code doit faire 4 chiffres'); return }
    try {
      const r = await rpc('daraja_admin_add_staff2', { p_token: token, p_name: name, p_pin: pin, p_role: role, p_venue: venue || me.venue, p_post: post || null, p_phone: phone })
      if (r.ok) done()
      else setErr(r.error === 'taken' ? 'Code déjà pris, choisis-en un autre' : r.error === 'phone' ? 'Numéro invalide' : 'Vérifie les champs')
    } catch { setErr('Erreur, réessaie') }
  }
  return (
    <div className="sheet" onClick={close}>
      <div onClick={e => e.stopPropagation()} style={{ maxHeight: '88dvh', overflowY: 'auto' }}>
        <h1>Nouvel équipier</h1>
        <div className="sub" style={{ marginBottom: 14 }}>{me.venue_name}</div>
        <input placeholder="Prénom et nom" value={name} onChange={e => { setName(e.target.value); setErr('') }} />
        <input placeholder="Code à 4 chiffres" inputMode="numeric" maxLength={4} value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setErr('') }} />
        <PostSelect token={token} value={post} onChange={setPost} />
        <input placeholder="WhatsApp (facultatif)" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} />
        {me.role === 'super' && <div className="seg">
          <button className={role === 'staff' ? 'on' : ''} onClick={() => setRole('staff')}>Équipier</button>
          <button className={role === 'admin' ? 'on' : ''} onClick={() => setRole('admin')}>Manager</button>
        </div>}
        <div className="err">{err}</div>
        <button className="btn" onClick={save}>Ajouter</button>
      </div>
    </div>
  )
}

function MissionCard({ token }) {
  const [m, setM] = useState(null)
  useEffect(() => { rpc('daraja_mission', { p_token: token }).then(setM).catch(() => {}) }, [token])
  if (!m?.title) return null
  return (
    <div className={'card mission rise' + (m.done ? ' done' : '')} style={{ position: 'relative' }}>
      <div className="row between">
        <span className="sub"><i className="ti ti-target-arrow acc" /> Mission terrain · +10</span>
        <Info text="Une mission par semaine, à réaliser pendant le service. Ton manager la valide quand il t'a vu la faire. Touche pour fermer." />
      </div>
      <div style={{ fontWeight: 600, margin: '6px 0 4px', lineHeight: 1.35 }}>{m.title}</div>
      <div className="sub">{m.done ? <span style={{ color: 'var(--good)' }}><i className="ti ti-check" /> Validée par ton manager</span> : 'Encore ' + m.days_left + ' jour' + (m.days_left > 1 ? 's' : '')}</div>
    </div>
  )
}

function DrawCard({ token, me, venue }) {
  const [d, setD] = useState(null)
  useEffect(() => { rpc('daraja_draw_info', { p_token: token, p_venue: venue }).then(setD).catch(() => {}) }, [token, venue])
  const t = d?.tickets ?? me.tickets ?? 0
  return (
    <div className="card ticket rise" style={{ position: 'relative' }}>
      <div className="row between">
        <div className="row" style={{ gap: 10 }}>
          <i className="ti ti-ticket" style={{ fontSize: 30 }} />
          <div><div style={{ fontWeight: 700, fontSize: 18 }}>{t} ticket{t > 1 ? 's' : ''}</div>
            <div className="sub">Tirage du mois{d ? ' dans ' + d.days_left + ' j' : ''}</div></div>
        </div>
        <Info text="1 ticket par défi terminé, même avec des erreurs. +2 tickets par semaine à l'heure. Plus tu as de tickets, plus tu as de chances. Une ligne grise ou rouge dans le mois exclut du tirage. Touche pour fermer." />
      </div>
      {d?.last && <div className="sub" style={{ marginTop: 8 }}>{d.last.me ? '🎉 Tu as gagné' : 'Dernier gagnant : ' + d.last.winner + ' ·'} {d.last.prize}</div>}
    </div>
  )
}

let storiesMod = null
const daysSince = () => { const a = new Date(); a.setHours(12, 0, 0, 0); return Math.round((a - new Date(2026, 9, 26, 12)) / 864e5) }
const SCAT = { sport: 'Sport', entrepreneur: 'Entrepreneur', restauration: 'Restauration', artiste: 'Artiste', pionnier: 'Pionnier' }
function Stories() {
  const [list, setList] = useState(storiesMod)
  const [back, setBack] = useState(0)
  useEffect(() => { if (!storiesMod) import('./stories.json').then(m => { storiesMod = m.default; setList(m.default) }) }, [])
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

const first = n => (n || '').split(' ')[0]
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
  return `Salut ${n} ! On ne t'a pas vu sur Daraja ${per}. 3 minutes par jour suffisent : même avec des erreurs, tu gagnes des points de présence et des tickets pour le tirage du mois 🎟️ À tout de suite !`
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
    `👥 ${active}/${st.length} actifs · 🎯 ${avg ?? '–'} % de bonnes réponses · ⭐ ${fmt(pts)} pts gagnés`,
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
        <div className="card"><b>{fmt(pts)}</b><span className="sub">points gagnés</span></div>
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
                <div className="sub">{p.days_played} j · {p.acc != null ? p.acc + ' %' : '–'}{p.prev_acc != null && p.acc != null ? ' (' + (p.acc >= p.prev_acc ? '+' : '') + (p.acc - p.prev_acc) + ')' : ''} · {fmt(p.pts)} pts{p.conduct ? ' · ' + p.conduct + ' faute' + (p.conduct > 1 ? 's' : '') : ''}</div>
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

const ATT = [
  ['present', 'Présent', '✓'], ['absent', 'Absent', 'A'], ['conge', 'Congé', 'C'], ['recup', 'Récup', 'R'],
  ['maladie', 'Maladie', 'M'], ['autorise', 'Autorisé', 'Au'], ['repos', 'Repos', 'Rp'],
]
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
const monday = (off = 0) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * off); return d }
function Attendance({ token, venue, toast }) {
  const [off, setOff] = useState(-1)
  const [list, setList] = useState(null)
  const [cell, setCell] = useState(null)
  const mon = monday(off)
  const days = [...Array(7)].map((_, i) => { const d = new Date(mon); d.setDate(d.getDate() + i); return d })
  const load = useCallback(() => rpc('daraja_admin_attendance', { p_token: token, p_venue: venue, p_from: iso(days[0]), p_to: iso(days[6]) }).then(setList).catch(() => setList([])), [token, venue, off])
  useEffect(() => { setList(null); load() }, [load])
  const over = iso(days[6]) < iso(new Date())
  const close = async () => {
    try {
      const r = await rpc('daraja_admin_close_week', { p_token: token, p_venue: venue, p_week: iso(days[0]) })
      toast(r.n ? '+25 pour ' + r.n + ' personne' + (r.n > 1 ? 's' : '') : 'Aucun nouveau bonus'); load()
    } catch { toast('Erreur') }
  }
  return (
    <>
      <div className="row between" style={{ margin: '10px 0' }}>
        <button className="mini ghost" onClick={() => setOff(off - 1)}><i className="ti ti-chevron-left" /></button>
        <b>Semaine du {mon.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</b>
        <button className="mini ghost" disabled={off >= 0} onClick={() => setOff(off + 1)}><i className="ti ti-chevron-right" /></button>
      </div>
      {!list ? <div className="sub">Chargement…</div> : <div className="wkgrid">
        <span />{days.map(d => <span key={iso(d)} className="sub" style={{ textAlign: 'center' }}>{d.toLocaleDateString('fr-FR', { weekday: 'narrow' })}{d.getDate()}</span>)}
        {list.map(p => <React.Fragment key={p.id}>
          <span className="nm">{p.bonus && <i className="ti ti-star acc" />} {first(p.display)}{p.late ? <span className="sub"> · {p.late}′</span> : ''}</span>
          {days.map(d => {
            const a = p.days.find(x => x.day === iso(d))
            const cls = !a ? '' : a.status === 'present' ? (a.late && !a.late_ok ? 'late' : 'present') : a.status === 'absent' ? 'absent' : 'just'
            const lbl = !a ? '' : a.status === 'present' ? (a.late ? a.late + '′' : '✓') : (ATT.find(x => x[0] === a.status) || [])[2]
            return <button key={iso(d)} className={'cell ' + cls} onClick={() => setCell({ p, day: iso(d), a })}>{lbl}</button>
          })}
        </React.Fragment>)}
      </div>}
      <div className="sub" style={{ margin: '12px 0', lineHeight: 1.6 }}>Touche une case pour saisir ou justifier. Bleu = absence justifiée (aucune sanction). Retard justifié = non compté.</div>
      <button className="btn" disabled={!over} onClick={close}><i className="ti ti-clock-check" /> {over ? 'Valider la semaine · +25 ponctualité' : 'Semaine en cours'}</button>
      {cell && <AttEdit token={token} cell={cell} close={() => setCell(null)} done={() => { setCell(null); load() }} toast={toast} />}
    </>
  )
}
function AttEdit({ token, cell, close, done, toast }) {
  const [st, setSt] = useState(cell.a?.status || 'present')
  const [late, setLate] = useState(cell.a?.late || 0)
  const [ok, setOk] = useState(cell.a?.late_ok || false)
  const [note, setNote] = useState(cell.a?.note || '')
  const save = async () => {
    try {
      await rpc('daraja_admin_attendance_set', { p_token: token, p_rows: [{ staff: cell.p.id, day: cell.day, status: st, late: st === 'present' ? late : 0, late_ok: ok, note, source: 'manuel' }] })
      toast('Enregistré'); done()
    } catch { toast('Erreur') }
  }
  return (
    <div className="sheet" onClick={close}>
      <div onClick={e => e.stopPropagation()}>
        <h1>{cell.p.display}</h1>
        <div className="sub" style={{ marginBottom: 12, textTransform: 'capitalize' }}>{new Date(cell.day + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}{cell.a?.source === 'pdf' ? ' · importé du PDF' : ''}</div>
        <div className="chips">{ATT.map(([k, l]) => <button key={k} className={'chip ' + (st === k ? 'on' : '')} onClick={() => setSt(k)}>{l}</button>)}</div>
        {st === 'present' && <>
          <div className="sub" style={{ marginBottom: 6 }}>Retard (minutes)</div>
          <div className="chips">{[0, 5, 10, 15, 30, 60].map(m => <button key={m} className={'chip ' + (late === m ? 'on' : '')} onClick={() => setLate(m)}>{m ? m + ' min' : "À l'heure"}</button>)}</div>
          {late > 0 && <div className="tog"><span>Retard justifié</span><button className={'sw ' + (ok ? 'on' : '')} aria-label="Retard justifié" onClick={() => setOk(!ok)} /></div>}
        </>}
        <input style={{ marginTop: 10 }} placeholder="Motif (facultatif)" value={note} onChange={e => setNote(e.target.value)} />
        <button className="btn" onClick={save}>Enregistrer</button>
      </div>
    </div>
  )
}

function QuizSettings({ token, venue, toast }) {
  const [fam, setFam] = useState('salle')
  const [s, setS] = useState(null)
  useEffect(() => { setS(null); rpc('daraja_settings', { p_token: token, p_venue: venue, p_family: fam }).then(setS).catch(() => setS({ levels: [], cats: [] })) }, [token, venue, fam])
  const flip = async (key, en) => {
    const upd = l => l.map(x => x.key === key ? { ...x, enabled: en } : x)
    setS({ levels: upd(s.levels), cats: upd(s.cats) })
    try { await rpc('daraja_set_setting', { p_token: token, p_venue: venue, p_family: fam, p_key: key, p_enabled: en }) } catch { toast('Erreur') }
  }
  return (
    <>
      <div className="tabs">{Object.entries(FAM).map(([k, l]) => <button key={k} className={fam === k ? 'on' : ''} onClick={() => setFam(k)}>{k === 'support' ? 'Accueil · sécurité · support' : l}</button>)}</div>
      {!s ? <div className="sub">Chargement…</div> : <>
        <div className="sec">Niveaux</div>
        {s.levels.map(x => <div key={x.key} className="tog"><span>{x.label}</span><button className={'sw ' + (x.enabled ? 'on' : '')} aria-label={x.label} onClick={() => flip(x.key, !x.enabled)} /></div>)}
        <div className="sec">Thèmes</div>
        {s.cats.map(x => <div key={x.key} className="tog"><span>{x.label} <span className="sub">· {x.count}</span></span><button className={'sw ' + (x.enabled ? 'on' : '')} aria-label={x.label} onClick={() => flip(x.key, !x.enabled)} /></div>)}
        <div className="sub" style={{ marginTop: 10 }}>Le changement s'applique au défi du lendemain.</div>
      </>}
    </>
  )
}

function DrawAdmin({ token, me, venue, toast }) {
  const [info, setInfo] = useState(null)
  const [m, setM] = useState(new Date().getDate() <= 10 ? -1 : 0)
  const [prize, setPrize] = useState('')
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { rpc('daraja_draw_info', { p_token: token, p_venue: venue }).then(setInfo).catch(() => {}) }, [token, venue, res])
  const md = new Date(); md.setDate(1); md.setMonth(md.getMonth() + m)
  const label = md.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  const draw = async () => {
    if (!prize.trim()) { toast('Choisis le lot'); return }
    setBusy(true)
    try {
      const r = await rpc('daraja_admin_draw', { p_token: token, p_venue: venue, p_month: iso(md), p_prize: prize })
      if (r.ok) { setRes({ ...r, prize }); setTimeout(() => burst(90), 300) } else toast('Aucun ticket ce mois-ci')
    } catch (e) { toast(String(e?.message || '').includes('already') ? 'Déjà tiré pour ce mois' : 'Erreur') }
    setBusy(false)
  }
  return (
    <>
      <div className="seg" style={{ marginTop: 10 }}>
        <button className={m === -1 ? 'on' : ''} onClick={() => setM(-1)}>Mois dernier</button>
        <button className={m === 0 ? 'on' : ''} onClick={() => setM(0)}>Ce mois</button>
      </div>
      <div className="sub" style={{ marginBottom: 8, textTransform: 'capitalize' }}>Tirage de {label}</div>
      <input placeholder="Le lot du mois" value={prize} onChange={e => setPrize(e.target.value)} />
      <div className="chips">{['½ journée off', 'Dîner pour 2', 'Bon Decathlon 300 DH', 'Places de cinéma'].map(p => <button key={p} className={'chip ' + (prize === p ? 'on' : '')} onClick={() => setPrize(p)}>{p}</button>)}</div>
      <button className="btn pulse" disabled={busy} onClick={draw}><i className="ti ti-dice-5" /> Tirer au sort</button>
      <div className="sub" style={{ marginTop: 10 }}>1 ticket par défi terminé, +2 par semaine à l'heure. Exclus : ligne grise ou rouge dans le mois. Un seul tirage par mois.</div>
      {res && <div className="sheet center" onClick={() => setRes(null)}>
        <div className="lvup pop" onClick={e => e.stopPropagation()}>
          <i className="ti ti-confetti acc" style={{ fontSize: 48 }} />
          <div className="sub">{res.prize}</div>
          <h1 style={{ fontSize: 28 }}>{res.winner}</h1>
          <div className="sub" style={{ marginBottom: 14 }}>{res.tickets} tickets sur {res.total} · {res.players} participants</div>
          {res.phone && <a className="btn wa" href={waLink(res.phone, `Félicitations ${first(res.winner)} 🎉 Tu as gagné le tirage Daraja du mois : ${res.prize} ! Viens me voir pour en profiter. ${me.name}`)} target="_blank" rel="noreferrer"><i className="ti ti-brand-whatsapp" /> Prévenir sur WhatsApp</a>}
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setRes(null)}>Fermer</button>
        </div>
      </div>}
      {info?.last && !res && <div className="card" style={{ marginTop: 14 }}><div className="sub">Dernier tirage · {info.last.month}</div><b>{info.last.winner}</b> · {info.last.prize}</div>}
    </>
  )
}

const ICONS = ['gift', 'coffee', 'glass', 'music', 'sparkles', 'clock-pause', 'door-exit', 'sun', 'beach', 'movie', 'ball-football', 'bath', 'shopping-bag', 'shirt', 'tools-kitchen-2', 'chef-hat', 'glass-full', 'bottle', 'certificate', 'tent', 'trophy', 'cash', 'ticket', 'device-mobile', 'plane', 'calendar-check']
function RewardsAdmin({ token, toast }) {
  const [list, setList] = useState(null)
  const [ed, setEd] = useState(null)
  const load = useCallback(() => rpc('daraja_admin_rewards', { p_token: token }).then(setList).catch(() => setList([])), [token])
  useEffect(() => { load() }, [load])
  const save = async r => {
    try { await rpc('daraja_admin_reward_save', { p_token: token, p: r }); toast(r.active ? 'En boutique' : 'Retiré de la boutique'); load() } catch { toast('Vérifie le nom et les points') }
  }
  if (!list) return <div className="sub">Chargement…</div>
  const row = r => {
    const c = r.conditions || {}
    const n = ['clean_days', 'no_recid', 'max_late', 'min_days'].filter(k => c[k]).length
    return (
      <div key={r.id} className="lb">
        <i className={'ti ti-' + r.icon + ' acc'} style={{ fontSize: 22 }} />
        <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setEd(r)}>
          <div style={{ fontSize: 14 }}>{r.name}</div>
          <div className="sub">{fmt(r.cost)} pts{n ? ' · ' + n + ' condition' + (n > 1 ? 's' : '') : ''}{r.stock != null ? ' · stock ' + r.stock : ''}{r.venue ? ' · ' + (r.venue === 'zz' ? 'Zama' : 'Baro') : ''}</div>
        </div>
        <button className={'sw ' + (r.active ? 'on' : '')} aria-label="En boutique" onClick={() => save({ ...r, active: !r.active })} />
      </div>
    )
  }
  return (
    <>
      <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setEd({ name: '', cost: 500, icon: 'gift', tier: 'bon', active: true, conditions: {}, stock: null, venue: null })}><i className="ti ti-plus" /> Nouveau cadeau</button>
      <div className="sec">En boutique · {list.filter(r => r.active).length}</div>
      {list.filter(r => r.active).map(row)}
      <div className="sec">Suggestions à valider · {list.filter(r => !r.active).length}</div>
      {list.filter(r => !r.active).map(row)}
      {ed && <RewardEdit r={ed} close={() => setEd(null)} save={r => { save(r); setEd(null) }} />}
    </>
  )
}
function RewardEdit({ r, close, save }) {
  const [f, setF] = useState({ ...r, conditions: { ...(r.conditions || {}) } })
  const c = f.conditions
  const setC = (k, v) => setF({ ...f, conditions: { ...c, [k]: v || undefined } })
  const Opt = ({ k, vals }) => <div className="chips">{vals.map(([v, l]) => <button key={l} className={'chip ' + ((c[k] || null) === v ? 'on' : '')} onClick={() => setC(k, v)}>{l}</button>)}</div>
  return (
    <div className="sheet" onClick={close}>
      <div onClick={e => e.stopPropagation()} style={{ maxHeight: '90dvh', overflowY: 'auto' }}>
        <h1>{r.id ? 'Modifier le cadeau' : 'Nouveau cadeau'}</h1>
        <input placeholder="Nom du cadeau" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        <div className="row" style={{ gap: 8 }}>
          <input inputMode="numeric" placeholder="Points" value={f.cost} onChange={e => setF({ ...f, cost: parseInt(e.target.value.replace(/\D/g, '') || '0', 10) })} />
          <input inputMode="numeric" placeholder="Stock (vide = illimité)" value={f.stock ?? ''} onChange={e => { const v = e.target.value.replace(/\D/g, ''); setF({ ...f, stock: v === '' ? null : parseInt(v, 10) }) }} />
        </div>
        <div className="chips">{TIERS.map(([k, l]) => <button key={k} className={'chip ' + (f.tier === k ? 'on' : '')} onClick={() => setF({ ...f, tier: k })}>{l}</button>)}</div>
        <div className="seg">{[[null, 'Les deux lieux'], ['baro', 'Baromètre'], ['zz', 'ZamaZama']].map(([v, l]) => <button key={l} className={(f.venue || null) === v ? 'on' : ''} onClick={() => setF({ ...f, venue: v })}>{l}</button>)}</div>
        <div className="avgrid" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>{ICONS.map(i => <button key={i} className={'chip ' + (f.icon === i ? 'on' : '')} style={{ padding: 8 }} onClick={() => setF({ ...f, icon: i })}><i className={'ti ti-' + i} /></button>)}</div>
        <div className="sec">Conditions</div>
        <div className="sub">Aucune ligne grise ou rouge</div>
        <Opt k="clean_days" vals={[[null, 'Non'], [30, '30 jours'], [90, '90 jours']]} />
        <div className="tog"><span>Pas de récidive (90 jours)</span><button className={'sw ' + (c.no_recid ? 'on' : '')} aria-label="Pas de récidive" onClick={() => setC('no_recid', !c.no_recid)} /></div>
        <div className="sub" style={{ marginTop: 10 }}>Retard cumulé sur 30 jours (pointage)</div>
        <Opt k="max_late" vals={[[null, 'Non'], [10, '< 10 min'], [30, '< 30 min']]} />
        <div className="sub">Assiduité : jours de quiz sur 30 jours</div>
        <Opt k="min_days" vals={[[null, 'Non'], [10, '10 j'], [15, '15 j'], [20, '20 j']]} />
        <div className="tog"><span>En boutique</span><button className={'sw ' + (f.active ? 'on' : '')} aria-label="En boutique" onClick={() => setF({ ...f, active: !f.active })} /></div>
        <button className="btn" style={{ marginTop: 12 }} onClick={() => save(f)}>Enregistrer</button>
      </div>
    </div>
  )
}

export default function App() {
  const [token, setToken] = useState(store.get(TK))
  const [venue, setVenue] = useState(store.get(VK))
  const [me, setMe] = useState(null)
  const [tab, setTab] = useState('home')
  const [msg, setMsg] = useState('')
  const [splash, setSplash] = useState(false)
  const [levelUp, setLevelUp] = useState(null)
  const toast = m => { setMsg(m); setTimeout(() => setMsg(''), 2200) }
  const todayKey = new Date().toLocaleDateString('fr-CA')

  const refresh = useCallback(() => {
    if (!token) return
    rpc('daraja_me', { p_token: token, p_venue: venue }).then(setMe).catch(() => { store.set(TK, null); setToken(null); setMe(null) })
  }, [token, venue])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    if (!me) return
    if (store.get('daraja_quote_day') !== todayKey) setSplash(true)
    const n = level(me.earned).n, key = 'daraja_lv_' + me.id, prev = parseInt(store.get(key) || '0', 10)
    if (prev && n > prev) { setLevelUp(level(me.earned)); setTimeout(() => burst(80), 150) }
    store.set(key, String(n))
  }, [me?.id, me?.earned])

  const theme = 't-' + (me?.venue === 'zz' ? 'zz' : 'baro')
  useEffect(() => {
    document.body.className = theme
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 't-zz' ? '#FFF1DE' : '#0F3B33')
  }, [theme])

  const login = t => { store.set(TK, t); setToken(t) }
  const logout = () => { store.set(TK, null); setToken(null); setMe(null); setTab('home') }
  const switchVenue = v => { store.set(VK, v); setVenue(v) }
  const go = t => { setTab(t); window.scrollTo(0, 0); if (t !== 'quiz') refresh() }

  if (!token) return <div className={'app ' + theme}><div className="blobs"><i /><i /><i /></div><Login onToken={login} /></div>
  if (!me) return <div className={'app ' + theme}><div className="page sub">Chargement…</div></div>
  if (splash) return <div className={'app ' + theme}><div className="blobs"><i /><i /><i /></div><div id="fx" /><QuoteSplash token={token} me={me} close={() => { store.set('daraja_quote_day', todayKey); setSplash(false) }} /></div>

  const isAdmin = me.role !== 'staff'
  const tabs = [['home', 'home'], ['board', 'trophy'], ['stories', 'book-2'], ['shop', 'gift'], ['profile', 'user'], ...(isAdmin ? [['admin', 'settings']] : [])]

  return (
    <div className={'app ' + theme}>
      <div className="blobs"><i /><i /><i /></div>
      <Toast msg={msg} />
      <div id="fx" />
      {levelUp && <div className="sheet center" onClick={() => setLevelUp(null)}>
        <div className="lvup pop">
          <i className="ti ti-stairs-up acc" style={{ fontSize: 48 }} />
          <div className="sub" style={{ marginTop: 8 }}>Tu montes d'une marche</div>
          <h1 style={{ fontSize: 30 }}>Niveau {levelUp.n}</h1>
          <div className="acc" style={{ fontSize: 18, fontWeight: 600 }}>{levelUp.name}</div>
          <button className="btn" style={{ marginTop: 18 }}>Bravo à moi</button>
        </div>
      </div>}
      {me.role === 'super' && tab !== 'quiz' && (
        <div className="seg" style={{ padding: '12px 16px 0', margin: 0 }}>
          <button className={me.venue === 'baro' ? 'on' : ''} onClick={() => switchVenue('baro')}>Baromètre</button>
          <button className={me.venue === 'zz' ? 'on' : ''} onClick={() => switchVenue('zz')}>ZamaZama</button>
        </div>
      )}
      {tab === 'home' && <Home token={token} me={me} venue={venue} go={go} />}
      {tab === 'quiz' && <Quiz token={token} me={me} done={() => go('home')} />}
      {tab === 'board' && <Board token={token} me={me} venue={venue} />}
      {tab === 'stories' && <Stories />}
      {tab === 'shop' && <Shop token={token} me={me} venue={venue} refresh={refresh} toast={toast} />}
      {tab === 'profile' && <Profile token={token} me={me} logout={logout} toast={toast} refresh={refresh} />}
      {tab === 'admin' && isAdmin && <Admin token={token} me={me} venue={venue} toast={toast} />}
      <nav className="nav">
        {tabs.map(([k, ic]) => <button key={k} aria-label={k} className={tab === k || (tab === 'quiz' && k === 'home') ? 'on' : ''} onClick={() => go(k)}><i className={'ti ti-' + ic} />{((k === 'profile' && me.pending_ack > 0) || (k === 'admin' && me.direction_todo > 0)) && <span className="dot" />}</button>)}
      </nav>
    </div>
  )
}
