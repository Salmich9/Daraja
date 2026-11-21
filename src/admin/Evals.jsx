import React, { useEffect, useState, useCallback } from 'react'
import { rpc, dshort, EVL, FAM } from '../lib'
import { Avatar, Info } from '../ui'

// Admin › Équipe › Évaluations : le manager remplit la fiche quand il veut, la direction valide ou renvoie.
// Admin › Réglages › Évaluation (direction) : la grille, les thèmes liés et les valeurs réglables.

const ago = t => { const d = Math.floor((Date.now() - new Date(t)) / 86400000); return d < 1 ? "aujourd'hui" : d === 1 ? 'hier' : 'il y a ' + d + ' j' }

function Steps({ lv, set, label }) {
  return <div className="esteps">{[1, 2, 3, 4].map(n => <button key={n} aria-label={label + ' : ' + EVL[n - 1]} className={n <= (lv || 0) ? 'on' : ''} onClick={() => set(n)} />)}</div>
}

function Spark({ pts }) {
  const W = 104, H = 30, n = pts.length
  if (!n) return <span className="sub">–</span>
  const x = i => n === 1 ? W / 2 : 4 + i * (W - 8) / (n - 1), y = v => H - 4 - (v - 1) * (H - 8) / 3
  return (
    <svg className="spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {[1, 2, 3, 4].map(v => <line key={v} x1="0" x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />)}
      <polyline points={pts.map((v, i) => v == null ? null : x(i) + ',' + y(v)).filter(Boolean).join(' ')} fill="none" stroke="var(--acc)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((v, i) => v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={i === n - 1 ? 3.5 : 2.5} fill="var(--acc)" />)}
    </svg>
  )
}

function EvalSheet({ token, id, close, done, toast }) {
  const [d, setD] = useState(null)
  const [view, setView] = useState('eval')
  const [sc, setSc] = useState({})
  const [goal, setGoal] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    rpc('daraja_eval_sheet', { p_token: token, p_staff: id }).then(x => {
      setD(x); setSc({ ...(x.last?.scores || {}), ...(x.open?.scores || {}) }); setGoal(x.open ? x.open.goal || '' : x.last?.goal || '')
    }).catch(() => { toast('Erreur'); close() })
  }, [token, id])
  if (!d) return <div className="sheet" onClick={close}><div onClick={e => e.stopPropagation()}><div className="sub">Chargement…</div></div></div>
  const crit = d.criteria, left = crit.filter(c => !sc[c.id]).length
  const prev = d.last?.scores || {}
  const save = async () => {
    setBusy(true)
    try {
      const r = await rpc('daraja_eval_save', { p_token: token, p_staff: id, p_scores: sc, p_goal: goal })
      if (!r.ok) { toast(r.error === 'missing' ? 'Note chaque critère' : 'Vérifie la fiche'); setBusy(false); return }
      toast(r.status === 'ok' ? 'Fiche validée' + (r.coins ? ' · +' + r.coins + ' pièces' : '') : 'Envoyée à la direction'); done()
    } catch { toast('Erreur'); setBusy(false) }
  }
  const group = (kind, title) => {
    const list = crit.filter(c => c.kind === kind)
    if (!list.length) return null
    return <>
      <div className="sec">{title}</div>
      {list.map(c => { const lv = sc[c.id], up = prev[c.id] && lv > prev[c.id]; return (
        <div key={c.id} className="ecrit">
          <div className="row between"><span>{c.label}{up && <i className="ti ti-arrow-up-right u-c-good u-ml-4" />}</span><span className={'elv l' + (lv || 0)}>{lv ? EVL[lv - 1] : 'À noter'}</span></div>
          <Steps lv={lv} label={c.label} set={n => setSc({ ...sc, [c.id]: n })} />
          {c.n >= 5 && <div className="sub u-mt-6">Défis : {c.acc} %</div>}
        </div>) })}
    </>
  }
  const hist = d.history || []
  return (
    <div className="sheet" onClick={close}>
      <div onClick={e => e.stopPropagation()} className="u-maxh-90dvh u-oy-auto">
        <div className="row u-mb-12"><Avatar value={d.staff.avatar} name={d.staff.name} size={46} />
          <div><h1 className="u-m-0">{d.staff.name}</h1><div className="sub">{d.staff.role === 'admin' ? 'Manager' : d.staff.post_label || 'Poste à définir'}{d.last ? ' · dernière fiche ' + dshort(d.last.at) : ''}</div></div></div>
        <div className="seg"><button className={view === 'eval' ? 'on' : ''} onClick={() => setView('eval')}>Fiche</button><button className={view === 'prog' ? 'on' : ''} onClick={() => setView('prog')}>Progression</button></div>
        {view === 'eval' ? <>
          {d.open?.status === 'returned' && <div className="card ereturn"><div className="u-fw-600"><i className="ti ti-arrow-back-up" /> Renvoyée par la direction</div>{d.open.note && <div className="u-mt-4">{d.open.note}</div>}</div>}
          {d.open?.status === 'pending' && !d.can_validate && <div className="sub u-mb-8"><i className="ti ti-hourglass" /> En attente de la direction · encore modifiable</div>}
          {group('metier', 'Métier')}
          {group('savoir', 'Savoir-être')}
          <div className="sec">Objectif du mois</div>
          <input maxLength={140} placeholder="Ex. Proposer un vin à chaque table" value={goal} onChange={e => setGoal(e.target.value)} />
          <button className="btn" disabled={left > 0 || busy} onClick={save}>{d.can_validate ? 'Valider la fiche' : 'Envoyer à la direction'}</button>
          {left > 0 && <div className="sub u-ta-center u-mt-8">Encore {left} critère{left > 1 ? 's' : ''} à noter</div>}
        </> : <>
          {d.axes.length > 0 && <div className="card"><div className="sub u-pos-relative">Axes du mois <Info text="Les 2 critères métier les plus faibles, d'après la note du manager et les résultats aux défis. Le défi du jour leur réserve des questions." /></div>
            <div className="chips">{d.axes.map(a => <span key={a.id} className="echip ax"><i className="ti ti-target-arrow" /> {a.label}</span>)}</div></div>}
          {!hist.length ? <div className="card u-ta-center u-p-24"><i className="ti ti-chart-line acc u-fs-34" /><div className="sub u-mt-6">Pas encore de fiche validée</div></div> : <>
            <div className="sub u-mb-6">{hist.length > 1 ? dshort(hist[0].at) + ' → ' + dshort(hist[hist.length - 1].at) : dshort(hist[0].at)}</div>
            {crit.map(c => { const pts = hist.map(h => h.scores[c.id] ?? null), last = pts[pts.length - 1]; return (
              <div key={c.id} className="lb">
                <div className="u-flex-1 u-min-width-0"><div className="u-fs-14">{c.label}</div><div className={'elv l' + (last || 0)}>{last ? EVL[last - 1] : '–'}</div></div>
                <Spark pts={pts} />
              </div>) })}
          </>}
        </>}
      </div>
    </div>
  )
}

