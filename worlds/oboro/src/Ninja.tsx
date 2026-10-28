import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { FaceCamera, TextPlane } from '@tentenv/sdk'
import * as T from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Materials } from './Architecture'
import { DIFFICULTIES, SMOKE_SPOTS, type Difficulty, type GameState, type V3 } from './game'
import { Touch } from './Pads'

const CONE = { patrol: ['#ffcf3f', .2], investigate: ['#ff9d2e', .24], search: ['#ff9d2e', .24], chase: ['#ff4b3a', .3], warning: ['#ff2a1a', .36], stunned: ['#9aa', 0] } as const
const LABEL: Record<string, string> = { warning: '危険！ 距離を取れ', investigate: '足音を追っている', search: '周囲を捜索中', chase: '見つかった！', stunned: '煙に巻かれた' }

/** Ninja body plus its ground-projected view cone (same fov/sight as the host's detection). */
export function Ninja({ enemy: e, m, active, difficulty }: { enemy: GameState['enemies'][number]; m: Materials; active: boolean; difficulty: Difficulty }) {
  const ref = useRef<T.Group>(null), body = useRef<T.Group>(null), cone = useRef<T.Group>(null), leg1 = useRef<T.Group>(null), leg2 = useRef<T.Group>(null), coneYaw = useRef(e.yaw ?? 0)
  const cfg = DIFFICULTIES[difficulty], half = cfg.fov * Math.PI / 360
  const geometry = useMemo(() => new T.CircleGeometry(cfg.sight, 36, -Math.PI / 2 - half, half * 2), [cfg.sight, half])
  // Bright rim (arc + both edges) so the cone reads on pale sand as well as dark stone.
  const rim = useMemo(() => { const g = new T.RingGeometry(cfg.sight - .12, cfg.sight, 36, 1, -Math.PI / 2 - half, half * 2), pts: number[] = []
    for (const a of [-Math.PI / 2 - half, -Math.PI / 2 + half]) { const c = Math.cos(a), si = Math.sin(a), n = [-si, c]
      for (const [r, w] of [[0, -.05], [cfg.sight, -.05], [cfg.sight, .05], [0, -.05], [cfg.sight, .05], [0, .05]]) pts.push(c * r + n[0] * w, si * r + n[1] * w, 0) }
    const edges = new T.BufferGeometry(); edges.setAttribute('position', new T.Float32BufferAttribute(pts, 3)); edges.setAttribute('normal', new T.Float32BufferAttribute(pts.map((_, i) => i % 3 === 2 ? 1 : 0), 3)); edges.setAttribute('uv', new T.Float32BufferAttribute(new Array(pts.length / 3 * 2).fill(0), 2))
    return mergeGeometries([g.toNonIndexed(), edges]) }, [cfg.sight, half])
  const [color, opacity] = CONE[e.mode] ?? CONE.patrol
  useFrame(({ clock }, dt) => {
    if (!ref.current || !body.current) return
    const dest = new T.Vector3(...e.pos), dir = dest.clone().sub(ref.current.position)
    ref.current.position.lerp(dest, 1 - Math.exp(-dt * 12))
    if (dir.length() > .03) body.current.rotation.y = Math.atan2(dir.x, dir.z)
    const stunned = e.mode === 'stunned', w = stunned ? 0 : Math.sin(clock.elapsedTime * (e.mode === 'patrol' ? 4 : 7)) * .3
    leg1.current!.rotation.x = w; leg2.current!.rotation.x = -w
    if (stunned) body.current.rotation.y += dt * 5
    let d = (e.yaw ?? 0) - coneYaw.current; d = Math.atan2(Math.sin(d), Math.cos(d)); coneYaw.current += d * (1 - Math.exp(-dt * 8))
    if (cone.current) cone.current.rotation.y = coneYaw.current
  })
  return <group ref={ref} position={e.pos} visible={active}>
    <group ref={cone} position={[0, .1, 0]} visible={opacity > 0}>
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}><meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} side={T.DoubleSide} /></mesh>
      <mesh geometry={rim} rotation={[-Math.PI / 2, 0, 0]} position={[0, .01, 0]} renderOrder={3}><meshBasicMaterial color={color} transparent opacity={Math.min(.9, opacity * 3.2)} depthWrite={false} toneMapped={false} side={T.DoubleSide} /></mesh>
    </group>
    <group ref={body}>
      <mesh material={m.cloth} position={[0, 1.12, 0]} castShadow><capsuleGeometry args={[.23, .43, 4, 10]} /></mesh>
      <mesh material={m.cloth} position={[0, 1.67, 0]} castShadow><sphereGeometry args={[.22, 12, 10]} /></mesh>
      <mesh position={[0, 1.71, .193]}><boxGeometry args={[.28, .065, .05]} /><meshStandardMaterial color="#a8997e" roughness={1} /></mesh>
      {[-.07, .07].map(x => <mesh key={x} position={[x, 1.71, .225]}><sphereGeometry args={[.018, 6, 6]} /><meshBasicMaterial color={e.mode === 'chase' || e.mode === 'warning' ? '#ff3b20' : '#171511'} toneMapped={false} /></mesh>)}
      <mesh material={m.red} position={[0, .99, 0]}><boxGeometry args={[.49, .12, .38]} /></mesh>
      {[-1, 1].map((sign, i) => <group key={sign} ref={i === 0 ? leg1 : leg2} position={[sign * .14, .9, 0]}><mesh position={[0, -.36, 0]} material={m.cloth} castShadow><capsuleGeometry args={[.105, .5, 4, 8]} /></mesh><mesh position={[0, -.78, .07]} material={m.ink}><boxGeometry args={[.18, .12, .3]} /></mesh></group>)}
      {[-1, 1].map(sign => <group key={sign} position={[sign * .28, 1.3, 0]} rotation={[e.mode === 'warning' ? -1.3 : .15, 0, sign * .22]}><mesh material={m.cloth} position={[0, -.25, 0]} castShadow><capsuleGeometry args={[.09, .38, 4, 8]} /></mesh><mesh material={m.ink} position={[0, -.5, 0]}><sphereGeometry args={[.095, 8, 8]} /></mesh></group>)}
      <mesh material={m.darkwood} position={[.15, 1.3, -.22]} rotation={[0, 0, -.5]}><cylinderGeometry args={[.035, .035, 1.1, 8]} /></mesh>
    </group>
    {e.mode !== 'patrol' && <><FaceCamera position={[0, 2.25, 0]}><TextPlane text={LABEL[e.mode] ?? '気配を察知'} width={1.8} lineHeight={.19} color={e.mode === 'stunned' ? '#d6dde0' : '#ffab79'} /></FaceCamera>
      {e.mode !== 'stunned' && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .12, 0]}><ringGeometry args={[1.3, 1.45, 40]} /><meshBasicMaterial color="#ec9868" transparent opacity={.65} side={T.DoubleSide} toneMapped={false} /></mesh>}</>}
  </group>
}

