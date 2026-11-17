import React, { useEffect, useState, useCallback } from 'react'
import { FAM, RV, TIERS, burst, first, fmt, iso, rpc, waLink } from '../lib'
import { Info } from '../ui'

// Chrono des questions : réservé à la direction. Bornes vérifiées aussi par le serveur.
const TIMERS = [['time', 'QCM, vrai/faux, scènes', 4, 20], ['time_long', 'Ordre et association', 8, 40]]
function Timers({ token, toast }) {
  const [v, setV] = useState({ time: RV.time, time_long: RV.time_long })
  const set = async (k, n) => {
    const old = v[k]; setV({ ...v, [k]: n }); RV[k] = n
    try { const r = await rpc('daraja_admin_set_timer', { p_token: token, p_key: k, p_val: n }); if (!r.ok) throw 0 }
    catch { setV(x => ({ ...x, [k]: old })); RV[k] = old; toast('Erreur, réessaie') }
  }
  return <>
    <div className="sec u-pos-relative">Chrono par question <Info text="Le temps pour répondre à chaque question, dans les défis du jour, les duels et l'entraînement. Pour toutes les équipes, dès la prochaine partie. Touche pour fermer." /></div>
    {TIMERS.map(([k, l, lo, hi]) => <div key={k} className="tog"><span>{l}</span>
      <span className="stepper"><button className="mini ghost" aria-label="moins" disabled={v[k] <= lo} onClick={() => set(k, v[k] - 1)}><i className="ti ti-minus" /></button>
        <b>{v[k]} s</b>
        <button className="mini ghost" aria-label="plus" disabled={v[k] >= hi} onClick={() => set(k, v[k] + 1)}><i className="ti ti-plus" /></button></span></div>)}
  </>
}

function QuizSettings({ token, venue, toast, me }) {
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
      {me?.role === 'super' && <Timers token={token} toast={toast} />}
      <div className="tabs">{Object.entries(FAM).map(([k, l]) => <button key={k} className={fam === k ? 'on' : ''} onClick={() => setFam(k)}>{k === 'support' ? 'Accueil · sécurité · support' : l}</button>)}</div>
      {!s ? <div className="sub">Chargement…</div> : <>
        <div className="sec">Niveaux</div>
        {s.levels.map(x => <div key={x.key} className="tog"><span>{x.label}</span><button className={'sw ' + (x.enabled ? 'on' : '')} aria-label={x.label} onClick={() => flip(x.key, !x.enabled)} /></div>)}
        <div className="sec">Thèmes</div>
        {s.cats.map(x => <div key={x.key} className="tog"><span>{x.label} <span className="sub">· {x.count}</span></span><button className={'sw ' + (x.enabled ? 'on' : '')} aria-label={x.label} onClick={() => flip(x.key, !x.enabled)} /></div>)}
        <div className="sub u-mt-10" >Le changement s'applique au défi du lendemain.</div>
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
      <div className="sub u-mb-8 u-tt-capitalize" >Tirage de {label}</div>
      <input placeholder="Le lot du mois" value={prize} onChange={e => setPrize(e.target.value)} />
      {DRAW_LOTS.map(([g, l]) => <div key={g}><div className="sub u-m-6px-0-4px" >{g}</div>
        <div className="chips">{l.map(p => <button key={p} className={'chip ' + (prize === p ? 'on' : '')} onClick={() => setPrize(p)}>{p}</button>)}</div></div>)}
      <button className="btn pulse" disabled={busy} onClick={draw}><i className="ti ti-dice-5" /> Tirer au sort</button>
      <div className="sub u-mt-10" >1 ticket par défi terminé, +2 par semaine à l'heure. Exclus : ligne grise ou rouge dans le mois. Un seul tirage par mois.</div>
      {res && <div className="sheet center" onClick={() => setRes(null)}>
        <div className="lvup pop" onClick={e => e.stopPropagation()}>
          <i className="ti ti-confetti acc u-fs-48"  />
          <div className="sub">{res.prize}</div>
          <h1 className="u-fs-28">{res.winner}</h1>
          <div className="sub u-mb-14" >{res.tickets} tickets sur {res.total} · {res.players} participants</div>
          {res.phone && <a className="btn wa" href={waLink(res.phone, `Félicitations ${first(res.winner)} 🎉 Tu as gagné le tirage Daraja du mois : ${res.prize} ! Viens me voir pour en profiter. ${me.name}`)} target="_blank" rel="noreferrer"><i className="ti ti-brand-whatsapp" /> Prévenir sur WhatsApp</a>}
          <button className="btn ghost u-mt-10"  onClick={() => setRes(null)}>Fermer</button>
        </div>
      </div>}
      {info?.last && !res && <div className="card u-mt-14" ><div className="sub">Dernier tirage · {info.last.month}</div><b>{info.last.winner}</b> · {info.last.prize}</div>}
    </>
  )
}

