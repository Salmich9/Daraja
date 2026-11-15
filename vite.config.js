import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'
// Numéro de version = début du commit publié (fourni par Vercel, sinon lu dans git) + date de construction
const sha = (process.env.VERCEL_GIT_COMMIT_SHA || (() => { try { return execSync('git rev-parse HEAD').toString() } catch { return 'local' } })()).trim().slice(0, 7)
const day = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', timeZone: 'Africa/Casablanca' })
export default defineConfig({ plugins: [react()], define: { __VERSION__: JSON.stringify(sha + ' · ' + day) } })
