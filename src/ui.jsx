import React, { useEffect, useState } from 'react'
import { avFile, FAM, LINE, LV, first, fmt, initials, level, rpc, waLink } from './lib'

function LevelBadge({ level }) {
  const [name, cls] = LV[level] || LV[1]
  return <span className={'lv ' + cls}><span className="lvdots">{[1, 2, 3].map(n => <i key={n} className={n <= level ? 'on' : ''} />)}</span>{name} · +{10 * (level || 1)}</span>
}

function Avatar({ value, name, size = 34, me: isMe }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [value])
  const ok = value && /^[a-z-]+:[A-Za-z0-9-]+$/.test(value) && !broken
  return (
    <div className={'av' + (isMe ? ' meav' : '')} style={{ width: size, height: size, fontSize: Math.round(size / 2.6) }}>
      {ok ? <img className="avsvg" src={avFile(value)} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setBroken(true)} /> : initials(name || '?')}
    </div>
  )
}

function Info({ text }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="info" aria-label="Info" onClick={() => setOpen(o => !o)}><i className="ti ti-info-circle" /></button>
      {open && <div className="bubble" style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 4, marginTop: 6 }} onClick={() => setOpen(false)}>{text}</div>}
    </>
  )
}

function Toast({ msg }) { return msg ? <div className="toast">{msg}</div> : null }

function LevelRing({ earned, size = 66 }) {
  const lv = level(earned)
  const pct = lv.to ? (earned - lv.from) / (lv.to - lv.from) : 1
  const r = size / 2 - 6, c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ring">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="7" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--acc)" strokeWidth="7" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="ringbar" />
      <text x="50%" y="55%" textAnchor="middle" fill="var(--fg)" fontSize="15" fontWeight="600">N{lv.n}</text>
    </svg>
  )
}

function GiftProgress({ r, pts, onClick }) {
  if (!r) return null
  const pct = Math.min(100, Math.round((pts / r.cost) * 100))
  const left = Math.max(0, r.cost - pts)
  const near = pct >= 80 && left > 0
  return (
    <div className={'card gp ' + (near ? 'near' : '') + (left === 0 ? ' ready' : '')} onClick={onClick}>
      <div className="row between">
        <span><i className={'ti ti-' + r.icon + ' acc'} /> {r.name}</span>
        <span className="acc" style={{ fontWeight: 600, fontSize: 13 }}>{left === 0 ? 'À toi !' : near ? 'Presque !' : pct + ' %'}</span>
      </div>
      <div className="bar" style={{ height: 9, margin: '9px 0 6px' }}><div style={{ width: pct + '%', height: 9 }} /></div>
      <div className="sub">{left === 0 ? 'Touche pour l\'échanger' : <>Plus que <b className="acc">{fmt(left)} pts</b>{left <= 90 ? ' : un quiz parfait et c\'est à toi' : ''}</>}</div>
    </div>
  )
}

const Pill = ({ line }) => <span className={'pill ' + (LINE[line] || LINE.blanche)[1]}>{(LINE[line] || LINE.blanche)[0]}</span>

let postsCache = null

function usePosts(token) {
  const [p, setP] = useState(postsCache || [])
  useEffect(() => { if (!postsCache) rpc('daraja_posts', { p_token: token }).then(x => { postsCache = x; setP(x) }).catch(() => {}) }, [token])
  return p
}

function PostSelect({ token, value, onChange }) {
  const posts = usePosts(token)
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="">Poste…</option>
      {Object.entries(FAM).map(([f, l]) => <optgroup key={f} label={l}>{posts.filter(p => p.family === f).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</optgroup>)}
    </select>
  )
}

function PinShow({ who, pin, phone, close }) {
  const nice = pin.replace(/(\d{3})(\d{3})/, '$1 $2')
  return (
    <div style={{ textAlign: 'center' }}>
      <i className="ti ti-key acc" style={{ fontSize: 40 }} />
      <h1>Code de {first(who)}</h1>
      <div className="newpin pop">{nice}</div>
      <div className="sub" style={{ marginBottom: 14 }}>Affiché une seule fois. Transmets-le en main propre ou sur WhatsApp.</div>
      {phone && <a className="btn wa" style={{ marginBottom: 10 }} href={waLink(phone, `Bienvenue sur Daraja ${first(who)} ! Ton code personnel : ${nice}. Ne le partage avec personne. Lien : ${location.origin}`)} target="_blank" rel="noreferrer"><i className="ti ti-brand-whatsapp" /> Envoyer sur WhatsApp</a>}
      <button className="btn ghost" onClick={close}>Terminé</button>
    </div>
  )
}

export { LevelBadge, Avatar, Info, Toast, LevelRing, GiftProgress, Pill, postsCache, usePosts, PostSelect, PinShow }
