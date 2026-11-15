import React, { useState } from 'react'
import { buzz, burst, rpc, sfx } from '../lib'

// Lots possibles du coffre surprise (le tirage se fait au serveur)
const LOOT = {
  common: ['Quelques pièces', 'Commun', '#3CC59A'],
  rare: ['Belle trouvaille', 'Rare', '#5AA9FF'],
  ticket: ['Ticket de tirage', 'Rare', '#C084FC'],
  epic: ['Gros butin', 'Épique', '#C084FC'],
  legend: ['Trésor légendaire', 'Légendaire', '#F2C230'],
}

// Coffre dessiné (couvercle qui s'ouvre)
const ChestArt = ({ open, glow }) => (
  <svg viewBox="0 0 120 110" className={'chestsvg' + (open ? ' open' : '')} style={glow ? { '--glow': glow } : null}>
    {open && <g className="rays">{[0, 30, 60, 90, 120, 150].map(a => <rect key={a} x="58" y="-10" width="4" height="70" rx="2" transform={`rotate(${a - 75} 60 55)`} />)}</g>}
    <rect x="18" y="52" width="84" height="48" rx="8" fill="#8A4B22" />
    <rect x="18" y="52" width="84" height="10" fill="#6E3A18" />
    <rect x="54" y="52" width="12" height="48" fill="#F2B544" />
    <g className="lid">
      <path d="M18 54 Q18 24 60 24 Q102 24 102 54 Z" fill="#A35A2A" />
      <rect x="54" y="24" width="12" height="30" fill="#F2B544" />
    </g>
    <rect x="52" y="58" width="16" height="16" rx="3" fill="#FFD66B" stroke="#B57F1C" strokeWidth="2" />
    <circle cx="60" cy="66" r="2.5" fill="#6E3A18" />
  </svg>
)

function Chest({ token, onOpened }) {
  const [st, setSt] = useState('closed')
  const [res, setRes] = useState(null)
  const open = async () => {
    if (st !== 'closed') return
    setSt('shaking'); buzz(40); sfx('tick')
    try {
      const [r] = await Promise.all([rpc('daraja_chest_open', { p_token: token }), new Promise(ok => setTimeout(ok, 900))])
      if (!r?.ok) { setSt('closed'); return }
      setRes(r); setSt('open')
      const big = r.kind === 'legend' || r.kind === 'epic'
      burst(big ? 120 : 60); sfx(big ? 'level' : 'coin'); buzz(big ? 200 : 60)
      onOpened && onOpened(r)
    } catch { setSt('closed') }
  }
  const loot = res && LOOT[res.kind]
  return (
    <div className={'chest ' + st} onClick={open}>
      <ChestArt open={st === 'open'} glow={loot?.[2]} />
      {st !== 'open' ? <div className="chesttxt"><b>Coffre surprise</b><span className="sub">{st === 'shaking' ? 'Ça bouge…' : 'Touche pour l\'ouvrir'}</span></div>
        : <div className="chesttxt pop"><span className="rarity" style={{ background: loot[2] }}>{loot[1]}</span>
          <b>{loot[0]}</b><span className="chestgain" style={{ color: res.kind === 'common' ? 'var(--fg)' : loot[2] }}>{res.kind === 'ticket' ? '+1 ticket' : '+' + res.amount + ' pièces'}</span></div>}
    </div>
  )
}

export { Chest, LOOT }
