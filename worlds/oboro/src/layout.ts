/** Per-round puzzle layout derived from a seed, so every peer (and a new host) rebuilds the same round. */
type V3 = [number, number, number]
export const RUNES = ['moon', 'wave', 'pine'] as const
export const RUNE_NAMES: Record<string, string> = { moon: '月', wave: '波', pine: '松' }
export type Rune = typeof RUNES[number]

export const VALVE_SPOTS: { pos: V3; touch: V3; yaw: number }[] = [
  { pos: [-10, .8, -13], touch: [-10, 0, -12.2], yaw: 0 },
  { pos: [-17, .8, -13], touch: [-17, 0, -12.2], yaw: 0 },
  { pos: [-19.1, .8, -17.5], touch: [-19.9, 0, -17.5], yaw: -Math.PI / 2 },
  { pos: [-9.1, .8, -19.5], touch: [-8.3, 0, -19.5], yaw: Math.PI / 2 },
]
const KEY_SPOTS: Record<string, V3[]> = {
  wood: [[-17, 1.1, -3], [-17.6, 1.1, 3.6], [-17.6, 1.1, -5.2]],
  fire: [[16, 4.35, 3], [17.2, 4.35, 2.1]],
  water: [[-14, -2.4, -18], [-16.3, -2.4, -15.6], [-16.3, -2.4, -20.4]],
  void: [[0, 5.2, -20]],
  moon: [[16, 5.35, -20]],
}
/** Where the hanging scroll with the rune order can hang: [position, yaw]. */
export const SCROLL_SPOTS: [V3, number][] = [[[-8.75, 1.75, 12.6], Math.PI / 2], [[-8, 1.75, -13.4], 0], [[-9.05, 1.75, -4], Math.PI / 2]]
const COIN_SPOTS: V3[] = [
  [0, .6, -4.5], [5, .6, -1], [-4, .6, -3.6], [2, .6, -9.6], [-6, .6, -10], [6.5, .6, 6], [-1, .6, 5], [4.5, .6, 1.4], [-5.5, .6, 1.5], [6.8, .6, -7.2],
  [-12, .6, -4], [13, .6, -1.5], [0, .6, -23.6], [18, .6, -23], [-20.3, .6, -22], [-7, .6, -20], [12, .6, 8.4], [-14.6, .6, 9],
]
const courtyard = (p: V3) => Math.abs(p[0]) < 9 && p[2] > -11 && p[2] < 8
const centre = (p: V3) => Math.abs(p[0]) < 6 && p[2] > -9 && p[2] < 6

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
function shuffle<T>(items: readonly T[], r: () => number) { const a = [...items]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }

export type Layout = { runeOrder: Rune[]; starOrder: number[]; valves: number[]; keyPos: Record<string, V3>; coins: { pos: V3; value: number }[]; scroll: number }
const cache = new Map<number, Layout>()
/** Seed 0 is the classic fixed layout (tests and the lobby preview). */
export function layoutFor(seed: number): Layout {
  const hit = cache.get(seed); if (hit) return hit
  const r = rng(seed || 1), fixed = !seed
  const keyPos = Object.fromEntries(Object.entries(KEY_SPOTS).map(([id, spots]) => [id, fixed ? spots[0] : spots[Math.floor(r() * spots.length)]]))
  const coins = shuffle(COIN_SPOTS, r).slice(0, 8).map(pos => ({ pos, value: centre(pos) ? 300 : courtyard(pos) ? 200 : 100 }))
  const layout: Layout = {
    runeOrder: fixed ? [...RUNES] : shuffle(RUNES, r),
    starOrder: fixed ? [0, 1, 2] : shuffle([0, 1, 2], r),
    valves: fixed ? [0, 1] : shuffle([0, 1, 2, 3], r).slice(0, 2).sort(),
    keyPos, coins, scroll: fixed ? 2 : Math.floor(r() * SCROLL_SPOTS.length),
  }
  if (cache.size > 32) cache.clear()
  cache.set(seed, layout); return layout
}
