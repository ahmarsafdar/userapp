// 13 END (0:20.6–0:23.5): the HBL Prestige wordmark on black — solid copper letters, a light passing over them.
import * as THREE from 'three';
import { softboxEnv, backdrop } from '../studio.js';
import { hblMesh } from '../card.js';
import { ease, smoothstep, lerp } from '../util.js';

function wordTexture(text, font, px, color) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `${px}px ${font}`;
  const m = ctx.measureText(text);
  c.width = Math.ceil(m.actualBoundingBoxRight + m.actualBoundingBoxLeft + px * 0.2);
  c.height = Math.ceil(px * 1.4);
  ctx.font = `${px}px ${font}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, m.actualBoundingBoxLeft + px * 0.1, px * 1.05);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // ink box in canvas pixels, so the plane can be placed by its letters rather than its padding
  return { t, w: c.width, h: c.height, inkLeft: px * 0.1, inkW: m.actualBoundingBoxRight + m.actualBoundingBoxLeft, base: px * 1.05, cap: m.actualBoundingBoxAscent };
}

export function end({ renderer, cam }) {
  const scene = new THREE.Scene();
  const bg = backdrop(); scene.add(bg);
  scene.environment = softboxEnv(renderer, [
    { az: 0, el: 10, w: 1.4, h: 30, i: 9, roll: 20, feather: 0.45 },
    { az: 0, el: -4, w: 24, h: 12, i: 0.55, feather: 0.5 },
    { az: -30, el: 30, w: 14, h: 10, i: 0.7 },
    { az: 60, el: -20, w: 14, h: 6, i: 0.35 },
  ], { dome: [0.22, 0.10, 0.04] });

  // lockup measured from the card: Prestige starts 3.494 caps from the H, sits 0.077 caps above its baseline, cap 0.49
  const cap = 1.0, total = 5.834 * cap;
  const group = new THREE.Group();
  const copper = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.96, 0.56, 0.40), metalness: 1, roughness: 0.2 });
  const logo = hblMesh({ cap, depth: 0.16, bevel: 0.03, material: copper });
  group.add(logo);
  const word = wordTexture('Prestige', 'OSLight', 400, '#ffffff');
  const scale = (0.49 * cap) / word.cap;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(word.w * scale, word.h * scale),
    new THREE.MeshBasicMaterial({ map: word.t, transparent: true, color: new THREE.Color(0.85, 0.85, 0.86) }));
  plane.position.set(3.494 * cap - word.inkLeft * scale + (word.w * scale) / 2, 0.077 * cap + (word.base - word.h / 2) * scale, 0.1);
  group.add(plane);
  group.position.set(-total / 2, -0.5 * cap, 0);
  scene.add(group);

  const camera = cam(20, 0.1, 100);
  return {
    scene, camera,
    update(lt) {
      const u = lt / 2.9;
      camera.position.set(0, 0, lerp(22.5, 21.0, ease.outCubic(u)));
      camera.lookAt(0, 0, 0);
      scene.environmentRotation.set(0, lerp(-0.9, 0.9, ease.inOutSine((lt - 0.2) / 2.2)), 0);
      const fade = 1 - smoothstep(0.0, 0.9, lt);
      return { focus: 21.5, aperture: 0, bloom: 0.12, threshold: 1.0, exposure: 1.0, fade, vignette: 0.35, contrast: 1.05 };
    },
  };
}
