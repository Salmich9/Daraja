import React, { useEffect, useState, useCallback } from 'react'
import { RV, ROLES, fmt, rpc } from '../lib'
import { Avatar, PinShow, PostSelect } from '../ui'
import { Conduct } from './Conduct'
import { Reports } from './Reports'
import { Attendance } from './Attendance'
import { DrawAdmin, QuizSettings, RewardsAdmin } from './Settings'
import { pushKick } from '../push'
import Notifications from './Notifications'
import Asks from './Asks'
import Charter from './Charter'

function Admin({ token, me, venue, toast, start }) {
  const [d, setD] = useState(null)
  const [pts, setPts] = useState(null)
  const [add, setAdd] = useState(false)
  const [tab, setTab] = useState(start || 'team')
  const [missions, setMissions] = useState({})
  const v = me.venue
  const load = useCallback(() => rpc('daraja_admin', { p_token: token, p_venue: venue }).then(setD).catch(() => setD({ reviews: [], gifts: [], staff: [] })), [token, venue])
  useEffect(() => { load() }, [load])
  useEffect(() => { rpc('daraja_admin_missions', { p_token: token, p_venue: venue }).then(setMissions).catch(() => {}) }, [token, venue])
  const act = async (fn, args, msg) => { try { await rpc(fn, { p_token: token, ...args }); toast(msg); load(); pushKick(token) } catch { toast('Erreur') } }
  if (!d) return <div className="page sub">Chargement…</div>
  // Pages rangées en 3 groupes : on choisit le groupe, puis la page
  const T = [['team', 'Équipe', 'eq'], ['att', 'Pointage', 'eq'], ['conduct', 'Conduite' + (me.direction_todo ? ' · ' + me.direction_todo : ''), 'eq'], ['asks', 'À vendre', 'eq'],
    ['report', 'Rapports', 'suivi'], ...(me.role === 'super' ? [['errors', 'Erreurs' + (me.errors_24h ? ' · ' + me.errors_24h : ''), 'suivi']] : []),
    ['quiz', 'Questions', 'reg'], ['draw', 'Tirage', 'reg'], ...(me.role === 'super' ? [['gifts', 'Cadeaux', 'reg'], ['charte', 'Charte', 'reg'], ['notif', '🔔 Notifications', 'reg']] : [])]
  const G = [['eq', 'Équipe', 'ti-users', me.direction_todo || 0], ['suivi', 'Suivi', 'ti-chart-bar', me.role === 'super' ? me.errors_24h || 0 : 0], ['reg', 'Réglages', 'ti-adjustments', 0]]
  const grp = G.find(g => g[0] === (T.find(t => t[0] === tab) || T[0])[2])
  const sub = T.filter(t => t[2] === grp[0])
  return (
    <div className="page">
      <div className="row between u-mb-6" >
        <h1>Admin</h1>
        <button className="mini" onClick={() => setAdd(true)}><i className="ti ti-user-plus" /> Équipier</button>
      </div>
      <div className="sub">{me.venue_name}</div>
      <div className="seg admgrp">{G.map(([g, l, ic, n]) => <button key={g} className={grp[0] === g ? 'on' : ''} onClick={() => setTab(T.find(t => t[2] === g)[0])}><i className={'ti ' + ic} /> {l}{n > 0 && <span className="cnt">{n}</span>}</button>)}</div>
      {sub.length > 1 && <div className="tabs">{sub.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>}
      {tab === 'conduct' && <Conduct token={token} me={me} venue={venue} staff={d.staff} toast={toast} />}
      {tab === 'report' && <Reports token={token} me={me} venue={v} toast={toast} />}
      {tab === 'att' && <Attendance token={token} venue={v} toast={toast} />}
      {tab === 'quiz' && <QuizSettings token={token} venue={v} toast={toast} me={me} />}
      {tab === 'draw' && <DrawAdmin token={token} me={me} venue={v} toast={toast} />}
      {tab === 'gifts' && <RewardsAdmin token={token} toast={toast} />}
      {tab === 'notif' && <Notifications token={token} toast={toast} />}
      {tab === 'charte' && <Charter token={token} toast={toast} />}
      {tab === 'asks' && <Asks token={token} venue={v} toast={toast} />}
      {tab === 'errors' && <ErrorsAdmin token={token} />}
      {tab === 'team' && <>
      <div className="sec"><i className="ti ti-star acc" /> Avis et ventes à valider</div>
      {!d.reviews.length && <div className="sub">Rien en attente</div>}
      {d.reviews.map(r => (
        <div key={r.id} className="lb">
          <div className="u-flex-1 u-min-width-0"><div>{r.name}</div><div className="sub u-overflow-hidden u-text-overflow-ellipsis u-ws-nowrap" ><i className={'ti ' + (r.kind === 'vente' ? 'ti-target-arrow' : 'ti-star')} /> {r.note}</div></div>
          <button className="mini" onClick={() => act('daraja_admin_review', { p_event: r.id, p_ok: true }, '+' + (r.amount || RV.review) + ' pièces validées')}>+{r.amount || RV.review}</button>
          <button className="mini ghost" aria-label="Refuser" onClick={() => act('daraja_admin_review', { p_event: r.id, p_ok: false }, 'Refusé')}><i className="ti ti-x" /></button>
        </div>
      ))}

      <div className="sec"><i className="ti ti-gift acc" /> Cadeaux à remettre</div>
      {!d.gifts.length && <div className="sub">Rien en attente</div>}
      {d.gifts.map(g => (
        <div key={g.id} className="lb">
          <span className="u-flex-1">{g.name} · {g.note}</span>
          <button className="mini" onClick={() => act('daraja_admin_deliver', { p_event: g.id }, 'Marqué remis')}>Remis</button>
        </div>
      ))}

      <ContactsAdmin token={token} venue={venue} toast={toast} />
      <div className="sec"><i className="ti ti-users acc" /> Équipe · poste, mission, bonus</div>
      {d.staff.map(s => (
        <div key={s.id} className="lb u-cur-pointer"  onClick={() => setPts(s)}>
          <Avatar value={s.avatar} name={s.name} />
          <div className="u-flex-1 u-min-width-0">
            <div>{s.name}{s.role === 'admin' && <span className="sub"> · manager</span>}</div>
            <div className="sub">{s.post_label || 'Poste à définir'}{s.mission_done ? ' · mission ✓' : ''}{!s.phone ? ' · sans numéro' : ''}</div>
          </div>
          <span className="acc">{fmt(s.points)}</span>
          <i className="ti ti-chevron-right sub" />
        </div>
      ))}
      </>}
      {pts && <StaffSheet token={token} me={me} s={pts} mission={missions[pts.family]} close={() => setPts(null)} act={act} toast={toast} reload={load} />}
      {add && <AddStaff token={token} me={me} venue={venue} close={() => setAdd(false)} done={() => { setAdd(false); load(); toast('Équipier ajouté') }} />}
    </div>
  )
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
      <div className="sec u-cur-pointer"  onClick={() => setOpen(!open)}><i className="ti ti-brand-whatsapp wa-ic" /> Contacts WhatsApp · {n}/4 <i className={(open ? 'ti ti-chevron-up' : 'ti ti-chevron-down')} /></div>
      {open && ROLES.map(([k, label, ic]) => (
        <div key={k} className="card u-p-10" >
          <div className="sub u-mb-6" ><i className={'ti ti-' + ic} /> {label}</div>
          <input placeholder="Prénom" value={c[k]?.name || ''} onChange={e => set(k, 'name', e.target.value)} />
          <div className="row u-gap-8" >
            <input placeholder="06 12 34 56 78" inputMode="tel" value={c[k]?.phone || ''} onChange={e => set(k, 'phone', e.target.value)} className="u-mb-0" />
            <button className="mini" onClick={() => save(k)}>OK</button>
          </div>
        </div>
      ))}
    </>
  )
}

