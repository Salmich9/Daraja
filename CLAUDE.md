# Daraja — fiche de reprise

Appli web (PWA) de formation ludique du personnel de Cadence / Baromètre Group, pour deux établissements : Baromètre (`baro`) et ZamaZama (`zz`). Propriétaire : Salmane (COO, compte direction `super`).
Le dépôt est **public** : aucun secret dans le code, un `.env` commité, un log, une capture ou un écran.

## Comment travailler avec Salmane
- Toujours en **français**, réponses courtes et directes, analogies bienvenues. Questions à choix cliquables quand une décision lui revient.
- **Une branche par chantier** (`vNNN-nom`). Rien dans `main` sans son « oui » **après captures téléphone** (maquettes en image avant toute fusion). Un push sur `main` publie l'appli : toujours lui demander avant.
- **Corrections proposées une à une**, une modification par message.
- Écrans : le moins de texte possible, pas de paragraphe d'explication ; des bulles d'info (`<Info>` dans `src/ui.jsx`) qui se ferment d'un toucher et ne sont jamais coupées par le bord ; un chemin logique entre les éléments cliquables.
- Esprit de l'appli : ludique, jamais culpabilisant.
- Valeurs métier (heures, plafonds, points, malus) en base et réglables dans l'appli, jamais en dur.
- Ne jamais taper de PIN sur le site de production. Les variables secrètes, c'est Salmane qui les colle lui-même dans Vercel.

