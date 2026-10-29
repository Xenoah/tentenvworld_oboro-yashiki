/** Existing mechanics regressions explicitly select the retained exploration mode through its UI. */
export async function selectLegacy(p){
 await p.waitForFunction(()=>window.__ttvEngine?.runtime.state.has('w:oboro:game'),null,{timeout:180000,polling:100})
 const choose=await p.evaluate(()=>{const r=window.__ttvEngine.runtime,s=r.state.get('w:oboro:game');return s.phase==='lobby'&&s.mode==='mission'&&r.hostId()===r.self().peerId})
 if(choose){await p.getByTestId('mode-standard').click();await p.waitForFunction(()=>{const e=window.__ttvEngine;return e.runtime.state.get('w:oboro:game').mode==='standard'&&!e.pendingTeleport&&Math.abs(e.player.position.z-13)<.3},null,{timeout:60000,polling:100})}
}
