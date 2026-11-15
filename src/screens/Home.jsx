import React, { useEffect, useState, useCallback } from 'react'
import { RV, burst, buzz, first, fmt, level, nextGift, rpc, waLink } from '../lib'
import { Avatar, GiftProgress, Info } from '../ui'
import { DuelCard } from './Duels'

function Home({ token, me, venue, go, toast, duels, openDuel }) {
  const [rewards, setRewards] = useState([])
  useEffect(() => { rpc('daraja_rewards', { p_token: token, p_venue: venue }).then(setRewards).catch(() => {}) }, [token, venue])
  const lv = level(me.earned)
  return (
    <div className="page">
      <div className="row between" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 10, cursor: 'pointer' }} onClick={() => go('profile')}>
          <Avatar value={me.avatar} name={me.display} size={46} me />
          <div><div className="sub">{me.venue_name}</div><h1 style={{ margin: 0 }}>Salut {me.display.split(' ')[0]}</h1></div>
        </div>
        <button className="ptspill" onClick={() => go('profile')}><span className="lvchip">N{lv.n}</span><b>{fmt(me.points)}</b><small>pts</small></button>
      </div>
      <div className={'card hero' + (me.flame === 'danger' && !me.quiz_done ? ' danger' : '')} style={{ position: 'relative' }}>
        <div className="row between">
          <div className="row" style={{ gap: 10 }}>
            <i className={'ti ti-flame flame big ' + (['out', 'new'].includes(me.flame) ? 'off' : me.flame)} />
            <div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{me.streak > 0 && me.flame !== 'out' ? me.streak + ' jour' + (me.streak > 1 ? 's' : '') + ' de série' : 'Lance ta série'}</div>
              <div className="sub">{me.quiz_done ? 'Défi relevé, à demain' : me.flame === 'danger' ? 'Joue aujourd\'hui pour la sauver' : me.flame === 'out' ? 'Rallume la flamme aujourd\'hui' : me.next_bonus > RV.streak_step ? 'Bonus série +' + me.next_bonus + ' pts' : 'Chaque jour joué rapporte un bonus'}</div>
            </div>
          </div>
          <Info text={`Chaque jour : vrai ou faux, scènes client, anglais, associations… 2 manches faciles, 2 confirmées, 1 experte. Chaque jour de série ajoute +${RV.streak_step} pts de bonus (jusqu'à +${RV.streak_step * RV.streak_days}). Un jour manqué : la flamme est en danger. Deux jours : elle s'éteint. Touche pour fermer.`} />
        </div>
        <div className="week">
          {(me.week || []).map((d, k) => {
            const day = new Date(Date.now() - (6 - k) * 864e5)
            const today = k === 6
            return <div key={k} className={'wd' + (d ? ' on' : '') + (today ? ' today' : '')}>
              <span>{'DLMMJVS'[day.getDay()]}</span>
              <i className={'ti ' + (d ? 'ti-flame' : today ? 'ti-player-play' : 'ti-minus')} />
            </div>
          })}
        </div>
        <div className="row between" style={{ margin: '4px 0 12px' }}>
          <span style={{ fontWeight: 600 }}>Défi du jour</span>
          <span className="row sub" style={{ gap: 5 }}>{[1, 1, 2, 2, 3].map((l, i) => <span key={i} className={'ddot l' + l} />)}&nbsp;jusqu'à +90 pts</span>
        </div>
        {me.quiz_done
          ? <button className="btn ghost" onClick={() => go('quiz')}><i className="ti ti-check" /> Voir mon score</button>
          : <button className="btn pulse big" onClick={() => go('quiz')}>Jouer <i className="ti ti-player-play" /></button>}
      </div>
      {me.role === 'staff' && <DuelCard duels={duels} go={go} open={openDuel} />}
      <GiftProgress r={nextGift(rewards, me.points)} pts={me.points} onClick={() => go('shop')} />
      {me.role === 'staff' && <MissionCard token={token} />}
      {me.role === 'staff' && <DrawCard token={token} me={me} venue={venue} />}
      <EotmCard token={token} me={me} venue={venue} toast={toast} />
      <BirthdayCard token={token} me={me} venue={venue} />
      <div className="card row" style={{ gap: 12, cursor: 'pointer' }} onClick={() => go('stories')}>
        <i className="ti ti-book-2 acc" style={{ fontSize: 28 }} />
        <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>L'histoire du jour</div><div className="sub">Partis de zéro, arrivés au sommet</div></div>
        <i className="ti ti-chevron-right sub" />
      </div>
    </div>
  )
}

function MissionCard({ token }) {
  const [m, setM] = useState(null)
  useEffect(() => { rpc('daraja_mission', { p_token: token }).then(setM).catch(() => {}) }, [token])
  if (!m?.title) return null
  return (
    <div className={'card mission rise' + (m.done ? ' done' : '')} style={{ position: 'relative' }}>
      <div className="row between">
        <span className="sub"><i className="ti ti-target-arrow acc" /> Mission terrain · +{RV.mission}</span>
        <Info text="Une mission par semaine, à réaliser pendant le service. Ton manager la valide quand il t'a vu la faire. Touche pour fermer." />
      </div>
      <div style={{ fontWeight: 600, margin: '6px 0 4px', lineHeight: 1.35 }}>{m.title}</div>
      <div className="sub">{m.done ? <span style={{ color: 'var(--good)' }}><i className="ti ti-check" /> Validée par ton manager</span> : 'Encore ' + m.days_left + ' jour' + (m.days_left > 1 ? 's' : '')}</div>
    </div>
  )
}

