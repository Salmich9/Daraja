import React, { useEffect, useState, useCallback } from 'react'
import { useOffline, listen, sfx, MOCK, RV, TK, VK, EVL, burst, buzz, level, rpc, store } from './lib'
import { Toast } from './ui'
import { Login, QuoteSplash } from './screens/Login'
import { Home } from './screens/Home'
import { Quiz } from './screens/Quiz'
import { Board } from './screens/Board'
import { Shop } from './screens/Shop'
import { Profile, Rules, TestMode } from './screens/Profile'
import { Stories } from './screens/Stories'
import { Review } from './screens/Review'
import { Formation } from './screens/Formation'
import Guide from './screens/Guide'
import { DuelInvite, Duels, LiveDuel } from './screens/Duels'
import { Admin } from './admin/Admin'

export default function App() {
  const [token, setToken] = useState(store.get(TK))
  const [venueRaw, setVenue] = useState(store.get(VK))
  const [net, setNet] = useState(false)
  const offline = useOffline()
  const [epoch, setEpoch] = useState(0)
  let [me, setMe] = useState(null)
  const venue = me?.role === 'super' ? venueRaw : null
  const [tab, setTab] = useState('home')
  const [msg, setMsg] = useState('')
  const [splash, setSplash] = useState(false)
  const [guide, setGuide] = useState(false)
  const [levelUp, setLevelUp] = useState(null)
  const [evalCel, setEvalCel] = useState(null)
  const [play, setPlay] = useState({ mode: 'daily', ctx: {} })
  const [testOpen, setTestOpen] = useState(false)
  const [preview, setPreview] = useState(null)
  const [duels, setDuels] = useState(null)
  const [duelId, setDuelId] = useState(null)
  const [invite, setInvite] = useState(null)
  const seenInv = React.useRef(new Set())
  const loadDuels = useCallback(() => { if (token && me?.role === 'staff') rpc('daraja_duels', { p_token: token }).then(setDuels).catch(() => {}) }, [token, me?.role])
  useEffect(() => {
    if (!me || me.role !== 'staff') return
    // Temps réel : le serveur envoie un signal quand un duel bouge ; on revérifie aussi toutes les 30 s et au retour dans l'appli
    loadDuels(); const t = setInterval(loadDuels, 30000)
    const vis = () => { if (document.visibilityState === 'visible') loadDuels() }
    document.addEventListener('visibilitychange', vis)
    const stop = MOCK || !me.rt ? null : listen(me.rt, 'duels', () => loadDuels())
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); if (stop) stop() }
  }, [loadDuels, me?.role, me?.rt])
  useEffect(() => {
    const d = (duels || []).find(x => ((x.status === 'pending' && !x.mine) || x.status === 'ready') && !seenInv.current.has(x.id + x.status))
    if (d) { seenInv.current.add(d.id + d.status); setInvite(d); buzz(80); sfx('duel') }
  }, [duels])
  const toast = m => { setMsg(m); setTimeout(() => setMsg(''), 2200) }
  const todayKey = new Date().toLocaleDateString('fr-CA')

  const refresh = useCallback(() => {
    if (!token) return
    rpc('daraja_me', { p_token: token, p_venue: venue }).then(m => { setNet(false); Object.assign(RV, m.rules); setMe(m) }).catch(e => { if (String(e?.message || '').includes('session')) { store.set(TK, null); store.set(VK, null); setToken(null); setMe(null) } else setNet(true) })
  }, [token, venue])
  useEffect(() => { refresh() }, [refresh])
  // Hors ligne : on réessaie toutes les 5 s et au retour du réseau ; une fois revenu, on recharge l'écran (sauf en plein jeu)
  const wasOff = React.useRef(false)
  useEffect(() => {
    if (offline) { wasOff.current = true; const t = setInterval(refresh, 5000); const on = () => refresh(); window.addEventListener('online', on); return () => { clearInterval(t); window.removeEventListener('online', on) } }
    if (wasOff.current) { wasOff.current = false; if (!['quiz', 'live'].includes(tab)) setEpoch(e => e + 1) }
  }, [offline])
  useEffect(() => {
    if (!me) return
    if (!store.get('daraja_guide_' + me.id)) setGuide(true)
    else if (store.get('daraja_quote_day') !== todayKey) setSplash(true)
    const n = level(me.earned).n, key = 'daraja_lv_' + me.id, prev = parseInt(store.get(key) || '0', 10)
    if (prev && n > prev) { setLevelUp(level(me.earned)); setTimeout(() => { burst(80); sfx('level') }, 150) }
    store.set(key, String(n))
  }, [me?.id, me?.earned])

  // Bilan du mois validé par la direction : célébration une fois, à l'ouverture
  useEffect(() => {
    if (!me?.eval_new || guide || splash || evalCel) return
    rpc('daraja_eval_mine', { p_token: token }).then(e => { if (e?.new) { setEvalCel(e); setTimeout(() => { burst(70); sfx('level') }, 150) } }).catch(() => {})
  }, [me?.eval_new, guide, splash])
  const closeEval = () => { setEvalCel(null); rpc('daraja_eval_seen', { p_token: token }).then(refresh).catch(() => {}) }

  const theme = 't-' + (me?.venue === 'zz' ? 'zz' : 'baro')
  useEffect(() => {
    document.body.className = theme
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 't-zz' ? '#FFF1DE' : '#0F3B33')
  }, [theme])

  // Toucher une notification ouvre l'écran exact : /?go=quiz|duels|board|shop|profile|admin, puis on nettoie l'adresse
  useEffect(() => {
    if (!me) return
    const g = new URLSearchParams(location.search).get('go')
    if (!g) return
    history.replaceState(null, '', location.pathname)
    if (g === 'admin' && ['admin', 'super'].includes(me.role)) go('admin')
    else if (['quiz', 'duels', 'board', 'shop', 'profile'].includes(g)) go(g === 'quiz' && me.quiz_done ? 'home' : g)
  }, [me?.id])

  const login = t => { store.set(VK, null); setVenue(null); store.set(TK, t); setToken(t) }
  const logout = () => { rpc('daraja_logout', { p_token: token }).catch(() => {}); store.set(TK, null); store.set(VK, null); setVenue(null); setToken(null); setMe(null); setTab('home') }
  const switchVenue = v => { store.set(VK, v); setVenue(v) }
  const go = t => { if (t === 'quiz') setPlay({ mode: 'daily', ctx: {} }); setTab(t); window.scrollTo(0, 0); if (t !== 'quiz') refresh() }
  const openDuel = id => { setInvite(null); setDuelId(id); setTab('live'); window.scrollTo(0, 0) }
  const startPractice = () => { setPlay({ mode: 'practice', ctx: {} }); setTab('quiz'); window.scrollTo(0, 0) }
  const startTest = ctx => { setTestOpen(false); setPlay({ mode: 'test', ctx }); setTab('quiz'); window.scrollTo(0, 0) }

  if (!token) return <div className={'app ' + theme}><div className="blobs"><i /><i /><i /></div><Login onToken={login} /></div>
  if (!me) return <div className={'app ' + theme}><div className="page u-ta-center u-pt-80" >{net ? <><i className="ti ti-wifi-off acc u-fs-40"  /><div className="sub u-m-12px-0-18px" >Pas de connexion</div><button className="btn" onClick={refresh}>Réessayer</button></> : <span className="sub">Chargement…</span>}</div></div>
  if (guide) return <div className={'app ' + theme}><div className="blobs"><i /><i /><i /></div><Guide close={() => { store.set('daraja_guide_' + me.id, '1'); store.set('daraja_quote_day', todayKey); setGuide(false); window.scrollTo(0, 0) }} /></div>
  if (splash) return <div className={'app ' + theme}><div className="blobs"><i /><i /><i /></div><div id="fx" /><QuoteSplash token={token} me={me} close={() => { store.set('daraja_quote_day', todayKey); setSplash(false) }} /></div>

  const real = me
  const duelTodo = (duels || []).filter(d => (d.status === 'pending' && !d.mine) || d.status === 'ready' || d.status === 'live')
  if (preview) me = { ...me, role: 'staff' }
  const isAdmin = me.role !== 'staff'
  const tabs = [['home', 'home', 'Accueil'], ['board', 'trophy', 'Classement'], ['stories', 'book-2', 'Histoires'], ['shop', 'gift', 'Boutique'], ['profile', 'user', 'Profil'], ...(isAdmin ? [['admin', 'settings', 'Admin']] : [])]

  return (
    <div className={'app ' + theme}>
      <div className="blobs"><i /><i /><i /></div>
      <Toast msg={msg} />
      <div id="fx" />
      {levelUp && <div className="sheet center" onClick={() => setLevelUp(null)}>
        <div className="lvup pop">
          <i className="ti ti-stairs-up acc u-fs-48"  />
          <div className="sub u-mt-8" >Tu montes d'une marche</div>
          <h1 className="u-fs-30">Niveau {levelUp.n}</h1>
          <div className="acc u-fs-18 u-fw-600" >{levelUp.name}</div>
          <button className="btn u-mt-18" >Bravo à moi</button>
        </div>
      </div>}
      {evalCel && !levelUp && <div className="sheet center" onClick={closeEval}>
        <div className="lvup pop">
          <i className={'ti ' + (evalCel.new.gains.length ? 'ti-trending-up' : 'ti-target-arrow') + ' acc u-fs-48'} />
          <div className="sub u-mt-8">{evalCel.new.first ? 'Ton premier bilan' : 'Ton bilan du mois'}</div>
          <h1 className="u-fs-28">{evalCel.new.gains.length ? 'Tu passes un cap !' : 'Bravo !'}</h1>
          {evalCel.new.gains.map(g => <div key={g.label} className="acc u-fw-600">{g.label} · {EVL[g.to - 1]}</div>)}
          {!evalCel.new.gains.length && evalCel.strengths.length > 0 && <div className="acc u-fw-600">{evalCel.strengths.join(' · ')}</div>}
          {evalCel.new.coins > 0 && <div className="u-fs-22 u-fw-700 u-mt-8">+{evalCel.new.coins} pièces</div>}
          <button className="btn u-mt-18">Bravo à moi</button>
        </div>
      </div>}
      {real.role === 'super' && !preview && tab !== 'quiz' && (
        <div className="seg u-p-12px-16px-0 u-m-0" >
          <button className={me.venue === 'baro' ? 'on' : ''} onClick={() => switchVenue('baro')}>Baromètre</button>
          <button className={me.venue === 'zz' ? 'on' : ''} onClick={() => switchVenue('zz')}>ZamaZama</button>
        </div>
      )}
      {preview && <div className="previewbar"><i className="ti ti-eye" /> Aperçu équipier · {preview}<button className="mini" onClick={() => { setPreview(null); setTab('profile') }}>Quitter</button></div>}
      {offline && <div className="netbar"><i className="ti ti-wifi-off" /> Pas de connexion · on réessaie…</div>}
      <React.Fragment key={epoch}>
      {tab === 'home' && <Home token={token} me={me} venue={venue} go={go} toast={toast} duels={duels} openDuel={openDuel} refresh={refresh} practice={startPractice} />}
      {tab === 'live' && duelId && <LiveDuel key={duelId} token={token} id={duelId} back={() => { loadDuels(); go('duels') }} toast={toast} refresh={refresh} open={id => { loadDuels(); openDuel(id) }} />}
      {invite && tab !== 'live' && tab !== 'quiz' && <DuelInvite d={invite} token={token} close={() => setInvite(null)} open={openDuel} toast={toast} />}
      {tab === 'quiz' && (preview && play.mode === 'daily'
        ? <Quiz key="pv" token={token} me={me} mode="test" ctx={{ post: preview, venue: me.venue }} done={() => go('home')} />
        : <Quiz key={play.mode + (play.ctx.duel || '')} token={token} me={me} mode={play.mode} ctx={play.ctx} practice={me.role === 'staff' ? startPractice : null} onStory={() => go('stories')} onReview={() => go('review')} done={() => go(play.mode === 'test' ? 'profile' : 'home')} />)}
      {tab === 'duels' && <Duels token={token} venue={venue} toast={toast} duels={preview ? [] : duels} reload={loadDuels} open={id => preview ? toast('Pas de duel en aperçu') : openDuel(id)} />}
      {tab === 'rules' && <Rules token={token} back={() => go('profile')} />}
      {testOpen && <TestMode token={token} me={real} close={() => setTestOpen(false)} startTest={startTest} preview={p => { setTestOpen(false); setPreview(p); go('home') }} />}
      {tab === 'board' && <Board token={token} me={me} venue={venue} />}
      {tab === 'review' && <Review token={token} back={() => go('home')} />}
      {tab === 'formation' && <Formation token={token} venue={venue} toast={toast} />}
      {tab === 'stories' && <Stories token={token} me={me} go={go} refresh={refresh} />}
      {tab === 'shop' && <Shop token={token} me={me} venue={venue} refresh={refresh} toast={toast} />}
      {tab === 'profile' && <Profile token={token} me={preview ? real : me} logout={logout} toast={toast} refresh={refresh} go={go} openTest={() => setTestOpen(true)} openGuide={() => setGuide(true)} />}
      {tab === 'admin' && isAdmin && <Admin token={token} me={me} venue={venue} toast={toast} />}
      </React.Fragment>
      {!['quiz', 'live'].includes(tab) && <button className="helpfab" aria-label="Comment ça marche" onClick={() => setGuide(true)}><i className="ti ti-help" /></button>}
      <nav className="nav">
        {tabs.map(([k, ic, lab]) => <button key={k} aria-label={k} className={tab === k || (['quiz', 'duels', 'live', 'review', 'formation'].includes(tab) && k === 'home') || (tab === 'rules' && k === 'profile') ? 'on' : ''} onClick={() => go(k)}><span className="navic"><i className={'ti ti-' + ic} /></span><small>{lab}</small>{((k === 'profile' && me.pending_ack > 0) || (k === 'admin' && (me.direction_todo > 0 || me.errors_24h > 0)) || (k === 'home' && duelTodo.length > 0)) && <span className="dot" />}</button>)}
      </nav>
    </div>
  )
}
