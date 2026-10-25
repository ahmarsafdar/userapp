// Studio lighting: soft-box environments for reflections, and a gradient backdrop.
import * as THREE from 'three';

// A black room with emissive soft boxes, baked into a prefiltered environment map.
// Each strip: { az, el (degrees), w, h, i (intensity), c (colour), r (distance), feather }.
export function softboxEnv(renderer, strips, { dome = [0, 0, 0], size = 512 } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0, 0, 0);
  // dim gradient dome (top, horizon, floor): gives metal a body colour without greying the black lacquer
  const sky = new THREE.Mesh(new THREE.SphereGeometry(40, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: dome[0] }, mid: { value: dome[1] }, bot: { value: dome[2] } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float top, mid, bot; varying vec3 vP; void main(){ float y = vP.y; float v = y > 0.0 ? mix(mid, top, smoothstep(0.0, 0.9, y)) : mix(mid, bot, smoothstep(0.0, 0.5, -y)); gl_FragColor = vec4(vec3(v), 1.0); }',
  }));
  scene.add(sky);
  for (const s of strips) {
    const geo = new THREE.PlaneGeometry(s.w, s.h, 1, 1);
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { c: { value: new THREE.Color(...(s.c || [1, 1, 1])).multiplyScalar(s.i) }, f: { value: s.feather ?? 0.25 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      // soft edges: the falloff is what makes reflections look like real diffused light
      fragmentShader: 'uniform vec3 c; uniform float f; varying vec2 vUv; void main(){ vec2 d = min(vUv, 1.0 - vUv); float m = smoothstep(0.0, f, d.x) * smoothstep(0.0, f, d.y); gl_FragColor = vec4(c * m, 1.0); }',
    });
    const m = new THREE.Mesh(geo, mat);
    const r = s.r ?? 10, az = THREE.MathUtils.degToRad(s.az), el = THREE.MathUtils.degToRad(s.el);
    m.position.set(r * Math.cos(el) * Math.sin(az), r * Math.sin(el), r * Math.cos(el) * Math.cos(az));
    m.lookAt(0, 0, 0);
    if (s.roll) m.rotateZ(THREE.MathUtils.degToRad(s.roll));
    scene.add(m);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0, 0.1, 50, { size });
  pmrem.dispose();
  return rt.texture;
}

// Full-screen gradient drawn behind everything: a base colour plus up to three soft glows (screen space).
export function backdrop() {
  const uniforms = {
    base: { value: new THREE.Color(0, 0, 0) },
    g0: { value: new THREE.Vector4(0.8, 0.9, 0.6, 0) }, c0: { value: new THREE.Color(1, 1, 1) },
    g1: { value: new THREE.Vector4(0.5, 0.0, 0.6, 0) }, c1: { value: new THREE.Color(1, 1, 1) },
    g2: { value: new THREE.Vector4(0.5, 0.5, 0.5, 0) }, c2: { value: new THREE.Color(1, 1, 1) },
    aspect: { value: 16 / 9 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 1.0, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 base, c0, c1, c2; uniform vec4 g0, g1, g2; uniform float aspect; varying vec2 vUv;
      vec3 glow(vec4 g, vec3 c) { vec2 d = (vUv - g.xy) * vec2(aspect, 1.0); float k = exp(-dot(d, d) / (g.z * g.z)); return c * g.w * k; }
      void main() { gl_FragColor = vec4(base + glow(g0, c0) + glow(g1, c1) + glow(g2, c2), 1.0); }`,
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false; mesh.renderOrder = -1000;
  mesh.userData.set = (i, x, y, size, power, color = [1, 1, 1]) => {
    uniforms['g' + i].value.set(x, y, size, power); uniforms['c' + i].value.setRGB(...color);
  };
  return mesh;
}
