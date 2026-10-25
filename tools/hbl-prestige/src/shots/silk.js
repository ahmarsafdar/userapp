// 4 SILK (0:07.04–0:07.98): a dark liquid surface, close and shallow. Sharp folds relax into slow swells.
import * as THREE from 'three';
import { GLSL_NOISE, ease, lerp } from '../util.js';
import { backdrop, softboxEnv } from '../studio.js';

const WAVES = /* glsl */`
uniform float uT, uCalm;
float waveH(vec2 p) {
  float t = uT;
  float swell = sin(dot(p, vec2(0.55, 0.83)) * 0.75 - t * 1.6) * 0.28 + sin(dot(p, vec2(-0.8, 0.6)) * 0.5 - t * 1.1) * 0.22;
  float soft = snoise(vec3(p * 0.28, t * 0.45)) * 0.55 + snoise(vec3(p * 0.62 + 3.0, t * 0.7)) * 0.22;
  float n = snoise(vec3(p * 0.36 - 5.0, t * 0.9));
  float r = 1.0 - sqrt(n * n + 0.05); // a rounded crease: a hard abs() saw-tooths between vertices
  float folds = r * r * 0.75 - 0.3;
  return swell + soft + folds * (1.0 - uCalm);
}`;

export function silk({ renderer, cam }) {
  const scene = new THREE.Scene();
  const bg = backdrop(); scene.add(bg);
  bg.userData.set(0, 0.5, 1.2, 0.7, 0.06, [0.8, 0.82, 0.86]);
  scene.environment = softboxEnv(renderer, [
    { az: 180, el: 25, w: 22, h: 5, i: 2.2, feather: 0.45 },
    { az: 150, el: 55, w: 10, h: 10, i: 1.2, feather: 0.45 },
    { az: -110, el: 20, w: 2.5, h: 12, i: 2.0 },
    { az: 0, el: 70, w: 8, h: 8, i: 0.5 },
  ], { dome: [0.06, 0.02, 0.005] });

  const uniforms = { uT: { value: 0 }, uCalm: { value: 0 } };
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.10, 0.10, 0.11), metalness: 0.55, roughness: 0.3,
    sheen: 0.5, sheenColor: new THREE.Color(0.35, 0.36, 0.4), sheenRoughness: 0.45,
  });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + GLSL_NOISE + WAVES)
      .replace('#include <beginnormal_vertex>', `
        vec2 lp = position.xz; float e = 0.05;
        float hC = waveH(lp);
        float hx = waveH(lp + vec2(e, 0.0)) - waveH(lp - vec2(e, 0.0));
        float hz = waveH(lp + vec2(0.0, e)) - waveH(lp - vec2(0.0, e));
        vec3 objectNormal = normalize(vec3(-hx / (2.0 * e), 1.0, -hz / (2.0 * e)));`)
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position.x, hC, position.z);');
  };
  const geo = new THREE.PlaneGeometry(44, 44, 620, 620);
  geo.rotateX(-Math.PI / 2);
  const sheet = new THREE.Mesh(geo, mat);
  sheet.frustumCulled = false;
  scene.add(sheet);

  const camera = cam(30, 0.1, 100);
  return {
    scene, camera,
    update(lt) {
      const u = lt / 0.9375;
      uniforms.uT.value = 2.0 + lt * 1.1;
      uniforms.uCalm.value = ease.inOutSine(u);
      camera.position.set(lerp(-1.0, 0.6, u), 1.55, lerp(9.0, 8.2, u));
      camera.lookAt(lerp(-0.4, 0.4, u), 0.1, -3.5);
      return { focus: 8.5, aperture: 10, maxCoc: 16, bloom: 0.08, threshold: 1.0, exposure: 1.1, vignette: 0.55, contrast: 1.1 };
    },
  };
}
