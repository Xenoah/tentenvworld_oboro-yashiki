/** Synthesised taiko loop and one-shot cues. No audio files: everything is built from oscillators and noise. */
export type Mood = { tempo: number; danger: boolean }

function noise(ctx: BaseAudioContext, seconds: number) {
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate), d = b.getChannelData(0)
  let seed = 7; for (let i = 0; i < d.length; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; d[i] = seed / 2147483648 - 1 }
  return b
}

export class Taiko {
  private timer = 0; private next = 0; private step = 0; private noiseBuf: AudioBuffer
  constructor(private ctx: AudioContext, private out: AudioNode, private mood: () => Mood) { this.noiseBuf = noise(ctx, .3) }
  start() { if (this.timer) return; this.next = this.ctx.currentTime + .1; this.timer = window.setInterval(() => this.schedule(), 50) }
  stop() { window.clearInterval(this.timer); this.timer = 0 }
  private schedule() {
    const { tempo, danger } = this.mood(), beat = 60 / tempo / 2
    while (this.next < this.ctx.currentTime + .25) {
      const i = this.step++ % 16, t = this.next
      // don . ka don | don . ka . | don don ka . | don . ka ka   (8th notes)
      if ([0, 3, 4, 8, 9, 12].includes(i)) this.don(t, i % 8 === 0 ? 1 : .7)
      if ([2, 6, 10, 14, 15].includes(i)) this.ka(t, .35)
      if (danger && i % 4 === 0) this.heart(t)
      this.next += beat
    }
  }
  private env(t: number, peak: number, decay: number) { const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + .005); g.gain.exponentialRampToValueAtTime(.0001, t + decay); g.connect(this.out); return g }
  private don(t: number, v: number) {
    const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(52, t + .25)
    o.connect(this.env(t, .55 * v, .45)); o.start(t); o.stop(t + .5)
    const n = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(); n.buffer = this.noiseBuf; f.type = 'lowpass'; f.frequency.value = 500
    n.connect(f); f.connect(this.env(t, .25 * v, .12)); n.start(t, 0, .15)
  }
  private ka(t: number, v: number) {
    const n = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(); n.buffer = this.noiseBuf; f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 4
    n.connect(f); f.connect(this.env(t, v, .05)); n.start(t, .1, .06)
  }
  private heart(t: number) { for (const [dt, v] of [[0, .5], [.16, .35]] as const) { const o = this.ctx.createOscillator(); o.frequency.value = 48; o.connect(this.env(t + dt, v, .18)); o.start(t + dt); o.stop(t + dt + .2) } }
}

/** Short cues for pickups, warps and alerts. */
export function cue(ctx: AudioContext, out: AudioNode, kind: 'seal' | 'warp' | 'star' | 'alert' | 'go' | 'tick' | 'coin' | 'smoke') {
  const t = ctx.currentTime + .01
  const tone = (f: number, at: number, d: number, v: number, type: OscillatorType = 'sine') => {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(v, at + .01); g.gain.exponentialRampToValueAtTime(.0001, at + d)
    o.connect(g); g.connect(out); o.start(at); o.stop(at + d + .05)
  }
  if (kind === 'seal') [659, 880, 1175, 1568].forEach((f, i) => tone(f, t + i * .07, .6, .18, 'triangle'))
  if (kind === 'star') [988, 1319].forEach((f, i) => tone(f, t + i * .05, .4, .14, 'triangle'))
  if (kind === 'coin') [1568, 2093].forEach((f, i) => tone(f, t + i * .06, .25, .12, 'square'))
  if (kind === 'go') tone(880, t, .5, .25, 'triangle')
  if (kind === 'tick') tone(440, t, .18, .18, 'triangle')
  if (kind === 'alert') [520, 390].forEach((f, i) => tone(f, t + i * .12, .25, .2, 'sawtooth'))
  if (kind === 'warp' || kind === 'smoke') {
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); n.buffer = noise(ctx, .5)
    f.type = 'bandpass'; f.frequency.setValueAtTime(kind === 'warp' ? 400 : 900, t); f.frequency.exponentialRampToValueAtTime(kind === 'warp' ? 2400 : 200, t + .4)
    g.gain.setValueAtTime(.22, t); g.gain.exponentialRampToValueAtTime(.0001, t + .45); n.connect(f); f.connect(g); g.connect(out); n.start(t)
  }
}

/** World-wide switch for cues; the board/HUD sound toggle drives it. */
let cuesOn = false
export const setCuesEnabled = (on: boolean) => { cuesOn = on }
export function play(listener: { context: AudioContext; getInput(): AudioNode }, kind: Parameters<typeof cue>[2]) {
  if (!cuesOn || listener.context.state !== 'running') return
  cue(listener.context, listener.getInput(), kind)
}