function StaffSheet({ token, me, s, mission, close, act, toast, reload }) {
  const [newPin, setNewPin] = useState(null)
  const self = s.id === me.id
  const resetPin = async () => { try { const r = await rpc('daraja_admin_reset_pin', { p_token: token, p_staff: s.id }); if (r.ok) setNewPin(r) } catch { toast('Impossible pour ce compte') } }
  const [post, setPost] = useState(s.post || '')
  const [phone, setPhone] = useState(s.phone || '')
  const [bd, setBd] = useState(s.birthday ? s.birthday.split('-') : ['', ''])
  const [pick, setPick] = useState(null)
  const [note, setNote] = useState('')
  const saveInfo = async () => {
    try {
      const r = await rpc('daraja_admin_update_staff', { p_token: token, p_staff: s.id, p_post: post || null, p_phone: phone })
      if (r?.ok === false) { toast(r.error === 'phone' ? 'Numéro invalide' : 'Vérifie les champs'); return }
      await rpc('daraja_admin_set_birthday', { p_token: token, p_staff: s.id, p_mmdd: bd[0] && bd[1] ? bd[0] + '-' + bd[1] : '' })
      toast('Fiche à jour'); reload()
    } catch { toast('Erreur') }
  }
  const opts = [[50, 'Bonus 50', 'ti-plus'], [100, 'Bonus 100', 'ti-star'], [200, 'Bonus 200', 'ti-sparkles'], [500, 'Bonus 500', 'ti-trophy']]
  return (
    <div className="sheet" onClick={close}>
      <div onClick={e => e.stopPropagation()} className="u-maxh-88dvh u-oy-auto">
        <div className="row u-mb-12" ><Avatar value={s.avatar} name={s.name} size={46} /><div><h1 className="u-m-0">{s.name}</h1>{s.alias && <div className="sub">alias : {s.alias}</div>}</div></div>
        <div className="sub u-mb-6" >Poste (choisit ses questions et sa mission)</div>
        <PostSelect token={token} value={post} onChange={setPost} />
        <input placeholder="WhatsApp : 06 12 34 56 78" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} />
        <div className="sub u-mb-6" ><i className="ti ti-cake" /> Anniversaire (+{RV.birthday} pièces le jour J, l'équipe est prévenue)</div>
        <div className="row u-gap-8" >
          <select value={bd[1]} onChange={e => setBd([bd[0], e.target.value])}><option value="">Jour</option>{[...Array(31)].map((_, k) => { const v = String(k + 1).padStart(2, '0'); return <option key={v} value={v}>{k + 1}</option> })}</select>
          <select value={bd[0]} onChange={e => setBd([e.target.value, bd[1]])}><option value="">Mois</option>{['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'].map((m, k) => { const v = String(k + 1).padStart(2, '0'); return <option key={v} value={v}>{m}</option> })}</select>
        </div>
        <button className="btn ghost" onClick={saveInfo}>Enregistrer la fiche</button>
        {mission && <div className={('card mission' + (s.mission_done ? ' done' : '')) + ' u-mt-14'} >
          <div className="sub">Mission de la semaine</div>
          <div className="u-fw-600 u-m-4px-0-10px">{mission}</div>
          {s.mission_done ? <div className="acc"><i className="ti ti-check" /> Validée · +{RV.mission}</div>
            : <button className="mini" onClick={() => { act('daraja_admin_validate_mission', { p_staff: s.id }, 'Mission validée · +' + RV.mission); close() }}>Valider la mission · +{RV.mission}</button>}
        </div>}
        {!self && (s.role !== 'admin' || me.role === 'super') && <button className="btn ghost u-mt-10"  onClick={resetPin}><i className="ti ti-key" /> Code oublié : en générer un nouveau</button>}
        {newPin && <div className="sheet center" onClick={() => setNewPin(null)}><div className="lvup" onClick={e => e.stopPropagation()}><PinShow who={s.name} pin={newPin.pin} phone={newPin.phone} close={() => setNewPin(null)} /></div></div>}
        {!self && <>
        <div className="sec">Bonus</div>
        <div className="grid2 u-mb-10" >
          {opts.map(o => <button key={o[1]} className={('opt ' + (pick === o ? 'sel' : '')) + ' u-m-0 u-ta-center'}  onClick={() => setPick(o)}>
            <i className={('ti ' + o[2]) + ' u-c-good'}  /> +{o[0]}</button>)}
        </div>
        {pick && <>
          <input placeholder="Motif (facultatif)" value={note} onChange={e => setNote(e.target.value)} />
          <button className="btn" onClick={() => { act('daraja_admin_points', { p_staff: s.id, p_kind: 'bonus', p_amount: pick[0], p_note: note || pick[1] }, '+' + pick[0] + ' pts · ' + s.name); close() }}>Donner +{pick[0]}</button>
        </>}
        </>}
        <div className="sub u-mt-10" >{self ? 'Les bonus pour toi-même sont donnés par la direction' : 'Pour une faute, passe par l\'onglet Conduite'}</div>
      </div>
    </div>
  )
}

