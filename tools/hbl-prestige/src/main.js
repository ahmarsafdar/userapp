// One timeline drives every shot: renderFrame(t) draws the film at t seconds.
import * as THREE from 'three';
import { Lens } from './post.js';
import { loadFonts, makeFaces } from './card.js';
import { buildShots, DURATION } from './shots.js';

const params = new URLSearchParams(location.search);
const W = +(params.get('w') || 1920), H = +(params.get('h') || 1080);
export const FPS = 30;

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the lens does its own display transform
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);

const lens = new Lens(renderer, W, H);
await loadFonts('fonts/');
const faces = makeFaces(renderer);
const shots = await buildShots({ renderer, faces, W, H, only: params.get('shot') });

window.DURATION = DURATION;
window.SHOTS = shots.map((s) => ({ name: s.name, start: s.start, end: s.end }));
window.renderFrame = (t) => {
  const shot = shots.find((s) => t >= s.start && t < s.end);
  renderer.setClearColor(0x000000, 1);
  if (!shot) {
    // the short black beats between some shots
    renderer.setRenderTarget(null);
    renderer.clear();
    renderer.getContext().finish();
    return 'black';
  }
  const look = shot.update(t - shot.start, t);
  lens.render(shot.scene, shot.camera, look, Math.round(t * FPS));
  // make sure the GPU has finished before the frame is read back
  renderer.getContext().finish();
  return shot.name;
};
window.ready = true;
