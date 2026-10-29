import { MISSION_LIMIT } from './missions'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useRuntime } from '@tentenv/sdk'
import { actionPos, ACTIONS, DIFFICULTIES, KEYS, MODES, baseLimit, distance, elapsed, remaining, required, sealBonus, timeLimit, type GameState } from './game'
import type { Objective } from './Guide'
import type { VisualSettings } from './Lighting'
import { play } from './audio'

export type HudGame = { state: GameState; send: (kind: string, value?: string) => void; host: boolean; players: { all: unknown[] }; message: string; best: { score: number; time: number } }
export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
export const controlsText = (extended: boolean) => extended ? 'WASD 移動 / マウス 視点 / E・クリック 調べる / Space 上昇 Q 下降 / Shift ダッシュ' : 'WASD 移動 / マウス 視点 / クリック 調べる / Space 跳躍 / Shift ダッシュ'
const SHORT: Record<string, string> = { wood: '木', fire: '火', water: '水', void: '空', moon: '月' }

const panel: CSSProperties = { background: 'linear-gradient(135deg,rgba(13,29,31,.9),rgba(18,35,36,.82))', border: '1px solid #ad946052', boxShadow: '0 10px 30px #0005', backdropFilter: 'blur(10px)' }
const button: CSSProperties = { border: '1px solid #9f89585c', borderRadius: 3, background: '#233c3cdd', color: '#e6dcc5', padding: '7px 10px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }

/** Minimal play HUD: one top bar (time + five seals), a toast, and a slim toolbar. Panels open on demand. */
export function Hud({ game: g, comfort, setComfort, sound, setSound, help, setHelp, visuals, setVisuals, extra, goal }: { game: HudGame; comfort: boolean; setComfort: (v: boolean) => void; sound: boolean; setSound: (v: boolean) => void; help: boolean; setHelp: (v: boolean) => void; visuals: VisualSettings; setVisuals: (v: VisualSettings) => void; extra?: ReactNode; goal?: Objective }) {
  const rt = useRuntime(), s = g.state
  const [now, setNow] = useState(() => rt.clock().now()), [near, setNear] = useState(true), [visualOpen, setVisualOpen] = useState(false), atLobby = useRef(true)
  useEffect(() => { const t = window.setInterval(() => setNow(rt.clock().now()), 100); return () => window.clearInterval(t) }, [rt])
  useFrame(() => { const p = rt.pose(rt.self().peerId)?.position; const n = !!p && distance(p, actionPos(s,s.phase==='lobby'?'start':'restart')??ACTIONS.start) < 6.4; if (n !== atLobby.current) { atLobby.current = n; setNear(n) } })
  const running = s.phase === 'running', counting = running && now < s.startedAt
  const left = running ? remaining(s, now) : s.phase === 'lobby' ? timeLimit(s) : remaining(s, s.endedAt)
  const count = Math.ceil((s.startedAt - now) / 1000), sinceGo = (now - s.startedAt) / 1000
  const lastCount = useRef(0)
  useEffect(() => { if (!running) return; const c = counting ? count : sinceGo < .5 ? 0 : -1; if (c === lastCount.current) return; lastCount.current = c; if (c > 0) play(rt.audioListener(), 'tick'); else if (c === 0) play(rt.audioListener(), 'go') }, [running, counting, count, sinceGo, rt])
  const low = running && !counting && left <= 60, lastSplit = s.splits?.at(-1), splitAge = lastSplit ? elapsed(s, now) - lastSplit.t : 99
  return <Html fullscreen calculatePosition={(_o, _c, size) => [size.width / 2, size.height / 2]} style={{ pointerEvents: 'none' }}><div data-oboro-hud="true" style={{ fontFamily: '"Noto Serif CJK JP","Yu Mincho",Georgia,serif', color: '#efe4cb', height: '100%', pointerEvents: 'none' }}>
    <style>{`@keyframes oboro-flash{0%{opacity:1}100%{opacity:0}}@keyframes oboro-pulse{0%,100%{opacity:.35}50%{opacity:.85}}@keyframes oboro-pop{0%{transform:translate(-50%,-50%) scale(1.8);opacity:0}30%{opacity:1}100%{transform:translate(-50%,-50%) scale(1);opacity:1}}@keyframes oboro-seal{0%{transform:rotate(45deg) scale(1.9)}100%{transform:rotate(45deg) scale(1)}}@keyframes oboro-toast{0%{transform:translate(-50%,8px);opacity:0}15%,80%{transform:translate(-50%,0);opacity:1}100%{opacity:0}}
      @media(max-width:680px){[data-oboro-hud] .oboro-top{top:64px!important;transform:translateX(-50%) scale(.82)!important}[data-oboro-hud] .oboro-toolbar{bottom:150px!important;left:8px!important;right:8px!important;justify-content:center!important}[data-oboro-hud] .oboro-controls{display:none}[data-oboro-hud] [data-testid=message]{bottom:196px!important;max-width:90vw!important;font-size:10px!important}[data-oboro-hud] .oboro-help{right:8px!important;top:150px!important;width:calc(100vw - 16px)!important;max-height:45vh!important}}`}</style>
    {running && s.keys.length > 0 && <div key={`flash-${s.run}-${s.keys.length}`} style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle, ${KEYS.find(k => k.id === s.keys.at(-1))?.color}55, transparent 70%)`, animation: 'oboro-flash .7s ease-out forwards' }} />}
    {low && <div data-testid="low-time" style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 140px 30px #c0281c', animation: `oboro-pulse ${left < 20 ? .5 : 1}s ease-in-out infinite` }} />}
    <div className="oboro-top" style={{ ...panel, position: 'absolute', top: 70, left: '50%', transform: 'translateX(-50%)', padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 18, borderRadius: 4 }}>
      <div style={{ textAlign: 'center', minWidth: 86 }}>
        <div data-testid="timer" style={{ fontSize: 30, fontVariantNumeric: 'tabular-nums', lineHeight: 1.05, color: low ? '#ff8a6a' : '#f3e7cc' }}>{clock(Math.ceil(left))}</div>
        <div style={{ fontSize: 9, letterSpacing: 2, color: '#a9bdb6' }}>{s.mode === 'sprint' ? '疾風・' : ''}{DIFFICULTIES[s.difficulty].label}・{Math.min(4, g.players.all.length)}/4人</div>
      </div>
      <div data-testid="seals" style={{ display: 'flex', gap: 10 }}>{KEYS.filter(k => required(s).includes(k.id)).map(k => { const got = s.keys.includes(k.id), split = s.splits?.find(v => v.id === k.id); return <div key={k.id} title={k.name} style={{ textAlign: 'center', width: 30 }}>
        <div style={{ width: 20, height: 20, margin: '2px auto 4px', border: `1.5px solid ${got ? k.color : '#5d706b'}`, background: got ? k.color : 'transparent', boxShadow: got ? `0 0 12px ${k.color}` : 'none', transform: 'rotate(45deg)', animation: got && split?.id === lastSplit?.id && splitAge < 1 ? 'oboro-seal .45s ease-out' : undefined, display: 'grid', placeItems: 'center' }}><span style={{ transform: 'rotate(-45deg)', fontSize: 10, color: got ? '#14211f' : '#9fb0aa' }}>{SHORT[k.id]}</span></div>
        <div style={{ fontSize: 9, color: got ? k.color : '#71847f', fontVariantNumeric: 'tabular-nums' }}>{split ? clock(split.t) : '–'}</div>
      </div> })}</div>
      <div style={{ textAlign: 'right', fontSize: 10, color: '#a9bdb6', minWidth: 54 }}>得点<div data-testid="score" style={{ fontSize: 15, color: '#e8c996' }}>{s.score.toLocaleString()}</div></div>
    </div>
    {goal && running && !counting && <div data-testid="objective" style={{ position: 'absolute', top: 136, left: '50%', transform: 'translateX(-50%)', fontSize: 12, color: '#ffe7b0', textShadow: '0 2px 8px #000', whiteSpace: 'nowrap' }}>次：{goal.label}</div>}
    {lastSplit && splitAge < 2.5 && running && <div style={{ position: 'absolute', top: 160, left: '50%', transform: 'translateX(-50%)', fontSize: 15, color: '#ffe3a3', background: '#0d1d1fcc', padding: '4px 12px', borderRadius: 3, textShadow: '0 2px 10px #000', animation: 'oboro-toast 2.5s ease-out forwards' }}>{KEYS.find(k => k.id === lastSplit.id)?.name}　{clock(lastSplit.t)}　<b>+{sealBonus(s)}秒</b></div>}
    {counting && <div data-testid="countdown" key={count} style={{ position: 'absolute', left: '50%', top: '42%', fontSize: 120, color: '#ffe0a0', textShadow: '0 0 40px #d9a14a, 0 4px 20px #000', animation: 'oboro-pop .5s ease-out forwards' }}>{count}</div>}
    {running && !counting && sinceGo < .9 && <div data-testid="countdown" style={{ position: 'absolute', left: '50%', top: '42%', fontSize: 92, letterSpacing: 12, color: '#fff2c9', textShadow: '0 0 40px #e8a33c', animation: 'oboro-pop .45s ease-out forwards' }}>始め！</div>}
    {!running && <div style={{ ...panel, position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 440, maxWidth: '86vw', padding: '26px 32px', pointerEvents: 'auto', textAlign: 'center' }}>
      <div style={{ fontSize: 11, letterSpacing: 5, color: '#bba57b' }}>{s.phase === 'won' ? 'THE GATE IS OPEN' : s.phase === 'lost' ? 'LOST IN THE MIST' : s.mode==='mission'?'OBORO · THE FOLDED ROOMS':'OBORO · THE FIVE SEALS'}</div>
      <h1 style={{ fontSize: 32, fontWeight: 400, letterSpacing: 4, margin: '12px 0' }}>{s.phase === 'won' ? '脱出成功' : s.phase === 'lost' ? '探索失敗' : '朧の屋敷'}</h1>
      <p style={{ fontSize: 13, lineHeight: 1.8, color: '#afc0b5', margin: '8px 0 14px' }}>{s.phase === 'lobby' ? (s.mode==='mission'?`室内から始まる五つのミッション。反射・跳躍・運搬・浮遊・逆さ回廊を越え、最後は庭へ。${clock(baseLimit(s))}、部屋ごとに再挑戦可能。`:s.mode === 'sprint' ? `疾風：ランダムな三部屋の印だけを${clock(baseLimit(s))}で。印ごとに +${sealBonus(s)}秒。` : `${clock(baseLimit(s))}で五つの印を集めて門へ。印に触れるたび +${sealBonus(s)}秒。`) : s.reason}</p>
      {s.phase !== 'lobby' && <div style={{ fontSize: 24, color: '#e5c38a', marginBottom: 6 }}>{s.score.toLocaleString()} <span style={{ fontSize: 12 }}>点</span>{s.phase === 'won' && <span style={{ fontSize: 14, marginLeft: 12 }}>タイム {clock(elapsed(s, s.endedAt))}</span>}</div>}
      {s.phase !== 'lobby' && !!s.splits?.length && <div style={{ fontSize: 11, color: '#c9c2a8', marginBottom: 10 }}>{s.splits.map(v => `${SHORT[v.id]} ${clock(v.t)}`).join('　')}　/ 帰還 {s.recoveries} 回</div>}
      {g.best.score > 0 && <div data-testid="best" style={{ fontSize: 11, color: '#9fb5aa', marginBottom: 12 }}>自己ベスト　{g.best.score.toLocaleString()} 点{g.best.time ? `　/　${clock(g.best.time)}` : ''}</div>}
      <div style={{ display: 'flex', gap: 7, justifyContent: 'center', marginBottom: 8 }}>{(Object.entries(MODES) as [keyof typeof MODES, { label: string }][]).map(([key, c]) => <button key={key} data-testid={`mode-${key}`} disabled={!g.host} onClick={() => g.send('mode', key)} style={{ ...button, fontSize: 12, padding: '8px 14px', background: (s.mode ?? 'standard') === key ? '#7a4f38' : '#233c3c' }}>{c.label}{key === 'sprint' ? '（3部屋）' : key==='mission'?'（新）':''}</button>)}</div>
      <div style={{ display: 'flex', gap: 7, justifyContent: 'center', marginBottom: 14 }}>{Object.entries(DIFFICULTIES).map(([key, c]) => <button key={key} disabled={!g.host} onClick={() => g.send('difficulty', key)} style={{ ...button, fontSize: 12, padding: '8px 12px', background: s.difficulty === key ? '#8a6e43' : '#233c3c' }}>{c.label}{s.mode === 'sprint' ? '' : ` ${clock(s.mode==='mission'?MISSION_LIMIT[key as keyof typeof MISSION_LIMIT]:c.limit)}`}</button>)}</div>
      <button data-testid="start" disabled={!g.host || !near} onClick={() => g.send(s.phase === 'lobby' ? 'start' : 'restart')} style={{ ...button, width: '100%', background: '#ac8450', color: '#101d20', fontSize: 15, padding: 13, fontWeight: 700 }}>{g.host ? (s.phase === 'lobby' ? '探索を始める' : 'もう一度挑む') : '主催者の開始を待っています'}</button>
      <p style={{ fontSize: 10, color: '#8da69c', margin: '12px 0 0' }}>1人でも、4人でも。目標と進行は全員で共有。運搬や星の保持を分担できます。</p>
    </div>}
    <div data-testid="message" style={{ ...panel, position: 'absolute', bottom: 64, left: '50%', transform: 'translateX(-50%)', padding: '8px 16px', fontSize: 12, textAlign: 'center', maxWidth: '62vw', color: '#d4d6bc' }}>{g.message}</div>
    <div className="oboro-toolbar" style={{ position: 'absolute', bottom: 18, left: 24, right: 24, display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center' }}>
      <div className="oboro-controls" style={{ fontSize: 10, color: '#bccabf', textShadow: '0 2px 8px #000' }}>{controlsText(!!rt.locomotion)}</div>
      <div style={{ display: 'flex', gap: 6, pointerEvents: 'auto' }}>{extra}<button style={button} onClick={() => setComfort(!comfort)}>{comfort ? '◉ 快適移動' : '○ 自由移動'}</button><button style={button} onClick={() => setSound(!sound)}>{sound ? '音：入' : '音：切'}</button><button style={button} onClick={() => setHelp(!help)}>手引き</button><button data-testid="visual-settings" style={button} onClick={() => setVisualOpen(!visualOpen)}>映像</button>{running && <button style={button} onClick={() => g.send('recover')}>{s.mode==='mission'?'部屋の入口へ':'玄関へ帰還'}</button>}</div>
    </div>
    {visualOpen && <div className="oboro-help" data-testid="visual-panel" style={{ ...panel, position: 'absolute', right: 24, top: 170, width: 300, padding: 22, pointerEvents: 'auto', fontSize: 12, lineHeight: 1.9, zIndex: 5 }}><strong>柔らかな光</strong><div style={{ display: 'flex', gap: 6, margin: '12px 0' }}>{([['auto', '標準'], ['low', '軽量'], ['off', '切']] as const).map(([mode, label]) => <button data-testid={`glow-${mode}`} key={mode} style={{ ...button, background: visuals.mode === mode ? '#8a6e43' : '#233c3c' }} onClick={() => setVisuals({ ...visuals, mode })}>{label}</button>)}</div><label>光のにじみ　{Math.round(visuals.glow * 100)}%<input data-testid="glow-strength" aria-label="光のにじみ" type="range" min="0" max=".55" step=".01" value={visuals.glow} onChange={e => setVisuals({ ...visuals, glow: Number(e.target.value) })} style={{ width: '100%' }} /></label><label style={{ display: 'block', marginTop: 12 }}>移動ブラー　{Math.round(visuals.blur * 100)}%<input data-testid="motion-blur" aria-label="移動ブラー" type="range" min="0" max=".6" step=".01" value={visuals.blur} onChange={e => setVisuals({ ...visuals, blur: Number(e.target.value) })} style={{ width: '100%' }} /></label><label style={{ display: 'block', marginTop: 12 }}><input data-testid="baked-shading" type="checkbox" checked={visuals.shading} onChange={e => setVisuals({ ...visuals, shading: e.target.checked })} /> 細部の陰影と灯り</label><p style={{ color: '#adbcaf', marginBottom: 0 }}>軽量設定は灯りの周囲だけを柔らかくします。携帯端末・低解像度では自動で軽量表示。VRではにじみとブラーを無効にします。難易度には影響しません。</p></div>}
    {help && <div className="oboro-help" style={{ ...panel, position: 'absolute', right: 24, top: 170, width: 360, maxHeight: '58vh', overflow: 'auto', padding: 22, pointerEvents: 'auto', fontSize: 12, lineHeight: 1.85 }}><strong style={{ color: '#dfc18a' }}>探索の手引き</strong>
      <p>{rt.locomotion ? '照準を合わせて E またはクリック。' : '照準を合わせてクリック。キー割当は利用クライアントの設定に従います。'}印・星・水門・光る輪は<b>触れるだけ</b>で反応します。光る輪はワープ足場、橙の輪は縁側の縄（南北の近道）。</p>
      <p>制限時間は短め。印を一つ取るごとに時間が延びます。残り1分で太鼓が速まり、画面の縁が赤く光ります。</p>
      {s.mode==='mission'?<p>反射の書院：光る札を1・2・3キーかボタンで5回。跳躍の間：上下4地点へ。沈み座敷：灯籠を1人1個、4個を岸へ。浮遊蔵：星の中心で静止。逆さ回廊：光る拍子に壁と天井の印へ。部屋を終えたら歪みの扉を押すと全員が次へ進みます。失敗した部屋は再挑戦できます。</p>:KEYS.map(k => <p key={k.id}>{k.hint}</p>)}
      <p>Shiftでダッシュ、Spaceで跳躍。下降中、足元が地面から75cm以内になったらXか「静音着地」を一度押す。早押し・押し忘れは足音となり、忍者が音の方向を捜索します。</p>
      <p>忍者の足元の扇形が視界です（赤は追跡中）。扇の外・背後は気づかれにくく、屏風や庭石の陰は見通せません。中庭に落ちている<b>煙玉</b>に触れて拾い、B（または画面の煙玉ボタン）で周囲6mの忍者を3秒止められます。</p><p>忍者は攻撃前に構えます。距離を取るか陰へ。見習い・忍びでは捕まると<b>牢</b>へ（200点×難易度倍率の減点）。仲間が錠に触れるか、少し待てば出られます。上忍は捕まると全員失敗。帰還は -150 点。</p><p>「ナビ」は足元の矢印と光の柱で次の目的地を示します。</p>
      <p>{rt.locomotion ? '泳ぎ・浮遊：向いた方向へ WASD、Space 上昇、Q 下降。' : '標準クライアントでは泳ぎ・浮遊・壁歩きの代わりに木の足場とワープを使います。'}</p>
      <p style={{ color: '#8ca69b' }}>コード・素材：AGPL-3.0-only / TenTenV contributors + Oboro contributors。保証なし。</p></div>}
  </div></Html>
}
