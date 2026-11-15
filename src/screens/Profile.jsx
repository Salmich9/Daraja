import React, { useEffect, useState, useCallback } from 'react'
import { RV, sfx, soundOn, setSound, AV_LIB, AV_STYLES, LINE, dshort, fmt, level, rpc } from '../lib'
import { Avatar, Info, Pill, PostSelect } from '../ui'

function ProfileEdit({ token, me, close, done }) {
  const [alias, setAlias] = useState(me.alias || '')
  const [av, setAv] = useState(me.avatar || '')
  const [err, setErr] = useState('')
  const [taken, setTaken] = useState(null)
  const [style, setStyle] = useState(me.avatar ? me.avatar.split(':')[0] : 'fun-emoji')
  useEffect(() => { rpc('daraja_avatars_taken', { p_token: token }).then(setTaken).catch(() => setTaken([])) }, [token])
  const save = async () => {
    if (alias.trim().length > 24) { setErr('24 caractères maximum'); return }
    try {
      const r = await rpc('daraja_set_profile', { p_token: token, p_alias: alias, p_avatar: av || null })
      if (r.ok) done(); else setErr(r.error === 'taken' ? 'Oups, quelqu\'un vient de prendre cet avatar' : 'Vérifie ton alias')
    } catch { setErr('Erreur, réessaie') }
  }
  return (
    <div className="sheet" onClick={close}>
      <div onClick={e => e.stopPropagation()} style={{ maxHeight: '88dvh', overflowY: 'auto' }}>
        <div style={{ textAlign: 'center' }}><Avatar value={av} name={me.name} size={86} me /></div>
        <div className="sub" style={{ margin: '14px 0 6px' }}>Mon alias (visible au classement)</div>
        <input value={alias} maxLength={24} placeholder={me.name} onChange={e => { setAlias(e.target.value); setErr('') }} />
        <div className="sub" style={{ marginBottom: 10 }}>Nom complet gardé par la direction : {me.name}</div>
        <div className="tabs" style={{ marginTop: 0 }}>{AV_STYLES.map(st => <button key={st} className={style === st ? 'on' : ''} onClick={() => setStyle(st)}>{{ 'fun-emoji': 'Émojis', bottts: 'Robots', 'big-smile': 'Sourires', croodles: 'Gribouillis', thumbs: 'Pouces', adventurer: 'Aventuriers', 'pixel-art': 'Pixels', avataaars: 'Persos' }[st]}</button>)}</div>
        {!taken ? <div className="sub">Chargement…</div> : <div className="avgrid">
          {AV_LIB.filter(v => v.startsWith(style + ':') && (!taken.includes(v) || v === me.avatar)).map(v => <div key={v} className={'avpick ' + (v === av ? 'on' : '')} onClick={() => setAv(v)}><Avatar value={v} name="" size={56} /></div>)}
        </div>}
        <div className="sub" style={{ marginBottom: 8 }}>Chaque avatar est unique : une fois choisi, il disparaît pour les autres.</div>
        <div className="err">{err}</div>
        <button className="btn" onClick={save}>Enregistrer</button>
      </div>
    </div>
  )
}

