// Materials shared by several shots: procedural rock, and surfaces whose shape is computed on the GPU.
import * as THREE from 'three';
import { GLSL_NOISE } from './util.js';

// Bump a normal by a height computed per pixel (screen-space derivatives, as three.js does for bump maps).
const PERTURB = /* glsl */`
vec3 perturbH(vec3 surf_pos, vec3 surf_norm, float h) {
  vec3 sx = dFdx(surf_pos), sy = dFdy(surf_pos);
  vec3 r1 = cross(sy, surf_norm), r2 = cross(surf_norm, sx);
  float det = dot(sx, r1);
  vec2 dh = vec2(dFdx(h), dFdy(h));
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * surf_norm - grad);
}`;

// Rock: big shapes come from the mesh, the grit from ridged noise evaluated per pixel (octaves fade out before they alias).
export function rockMaterial({ color = 0x5a5a5a, roughness = 0.92, bump = 0.012, freq = 9.0, octaves = 5 } = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBump = { value: bump };
    sh.uniforms.uFreq = { value: freq };
    m.userData.shader = sh;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; uniform float uBump, uFreq;
${GLSL_NOISE}
${PERTURB}
float rockH(vec3 p, float px) {
  float h = 0.0, a = 0.5, f = 1.0;
  for (int i = 0; i < ${octaves}; i++) {
    float fade = 1.0 - smoothstep(0.25, 0.5, f * px);
    float n = 1.0 - abs(snoise(p * f + float(i) * 7.31));
    h += a * n * n * fade;
    f *= 2.13; a *= 0.52;
  }
  return h;
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 p = vWPos * uFreq;
  float px = length(fwidth(p));
  float h = rockH(p, px) * uBump;
  normal = perturbH(-vViewPosition, normal, h);
}`);
  };
  return m;
}

// Mesh for a height field over a rectangle, lying in XZ (y up). heightFn(x, z) returns [height, shade 0..1].
export function heightField(w, d, nx, nz, heightFn) {
  const g = new THREE.PlaneGeometry(w, d, nx, nz);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const [h, s] = heightFn(x, z);
    pos.setY(i, h);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = s;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
