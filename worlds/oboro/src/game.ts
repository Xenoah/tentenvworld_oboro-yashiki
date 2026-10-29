import { checkpoint, freshMission, inMissionRoom, missionCommand, MISSION_LIMIT, ROOMS, tickMission, type MissionState } from './missions'
import { ensureCombat, freshVital, observeVitals, restoreVital, strike, COMBAT, NINJA_DAMAGE, type Vital, type Strike } from './combat'
import { observeMotion, quietWindow, type MotionTrack, type Disturbance } from './movement'
import { layoutFor, VALVE_SPOTS, type Layout } from './layout'
/** Host-only, deterministic game rules. All coordinates are metres; timestamps are network ms. */
export type V3 = [number, number, number]
export type Difficulty = 'easy' | 'normal' | 'hard'
export const DIFFICULTIES = {
  easy: { label: '見習い', limit: 480, bonus: 30, speed: 1.05, sight: 6, fov: 100, windup: 2.8, multiplier: 1 },
  normal: { label: '忍び', limit: 300, bonus: 30, speed: 1.65, sight: 8, fov: 110, windup: 2.0, multiplier: 1.5 },
  hard: { label: '上忍', limit: 240, bonus: 20, speed: 2.2, sight: 10, fov: 120, windup: 1.4, multiplier: 2 },
}
export type Mode = 'mission' | 'standard' | 'sprint'
/** 疾風: three random rooms, three minutes. */
export const MODES = { mission: {label:'歪みの部屋'}, standard: { label: '旧・探索' }, sprint: { label: '疾風', limit: 180, bonus: 20 } } as const
/** Casual capture: on 見習い/忍び a caught player goes to the cell; a teammate touching the lock (or the timer) frees them. */
export const JAIL: V3 = [-15.6, .1, 10], JAIL_LOCK: V3 = [-13.1, 0, 10], JAIL_EXIT: V3 = [-12.4, .1, 10]
export const JAIL_TIME = { easy: 12000, normal: 20000, hard: 0 }, JAIL_TIME_TEAM = 45000, CAPTURE_PENALTY = 200
/** "3, 2, 1, 始め" — the round clock and every command wait for this lead-in. */
export const COUNTDOWN = 3000
export const SPAWN: V3 = [0, .1, 13]
export const KEYS = [
  { id: 'wood', name: '木の印', pos: [-17, 1.1, -3] as V3, color: '#e5b773', hint: '一・書院：屋敷のどこかに掛かる掛軸に札の順が書いてある。その順に札を押すと回転扉が開く。' },
  { id: 'fire', name: '火の印', pos: [16, 4.35, 3] as V3, color: '#f59960', hint: '二・跳躍の庭：「跳」の台を踏めば高台へ。印は高台のどこか。' },
  { id: 'water', name: '水の印', pos: [-14, -2.4, -18] as V3, color: '#6ddacb', hint: '三・水牢：水牢の周りに水門が二つ（場所は毎回変わる）。両方に触れてから潜り、水底の印へ。' },
  { id: 'void', name: '空の印', pos: [0, 5.2, -20] as V3, color: '#b0baff', hint: '四・星蔵：星の番号（一→二→三）は毎回入れ替わる。番号順に触れると中央上空の印が現れる。' },
  { id: 'moon', name: '月の印', pos: [16, 5.35, -20] as V3, color: '#f4d49b', hint: '五・天井回廊：壁の足場から天井へ渡り、天井の印へ。' },
] as const
export const ACTIONS: Record<string, V3> = {
  start: [-4.6, 1.2, 10.5], restart: [-4.6, 1.2, 10.5], difficulty: [-4.6, 1.2, 10.5], mode: [-4.6, 1.2, 10.5], free: [-13.1, 1, 10],
  'rune:moon': [-11.8, 1.2, 1], 'rune:wave': [-13, 1.2, 1], 'rune:pine': [-14.2, 1.2, 1],
  door: [-15, 1.2, -1], 'valve:0': [-10, .8, -13], 'valve:1': [-17, .8, -13],
  'star:0': [-2, 1.3, -18], 'star:1': [2, 3.3, -21], 'star:2': [-2, 5.1, -22],
  exit: [0, 1.2, 17],
}
export interface Player { id: string; pos: V3; joinedAt?: number; grounded?: boolean; speed?: number; yaw?: number }
/** Smoke bombs lying in the courtyard; touching one picks it up, B (or the HUD button) throws it. */
export const SMOKE_SPOTS: V3[] = [[-7.6, 0, -9.6], [8.2, 0, 1], [-7.4, 0, 6.6]]
export const SMOKE_RADIUS = 6, SMOKE_STUN = 3000, CLOSE_SENSE = 1.8
export interface Enemy { pos: V3; target: string | null; alertAt: number; waypoint: number; mode: 'patrol' | 'chase' | 'warning' | 'investigate' | 'search' | 'stunned'; heardId?:number; searchUntil?:number; investigate?:V3; reverse?:boolean; yaw?:number; stunUntil?:number; guard?:number; hitAt?:number }
export interface GameState {
  mission: MissionState | null;
  vitals: Record<string,Vital>; strikes: Strike[]; combatSerial: number;
  version: 1; run: number; phase: 'lobby' | 'running' | 'won' | 'lost'; difficulty: Difficulty;
  startedAt: number; updatedAt: number; endedAt: number; keys: string[]; rune: number; door: boolean;
  valves: number[]; stars: number[]; recoveries: number; score: number; reason: string;
  enemies: Enemy[]; protectedUntil: Record<string, number>; roster: string[]; serial: number; motion:Record<string,MotionTrack>; disturbances:Disturbance[]; noiseSerial:number;
  /** Seconds earned by seals, and the lap time (seconds after the start) of each seal. */
  bonus: number; splits: { id: string; t: number }[]; mode: Mode;
  /** Jailed players → release time; captures cost points. */
  jailed: Record<string, number>; captures: number;
  /** Round seed for the puzzle layout (0 = classic), collected coin indices and their points. */
  seed: number; coins: number[]; coinPoints: number;
  /** Remaining smoke bombs on the ground, bombs held per player, recent clouds for every client's effect. */
  smokeLeft: boolean[]; held: Record<string, number>; clouds: { pos: V3; at: number; by: string }[];
}
export type Command = { run: number; kind: string; value?: string; seq?: number }
export const initialState = (run = 0, difficulty: Difficulty = 'normal', mode: Mode = 'standard'): GameState => ({
  mission: mode==='mission'?freshMission(0,difficulty):null,
  vitals: {}, strikes: [], combatSerial: 0,
  version: 1, run, phase: 'lobby', difficulty, startedAt: 0, updatedAt: 0, endedAt: 0, keys: [], rune: 0, door: false,
  valves: [], stars: [], recoveries: 0, score: 0, reason: '', enemies: [
    { pos: [-5, 0, -8], target: null, alertAt: 0, waypoint: 1, mode: 'patrol' },
    { pos: [7, 0, 5], target: null, alertAt: 0, waypoint: 2, mode: 'patrol', reverse: true },
  ], protectedUntil: {}, roster: [], serial: 0, motion:{}, disturbances:[], noiseSerial:0, bonus: 0, splits: [], mode, jailed: {}, captures: 0, seed: 0, coins: [], coinPoints: 0, smokeLeft: SMOKE_SPOTS.map(() => true), held: {}, clouds: [],
})
export const distance = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
export const safe = (p: V3) => p[2] > 8 || p[1] > 1.8 || p[1] < -1 || p[2] < -13 || Math.abs(p[0]) > 9
export const baseLimit = (s: Pick<GameState, 'difficulty' | 'mode'>) => s.mode === 'mission' ? MISSION_LIMIT[s.difficulty] : s.mode === 'sprint' ? MODES.sprint.limit : DIFFICULTIES[s.difficulty].limit
export const sealBonus = (s: Pick<GameState, 'difficulty' | 'mode'>) => s.mode === 'sprint' ? MODES.sprint.bonus : DIFFICULTIES[s.difficulty].bonus
export const timeLimit = (s: GameState) => baseLimit(s) + (s.bonus ?? 0)
/** Seals this round needs to open the gate (all five, or the 疾風 three). */
export const required = (s: GameState): string[] => s.mode === 'sprint' ? layoutOf(s).sprint : KEYS.map(k => k.id)
export const ready = (s: GameState) => required(s).every(id => s.keys.includes(id))
export const elapsed = (s: GameState, now: number) => Math.max(0, now - s.startedAt) / 1000
export const remaining = (s: GameState, now: number) => Math.max(0, timeLimit(s) - elapsed(s, now))
export const scoreFor = (s: GameState, now: number) => Math.max(0, Math.round((s.keys.length * 1000 + (s.coinPoints ?? 0) + (s.phase === 'won' ? 3000 + remaining(s, now) * 4 : 0) - s.recoveries * 150 - (s.mission?.retries??0)*50 - (s.captures ?? 0) * CAPTURE_PENALTY) * DIFFICULTIES[s.difficulty].multiplier))
export const layoutOf = (s: GameState): Layout => layoutFor(s.seed ?? 0)
/** Where an action really is this round (valves, seals and coins move with the seed). */
export function actionPos(s: GameState, kind: string): V3 | undefined {
  if(s.mode==='mission'&&['start','restart','difficulty','mode'].includes(kind))return checkpoint(s)
  const l = layoutOf(s)
  if (kind.startsWith('valve:')) { const slot = l.valves[Number(kind.slice(6))]; return slot === undefined ? undefined : VALVE_SPOTS[slot].pos }
  if (kind.startsWith('key:')) return KEYS.some(k => k.id === kind.slice(4)) ? l.keyPos[kind.slice(4)] : undefined
  if (kind.startsWith('coin:')) return l.coins[Number(kind.slice(5))]?.pos
  return ACTIONS[kind]
}
function finish(s: GameState, phase: 'won' | 'lost', now: number, reason: string) { s.phase = phase; s.endedAt = now; s.reason = reason; s.score = scoreFor(s, now); return s }
export function command(state: GameState, cmd: Command, player: Player, now: number, host: boolean): GameState {
  if (!cmd || typeof cmd.kind !== 'string' || cmd.run !== state.run || !player.pos.every(Number.isFinite)) return state
  const pos = actionPos(state, cmd.kind)
  if (pos && distance(pos, player.pos) > (['start','restart','difficulty','mode'].includes(cmd.kind)?6.4:3.4)) return state
  const smokeSpot = cmd.kind.startsWith('smoke:take:') ? SMOKE_SPOTS[Number(cmd.kind.slice(11))] : undefined
  if (smokeSpot && distance(smokeSpot, player.pos) > 2.6) return state
  if (!pos && !smokeSpot && !['recover', 'brace', 'smoke:use', 'attack', 'mission'].includes(cmd.kind)) return state
  const s: GameState = structuredClone(state);ensureCombat(s);s.motion??={};s.disturbances??=[];s.noiseSerial??=0
  if (cmd.kind === 'difficulty' && host && s.phase !== 'running' && cmd.value && cmd.value in DIFFICULTIES) { s.difficulty = cmd.value as Difficulty; return s }
  if (cmd.kind === 'mode' && host && s.phase !== 'running' && cmd.value && cmd.value in MODES) { s.mode = cmd.value as Mode;s.mission=s.mode==='mission'?freshMission(0,s.difficulty):null; return s }
  if ((cmd.kind === 'start' && s.phase === 'lobby') || (cmd.kind === 'restart' && (s.phase === 'lost' || s.phase === 'won'))) {
    if (!host) return state
    const next = initialState(s.run + 1, s.difficulty, s.mode ?? 'standard')
    next.seed = (Math.floor(now) ^ (s.run + 1) * 2654435761) >>> 0 || 1
    next.vitals[player.id] = freshVital(); next.phase = 'running'; next.startedAt = now + COUNTDOWN; next.updatedAt = now; next.roster = [player.id]; if(next.mode==='mission')next.mission=freshMission(next.startedAt,next.difficulty); next.protectedUntil[player.id] = now + COUNTDOWN + 12000
    return next
  }
  if (s.phase !== 'running' || now < s.startedAt) return state
  if (!s.roster.includes(player.id) || s.jailed?.[player.id]) return state
  if(s.mode==='mission'&&(['rune:','valve:','star:','key:','coin:'].some(prefix=>cmd.kind.startsWith(prefix))))return state
  if (cmd.kind === 'mission') {
    if(s.mode!=='mission'||!missionCommand(s,player,cmd.value,cmd.seq,now,host))return state
  } else if (cmd.kind === 'attack') {
    if (!strike(s,player,cmd.seq,now,lineOfSight)) return state
    s.serial++; return s
  } else if (smokeSpot) {
    const i = Number(cmd.kind.slice(11)); s.smokeLeft ??= SMOKE_SPOTS.map(() => true); s.held ??= {}
    if (!s.smokeLeft[i]) return state
    s.smokeLeft[i] = false; s.held[player.id] = (s.held[player.id] ?? 0) + 1; s.serial++; return s
  } else if (cmd.kind === 'smoke:use') {
    s.held ??= {}; s.clouds ??= []
    if (!(s.held[player.id] > 0)) return state
    s.held[player.id]--; s.clouds = [...s.clouds.filter(c => now - c.at < 8000), { pos: [...player.pos] as V3, at: now, by: player.id }].slice(-4)
    for (const e of s.enemies) if (distance(e.pos, player.pos) < SMOKE_RADIUS) { e.stunUntil = Math.max(e.stunUntil ?? 0, now + SMOKE_STUN); e.target = null; e.alertAt = 0; e.mode = 'stunned' }
    s.serial++; return s
  } else if (cmd.kind === 'brace') {
    const m=s.motion[player.id]
    if(!m||m.grounded||player.grounded===true||m.braceUsed||now-m.at>3000||distance(m.pos,player.pos)>1)return state
    m.braceAt=quietWindow(m,player.pos)?now:0;m.braceUsed=true;s.serial++;return s
  } else if (cmd.kind === 'recover') {
    // A cooldown prevents accidental repeated rescue penalties and repeated event delivery.
    if ((s.protectedUntil[player.id] ?? 0) > now + 5000) return state
    s.recoveries++; s.protectedUntil[player.id] = now + 9000
  } else if (cmd.kind.startsWith('rune:') && !s.door) {
    const sequence = layoutOf(s).runeOrder.map(r => `rune:${r}`)
    s.rune = cmd.kind === sequence[s.rune] ? s.rune + 1 : cmd.kind === sequence[0] ? 1 : 0
    if (s.rune === 3) s.door = true
  } else if (cmd.kind.startsWith('valve:')) {
    const n = Number(cmd.kind.split(':')[1]); if (![0, 1].includes(n) || s.valves.includes(n)) return state
    s.valves.push(n)
  } else if (cmd.kind.startsWith('star:')) {
    const n = Number(cmd.kind.split(':')[1]); if (n !== layoutOf(s).starOrder[s.stars.length]) return state
    s.stars.push(n)
  } else if (cmd.kind.startsWith('key:')) {
    const key = cmd.kind.slice(4)
    if (!required(s).includes(key) || s.keys.includes(key)) return state
    if ((key === 'wood' && !s.door) || (key === 'water' && s.valves.length !== 2) || (key === 'void' && s.stars.length !== 3)) return state
    s.keys.push(key); s.bonus = (s.bonus ?? 0) + sealBonus(s)
    ;(s.splits ??= []).push({ id: key, t: Math.round(elapsed(s, now) * 10) / 10 })
  } else if (cmd.kind.startsWith('coin:')) {
    const i = Number(cmd.kind.slice(5)), coin = layoutOf(s).coins[i]; s.coins ??= []
    if (!coin || s.coins.includes(i)) return state
    s.coins.push(i); s.coinPoints = (s.coinPoints ?? 0) + coin.value
  } else if (cmd.kind === 'free') {
    s.jailed ??= {}; if (!Object.keys(s.jailed).length) return state
    for (const id of Object.keys(s.jailed)) { delete s.jailed[id]; restoreVital(s,id); s.protectedUntil[id] = now + 6000 }
  } else if (cmd.kind === 'exit' && ready(s) && (s.mode!=='mission'||s.mission?.stage===5)) return finish(s, 'won', now, s.mode==='mission'?'歪んだ五つの部屋を抜け、夜風の庭から生還した。':s.mode === 'sprint' ? '三つの印で朧の門が開いた。疾風のごとく。' : '五つの印が結ばれ、朧の門が開いた。')
  else return state
  s.score = scoreFor(s, now); s.serial++; return s
}
// Axis-aligned sight blockers match the courtyard's stone garden and screens.
/** Stone islands and two folding screens (byobu); they block sight, hearing falloff and ninja movement. */
export const BLOCKERS = [[-2.6, -.4, -2.8, 1.4], [3.5, 5.8, -6.5, -4], [-8, -6.5, 2, 4], [2, 4, 2.85, 3.15], [-3.4, -1.6, -6.65, -6.35]]
export function lineOfSight(a: V3, b: V3) {
  return !BLOCKERS.some(([x0,x1,z0,z1]) => {
    let t0 = 0, t1 = 1
    for (const [start, delta, min, max] of [[a[0],b[0]-a[0],x0,x1],[a[2],b[2]-a[2],z0,z1]]) {
      if (Math.abs(delta) < .0001) { if (start < min || start > max) return false }
      else { const v0 = (min-start)/delta, v1 = (max-start)/delta; t0 = Math.max(t0, Math.min(v0,v1)); t1 = Math.min(t1, Math.max(v0,v1)); if (t0 > t1) return false }
    }
    return true
  })
}
// A blocker-free perimeter loop. The second ninja walks it in reverse so both halves stay guarded.
export const ROUTE: V3[] = [[-5,0,-8], [6,0,-9], [7.5,0,-2], [7,0,5], [-4,0,5.5], [-5,0,-1]]
const nextWaypoint=(e:Enemy)=>(e.waypoint+(e.reverse?ROUTE.length-1:1))%ROUTE.length
export function tick(state: GameState, players: Player[], now: number): GameState {
  if (state.phase !== 'running') return state
  const s: GameState = structuredClone(state), cfg = DIFFICULTIES[s.difficulty]
  ensureCombat(s);s.motion??={};s.disturbances??=[];s.noiseSerial??=0
  const dt = Math.max(0, Math.min(.35, (now - s.updatedAt) / 1000)); s.updatedAt = now
  const present = players.slice(0,4)
  s.roster = present.map(p => p.id)
  for (const p of present) if (!(p.id in s.protectedUntil)) s.protectedUntil[p.id] = now + 12000
  // Prune disconnected peers, so reconnects get fresh spawn protection; state remains <16 KB.
  for (const id of Object.keys(s.protectedUntil)) if (!s.roster.includes(id)) delete s.protectedUntil[id]
  for(const id of Object.keys(s.motion))if(!s.roster.includes(id))delete s.motion[id]
  s.held??={};for(const id of Object.keys(s.held))if(!s.roster.includes(id))delete s.held[id]
  for(const id of Object.keys(s.vitals))if(!s.roster.includes(id))delete s.vitals[id]
  s.strikes=s.strikes.filter(e=>now-e.at<1500)
  s.clouds=(s.clouds??[]).filter(c=>now-c.at<8000)
  s.disturbances=s.disturbances.filter(e=>now-e.at<6500)
  for(const p of present){observeVitals(s,p,dt,now);const observed=observeMotion(s.motion[p.id],p,now);s.motion[p.id]=observed.motion;for(const e of observed.events)s.disturbances.push({...e,by:p.id,id:++s.noiseSerial})}
  s.disturbances=s.disturbances.slice(-16)
  if (now >= s.startedAt && remaining(s, now) <= 0) return finish(s, 'lost', now, '夜明けの鐘。任務時間が尽きた。')
  s.jailed ??= {}
  for (const [id, until] of Object.entries(s.jailed)) if (now >= until || !s.roster.includes(id)) { delete s.jailed[id]; if (s.roster.includes(id)) { restoreVital(s,id); s.protectedUntil[id] = now + 6000 } }
  if(s.mode==='mission'&&s.mission&&s.mission.stage<5){
    if(tickMission(s,present,now,dt)){const id=ROOMS[s.mission.stage].id;if(!s.keys.includes(id)){s.keys.push(id);s.bonus+=sealBonus(s);s.splits.push({id,t:Math.round(elapsed(s,now)*10)/10});s.score=scoreFor(s,now);s.serial++}}
    return s
  }
  if (now - s.startedAt < 15000) return s
  s.enemies.forEach(enemy => {
    if (now < (enemy.stunUntil ?? 0)) { enemy.mode = 'stunned'; enemy.target = null; enemy.alertAt = 0; return }
    if (enemy.guard === 0) enemy.guard = 100
    const candidates = present.filter(p => !s.jailed[p.id] && !safe(p.pos) && now > (s.protectedUntil[p.id] ?? 0) && distance(p.pos, enemy.pos) < cfg.sight && lineOfSight(enemy.pos, p.pos) && (enemy.target === p.id || inView(enemy, p.pos, cfg.fov))).sort((a,b)=>distance(a.pos,enemy.pos)-distance(b.pos,enemy.pos))
    const target = candidates[0]
    if (target) {
      if (enemy.target !== target.id) enemy.alertAt = now
      enemy.target = target.id
      const d = distance(target.pos, enemy.pos)
      if (d < 1.5) {
        if (enemy.mode !== 'warning') enemy.alertAt = now
        enemy.mode = 'warning'
        if (now - enemy.alertAt > cfg.windup * 1000 && s.phase === 'running') hit(s, enemy, target.id, now)
      } else { enemy.mode = 'chase'; move(enemy, target.pos, cfg.speed * dt) }
    } else {
      enemy.target=null;enemy.alertAt=0
      const heard=s.disturbances.filter(e=>e.id>(enemy.heardId??0)&&now-e.at<1200&&now>(s.protectedUntil[e.by]??0)&&e.radius>0&&distance(e.pos,enemy.pos)<hearingRange(e,enemy.pos)).at(-1)
      if(heard){enemy.heardId=heard.id;enemy.investigate=[Math.max(-8.4,Math.min(8.4,heard.pos[0])),0,Math.max(-11,Math.min(7.5,heard.pos[2]))];enemy.searchUntil=now+6500}
      if(enemy.investigate&&now<(enemy.searchUntil??0)){
        enemy.mode=distance(enemy.pos,enemy.investigate)<.65?'search':'investigate'
        if(enemy.mode==='investigate')move(enemy,enemy.investigate,cfg.speed*.8*dt)
        else enemy.yaw=(enemy.yaw??0)+dt*2.2
      }else{
        enemy.mode='patrol';delete enemy.investigate
        const p=ROUTE[enemy.waypoint];if(distance(enemy.pos,p)<.3)enemy.waypoint=nextWaypoint(enemy)
        move(enemy,ROUTE[enemy.waypoint],cfg.speed*.45*dt)
      }
    }
  })
  return s
}
function move(e: Enemy, p: V3, amount: number) {
  const dx = p[0]-e.pos[0], dz = p[2]-e.pos[2], d = Math.hypot(dx,dz)
  if (d < .01) return
  e.yaw = Math.atan2(dx, dz)
  const next: V3 = [e.pos[0]+dx/d*Math.min(d,amount), 0, e.pos[2]+dz/d*Math.min(d,amount)]
  // Collision sliding around courtyard obstacles; enemies cannot attack through them.
  const blocked=(v:V3)=>BLOCKERS.some(([a,b,c,d])=>v[0]>a-.3&&v[0]<b+.3&&v[2]>c-.3&&v[2]<d+.3)
  if(blocked(next)){
    const alternatives:V3[]=[[e.pos[0],0,e.pos[2]+(dz>=0?1:-1)*amount],[e.pos[0]+(dx>=0?1:-1)*amount,0,e.pos[2]],[e.pos[0],0,e.pos[2]-(dz>=0?1:-1)*amount]]
    const slide=alternatives.find(v=>!blocked(v));if(slide)e.pos=slide;return
  }
  e.pos = next
}

