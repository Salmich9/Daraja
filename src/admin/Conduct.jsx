import React, { useEffect, useState, useCallback } from 'react'
import { dshort, rpc } from '../lib'
import { Pill } from '../ui'

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
          <div style={{ color: 'var(--bad)', fontWeight: 600, fontSize: 14, marginTop: 4 }}>Malus −{prev.malus} pièces</div>
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
          <div className="sub">Par {r.by} · −{r.malus} pièces · {r.ack ? 'lu par le salarié' : 'pas encore lu'}</div>
          {r.line === 'rouge' && !r.notified && me.role === 'super' && <button className="mini" style={{ marginTop: 8 }} onClick={e => { e.stopPropagation(); notify(r.id) }}>Notification signée remise</button>}
        </div>
      )}
    </div>
  ))
}

export { Conduct, ConductAdd, Register }
