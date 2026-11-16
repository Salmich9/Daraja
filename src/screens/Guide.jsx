import React, { useState } from 'react'
import { RV } from '../lib'

// Visite guidée : 6 écrans, montrée une fois à la première connexion, à revoir depuis le Profil.
// Message d'abord : progresser et gagner. Peu de texte, une idée par écran.
const pages = () => [
  { ic: 'ti-rocket', t: 'Bienvenue sur Daraja', s: '2 minutes par jour pour devenir le meilleur en salle. Et gagner des cadeaux au passage.',
    pts: [['ti-school', 'Tu apprends'], ['ti-coins', 'Tu gagnes'], ['ti-gift', 'Tu te fais plaisir']] },
  { ic: 'ti-player-play', t: 'Le défi du jour', s: '5 questions, un chrono, une fois par jour.',
    pts: [['ti-check', '+' + RV.answer + ' pièces par bonne réponse'], ['ti-flame', 'Chaque jour d\'affilée, ta série monte et ton bonus aussi'], ['ti-eye', 'Après le défi, relis tes réponses']] },
  { ic: 'ti-coins', t: 'Toutes les façons de gagner', s: 'Le quiz n\'est qu\'un début.',
    pts: [['ti-swords', 'Duels : défie un collègue, +' + RV.duel_win + ' au gagnant'], ['ti-star', 'Un client te cite dans un avis : +' + RV.review], ['ti-target-arrow', 'À vendre : touche « Vendu », ton manager valide'], ['ti-sparkles', 'Le coffre, ' + RV.chest_week + ' fois par semaine']] },
  { ic: 'ti-glass-full', t: 'Carte & ventes', s: 'Chaque plat a son histoire, son cocktail et son vin.',
    pts: [['ti-book-2', 'Raconte l\'histoire en 15 secondes'], ['ti-glass-cocktail', 'Propose deux choix, jamais trois'], ['ti-message-circle', 'La phrase à dire est prête dans chaque fiche']] },
  { ic: 'ti-gift', t: 'Tes pièces, tes cadeaux', s: 'Dans la Boutique, échange tes pièces contre de vrais cadeaux.',
    pts: [['ti-ticket', 'Des tickets pour le tirage du mois'], ['ti-trophy', 'Le classement du mois, dans ton établissement'], ['ti-award', 'Employé du mois, élu par l\'équipe']] },
  { ic: 'ti-user', t: 'Ton profil', s: 'Ton niveau, tes badges, tes réglages.',
    pts: [['ti-shield-check', 'Ta conduite est visible par toi et ta direction seulement'], ['ti-bell', 'Active les notifications pour ne rien rater'], ['ti-help-circle', 'Revois ce guide quand tu veux']] },
]

export default function Guide({ me, close }) {
  const [i, setI] = useState(0)
  const P = pages(), p = P[i], last = i === P.length - 1
  return (
    <div className="page splash guide">
      <div className="row between"><span className="sub">{i + 1} / {P.length}</span>{!last && <button className="mini ghost" onClick={close}>Passer</button>}</div>
      <div key={i} className="rise">
        <i className={'ti ' + p.ic + ' acc u-fs-40 u-d-block u-m-28px-0-10px'} />
        <h1 className="u-m-0">{p.t}</h1>
        <div className="sub u-mt-8 gsub">{p.s}</div>
        <div className="gpts">{p.pts.map(([ic, l]) => <div key={l} className="gpt"><i className={'ti ' + ic + ' acc'} /><span>{l}</span></div>)}</div>
      </div>
      <div className="u-mt-auto">
        <div className="dots gdots">{P.map((_, k) => <span key={k} className={k <= i ? 'f' : ''} onClick={() => setI(k)} />)}</div>
        <div className="row u-gap-8">
          {i > 0 && <button className="btn ghost u-flex-1" onClick={() => setI(i - 1)}>Retour</button>}
          <button className="btn u-flex-1" onClick={() => last ? close() : setI(i + 1)}>{last ? 'C\'est parti !' : 'Suivant'}</button>
        </div>
      </div>
    </div>
  )
}
