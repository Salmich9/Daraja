import React, { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_KEY } from './config.js'

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
const TK = 'daraja_token', VK = 'daraja_venue'
const store = {
  get: k => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch {} },
}

async function rpc(fn, args = {}) {
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

function Home({ me, go }) {
  return (
    <div className="page">
      <div className="row between" style={{ marginBottom: 18 }}>
        <div><div className="sub">{me.venue_name}</div><h1>Salut {me.name.split(' ')[0]}</h1></div>
        <div className="acc" style={{ fontSize: 17, fontWeight: 600 }}><i className="ti ti-flame" /> {me.streak} j</div>
      </div>
      <div className="card" style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => go('shop')}>
        <div className="sub">Mes points</div>
        <div className="big acc">{fmt(me.points)}</div>
        {me.role === 'staff' && <div className="sub">{me.rank === 1 ? '1er' : me.rank + 'e'} du {me.venue_name} ce mois</div>}
      </div>
      <div className="card">
        <div className="row between">
          <div style={{ fontSize: 17, fontWeight: 600 }}>Quiz du jour</div>
          <Info text="5 questions par jour : 2 faciles (+10), 2 confirmées (+20) et 1 experte (+30). Joue chaque jour pour faire grimper ta série. Touche pour fermer." />
        </div>
        <div className="sub" style={{ margin: '4px 0 14px' }}>5 questions · 3 niveaux · jusqu'à +90 pts</div>
        {me.quiz_done
          ? <button className="btn ghost" onClick={() => go('quiz')}><i className="ti ti-check" /> Fait, reviens demain</button>
          : <button className="btn" onClick={() => go('quiz')}>Jouer</button>}
      </div>
    </div>
  )
}

function Quiz({ token, done }) {
  const [data, setData] = useState(null)
  const [i, setI] = useState(0)
  const [res, setRes] = useState(null)
  const [pick, setPick] = useState(null)
  const [score, setScore] = useState(0)
  const [pts, setPts] = useState(0)
  const [err, setErr] = useState('')

  useEffect(() => {
    rpc('daraja_quiz', { p_token: token }).then(d => {
      setData(d)
      setScore(d.correct || 0)
      setPts(d.today_points || 0)
      const first = (d.questions || []).findIndex(q => !(d.answered || []).includes(q.id))
      setI(first === -1 ? (d.questions || []).length : first)
    }).catch(() => setErr('Impossible de charger le quiz'))
  }, [token])

  if (err) return <div className="page"><div className="err">{err}</div></div>
  if (!data) return <div className="page sub">Chargement…</div>
  const qs = data.questions || []
  if (!qs.length) return <div className="page"><h1>Quiz du jour</h1><div className="sub">Pas encore de questions.</div></div>

  if (i >= qs.length) return (
    <div className="page" style={{ textAlign: 'center', paddingTop: 60 }}>
      <i className="ti ti-trophy acc" style={{ fontSize: 56 }} />
      <h1>{score}/{qs.length}</h1>
      <div className="sub" style={{ marginBottom: 24 }}>+{pts} points aujourd'hui</div>
      <button className="btn" onClick={done}>Retour</button>
    </div>
  )

  const q = qs[i]
  const answer = async k => {
    if (res) return
    setPick(k)
    try {
      const r = await rpc('daraja_answer', { p_token: token, p_question: q.id, p_choice: k })
      setRes(r)
      if (r.score != null) setScore(r.score)
      if (r.today_points != null) setPts(r.today_points)
    } catch { setErr('Erreur réseau, réessaie') }
  }
  const next = () => { setRes(null); setPick(null); setI(i + 1) }

  return (
    <div className="page">
      <div className="row between sub" style={{ marginBottom: 8 }}>
        <span>Question {i + 1}/{qs.length} · {q.theme}</span><LevelBadge level={q.level} />
      </div>
      <div className="bar" style={{ marginBottom: 20 }}><div style={{ width: `${(i / qs.length) * 100}%` }} /></div>
      <div style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.4, marginBottom: 18 }}>{q.question}</div>
      {q.options.map((o, k) => {
        let c = ''
        if (res) { if (k === res.answer_idx) c = 'ok'; else if (k === pick) c = 'ko' }
        else if (k === pick) c = 'sel'
        return <button key={k} className={'opt ' + c} onClick={() => answer(k)}>
          {res && k === res.answer_idx && <i className="ti ti-check" style={{ color: 'var(--good)', marginRight: 6 }} />}{o}
        </button>
      })}
      {res && <>
        <div className="card" style={{ fontSize: 14, lineHeight: 1.45 }}>
          <b style={{ color: res.correct ? 'var(--good)' : 'var(--bad)' }}>{res.correct ? '+' + (res.points || 10) + ' pts' : 'Raté'}</b>
          {res.explanation ? ' · ' + res.explanation : ''}
        </div>
        <button className="btn" onClick={next}>{i + 1 < qs.length ? 'Suivante' : 'Voir mon score'}</button>
      </>}
    </div>
  )
}

