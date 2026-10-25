// 2 EMERGE (0:04.3–0:06.1): close on the rock floor, liquid metal wells up out of it in two drops.
import * as THREE from 'three';
import { makeNoise, smoothstep, ease, lerp, spring } from '../util.js';
import { rockMaterial, heightField } from '../materials.js';
import { backdrop, softboxEnv } from '../studio.js';

// A drop of liquid metal: rounded dome, a meniscus flare where it meets the rock, the rest hidden below ground.
function drop(N, seed) {
  const geo = new THREE.SphereGeometry(1, 144, 96);
  const base = geo.attributes.position.array.slice();
  const mesh = new THREE.Mesh(geo, null);
  mesh.castShadow = true;
  mesh.userData.pose = (R, H, w, t) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const sx = base[i * 3], sy = base[i * 3 + 1], sz = base[i * 3 + 2];
      const ring = Math.hypot(sx, sz) || 1e-6;
      let r, y;
      if (sy >= 0) {
        r = R * (Math.pow(1 - sy * sy, 0.42) + 0.16 * Math.exp(-sy / 0.08));
        y = sy * H;
      } else {
        r = R * 1.16 * Math.sqrt(1 - sy * sy);
        y = sy * R * 0.12;
      }
      const n = N.n3(sx * 1.3 + seed, sy * 1.3 + t * 0.8, sz * 1.3 - t * 0.5) * w * smoothstep(-0.1, 0.3, sy);
      r *= 1 + n;
      p.setXYZ(i, (sx / ring) * r, y * (1 + n * 0.6), (sz / ring) * r);
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
  };
  return mesh;
}

export function emerge({ renderer, cam }) {
  const N = makeNoise(23);
  const scene = new THREE.Scene();
  const bg = backdrop(); scene.add(bg);
  bg.userData.set(0, 0.6, 1.15, 0.8, 0.06, [0.8, 0.82, 0.86]);
  scene.environment = softboxEnv(renderer, [
    { az: -50, el: 50, w: 9, h: 3, i: 5, roll: 10 },
    { az: 70, el: 25, w: 1.4, h: 10, i: 3.5 },
    { az: 175, el: 22, w: 14, h: 3, i: 2.0 },
  ], { dome: [0.14, 0.04, 0.015] });

  const A = { x: -0.55, z: 0.1, r: 1.1 }, B = { x: 0.95, z: -0.45, r: 0.75 };
  const raw = (x, z) => {
    const wx = x + 0.6 * N.fbm2(x * 0.3, z * 0.3, 3), wz = z + 0.6 * N.fbm2(x * 0.3 + 3.1, z * 0.3 - 2.2, 3);
    return N.fbm2(wx * 0.55, wz * 0.55, 6) * 0.38 + N.ridged2(wx * 1.6, wz * 1.6, 4) * 0.16;
  };
  const hA = raw(A.x, A.z), hB = raw(B.x, B.z);
  // the floor settles flat where the metal comes up, so the drops meet it in a clean line
  const field = (x, z) => {
    let h = raw(x, z);
    const wa = Math.exp(-((x - A.x) ** 2 + (z - A.z) ** 2) / (A.r * A.r)), wb = Math.exp(-((x - B.x) ** 2 + (z - B.z) ** 2) / (B.r * B.r));
    h = h * (1 - wa) + hA * wa;
    h = h * (1 - wb) + hB * wb;
    return [h, 0.5 + 0.5 * smoothstep(-0.25, 0.3, raw(x, z))];
  };
  const ground = new THREE.Mesh(heightField(26, 26, 760, 760, field), rockMaterial({ color: 0x5e5e5e, roughness: 0.95, bump: 0.014, freq: 15 }));
  ground.receiveShadow = true;
  scene.add(ground);

  const metal = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.32, 0.32, 0.34), metalness: 1, roughness: 0.11 });
  const a = drop(N, 1.3), b = drop(N, 7.7);
  a.material = b.material = metal;
  a.position.set(A.x, hA - 0.01, A.z);
  b.position.set(B.x, hB - 0.01, B.z);
  scene.add(a, b);

  const key = new THREE.DirectionalLight(0xfff6ec, 1.7);
  key.position.set(-7, 6, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  const rim = new THREE.DirectionalLight(0xe8eeff, 1.1);
  rim.position.set(5, 3, -8);
  scene.add(key, rim, new THREE.HemisphereLight(0x9aa4b0, 0x000000, 0.04));

  const camera = cam(30, 0.1, 80);
  return {
    scene, camera,
    update(lt) {
      const k = ease.inOutSine(lt / 1.8);
      camera.position.set(lerp(-0.35, 0.2, k), lerp(1.95, 1.75, k), lerp(4.9, 4.4, k));
      camera.lookAt(0.15, 0.12, -0.2);
      const ga = spring((lt - 0.1) / 1.2, 0.85, 3.0), gb = spring((lt - 0.7) / 0.95, 0.95, 3.2);
      a.visible = ga > 0.001; b.visible = gb > 0.001;
      if (a.visible) a.userData.pose(0.6 * Math.max(0.08, Math.min(1.05, ga)), 0.34 * ga, 0.03, lt);
      if (b.visible) b.userData.pose(0.36 * Math.max(0.08, Math.min(1.05, gb)), 0.44 * gb, 0.035, lt + 3);
      const focus = camera.position.distanceTo(new THREE.Vector3(0.2, 0.2, -0.15));
      return { focus, aperture: 9, maxCoc: 16, bloom: 0.08, threshold: 1.2, exposure: 0.95, vignette: 0.55, contrast: 1.12 };
    },
  };
}
