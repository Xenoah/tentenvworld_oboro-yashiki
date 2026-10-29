import type { VoiceEnvironment } from '@tentenv/sdk'
import type { V3 } from './game'
/** Head position, metres. Water takes precedence over the room surrounding it. */
export function acousticZone([x,y,z]:V3):VoiceEnvironment {
 if(![x,y,z].every(Number.isFinite))return 'outdoor'
 if(x>-18.4&&x<-9.6&&z>-22.4&&z<-13.6&&y<.05)return 'underwater'
 if((x>-19.2&&x<-15&&z>-6&&z<-.6)||(x>-17&&x<-13.8&&z>8.4&&z<11.6))return 'narrow'
 if((Math.abs(x)>8.5&&Math.abs(x)<10.8&&z>-12.8&&z<8)||(z<-11&&z>-13.5&&Math.abs(x)<19.2))return 'narrow'
 if(x>10&&x<20.3&&z>-3.3&&z<9.3)return 'room'
 if((x<-10.8&&x>-19.2&&z>-6.3&&z<6.3)||(z<-14&&z>-24.5&&((x>-19.3&&x<-9.2)||Math.abs(x)<5.2||(x>9&&x<21.2))))return 'room'
 return 'outdoor'
}
/** Water at either end muffles the received voice; reflections favour the listener's enclosure. */
export function voiceZone(listener:VoiceEnvironment,speaker:VoiceEnvironment):VoiceEnvironment {
 if(listener==='underwater'||speaker==='underwater')return 'underwater'
 return listener!=='outdoor'?listener:speaker
}
