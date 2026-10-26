import { createAvatar } from '@dicebear/core'
import * as funEmoji from '@dicebear/fun-emoji'
import * as bottts from '@dicebear/bottts'
import * as bigSmile from '@dicebear/big-smile'
import * as croodles from '@dicebear/croodles'
import * as thumbs from '@dicebear/thumbs'
import * as adventurer from '@dicebear/adventurer'
import * as pixelArt from '@dicebear/pixel-art'
import * as avataaars from '@dicebear/avataaars'

const STYLES = { 'fun-emoji': funEmoji, bottts, 'big-smile': bigSmile, croodles, thumbs, adventurer, 'pixel-art': pixelArt, avataaars }
const cache = {}
export function render(v) {
  if (!v || !v.includes(':')) return null
  if (cache[v]) return cache[v]
  const [st, seed] = v.split(':')
  if (!STYLES[st]) return null
  cache[v] = createAvatar(STYLES[st], { seed, backgroundColor: ['ffd166', 'ffadad', 'a0e7e5', 'b4f8c8', 'fbe7c6', 'cdb4db', 'ffc8dd', 'bde0fe'], backgroundType: ['solid'], randomizeIds: true }).toString()
  return cache[v]
}
