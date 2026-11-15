import React, { useEffect, useState, useCallback } from 'react'
import { FAM, TIERS, burst, first, fmt, iso, rpc, waLink } from '../lib'

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

const DRAW_LOTS = [
  ['Temps', ['½ journée off', 'Journée off payée', 'Choix du planning du mois', 'Départ 1 h plus tôt toute une semaine']],
  ['Expériences', ['Dîner pour 2', 'Brunch pour 2', 'Masterclass mixologie', 'Spa ou hammam', 'Nuit à l\'hôtel', 'Journée piscine']],
  ['Bons et objets', ['Bon Decathlon 300 DH', 'Bon Marjane 300 DH', 'Recharge téléphone 100 DH', 'Écouteurs sans fil', 'Places de cinéma pour 2', 'Place pour un match']],
  ['Gros lot', ['Week-end à Agafay', 'Week-end à Essaouira', 'Formation barista ou WSET', 'Prime 1 000 DH']],
]

function DrawAdmin({ token, me, venue, toast }) {
  const [info, setInfo] = useState(null)
  const m = -1
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
    } catch (e) { toast(String(e?.message || '').includes('already') ? 'Déjà tiré pour ce mois' : String(e?.message || '').includes('month_not_over') ? 'Le mois n\'est pas terminé' : 'Erreur') }
    setBusy(false)
  }
  return (
    <>
      <div className="sub" style={{ marginBottom: 8, textTransform: 'capitalize' }}>Tirage de {label}</div>
      <input placeholder="Le lot du mois" value={prize} onChange={e => setPrize(e.target.value)} />
      {DRAW_LOTS.map(([g, l]) => <div key={g}><div className="sub" style={{ margin: '6px 0 4px' }}>{g}</div>
        <div className="chips">{l.map(p => <button key={p} className={'chip ' + (prize === p ? 'on' : '')} onClick={() => setPrize(p)}>{p}</button>)}</div></div>)}
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

export { QuizSettings, DRAW_LOTS, DrawAdmin, ICONS, RewardsAdmin, RewardEdit }
