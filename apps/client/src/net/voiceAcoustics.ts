/** Receive-only acoustics. This graph never opens a microphone or sends audio. */
export type VoiceEnvironment = 'outdoor' | 'room' | 'narrow' | 'underwater'
export interface VoiceEnvironmentProfile { preset: VoiceEnvironment; lightweight?: boolean }
export const VOICE_PRESETS = {
  outdoor: { cutoff: 22000, wet: 0, echo: 0, delay: .035, decay: .3 },
  room: { cutoff: 15000, wet: .18, echo: .07, delay: .105, decay: .85 },
  narrow: { cutoff: 11000, wet: .13, echo: .16, delay: .065, decay: .42 },
  underwater: { cutoff: 700, wet: .06, echo: .04, delay: .045, decay: .3 },
} as const
const impulses = new WeakMap<BaseAudioContext, Map<VoiceEnvironment, AudioBuffer>>()
/** Reproducible synthetic early/diffuse reflections, not measured room impulse responses. */
function impulse(ctx: BaseAudioContext, preset: VoiceEnvironment) {
  let cache=impulses.get(ctx);if(!cache){cache=new Map();impulses.set(ctx,cache)}
  const cached=cache.get(preset);if(cached)return cached
  const length=Math.ceil(ctx.sampleRate*VOICE_PRESETS[preset].decay),buffer=ctx.createBuffer(2,length,ctx.sampleRate)
  for(let channel=0;channel<2;channel++){
    const data=buffer.getChannelData(channel);let seed=0x1234abcd+channel*997
    for(let i=0;i<length;i++){seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;const t=i/length;data[i]=((seed>>>0)/4294967296*2-1)*Math.exp(-t*7)*Math.min(1,i/(ctx.sampleRate*.012))}
  }
  cache.set(preset,buffer);return buffer
}
function ramp(param:AudioParam,value:number,time:number){if(typeof param.cancelAndHoldAtTime==='function')param.cancelAndHoldAtTime(time);else{param.cancelScheduledValues(time);param.setValueAtTime(param.value,time)}param.linearRampToValueAtTime(value,time+.18)}
export class VoiceAcoustics {
  readonly lowpass:BiquadFilterNode
  readonly dry:GainNode
  readonly mix:GainNode
  readonly filters:AudioNode[]
  readonly delay:DelayNode
  readonly echo:GainNode
  readonly reverbs:[ConvolverNode,ConvolverNode]
  readonly wet:[GainNode,GainNode]
  private branch=0
  private key=''
  private convolutionConnected=false
  private dead=false
  constructor(readonly ctx:BaseAudioContext){
    this.lowpass=ctx.createBiquadFilter();this.lowpass.type='lowpass';this.lowpass.Q.value=.5;this.lowpass.frequency.value=Math.min(22000,ctx.sampleRate*.49)
    this.dry=ctx.createGain();this.mix=ctx.createGain();this.filters=[this.lowpass,this.dry,this.mix]
    this.delay=ctx.createDelay(.25);this.delay.delayTime.value=.035;this.echo=ctx.createGain();this.echo.gain.value=0
    this.lowpass.connect(this.delay);this.delay.connect(this.echo);this.echo.connect(this.mix)
    this.reverbs=[ctx.createConvolver(),ctx.createConvolver()];this.wet=[ctx.createGain(),ctx.createGain()]
    for(let i=0;i<2;i++){this.wet[i].gain.value=0;this.reverbs[i].connect(this.wet[i]);this.wet[i].connect(this.mix)}
  }
  set(profile:VoiceEnvironmentProfile){
    if(this.dead||!Object.hasOwn(VOICE_PRESETS,profile.preset))return
    const key=profile.preset+':'+!!profile.lightweight;if(this.key===key)return;this.key=key
    const p=VOICE_PRESETS[profile.preset],t=this.ctx.currentTime,lite=!!profile.lightweight
    ramp(this.lowpass.frequency,Math.min(p.cutoff,this.ctx.sampleRate*.49),t)
    ramp(this.delay.delayTime,p.delay,t);ramp(this.echo.gain,p.echo,t)
    const wet=lite?0:p.wet;ramp(this.dry.gain,1-wet-p.echo,t)
    if(wet>0&&!this.convolutionConnected){for(const c of this.reverbs)this.lowpass.connect(c);this.convolutionConnected=true}
    if(wet===0&&this.convolutionConnected){for(const c of this.reverbs)this.lowpass.disconnect(c);this.convolutionConnected=false}
    const next=1-this.branch;this.reverbs[next].buffer=impulse(this.ctx,profile.preset)
    ramp(this.wet[next].gain,wet,t);ramp(this.wet[this.branch].gain,0,t);this.branch=next
  }
  dispose(){if(this.dead)return;this.dead=true;for(const node of [this.lowpass,this.dry,this.mix,this.delay,this.echo,...this.reverbs,...this.wet])node.disconnect()}
}
