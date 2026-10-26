import { createAvatar } from '@dicebear/core'
import * as funEmoji from '@dicebear/fun-emoji'
import * as bottts from '@dicebear/bottts'
import * as bigSmile from '@dicebear/big-smile'
import * as croodles from '@dicebear/croodles'

const STYLES = { 'fun-emoji': funEmoji, 'bottts': bottts, 'big-smile': bigSmile, 'croodles': croodles }
const cache = {}
export function render(v) {
  if (!v || !v.includes(':')) return null
  if (cache[v]) return cache[v]
  const [st, seed] = v.split(':')
  if (!STYLES[st]) return null
  cache[v] = createAvatar(STYLES[st], { seed, backgroundColor: ['transparent'] }).toString()
  return cache[v]
}
