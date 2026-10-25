// 5 CONTACTS (0:07.98–0:08.91): extreme macro, the brushed contact pads of the chip rise and lock together.
// 6 POCKET (0:08.91–0:09.85): the finished chip sinks into a soft black surface, which swells round it and settles.
// Both work in millimetres: the chip is 10.8 × 8.6.
import * as THREE from 'three';
import { ease, smoothstep, lerp, spring, clamp } from '../util.js';
import { backdrop, softboxEnv } from '../studio.js';
import { padGeometries, chipOutline, chipPads, brushedTexture } from '../card.js';

function macroChip(renderer, { depth = 0.42, bevel = 0.09 } = {}) {
  const brushed = brushedTexture(renderer, 1024, 5, 420);
  brushed.repeat.set(0.085, 0.085);
  const pad = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.80, 0.80, 0.82), metalness: 1, roughness: 0.34, roughnessMap: brushed,
    anisotropy: 0.85, anisotropyRotation: 0,
  });
  const group = new THREE.Group();
  const pads = padGeometries({ depth, bevel }).map((geo) => {
    const m = new THREE.Mesh(geo, pad);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  });
  const baseGeo = new THREE.ExtrudeGeometry(new THREE.Shape(chipOutline().map(([x, y]) => new THREE.Vector2(x, y))),
    { depth: 0.12, bevelEnabled: false, curveSegments: 8 });
  const base = new THREE.Mesh(baseGeo, new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.015, 0.014, 0.013), metalness: 0.5, roughness: 0.5 }));
  base.position.z = -0.14;
  base.receiveShadow = true;
  group.add(base);
  // centre of each pad, for the assembly animation
  const centres = chipPads().map((pts) => {
    let x = 0, y = 0;
    for (const [px, py] of pts) { x += px; y += py; }
    return new THREE.Vector2(x / pts.length, y / pts.length);
  });
  // shape xy → world xz, extrusion → world up
  group.rotation.x = -Math.PI / 2;
  return { group, pads, centres, base };
}

export function contacts({ renderer, cam }) {
  const scene = new THREE.Scene();
  const bg = backdrop(); scene.add(bg);
  bg.userData.set(0, 0.85, 1.1, 0.8, 0.12, [0.8, 0.82, 0.86]);
  scene.environment = softboxEnv(renderer, [
    { az: 160, el: 35, w: 16, h: 4, i: 3.0, feather: 0.3 },
    { az: -150, el: 50, w: 6, h: 6, i: 2.0 },
    { az: 60, el: 15, w: 1.5, h: 10, i: 4.0 },
    { az: -70, el: 12, w: 1.5, h: 10, i: 3.0 },
  ], { dome: [0.22, 0.06, 0.02] });
  const chip = macroChip(renderer);
  scene.add(chip.group);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.35, metalness: 0.4 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.16;
  scene.add(ground);
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(-10, 14, -6);
  scene.add(key);

  const camera = cam(32, 0.05, 200);
  const order = [3, 0, 1, 4, 2, 5];
  return {
    scene, camera,
    update(lt) {
      const u = lt / 0.9375;
      chip.pads.forEach((m, i) => {
        const k = order.indexOf(i);
        const s = spring((lt + 0.12 - k * 0.07) / 0.55, 1.1, 5.0);
        const c = chip.centres[i];
        // each pad comes up from below and slides in from just outside its seat
        m.position.set(c.x * 0.35 * (1 - s), c.y * 0.35 * (1 - s), -1.4 * (1 - s));
        m.rotation.z = 0.12 * (1 - s) * (i % 2 ? 1 : -1);
      });
      const k = ease.inOutSine(u);
      camera.position.set(lerp(-9.0, -5.0, k), lerp(2.6, 2.2, k), lerp(6.0, 8.6, k));
      camera.lookAt(lerp(-1.5, 1.5, k), -0.2, lerp(-0.5, 0.5, k));
      const focus = camera.position.distanceTo(new THREE.Vector3(lerp(-2.5, 0.5, k), 0, 1.5));
      return { focus, aperture: 12, maxCoc: 16, bloom: 0.12, threshold: 0.9, exposure: 1.0, vignette: 0.5, contrast: 1.1 };
    },
  };
}

