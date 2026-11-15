import React, { useEffect, useState, useCallback } from 'react'
import { first, iso, monday, rpc } from '../lib'

const ATT = [
  ['present', 'Présent', '✓'], ['absent', 'Absent', 'A'], ['conge', 'Congé', 'C'], ['recup', 'Récup', 'R'],
  ['maladie', 'Maladie', 'M'], ['autorise', 'Autorisé', 'Au'], ['repos', 'Repos', 'Rp'],
]

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

export { ATT, Attendance, AttEdit }