function AddStaff({ token, me, venue, close, done }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('staff')
  const [post, setPost] = useState('')
  const [made, setMade] = useState(null)
  const [phone, setPhone] = useState('')
  const [err, setErr] = useState('')
  const save = async () => {
    if (!name.trim()) { setErr('Entre un prénom'); return }
    try {
      const r = await rpc('daraja_admin_add_staff2', { p_token: token, p_name: name, p_pin: '', p_role: role, p_venue: venue || me.venue, p_post: post || null, p_phone: phone })
      if (r.ok) setMade({ ...r, name: name.trim() })
      else setErr(r.error === 'phone' ? 'Numéro invalide' : 'Vérifie les champs')
    } catch { setErr('Erreur, réessaie') }
  }
  return (
    <div className="sheet" onClick={close}>
      <div onClick={e => e.stopPropagation()} className="u-maxh-88dvh u-oy-auto">
        {made ? <PinShow who={made.name} pin={made.pin} phone={made.phone} close={done} /> : <>
        <h1>Nouvel équipier</h1>
        <div className="sub u-mb-14" >{me.venue_name}</div>
        <input placeholder="Prénom et nom" value={name} onChange={e => { setName(e.target.value); setErr('') }} />
        <PostSelect token={token} value={post} onChange={setPost} />
        <input placeholder="WhatsApp (facultatif)" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} />
        {me.role === 'super' && <div className="seg">
          <button className={role === 'staff' ? 'on' : ''} onClick={() => setRole('staff')}>Équipier</button>
          <button className={role === 'admin' ? 'on' : ''} onClick={() => setRole('admin')}>Manager</button>
        </div>}
        <div className="err">{err}</div>
        <button className="btn" onClick={save}>Ajouter</button>
        <div className="sub u-mt-8 u-ta-center" >Le code à 6 chiffres est créé automatiquement</div>
        </>}
      </div>
    </div>
  )
}

