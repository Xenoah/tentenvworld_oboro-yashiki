"""Original raster PBR maps; deterministic, no downloaded texture source. Requires Pillow + NumPy."""
from pathlib import Path
import numpy as np
from PIL import Image,ImageFilter
import wave, math
out=Path(__file__).resolve().parent.parent/'worlds/oboro/public'
(out/'textures').mkdir(parents=True,exist_ok=True)
rng=np.random.default_rng(420);n=768
y,x=np.mgrid[0:n,0:n]/n
noise=rng.normal(0,1,(n,n));smooth=np.asarray(Image.fromarray(np.uint8(np.clip(noise*35+128,0,255))).filter(ImageFilter.GaussianBlur(8))).astype(float)/255
materials={}
# Long grain, growth rings, irregular pores, plank seams.
warp=x+0.007*np.sin(y*16)+.003*np.sin(y*70)+.022*(smooth-.5)
grain=np.sin(warp*670)+.4*np.sin(warp*1940)+.25*noise
knots=np.sin(np.sqrt(((x-.27)*2)**2+((y-.43)*.35)**2)*280)*np.exp(-((x-.27)**2*400+(y-.43)**2*20))
wood=.48+.026*grain+.045*knots+.09*(smooth-.5)
seams=(np.mod(x*4,1)<.012)|(np.mod(y+np.floor(x*4)*.23,1)<.007)
wood[seams]=.13
materials['cedar']=(wood,(116,85,57),.82,1.0)
materials['darkwood']=(wood,(66,45,31),.72,1.4)
weave=.55+.06*np.sin(y*1100)+.03*np.sin(x*950)+.025*noise
weave-=.05*((np.floor(x*64)+np.floor(y*180))%2)
materials['tatami']=(weave,(150,143,94),.97,1.1)
plaster=.65+.025*noise+.15*(smooth-.5)
materials['plaster']=(plaster,(202,191,162),1,1.0)
paper=.75+.018*noise+.17*(smooth-.5)+.01*np.sin(x*1500)
materials['paper']=(paper,(222,211,174),.95,.4)
stone=.49+.07*noise+.35*(smooth-.5)
# Granite grain at several scales, rather than masonry joints on every rock.
medium=np.asarray(Image.fromarray(np.uint8(np.clip(noise*40+128,0,255))).filter(ImageFilter.GaussianBlur(2))).astype(float)/255
stone += (medium-.5)*.4
stone += .08*(noise>1.1)-.07*(noise< -1.1)
materials['stone']=(stone,(118,126,125),.93,2)
roof=.4+.06*np.sin(x*120)+.03*noise+.12*(smooth-.5)
roof-=.14*(np.mod(y*12,1)<.06)
materials['roof']=(roof,(65,79,83),.75,2)
gravel=.5+.11*noise+.018*np.sin(y*420+.4*np.sin(x*8))+.17*(smooth-.5)
materials['gravel']=(gravel,(151,148,131),1,2)
materials['moss']=(.5+.07*noise+.28*(smooth-.5),(63,84,46),1,1.8)
materials['cloth']=(.45+.035*np.sin(x*1800)+.035*np.sin(y*1800)+.02*noise,(34,43,48),1,.6)
for name,(height,color,rough,strength) in materials.items():
    h=np.clip(height,0,1)
    rgb=np.clip(h[...,None]*np.array(color)[None,None,:]*1.7,0,255).astype('uint8')
    Image.fromarray(rgb).save(out/'textures'/f'{name}.webp',quality=90)
    gy,gx=np.gradient(h);norm=np.dstack((-gx*strength*6,-gy*strength*6,np.ones_like(h)))
    norm/=np.linalg.norm(norm,axis=2)[...,None]
    Image.fromarray(np.uint8((norm*.5+.5)*255)).save(out/'textures'/f'{name}-normal.webp',quality=85)
    Image.fromarray(np.uint8(np.clip(rough+(h-.5)*.15,0,1)*255)).save(out/'textures'/f'{name}-rough.webp',quality=80)
# Quiet, original bamboo/wind bed, no external audio recording.
rate=22050;seconds=12;t=np.arange(rate*seconds)/rate
wind=rng.normal(0,1,len(t));wind=np.convolve(wind,np.ones(170)/170,mode='same')*.12
for at,hz in [(1,430),(4.3,590),(8,390),(10.6,720)]:
    d=np.maximum(0,t-at);wind+=.035*np.sin(2*np.pi*hz*d)*np.exp(-d*8)*(t>=at)
with wave.open(str(out/'garden.wav'),'w') as w:
    w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes(np.int16(np.clip(wind,-1,1)*32767).tobytes())
print(f'Generated {len(materials)*3} maps and garden.wav')