function Board({ token, me, venue }) {
  const [list, setList] = useState(null)
  useEffect(() => { rpc('daraja_leaderboard', { p_token: token, p_venue: venue }).then(setList).catch(() => setList([])) }, [token, venue])
  const month = new Date().toLocaleDateString('fr-FR', { month: 'long' })
  return (
    <div className="page">
      <div className="row between" style={{ position: 'relative' }}>
        <h1>Classement</h1>
        <Info text="Points gagnés ce mois-ci (quiz, avis clients, bonus, moins les malus). Les cadeaux achetés ne font pas baisser le classement. Remise à zéro chaque 1er du mois." />
      </div>
      <div className="sub" style={{ marginBottom: 14, textTransform: 'capitalize' }}>{month} · {me.venue_name}</div>
      {!list ? <div className="sub">Chargement…</div> : !list.length ? <div className="sub">Personne encore. Sois le premier.</div> :
        list.map((p, k) => (
          <div key={p.id} className={'lb ' + (p.id === me.id ? 'me' : '')}>
            <span className={k < 3 ? 'acc' : ''} style={{ width: 22, fontWeight: 600 }}>
              {k < 3 ? <i className={'ti ti-medal'} /> : k + 1}
            </span>
            <div className="av">{initials(p.name)}</div>
            <span style={{ flex: 1, fontWeight: p.id === me.id ? 600 : 400 }}>{p.id === me.id ? 'Toi' : p.name}</span>
            <span className={k < 3 ? 'acc' : ''}>{fmt(p.pts)}</span>
          </div>
        ))}
    </div>
  )
}

function Shop({ token, me, venue, refresh, toast }) {
  const [items, setItems] = useState(null)
  const [sel, setSel] = useState(null)
  useEffect(() => { rpc('daraja_rewards', { p_token: token, p_venue: venue }).then(setItems).catch(() => setItems([])) }, [token, venue])
  const buy = async () => {
    try {
      const r = await rpc('daraja_redeem', { p_token: token, p_reward: sel.id })
      if (r.ok) { toast('Demande envoyée au manager'); refresh() } else toast(r.error === 'blocked' ? 'Boutique bloquée suite à une faute grave' : 'Pas assez de points')
    } catch { toast('Erreur, réessaie') }
    setSel(null)
  }
  return (
    <div className="page">
      <div className="row between" style={{ marginBottom: 14 }}>
        <h1>Boutique</h1>
        <div className="acc" style={{ fontWeight: 600 }}>{fmt(me.points)} pts</div>
      </div>
      {!items ? <div className="sub">Chargement…</div> :
        <div className="grid2">
          {items.map(r => {
            const ok = me.points >= r.cost
            return (
              <div key={r.id} className={'card gift ' + (ok ? '' : 'locked')} onClick={() => ok && setSel(r)}>
                <i className={'ti ti-' + r.icon + ' acc'} />
                <div style={{ fontSize: 14, margin: '6px 0', minHeight: 36 }}>{r.name}</div>
                <div className={ok ? 'acc' : ''} style={{ fontWeight: 600, fontSize: 14 }}>{!ok && <i className="ti ti-lock" />} {fmt(r.cost)}</div>
              </div>
            )
          })}
        </div>}
      {sel && <div className="sheet" onClick={() => setSel(null)}>
        <div onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
          <i className={'ti ti-' + sel.icon + ' acc'} style={{ fontSize: 40 }} />
          <h1>{sel.name}</h1>
          <div className="sub" style={{ marginBottom: 18 }}>{fmt(sel.cost)} points · le manager te le remet</div>
          <button className="btn" onClick={buy}>Échanger</button>
          <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setSel(null)}>Annuler</button>
        </div>
      </div>}
    </div>
  )
}