function Profile({ token, me, logout, toast, refresh, go, openTest }) {
  const lv = level(me.earned)
  const [avis, setAvis] = useState(false)
  const [bsel, setBsel] = useState(null)
  const [snd, setSnd] = useState(soundOn())
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState(false)
  const pct = lv.to ? Math.round(((me.earned - lv.from) / (lv.to - lv.from)) * 100) : 100
  const badges = [
    ['flame', 'Série 7', me.streak, 7, 'Joue ton défi 7 jours d\'affilée.'],
    ['target', 'Sans faute', me.perfect, 1, 'Termine un défi du jour avec 5 bonnes réponses sur 5.'],
    ['star', 'Cité en avis', me.avis, 1, 'Un client te cite dans un avis en ligne, validé par ton manager.'],
    ['gift', '1er cadeau', me.gifts, 1, 'Échange tes pièces contre un cadeau en boutique.'],
    ['bolt', 'Expert', me.earned, 2000, 'Atteins 2 000 XP au total.'],
    ['crown', 'Légende', me.earned, 7000, 'Atteins 7 000 XP au total.'],
    ['shield-check', 'Exemplaire', me.exemplary ? 1 : 0, 1, 'Passe un mois entier sans ligne grise ni rouge.'],
    ['trophy', 'Employé du mois', me.eotm, 1, 'Sois élu par tes collègues au vote du mois.'],
  ]
  const send = async () => {
    if (!note.trim()) { setErr('Colle le lien ou décris l\'avis'); return }
    try { await rpc('daraja_report_review', { p_token: token, p_note: note.trim() }); toast('Envoyé au manager'); setAvis(false); setNote('') }
    catch { setErr('Erreur, réessaie') }
  }
  return (
    <div className="page">
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ display: 'inline-block', position: 'relative', cursor: 'pointer' }} onClick={() => setEdit(true)}>
          <Avatar value={me.avatar} name={me.display} size={86} me />
          <span className="editdot"><i className="ti ti-pencil" /></span>
        </div>
        <h1 style={{ marginTop: 8 }}>{me.display}</h1>
        {me.alias && <div className="sub">{me.name}</div>}
        <div className="acc" style={{ fontSize: 14 }}>Niveau {lv.n} · {lv.name}</div>
      </div>
      <div className="card">
        <div className="row between" style={{ fontSize: 13, marginBottom: 8 }}>
          <span>{lv.to ? `Vers niveau ${lv.n + 1}` : 'Niveau max'}</span>
          <span className="acc">{fmt(me.earned)}{lv.to ? ' / ' + fmt(lv.to) : ''} XP</span>
        </div>
        <div className="bar"><div style={{ width: pct + '%' }} /></div>
      </div>
      <div className="sec">Badges</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {badges.map(([ic, l, have, need], k) => { const on = (have || 0) >= need, pct = Math.min(100, Math.round((have || 0) / need * 100)); return (
          <button key={l} className={'badge ' + (on ? 'on' : 'off') + (bsel === k ? ' sel' : '')} onClick={() => setBsel(bsel === k ? null : k)}>
            <div style={on ? null : { background: `conic-gradient(var(--acc) ${pct}%, var(--line) 0)` }}><span><i className={'ti ti-' + ic} /></span></div>
            {l}{!on && need > 1 && <small>{fmt(Math.min(have || 0, need))}/{fmt(need)}</small>}
          </button>) })}
      </div>
      {bsel != null && (() => { const [ic, l, have, need, how] = badges[bsel]; const on = (have || 0) >= need; return (
        <div className="card badgetip rise" onClick={() => setBsel(null)}>
          <i className={'ti ti-' + ic + ' acc'} style={{ fontSize: 26 }} />
          <div style={{ flex: 1 }}><b>{l}{on ? ' · obtenu' : ''}</b><div className="sub">{how}</div></div>
        </div>) })()}
      <div className="card row" style={{ gap: 12, marginTop: 12 }}>
        <i className={'ti ti-flame flame ' + (['out', 'new'].includes(me.flame) ? 'off' : me.flame)} style={{ fontSize: 36 }} />
        <div><div style={{ fontWeight: 600 }}>{me.streak} jour{me.streak > 1 ? 's' : ''} de série</div>
          <div className="sub">Prochain défi : bonus série +{me.next_bonus} pièces{me.next_bonus >= 100 ? ' (max)' : ''}</div></div>
      </div>
      {me.role === 'staff' && <MyConduct token={token} toast={toast} refresh={refresh} />}
      {edit && <ProfileEdit token={token} me={me} close={() => setEdit(false)} done={() => { setEdit(false); refresh(); toast('Profil mis à jour') }} />}
      <button className="btn ghost" style={{ marginTop: 24 }} onClick={() => go('rules')}><i className="ti ti-book" /> Règles du jeu</button>
      {me.role === 'super' && <button className="btn ghost" style={{ marginTop: 10 }} onClick={openTest}><i className="ti ti-flask" /> Mode test</button>}
      <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setAvis(true)}><i className="ti ti-star" /> Un client m'a cité dans un avis</button>
      <div className="card tog" style={{ marginTop: 10 }}><span><i className={'ti ' + (snd ? 'ti-volume' : 'ti-volume-off') + ' acc'} /> Sons du jeu</span><button className={'sw ' + (snd ? 'on' : '')} aria-label="Sons du jeu" onClick={() => { setSound(!snd); setSnd(!snd); if (!snd) setTimeout(() => sfx('good'), 50) }} /></div>
      <button className="btn ghost" style={{ marginTop: 10, color: 'var(--muted)' }} onClick={logout}><i className="ti ti-logout" /> Me déconnecter</button>
      <div className="sub" style={{ textAlign: 'center', fontSize: 11, opacity: .7, marginTop: 14 }}>Version {__VERSION__}</div>
      {avis && <div className="sheet" onClick={() => setAvis(false)}>
        <div onClick={e => e.stopPropagation()}>
          <h1>Avis client</h1>
          <div className="sub" style={{ marginBottom: 12 }}>+{RV.review} pièces après validation du manager</div>
          <textarea rows={3} placeholder="Lien Google ou Tripadvisor" value={note} onChange={e => { setNote(e.target.value); setErr('') }} />
          <div className="err">{err}</div>
          <button className="btn" onClick={send}>Envoyer</button>
        </div>
      </div>}
    </div>
  )
}