function Validate({ token, p, close, done, toast }) {
  const [back, setBack] = useState(false)
  const [note, setNote] = useState('')
  const go = async ok => {
    try {
      const r = await rpc('daraja_eval_validate', { p_token: token, p_eval: p.id, p_ok: ok, p_note: note })
      if (!r.ok) { toast('Déjà traitée'); done(); return }
      toast(ok ? 'Validée' + (r.coins ? ' · +' + r.coins + ' pièces' : '') : 'Renvoyée au manager'); done()
    } catch { toast('Erreur') }
  }
  return (
    <div className="sheet" onClick={close}>
      <div onClick={e => e.stopPropagation()} className="u-maxh-90dvh u-oy-auto">
        <div className="row u-mb-12"><Avatar value={p.avatar} name={p.name} size={46} />
          <div><h1 className="u-m-0">{p.name}</h1><div className="sub">{p.venue_name} · par {p.by || '?'} · {dshort(p.at)}</div></div></div>
        {['metier', 'savoir'].map(k => <React.Fragment key={k}>
          <div className="sec">{k === 'metier' ? 'Métier' : 'Savoir-être'}</div>
          {p.items.filter(i => i.kind === k).map(i => (
            <div key={i.label} className="tog"><span>{i.label}</span>
              <span className={'elv l' + i.lv}>{i.prev != null && i.lv !== i.prev && <i className={'ti ' + (i.lv > i.prev ? 'ti-arrow-up-right u-c-good' : 'ti-arrow-down-right')} />} {EVL[i.lv - 1]}</span></div>))}
        </React.Fragment>)}
        {p.goal && <div className="card u-mt-12"><div className="sub">Objectif du mois</div><div className="u-fw-600">{p.goal}</div></div>}
        {back ? <>
          <textarea rows={2} className="u-mt-12" placeholder="Un mot pour le manager" value={note} onChange={e => setNote(e.target.value)} />
          <button className="btn" onClick={() => go(false)}>Renvoyer au manager</button>
        </> : <div className="row u-gap-8 u-mt-14">
          <button className="btn ghost" onClick={() => setBack(true)}><i className="ti ti-arrow-back-up" /> Renvoyer</button>
          <button className="btn" onClick={() => go(true)}><i className="ti ti-check" /> Valider</button>
        </div>}
      </div>
    </div>
  )
}