const ICONS = ['gift', 'coffee', 'glass', 'music', 'sparkles', 'clock-pause', 'door-exit', 'sun', 'beach', 'movie', 'ball-football', 'bath', 'shopping-bag', 'shirt', 'tools-kitchen-2', 'chef-hat', 'glass-full', 'bottle', 'certificate', 'tent', 'trophy', 'cash', 'ticket', 'device-mobile', 'plane', 'calendar-check']

function RewardsAdmin({ token, toast }) {
  const [list, setList] = useState(null)
  const [ed, setEd] = useState(null)
  const [old, setOld] = useState(false)
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
        <i className={('ti ti-' + r.icon + ' acc') + ' u-fs-22'}  />
        <div className="u-flex-1 u-min-width-0 u-cur-pointer" onClick={() => setEd(r)}>
          <div className="u-fs-14">{r.name}</div>
          <div className="sub">{fmt(r.cost)} pièces{n ? ' · ' + n + ' condition' + (n > 1 ? 's' : '') : ''}{r.stock != null ? ' · stock ' + r.stock : ''}{r.venue ? ' · ' + (r.venue === 'zz' ? 'Zama' : 'Baro') : ''}</div>
        </div>
        <button className={'sw ' + (r.active ? 'on' : '')} aria-label="En boutique" onClick={() => save({ ...r, active: !r.active })} />
      </div>
    )
  }
  return (
    <>
      <button className="btn ghost u-mt-10"  onClick={() => setEd({ name: '', cost: 500, icon: 'gift', tier: 'bon', active: true, conditions: {}, stock: null, venue: null })}><i className="ti ti-plus" /> Nouveau cadeau</button>
      <div className="sec">En boutique · {list.filter(r => r.active).length}</div>
      {list.filter(r => r.active).map(row)}
      <div className="sec">Masqués · {list.filter(r => !r.active && !r.archived).length}</div>
      {list.filter(r => !r.active && !r.archived).map(row)}
      {list.some(r => r.archived) && <div className="u-mt-14">
        <button className="mini ghost" onClick={() => setOld(!old)}><i className={'ti ti-chevron-' + (old ? 'up' : 'down')} /> Supprimés · {list.filter(r => r.archived).length}</button>
        {old && list.filter(r => r.archived).map(r => <div key={r.id} className="lb"><div className="u-flex-1 u-min-width-0 sub">{r.name}</div>
          <button className="mini" onClick={async () => { await rpc('daraja_admin_reward_restore', { p_token: token, p_reward: r.id }); toast('Remis dans Masqués'); load() }}>Remettre</button></div>)}
      </div>}
      {ed && <RewardEdit r={ed} close={() => setEd(null)} save={r => { save(r); setEd(null) }}
        dup={r => setEd({ ...r, id: undefined, name: r.name + ' (copie)', active: false })}
        del={async r => { try { const x = await rpc('daraja_admin_reward_delete', { p_token: token, p_reward: r.id }); toast(x.archived ? 'Supprimé (déjà gagné par quelqu\'un, gardé dans l\'historique)' : 'Cadeau supprimé'); setEd(null); load() } catch { toast('Erreur') } }} />}
    </>
  )
}

