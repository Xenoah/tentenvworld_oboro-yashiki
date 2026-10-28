import { observeMotion, quietWindow, type MotionTrack, type Disturbance } from './movement'
/** Host-only, deterministic game rules. All coordinates are metres; timestamps are network ms. */
export type V3 = [number, number, number]
export type Difficulty = 'easy' | 'normal' | 'hard'
export const DIFFICULTIES = {
  easy: { label: '見習い', limit: 480, bonus: 30, speed: 1.05, sight: 6, windup: 2.8, multiplier: 1 },
  normal: { label: '忍び', limit: 300, bonus: 30, speed: 1.65, sight: 8, windup: 2.0, multiplier: 1.5 },
  hard: { label: '上忍', limit: 240, bonus: 20, speed: 2.2, sight: 10, windup: 1.4, multiplier: 2 },
}
/** "3, 2, 1, 始め" — the round clock and every command wait for this lead-in. */
export const COUNTDOWN = 3000
export const SPAWN: V3 = [0, .1, 13]
export const KEYS = [
  { id: 'wood', name: '木の印', pos: [-17, 1.1, -3] as V3, color: '#e5b773', hint: '一・書院：掛軸の「月 → 波 → 松」の順に印を押し、回転扉の奥へ。' },
  { id: 'fire', name: '火の印', pos: [16, 4.35, 3] as V3, color: '#f59960', hint: '二・跳躍の庭：踏切台から高台へ。快適モードでは足場を選べます。' },
  { id: 'water', name: '水の印', pos: [-14, -2.4, -18] as V3, color: '#6ddacb', hint: '三・水牢：二つの水門を開け、水底の箱へ。浮上と休憩は自由です。' },
  { id: 'void', name: '空の印', pos: [0, 5.2, -20] as V3, color: '#b0baff', hint: '四・星蔵：三つの星を順に灯す。上昇・下降して中央の印を探そう。' },
  { id: 'moon', name: '月の印', pos: [16, 5.35, -20] as V3, color: '#f4d49b', hint: '五・天井回廊：壁の足袋から壁へ、上の印から天井へ渡ります。' },
] as const
export const ACTIONS: Record<string, V3> = {
  start: [-4.6, 1.2, 10.5], restart: [-4.6, 1.2, 10.5], difficulty: [-4.6, 1.2, 10.5],
  'rune:moon': [-11.8, 1.2, 1], 'rune:wave': [-13, 1.2, 1], 'rune:pine': [-14.2, 1.2, 1],
  door: [-15, 1.2, -1], 'valve:0': [-10, .8, -13], 'valve:1': [-17, .8, -13],
  'star:0': [-2, 1.3, -18], 'star:1': [2, 3.3, -21], 'star:2': [-2, 5.1, -22],
  exit: [0, 1.2, 17],
}
export interface Player { id: string; pos: V3; joinedAt?: number; grounded?: boolean; speed?: number }
export interface Enemy { pos: V3; target: string | null; alertAt: number; waypoint: number; mode: 'patrol' | 'chase' | 'warning' | 'investigate' | 'search'; heardId?:number; searchUntil?:number; investigate?:V3; reverse?:boolean }
export interface GameState {
  version: 1; run: number; phase: 'lobby' | 'running' | 'won' | 'lost'; difficulty: Difficulty;
  startedAt: number; updatedAt: number; endedAt: number; keys: string[]; rune: number; door: boolean;
  valves: number[]; stars: number[]; recoveries: number; score: number; reason: string;
  enemies: Enemy[]; protectedUntil: Record<string, number>; roster: string[]; serial: number; motion:Record<string,MotionTrack>; disturbances:Disturbance[]; noiseSerial:number;
  /** Seconds earned by seals, and the lap time (seconds after the start) of each seal. */
  bonus: number; splits: { id: string; t: number }[];
}
export type Command = { run: number; kind: string; value?: string }
export const initialState = (run = 0, difficulty: Difficulty = 'normal'): GameState => ({
  version: 1, run, phase: 'lobby', difficulty, startedAt: 0, updatedAt: 0, endedAt: 0, keys: [], rune: 0, door: false,
  valves: [], stars: [], recoveries: 0, score: 0, reason: '', enemies: [
    { pos: [-5, 0, -8], target: null, alertAt: 0, waypoint: 1, mode: 'patrol' },
    { pos: [7, 0, 5], target: null, alertAt: 0, waypoint: 2, mode: 'patrol', reverse: true },
  ], protectedUntil: {}, roster: [], serial: 0, motion:{}, disturbances:[], noiseSerial:0, bonus: 0, splits: [],
})
export const distance = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
export const safe = (p: V3) => p[2] > 8 || p[1] > 1.8 || p[1] < -1 || p[2] < -13 || Math.abs(p[0]) > 9
export const timeLimit = (s: GameState) => DIFFICULTIES[s.difficulty].limit + (s.bonus ?? 0)
export const elapsed = (s: GameState, now: number) => Math.max(0, now - s.startedAt) / 1000
export const remaining = (s: GameState, now: number) => Math.max(0, timeLimit(s) - elapsed(s, now))
export const scoreFor = (s: GameState, now: number) => Math.max(0, Math.round((s.keys.length * 1000 + (s.phase === 'won' ? 3000 + remaining(s, now) * 4 : 0) - s.recoveries * 150) * DIFFICULTIES[s.difficulty].multiplier))
function finish(s: GameState, phase: 'won' | 'lost', now: number, reason: string) { s.phase = phase; s.endedAt = now; s.reason = reason; s.score = scoreFor(s, now); return s }
export function command(state: GameState, cmd: Command, player: Player, now: number, host: boolean): GameState {
  if (!cmd || typeof cmd.kind !== 'string' || cmd.run !== state.run || !player.pos.every(Number.isFinite)) return state
  const pos = ACTIONS[cmd.kind] ?? KEYS.find(k => `key:${k.id}` === cmd.kind)?.pos
  if (pos && distance(pos, player.pos) > (['start','restart','difficulty'].includes(cmd.kind)?6.4:3.4)) return state
  if (!pos && cmd.kind !== 'recover' && cmd.kind !== 'brace') return state
  const s: GameState = structuredClone(state);s.motion??={};s.disturbances??=[];s.noiseSerial??=0
  if (cmd.kind === 'difficulty' && host && s.phase !== 'running' && cmd.value && cmd.value in DIFFICULTIES) { s.difficulty = cmd.value as Difficulty; return s }
  if ((cmd.kind === 'start' && s.phase === 'lobby') || (cmd.kind === 'restart' && (s.phase === 'lost' || s.phase === 'won'))) {
    if (!host) return state
    const next = initialState(s.run + 1, s.difficulty)
    next.phase = 'running'; next.startedAt = now + COUNTDOWN; next.updatedAt = now; next.roster = [player.id]; next.protectedUntil[player.id] = now + COUNTDOWN + 12000
    return next
  }
  if (s.phase !== 'running' || now < s.startedAt) return state
  if (!s.roster.includes(player.id)) return state
  if (cmd.kind === 'brace') {
    const m=s.motion[player.id]
    if(!m||m.grounded||player.grounded===true||m.braceUsed||now-m.at>3000||distance(m.pos,player.pos)>1)return state
    m.braceAt=quietWindow(m,player.pos)?now:0;m.braceUsed=true;s.serial++;return s
  } else if (cmd.kind === 'recover') {
    // A cooldown prevents accidental repeated rescue penalties and repeated event delivery.
    if ((s.protectedUntil[player.id] ?? 0) > now + 5000) return state
    s.recoveries++; s.protectedUntil[player.id] = now + 9000
  } else if (cmd.kind.startsWith('rune:') && !s.door) {
    const sequence = ['rune:moon', 'rune:wave', 'rune:pine']
    s.rune = cmd.kind === sequence[s.rune] ? s.rune + 1 : cmd.kind === sequence[0] ? 1 : 0
    if (s.rune === 3) s.door = true
  } else if (cmd.kind.startsWith('valve:')) {
    const n = Number(cmd.kind.split(':')[1]); if (![0, 1].includes(n) || s.valves.includes(n)) return state
    s.valves.push(n)
  } else if (cmd.kind.startsWith('star:')) {
    const n = Number(cmd.kind.split(':')[1]); if (n !== s.stars.length || ![0, 1, 2].includes(n)) return state
    s.stars.push(n)
  } else if (cmd.kind.startsWith('key:')) {
    const key = cmd.kind.slice(4)
    if (!KEYS.some(k => k.id === key) || s.keys.includes(key)) return state
    if ((key === 'wood' && !s.door) || (key === 'water' && s.valves.length !== 2) || (key === 'void' && s.stars.length !== 3)) return state
    s.keys.push(key); s.bonus = (s.bonus ?? 0) + DIFFICULTIES[s.difficulty].bonus
    ;(s.splits ??= []).push({ id: key, t: Math.round(elapsed(s, now) * 10) / 10 })
  } else if (cmd.kind === 'exit' && s.keys.length === KEYS.length) return finish(s, 'won', now, '五つの印が結ばれ、朧の門が開いた。')
  else return state
  s.score = scoreFor(s, now); s.serial++; return s
}
// Axis-aligned sight blockers match the courtyard's stone garden and screens.
export const BLOCKERS = [[-2.6, -.4, -2.8, 1.4], [3.5, 5.8, -6.5, -4], [-8, -6.5, 2, 4]]
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
  s.motion??={};s.disturbances??=[];s.noiseSerial??=0
  const dt = Math.max(0, Math.min(.35, (now - s.updatedAt) / 1000)); s.updatedAt = now
  const present = players.slice(0,4)
  s.roster = present.map(p => p.id)
  for (const p of present) if (!(p.id in s.protectedUntil)) s.protectedUntil[p.id] = now + 12000
  // Prune disconnected peers, so reconnects get fresh spawn protection; state remains <16 KB.
  for (const id of Object.keys(s.protectedUntil)) if (!s.roster.includes(id)) delete s.protectedUntil[id]
  for(const id of Object.keys(s.motion))if(!s.roster.includes(id))delete s.motion[id]
  s.disturbances=s.disturbances.filter(e=>now-e.at<6500)
  for(const p of present){const observed=observeMotion(s.motion[p.id],p,now);s.motion[p.id]=observed.motion;for(const e of observed.events)s.disturbances.push({...e,by:p.id,id:++s.noiseSerial})}
  s.disturbances=s.disturbances.slice(-16)
  if (now >= s.startedAt && remaining(s, now) <= 0) return finish(s, 'lost', now, '夜明けの鐘。任務時間が尽きた。')
  if (now - s.startedAt < 15000) return s
  s.enemies.forEach(enemy => {
    const candidates = present.filter(p => !safe(p.pos) && now > (s.protectedUntil[p.id] ?? 0) && distance(p.pos, enemy.pos) < cfg.sight && lineOfSight(enemy.pos, p.pos)).sort((a,b)=>distance(a.pos,enemy.pos)-distance(b.pos,enemy.pos))
    const target = candidates[0]
    if (target) {
      if (enemy.target !== target.id) enemy.alertAt = now
      enemy.target = target.id
      const d = distance(target.pos, enemy.pos)
      if (d < 1.5) {
        if (enemy.mode !== 'warning') enemy.alertAt = now
        enemy.mode = 'warning'
        if (now - enemy.alertAt > cfg.windup * 1000 && s.phase === 'running') finish(s, 'lost', now, '忍びに捕らえられた。煙の中、探索は幕を閉じる。')
      } else { enemy.mode = 'chase'; move(enemy, target.pos, cfg.speed * dt) }
    } else {
      enemy.target=null;enemy.alertAt=0
      const heard=s.disturbances.filter(e=>e.id>(enemy.heardId??0)&&now-e.at<1200&&now>(s.protectedUntil[e.by]??0)&&e.radius>0&&distance(e.pos,enemy.pos)<hearingRange(e,enemy.pos)).at(-1)
      if(heard){enemy.heardId=heard.id;enemy.investigate=[Math.max(-8.4,Math.min(8.4,heard.pos[0])),0,Math.max(-11,Math.min(7.5,heard.pos[2]))];enemy.searchUntil=now+6500}
      if(enemy.investigate&&now<(enemy.searchUntil??0)){
        enemy.mode=distance(enemy.pos,enemy.investigate)<.65?'search':'investigate'
        if(enemy.mode==='investigate')move(enemy,enemy.investigate,cfg.speed*.8*dt)
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
  const next: V3 = [e.pos[0]+dx/d*Math.min(d,amount), 0, e.pos[2]+dz/d*Math.min(d,amount)]
  // Collision sliding around courtyard obstacles; enemies cannot attack through them.
  const blocked=(v:V3)=>BLOCKERS.some(([a,b,c,d])=>v[0]>a-.3&&v[0]<b+.3&&v[2]>c-.3&&v[2]<d+.3)
  if(blocked(next)){
    const alternatives:V3[]=[[e.pos[0],0,e.pos[2]+(dz>=0?1:-1)*amount],[e.pos[0]+(dx>=0?1:-1)*amount,0,e.pos[2]],[e.pos[0],0,e.pos[2]-(dz>=0?1:-1)*amount]]
    const slide=alternatives.find(v=>!blocked(v));if(slide)e.pos=slide;return
  }
  e.pos = next
}

export function hearingRange(e:Disturbance,listener:V3){return e.radius*(lineOfSight(e.pos,listener)?1:.55)*(Math.abs(e.pos[0])>9||e.pos[2]>8?.65:1)*(e.pos[1]>2?.6:1)}