function ErrorsAdmin({ token }) {
  const [days, setDays] = useState(7)
  const [list, setList] = useState(null)
  const [open, setOpen] = useState(null)
  useEffect(() => { setList(null); rpc('daraja_admin_errors', { p_token: token, p_days: days }).then(setList).catch(() => setList([])) }, [token, days])
  const ago = t => { const m = Math.round((Date.now() - new Date(t)) / 60000); return m < 60 ? m + ' min' : m < 1440 ? Math.round(m / 60) + ' h' : Math.round(m / 1440) + ' j' }
  return (
    <>
      <div className="seg u-mt-10" >{[[1, '24 h'], [7, '7 jours'], [30, '30 jours']].map(([d, l]) => <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{l}</button>)}</div>
      {!list ? <div className="sub">Chargement…</div> : !list.length ? (
        <div className="card u-ta-center u-p-24" ><i className="ti ti-circle-check u-fs-34 u-c-good"  /><div className="u-fw-600 u-mt-6">Aucune erreur</div><div className="sub">Tout tourne bien sur les téléphones</div></div>
      ) : list.map((e, k) => (
        <div key={k} className="card u-p-12 u-cur-pointer"  onClick={() => setOpen(open === k ? null : k)}>
          <div className="row between"><b className="u-fs-14 u-c-bad">{e.hits}×</b><span className="sub">il y a {ago(e.last_at)}</span></div>
          <div className="u-fs-14 u-m-4px-0 u-wb-break-word">{e.message}</div>
          <div className="sub">{e.place || '?'} · {e.people > 1 ? e.people + ' personnes' : e.who}</div>
          {open === k && <div className="sub u-mt-8 u-fs-11 u-ws-pre-wrap u-wb-break-all" >{(e.detail || '').slice(0, 600)}{'\n'}{e.agent}</div>}
        </div>
      ))}
    </>
  )
}

export { ErrorsAdmin, Admin, ContactsAdmin, StaffSheet, AddStaff }
