import React, { useState } from 'react'

// Visite guidée : 4 écrans, un mot et une phrase chacun. Montrée une fois, à revoir avec le bouton « ? ».
const PAGES = [
  { ic: 'ti-player-play', t: 'Joue', s: 'Chaque jour, réponds à 5 questions. Ça prend 2 minutes.' },
  { ic: 'ti-coins', t: 'Gagne', s: 'Chaque bonne réponse te donne des pièces.' },
  { ic: 'ti-glass-full', t: 'Vends', s: 'Raconte l\'histoire du plat au client. S\'il commande, touche « Vendu ».' },
  { ic: 'ti-gift', t: 'Fais-toi plaisir', s: 'Avec tes pièces, choisis un cadeau dans la Boutique.', note: 'Ta conduite, seuls toi et ta direction la voient.' },
]

export default function Guide({ close }) {
  const [i, setI] = useState(0)
  const p = PAGES[i], last = i === PAGES.length - 1
  return (
    <div className="page splash guide">
      <div className="row between"><span className="sub">{i + 1} / {PAGES.length}</span>{!last && <button className="mini ghost" onClick={close}>Passer</button>}</div>
      <div key={i} className="rise gbody">
        <div className="gicon"><i className={'ti ' + p.ic} /></div>
        <h1 className="gtitle">{p.t}</h1>
        <div className="gsub">{p.s}</div>
        {p.note && <div className="sub gnote"><i className="ti ti-lock" /> {p.note}</div>}
      </div>
      <div className="u-mt-auto">
        <div className="dots gdots">{PAGES.map((_, k) => <span key={k} className={k <= i ? 'f' : ''} onClick={() => setI(k)} />)}</div>
        <div className="row u-gap-8">
          {i > 0 && <button className="btn ghost u-flex-1" onClick={() => setI(i - 1)}>Retour</button>}
          <button className="btn u-flex-1" onClick={() => last ? close() : setI(i + 1)}>{last ? 'C\'est parti !' : 'Suivant'}</button>
        </div>
      </div>
    </div>
  )
}
