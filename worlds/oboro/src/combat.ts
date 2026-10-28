import type { GameState, Player, V3 } from './game'

/** All combat decisions run on the elected host, from its latest replicated poses. */
export const COMBAT = { hp: 100, stamina: 100, cost: 22, cooldown: 750, range: 2.4, cone: 100, damage: 40, stagger: 950, retreat: 8000, invulnerable: 1800, drain: 18, regen: 15, recover: 30 } as const
export const NINJA_DAMAGE = { easy: 35, normal: 50, hard: 100 } as const
export interface Vital { hp: number; stamina: number; exhausted: boolean; attackAt: number; attackSeq: number; hurtAt: number; invulnerableUntil: number; spentAt: number }
export interface Strike { id: number; by: string; at: number; pos: V3; yaw: number; hit: number | null }
export const freshVital = (): Vital => ({ hp: 100, stamina: 100, exhausted: false, attackAt: 0, attackSeq: 0, hurtAt: 0, invulnerableUntil: 0, spentAt: 0 })
export function ensureCombat(s: GameState) { s.vitals ??= {}; s.strikes ??= []; s.combatSerial ??= 0 }
export function restoreVital(s: GameState, id: string) {
  const old = s.vitals[id]
  // Keep the accepted request sequence across a rescue: delayed packets must not replay.
  s.vitals[id] = { ...freshVital(), attackSeq: old?.attackSeq ?? 0, attackAt: old?.attackAt ?? 0 }
}
export function observeVitals(s: GameState, p: Player, dt: number, now: number) {
  const v = s.vitals[p.id] ??= freshVital()
  if (s.jailed?.[p.id] || now < s.startedAt) return
  const previous = s.motion[p.id], gap = previous ? (now - previous.at) / 1000 : 0
  const moved = previous && gap > 0 && gap <= 2 ? Math.hypot(p.pos[0] - previous.pos[0], p.pos[2] - previous.pos[2]) / gap : 0
  // Require both observed displacement and reported speed; teleporting cannot count as sprint.
  const sprint = p.grounded !== false && (p.speed ?? moved) > 3.05 && moved > .05 && moved < 10
  if (sprint && !v.exhausted) { v.stamina = Math.max(0, v.stamina - COMBAT.drain * dt); v.spentAt = now }
  else if (now - v.spentAt > 650) v.stamina = Math.min(COMBAT.stamina, v.stamina + COMBAT.regen * dt)
  if (v.stamina <= .01) v.exhausted = true
  else if (v.stamina >= COMBAT.recover) v.exhausted = false
  v.stamina = Math.round(v.stamina * 100) / 100
}
export function strike(s: GameState, p: Player, seq: unknown, now: number, visible: (a: V3, b: V3) => boolean) {
  const v = s.vitals[p.id] ??= freshVital()
  if (!Number.isSafeInteger(seq) || (seq as number) <= v.attackSeq || !Number.isFinite(p.yaw) || v.hp <= 0 || v.stamina < COMBAT.cost || now - v.attackAt < COMBAT.cooldown) return false
  // No client target, damage, range or timing is trusted.
  v.attackSeq = seq as number; v.attackAt = now; v.spentAt = now; v.stamina -= COMBAT.cost
  if (v.stamina <= .01) v.exhausted = true
  const yaw = p.yaw!, fx = -Math.sin(yaw), fz = -Math.cos(yaw)
  const choices = s.enemies.map((e, i) => ({ e, i, dx: e.pos[0] - p.pos[0], dz: e.pos[2] - p.pos[2] })).filter(({e,dx,dz}) => {
    const d = Math.hypot(dx,dz)
    return (e.guard ?? 100) > 0 && Math.abs(e.pos[1] - p.pos[1]) < 1.6 && d > .01 && d <= COMBAT.range && (dx*fx+dz*fz)/d >= Math.cos(COMBAT.cone*Math.PI/360) && visible(p.pos,e.pos)
  }).sort((a,b) => Math.hypot(a.dx,a.dz)-Math.hypot(b.dx,b.dz))
  const chosen = choices[0]
  if (chosen) {
    const e = chosen.e
    e.guard = Math.max(0,(e.guard ?? 100)-COMBAT.damage); e.hitAt = now
    e.stunUntil = Math.max(e.stunUntil ?? 0, now + (e.guard === 0 ? COMBAT.retreat : COMBAT.stagger))
    e.mode = 'stunned'; e.target = null; e.alertAt = 0
  }
  s.strikes = [...s.strikes.filter(e => now-e.at < 1500),{ id:++s.combatSerial,by:p.id,at:now,pos:[...p.pos] as V3,yaw,hit:chosen?.i ?? null }].slice(-8)
  return true
}