## Stack et accès
- React 18 + Vite. Client réseau maison `src/net.js`, appels `rpc()` dans `src/lib.jsx`, adresse et clé publique Supabase dans `src/config.js`.
- **Supabase** : projet `cahtgztumteljjxmqbsr`, schéma `daraja`, RLS fermée partout. Tout passe par des fonctions `public.daraja_*` SECURITY DEFINER données à `anon` ; `daraja.who(token)` vérifie la session PIN (90 jours). Les fonctions réservées au serveur (`daraja_push_*`) ne sont données qu'à `service_role`.
- Rôles (`staff.role`) : `staff`, `admin` (manager d'un établissement), `super` (direction, `venue` nul). Garde-fous : `daraja.can_admin(s, venue)`, `daraja.can_admin_staff(...)`. Un établissement ne voit jamais l'autre.
- **Vercel** : projet `daraja` (`prj_1qmyveXFRj51niBxfhATMEnuVu9e`, équipe `team_D1CJCjMQbu6wHzW7Hq9WVAtt`, compte Pro), production `daraja-nine.vercel.app`. Les aperçus sont protégés (SSO) : les tests réels se font en production. Fonctions dans `api/`, en-têtes et tâche planifiée dans `vercel.json`.
- Vérifier une publication : liste des déploiements Vercel, état `READY` sur le dernier commit de `main`.

## Contrôles avant fusion
- `npm run build` = lint + tests base (PGlite, `supabase/tests/t*.sql`) + ouverture de chaque écran (`scripts/test-screens.mjs`, mode maquette) + build. Enchaîner avec `&&`, jamais `;` avant un commit ou un push.
- Tester une migration pas encore appliquée : `PENDING=supabase/pending/x.sql npm run build`.
- Après une icône ajoutée : `python3 scripts/build-icons.py`.
- **Captures téléphone** : `VITE_MOCK=1 npx vite build --outDir <dossier>`, servir le dossier, puis Playwright (390×844, `deviceScaleFactor: 2`). Le mode maquette lit `src/mock.js` ; rôles via `localStorage.mock_role` (`staff`, `admin`, `super`). Mettre `daraja_guide_me = '1'` pour sauter le guide.
- Réponses équilibrées : la bonne réponse ne doit pas être la plus longue trop souvent (test `t21`, bloquant).

## Mettre la base à jour (ordre à respecter)
1. Écrire la migration dans `supabase/pending/<nom>.sql` + un test `supabase/tests/tNN_*.sql`, faire passer `PENDING=… npm run build`.
2. Après le « oui » : appliquer la migration en production (Supabase). Si la confirmation de `apply_migration` n'arrive pas jusqu'à Salmane (délai dépassé, rien d'appliqué : le vérifier), il colle lui-même le fichier dans Supabase › SQL Editor, onglet vide, sans rien sélectionner. Le collage ajoute des fins de ligne Windows (`\r`) dans les fonctions : les retirer ensuite (réécrire les fonctions dont `prosrc` contient `E'\r'` avec `replace(pg_get_functiondef(oid), E'\r', '')`).
3. Régénérer le plan : exécuter `supabase/plan/export.sql` sur la production, puis `python3 scripts/build-plan.py <fichier du résultat>`. Le plan (`supabase/plan/0*.sql`) doit toujours refléter la production. L'export complet est trop gros pour transiter par l'outil Supabase : on peut exporter depuis la base d'essai (plan + migration) et comparer section par section avec la production (empreintes `md5`), puis reprendre de la production ce qui diffère (réglages modifiés dans l'appli, ordre des contraintes, séquences, déclencheurs).
4. Déplacer la migration dans `supabase/archive/vN_<nom>.sql`, `npm run build`, commit, fusion, push.

## Ce que fait l'appli (état au 21/11/2026)
- **Défi du jour** : 5 questions chronométrées (QCM 9 s, ordre et paires 18 s, réglables par la direction), points, série, coffre 2 fois par semaine (après défi + histoire du jour). Relecture du dernier défi jusqu'au lancement du suivant (`Review.jsx`).
- **Duels**, classement mensuel par établissement, employé du mois, tirage, boutique de cadeaux, missions, avis clients validés par le manager.
- **Histoires** : catalogues culture (Marrakech, légendes, escapades, terroirs, artisanat, agenda).
- **Conduite** : lignes blanche / grise / rouge, registre, malus. Charte modifiable par la direction dans Admin › Réglages › Charte (`src/admin/Charter.jsx`) : intitulé, ligne, malus propre à chaque règle (vide = malus de la ligne ; en cas d'aggravation, le plus fort s'applique), ajout, suppression (rangée si déjà utilisée), remise. Migration `v9_parametres.sql`, test `t25`.
- **Cadeaux** : Admin › Réglages › Cadeaux (direction) : ajouter, modifier, masquer, dupliquer, supprimer (rangé dans « Supprimés » s'il a déjà été gagné), remettre.
- **Évaluation mensuelle** : voir la section dédiée plus bas.
- **Guide** : 4 écrans, une phrase chacun (`src/screens/Guide.jsx`), montré une fois par appareil, puis via le bouton « ? » en bas à droite (caché pendant défi et duels) ou Profil › Comment ça marche.

## Évaluation mensuelle (v009-evaluation, en ligne le 21/11/2026)
- **Base** (`supabase/archive/v10_evaluation.sql`, test `t26`) : `eval_criteria` (grille par famille `salle`/`bar`/`cuisine`/`support`/`manager`, `family` nul = pour tous ; `metier` lié à des thèmes de questions `cats`, `savoir` = savoir-être), `evals` (une fiche : `scores` = {id du critère: 1 à 4}, objectif du mois, `pending` → `ok` ou `returned`), `quiz_sessions.targeted`.
- **Niveaux** : 1 À découvrir · 2 En progrès · 3 Solide · 4 Expert (`EVL` dans `src/lib.jsx`).
- **Circuit** : le manager remplit la fiche quand il veut (pas de rappel, choix de Salmane) → la direction valide ou renvoie avec un mot ; rien ne compte avant validation. La direction évalue les managers (grille « manager »), validé tout de suite. File « À valider » commune aux deux établissements pour la direction.
- **Pièces** : `eval_up` (20) par niveau au-dessus du meilleur déjà validé (jamais deux fois pour le même niveau), plafond `eval_cap` (60) par fiche ; célébration à l'ouverture des niveaux gagnés depuis la fiche précédente.
- **Ce que voit l'équipier** (Profil › Mon bilan) : 3 forces au plus (Solide ou Expert), ses 2 axes, l'objectif. Jamais les niveaux détaillés (seule exception : la célébration nomme le niveau gagné).
- **Défi ciblé** : `eval_target` (2) questions sur 5 visent les 2 axes (`daraja.eval_targets` : note du manager pour `eval_weight` %, défis des 30 derniers jours pour le reste ; sans fiche, les défis seuls), au niveau de la personne ; marquées « 🎯 Ton axe ».
- **Écrans** : Admin › Équipe › Évaluations (`src/admin/Evals.jsx` : liste, fiche, progression sur 6 fiches, validation), Admin › Réglages › Évaluation (grille et les 4 valeurs, direction).

## Notifications push (v001-notifications, en ligne, mode « Direction » pour l'instant)
- **Base** (`supabase/archive/v6_notifications.sql`, test `t23`) : `app_settings` clé `push` (mode `off`/`direction`/`all`, familles, heures, plafonds), `push_subscriptions`, `push_sent` (une alerte dite une fois), `push_rank`.
- **Règles** dans `daraja.push_candidates` + `daraja_push_claim` : rien hors heures, au plus 1 par famille et 3 par jour, jamais deux établissements mélangés, malus sans détail (« Un message t'attend »), un collègue nommé seulement par son alias (sinon « Un collègue »), pas de malus d'absence. Les alertes « À valider 📋 » ne comptent que ce qu'Admin affiche : jamais les demandes d'un compte sans établissement (direction), dont le bouton « Un client m'a cité dans un avis » est masqué (`v11_alertes.sql`, test `t27`, 21/11). Pour la direction, Admin › Équipe liste les avis, ventes et cadeaux à traiter des deux établissements, nom de l'établissement sur chaque ligne (`v12_liste_commune.sql`, test `t28`). Les fiches d'évaluation à valider comptent aussi dans l'alerte de la direction ; si l'alerte ne concerne que des fiches, la notification ouvre Évaluations (`/?go=evals`), et la pastille Admin s'allume (`v13_alertes_evals.sql`, test `t29`).
- **Heures choisies par Salmane** : 16 h à 19 h (pointage à 16 h, service à 19 h), série en danger à 18 h. Ne pas les remettre à 10 h–21 h.
- **Serveur** `api/push/*` : `config`, `subscribe`, `test` (direction), `tick` (tâche planifiée `Authorization: Bearer CRON_SECRET`, ou session valide après un événement), `keys` (génère les clés VAPID, rien stocké).
- **Variables Vercel** (déjà en place, jamais ailleurs) : `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`.
- **Tâche planifiée** : toutes les heures (`0 * * * *`). Rappel du défi à partir de `quiz_hour`, série à partir de `serie_hour`. Les événements (duel, cadeau remis, avis ou vente validés, malus) relancent `tick` depuis l'appli (`pushKick`).
- **Téléphone** : `public/sw.js` minimal (pas de cache, pas de `fetch`), enregistré seulement au toucher « Notifications » du profil. iPhone : appli installée seulement (iOS 16.4+). Testé et validé sur l'iPhone de Salmane le 16/11.
- **Retour arrière** : mode « Arrêt » dans Admin › Réglages › 🔔 Notifications ; pour retirer le service worker : copier `public/sw-uninstall.js` sur `public/sw.js` et publier.
- Prochaine étape quand Salmane le décide : passer le mode à « Tous ».

## Formation vente (v003-formation, en ligne)
- **Base** (`supabase/archive/v7_formation.sql`, test `t24`) : `fiches` (par établissement : histoire, cocktail, vin, pourquoi, phrase à dire), `sell_asks` (« À vendre » des managers), `point_events.kind = 'vente'` (déclarée par l'équipier, validée par le manager dans la même liste que les avis).
- **Contenu** : 24 fiches Baromètre et 26 ZamaZama, tirées des cartes (food, mixologie, vins). Document source : « Daraja · Formation vente » (Claude Docs). Deux histoires restent à vérifier : les 4 salades de « À travers le Maroc » et l'origine du « Marrakesh 5AM ».
- **Questions** : `daraja.fiche_sync` crée « quel cocktail / quel vin conseiller avec … » (cat `vente`), mauvaises réponses prises dans les autres fiches ; jamais supprimées (l'historique y est lié), seulement mises à jour ou éteintes.
- **Écrans** : Accueil › Carte & ventes (`Formation.jsx`), carte « À vendre » à l'accueil, Admin › Équipe › À vendre (`Asks.jsx`). Fiches retirées remettables en bas de Carte & ventes (`v8_remettre.sql`). Plafond de déclarations par jour : `rule_values.sale_cap` (10).
- Demandes en cours lancées le 16/11 jusqu'au 22/11 : Baromètre « Le Tigre qui pleure + S de Siroua », ZamaZama « Burrata Beldi + Tomatini », 10 pièces par vente.

## Chantiers en attente (ne pas lancer sans Salmane)
- Confirmation avant de retirer une fiche (proposée, pas encore validée).
- Quête d'équipe (mise de côté), ligues hebdomadaires.
- Import des pointages (attend la nouvelle appli RH).
- Ventes par article depuis la caisse à la place des déclarations, puis l'IA qui propose quoi pousser (articles peu vendus et rentables).
- Langues AR / EN / ES pour les notifications (français seul pour l'instant).
