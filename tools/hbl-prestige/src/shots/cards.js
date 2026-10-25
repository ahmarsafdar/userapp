// The card itself. Card space: face towards +z, x right, y up, 8.56 × 5.398, origin at its centre.
//  7 LOGO  (0:09.85–0:10.79)  raking close-up of the copper wordmark and the chip, a light sweep crosses it
//  8 MARK  (0:10.79–0:11.73)  the Mastercard corner at a grazing angle, a reflection slides off the lacquer
//  9 PAIR  (0:11.73–0:13.60)  front and back fanned out, pushing in
// 10 CROSS (0:13.60–0:14.85)  the two faces cross on the diagonal, light running along the edges
// 11 FACE  (0:15.01–0:16.95)  the front, nearly square on; a broad sweep reveals it, then it goes dark
import * as THREE from 'three';
import { softboxEnv, backdrop } from '../studio.js';
import { makeCard, CARD } from '../card.js';
import { ease, smoothstep, lerp } from '../util.js';

const mm = (x, y) => new THREE.Vector3(-CARD.w / 2 + x * 0.1, CARD.h / 2 - y * 0.1, CARD.t / 2);

export function logo({ renderer, faces, cam }) {
  const scene = new THREE.Scene();
  const bg = backdrop(); scene.add(bg);
  bg.userData.set(0, 0.0, 1.0, 0.9, 0.18, [0.8, 0.82, 0.86]);
  scene.environment = softboxEnv(renderer, [
    { az: 0, el: 55, w: 3.0, h: 30, i: 7, roll: 70, feather: 0.45 },
    { az: -40, el: 20, w: 16, h: 10, i: 0.5, feather: 0.2 },
    { az: 120, el: 25, w: 2, h: 12, i: 4 },
    { az: -120, el: 25, w: 2, h: 12, i: 3 },
  ], { dome: [0.12, 0.05, 0.02] });
  const card = makeCard(renderer, faces);
  scene.add(card);
  const camera = cam(24, 0.05, 100);
  const target = mm(20, 13);
  return {
    scene, camera,
    update(lt) {
      const u = lt / 0.9375, k = ease.inOutSine(u);
      camera.position.copy(target).add(new THREE.Vector3(lerp(3.3, 2.5, k), lerp(-3.0, -2.8, k), lerp(2.9, 3.1, k)));
      camera.lookAt(target.clone().add(new THREE.Vector3(lerp(0.15, -0.15, k), 0, 0)));
      // the sweep: the strip's reflection crosses the face as the environment turns
      scene.environmentRotation.set(0, lerp(-0.55, 0.5, ease.inOutSine(u)), 0);
      const focus = camera.position.distanceTo(mm(17, 9));
      return { focus, aperture: 7, maxCoc: 14, bloom: 0.12, threshold: 1.0, exposure: 1.05, vignette: 0.5, contrast: 1.1 };
    },
  };
}

export function mark({ renderer, faces, cam }) {
  const scene = new THREE.Scene();
  const bg = backdrop(); scene.add(bg);
  bg.userData.set(0, 0.0, 0.8, 0.8, 0.22, [0.8, 0.82, 0.86]);
  scene.environment = softboxEnv(renderer, [
    // the camera grazes the face, so the lacquer mirrors the room low and to the right (az ~65°, el ~-29°)
    { az: 82, el: -26, w: 9, h: 14, i: 1.1, roll: 35, feather: 0.05 },
    { az: 62, el: -30, w: 0.7, h: 22, i: 6, roll: 35, feather: 0.4 },
    { az: -60, el: 35, w: 2, h: 12, i: 4 },
    { az: 160, el: 40, w: 6, h: 6, i: 1.5 },
  ], { dome: [0.12, 0.05, 0.02] });
  const card = makeCard(renderer, faces);
  scene.add(card);
  const camera = cam(22, 0.05, 100);
  const target = mm(70.5, 44.5);
  return {
    scene, camera,
    update(lt) {
      const u = lt / 0.9375, k = ease.inOutSine(u);
      camera.position.copy(target).add(new THREE.Vector3(lerp(-3.4, -3.0, k), lerp(2.1, 2.5, k), lerp(1.55, 1.75, k)));
      camera.lookAt(target.clone().add(new THREE.Vector3(0.2, -0.15, 0)));
      scene.environmentRotation.set(0, lerp(0.35, -0.35, ease.inOutSine(u)), 0);
      const focus = camera.position.distanceTo(target);
      return { focus, aperture: 7, maxCoc: 14, bloom: 0.12, threshold: 1.0, exposure: 1.0, vignette: 0.5, contrast: 1.1 };
    },
  };
}

