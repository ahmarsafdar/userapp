// The lens: HDR scene → depth of field → bloom → tone map, grade, vignette, grain → canvas.
// Every pass is a full-screen triangle, so the whole look is in the shaders below.
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function triangle() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  return g;
}

function pass(fragmentShader, uniforms) {
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(triangle(), material);
  mesh.frustumCulled = false;
  return { material, mesh, uniforms };
}

function target(w, h, opts = {}) {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: false, ...opts,
  });
}

// Linear depth and circle of confusion (in pixels of the given resolution), shared by the DOF passes.
const COC = /* glsl */`
#include <packing>
uniform sampler2D tDepth; uniform float near, far, focus, cocScale, maxCoc;
float linearZ(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far); }
float cocAt(vec2 uv) { float z = linearZ(uv); return clamp(cocScale * (1.0 - focus / z), -maxCoc, maxCoc); }`;

// Half resolution: colour with its signed CoC in alpha.
const PREP = COC + /* glsl */`
uniform sampler2D tColor; varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tColor, vUv).rgb, cocAt(vUv)); }`;

// Single-pass scatter-as-gather bokeh (after Dennis Gustafsson), golden-angle spiral.
const GATHER = /* glsl */`
uniform sampler2D tPrep; uniform vec2 texel; uniform float maxR; varying vec2 vUv;
const float GOLDEN = 2.39996323; const float RAD = 1.15;
void main() {
  vec4 c = texture2D(tPrep, vUv);
  float cs = abs(c.a);
  vec3 col = c.rgb; float tot = 1.0; float r = RAD; float ang = 0.0;
  for (int i = 0; i < 220; i++) {
    if (r > maxR) break;
    vec2 tc = vUv + vec2(cos(ang), sin(ang)) * texel * r;
    vec4 s = texture2D(tPrep, tc);
    float ss = abs(s.a);
    if (s.a > c.a) ss = clamp(ss, 0.0, cs * 2.0);
    float m = smoothstep(r - 0.5, r + 0.5, ss);
    col += mix(col / tot, s.rgb, m); tot += 1.0;
    ang += GOLDEN; r += RAD / r;
  }
  gl_FragColor = vec4(col / tot, c.a);
}`;

// Full resolution: keep sharp pixels sharp, use the blurred layer where the CoC is large.
const COMPOSE = COC + /* glsl */`
uniform sampler2D tColor, tBlur; varying vec2 vUv;
void main() {
  vec3 sharp = texture2D(tColor, vUv).rgb;
  vec4 blur = texture2D(tBlur, vUv);
  float k = smoothstep(0.5, 2.5, abs(cocAt(vUv)));
  gl_FragColor = vec4(mix(sharp, blur.rgb, k), 1.0);
}`;

const COPY = /* glsl */`uniform sampler2D tColor; varying vec2 vUv; void main() { gl_FragColor = texture2D(tColor, vUv); }`;

// Bloom: soft-knee bright pass, 13-tap downsample, tent upsample (Jimenez, "Next Generation Post Processing in Call of Duty").
const BRIGHT = /* glsl */`
uniform sampler2D tColor; uniform float threshold, knee; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tColor, vUv).rgb;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - threshold + knee, 0.0, 2.0 * knee); soft = soft * soft / (4.0 * knee + 1e-4);
  float w = max(soft, br - threshold) / max(br, 1e-4);
  gl_FragColor = vec4(min(c * w, vec3(64.0)), 1.0);
}`;
const DOWN = /* glsl */`
uniform sampler2D tColor; uniform vec2 texel; varying vec2 vUv;
vec3 s(vec2 o) { return texture2D(tColor, vUv + o * texel).rgb; }
void main() {
  vec3 a = s(vec2(-2, 2)), b = s(vec2(0, 2)), c = s(vec2(2, 2));
  vec3 d = s(vec2(-2, 0)), e = s(vec2(0, 0)), f = s(vec2(2, 0));
  vec3 g = s(vec2(-2, -2)), h = s(vec2(0, -2)), i = s(vec2(2, -2));
  vec3 j = s(vec2(-1, 1)), k = s(vec2(1, 1)), l = s(vec2(-1, -1)), m = s(vec2(1, -1));
  vec3 o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  gl_FragColor = vec4(o, 1.0);
}`;
const UP = /* glsl */`
uniform sampler2D tColor, tPrev; uniform vec2 texel; uniform float radius; varying vec2 vUv;
vec3 s(vec2 o) { return texture2D(tColor, vUv + o * texel * radius).rgb; }
void main() {
  vec3 o = s(vec2(0, 0)) * 4.0 + (s(vec2(-1, 0)) + s(vec2(1, 0)) + s(vec2(0, -1)) + s(vec2(0, 1))) * 2.0
         + s(vec2(-1, -1)) + s(vec2(1, -1)) + s(vec2(-1, 1)) + s(vec2(1, 1));
  gl_FragColor = vec4(o / 16.0 + texture2D(tPrev, vUv).rgb, 1.0);
}`;

