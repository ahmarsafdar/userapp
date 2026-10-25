// 3 MOLTEN (0:06.1–0:07.04): two droplets of metal land in the void, spread, merge and settle into the shape of the card.
// The puddle is a height field whose outline is a signed distance function, all evaluated on the GPU.
import * as THREE from 'three';
import { GLSL_NOISE, ease, smoothstep, lerp } from '../util.js';
import { backdrop, softboxEnv } from '../studio.js';

const SHAPE = /* glsl */`
uniform float uT, uRA, uRB, uK, uMorph, uWob, uRip, uH, uEdge;
uniform vec2 uA, uB;
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
float sdRoundRect(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float blob(vec2 p, vec2 c, float r, float seed) {
  vec2 d = p - c; float l = length(d);
  vec2 dir = d / max(l, 1e-4);
  float w = snoise(vec3(dir * 1.4 + seed, uT * 1.6)) + 0.35 * snoise(vec3(dir * 2.4 - seed, uT * 2.3));
  return l - r * (1.0 + uWob * w);
}
float sdShape(vec2 p) {
  float d = smin(blob(p, uA, uRA, 1.7), blob(p, uB, uRB, 8.3), uK);
  float card = sdRoundRect(p, vec2(4.28, 2.699), 0.318) + uWob * 0.25 * snoise(vec3(p * 0.6, uT * 1.3));
  return mix(d, card, uMorph);
}
float heightAt(vec2 p) {
  float d = sdShape(p);
  float rim = sqrt(clamp(-d / uEdge, 0.0, 1.0));
  float inside = smoothstep(0.0, -0.5, d);
  float rip = uRip * inside * (snoise(vec3(p * 1.1, uT * 2.2)) * 0.7 + snoise(vec3(p * 2.6, uT * 3.1 + 4.0)) * 0.3);
  return uH * rim + rip;
}`;

export function molten({ renderer, cam }) {
  const scene = new THREE.Scene();
  const bg = backdrop(); scene.add(bg);
  bg.userData.set(0, 1.0, 1.05, 0.75, 0.32, [0.78, 0.8, 0.84]);
  bg.userData.set(1, 0.75, 0.9, 0.35, 0.05, [0.9, 0.9, 0.95]);
  scene.environment = softboxEnv(renderer, [
    { az: 20, el: 60, w: 12, h: 4, i: 3.5, roll: 15 },
    { az: -70, el: 25, w: 1.5, h: 10, i: 5 },
    { az: 120, el: 30, w: 1.5, h: 10, i: 3.5 },
    { az: 180, el: 15, w: 16, h: 3, i: 1.5 },
  ], { dome: [0.14, 0.04, 0.01] });

  const uniforms = {
    uT: { value: 0 }, uA: { value: new THREE.Vector2() }, uB: { value: new THREE.Vector2() },
    uRA: { value: 0.1 }, uRB: { value: 0.1 }, uK: { value: 0.1 }, uMorph: { value: 0 }, uWob: { value: 0.1 },
    uRip: { value: 0.02 }, uH: { value: 0.08 }, uEdge: { value: 0.08 },
  };
  const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.33, 0.33, 0.35), metalness: 1, roughness: 0.15 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLocal;\n' + GLSL_NOISE + SHAPE)
      .replace('#include <beginnormal_vertex>', `
        vec2 lp = position.xz; vLocal = lp;
        float e = 0.012;
        float hC = heightAt(lp);
        float hx = heightAt(lp + vec2(e, 0.0)) - heightAt(lp - vec2(e, 0.0));
        float hz = heightAt(lp + vec2(0.0, e)) - heightAt(lp - vec2(0.0, e));
        vec3 objectNormal = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));`)
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.x, hC, position.z);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLocal;\n' + GLSL_NOISE + SHAPE)
      .replace('void main() {', 'void main() {\n  if (sdShape(vLocal) > 0.0) discard;');
  };
  const geo = new THREE.PlaneGeometry(10, 7, 520, 364);
  geo.rotateX(-Math.PI / 2);
  const slab = new THREE.Mesh(geo, mat);
  slab.frustumCulled = false;
  scene.add(slab);

  const camera = cam(26, 0.1, 100);
  return {
    scene, camera,
    update(lt) {
      const T = 0.9375;
      const u = lt / T;
      uniforms.uT.value = lt;
      // splash → spread → meet → settle into the card
      const g = ease.outCubic(u / 0.42);
      uniforms.uRA.value = lerp(0.05, 1.75, g);
      uniforms.uRB.value = lerp(0.04, 1.55, ease.outCubic((u - 0.04) / 0.42));
      const drift = ease.inOutCubic((u - 0.15) / 0.5);
      uniforms.uA.value.set(lerp(-2.0, -1.2, drift), lerp(0.35, 0.0, drift));
      uniforms.uB.value.set(lerp(1.9, 1.25, drift), lerp(-0.3, 0.0, drift));
      uniforms.uK.value = lerp(0.2, 1.3, smoothstep(0.25, 0.6, u));
      uniforms.uMorph.value = ease.inOutCubic((u - 0.45) / 0.5);
      uniforms.uWob.value = lerp(0.16, 0.0, smoothstep(0.35, 1.0, u)) + 0.006;
      uniforms.uRip.value = lerp(0.06, 0.004, smoothstep(0.2, 1.0, u));
      uniforms.uEdge.value = lerp(0.14, 0.035, smoothstep(0.3, 1.0, u));
      uniforms.uH.value = lerp(0.10, 0.07, smoothstep(0.4, 1.0, u));
      const k = ease.inOutSine(u);
      camera.position.set(lerp(1.2, 0.5, k), lerp(8.2, 7.4, k), lerp(12.6, 11.4, k));
      camera.lookAt(0.2, 0, 0);
      slab.rotation.y = lerp(-0.12, -0.05, k);
      const focus = camera.position.length();
      return { focus, aperture: 3, maxCoc: 10, bloom: 0.1, threshold: 1.0, exposure: 1.0, vignette: 0.5, contrast: 1.1 };
    },
  };
}
