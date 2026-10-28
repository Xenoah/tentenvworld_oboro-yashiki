import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { FaceCamera, TextPlane, TriggerZone } from '@tentenv/sdk'
import * as T from 'three'
import type { V3 } from './game'

/** One shared cooldown: a warp's arrival must never fire the pad you land beside. */
let lastWarp = 0
export const warpCooldown = () => performance.now() - lastWarp < 900
export const markWarp = () => { lastWarp = performance.now() }

/** Invisible touch volume centred on `position` (the SDK tests feet + 0.5 m). Walking into it is the interaction. */
export function Touch({ position, size = [1.6, 2.4, 1.6], enabled = true, guard = false, onEnter }: { position: V3; size?: V3; enabled?: boolean; guard?: boolean; onEnter: () => void }) {
  const last = useRef(0)
  if (!enabled) return null
  return <TriggerZone position={position} size={size} onEnter={() => { const t = performance.now(); if (t - last.current < 600 || (guard && warpCooldown())) return; last.current = t; onEnter() }} />
}

/** Glowing floor ring with a camera-facing label; stepping on it runs `onEnter` (usually a warp). */
export function Pad({ position, label, onEnter, color = '#f0bf6a', radius = .5, enabled = true, arrow }: { position: V3; label?: string; onEnter: () => void; color?: string; radius?: number; enabled?: boolean; arrow?: number }) {
  const ring = useRef<T.Mesh>(null)
  useFrame(({ clock }) => { if (ring.current) { const k = 1 + Math.sin(clock.elapsedTime * 4) * .06; ring.current.scale.set(k, k, 1) } })
  return <group position={position}>
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, .035, 0]} visible={enabled}><ringGeometry args={[radius * .72, radius, 40]} /><meshBasicMaterial color={color} transparent opacity={.9} toneMapped={false} /></mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .03, 0]} visible={enabled}><circleGeometry args={[radius * .72, 40]} /><meshBasicMaterial color={color} transparent opacity={.22} depthWrite={false} toneMapped={false} /></mesh>
    {arrow !== undefined && enabled && <mesh rotation={[-Math.PI / 2, 0, arrow]} position={[0, .04, 0]}><circleGeometry args={[radius * .45, 3]} /><meshBasicMaterial color="#fff3d4" transparent opacity={.9} toneMapped={false} /></mesh>}
    {label && enabled && <FaceCamera position={[0, 1.55, 0]}><TextPlane text={label} width={1.5} lineHeight={.15} color="#fff0cf" background="#0f2124cc" padding={.04} radius={.03} /></FaceCamera>}
    <Touch position={[0, 1, 0]} size={[radius * 1.5, 2, radius * 1.5]} enabled={enabled} guard onEnter={onEnter} />
  </group>
}

/** Overhead rope between two zipline pads (purely visual). */
export function Rope({ from, to, color = '#b08a52' }: { from: V3; to: V3; color?: string }) {
  const a = new T.Vector3(...from), b = new T.Vector3(...to), mid = a.clone().add(b).multiplyScalar(.5), len = a.distanceTo(b)
  const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize())
  return <mesh position={mid} quaternion={q}><cylinderGeometry args={[.025, .025, len, 6]} /><meshStandardMaterial color={color} roughness={.9} /></mesh>
}
