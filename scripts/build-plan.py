"""Régénère supabase/plan/01..04 à partir du JSON renvoyé par supabase/plan/export.sql.
Usage : python3 scripts/build-plan.py export.json"""
import json, sys, datetime, os
raw = open(sys.argv[1]).read()
if raw.lstrip().startswith('{"result"'):  # sortie brute de l'outil Supabase : on extrait le JSON
    inner = json.loads(raw)['result']; inner = inner[inner.index('[{'):inner.rindex('}]') + 2]
    d = list(json.loads(inner)[0].values())[0]
else:
    d = raw
d = json.loads(d) if isinstance(d, str) else d
root = os.path.join(os.path.dirname(__file__), '..', 'supabase', 'plan')
H = f"-- Généré depuis la production le {datetime.date.today()}. Ne pas modifier à la main : régénérer.\n"
w = lambda f, s: open(os.path.join(root, f), 'w').write(s)
out = [H, "create extension if not exists pgcrypto with schema extensions;", "create schema if not exists daraja;", ""] + d['sequences']
for t in d['tables']:
    out.append(f"\ncreate table if not exists daraja.{t['t']} (\n  {t['cols']}\n);\nalter table daraja.{t['t']} enable row level security;")
w('01_tables.sql', "\n".join(out) + "\n")
w('02_functions.sql', H + "set check_function_bodies = off;\n" + "\n".join(f.rstrip() + ";\n" for f in d['functions']))
out = [H, "-- clés et contrôles"]
for t in d['tables']: out += t['pk_uq'] or []
out.append("\n-- liens entre tables")
for t in d['tables']: out += t['fk'] or []
out.append("\n-- index")
for t in d['tables']: out += [x.replace('CREATE INDEX', 'CREATE INDEX IF NOT EXISTS').replace('CREATE UNIQUE INDEX', 'CREATE UNIQUE INDEX IF NOT EXISTS') for x in (t['idx'] or [])]
out += ["\n-- déclencheurs"] + d['triggers']
out += ["\n-- droits : rien en direct sur les tables, seulement les fonctions daraja_* pour le rôle anon",
        "revoke all on all tables in schema daraja from anon, authenticated;",
        "revoke execute on all functions in schema daraja from public, anon, authenticated;",
        "revoke execute on all functions in schema public from public;"] + d['grants'] + (d.get('service_grants') or [])
w('03_constraints_grants.sql', "\n".join(out) + "\n")
def lit(v):
    if v is None: return 'null'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, (dict, list)): v = json.dumps(v, ensure_ascii=False)
    return "'" + str(v).replace("'", "''") + "'"
out = [H, "-- Données de référence (contenu du jeu). Les données des équipiers ne sont pas incluses."]
for tbl in ['venues', 'posts', 'conduct_rules', 'missions', 'quotes', 'rewards', 'quiz_settings', 'questions', 'rule_values', 'app_settings', 'fiches', 'eval_criteria']:
    rows = d['data'].get(tbl) or []
    if not rows: continue
    cols = list(rows[0].keys())
    # qui a modifié une fiche est un équipier réel, absent des données de référence
    if tbl == 'fiches': rows = [{**r, 'updated_by': None} for r in rows]
    vals = ",\n".join("(" + ", ".join(lit(r[c]) for c in cols) + ")" for r in rows)
    out.append(f"\ninsert into daraja.{tbl} ({', '.join(cols)}) values\n{vals}\non conflict do nothing;")
for s in ['conduct_rules', 'missions', 'quotes', 'eval_criteria']:
    out.append(f"select setval('daraja.{s}_id_seq', (select coalesce(max(id),1) from daraja.{s}));")
w('04_reference_data.sql', "\n".join(out) + "\n")
print('plan régénéré')
