import type { MeshStandardMaterial } from 'three'

/** Saved vertex data affects ambient visibility and static lamp diffuse lighting only. */
export function applyBakedLighting(material:MeshStandardMaterial, uniforms:{ao:{value:number};light:{value:number}}){
  material.customProgramCacheKey=()=> 'oboro-baked-lighting-v1'
  material.onBeforeCompile=shader=>{
    shader.uniforms.oboroAO=uniforms.ao;shader.uniforms.oboroLight=uniforms.light
    shader.vertexShader='attribute vec4 bakedLighting;\nvarying vec4 vOboroBake;\n'+shader.vertexShader
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvOboroBake = bakedLighting;')
    shader.fragmentShader='varying vec4 vOboroBake;\nuniform float oboroAO;\nuniform float oboroLight;\n'+shader.fragmentShader
    shader.fragmentShader=shader.fragmentShader.replace('#include <aomap_fragment>',`#include <aomap_fragment>
      float oboroVisibility = mix(1.0, vOboroBake.a, oboroAO);
      reflectedLight.indirectDiffuse *= oboroVisibility;
      reflectedLight.indirectSpecular *= mix(1.0, oboroVisibility, 0.6);
      reflectedLight.indirectDiffuse += diffuseColor.rgb * vOboroBake.rgb * 8.0 * RECIPROCAL_PI * oboroLight;
    `)
  }
}
