# Daraja — fiche de reprise

Appli de formation ludique du personnel (Baromètre `baro`, ZamaZama `zz`). Tout en français.
Le dépôt est **public** : aucun secret dans le code, un `.env` commité, un log ou un écran.

## Stack
- React 18 + Vite. Client réseau maison `src/net.js`, appels `rpc()` dans `src/lib.jsx`.
- Supabase, schéma `daraja`, RLS fermée partout. Tout passe par des fonctions `public.daraja_*` SECURITY DEFINER ; `daraja.who(token)` vérifie la session PIN (90 jours).
- Rôles (`staff.role`) : `staff`, `admin` (manager d'un établissement), `super` (direction, établissement nul).
- Vercel : site statique + fonctions `api/` + tâche planifiée (`vercel.json`).

## Règles de travail
- Une branche par chantier ; rien dans `main` sans le « oui » de Salmane après captures téléphone. Un push sur `main` publie l'appli.
- `npm run build` = lint + tests base (PGlite) + ouverture de chaque écran + build. Tester une migration pas encore appliquée : `PENDING=supabase/pending/x.sql npm run build`.
- Après une icône ajoutée : `python3 scripts/build-icons.py`.
- Les valeurs métier vont en base (`rule_values`, `app_settings`), la structure dans le code.

## Notifications push (v001-notifications)
- **Base** (`supabase/archive/v6_notifications.sql`, test `t23`) : `app_settings` clé `push` (mode `off`/`direction`/`all`, familles, heures, plafonds), `push_subscriptions`, `push_sent` (une alerte dite une fois), `push_rank`. Lecture et écriture des abonnements uniquement par les fonctions réservées à la clé service.
- **Règles** dans `daraja.push_candidates` + `daraja_push_claim` : rien hors heures (10 h–21 h par défaut), au plus 1 par famille et 3 par jour, jamais deux établissements mélangés, malus sans détail (« Un message t'attend »), un collègue nommé seulement par son alias (sinon « Un collègue »), pas de malus d'absence.
- **Serveur** `api/push/*` : `config` (clé publique), `subscribe` (abonner/couper son propre appareil, session vérifiée), `test` (direction), `tick` (tâche planifiée avec `Authorization: Bearer CRON_SECRET`, ou session valide après un événement), `keys` (génère les clés VAPID, direction, rien stocké).
- **Variables Vercel** (jamais ailleurs) : `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`.
- **Tâche planifiée** : toutes les heures (`0 * * * *`, compte Vercel Pro). Rappel du défi à partir de `quiz_hour` (12 h), série en danger à partir de `serie_hour` (19 h). Les événements (nouveau duel, cadeau remis, avis validé, malus) relancent `tick` depuis l'appli (`pushKick`) ; les règles empêchent toute répétition.
- **Téléphone** : `public/sw.js` minimal (pas de cache, pas de `fetch`), enregistré seulement au toucher « Notifications » du profil. iPhone : uniquement dans l'appli installée (iOS 16.4+), l'icône a sa propre connexion, un abonnement est lié à l'adresse (se réabonner en production). Les aperçus Vercel sont protégés : tester sur la production, mode « Direction ».
- **Retour arrière** : mode « Arrêt » dans Admin › Réglages › 🔔 Notifications. Pour retirer le service worker des téléphones : copier `public/sw-uninstall.js` sur `public/sw.js` et publier.
- Langue : français seul pour l'instant.

## Formation vente (v003-formation)
- **Base** (`supabase/archive/v7_formation.sql`, test `t24`) : `fiches` (par établissement : histoire, cocktail, vin, pourquoi, phrase à dire), `sell_asks` (« à vendre » des managers), `point_events.kind = 'vente'` (déclarée par l'équipier, en attente, validée par le manager dans la même liste que les avis).
- **Questions** : `daraja.fiche_sync` crée « quel cocktail / quel vin conseiller avec … » pour chaque fiche (cat `vente`), mauvaises réponses prises dans les autres fiches de l'établissement ; jamais supprimées, seulement mises à jour ou éteintes.
- **Écrans** : Accueil › Carte & ventes (`src/screens/Formation.jsx`), carte « À vendre » à l'accueil, Admin › Équipe › À vendre (`src/admin/Asks.jsx`). Plafond de déclarations par jour : `rule_values.sale_cap`.
- Plus tard : ventes de la caisse à la place des déclarations, puis l'IA qui propose quoi pousser.
