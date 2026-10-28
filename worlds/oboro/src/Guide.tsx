import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useRuntime } from '@tentenv/sdk'
import * as T from 'three'
import { KEYS, distance, layoutOf, ready, required, type GameState, type V3 } from './game'
import { SCROLL_SPOTS, VALVE_SPOTS } from './layout'

export type Objective = { pos: V3; label: string } | null
type Box = [number, number, number, number]
const inside = (p: V3, [x0, x1, z0, z1]: Box) => p[0] > x0 && p[0] < x1 && p[2] > z0 && p[2] < z1
const STUDY: Box = [-19, -9, -6, 6], VAULT: Box = [-4.5, 4.5, -25, -14.6], CLIMB: Box = [9.5, 20.5, -25, -14.6]
export const STAR_REST: V3[] = [[-2, 1, -17], [2, 2.8, -20], [-2, 4.6, -21]], STAR_PAD: V3[] = [[-2.65, .93, -16.35], [2.65, 2.73, -19.35], [-2.65, 4.53, -20.35]]
const flat = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[2] - b[2])

/** Next step toward the nearest seal still needed (or the gate). Pure, so it can be unit-tested. */
export function objective(s: GameState, me: V3, scrollSeen: boolean, pads: boolean): Objective {
  if (s.phase !== 'running') return null
  const l = layoutOf(s)
  if (ready(s)) return { pos: [0, 0, 16.3], label: '脱出門へ' }
  const left = required(s).filter(id => !s.keys.includes(id))
  const approach = (id: string): V3 => id === 'wood' ? [-12.5, 0, 2.4] : id === 'fire' ? [16, 0, 5.5] : id === 'water' ? [-12.6, 0, -12.4] : id === 'void' ? [0, 0, -16.1] : [11.2, 0, -16]
  const id = left.sort((a, b) => flat(me, approach(a)) - flat(me, approach(b)))[0], key = l.keyPos[id], name = KEYS.find(k => k.id === id)!.name
  if (id === 'wood') {
    if (!s.door && !scrollSeen && s.rune === 0) return { pos: SCROLL_SPOTS[l.scroll][0], label: '掛軸で札の順を確かめる' }
    if (!inside(me, STUDY)) return { pos: [-10, 0, 2.5], label: '書院へ（東の入口）' }
    if (!s.door) return { pos: [-13, 0, 2.2], label: '札を掛軸の順に押す' }
    return { pos: key, label: name }
  }
  if (id === 'fire') return me[1] < 2 ? { pos: [16, 0, 5.5], label: '「跳」の台を踏む' } : { pos: key, label: name }
  if (id === 'water') {
    const open = l.valves.map((slot, i) => ({ slot, i })).filter(v => !s.valves.includes(v.i))
    if (open.length) { const v = open.sort((a, b) => flat(me, VALVE_SPOTS[a.slot].touch) - flat(me, VALVE_SPOTS[b.slot].touch))[0]; return { pos: VALVE_SPOTS[v.slot].touch, label: '水門に触れる' } }
    return me[1] > -1 ? { pos: [-12.6, 0, -12.4], label: '水牢へ潜る' } : { pos: key, label: name }
  }
  if (id === 'void') {
    if (!inside(me, VAULT) || me[1] < .5) return pads ? { pos: [0, 0, -16.1], label: '星蔵の足場へ' } : { pos: STAR_REST[l.starOrder[s.stars.length] ?? 0], label: '星を順に灯す' }
    if (flat(me, [0, 0, -19]) < 1.2 && me[1] > 4) return { pos: key, label: name }
    const rest = STAR_REST.findIndex(r => flat(me, r) < 1.4 && Math.abs(me[1] - r[1]) < 1)
    return rest >= 0 && pads ? { pos: STAR_PAD[rest], label: s.stars.length < 3 ? '次の星の足場へ' : '空の印へ' } : { pos: key, label: name }
  }
  if (me[1] < 1) return { pos: [11.2, 0, -16], label: '壁の足場へ' }
  if (me[1] < 3 && inside(me, CLIMB)) return { pos: [10.6, 1.4, -17.3], label: '天井へ渡る' }
  return { pos: key, label: name }
}

/** A glowing chevron at your feet pointing to the objective, and a light pillar on the objective itself. */
export function Guide({ state, enabled, pads, onChange }: { state: GameState; enabled: boolean; pads: boolean; onChange: (o: Objective) => void }) {
  const rt = useRuntime(), arrow = useRef<T.Group>(null), beam = useRef<T.Group>(null), seen = useRef({ run: -1, scroll: false }), last = useRef(''), acc = useRef(0), target = useRef<Objective>(null)
  const chevron = useMemo(() => { const sh = new T.Shape(); sh.moveTo(0, .55); sh.lineTo(.42, -.1); sh.lineTo(.2, -.1); sh.lineTo(0, .2); sh.lineTo(-.2, -.1); sh.lineTo(-.42, -.1); sh.closePath(); return new T.ShapeGeometry(sh) }, [])
  useFrame(({ clock }, dt) => {
    const pose = rt.pose(rt.self().peerId); if (!pose || !arrow.current || !beam.current) return
    const me = pose.position as V3, s = state, me2 = rt.self().peerId
    if (seen.current.run !== s.run) seen.current = { run: s.run, scroll: false }
    const sc = SCROLL_SPOTS[layoutOf(s).scroll][0]; if (s.phase === 'running' && distance(me, [sc[0], me[1], sc[2]]) < 3) seen.current.scroll = true
    acc.current += dt
    if (acc.current > .25) { acc.current = 0; const o = s.jailed?.[me2] ? null : objective(s, me, seen.current.scroll, pads); target.current = o; const key = o ? `${o.label}@${o.pos.join()}` : ''; if (key !== last.current) { last.current = key; onChange(o) } }
    const o = target.current, show = enabled && !!o
    arrow.current.visible = beam.current.visible = show
    if (!show) return
    const dx = o.pos[0] - me[0], dz = o.pos[2] - me[2], d = Math.hypot(dx, dz)
    arrow.current.visible = d > 3.2
    const yaw = Math.atan2(dx, dz), ahead = 2.8 + Math.sin(clock.elapsedTime * 4) * .15
    arrow.current.position.set(me[0] + Math.sin(yaw) * ahead, me[1] + .09, me[2] + Math.cos(yaw) * ahead); arrow.current.rotation.set(0, yaw, 0)
    beam.current.position.set(o.pos[0], o.pos[1] - 1, o.pos[2])
  })
  return <>
    <group ref={arrow} visible={false}><mesh geometry={chevron} scale={1.5} rotation={[-Math.PI / 2, 0, Math.PI]} renderOrder={4}><meshBasicMaterial color="#ffe29a" transparent opacity={.85} depthWrite={false} toneMapped={false} side={T.DoubleSide} /></mesh></group>
    <group ref={beam} visible={false}><mesh position={[0, 2.5, 0]}><cylinderGeometry args={[.1, .22, 5, 12, 1, true]} /><meshBasicMaterial color="#ffd77e" transparent opacity={.22} depthWrite={false} toneMapped={false} blending={T.AdditiveBlending} side={T.DoubleSide} /></mesh></group>
  </>
}
