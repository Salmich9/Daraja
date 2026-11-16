import React, { useEffect, useState, useCallback } from 'react'
import { rpc } from '../lib'
import { Info } from '../ui'
import { pushKick } from '../push'

// Formation vente : fiches de la carte (histoire, accords, phrase à dire) et « à vendre » du moment.
const SECTIONS = [['entree', 'Entrées'], ['plat', 'Plats'], ['dessert', 'Desserts']]

// « À vendre » : demandés par le manager, l'équipier déclare chaque vente, le manager valide.
function AsksCard({ token, toast, compact }) {
  const [a, setA] = useState(null)
  const load = useCallback(() => rpc('daraja_asks', { p_token: token }).then(setA).catch(() => setA([])), [token])
  useEffect(() => { load() }, [load])
  if (!a?.length) return null
  const sold = async x => {
    try {
      const r = await rpc('daraja_sale_declare', { p_token: token, p_ask: x.id })
      if (r.ok) { toast('Envoyé au manager 🎯'); pushKick(token); load() }
      else toast({ cap: 'Plafond du jour atteint', closed: 'Demande terminée', role: 'Réservé aux équipiers' }[r.error] || 'Impossible')
    } catch { toast('Erreur') }
  }
  return (
    <div className="card rise u-pos-relative">
      <div className="row between">
        <span className="sub"><i className="ti ti-target-arrow acc" /> À vendre</span>
        <Info text="Ton manager te demande de proposer ces plats ou ces accords. Touche « Vendu » après chaque vente : il valide, tu gagnes les pièces. Touche pour fermer." />
      </div>
      {a.slice(0, compact ? 2 : 9).map(x => (
        <div key={x.id} className="lb">
          <div className="u-flex-1 u-min-width-0"><div className="u-fw-600">{x.title}</div>
            <div className="sub">+{x.points} · {x.mine_today ? x.mine_today + ' aujourd\'hui' : 'jusqu\'au ' + new Date(x.ends + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</div></div>
          <button className="mini" onClick={() => sold(x)}>Vendu</button>
        </div>
      ))}
    </div>
  )
}

function FicheSheet({ f, close, edit }) {
  return (
    <div className="sheet" onClick={close}>
      <div onClick={e => e.stopPropagation()} className="u-maxh-88dvh u-oy-auto">
        <div className="row between"><h2 className="u-m-0">{f.title}</h2>{edit && <button className="mini ghost" onClick={edit}><i className="ti ti-pencil" /> Modifier</button>}</div>
        {f.story && <p className="fstory">{f.story}</p>}
        {(f.cocktail || f.wine) && <div className="fpair u-pos-relative">
          {f.cocktail && <div><i className="ti ti-glass-cocktail acc" /> {f.cocktail}</div>}
          {f.wine && <div><i className="ti ti-glass-full acc" /> {f.wine}</div>}
          {f.why && <span className="fwhy"><Info text={f.why + ' Touche pour fermer.'} /></span>}
        </div>}
        {f.pitch && <><div className="sec">À dire au client</div><div className="fpitch">{f.pitch}</div></>}
        <button className="btn ghost u-mt-14" onClick={close}>Fermer</button>
      </div>
    </div>
  )
}

const FIELDS = [['title', 'Nom du plat'], ['story', 'Histoire'], ['cocktail', 'Cocktail conseillé'], ['wine', 'Vin conseillé'], ['why', 'Pourquoi cet accord'], ['pitch', 'Phrase à dire au client']]
function FicheEdit({ token, venue, f, close, done, toast }) {
  const [v, setV] = useState({ section: 'plat', ...f })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try { const r = await rpc('daraja_fiche_save', { p_token: token, p_venue: venue, p_fiche: v }); if (r.ok) { toast('Fiche enregistrée'); done() } else toast(r.error === 'title' ? 'Donne un nom au plat' : 'Impossible') }
    catch { toast('Erreur') }
    setBusy(false)
  }
  const del = async () => { try { await rpc('daraja_fiche_delete', { p_token: token, p_fiche: f.id }); toast('Fiche retirée'); done() } catch { toast('Erreur') } }
  return (
    <div className="sheet" onClick={close}>
      <div onClick={e => e.stopPropagation()} className="u-maxh-88dvh u-oy-auto">
        <div className="chips">{SECTIONS.map(([k, l]) => <button key={k} className={'chip ' + (v.section === k ? 'on' : '')} onClick={() => setV({ ...v, section: k })}>{l}</button>)}</div>
        {FIELDS.map(([k, l]) => <React.Fragment key={k}><div className="sub u-m-6px-0-4px">{l}</div>
          {['story', 'why', 'pitch'].includes(k) ? <textarea rows={3} value={v[k] || ''} onChange={e => setV({ ...v, [k]: e.target.value })} />
            : <input value={v[k] || ''} onChange={e => setV({ ...v, [k]: e.target.value })} />}</React.Fragment>)}
        <button className="btn u-mt-14" disabled={busy} onClick={save}>Enregistrer</button>
        {f.id && <button className="btn ghost u-mt-8" onClick={del}>Retirer la fiche</button>}
      </div>
    </div>
  )
}

function Formation({ token, venue, toast }) {
  const [d, setD] = useState(null)
  const [sec, setSec] = useState('plat')
  const [open, setOpen] = useState(null)
  const [edit, setEdit] = useState(null)
  const load = useCallback(() => rpc('daraja_fiches', { p_token: token, p_venue: venue }).then(setD).catch(() => setD({ items: [] })), [token, venue])
  useEffect(() => { load() }, [load])
  if (!d) return <div className="page sub">Chargement…</div>
  const list = d.items.filter(f => f.section === sec)
  return (
    <div className="page">
      <div className="row between u-mb-6">
        <h1 className="u-m-0">Carte & ventes</h1>
        {d.can_edit && <button className="mini" onClick={() => setEdit({ section: sec })}><i className="ti ti-plus" /> Fiche</button>}
      </div>
      <AsksCard token={token} toast={toast} />
      <div className="tabs">{SECTIONS.map(([k, l]) => <button key={k} className={sec === k ? 'on' : ''} onClick={() => setSec(k)}>{l}</button>)}</div>
      {!list.length && <div className="sub">Aucune fiche pour l'instant</div>}
      {list.map(f => (
        <div key={f.id} className="card fiche u-cur-pointer" onClick={() => setOpen(f)}>
          <div className="u-fw-600">{f.title}</div>
          <div className="sub fmini">{f.cocktail && <span><i className="ti ti-glass-cocktail" /> {f.cocktail}</span>}{f.wine && <span><i className="ti ti-glass-full" /> {f.wine}</span>}</div>
        </div>
      ))}
      {open && <FicheSheet f={open} close={() => setOpen(null)} edit={d.can_edit ? () => { setEdit(open); setOpen(null) } : null} />}
      {edit && <FicheEdit token={token} venue={d.venue} f={edit} toast={toast} close={() => setEdit(null)} done={() => { setEdit(null); load() }} />}
    </div>
  )
}

export { Formation, AsksCard }