export function pair({ renderer, faces, cam }) {
  const scene = new THREE.Scene();
  const bg = backdrop(); scene.add(bg);
  bg.userData.set(0, 0.3, 0.75, 0.55, 0.45, [0.82, 0.84, 0.88]);
  bg.userData.set(1, 0.65, 0.35, 0.35, 0.06, [0.9, 0.9, 0.95]);
  scene.environment = softboxEnv(renderer, [
    { az: -30, el: 25, w: 10, h: 18, i: 0.7, roll: -20, feather: 0.05 },
    { az: -12, el: 25, w: 0.4, h: 26, i: 7, roll: -20, feather: 0.4 },
    { az: -110, el: 15, w: 2, h: 14, i: 5 },
    { az: 100, el: 20, w: 2, h: 14, i: 3 },
    { az: 0, el: 75, w: 10, h: 5, i: 1.0 },
  ], { dome: [0.12, 0.05, 0.02] });
  const back = makeCard(renderer, faces), front = makeCard(renderer, faces);
  // pivots at the bottom left, so the pair fans like a hand of cards
  const pivotB = new THREE.Group(), pivotF = new THREE.Group();
  pivotB.add(back); pivotF.add(front);
  back.position.set(3.2, 2.2, 0); front.position.set(3.2, 2.2, 0);
  back.rotation.y = Math.PI;
  scene.add(pivotB, pivotF);
  const camera = cam(26, 0.1, 200);
  return {
    scene, camera,
    update(lt) {
      const u = lt / 1.875, k = ease.inOutSine(u), open = ease.outCubic(u / 0.8);
      pivotB.position.set(-2.0, -2.2, -0.9);
      pivotF.position.set(-1.2, -2.6, 0.5);
      pivotB.rotation.set(0.04, -0.42, lerp(0.20, 0.48, open));
      pivotF.rotation.set(0.0, -0.36, lerp(-0.04, -0.15, open));
      camera.position.set(lerp(2.2, 1.6, k), lerp(-1.2, -0.8, k), lerp(18.5, 16.2, k));
      camera.lookAt(lerp(0.7, 0.9, k), 0.3, 0);
      const focus = camera.position.distanceTo(new THREE.Vector3(1.5, 0, 0.6));
      return { focus, aperture: 2.5, maxCoc: 10, bloom: 0.1, threshold: 1.1, exposure: 1.05, vignette: 0.5, contrast: 1.08 };
    },
  };
}

export function cross({ renderer, faces, cam }) {
  const scene = new THREE.Scene();
  const bg = backdrop(); scene.add(bg);
  bg.userData.set(0, 0.95, 0.4, 0.5, 0.25, [0.82, 0.84, 0.88]);
  scene.environment = softboxEnv(renderer, [
    { az: 25, el: 20, w: 10, h: 24, i: 0.6, roll: 50, feather: 0.05 },
    { az: 10, el: 20, w: 0.5, h: 26, i: 7, roll: 50, feather: 0.4 },
    { az: -100, el: 30, w: 2, h: 14, i: 5 },
    { az: 110, el: -10, w: 2, h: 14, i: 4 },
  ], { dome: [0.1, 0.04, 0.015] });
  const a = makeCard(renderer, faces), b = makeCard(renderer, faces);
  b.rotation.y = Math.PI; // shows its back
  const ga = new THREE.Group(), gb = new THREE.Group();
  ga.add(a); gb.add(b);
  scene.add(ga, gb);
  const camera = cam(26, 0.1, 200);
  return {
    scene, camera,
    update(lt) {
      const u = lt / 1.25, k = ease.inOutSine(u);
      ga.position.set(lerp(-2.2, -1.9, k), -1.6, 0.25);
      ga.rotation.set(0.05, 0.12, 0.62 + 0.04 * k);
      gb.position.set(lerp(3.3, 3.0, k), 2.4, -0.25);
      gb.rotation.set(-0.05, 0.12, 0.62 + Math.PI + 0.04 * k);
      camera.position.set(lerp(1.0, 0.2, k), lerp(-0.1, 0.4, k), lerp(17.5, 16.0, k));
      camera.lookAt(0.4, 0.3, 0);
      const fade = smoothstep(1.0, 1.25, lt);
      return { focus: 16.6, aperture: 2.5, maxCoc: 10, bloom: 0.1, threshold: 1.1, exposure: 1.05, fade, vignette: 0.5, contrast: 1.08 };
    },
  };
}

export function face({ renderer, faces, cam }) {
  const scene = new THREE.Scene();
  const bg = backdrop(); scene.add(bg);
  bg.userData.set(0, 0.0, 0.7, 0.55, 0.3, [0.8, 0.82, 0.86]);
  scene.environment = softboxEnv(renderer, [
    { az: -10, el: 8, w: 4.0, h: 30, i: 2.2, roll: 8, feather: 0.45 },
    { az: -110, el: 15, w: 2, h: 14, i: 4 },
    { az: 110, el: 20, w: 2, h: 14, i: 3 },
    { az: 0, el: 70, w: 10, h: 5, i: 0.9 },
  ], { dome: [0.1, 0.04, 0.015] });
  const card = makeCard(renderer, faces);
  scene.add(card);
  const camera = cam(30, 0.1, 100);
  return {
    scene, camera,
    update(lt) {
      const u = lt / 1.95, k = ease.inOutSine(u);
      card.position.set(lerp(0.9, 1.45, k), -0.55, 0);
      card.rotation.set(-0.06, lerp(0.10, 0.04, k), 0.0);
      camera.position.set(0, 0.2, 12.4);
      camera.lookAt(0, 0, 0);
      // a broad soft box travels left to right across the lacquer
      scene.environmentRotation.set(0, lerp(-0.45, 0.65, ease.inOutSine(u / 0.92)), 0);
      const fade = Math.max(1 - smoothstep(0, 0.12, lt), smoothstep(1.55, 1.95, lt));
      return { focus: 12.4, aperture: 2, maxCoc: 10, bloom: 0.1, threshold: 1.1, exposure: 1.05, fade, vignette: 0.5, contrast: 1.08 };
    },
  };
}