function RewardEdit({ r, close, save, dup, del }) {
  const [sure, setSure] = useState(false)
  const [f, setF] = useState({ ...r, conditions: { ...(r.conditions || {}) } })
  const c = f.conditions
  const setC = (k, v) => setF({ ...f, conditions: { ...c, [k]: v || undefined } })
  const Opt = ({ k, vals }) => <div className="chips">{vals.map(([v, l]) => <button key={l} className={'chip ' + ((c[k] || null) === v ? 'on' : '')} onClick={() => setC(k, v)}>{l}</button>)}</div>
  return (
    <div className="sheet" onClick={close}>
      <div onClick={e => e.stopPropagation()} className="u-maxh-90dvh u-oy-auto">
        <h1>{r.id ? 'Modifier le cadeau' : 'Nouveau cadeau'}</h1>
        <input placeholder="Nom du cadeau" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        <div className="row u-gap-8" >
          <input inputMode="numeric" placeholder="Points" value={f.cost} onChange={e => setF({ ...f, cost: parseInt(e.target.value.replace(/\D/g, '') || '0', 10) })} />
          <input inputMode="numeric" placeholder="Stock (vide = illimité)" value={f.stock ?? ''} onChange={e => { const v = e.target.value.replace(/\D/g, ''); setF({ ...f, stock: v === '' ? null : parseInt(v, 10) }) }} />
        </div>
        <div className="chips">{TIERS.map(([k, l]) => <button key={k} className={'chip ' + (f.tier === k ? 'on' : '')} onClick={() => setF({ ...f, tier: k })}>{l}</button>)}</div>
        <div className="seg">{[[null, 'Les deux lieux'], ['baro', 'Baromètre'], ['zz', 'ZamaZama']].map(([v, l]) => <button key={l} className={(f.venue || null) === v ? 'on' : ''} onClick={() => setF({ ...f, venue: v })}>{l}</button>)}</div>
        <div className="avgrid u-gtc-repeat7-1fr" >{ICONS.map(i => <button key={i} className={('chip ' + (f.icon === i ? 'on' : '')) + ' u-p-8'}  onClick={() => setF({ ...f, icon: i })}><i className={'ti ti-' + i} /></button>)}</div>
        <div className="sec">Conditions</div>
        <div className="sub">Aucune ligne grise ou rouge</div>
        <Opt k="clean_days" vals={[[null, 'Non'], [30, '30 jours'], [90, '90 jours']]} />
        <div className="tog"><span>Pas de récidive (90 jours)</span><button className={'sw ' + (c.no_recid ? 'on' : '')} aria-label="Pas de récidive" onClick={() => setC('no_recid', !c.no_recid)} /></div>
        <div className="sub u-mt-10" >Retard cumulé sur 30 jours (pointage)</div>
        <Opt k="max_late" vals={[[null, 'Non'], [10, '< 10 min'], [30, '< 30 min']]} />
        <div className="sub">Assiduité : jours de quiz sur 30 jours</div>
        <Opt k="min_days" vals={[[null, 'Non'], [10, '10 j'], [15, '15 j'], [20, '20 j']]} />
        <div className="tog"><span>En boutique</span><button className={'sw ' + (f.active ? 'on' : '')} aria-label="En boutique" onClick={() => setF({ ...f, active: !f.active })} /></div>
        <button className="btn u-mt-12"  onClick={() => save(f)}>Enregistrer</button>
        {r.id && dup && <button className="btn ghost u-mt-8" onClick={() => dup(f)}><i className="ti ti-copy" /> Dupliquer</button>}
        {r.id && del && (sure ? <button className="btn danger u-mt-8" onClick={() => del(r)}>Oui, supprimer ce cadeau</button>
          : <button className="btn ghost u-mt-8" onClick={() => setSure(true)}><i className="ti ti-trash" /> Supprimer</button>)}
      </div>
    </div>
  )
}

export { QuizSettings, DRAW_LOTS, DrawAdmin, ICONS, RewardsAdmin, RewardEdit }