export default function Evals({ token, me, venue, toast }) {
  const [d, setD] = useState(null)
  const [open, setOpen] = useState(null)
  const [val, setVal] = useState(null)
  const load = useCallback(() => rpc('daraja_eval_team', { p_token: token, p_venue: venue }).then(setD).catch(() => setD({ people: [], pending: [] })), [token, venue])
  useEffect(() => { load() }, [load])
  if (!d) return <div className="sub">Chargement…</div>
  const ppl = d.people, up = ppl.filter(p => p.trend === 'up').length, flat = ppl.filter(p => p.trend === 'flat').length, never = ppl.filter(p => !p.last).length
  return <>
    {d.pending.length > 0 && <>
      <div className="sec"><i className="ti ti-checklist acc" /> À valider · {d.pending.length}</div>
      {d.pending.map(p => (
        <div key={p.id} className="lb u-cur-pointer evpend" onClick={() => setVal(p)}>
          <Avatar value={p.avatar} name={p.name} />
          <div className="u-flex-1 u-min-width-0"><div>{p.name}</div><div className="sub">{p.venue !== me.venue ? p.venue_name + ' · ' : ''}par {p.by || '?'} · {ago(p.at)}</div></div>
          <i className="ti ti-chevron-right sub" />
        </div>))}
    </>}
    <div className="kpis k3 u-mt-12">
      <div className="card"><b>{up}</b><span className="sub">progressent</span></div>
      <div className="card"><b>{flat}</b><span className="sub">stagnent</span></div>
      <div className="card"><b>{never}</b><span className="sub">jamais évalués</span></div>
    </div>
    <div className="sec u-pos-relative"><i className="ti ti-users acc" /> Équipe <Info text={(d.can_validate ? 'Ta fiche est validée tout de suite. ' : 'Ta fiche part à la direction : rien ne compte avant sa validation. ') + 'Les plus anciennes en premier. Touche pour fermer.'} /></div>
    {!ppl.length && <div className="sub">Personne à évaluer</div>}
    {ppl.map(p => (
      <div key={p.id} className="lb u-cur-pointer evrow" onClick={() => setOpen(p.id)}>
        <Avatar value={p.avatar} name={p.name} />
        <div className="u-flex-1 u-min-width-0">
          <div>{p.name}{p.role === 'admin' && <span className="sub"> · manager</span>}</div>
          <div className="sub">{p.last ? ago(p.last) : 'Jamais évalué'}{p.post_label && p.role !== 'admin' ? ' · ' + p.post_label : ''}</div>
        </div>
        {p.open === 'pending' && <span className="pill epend">À valider</span>}
        {p.open === 'returned' && <span className="pill eback">Renvoyée</span>}
        {!p.open && p.trend === 'up' && <i className="ti ti-trending-up u-c-good" aria-label="Progresse" />}
        <i className="ti ti-chevron-right sub" />
      </div>
    ))}
    {open && <EvalSheet token={token} id={open} close={() => setOpen(null)} done={() => { setOpen(null); load() }} toast={toast} />}
    {val && <Validate token={token} p={val} close={() => setVal(null)} done={() => { setVal(null); load() }} toast={toast} />}
  </>
}

const FAMS = [...Object.keys(FAM).map(k => [k, k === 'support' ? 'Support' : FAM[k]]), ['manager', 'Managers'], ['', 'Tous']]

function CritEdit({ c, cats, close, save, del }) {
  const [f, setF] = useState({ label: '', kind: 'metier', family: '', cats: [], ...c })
  const set = (k, v) => setF({ ...f, [k]: v })
  const [sure, setSure] = useState(false)
  const tog = k => set('cats', f.cats.includes(k) ? f.cats.filter(x => x !== k) : [...f.cats, k])
  return (
    <div className="sheet" onClick={close}>
      <div onClick={e => e.stopPropagation()} className="u-maxh-90dvh u-oy-auto">
        <h1>{c.id ? 'Modifier le critère' : 'Nouveau critère'}</h1>
        <input maxLength={60} placeholder="Intitulé" value={f.label} onChange={e => set('label', e.target.value)} />
        <div className="seg"><button className={f.kind === 'metier' ? 'on' : ''} onClick={() => set('kind', 'metier')}>Métier</button><button className={f.kind === 'savoir' ? 'on' : ''} onClick={() => set('kind', 'savoir')}>Savoir-être</button></div>
        <select value={f.family || ''} onChange={e => set('family', e.target.value)}>{FAMS.map(([k, l]) => <option key={k} value={k}>{k ? l : 'Pour tous'}</option>)}</select>
        {f.kind === 'metier' && <>
          <div className="sub u-m-6px-0-4px u-pos-relative">Thèmes des défis <Info text="Les questions de ces thèmes servent à mesurer ce critère et à le travailler dans le défi du jour. Touche pour fermer." /></div>
          <div className="chips u-mb-10">{cats.map(t => <button key={t.key} className={'chip' + (f.cats.includes(t.key) ? ' on' : '')} onClick={() => tog(t.key)}>{t.label}</button>)}</div>
        </>}
        <button className="btn u-mt-12" onClick={() => save(f)}>Enregistrer</button>
        {c.id && (sure ? <button className="btn danger u-mt-8" onClick={() => del(c)}>Oui, retirer</button> : <button className="btn ghost u-mt-8" onClick={() => setSure(true)}>Retirer le critère</button>)}
      </div>
    </div>
  )
}

