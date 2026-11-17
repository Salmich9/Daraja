import React, { useEffect, useState, useCallback } from 'react'
import { rpc, fmt } from '../lib'
import { Info } from '../ui'

// Réglages › Charte (direction) : intitulés, ligne, malus par règle, ajout et retrait.
const LINES = [['blanche', 'Blanche'], ['grise', 'Grise'], ['rouge', 'Rouge']]

function Confirm({ label, ask, onYes }) {
  const [sure, setSure] = useState(false)
  return sure ? <button className="btn danger u-mt-8" onClick={onYes}>{ask}</button>
    : <button className="btn ghost u-mt-8" onClick={() => setSure(true)}>{label}</button>
}

function RuleEdit({ r, defaults, close, save, del }) {
  const [f, setF] = useState({ domain: '', behavior: '', base_sanction: '', recid1: '', recid2: '', grave: false, direction_only: false, ...r })
  const set = (k, v) => setF({ ...f, [k]: v })
  const def = f.grave ? defaults.grave : defaults[f.line]
  return (
    <div className="sheet" onClick={close}>
      <div onClick={e => e.stopPropagation()} className="u-maxh-90dvh u-oy-auto">
        <h1>{r.id ? 'Modifier la règle' : 'Nouvelle règle'}</h1>
        <div className="seg">{LINES.map(([k, l]) => <button key={k} className={'ln-' + k + (f.line === k ? ' on' : '')} onClick={() => set('line', k)}>{l}</button>)}</div>
        <div className="sub u-m-6px-0-4px">Comportement</div>
        <textarea rows={2} value={f.behavior} onChange={e => set('behavior', e.target.value)} />
        <div className="sub u-m-6px-0-4px">Thème</div>
        <input value={f.domain} placeholder="Ponctualité, Tenue, Service…" onChange={e => set('domain', e.target.value)} />
        <div className="sub u-m-6px-0-4px u-pos-relative">Malus (pièces) <Info text={'Vide = malus de la ligne (' + def + ' pièces). En cas de récidive qui fait monter de ligne, le malus le plus fort s\'applique. Touche pour fermer.'} /></div>
        <input inputMode="numeric" placeholder={'Par défaut : ' + def} value={f.malus ?? ''} onChange={e => { const v = e.target.value.replace(/\D/g, ''); set('malus', v === '' ? null : Math.min(5000, parseInt(v, 10))) }} />
        <div className="sub u-m-6px-0-4px">Sanction la 1re fois</div>
        <input value={f.base_sanction || ''} onChange={e => set('base_sanction', e.target.value)} />
        <div className="sub u-m-6px-0-4px">Sanction en récidive (2e fois, puis 3e)</div>
        <input value={f.recid1 || ''} onChange={e => set('recid1', e.target.value)} />
        <input className="u-mt-8" value={f.recid2 || ''} onChange={e => set('recid2', e.target.value)} />
        <div className="tog"><span>Faute grave</span><button className={'sw ' + (f.grave ? 'on' : '')} aria-label="Faute grave" onClick={() => set('grave', !f.grave)} /></div>
        <div className="tog"><span>Inscrite par la direction seulement</span><button className={'sw ' + (f.direction_only ? 'on' : '')} aria-label="Direction seulement" onClick={() => set('direction_only', !f.direction_only)} /></div>
        <button className="btn u-mt-12" onClick={() => save(f)}>Enregistrer</button>
        {r.id && <Confirm label="Supprimer la règle" ask="Oui, supprimer" onYes={() => del(r)} />}
      </div>
    </div>
  )
}

export default function Charter({ token, toast }) {
  const [d, setD] = useState(null)
  const [line, setLine] = useState('blanche')
  const [ed, setEd] = useState(null)
  const [old, setOld] = useState(false)
  const load = useCallback(() => rpc('daraja_admin_charter', { p_token: token }).then(setD).catch(() => toast('Erreur')), [token])
  useEffect(() => { load() }, [load])
  if (!d) return <div className="sub">Chargement…</div>
  const save = async f => {
    try { const r = await rpc('daraja_admin_rule_save', { p_token: token, p: f }); if (r.ok) { toast('Règle enregistrée'); setEd(null); load() } else toast(r.error === 'behavior' ? 'Décris le comportement' : 'Vérifie les champs') } catch { toast('Erreur') }
  }
  const del = async r => { try { const x = await rpc('daraja_admin_rule_delete', { p_token: token, p_rule: r.id }); toast(x.archived ? 'Règle retirée (déjà utilisée, gardée dans l\'historique)' : 'Règle supprimée'); setEd(null); load() } catch { toast('Erreur') } }
  const setDef = async (k, v) => { try { await rpc('daraja_admin_line_malus', { p_token: token, p_line: k, p_val: v }); toast('Malus ' + k + ' : ' + v); load() } catch { toast('Erreur') } }
  const act = d.rules.filter(r => r.active), off = d.rules.filter(r => !r.active)
  return <>
    <div className="sec u-pos-relative">Malus par ligne <Info text="Le malus de chaque ligne, utilisé par toutes les règles qui n'ont pas leur propre malus. Touche pour fermer." /></div>
    <div className="lgrid">{[...LINES, ['grave', 'Grave']].map(([k, l]) => (
      <label key={k} className={'lcell ln-' + k}><span>{l}</span>
        <input inputMode="numeric" defaultValue={d.defaults[k]} onBlur={e => { const v = parseInt(e.target.value.replace(/\D/g, '') || '0', 10); if (v !== d.defaults[k]) setDef(k, Math.min(5000, v)) }} /></label>
    ))}</div>
    <div className="row between u-mt-14"><div className="tabs u-m-0">{LINES.map(([k, l]) => <button key={k} className={line === k ? 'on' : ''} onClick={() => setLine(k)}>{l} · {act.filter(r => r.line === k).length}</button>)}</div></div>
    <button className="btn ghost u-mt-10" onClick={() => setEd({ line })}><i className="ti ti-plus" /> Nouvelle règle</button>
    {act.filter(r => r.line === line).map(r => (
      <div key={r.id} className="lb u-cur-pointer" onClick={() => setEd(r)}>
        <div className="u-flex-1 u-min-width-0"><div className="u-fs-14">{r.behavior}</div>
          <div className="sub">{r.domain} · −{fmt(r.malus ?? (r.grave ? d.defaults.grave : d.defaults[r.line]))}{r.malus != null ? ' (propre)' : ''}{r.grave ? ' · grave' : ''}</div></div>
        <i className="ti ti-chevron-right sub" />
      </div>
    ))}
    {off.length > 0 && <div className="u-mt-14">
      <button className="mini ghost" onClick={() => setOld(!old)}><i className={'ti ti-chevron-' + (old ? 'up' : 'down')} /> Règles retirées · {off.length}</button>
      {old && off.map(r => <div key={r.id} className="lb"><div className="u-flex-1 u-min-width-0 sub">{r.behavior}</div>
        <button className="mini" onClick={async () => { await rpc('daraja_admin_rule_restore', { p_token: token, p_rule: r.id }); toast('Règle remise'); load() }}>Remettre</button></div>)}
    </div>}
    {ed && <RuleEdit r={ed} defaults={d.defaults} close={() => setEd(null)} save={save} del={del} />}
  </>
}