const POCKET = /* glsl */`
uniform float uDepth, uRim, uWave, uT;
float sdRoundRect(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float pocketH(vec2 p) {
  float d = sdRoundRect(p, vec2(5.75, 4.65), 1.1);
  float floorH = -uDepth * (1.0 - smoothstep(-0.18, 0.32, d));
  float rim = uRim * exp(-pow((d - 0.95) / 0.75, 2.0));
  float wave = uWave * sin((d - uT * 7.0) * 1.6) * exp(-max(d, 0.0) * 0.35) * smoothstep(0.0, 0.6, d);
  return floorH + rim + wave;
}`;

export function pocket({ renderer, cam }) {
  const scene = new THREE.Scene();
  const bg = backdrop(); scene.add(bg);
  bg.userData.set(0, 0.2, 1.1, 0.8, 0.10, [0.8, 0.82, 0.86]);
  scene.environment = softboxEnv(renderer, [
    { az: 150, el: 40, w: 14, h: 5, i: 2.2, feather: 0.35 },
    { az: -120, el: 30, w: 2, h: 12, i: 3.0 },
    { az: 50, el: 20, w: 2, h: 12, i: 2.0 },
    { az: 0, el: 75, w: 10, h: 6, i: 0.8 },
  ], { dome: [0.2, 0.05, 0.02] });

  const uniforms = { uDepth: { value: 0 }, uRim: { value: 0 }, uWave: { value: 0 }, uT: { value: 0 } };
  const mat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.022, 0.022, 0.024), roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.25 });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + POCKET)
      .replace('#include <beginnormal_vertex>', `
        vec2 lp = vec2(position.x, -position.z); float e = 0.03;
        float hC = pocketH(lp);
        float hx = pocketH(lp + vec2(e, 0.0)) - pocketH(lp - vec2(e, 0.0));
        float hz = pocketH(lp + vec2(0.0, e)) - pocketH(lp - vec2(0.0, e));
        vec3 objectNormal = normalize(vec3(-hx / (2.0 * e), 1.0, hz / (2.0 * e)));`)
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.x, hC, position.z);');
  };
  const geo = new THREE.PlaneGeometry(44, 34, 600, 460);
  geo.rotateX(-Math.PI / 2);
  const surface = new THREE.Mesh(geo, mat);
  surface.frustumCulled = false;
  surface.receiveShadow = true;
  scene.add(surface);

  const chip = macroChip(renderer, { depth: 0.3, bevel: 0.07 });
  chip.pads.forEach((m) => { m.castShadow = true; });
  scene.add(chip.group);
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(-8, 16, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 60 });
  key.shadow.bias = -0.0004;
  scene.add(key);

  const camera = cam(28, 0.1, 300);
  return {
    scene, camera,
    update(lt) {
      const u = lt / 0.9375;
      // the chip drops in, the surface gives under it, bulges round it, ripples once and settles
      const drop = ease.inCubic(lt / 0.22);
      const press = spring((lt - 0.2) / 0.7, 1.3, 4.2);
      uniforms.uDepth.value = 0.42 * clamp(press, 0, 1.35);
      uniforms.uRim.value = 0.55 * Math.max(0, press) * (1 - 0.35 * smoothstep(0.35, 0.9, lt));
      uniforms.uWave.value = 0.06 * Math.exp(-Math.max(0, lt - 0.2) * 4) * smoothstep(0.18, 0.26, lt);
      uniforms.uT.value = lt;
      chip.group.position.y = lerp(4.5, 0, drop) - uniforms.uDepth.value + 0.14;
      const k = ease.inOutSine(u);
      const ang = lerp(-0.75, -0.45, k);
      camera.position.set(Math.sin(ang) * 24, lerp(15, 13, k), Math.cos(ang) * 24);
      camera.lookAt(0, -0.3, 0);
      const focus = camera.position.length();
      return { focus, aperture: 6, maxCoc: 12, bloom: 0.1, threshold: 0.9, exposure: 1.0, vignette: 0.5, contrast: 1.1 };
    },
  };
}