function hit(s: GameState, enemy: Enemy, id: string, now: number) {
  const v = s.vitals[id] ??= freshVital()
  if (now < v.invulnerableUntil) return
  v.hp = Math.max(0,v.hp-NINJA_DAMAGE[s.difficulty]); v.hurtAt = now; v.invulnerableUntil = now + COMBAT.invulnerable
  enemy.alertAt = now; enemy.mode = 'chase'; s.serial++
  if (v.hp === 0) capture(s,enemy,id,now)
}

function capture(s: GameState, enemy: Enemy, id: string, now: number) {
  if (s.difficulty === 'hard') { finish(s, 'lost', now, '忍びに捕らえられた。煙の中、探索は幕を閉じる。'); return }
  const solo = s.roster.length <= 1, release = now + (solo ? JAIL_TIME[s.difficulty] : JAIL_TIME_TEAM)
  s.jailed[id] = release; s.protectedUntil[id] = release + 6000; s.captures = (s.captures ?? 0) + 1
  enemy.target = null; enemy.alertAt = 0; enemy.mode = 'patrol'
  s.score = scoreFor(s, now); s.serial++
}
/** Ninjas see a forward cone (fov degrees) plus anything within CLOSE_SENSE metres. */
export function inView(e: Enemy, p: V3, fov: number) {
  const dx = p[0] - e.pos[0], dz = p[2] - e.pos[2]
  if (Math.hypot(dx, dz) < CLOSE_SENSE) return true
  let diff = Math.atan2(dx, dz) - (e.yaw ?? 0); diff = Math.atan2(Math.sin(diff), Math.cos(diff))
  return Math.abs(diff) <= fov * Math.PI / 360
}
export function hearingRange(e:Disturbance,listener:V3){return e.radius*(lineOfSight(e.pos,listener)?1:.55)*(Math.abs(e.pos[0])>9||e.pos[2]>8?.65:1)*(e.pos[1]>2?.6:1)}