function Profile({ token, me, logout, toast, refresh }) {
  const lv = level(me.earned)
  const [avis, setAvis] = useState(false)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
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
        <div className="av" style={{ width: 68, height: 68, fontSize: 22, margin: '0 auto 10px', background: 'var(--acc)', color: 'var(--btxt)' }}>{initials(me.name)}</div>
        <h1>{me.name}</h1>
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
      {me.role === 'staff' && <MyConduct token={token} toast={toast} refresh={refresh} />}
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
  const load = useCallback(() => rpc('daraja_admin', { p_token: token, p_venue: venue }).then(setD).catch(() => setD({ reviews: [], gifts: [], staff: [] })), [token, venue])
  useEffect(() => { load() }, [load])
  const act = async (fn, args, msg) => { try { await rpc(fn, { p_token: token, ...args }); toast(msg); load() } catch { toast('Erreur') } }
  if (!d) return <div className="page sub">Chargement…</div>
  return (
    <div className="page">
      <div className="row between" style={{ marginBottom: 6 }}>
        <h1>Admin</h1>
        <button className="mini" onClick={() => setAdd(true)}><i className="ti ti-user-plus" /> Équipier</button>
      </div>
      <div className="sub">{me.venue_name}</div>
      <div className="seg" style={{ marginTop: 12 }}>
        <button className={tab === 'team' ? 'on' : ''} onClick={() => setTab('team')}>Équipe</button>
        <button className={tab === 'conduct' ? 'on' : ''} onClick={() => setTab('conduct')}>Conduite{me.direction_todo ? ' · ' + me.direction_todo : ''}</button>
      </div>
      {tab === 'conduct' ? <Conduct token={token} me={me} venue={venue} staff={d.staff} toast={toast} /> : <>
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

      <div className="sec"><i className="ti ti-users acc" /> Équipe · bonus</div>
      {d.staff.map(s => (
        <div key={s.id} className="lb" style={{ cursor: 'pointer' }} onClick={() => setPts(s)}>
          <div className="av">{initials(s.name)}</div>
          <span style={{ flex: 1 }}>{s.name}{s.role === 'admin' && <span className="sub"> · manager</span>}</span>
          <span className="acc">{fmt(s.points)}</span>
          <i className="ti ti-chevron-right sub" />
        </div>
      ))}
      </>}
      {pts && <PointsSheet s={pts} close={() => setPts(null)} act={act} />}
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

function PointsSheet({ s, close, act }) {
  const opts = [
    ['bonus', 50, 'Bonus 50', 'ti-plus'], ['bonus', 100, 'Bonus 100', 'ti-star'],
    ['bonus', 200, 'Bonus 200', 'ti-sparkles'], ['bonus', 500, 'Bonus 500', 'ti-trophy'],
  ]
  const [pick, setPick] = useState(null)
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const go = () => {
    if (!pick) { setErr('Choisis une option'); return }
    act('daraja_admin_points', { p_staff: s.id, p_kind: pick[0], p_amount: pick[1], p_note: note || pick[2] },
      (pick[0] === 'malus' ? '-' : '+') + pick[1] + ' pts · ' + s.name)
    close()
  }
  return (
    <div className="sheet" onClick={close}>
      <div onClick={e => e.stopPropagation()}>
        <h1>{s.name}</h1>
        <div className="sub" style={{ marginBottom: 14 }}>Pour une faute, passe par l'onglet Conduite</div>
        <div className="grid2" style={{ marginBottom: 12 }}>
          {opts.map(o => (
            <button key={o[2]} className={'opt ' + (pick === o ? 'sel' : '')} style={{ margin: 0, textAlign: 'center' }} onClick={() => { setPick(o); setErr('') }}>
              <i className={'ti ' + o[3]} style={{ color: o[0] === 'malus' ? 'var(--bad)' : 'var(--good)' }} /> {o[2]}
              <div style={{ fontWeight: 600 }}>{o[0] === 'malus' ? '-' : '+'}{o[1]}</div>
            </button>
          ))}
        </div>
        <input placeholder="Motif (facultatif)" value={note} onChange={e => setNote(e.target.value)} />
        <div className="err">{err}</div>
        <button className="btn" onClick={go}>Valider</button>
      </div>
    </div>
  )
}

function AddStaff({ token, me, venue, close, done }) {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [role, setRole] = useState('staff')
  const [err, setErr] = useState('')
  const save = async () => {
    if (!name.trim()) { setErr('Entre un prénom'); return }
    if (!/^\d{4}$/.test(pin)) { setErr('Le code doit faire 4 chiffres'); return }
    try {
      const r = await rpc('daraja_admin_add_staff', { p_token: token, p_name: name, p_pin: pin, p_role: role, p_venue: venue })
      if (r.ok) done()
      else setErr(r.error === 'taken' ? 'Code déjà pris, choisis-en un autre' : 'Vérifie les champs')
    } catch { setErr('Erreur, réessaie') }
  }
  return (
    <div className="sheet" onClick={close}>
      <div onClick={e => e.stopPropagation()}>
        <h1>Nouvel équipier</h1>
        <div className="sub" style={{ marginBottom: 14 }}>{me.venue_name}</div>
        <input placeholder="Prénom et nom" value={name} onChange={e => { setName(e.target.value); setErr('') }} />
        <input placeholder="Code à 4 chiffres" inputMode="numeric" maxLength={4} value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setErr('') }} />
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

export default function App() {
  const [token, setToken] = useState(store.get(TK))
  const [venue, setVenue] = useState(store.get(VK))
  const [me, setMe] = useState(null)
  const [tab, setTab] = useState('home')
  const [msg, setMsg] = useState('')
  const toast = m => { setMsg(m); setTimeout(() => setMsg(''), 2200) }

  const refresh = useCallback(() => {
    if (!token) return
    rpc('daraja_me', { p_token: token, p_venue: venue }).then(setMe).catch(() => { store.set(TK, null); setToken(null); setMe(null) })
  }, [token, venue])
  useEffect(() => { refresh() }, [refresh])

  const theme = 't-' + (me?.venue === 'zz' ? 'zz' : 'baro')
  useEffect(() => {
    document.body.className = theme
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 't-zz' ? '#F6EEE4' : '#2B211C')
  }, [theme])

  const login = t => { store.set(TK, t); setToken(t) }
  const logout = () => { store.set(TK, null); setToken(null); setMe(null); setTab('home') }
  const switchVenue = v => { store.set(VK, v); setVenue(v) }
  const go = t => { setTab(t); window.scrollTo(0, 0); if (t !== 'quiz') refresh() }

  if (!token) return <div className={'app ' + theme}><Login onToken={login} /></div>
  if (!me) return <div className={'app ' + theme}><div className="page sub">Chargement…</div></div>

  const isAdmin = me.role !== 'staff'
  const tabs = [['home', 'home'], ['board', 'trophy'], ['shop', 'gift'], ['profile', 'user'], ...(isAdmin ? [['admin', 'settings']] : [])]

  return (
    <div className={'app ' + theme}>
      <Toast msg={msg} />
      {me.role === 'super' && tab !== 'quiz' && (
        <div className="seg" style={{ padding: '12px 16px 0', margin: 0 }}>
          <button className={me.venue === 'baro' ? 'on' : ''} onClick={() => switchVenue('baro')}>Baromètre</button>
          <button className={me.venue === 'zz' ? 'on' : ''} onClick={() => switchVenue('zz')}>ZamaZama</button>
        </div>
      )}
      {tab === 'home' && <Home me={me} go={go} />}
      {tab === 'quiz' && <Quiz token={token} done={() => go('home')} />}
      {tab === 'board' && <Board token={token} me={me} venue={venue} />}
      {tab === 'shop' && <Shop token={token} me={me} venue={venue} refresh={refresh} toast={toast} />}
      {tab === 'profile' && <Profile token={token} me={me} logout={logout} toast={toast} refresh={refresh} />}
      {tab === 'admin' && isAdmin && <Admin token={token} me={me} venue={venue} toast={toast} />}
      <nav className="nav">
        {tabs.map(([k, ic]) => <button key={k} aria-label={k} className={tab === k || (tab === 'quiz' && k === 'home') ? 'on' : ''} onClick={() => go(k)}><i className={'ti ti-' + ic} />{((k === 'profile' && me.pending_ack > 0) || (k === 'admin' && me.direction_todo > 0)) && <span className="dot" />}</button>)}
      </nav>
    </div>
  )
}
