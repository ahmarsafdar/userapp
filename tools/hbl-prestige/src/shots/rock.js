// 1 ROCK (0:00–0:04.3): macro on raw stone. A crag rises left to right, a second ridge sits far out of focus behind it.
// A rim light from the right comes up at 2.3 s, as the bass comes in, and slides round, so the shadows crawl.
import * as THREE from 'three';
import { makeNoise, smoothstep, ease, lerp } from '../util.js';
import { rockMaterial, heightField } from '../materials.js';
import { backdrop } from '../studio.js';

export function rock({ cam }) {
  const N = makeNoise(5);
  const scene = new THREE.Scene();
  const bg = backdrop(); scene.add(bg);

  const billow = (x, z, oct) => {
    let s = 0, a = 1, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) { s += a * Math.abs(N.n2(x * f + o * 3.7, z * f - o * 5.3)); norm += a; a *= 0.5; f *= 2.1; }
    return s / norm;
  };
  const field = (x, z) => {
    const wx = x + 1.1 * N.fbm2(x * 0.11, z * 0.11, 3), wz = z + 1.1 * N.fbm2(x * 0.11 + 3.3, z * 0.11 - 7.1, 3);
    // the near crag climbs to the right; past a dip, a bigger ridge rises behind it
    const near = (0.34 * (x + 3.5) + 0.2) * smoothstep(-3.0, 0.2, z) * smoothstep(4.5, 1.2, z);
    const far = (2.6 + 0.22 * (x + 6)) * smoothstep(-3.5, -6.5, z);
    const lumps = N.fbm2(wx * 0.24, wz * 0.24, 5) * 1.0;
    const crevice = billow(wx * 0.5, wz * 0.5, 5) * 0.42;
    const crag = Math.pow(N.ridged2(wx * 0.85, wz * 0.85, 5), 1.5) * 0.3;
    const grit = N.fbm2(wx * 2.6, wz * 2.6, 3) * 0.06;
    const h = near + far + lumps + crevice + crag + grit;
    return [h, 0.4 + 0.6 * smoothstep(0.1, 0.6, crevice + crag)];
  };
  const geo = heightField(30, 24, 900, 720, field);
  geo.translate(1.5, 0, -3.5);
  const ground = new THREE.Mesh(geo, rockMaterial({ color: 0x5c5c5c, roughness: 0.55, bump: 0.012, freq: 18, octaves: 5 }));
  ground.castShadow = ground.receiveShadow = true;
  scene.add(ground);

  const key = new THREE.DirectionalLight(0xfffaf4, 1);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 100 });
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.02;
  key.target.position.set(1, 0, -2);
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(0xc8d4ff, 0.0);
  fill.position.set(-12, 6, 10);
  const back = new THREE.DirectionalLight(0xe6ecff, 0.0);
  back.position.set(8, 22, -40);
  scene.add(fill, back, new THREE.HemisphereLight(0x8c96a4, 0x000000, 0.02));

  const camera = cam(30, 0.1, 100);
  return {
    scene, camera,
    update(lt) {
      const k = ease.inOutSine(lt / 4.3);
      camera.position.set(lerp(-1.6, -0.6, k), lerp(1.05, 1.2, k), lerp(5.6, 4.9, k));
      camera.lookAt(lerp(1.7, 2.1, k), lerp(1.95, 2.05, k), -2.5);
      const on = ease.outCubic((lt - 2.3) / 1.1);
      // az is measured from straight behind the rock: ~90° is a hard side light from the right
      const az = THREE.MathUtils.degToRad(lerp(80, 100, lt / 4.3)), el = THREE.MathUtils.degToRad(lerp(36, 28, lt / 4.3));
      key.position.set(1 + Math.sin(az) * 40, Math.sin(el) * 40, -2 - Math.cos(az) * 40);
      key.intensity = 0.9 + 3.3 * on;
      back.intensity = 0.35 + 1.2 * on;
      fill.intensity = 0.01 + 0.05 * on;
      bg.userData.set(0, 1.0, 1.05, 0.85, 0.09 + 0.22 * on, [0.78, 0.8, 0.84]);
      bg.userData.set(1, 0.55, 1.2, 0.5, 0.02 + 0.05 * on, [0.85, 0.87, 0.9]);
      const fade = 1 - smoothstep(0.0, 1.0, lt);
      const focus = camera.position.distanceTo(new THREE.Vector3(1.6, 1.3, 0.6));
      return { focus, aperture: 16, maxCoc: 16, bloom: 0.07, threshold: 1.1, exposure: 1.0, fade, vignette: 0.55, contrast: 1.15 };
    },
  };
}
