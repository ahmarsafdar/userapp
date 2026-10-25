// 12 HERO (0:17–0:20.6): the card floats over a pool of light and turns; a glint slides across its face.
import * as THREE from 'three';
import { softboxEnv, backdrop } from '../studio.js';
import { makeCard } from '../card.js';
import { ease, smoothstep, lerp } from '../util.js';

export function hero({ renderer, faces, cam }) {
  const scene = new THREE.Scene();
  const bg = backdrop(); scene.add(bg);
  bg.userData.set(0, 0.5, -0.30, 0.55, 0.55, [0.80, 0.83, 0.88]);
  bg.userData.set(1, 0.5, 0.05, 0.22, 0.05, [1, 1, 1]);
  scene.environment = softboxEnv(renderer, [
    { az: 42, el: 12, w: 9, h: 26, i: 0.55, roll: 24, feather: 0.03 },
    { az: 18, el: 12, w: 0.32, h: 26, i: 9, roll: 24, feather: 0.4 },
    { az: -100, el: 10, w: 2.2, h: 14, i: 5 },
    { az: 105, el: 20, w: 2.2, h: 14, i: 4 },
    { az: 0, el: 72, w: 10, h: 5, i: 1.2 },
  ], { dome: [0.10, 0.04, 0.015] });
  const card = makeCard(renderer, faces); scene.add(card);
  const camera = cam(18, 1, 200);
  return {
    scene, camera,
    update(lt) {
      const k = ease.inOutSine(lt / 3.6);
      camera.position.set(0, 1.1 - 0.25 * k, 32 - 1.2 * k); camera.lookAt(0, 0.35, 0);
      card.position.set(0, 0.45 + 0.08 * Math.sin(lt * 1.1), 0);
      card.rotation.set(-0.10 + 0.03 * k, lerp(0.34, 0.04, k), lerp(-0.035, 0.0, k));
      const fade = Math.max(1 - smoothstep(0.0, 0.7, lt), smoothstep(3.1, 3.6, lt));
      return { focus: 32, aperture: 1.5, maxCoc: 8, bloom: 0.10, threshold: 1.2, exposure: 1.05, fade, vignette: 0.5, contrast: 1.08 };
    },
  };
}