function DrawCard({ token, me, venue }) {
  const [d, setD] = useState(null)
  useEffect(() => { rpc('daraja_draw_info', { p_token: token, p_venue: venue }).then(setD).catch(() => {}) }, [token, venue])
  const t = d?.tickets ?? me.tickets ?? 0
  return (
    <div className="card ticket rise" style={{ position: 'relative' }}>
      <div className="row between">
        <div className="row" style={{ gap: 10 }}>
          <i className="ti ti-ticket" style={{ fontSize: 30 }} />
          <div><div style={{ fontWeight: 700, fontSize: 18 }}>{t} ticket{t > 1 ? 's' : ''}</div>
            <div className="sub">Tirage du mois{d ? ' dans ' + d.days_left + ' j' : ''}</div></div>
        </div>
        <Info text="1 ticket par défi terminé, même avec des erreurs. +2 tickets par semaine à l'heure. Plus tu as de tickets, plus tu as de chances. Une ligne grise ou rouge dans le mois exclut du tirage. Touche pour fermer." />
      </div>
      {d?.last && <div className="sub" style={{ marginTop: 8 }}>{d.last.me ? '🎉 Tu as gagné' : 'Dernier gagnant : ' + d.last.winner + ' ·'} {d.last.prize}</div>}
    </div>
  )
}

function EotmCard({ token, me, venue, toast }) {
  const [e, setE] = useState(null)
  const [open, setOpen] = useState(false)
  const load = useCallback(() => rpc('daraja_eotm', { p_token: token, p_venue: venue }).then(setE).catch(() => {}), [token, venue])
  useEffect(() => { load() }, [load])
  if (!e) return null
  const vote = async id => {
    try { const r = await rpc('daraja_vote', { p_token: token, p_candidate: id }); if (r.ok) { toast('Vote enregistré 🤫'); buzz(20); setOpen(false); load() } else toast('Vote impossible') } catch { toast('Erreur') }
  }
  const mine = e.candidates.find(c => c.id === e.my_vote)
  return (
    <div className="card eotm rise" style={{ position: 'relative' }}>
      <div className="row between">
        <span className="sub"><i className="ti ti-crown acc" /> Employé du mois</span>
        <Info text={`Chaque mois, vote en secret pour le collègue qui t'a le plus impressionné. Le gagnant reçoit +${RV.eotm} pts et le badge, annoncé le 1er du mois. Tu peux changer ton vote jusqu'à la fin du mois. Touche pour fermer.`} />
      </div>
      {e.last && <div className="row" style={{ gap: 10, margin: '8px 0' }}>
        <Avatar value={e.last.avatar} name={e.last.display} size={44} />
        <div><div style={{ fontWeight: 700 }}>{e.last.me ? 'C\'est toi ! 👑' : e.last.display}</div><div className="sub">Élu de {new Date(e.last.month + '-15').toLocaleDateString('fr-FR', { month: 'long' })}</div></div>
      </div>}
      {e.can_vote && (mine
        ? <button className="mini ghost" onClick={() => setOpen(true)}><i className="ti ti-check" /> Tu as voté · changer</button>
        : <button className="mini" onClick={() => setOpen(true)}><i className="ti ti-thumb-up" /> Voter ({e.days_left} j restants)</button>)}
      {open && <div className="sheet" onClick={() => setOpen(false)}>
        <div onClick={ev => ev.stopPropagation()} style={{ maxHeight: '85dvh', overflowY: 'auto' }}>
          <h1>Ton vote secret</h1>
          <div className="sub" style={{ marginBottom: 14 }}>Qui mérite d'être l'employé du mois ?</div>
          <div className="avgrid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {e.candidates.map(c => <div key={c.id} className={'avpick ' + (c.id === e.my_vote ? 'on' : '')} style={{ borderRadius: 16, padding: 6, textAlign: 'center' }} onClick={() => vote(c.id)}>
              <Avatar value={c.avatar} name={c.display} size={58} /><div style={{ fontSize: 12, marginTop: 4 }}>{c.display}</div></div>)}
          </div>
        </div>
      </div>}
    </div>
  )
}

function BirthdayCard({ token, me, venue }) {
  const [list, setList] = useState([])
  useEffect(() => { rpc('daraja_birthdays', { p_token: token, p_venue: venue }).then(l => { setList(l); if (l.find(x => x.me && x.in_days === 0)) setTimeout(() => burst(70), 400) }).catch(() => {}) }, [token, venue])
  if (!list.length) return null
  const today = list.filter(x => x.in_days === 0), soon = list.filter(x => x.in_days > 0)
  return (
    <div className="card bday rise">
      <div style={{ fontWeight: 700, marginBottom: 6 }}><i className="ti ti-cake" /> Anniversaires</div>
      {today.map(b => b.me
        ? <div key={b.id} className="row" style={{ gap: 10 }}><Avatar value={b.avatar} name={b.display} /><b style={{ flex: 1 }}>Joyeux anniversaire ! +50 pts 🎉</b></div>
        : <div key={b.id} className="row" style={{ gap: 10, marginBottom: 6 }}>
            <Avatar value={b.avatar} name={b.display} /><span style={{ flex: 1 }}><b>{b.display}</b> fête son anniversaire aujourd'hui 🎂</span>
            {b.phone && <a className="mini" style={{ background: '#25D366', color: '#fff', textDecoration: 'none' }} href={waLink(b.phone, `Joyeux anniversaire ${first(b.display)} ! 🎂🎉 Toute l'équipe te souhaite une super journée. ${first(me.display)}`)} target="_blank" rel="noreferrer"><i className="ti ti-brand-whatsapp" /></a>}
          </div>)}
      {soon.map(b => <div key={b.id} className="sub">{b.me ? 'Toi' : b.display} · dans {b.in_days} jour{b.in_days > 1 ? 's' : ''}</div>)}
    </div>
  )
}

export { Home, MissionCard, DrawCard, EotmCard, BirthdayCard }
