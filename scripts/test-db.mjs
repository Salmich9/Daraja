// Reconstruit la base Daraja à partir de supabase/plan dans une base locale jetable (PGlite),
// puis lance tous les tests de supabase/tests. Rien ne touche la production.
// Usage : npm run test:db
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import fs from 'fs'
import path from 'path'
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const dir = path.join(root, 'supabase/plan')
const tests = fs.readdirSync(path.join(root, 'supabase/tests')).filter(f => /^t\d.*\.sql$/.test(f)).sort().map(f => path.join(root, 'supabase/tests', f))
const db = new PGlite({ extensions: { pgcrypto } })
await db.exec(`create role anon; create role authenticated; create role service_role; create schema extensions; set search_path to public, extensions;`)
for (const f of ['01_tables.sql','02_functions.sql','03_constraints_grants.sql','04_reference_data.sql']) {
  try { await db.exec(fs.readFileSync(`${dir}/${f}`, 'utf8')); console.log('OK  ', f) }
  catch (e) { console.log('FAIL', f, e.message); process.exit(1) }
}
// PENDING=fichier.sql : applique une migration pas encore en prod, pour la tester avant
if (process.env.PENDING) {
  try { await db.exec(fs.readFileSync(process.env.PENDING, 'utf8')); console.log('OK   migration', path.basename(process.env.PENDING)) }
  catch (e) { console.log('FAIL migration', e.message); process.exit(1) }
}
const c = await db.query(`select (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='daraja' or (n.nspname='public' and p.proname like 'daraja%')) fns,
  (select count(*) from pg_tables where schemaname='daraja') tables, (select count(*) from daraja.questions) questions`)
console.log(c.rows[0])
let fail = 0
for (const t of tests) {
  const setup = fs.readFileSync(t.replace(/[^/]+$/, '00_setup.sql'), 'utf8')
  try { await db.exec('begin;\n' + setup + '\n' + fs.readFileSync(t, 'utf8')); console.log('PASS', t.split('/').pop()) }
  catch (e) { fail++; console.log('FAIL', t.split('/').pop(), '→', e.message) }
  try { await db.exec('rollback;') } catch {}
}
process.exit(fail ? 1 : 0)