function MyConduct({ token, toast, refresh }) {
  const [c, setC] = useState(null)
  const load = useCallback(() => rpc('daraja_conduct_mine', { p_token: token }).then(setC).catch(() => setC(null)), [token])
  useEffect(() => { load() }, [load])
  if (!c) return null
  const ack = async id => { try { await rpc('daraja_conduct_ack', { p_token: token, p_record: id }); toast('Pris en compte'); load(); refresh() } catch { toast('Erreur') } }
  return (
    <>
      <div className="sec" style={{ position: 'relative' }}>Ma conduite <Info text={`Visible par toi et ta direction seulement, jamais au classement. Chaque mois sans grise ni rouge te rapporte +${RV.clean_month} pièces.`} /></div>
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="sub">Jours sans faute</div>
        <div className="big acc">{c.days_clean}</div>
      </div>
      <div className="grid3">
        <div className="card" style={{ textAlign: 'center', margin: 0 }}><Pill line="blanche" /><div style={{ fontSize: 20, marginTop: 6 }}>{c.blanche}</div></div>
        <div className="card" style={{ textAlign: 'center', margin: 0 }}><Pill line="grise" /><div style={{ fontSize: 20, marginTop: 6 }}>{c.grise}</div></div>
        <div className="card" style={{ textAlign: 'center', margin: 0 }}><Pill line="rouge" /><div style={{ fontSize: 20, marginTop: 6 }}>{c.rouge}</div></div>
      </div>
      {c.records.map(r => (
        <div key={r.id} className="card" style={{ marginTop: 10, border: r.ack ? 0 : '1px solid var(--acc)' }}>
          <div className="row between"><Pill line={r.line} /><span className="sub">{dshort(r.at)} · −{r.malus}</span></div>
          <div style={{ fontSize: 14, margin: '8px 0 4px' }}>{r.behavior}</div>
          <div className="sub">{r.sanction}{r.escalation ? ' · ' + r.escalation : ''}</div>
          {!r.ack && <button className="btn" style={{ marginTop: 10, padding: 10 }} onClick={() => ack(r.id)}>J'ai pris connaissance</button>}
        </div>
      ))}
    </>
  )
}

const EARN = () => [
  ['circle-check', 'Bonne réponse', `+${RV.answer} / +${RV.answer * 2} / +${RV.answer * 3} selon le niveau`],
  ['calendar-check', 'Défi terminé, même avec des erreurs', `+${RV.presence} et 1 ticket`],
  ['flame', 'Jours de suite (série)', `+${RV.streak_step} par jour, jusqu'à +${RV.streak_step * RV.streak_days}`],
  ['target-arrow', 'Mission terrain validée', `+${RV.mission}`],
  ['star', 'Avis client qui te cite', `+${RV.review}`],
  ['clock-check', `Semaine à l'heure (moins de ${RV.punct_max_late} min de retard)`, `+${RV.punct} et ${RV.punct_tickets} tickets`],
  ['trending-up', 'Tu progresses d\'un mois sur l\'autre', `+${RV.progress}`],
  ['shield-check', 'Mois sans ligne grise ni rouge', `+${RV.clean_month}`],
  ['crown', 'Employé du mois', `+${RV.eotm}`],
  ['cake', 'Ton anniversaire', `+${RV.birthday}`],
  ['swords', 'Duel gagné', `+${RV.duel_win} (égalité : +${RV.duel_tie})`],
]

function Rules({ token, back }) {
  const [rules, setRules] = useState(null)
  const [line, setLine] = useState('blanche')
  useEffect(() => { rpc('daraja_rulebook', { p_token: token }).then(setRules).catch(() => setRules([])) }, [token])
  return (
    <div className="page">
      <button className="mini ghost" onClick={back}><i className="ti ti-chevron-left" /> Retour</button>
      <h1 style={{ marginTop: 12 }}><i className="ti ti-book acc" /> Règles du jeu</h1>
      <div className="sub">Le référentiel officiel. Il est le même pour tout le monde.</div>
      <div className="sec"><i className="ti ti-plus acc" /> Gagner des pièces</div>
      <div className="sub" style={{ marginBottom: 8 }}>Chaque pièce gagnée compte aussi en XP pour ton niveau. Dépenser tes pièces en boutique ne fait jamais baisser ton niveau.</div>
      {EARN().map(([ic, l, v]) => <div key={l} className="lb"><i className={'ti ti-' + ic + ' acc'} style={{ fontSize: 20 }} /><span style={{ flex: 1, fontSize: 14 }}>{l}</span><b style={{ fontSize: 13, color: 'var(--good)', textAlign: 'right' }}>{v}</b></div>)}
      <div className="sec"><i className="ti ti-stopwatch acc" /> Le chrono</div>
      <div className="card" style={{ fontSize: 14, lineHeight: 1.5 }}>{RV.time} secondes par question, {RV.time_long} secondes pour remettre des mots dans l'ordre ou faire des associations. Temps écoulé = réponse fausse, sans malus.</div>
      <div className="sec"><i className="ti ti-gift acc" /> Cadeaux et tirage</div>
      <div className="card" style={{ fontSize: 14, lineHeight: 1.5 }}>Les cadeaux s'échangent contre tes pièces. Certains demandent des conditions (bonne conduite, ponctualité, assiduité) : elles sont affichées sur chaque cadeau. Tirage au sort chaque mois : plus tu as de tickets, plus tu as de chances. Une ligne grise ou rouge dans le mois exclut du tirage. Une faute grave bloque la boutique pendant un an.</div>
      <div className="sec"><i className="ti ti-minus" style={{ color: 'var(--bad)' }} /> Perdre des pièces : la charte</div>
      <div className="seg">{['blanche', 'grise', 'rouge'].map(l => <button key={l} className={line === l ? 'on' : ''} onClick={() => setLine(l)}>{LINE[l][0]}</button>)}</div>
      <div className="sub" style={{ marginBottom: 8 }}>{{ blanche: `Ligne blanche : −${RV.malus_blanche} pièces. Répétée, elle devient grise.`, grise: `Ligne grise : −${RV.malus_grise} pièces. Répétée, elle devient rouge.`, rouge: `Ligne rouge : −${RV.malus_rouge} pièces. Faute grave : −${fmt(RV.malus_grave)} pièces.` }[line]}</div>
      {!rules ? <div className="sub">Chargement…</div> : rules.filter(r => r.line === line).map((r, k) => (
        <div key={k} className="card" style={{ padding: 12 }}>
          <div className="row between"><span className="sub">{r.domain}</span><b style={{ color: 'var(--bad)', fontSize: 13 }}>−{r.malus}</b></div>
          <div style={{ fontSize: 14, margin: '4px 0' }}>{r.behavior}</div>
          <div className="sub">{r.sanction}{r.grave ? ' · faute grave' : ''}</div>
        </div>
      ))}
    </div>
  )
}

function TestMode({ token, me, close, startTest, preview }) {
  const [post, setPost] = useState('serveur')
  const [kind, setKind] = useState('')
  return (
    <div className="sheet" onClick={close}>
      <div onClick={e => e.stopPropagation()} style={{ maxHeight: '88dvh', overflowY: 'auto' }}>
        <h1><i className="ti ti-flask acc" /> Mode test</h1>
        <div className="sub" style={{ marginBottom: 12 }}>{me.venue_name} · joue comme n'importe quel poste, sans rien enregistrer</div>
        <PostSelect token={token} value={post} onChange={setPost} />
        <div className="seg">{[['', 'Tous les formats'], ['image', 'Images'], ['tf', 'Vrai/faux'], ['scene', 'Scènes']].map(([k, l]) => <button key={l} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{l}</button>)}</div>
        <button className="btn" onClick={() => startTest({ post: post || 'serveur', kind, venue: me.venue })}><i className="ti ti-player-play" /> Lancer un quiz test (illimité)</button>
        <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => preview(post || 'serveur')}><i className="ti ti-eye" /> Voir l'appli comme cet équipier</button>
      </div>
    </div>
  )
}

export { ProfileEdit, Profile, MyConduct, EARN, Rules, TestMode }