/** Smoke bombs on the ground (touch to pick up) and the clouds every client draws from shared state. */
export function Smoke({ state: s, m, send, now }: { state: GameState; m: Materials; send: (kind: string) => void; now: () => number }) {
  const running = s.phase === 'running'
  return <>
    {SMOKE_SPOTS.map((p, i) => (s.smokeLeft?.[i] ?? true) && running && <group key={i} position={p}>
      <mesh material={m.ink} position={[0, .2, 0]} castShadow><sphereGeometry args={[.17, 14, 10]} /></mesh>
      <mesh material={m.red} position={[0, .39, 0]}><cylinderGeometry args={[.03, .03, .1, 8]} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .06, 0]}><ringGeometry args={[.3, .38, 30]} /><meshBasicMaterial color="#cfd6d8" transparent opacity={.7} toneMapped={false} /></mesh>
      <FaceCamera position={[0, .8, 0]}><TextPlane text="煙玉" width={.6} lineHeight={.13} color="#e7ecee" /></FaceCamera>
      <Touch position={[0, .6, 0]} size={[1.3, 1.6, 1.3]} onEnter={() => send(`smoke:take:${i}`)} />
    </group>)}
    {(s.clouds ?? []).map(c => <Cloud key={`${c.at}:${c.by}`} pos={c.pos} at={c.at} now={now} />)}
  </>
}
let puff: T.Texture | null = null
/** Soft round smoke puff, generated once. */
function puffTexture() {
  if (puff) return puff
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!, r = g.createRadialGradient(32, 32, 2, 32, 32, 31)
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.5, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64)
  return puff = new T.CanvasTexture(c)
}
function Cloud({ pos, at, now }: { pos: V3; at: number; now: () => number }) {
  const group = useRef<T.Group>(null)
  const puffs = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ a: i * 2.4, r: .6 + (i % 4) * .55, y: .3 + (i % 5) * .35, s: .7 + (i % 3) * .35 })), [])
  useFrame(() => {
    const g = group.current; if (!g) return
    const t = (now() - at) / 1000, life = Math.max(0, 1 - t / 3.6)
    g.visible = life > 0
    g.children.forEach((child, i) => { const p = puffs[i], k = Math.min(1, t * 2.5); child.position.set(Math.cos(p.a + t * .3) * p.r * k * 1.4, p.y + t * .25, Math.sin(p.a + t * .3) * p.r * k * 1.4); child.scale.setScalar(1.6 * p.s * (.4 + k)); ((child as T.Sprite).material as T.SpriteMaterial).opacity = .6 * life })
  })
  return <group ref={group} position={pos}>{puffs.map((_, i) => <sprite key={i} scale={1.4}><spriteMaterial map={puffTexture()} color="#d5dadb" transparent opacity={.5} depthWrite={false} /></sprite>)}</group>
}
