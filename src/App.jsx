import React, { useEffect, useState, useCallback } from 'react'
import { MOCK, RV, TK, VK, sb, burst, buzz, level, rpc, store } from './lib'
import { Toast } from './ui'
import { Login, QuoteSplash } from './screens/Login'
import { Home } from './screens/Home'
import { Quiz } from './screens/Quiz'
import { Board } from './screens/Board'
import { Shop } from './screens/Shop'
import { Profile, Rules, TestMode } from './screens/Profile'
import { Stories } from './screens/Stories'
import { DuelInvite, Duels, LiveDuel } from './screens/Duels'
import { Admin } from './admin/Admin'

export default function App() {
  const [token, setToken] = useState(store.get(TK))
  const [venueRaw, setVenue] = useState(store.get(VK))
  const [net, setNet] = useState(false)
  let [me, setMe] = useState(null)
  const venue = me?.role === 'super' ? venueRaw : null
  const [tab, setTab] = useState('home')
  const [msg, setMsg] = useState('')
  const [splash, setSplash] = useState(false)
  const [levelUp, setLevelUp] = useState(null)
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
    const ch = MOCK || !me.rt ? null : sb.channel(me.rt).on('broadcast', { event: 'duels' }, () => loadDuels()).subscribe()
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); if (ch) sb.removeChannel(ch) }
  }, [loadDuels, me?.role, me?.rt])
  useEffect(() => {
    const d = (duels || []).find(x => ((x.status === 'pending' && !x.mine) || x.status === 'ready') && !seenInv.current.has(x.id + x.status))
    if (d) { seenInv.current.add(d.id + d.status); setInvite(d); buzz(80) }
  }, [duels])
  const toast = m => { setMsg(m); setTimeout(() => setMsg(''), 2200) }
  const todayKey = new Date().toLocaleDateString('fr-CA')

  const refresh = useCallback(() => {
    if (!token) return
    rpc('daraja_me', { p_token: token, p_venue: venue }).then(m => { setNet(false); Object.assign(RV, m.rules); setMe(m) }).catch(e => { if (String(e?.message || '').includes('session')) { store.set(TK, null); store.set(VK, null); setToken(null); setMe(null) } else setNet(true) })
  }, [token, venue])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => {
    if (!me) return
    if (store.get('daraja_quote_day') !== todayKey) setSplash(true)
    const n = level(me.earned).n, key = 'daraja_lv_' + me.id, prev = parseInt(store.get(key) || '0', 10)
    if (prev && n > prev) { setLevelUp(level(me.earned)); setTimeout(() => burst(80), 150) }
    store.set(key, String(n))
  }, [me?.id, me?.earned])

  const theme = 't-' + (me?.venue === 'zz' ? 'zz' : 'baro')
  useEffect(() => {
    document.body.className = theme
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', theme === 't-zz' ? '#FFF1DE' : '#0F3B33')
  }, [theme])

  const login = t => { store.set(VK, null); setVenue(null); store.set(TK, t); setToken(t) }
  const logout = () => { rpc('daraja_logout', { p_token: token }).catch(() => {}); store.set(TK, null); store.set(VK, null); setVenue(null); setToken(null); setMe(null); setTab('home') }
  const switchVenue = v => { store.set(VK, v); setVenue(v) }
  const go = t => { if (t === 'quiz') setPlay({ mode: 'daily', ctx: {} }); setTab(t); window.scrollTo(0, 0); if (t !== 'quiz') refresh() }
  const openDuel = id => { setInvite(null); setDuelId(id); setTab('live'); window.scrollTo(0, 0) }
  const startTest = ctx => { setTestOpen(false); setPlay({ mode: 'test', ctx }); setTab('quiz'); window.scrollTo(0, 0) }

  if (!token) return <div className={'app ' + theme}><div className="blobs"><i /><i /><i /></div><Login onToken={login} /></div>
  if (!me) return <div className={'app ' + theme}><div className="page" style={{ textAlign: 'center', paddingTop: 80 }}>{net ? <><i className="ti ti-wifi-off acc" style={{ fontSize: 40 }} /><div className="sub" style={{ margin: '12px 0 18px' }}>Pas de connexion</div><button className="btn" onClick={refresh}>Réessayer</button></> : <span className="sub">Chargement…</span>}</div></div>
  if (splash) return <div className={'app ' + theme}><div className="blobs"><i /><i /><i /></div><div id="fx" /><QuoteSplash token={token} me={me} close={() => { store.set('daraja_quote_day', todayKey); setSplash(false) }} /></div>

  const real = me
  const duelTodo = (duels || []).filter(d => (d.status === 'pending' && !d.mine) || d.status === 'ready' || d.status === 'live')
  if (preview) me = { ...me, role: 'staff' }
  const isAdmin = me.role !== 'staff'
  const tabs = [['home', 'home'], ['board', 'trophy'], ['stories', 'book-2'], ['shop', 'gift'], ['profile', 'user'], ...(isAdmin ? [['admin', 'settings']] : [])]

  return (
    <div className={'app ' + theme}>
      <div className="blobs"><i /><i /><i /></div>
      <Toast msg={msg} />
      <div id="fx" />
      {levelUp && <div className="sheet center" onClick={() => setLevelUp(null)}>
        <div className="lvup pop">
          <i className="ti ti-stairs-up acc" style={{ fontSize: 48 }} />
          <div className="sub" style={{ marginTop: 8 }}>Tu montes d'une marche</div>
          <h1 style={{ fontSize: 30 }}>Niveau {levelUp.n}</h1>
          <div className="acc" style={{ fontSize: 18, fontWeight: 600 }}>{levelUp.name}</div>
          <button className="btn" style={{ marginTop: 18 }}>Bravo à moi</button>
        </div>
      </div>}
      {real.role === 'super' && !preview && tab !== 'quiz' && (
        <div className="seg" style={{ padding: '12px 16px 0', margin: 0 }}>
          <button className={me.venue === 'baro' ? 'on' : ''} onClick={() => switchVenue('baro')}>Baromètre</button>
          <button className={me.venue === 'zz' ? 'on' : ''} onClick={() => switchVenue('zz')}>ZamaZama</button>
        </div>
      )}
      {preview && <div className="previewbar"><i className="ti ti-eye" /> Aperçu équipier · {preview}<button className="mini" onClick={() => { setPreview(null); setTab('profile') }}>Quitter</button></div>}
      {tab === 'home' && <Home token={token} me={me} venue={venue} go={go} toast={toast} duels={duels} openDuel={openDuel} />}
      {tab === 'live' && duelId && <LiveDuel key={duelId} token={token} id={duelId} back={() => { loadDuels(); go('duels') }} toast={toast} refresh={refresh} />}
      {invite && tab !== 'live' && tab !== 'quiz' && <DuelInvite d={invite} token={token} close={() => setInvite(null)} open={openDuel} toast={toast} />}
      {tab === 'quiz' && (preview && play.mode === 'daily'
        ? <Quiz key="pv" token={token} me={me} mode="test" ctx={{ post: preview, venue: me.venue }} done={() => go('home')} />
        : <Quiz key={play.mode + (play.ctx.duel || '')} token={token} me={me} mode={play.mode} ctx={play.ctx} done={() => go(play.mode === 'test' ? 'profile' : 'home')} />)}
      {tab === 'duels' && <Duels token={token} venue={venue} toast={toast} duels={preview ? [] : duels} reload={loadDuels} open={id => preview ? toast('Pas de duel en aperçu') : openDuel(id)} />}
      {tab === 'rules' && <Rules token={token} back={() => go('profile')} />}
      {testOpen && <TestMode token={token} me={real} close={() => setTestOpen(false)} startTest={startTest} preview={p => { setTestOpen(false); setPreview(p); go('home') }} />}
      {tab === 'board' && <Board token={token} me={me} venue={venue} />}
      {tab === 'stories' && <Stories />}
      {tab === 'shop' && <Shop token={token} me={me} venue={venue} refresh={refresh} toast={toast} />}
      {tab === 'profile' && <Profile token={token} me={preview ? real : me} logout={logout} toast={toast} refresh={refresh} go={go} openTest={() => setTestOpen(true)} />}
      {tab === 'admin' && isAdmin && <Admin token={token} me={me} venue={venue} toast={toast} />}
      <nav className="nav">
        {tabs.map(([k, ic]) => <button key={k} aria-label={k} className={tab === k || (['quiz', 'duels', 'live'].includes(tab) && k === 'home') || (tab === 'rules' && k === 'profile') ? 'on' : ''} onClick={() => go(k)}><i className={'ti ti-' + ic} />{((k === 'profile' && me.pending_ack > 0) || (k === 'admin' && (me.direction_todo > 0 || me.errors_24h > 0)) || (k === 'home' && duelTodo.length > 0)) && <span className="dot" />}</button>)}
      </nav>
    </div>
  )
}
