// Génère une fois pour toutes les images des avatars (public/av/*.svg) à partir de la bibliothèque.
// À relancer seulement si on ajoute des styles ou des graines : node scripts/build-avatars.mjs
import fs from 'fs'
import { render } from './avatars-render.js'
import { AV_SEEDS, AV_STYLES } from '../src/avatar-list.js'
const out = new URL('../public/av/', import.meta.url)
fs.mkdirSync(out, { recursive: true })
let total = 0, n = 0
for (const st of AV_STYLES) for (const sd of AV_SEEDS) {
  const svg = render(st + ':' + sd).replace(/\s*\n\s*/g, ' ')
  fs.writeFileSync(new URL(st + '_' + sd + '.svg', out), svg); total += svg.length; n++
}
console.log(n, 'avatars,', Math.round(total / 1024), 'Ko au total, moyenne', Math.round(total / n / 1024 * 10) / 10, 'Ko')
