import React, { useEffect, useState } from 'react'
import { rpc } from '../lib'
import { Info } from '../ui'
import { pushAdmin } from '../push'

// Réglages › 🔔 Notifications : direction seulement (vérifié aussi par le serveur).
const MODES = [['off', 'Arrêt'], ['direction', 'Direction'], ['all', 'Tous']]
const FAMS = [['quiz', 'Défi du jour', 'Un rappel si la personne n\'a pas encore joué.'],
  ['serie', 'Série en danger', 'Le soir seulement, quand la série tombe à minuit.'],
  ['defi', 'Défis et classement', 'Nouveau duel reçu, ou dépassé au classement de son établissement.'],
  ['cadeaux', 'Cadeaux et points', 'Cadeau remis, avis validé, bonus du mois. Un malus s\'affiche sans détail.'],
  ['alertes', 'Alertes managers', 'Avis et cadeaux à valider, pour les managers de l\'établissement.']]
const HOURS = [['start_hour', 'Pas avant'], ['end_hour', 'Pas après'], ['serie_hour', 'Série en danger vers']]

function Keys({ token, toast }) {
  const [k, setK] = useState(null)
  const gen = async () => { try { setK(await pushAdmin.keys(token)) } catch { toast('Erreur') } }
  const copy = (t, l) => navigator.clipboard?.writeText(t).then(() => toast(l + ' copiée')).catch(() => toast('Copie impossible'))
  if (!k) return <div className="card u-mt-10">
    <div><i className="ti ti-key acc" /> Clés d'envoi à créer</div>
    <div className="sub u-m-6px-0-10px">Une seule fois. Tu les colles ensuite dans Vercel.</div>
    <button className="btn" onClick={gen}>Générer les clés</button>
  </div>
  return <div className="card u-mt-10">
    <div className="sec u-mt-0">Clé publique</div>
    <div className="keybox">{k.publicKey}</div>
    <button className="mini" onClick={() => copy(k.publicKey, 'Clé publique')}><i className="ti ti-copy" /> Copier</button>
    <div className="sec">Clé privée · montrée une seule fois</div>
    <div className="keybox">{k.privateKey}</div>
    <button className="mini" onClick={() => copy(k.privateKey, 'Clé privée')}><i className="ti ti-copy" /> Copier</button>
    <div className="sub u-mt-10">Vercel › daraja › Settings › Environment Variables : <b>VAPID_PUBLIC_KEY</b> et <b>VAPID_PRIVATE_KEY</b>, puis redéployer. Ne l'envoie à personne.</div>
    <button className="btn ghost u-mt-10" onClick={() => setK(null)}>J'ai collé les deux, masquer</button>
  </div>
}

export default function Notifications({ token, toast }) {
  const [d, setD] = useState(null)
  const [ready, setReady] = useState(null)
  const [busy, setBusy] = useState('')
  const load = () => rpc('daraja_push_admin', { p_token: token }).then(setD).catch(() => toast('Erreur'))
  useEffect(() => { load(); pushAdmin.config().then(c => setReady(!!c.ready)).catch(() => setReady(false)) }, [token])
  const save = async p => {
    const old = d; setD({ ...d, settings: { ...d.settings, ...p, families: { ...d.settings.families, ...(p.families || {}) } } })
    try { setD(await rpc('daraja_push_admin', { p_token: token, p_set: p })) } catch { setD(old); toast('Réglage refusé') }
  }
  const run = async (k, f, ok) => { setBusy(k); try { toast(ok(await f(token))) } catch (e) { toast(e.message === 'vapid' ? 'Clés pas encore en place' : 'Erreur') } setBusy('') }
  if (!d) return <div className="sub">Chargement…</div>
  const s = d.settings
  return <>
    <div className="sec u-pos-relative">Notifications <Info text="Arrêt : rien ne part. Direction : seulement vers toi, pour tester. Tous : chaque personne qui a activé les notifications sur son profil. Touche pour fermer." /></div>
    <div className="seg">{MODES.map(([k, l]) => <button key={k} className={s.mode === k ? 'on' : ''} onClick={() => save({ mode: k })}>{l}</button>)}</div>
    <div className="sub u-mt-6">{d.people} {d.people > 1 ? 'personnes' : 'personne'} · {d.subs} appareil{d.subs > 1 ? 's' : ''} · {d.sent_today} envoyée{d.sent_today > 1 ? 's' : ''} aujourd'hui</div>
    {ready === false && <Keys token={token} toast={toast} />}

    <div className="sec u-pos-relative">Familles <Info text={`Au plus ${s.cap_family} par famille et ${s.cap_day} par jour et par personne. Rien hors des heures ci-dessous. Touche pour fermer.`} /></div>
    {FAMS.map(([k, l, t]) => <div key={k} className="tog"><span className="u-pos-relative">{l} <Info text={t} /></span><button className={'sw ' + (s.families[k] ? 'on' : '')} aria-label={l} onClick={() => save({ families: { [k]: !s.families[k] } })} /></div>)}

    <div className="sec">Heures</div>
    {HOURS.map(([k, l]) => <div key={k} className="tog"><span>{l}</span>
      <span className="stepper"><button className="mini ghost" aria-label="moins" disabled={s[k] <= 6} onClick={() => save({ [k]: s[k] - 1 })}><i className="ti ti-minus" /></button>
        <b>{s[k]} h</b>
        <button className="mini ghost" aria-label="plus" disabled={s[k] >= 23} onClick={() => save({ [k]: s[k] + 1 })}><i className="ti ti-plus" /></button></span></div>)}

    <div className="row u-gap-8 u-mt-14">
      <button className="btn u-flex-1" disabled={!!busy || !d.mine} onClick={() => run('test', pushAdmin.test, r => r.sent ? 'Test envoyé 🔔' : 'Aucun appareil joint')}>{busy === 'test' ? '…' : 'Envoyer un test à moi'}</button>
      <button className="btn ghost u-flex-1" disabled={!!busy || s.mode === 'off'} onClick={() => run('tick', pushAdmin.tick, r => r.quiet ? 'Heures calmes : rien envoyé' : r.notifications ? r.notifications + ' envoyée' + (r.notifications > 1 ? 's' : '') : 'Rien à envoyer')}>{busy === 'tick' ? '…' : 'Vérifier maintenant'}</button>
    </div>
    {!d.mine && <div className="sub u-mt-6">Active d'abord les notifications sur ton profil, depuis l'appli installée.</div>}
  </>
}
