import React, { useEffect, useState, useCallback } from 'react'
import { sfx, TIERS, burst, fmt, rpc, waLink } from '../lib'

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
      if (r.ok) { setClaim(sel); burst(60); sfx('coin'); refresh(); load() }
      else toast(r.error === 'blocked' ? 'Boutique bloquée suite à une faute grave' : r.error === 'conditions' ? 'Une condition n\'est pas encore remplie' : r.error === 'stock' ? 'Plus en stock' : 'Pas assez de pièces')
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
        <div className="u-fs-14 u-m-6px-0 u-minh-36">{r.name}</div>
        <div className="bar u-m-0-0-6px" ><div style={{ width: pct + '%' }} /></div>
        <div className={(ok || near ? 'acc' : 'sub') + ' u-fw-600 u-fs-13'} >{ok ? fmt(r.cost) + ' pièces' : 'encore ' + fmt(r.cost - me.points)}</div>
        {unmet.length > 0 && <div className="lockline"><i className="ti ti-lock" /> {unmet.length} condition{unmet.length > 1 ? 's' : ''}</div>}
        {r.stock != null && r.stock <= 3 && <div className="sub u-fs-11" >Plus que {r.stock}</div>}
      </div>
    )
  }
  const tiers = items ? [...TIERS, [null, 'Autres']].map(([k, l]) => [l, items.filter(r => k ? r.tier === k : !TIERS.find(t => t[0] === r.tier))]).filter(([, l]) => l.length) : []
  return (
    <div className="page">
      <div className="row between u-mb-6" >
        <h1>Boutique</h1>
        <div className="acc u-fw-600" >{fmt(me.points)} <i className="ti ti-coin coin" /></div>
      </div>
      {!items ? <div className="sub">Chargement…</div> : tiers.map(([l, list]) => (
        <div key={l}>
          <div className="sec">{l}</div>
          <div className="grid2">{list.map(card)}</div>
        </div>
      ))}
      {claim && <div className="sheet" onClick={() => setClaim(null)}>
        <div onClick={e => e.stopPropagation()} className="u-ta-center">
          <i className={('ti ti-' + claim.icon + ' acc pop') + ' u-fs-48'}  />
          <h1>Gagné !</h1>
          <div className="sub u-mb-18" >{claim.name} · ton manager a été prévenu dans l'appli</div>
          {mgr && <a className="btn wa" href={waLink(mgr.phone, `Bonjour${mgr.name ? ' ' + mgr.name.split(' ')[0] : ''} ! J'ai gagné le cadeau « ${claim.name} » sur Daraja (${fmt(claim.cost)} pièces). Quand est-ce que je peux le récupérer ? ${me.name}, ${me.venue_name}`)} target="_blank" rel="noreferrer"><i className="ti ti-brand-whatsapp" /> Réclamer sur WhatsApp</a>}
          <button className="btn ghost u-mt-10"  onClick={() => setClaim(null)}>Plus tard</button>
        </div>
      </div>}
      {sel && (() => {
        const unmet = (sel.checks || []).filter(c => !c.ok)
        const enough = me.points >= sel.cost
        return <div className="sheet" onClick={() => setSel(null)}>
          <div onClick={e => e.stopPropagation()} className="u-ta-center">
            <i className={('ti ti-' + sel.icon + ' acc') + ' u-fs-40'}  />
            <h1>{sel.name}</h1>
            <div className="sub u-mb-10" >{fmt(sel.cost)} pièces · le manager te le remet</div>
            {(sel.checks || []).map(c => (
              <div key={c.key} className="cond">
                <i className={'ti ti-' + (c.ok ? 'circle-check' : 'circle-x')} style={{ color: c.ok ? 'var(--good)' : 'var(--bad)', fontSize: 18 }} />
                <span className="u-flex-1">{c.label}{c.key === 'days' && !c.ok ? ' · ' + c.have + '/' + c.need : ''}</span>
              </div>
            ))}
            <div className="u-h-14" />
            {enough && !unmet.length ? <button className="btn" onClick={buy}>Échanger</button>
              : <div className="sub u-mb-6" >{!enough ? 'Plus que ' + fmt(sel.cost - me.points) + ' pièces' : 'Encore un petit effort sur les conditions'}</div>}
            <button className="btn ghost u-mt-10"  onClick={() => setSel(null)}>Fermer</button>
          </div>
        </div>
      })()}
    </div>
  )
}

export { Shop }
