import React, { useEffect, useState, useCallback } from 'react'
import { rpc } from '../lib'
import { Info } from '../ui'

// « À vendre » : le manager choisit un plat ou un accord, les pièces par vente et la durée.
export default function Asks({ token, venue, toast }) {
  const [list, setList] = useState(null)
  const [fiches, setFiches] = useState([])
  const [f, setF] = useState({ title: '', fiche: '', points: 20, days: 7, note: '' })
  const load = useCallback(() => rpc('daraja_admin_asks', { p_token: token, p_venue: venue }).then(setList).catch(() => setList([])), [token, venue])
  useEffect(() => { load(); rpc('daraja_fiches', { p_token: token, p_venue: venue }).then(d => setFiches(d.items || [])).catch(() => {}) }, [load, token, venue])
  const pick = id => { const x = fiches.find(y => y.id === id); setF({ ...f, fiche: id, title: x ? x.title + (x.wine ? ' + ' + x.wine : '') : f.title }) }
  const save = async () => {
    try {
      const r = await rpc('daraja_ask_save', { p_token: token, p_venue: venue, p_ask: f })
      if (r.ok) { toast('Demande envoyée à l\'équipe 🎯'); setF({ title: '', fiche: '', points: 20, days: 7, note: '' }); load() }
      else toast(r.error === 'title' ? 'Écris ce qu\'il faut vendre' : 'Vérifie les champs')
    } catch { toast('Erreur') }
  }
  const stop = async id => { try { await rpc('daraja_ask_stop', { p_token: token, p_ask: id }); load() } catch { toast('Erreur') } }
  const step = (k, d, lo, hi) => <span className="stepper"><button className="mini ghost" aria-label="moins" disabled={f[k] <= lo} onClick={() => setF({ ...f, [k]: f[k] - d })}><i className="ti ti-minus" /></button><b>{f[k]}</b><button className="mini ghost" aria-label="plus" disabled={f[k] >= hi} onClick={() => setF({ ...f, [k]: f[k] + d })}><i className="ti ti-plus" /></button></span>
  return <>
    <div className="sec u-pos-relative">Nouvelle demande <Info text="L'équipe voit la demande sur l'accueil et touche « Vendu » après chaque vente. Tu valides dans Équipe, comme les avis clients. Touche pour fermer." /></div>
    <select value={f.fiche} onChange={e => pick(e.target.value)}><option value="">Choisir un plat (facultatif)</option>{fiches.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select>
    <input className="u-mt-8" placeholder="À vendre : plat, accord ou combinaison" maxLength={80} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
    <div className="tog"><span>Pièces par vente</span>{step('points', 5, 5, 200)}</div>
    <div className="tog"><span>Pendant (jours)</span>{step('days', 1, 1, 31)}</div>
    <button className="btn u-mt-10" onClick={save}>Envoyer à l'équipe</button>
    <div className="sec">En cours</div>
    {!list ? <div className="sub">Chargement…</div> : !list.length ? <div className="sub">Aucune demande</div> : list.map(a => (
      <div key={a.id} className="lb">
        <div className="u-flex-1 u-min-width-0"><div className="u-fw-600">{a.title}</div>
          <div className="sub">+{a.points} · {a.sold} vendu{a.sold > 1 ? 's' : ''}{a.pending ? ' · ' + a.pending + ' à valider' : ''}{a.live ? '' : ' · terminée'}</div></div>
        {a.live && <button className="mini ghost" onClick={() => stop(a.id)}>Arrêter</button>}
      </div>
    ))}
  </>
}
