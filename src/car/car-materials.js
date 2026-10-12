import * as THREE from 'three';

// Shader tweaks shared by the car-factory models.

/**
 * Baked ambient occlusion arrives as the vertex colour. three.js already multiplies it into the
 * albedo; this also occludes reflections (env map + clear coat) so crevices don't glow.
 */
export const AO_GLSL = /* glsl */ `#include <aomap_fragment>
#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
{
  float vao = vColor.r;
  #if defined( USE_ENVMAP ) && defined( STANDARD )
    reflectedLight.indirectSpecular *= computeSpecularOcclusion( saturate( dot( geometryNormal, geometryViewDir ) ), vao, material.roughness );
  #endif
  #ifdef USE_CLEARCOAT
    clearcoatSpecularIndirect *= vao;
  #endif
}
#endif`;

/** Plain material + AO-aware reflections. */
export function withAO(mat, key = 'ao') {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <aomap_fragment>', AO_GLSL);
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

// object-space position + normal for procedural patterns
function objVaryings(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;\nvarying vec3 vObjN;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;')
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvObjN = objectNormal;');
}

/** Clear-coated 2x2 twill carbon fibre, projected from the three axes. */
export function makeCarbonMaterial(hq) {
  const m = hq
    ? new THREE.MeshPhysicalMaterial({ color: 0x24262c, metalness: 0.25, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.05, vertexColors: true })
    : new THREE.MeshStandardMaterial({ color: 0x24262c, metalness: 0.3, roughness: 0.32, vertexColors: true });
  m.onBeforeCompile = (shader) => {
    objVaryings(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
varying vec3 vObjPos;
varying vec3 vObjN;
float carbonTwill(vec2 p) {
  p *= 90.0;
  vec2 c = floor(p);
  vec2 f = fract(p);
  float d = mod(floor((c.x + c.y) * 0.5), 2.0);
  float across = d > 0.5 ? f.y : f.x;
  float tow = sin(across * 3.14159265);
  float v = mix(0.3, 1.0, tow) * (d > 0.5 ? 1.0 : 0.45);
  // fade to the average once the weave gets smaller than a pixel
  return mix(v, 0.5, smoothstep(0.25, 0.8, length(fwidth(p))));
}`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
{
  vec3 w = pow(abs(normalize(vObjN)), vec3(6.0));
  w /= (w.x + w.y + w.z);
  float wv = carbonTwill(vObjPos.zy) * w.x + carbonTwill(vObjPos.xz) * w.y + carbonTwill(vObjPos.xy) * w.z;
  diffuseColor.rgb *= mix(0.35, 1.7, wv);
}`,
      )
      .replace('#include <aomap_fragment>', AO_GLSL);
  };
  m.customProgramCacheKey = () => 'carbon';
  return m;
}

/** Black hexagonal mesh: lit frame, dark holes. */
export function makeGrilleMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0x2a2c31, metalness: 0.5, roughness: 0.4, vertexColors: true });
  m.onBeforeCompile = (shader) => {
    objVaryings(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
varying vec3 vObjPos;
varying vec3 vObjN;
float hexFrame(vec2 p) {
  p *= 36.0;
  const vec2 s = vec2(1.0, 1.7320508);
  vec2 a = mod(p, s) - s * 0.5;
  vec2 b = mod(p + s * 0.5, s) - s * 0.5;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 q = abs(g);
  float e = max(dot(q, vec2(0.5, 0.8660254)), q.x);
  float aa = fwidth(e) * 1.2;
  float frame = smoothstep(0.4 - aa, 0.4 + aa, e);
  return mix(frame, 0.3, smoothstep(0.25, 0.8, length(fwidth(p))));
}
float grilleFrame = 1.0;`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
{
  vec3 an = abs(normalize(vObjN));
  vec2 uvh = (an.x > an.y && an.x > an.z) ? vObjPos.zy : ((an.y > an.z) ? vObjPos.xz : vObjPos.xy);
  grilleFrame = hexFrame(uvh);
  diffuseColor.rgb *= mix(0.1, 1.0, grilleFrame);
}`,
      )
      .replace('#include <aomap_fragment>', AO_GLSL)
      .replace('#include <opaque_fragment>', 'outgoingLight *= mix(0.04, 1.0, grilleFrame);\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => 'grille';
  return m;
}
