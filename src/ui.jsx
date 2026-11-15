import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { avFile, FAM, LINE, LV, first, fmt, initials, level, rpc, waLink, RV } from './lib'

function LevelBadge({ level, noPts }) {
  const [name, cls] = LV[level] || LV[1]
  return <span className={'lv ' + cls}><span className="lvdots">{[1, 2, 3].map(n => <i key={n} className={n <= level ? 'on' : ''} />)}</span>{name}{noPts ? '' : ' · +' + RV.answer * (level || 1)}</span>
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

// Bulle d'info : posée par-dessus tout l'écran (jamais coupée ni cachée sous une carte).
// Elle s'ouvre sous le bouton, ou au-dessus s'il n'y a pas la place. Un toucher n'importe où la referme.
function Info({ text }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btn = useRef(null), box = useRef(null)
  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    const b = btn.current.getBoundingClientRect(), h = box.current.offsetHeight
    const H = window.innerHeight, bottom = H - 84
    let top = b.bottom + 8
    if (top + h > bottom) top = b.top - 8 - h
    setPos(Math.max(12, Math.min(top, bottom - h)))
  }, [open, text])
  return (
    <>
      <button ref={btn} className="info" aria-label="Info" onClick={() => setOpen(o => !o)}><i className="ti ti-info-circle" /></button>
      {open && createPortal(
        <div className="tipveil" onClick={() => setOpen(false)}>
          <div ref={box} className="bubble tipbox" style={{ top: pos ?? -9999 }}>{text}</div>
        </div>, document.body)}
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
        <span className="acc u-fw-600 u-fs-13" >{left === 0 ? 'À toi !' : near ? 'Presque !' : pct + ' %'}</span>
      </div>
      <div className="bar u-h-9 u-m-9px-0-6px" ><div style={{ width: pct + '%', height: 9 }} /></div>
      <div className="sub">{left === 0 ? 'Touche pour l\'échanger' : <>Plus que <b className="acc">{fmt(left)} pièces</b>{left <= 90 ? ' : un quiz parfait et c\'est à toi' : ''}</>}</div>
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
    <div className="u-ta-center">
      <i className="ti ti-key acc u-fs-40"  />
      <h1>Code de {first(who)}</h1>
      <div className="newpin pop">{nice}</div>
      <div className="sub u-mb-14" >Affiché une seule fois. Transmets-le en main propre ou sur WhatsApp.</div>
      {phone && <a className="btn wa u-mb-10"  href={waLink(phone, `Bienvenue sur Daraja ${first(who)} ! Ton code personnel : ${nice}. Ne le partage avec personne. Lien : ${location.origin}`)} target="_blank" rel="noreferrer"><i className="ti ti-brand-whatsapp" /> Envoyer sur WhatsApp</a>}
      <button className="btn ghost" onClick={close}>Terminé</button>
    </div>
  )
}

export { LevelBadge, Avatar, Info, Toast, LevelRing, GiftProgress, Pill, postsCache, usePosts, PostSelect, PinShow }
