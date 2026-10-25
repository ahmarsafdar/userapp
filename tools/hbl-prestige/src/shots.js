// The edit: which shot plays when. Each shot module returns { scene, camera, update(localTime) → lens settings }.
// Cuts from 0:06.1 land every two beats of the 128 BPM score (0.9375 s), as in the reference.
import * as THREE from 'three';
import { rock } from './shots/rock.js';
import { emerge } from './shots/emerge.js';
import { molten } from './shots/molten.js';
import { silk } from './shots/silk.js';
import { contacts, pocket } from './shots/chip.js';
import { logo, mark, pair, cross, face } from './shots/cards.js';
import { hero } from './shots/hero.js';
import { end } from './shots/end.js';

export const DURATION = 23.5;

const TIMELINE = [
  ['rock', 0.0, 4.3, rock],
  ['emerge', 4.3, 6.1, emerge],
  ['molten', 6.1, 7.0375, molten],
  ['silk', 7.0375, 7.975, silk],
  ['contacts', 7.975, 8.9125, contacts],
  ['pocket', 8.9125, 9.85, pocket],
  ['logo', 9.85, 10.7875, logo],
  ['mark', 10.7875, 11.725, mark],
  ['pair', 11.725, 13.6, pair],
  ['cross', 13.6, 14.85, cross],
  ['face', 15.006, 16.95, face],
  ['hero', 17.0, 20.6, hero],
  ['end', 20.6, 23.5, end],
];

export async function buildShots({ renderer, faces, W, H, only }) {
  const ctx = { renderer, faces, W, H, cam: (fov, near = 0.1, far = 200) => new THREE.PerspectiveCamera(fov, W / H, near, far) };
  const shots = [];
  for (const [name, start, end, build] of TIMELINE) {
    if (only && !only.split(',').includes(name)) continue;
    shots.push(Object.assign(build(ctx), { name, start, end }));
  }
  return shots;
}
