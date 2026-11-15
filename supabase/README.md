# Base de données Daraja

- `plan/` : le plan complet et à jour de la base, généré depuis la production.
  Rejoué dans l'ordre (01 → 04), il recrée une base Daraja identique : tables, fonctions, droits et contenu du jeu
  (questions, règles, missions, citations, cadeaux). Les données des équipiers n'y sont pas.
- `tests/` : les scénarios qui vérifient les règles du jeu (connexion, droits, chrono, bonus, cadeaux, duels, vote).
  `00_setup.sql` crée des comptes de test, chaque fichier `tNN_*.sql` échoue avec un message clair si une règle est cassée.
- `archive/` : anciens fichiers SQL appliqués au fil de l'eau. Historique seulement, ne pas rejouer.

## Lancer les tests (sans toucher la production)

    npm run test:db

Reconstruit la base dans une base locale jetable, puis lance tous les tests.

## Règle pour chaque modification de la base

1. Appliquer la modification en production (migration Supabase).
2. Régénérer `plan/` depuis la production (requête `plan/export.sql`, puis le script de génération).
3. Ajouter ou adapter un test, lancer `npm run test:db`.

## Tests de l'appli (à chaque mise en ligne)

`npm run build` (lancé par Vercel) enchaîne trois contrôles et **refuse de publier** si l'un échoue :
1. `npm run check` : contrôle du code (eslint, zéro avertissement toléré) ;
2. `npm run test:db` : reconstruit la base dans PGlite et lance `supabase/tests` ;
3. `npm run test:screens` : ouvre les 17 écrans en mode démo (jsdom) et échoue si l'un plante.

Pour un nouvel appel serveur, ajouter sa réponse factice dans `src/mock.js`, sinon le test des écrans le signalera.
Captures avant/après (local, Playwright) : voir `scripts/captures.cjs`.