export function EvalGrid({ token, toast }) {
  const [d, setD] = useState(null)
  const [fam, setFam] = useState('salle')
  const [ed, setEd] = useState(null)
  const [old, setOld] = useState(false)
  const load = useCallback(() => rpc('daraja_admin_eval_criteria', { p_token: token }).then(setD).catch(() => toast('Erreur')), [token])
  useEffect(() => { load() }, [load])
  if (!d) return <div className="sub">Chargement…</div>
  const of = c => (c.family || '') === fam
  const act = d.criteria.filter(c => c.active), off = d.criteria.filter(c => !c.active)
  const lab = k => (d.cats.find(t => t.key === k) || { label: k }).label
  const save = async f => {
    try { const r = await rpc('daraja_admin_eval_criterion_save', { p_token: token, p: { ...f, family: f.family || null } }); if (r.ok) { toast('Critère enregistré'); setEd(null); load() } else toast(r.error === 'label' ? 'Donne un intitulé' : 'Vérifie les champs') } catch { toast('Erreur') }
  }
  const del = async c => { try { const r = await rpc('daraja_admin_eval_criterion_delete', { p_token: token, p_id: c.id }); toast(r.archived ? 'Critère retiré (gardé dans l\'historique)' : 'Critère supprimé'); setEd(null); load() } catch { toast('Erreur') } }
  const setVal = async (k, v) => { try { const r = await rpc('daraja_admin_eval_value', { p_token: token, p_key: k, p_val: v }); toast(r.ok ? 'Enregistré' : 'Valeur hors limites'); load() } catch { toast('Erreur') } }
  const VALS = [['eval_up', 'Pièces', 200], ['eval_cap', 'Plafond', 1000], ['eval_target', 'Ciblées /5', 4], ['eval_weight', 'Note %', 100]]
  return <>
    <div className="sec u-pos-relative">Valeurs <Info text="Pièces : par niveau gagné au-dessus du meilleur déjà atteint. Plafond : maximum par fiche. Ciblées : questions du défi du jour qui visent les 2 axes. Note % : part de la note du manager dans le calcul des axes, le reste vient des défis. Touche pour fermer." /></div>
    <div className="lgrid">{VALS.map(([k, l, max]) => (
      <label key={k} className="lcell"><span>{l}</span>
        <input inputMode="numeric" defaultValue={d.values[k]} onBlur={e => { const v = Math.min(max, parseInt(e.target.value.replace(/\D/g, '') || '0', 10)); if (v !== d.values[k]) setVal(k, v) }} /></label>))}</div>
    <div className="tabs">{FAMS.map(([k, l]) => <button key={k} className={fam === k ? 'on' : ''} onClick={() => setFam(k)}>{l} · {act.filter(c => (c.family || '') === k).length}</button>)}</div>
    <button className="btn ghost u-mt-10" onClick={() => setEd({ family: fam, kind: fam ? 'metier' : 'savoir' })}><i className="ti ti-plus" /> Nouveau critère</button>
    {act.filter(of).map(c => (
      <div key={c.id} className="lb u-cur-pointer" onClick={() => setEd(c)}>
        <div className="u-flex-1 u-min-width-0"><div className="u-fs-14">{c.label}</div>
          <div className="sub">{c.kind === 'savoir' ? 'Savoir-être' : c.cats.length ? c.cats.map(lab).join(' · ') : 'Métier · sans thème de défi'}</div></div>
        <i className="ti ti-chevron-right sub" />
      </div>))}
    {off.length > 0 && <div className="u-mt-14">
      <button className="mini ghost" onClick={() => setOld(!old)}><i className={'ti ti-chevron-' + (old ? 'up' : 'down')} /> Critères retirés · {off.length}</button>
      {old && off.map(c => <div key={c.id} className="lb"><div className="u-flex-1 u-min-width-0 sub">{c.label} · {(FAMS.find(x => x[0] === (c.family || '')) || ['', ''])[1]}</div>
        <button className="mini" onClick={async () => { await rpc('daraja_admin_eval_criterion_restore', { p_token: token, p_id: c.id }); toast('Critère remis'); load() }}>Remettre</button></div>)}
    </div>}
    {ed && <CritEdit c={ed} cats={d.cats} close={() => setEd(null)} save={save} del={del} />}
  </>
}