const FINAL = /* glsl */`
uniform sampler2D tColor, tBloom;
uniform float bloom, exposure, ca, vignette, grain, fade, frame, contrast, saturation, aspect;
uniform vec3 lift, gain;
varying vec2 vUv;

// AgX (Troy Sobotka), as fitted by Benjamin Wrensch; punchy look.
vec3 agxCurve(vec3 x) {
  vec3 x2 = x * x, x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
vec3 agx(vec3 c) {
  const mat3 inM = mat3(0.842479062253094, 0.0423282422610123, 0.0423756549057051,
                        0.0784335999999992, 0.878468636469772, 0.0784336,
                        0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  const mat3 outM = mat3(1.19687900512017, -0.0528968517574562, -0.0529716355144438,
                         -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
                         -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  c = inM * c;
  c = clamp(log2(max(c, 1e-10)), -12.47393, 4.026069);
  c = (c + 12.47393) / 16.49999;
  c = agxCurve(c);
  c = outM * c;
  return c; // already display-referred (approximately sRGB-encoded)
}
float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }

void main() {
  vec2 d = vUv - 0.5;
  vec3 col;
  col.r = texture2D(tColor, vUv - d * ca).r;
  col.g = texture2D(tColor, vUv).g;
  col.b = texture2D(tColor, vUv + d * ca).b;
  col += texture2D(tBloom, vUv).rgb * bloom;
  col *= exposure;
  col = agx(col);
  col = clamp(col, 0.0, 1.0);
  // grade in display space
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, saturation);
  col = (col - 0.5) * contrast + 0.5;
  col = col * gain + lift * (1.0 - col);
  float v = length(d * vec2(aspect, 1.0));
  col *= mix(1.0, smoothstep(1.05, 0.25, v), vignette);
  col = clamp(col, 0.0, 1.0);
  // film grain, strongest in the mid-tones; it also dithers the dark gradients
  float n = hash(vUv * vec2(1931.0, 1087.0) + frame * vec2(0.731, 0.317)) + hash(vUv * vec2(1213.0, 1709.0) - frame * 0.513) - 1.0;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col += n * grain * (0.35 + 0.65 * smoothstep(0.0, 0.25, lum) * (1.0 - 0.6 * lum));
  col *= 1.0 - fade;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class Lens {
  constructor(renderer, W, H) {
    this.renderer = renderer; this.W = W; this.H = H;
    // looks are tuned at 1080p; blur radii scale with the render size so a supersampled render matches
    this.px = H / 1080;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const depthTexture = new THREE.DepthTexture(W, H);
    depthTexture.type = THREE.UnsignedIntType;
    this.rtScene = target(W, H, { samples: 4, depthBuffer: true, depthTexture });
    const hw = W >> 1, hh = H >> 1;
    this.rtPrep = target(hw, hh);
    this.rtBlur = target(hw, hh);
    this.rtComp = target(W, H);
    this.levels = [];
    let w = hw, h = hh;
    for (let i = 0; i < 6; i++) { this.levels.push({ down: target(w, h), up: target(w, h), w, h }); w = Math.max(1, w >> 1); h = Math.max(1, h >> 1); }

    const dofU = () => ({ tDepth: { value: depthTexture }, near: { value: 0.1 }, far: { value: 100 }, focus: { value: 10 }, cocScale: { value: 0 }, maxCoc: { value: 12 } });
    this.prep = pass(PREP, { ...dofU(), tColor: { value: null } });
    this.gather = pass(GATHER, { tPrep: { value: this.rtPrep.texture }, texel: { value: new THREE.Vector2(1 / hw, 1 / hh) }, maxR: { value: 12 } });
    this.compose = pass(COMPOSE, { ...dofU(), tColor: { value: null }, tBlur: { value: this.rtBlur.texture } });
    this.copy = pass(COPY, { tColor: { value: null } });
    this.bright = pass(BRIGHT, { tColor: { value: null }, threshold: { value: 1.0 }, knee: { value: 0.5 } });
    this.down = pass(DOWN, { tColor: { value: null }, texel: { value: new THREE.Vector2() } });
    this.up = pass(UP, { tColor: { value: null }, tPrev: { value: null }, texel: { value: new THREE.Vector2() }, radius: { value: 1 } });
    this.final = pass(FINAL, {
      tColor: { value: null }, tBloom: { value: null }, bloom: { value: 0.1 }, exposure: { value: 1 }, ca: { value: 0.002 },
      vignette: { value: 0.35 }, grain: { value: 0.03 }, fade: { value: 0 }, frame: { value: 0 }, contrast: { value: 1 },
      saturation: { value: 1 }, aspect: { value: W / H }, lift: { value: new THREE.Vector3(0, 0, 0) }, gain: { value: new THREE.Vector3(1, 1, 1) },
    });
  }

  draw(p, rt) { this.renderer.setRenderTarget(rt); this.renderer.render(p.mesh, this.camera); }

  // look: { focus, aperture (CoC px at half res for an object at infinity), bloom, threshold, exposure, fade, grain, vignette, ca, ... }
  render(scene, camera, look, frame) {
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.clear();
    r.render(scene, camera);
    const color = this.rtScene.texture;

    let src = color;
    if (look.aperture > 0.05) {
      for (const p of [this.prep, this.compose]) {
        p.uniforms.near.value = camera.near; p.uniforms.far.value = camera.far;
        p.uniforms.focus.value = look.focus; p.uniforms.cocScale.value = look.aperture * this.px * (p === this.compose ? 2 : 1);
        p.uniforms.maxCoc.value = (look.maxCoc || 14) * this.px * (p === this.compose ? 2 : 1);
      }
      this.prep.uniforms.tColor.value = color;
      this.draw(this.prep, this.rtPrep);
      this.gather.uniforms.maxR.value = (look.maxCoc || 14) * this.px;
      this.draw(this.gather, this.rtBlur);
      this.compose.uniforms.tColor.value = color;
      this.draw(this.compose, this.rtComp);
      src = this.rtComp.texture;
    }

    // bloom chain
    this.bright.uniforms.tColor.value = src;
    this.bright.uniforms.threshold.value = look.threshold ?? 1.0;
    this.bright.uniforms.knee.value = look.knee ?? 0.6;
    this.draw(this.bright, this.levels[0].down);
    for (let i = 1; i < this.levels.length; i++) {
      const a = this.levels[i - 1], b = this.levels[i];
      this.down.uniforms.tColor.value = a.down.texture;
      this.down.uniforms.texel.value.set(1 / a.w, 1 / a.h);
      this.draw(this.down, b.down);
    }
    let prev = this.levels[this.levels.length - 1].down.texture;
    for (let i = this.levels.length - 2; i >= 0; i--) {
      const a = this.levels[i + 1], b = this.levels[i];
      this.up.uniforms.tColor.value = prev;
      this.up.uniforms.tPrev.value = b.down.texture;
      this.up.uniforms.texel.value.set(1 / a.w, 1 / a.h);
      this.up.uniforms.radius.value = look.bloomRadius ?? 1.0;
      this.draw(this.up, b.up);
      prev = b.up.texture;
    }

    const u = this.final.uniforms;
    u.tColor.value = src; u.tBloom.value = prev;
    u.bloom.value = look.bloom ?? 0.08; u.exposure.value = look.exposure ?? 1; u.ca.value = look.ca ?? 0.0018;
    u.vignette.value = look.vignette ?? 0.4; u.grain.value = (look.grain ?? 0.028) * Math.sqrt(this.px); u.fade.value = look.fade ?? 0;
    u.frame.value = frame; u.contrast.value = look.contrast ?? 1.0; u.saturation.value = look.saturation ?? 1.0;
    u.lift.value.set(...(look.lift || [0, 0, 0])); u.gain.value.set(...(look.gain || [1, 1, 1]));
    this.draw(this.final, null);
  }
}
