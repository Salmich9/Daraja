import React, { useEffect, useState } from 'react'
import { buzz, rpc } from '../lib'

function Login({ onToken }) {
  const [pin, setPin] = useState('')
  const [len, setLen] = useState(6)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [fresh, setFresh] = useState(null)
  const press = async d => {
    if (busy) return
    setErr('')
    const p = (pin + d).slice(0, len)
    setPin(p)
    if (p.length === len) {
      setBusy(true)
      try {
        const r = await rpc('daraja_login', { p_pin: p })
        if (r?.token && r.new_pin) setFresh(r)
        else if (r?.token) onToken(r.token)
        else if (r?.locked) { setErr('Trop d\'essais, réessaie dans 10 min'); setPin('') }
        else { setErr('Code incorrect'); setPin(''); buzz(120) }
      } catch { setErr('Connexion impossible, vérifie le réseau'); setPin('') }
      setBusy(false)
    }
  }
  if (fresh) return (
    <div className="page" style={{ paddingTop: 70, textAlign: 'center' }}>
      <i className="ti ti-key acc" style={{ fontSize: 44 }} />
      <h1>Ton nouveau code</h1>
      <div className="sub">Les codes passent à 6 chiffres. Note-le bien : l'ancien ne marche plus.</div>
      <div className="newpin pop">{fresh.new_pin.replace(/(\d{3})(\d{3})/, '$1 $2')}</div>
      <button className="btn" onClick={() => onToken(fresh.token)}>C'est noté</button>
    </div>
  )
  return (
    <div className="page" style={{ paddingTop: 70, textAlign: 'center' }}>
      <img src="/icons/logo.svg" alt="" width="96" height="96" className="pop" style={{ display: 'block', margin: '0 auto 10px' }} />
      <h1 style={{ fontSize: 32 }}>Daraja</h1>
      <div className="sub">Ton code à {len} chiffres</div>
      <div className="dots">{[...Array(len)].map((_, i) => <span key={i} className={i < pin.length ? 'f' : ''} />)}</div>
      <div className="err">{err}</div>
      <div className="pad">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => <button key={d} onClick={() => press(String(d))}>{d}</button>)}
        <span />
        <button onClick={() => press('0')}>0</button>
        <button aria-label="Effacer" onClick={() => setPin(pin.slice(0, -1))} style={{ border: 0, background: 'none' }}><i className="ti ti-backspace" /></button>
      </div>
      <button className="mini ghost" style={{ marginTop: 22, border: 0, color: 'var(--muted)' }} onClick={() => { setLen(len === 6 ? 4 : 6); setPin(''); setErr('') }}>
        {len === 6 ? 'J\'ai encore un ancien code à 4 chiffres' : 'J\'ai un code à 6 chiffres'}
      </button>
    </div>
  )
}

function QuoteSplash({ token, me, close }) {
  const [q, setQ] = useState(null)
  useEffect(() => { rpc('daraja_quote', { p_token: token, p_random: false }).then(setQ).catch(() => close()) }, [token])
  const day = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const icon = { proverbe: 'ti-leaf', citation: 'ti-quote', histoire: 'ti-book-2', motivation: 'ti-rocket', encouragement: 'ti-heart-handshake' }
  return (
    <div className="page splash">
      <div className="sub" style={{ textTransform: 'capitalize', letterSpacing: '.5px' }}>{day} · le mot du jour</div>
      {q && <div className="rise">
        <i className={'ti ' + (icon[q.kind] || 'ti-quote') + ' acc'} style={{ fontSize: 36, display: 'block', margin: '28px 0 10px' }} />
        <div className="qbody">{q.kind === 'histoire' ? q.body : '« ' + q.body + ' »'}</div>
        {q.author && <div className="sub" style={{ marginTop: 12 }}>{q.author}</div>}
      </div>}
      <div style={{ marginTop: 'auto' }}>
        <button className="btn" onClick={close}>C'est parti, {me.name.split(' ')[0]}</button>
      </div>
    </div>
  )
}

export { Login, QuoteSplash }
