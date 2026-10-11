// geekslab.si — a small world where nature (left) and the future (right) meet.
// Dhaval's head floats in the middle, balanced between both: स्थितप्रज्ञ.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ------------------------------------------------------------------ setup */
const canvas = document.getElementById('world');
const isTouch = matchMedia('(pointer:coarse)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = Math.min(innerWidth, innerHeight) < 700;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.documentElement.classList.add('no-webgl');
  document.getElementById('loader').classList.add('done');
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

// seeded random so the world looks the same every visit
let seed = 20261011;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const rr = (a, b) => a + (b - a) * rnd();
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

/* ---------------------------------------------------- the world's layout */
const R = 74;                    // half-size of the populated world (a square; the ground runs on past it)
const HEAD_POS = new THREE.Vector3(3.5, 0, 1.5);
const HDA_POS = new THREE.Vector3(-13, 0, -7);
const POND = { x: -26, z: 6, r: 5.5 };
const ROAD = { cx: 22, cz: 2, rx: 11, rz: 8 };
const inIsland = (x, z, m = 2.5) => Math.abs(x) < R - m && Math.abs(z) < R - m;
const uTime = { value: 0 };
const anim = [];   // per-frame updaters

/* -------------------------------------------------------------- the sky */
const skyCanvas = document.createElement('canvas');
const skyTex = new THREE.CanvasTexture(skyCanvas);
skyTex.colorSpace = THREE.SRGBColorSpace;
scene.background = skyTex;
function paintSky() {
  const w = 1024, h = Math.max(256, Math.round(1024 * innerHeight / innerWidth));
  skyCanvas.width = w; skyCanvas.height = h;
  const g = skyCanvas.getContext('2d');
  const lin = g.createLinearGradient(0, 0, w, h * 0.35);
  lin.addColorStop(0, '#efe9d2'); lin.addColorStop(0.32, '#d3dcc3'); lin.addColorStop(0.5, '#8a93a3');
  lin.addColorStop(0.66, '#2e2f50'); lin.addColorStop(1, '#0f1020');
  g.fillStyle = lin; g.fillRect(0, 0, w, h);
  const sun = g.createRadialGradient(w * 0.06, h * 0.16, 0, w * 0.06, h * 0.16, w * 0.45);
  sun.addColorStop(0, 'rgba(255,248,226,.95)'); sun.addColorStop(1, 'rgba(255,248,226,0)');
  g.fillStyle = sun; g.fillRect(0, 0, w, h);
  const neb = g.createRadialGradient(w * 0.92, h * 0.12, 0, w * 0.92, h * 0.12, w * 0.4);
  neb.addColorStop(0, 'rgba(120,70,220,.45)'); neb.addColorStop(1, 'rgba(120,70,220,0)');
  g.fillStyle = neb; g.fillRect(0, 0, w, h);
  let s2 = 7;
  const r2 = () => ((s2 = (s2 * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    const x = w * (0.55 + 0.45 * r2()), y = h * r2() * 0.9;
    const a = Math.min(1, (x / w - 0.55) * 3) * (0.25 + 0.75 * r2());
    g.fillStyle = `rgba(220,230,255,${a})`;
    g.fillRect(x, y, r2() < 0.1 ? 2 : 1, r2() < 0.1 ? 2 : 1);
  }
  skyTex.needsUpdate = true;
}
paintSky();
document.getElementById('sky').style.display = 'none';
document.getElementById('stars').style.display = 'none';

/* ------------------------------------------------------------- camera */
const ELEV = THREE.MathUtils.degToRad(33);
const camDist = 120;
const camOffset = new THREE.Vector3(0, Math.sin(ELEV) * camDist, Math.cos(ELEV) * camDist);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 400);
const target = new THREE.Vector3(1, 0, 2);
const view = { size: 44, zoom: 1, zoomGoal: 1 };
function fitView() {
  const a = innerWidth / innerHeight;
  view.size = a >= 1 ? 46 : Math.min(78, 30 / a);
  const h = view.size / view.zoom / 2, w = h * a;
  camera.left = -w; camera.right = w; camera.top = h; camera.bottom = -h;
  camera.updateProjectionMatrix();
}
fitView();
function minZoom() {
  const a = innerWidth / innerHeight, hh = view.size / 2;
  return Math.max((hh * a) / (R - 1), hh / Math.sin(ELEV) / (R - 1));
}
function placeCamera() {
  camera.position.copy(target).add(camOffset);
  camera.lookAt(target);
}
placeCamera();

/* -------------------------------------------------------------- lights */
const hemi = new THREE.HemisphereLight(0xfff6e0, 0x3b3550, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d6, 2.0);
const SUN_OFFSET = new THREE.Vector3(-38, 60, 30);
sun.position.copy(SUN_OFFSET);
sun.castShadow = true;
sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -52, right: 52, top: 52, bottom: -52, near: 10, far: 160 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
scene.add(sun); scene.add(sun.target);
const neonA = new THREE.PointLight(0x41f0e2, 60, 40, 1.6); neonA.position.set(20, 7, 4); scene.add(neonA);
const neonB = new THREE.PointLight(0xff4fb3, 40, 36, 1.6); neonB.position.set(30, 6, -8); scene.add(neonB);

/* -------------------------------------------------------- shader bits */
const NOISE = /* glsl */`
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x), u.y); }
float h31(vec3 p){ p = fract(p*0.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
`;
// the line where nature becomes future, shared by every shader that cares
const SPLIT = /* glsl */`
float splitT(vec3 w){
  float n = vnoise(w.xz*0.16)*2.0 + vnoise(w.xz*0.55)*0.7;
  return smoothstep(-1.2, 1.2, w.x - 3.5 + (n-1.35)*3.2);
}`;

function worldShader(mat, inject) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvW = (modelMatrix*vec4(transformed,1.0)).xyz; vWN = normalize(mat3(modelMatrix)*objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vW; varying vec3 vWN; uniform float uTime;\n' + NOISE + SPLIT)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + (inject.color || ''))
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + (inject.rough || ''))
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + (inject.emissive || ''));
  };
  return mat;
}

/* ----------------------------------------------------------- the island */
const island = new THREE.Group();
scene.add(island);
{
  const geo = new THREE.PlaneGeometry(R * 6, R * 6);
  geo.rotateX(-Math.PI / 2);
  const mat = worldShader(new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 }), {
    color: /* glsl */`
      float t = splitT(vW);
      float up = step(0.5, vWN.y);
      vec3 grass = mix(vec3(.40,.58,.27), vec3(.56,.68,.31), vnoise(vW.xz*0.3));
      grass = mix(grass, vec3(.30,.47,.22), smoothstep(.55,.9,vnoise(vW.xz*1.1))*.6);
      grass = mix(grass, vec3(.74,.70,.48), smoothstep(.78,.95,vnoise(vW.xz*0.22+7.))*.5);
      vec3 tech = vec3(.028,.03,.05) + vnoise(vW.xz*0.4)*0.018;
      vec2 pnl = abs(fract(vW.xz/6.0)-.5);
      tech += 0.018*step(.47, max(pnl.x,pnl.y));
      // sides: layered soil on the nature side, dark steel plates on the future side
      float layer = vnoise(vec2(vW.x*0.25+vW.z*0.25, vW.y*1.7));
      vec3 soil = mix(vec3(.36,.25,.16), vec3(.48,.34,.22), layer);
      soil = mix(vec3(.30,.47,.22), soil, smoothstep(-0.25,-0.6,vW.y));
      soil = mix(soil, vec3(.27,.26,.27), smoothstep(-3.0,-4.6,vW.y + layer));
      vec3 steel = vec3(.10,.11,.16) + 0.05*step(.95, fract(vW.y*0.9));
      vec3 top = mix(grass, tech, t);
      vec3 side = mix(soil, steel, t);
      diffuseColor.rgb = mix(side, top, up);
    `,
    rough: `roughnessFactor = mix(0.95, 0.62, splitT(vW));`,
    emissive: /* glsl */`
      { float t = splitT(vW); float up = step(0.5, vWN.y);
        vec2 g = abs(fract(vW.xz/3.0 - 0.5) - 0.5)*3.0;
        float line = 1.0 - smoothstep(0.0, 0.05, min(g.x, g.y));
        float pulse = 0.55 + 0.45*sin(uTime*1.3 - length(vW.xz - vec2(22.,2.))*0.35);
        totalEmissiveRadiance += vec3(.15,.85,.82) * line * t * up * 0.55 * pulse;
        float band = 1.0 - abs(t-0.5)*2.0;
        totalEmissiveRadiance += vec3(1.0,.78,.35) * pow(band,6.0) * up * 0.28;
        float rim = (1.0-up) * step(0.93, fract(vW.y*0.5+0.05)) * t;
        totalEmissiveRadiance += vec3(.3,1.,.95) * rim * 0.8; }
    `,
  });
  const ground = new THREE.Mesh(geo, mat);
  ground.receiveShadow = true;
  ground.name = 'ground';
  island.add(ground);
}

/* --------------------------------------------------------- materials */
const M = {
  trunk: new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 1, flatShading: true }),
  leaf: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }),
  rock: new THREE.MeshStandardMaterial({ color: 0x9a978c, roughness: 1, flatShading: true }),
  wood: new THREE.MeshStandardMaterial({ color: 0xa8784e, roughness: 0.9, flatShading: true }),
  woodDark: new THREE.MeshStandardMaterial({ color: 0x6e4b30, roughness: 0.9, flatShading: true }),
  cream: new THREE.MeshStandardMaterial({ color: 0xf1e9d6, roughness: 0.8, flatShading: true }),
  white: new THREE.MeshStandardMaterial({ color: 0xe2ddd3, roughness: 0.7 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x2a2e3d, roughness: 0.35, metalness: 0.7 }),
  steelLight: new THREE.MeshStandardMaterial({ color: 0x8e96aa, roughness: 0.3, metalness: 0.85 }),
  black: new THREE.MeshStandardMaterial({ color: 0x0b0c12, roughness: 0.4, metalness: 0.4 }),
  glassDark: new THREE.MeshStandardMaterial({ color: 0x0c1830, roughness: 0.1, metalness: 0.9 }),
  neon: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x41f0e2, emissiveIntensity: 3.2 }),
  neonPink: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff4fb3, emissiveIntensity: 3.0 }),
  neonRed: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff3040, emissiveIntensity: 3.0 }),
  warm: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc77a, emissiveIntensity: 1.8 }),
  water: new THREE.MeshStandardMaterial({ color: 0x5fa9b5, roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.88 }),
  solar: new THREE.MeshStandardMaterial({ color: 0x1b2d6b, roughness: 0.2, metalness: 0.8 }),
  hda: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa36b, emissiveIntensity: 2.2 }),
};
function shadowed(o, cast = true, recv = true) { o.traverse((c) => { if (c.isMesh) { c.castShadow = cast; c.receiveShadow = recv; } }); return o; }
function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; }

/* hover targets & labels */
const hoverables = [];        // { obj, tag, side, onClick }
const labelsEl = document.getElementById('labels');
function addTag(obj, title, sub, side, anchorY, onClick) {
  const el = document.createElement('div');
  el.className = `tag ${side}`;
  el.innerHTML = `${title}${sub ? `<small>${sub}</small>` : ''}`;
  labelsEl.appendChild(el);
  const entry = { obj, el, side, anchor: new THREE.Vector3(0, anchorY, 0), onClick };
  obj.traverse((c) => { c.userData.hover = entry; });
  hoverables.push(entry);
  return entry;
}

/* --------------------------------------------------- nature: trees etc */
function sway(mat, amount = 0.05) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float ph = ip.x*0.37 + ip.z*0.21;
          transformed.x += sin(uTime*1.2 + ph) * ${amount.toFixed(3)} * (position.y + 1.0);
          transformed.z += cos(uTime*0.9 + ph) * ${(amount * 0.6).toFixed(3)} * (position.y + 1.0);
        #endif`);
  };
  return mat;
}
const leafMat = sway(M.leaf.clone(), 0.045);
const natureSpots = [];
function natureFree(x, z, r) {
  if (!inIsland(x, z, 3 + r)) return false;
  if (x > 0.5) return false;
  if (Math.hypot(x - HDA_POS.x, z - HDA_POS.z) < 8.5 + r) return false;
  if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 1 + r) return false;
  if (Math.hypot(x - HEAD_POS.x, z - HEAD_POS.z) < 6 + r) return false;
  for (const s of natureSpots) if (Math.hypot(x - s.x, z - s.z) < s.r + r) return false;
  return true;
}
function reserve(x, z, r) { natureSpots.push({ x, z, r }); }
// keep space for the cabin, windmill, giraffe walk and the path
reserve(-21, 17, 5); reserve(-31, -4, 4); reserve(-12, 13, 7.5); reserve(-44, -24, 8.5); reserve(-52, 34, 4); reserve(-58, -48, 5);

{ // trees
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1, 6); trunkGeo.translate(0, 0.5, 0);
  const roundGeo = new THREE.IcosahedronGeometry(1, 0);
  const pineGeo = new THREE.ConeGeometry(1, 2.2, 7); pineGeo.translate(0, 1.1, 0);
  const trees = [];
  for (let i = 0; i < 9000 && trees.length < 330; i++) {
    const x = rr(-R, 1), z = rr(-R, R);
    const s = rr(0.8, 1.6);
    if (!natureFree(x, z, 1.2 * s)) continue;
    reserve(x, z, 1.3 * s);
    trees.push({ x, z, s, type: rnd() < 0.3 ? 'pine' : 'round' });
  }
  const trunk = new THREE.InstancedMesh(trunkGeo, M.trunk, trees.length);
  const canopyRound = new THREE.InstancedMesh(roundGeo, leafMat, trees.length * 2);
  const canopyPine = new THREE.InstancedMesh(pineGeo, leafMat, trees.length * 2);
  const greens = [0x4f8a3c, 0x6a9b45, 0x3f7a3a, 0x88a94a, 0x5d9150, 0x7fb069];
  const blossom = [0xf2a7b8, 0xf6c66b];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  let nr = 0, np = 0;
  trees.forEach((t, i) => {
    const th = (t.type === 'pine' ? 1.1 : 1.6) * t.s;
    m4.compose(new THREE.Vector3(t.x, 0, t.z), q.identity(), new THREE.Vector3(t.s, th, t.s));
    trunk.setMatrixAt(i, m4);
    if (t.type === 'round') {
      const col = rnd() < 0.1 ? pick(blossom) : pick(greens);
      for (let k = 0; k < 2; k++) {
        const r = t.s * (k ? 0.85 : 1.25);
        q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3));
        m4.compose(new THREE.Vector3(t.x + rr(-0.3, 0.3) * k, th + r * 0.6 + k * r * 0.9, t.z + rr(-0.3, 0.3) * k), q, new THREE.Vector3(r, r * 0.95, r));
        canopyRound.setMatrixAt(nr, m4); canopyRound.setColorAt(nr++, c.set(col).offsetHSL(0, 0, rr(-0.04, 0.04)));
      }
    } else {
      const col = pick([0x2f6b3f, 0x3d7a48, 0x2b5e3a]);
      for (let k = 0; k < 2; k++) {
        const r = t.s * (k ? 0.7 : 1.05);
        m4.compose(new THREE.Vector3(t.x, th + k * 1.3 * t.s, t.z), q.identity(), new THREE.Vector3(r, r, r));
        canopyPine.setMatrixAt(np, m4); canopyPine.setColorAt(np++, c.set(col));
      }
    }
  });
  canopyRound.count = nr; canopyPine.count = np;
  [trunk, canopyRound, canopyPine].forEach((m) => { m.castShadow = true; m.receiveShadow = true; island.add(m); });
}

{ // rocks, grass tufts, flowers
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(rockGeo, M.rock, 120);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  let n = 0;
  for (let i = 0; i < 3000 && n < 120; i++) {
    const x = rr(-R, 0), z = rr(-R, R), s = rr(0.3, 1.1);
    if (!natureFree(x, z, s)) continue;
    q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3));
    m4.compose(new THREE.Vector3(x, s * 0.25, z), q, new THREE.Vector3(s, s * 0.6, s * 0.9));
    rocks.setMatrixAt(n++, m4);
  }
  rocks.count = n; shadowed(rocks); island.add(rocks);

  const tuftGeo = new THREE.ConeGeometry(0.12, 0.6, 4); tuftGeo.translate(0, 0.3, 0);
  const tuftMat = sway(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true }), 0.12);
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, 3200);
  const c = new THREE.Color();
  n = 0;
  for (let i = 0; i < 30000 && n < 3200; i++) {
    const x = rr(-R, 3), z = rr(-R, R);
    if (!inIsland(x, z, 1)) continue;
    if (x > -1 + Math.sin(z * 0.3) * 2) continue;
    if (Math.hypot(x - POND.x, z - POND.z) < POND.r) continue;
    if (Math.hypot(x - HDA_POS.x, z - HDA_POS.z) < 6) continue;
    const s = rr(0.6, 1.4);
    q.setFromEuler(new THREE.Euler(rr(-0.25, 0.25), rnd() * 6, rr(-0.25, 0.25)));
    m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
    tufts.setMatrixAt(n, m4); tufts.setColorAt(n++, c.set(pick([0x5a8f3e, 0x6fa04a, 0x87b356, 0x4d7f37])));
  }
  tufts.count = n; tufts.receiveShadow = true; island.add(tufts);

  // flowers: stem + head
  const fGeo = new THREE.IcosahedronGeometry(0.16, 0); fGeo.translate(0, 0.55, 0);
  const sGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.55, 3); sGeo.translate(0, 0.27, 0);
  const flowers = new THREE.InstancedMesh(fGeo, sway(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, flatShading: true }), 0.1), 800);
  const stems = new THREE.InstancedMesh(sGeo, sway(new THREE.MeshStandardMaterial({ color: 0x4d7f37 }), 0.1), 800);
  n = 0;
  for (let i = 0; i < 12000 && n < 800; i++) {
    // flowers grow in little patches
    const cx = rr(-R, -2), cz = rr(-R, R);
    if (!natureFree(cx, cz, 0.3)) continue;
    const col = pick([0xf6e05e, 0xf28fb0, 0xffffff, 0xb79cf2, 0xff9a5c]);
    for (let k = 0; k < 6 && n < 800; k++) {
      const x = cx + rr(-1.2, 1.2), z = cz + rr(-1.2, 1.2), s = rr(0.7, 1.3);
      m4.compose(new THREE.Vector3(x, 0, z), q.identity(), new THREE.Vector3(s, s, s));
      flowers.setMatrixAt(n, m4); flowers.setColorAt(n, c.set(col)); stems.setMatrixAt(n++, m4);
    }
  }
  flowers.count = n; stems.count = n; island.add(flowers, stems);
}

{ // pond with lily pads and ripples
  const shape = new THREE.Shape();
  for (let i = 0; i <= 24; i++) {
    const a = i / 24 * Math.PI * 2, r = POND.r * (0.85 + 0.2 * Math.sin(a * 3 + 1) * Math.cos(a * 2));
    const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.8;
    i ? shape.lineTo(x, y) : shape.moveTo(x, y);
  }
  const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2);
  const water = mesh(g, M.water, POND.x, 0.04, POND.z); water.receiveShadow = true; island.add(water);
  const bank = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x7c6a4c, roughness: 1 }));
  bank.scale.set(1.12, 1, 1.12); bank.position.set(POND.x, 0.02, POND.z); island.add(bank);
  const padGeo = new THREE.CircleGeometry(0.45, 8, 0.3, Math.PI * 1.8); padGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < 7; i++) island.add(mesh(padGeo, new THREE.MeshStandardMaterial({ color: 0x4f8f45 }), POND.x + rr(-3, 3), 0.07, POND.z + rr(-2.5, 2.5)));
  const ripples = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 }));
    r.position.set(POND.x + 1, 0.08, POND.z - 0.5); r.userData.phase = i / 3; island.add(r); ripples.push(r);
  }
  anim.push((t) => ripples.forEach((r) => { const p = (t * 0.25 + r.userData.phase) % 1; r.scale.setScalar(0.3 + p * 3); r.material.opacity = 0.45 * (1 - p); }));
}

/* the dirt path from the academy to the centre */
function ribbon(points, width, mat, y = 0.03, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.5);
  const N = 160, pos = [], uv = [], idx = [];
  const len = curve.getLength();
  for (let i = 0; i <= N; i++) {
    const u = i / N, p = curve.getPointAt(u % 1), tg = curve.getTangentAt(u % 1);
    const side = new THREE.Vector3(-tg.z, 0, tg.x).normalize().multiplyScalar(width / 2);
    pos.push(p.x + side.x, y, p.z + side.z, p.x - side.x, y, p.z - side.z);
    uv.push(0, u * len, 1, u * len);
    if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  mat.side = THREE.DoubleSide;
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true;
  return { mesh: m, curve };
}
{
  const pathMat = new THREE.MeshStandardMaterial({ color: 0xc8b48a, roughness: 1 });
  const p = ribbon([
    new THREE.Vector3(HDA_POS.x + 4, 0, HDA_POS.z + 5),
    new THREE.Vector3(-7, 0, 3), new THREE.Vector3(-3, 0, 4.5), new THREE.Vector3(HEAD_POS.x - 3.5, 0, HEAD_POS.z + 1.5),
  ], 1.6, pathMat, 0.025);
  island.add(p.mesh);
  // stepping stones toward the cabin
  for (let i = 0; i < 9; i++) {
    const t = i / 8, x = THREE.MathUtils.lerp(-8, -19, t), z = THREE.MathUtils.lerp(4, 14.5, t) + Math.sin(t * 5) * 0.8;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.12, 7), M.rock);
    s.position.set(x, 0.05, z); s.receiveShadow = true; island.add(s);
  }
}

/* --------------------------------------------- analog: cabin & windmill */
{
  const cabin = new THREE.Group();
  cabin.add(mesh(new THREE.BoxGeometry(4, 2.4, 3.2), M.wood, 0, 1.2, 0));
  const roofShape = new THREE.Shape([new THREE.Vector2(-2.5, 0), new THREE.Vector2(2.5, 0), new THREE.Vector2(0, 1.8)]);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 3.8, bevelEnabled: false }), M.woodDark);
  roof.position.set(0, 2.4, -1.9); cabin.add(roof);
  cabin.add(mesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), M.rock, 1.1, 3.6, -0.6));
  const win = mesh(new THREE.PlaneGeometry(0.9, 0.7), M.warm, -0.9, 1.4, 1.61); cabin.add(win);
  cabin.add(mesh(new THREE.PlaneGeometry(0.8, 1.5), M.woodDark, 0.8, 0.75, 1.61));
  // a little gramophone on the porch: the analog world
  const gram = new THREE.Group();
  gram.add(mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), M.woodDark, 0, 0.15, 0));
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xd4a24c, metalness: 0.8, roughness: 0.3, side: THREE.DoubleSide }));
  horn.rotation.z = -Math.PI / 2.6; horn.position.set(0.25, 0.65, 0); gram.add(horn);
  gram.position.set(2.6, 0, 1.6); cabin.add(gram);
  cabin.position.set(-21, 0, 17); cabin.rotation.y = 0.5;
  shadowed(cabin); island.add(cabin);
  addTag(cabin, 'The analog cabin', 'wood, paper, vinyl', 'nature', 4.5);
  // smoke puffs
  const puffs = [];
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, flatShading: true }));
    p.userData.ph = i / 5; island.add(p); puffs.push(p);
  }
  const chim = new THREE.Vector3(1.1, 4.4, -0.6).applyEuler(cabin.rotation).add(cabin.position);
  anim.push((t) => puffs.forEach((p) => { const k = (t * 0.18 + p.userData.ph) % 1; p.position.set(chim.x + k * 1.6, chim.y + k * 3.5, chim.z - k * 0.6); p.scale.setScalar(0.5 + k * 1.6); p.material.opacity = 0.55 * (1 - k); }));

  const mill = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.6, 6.5, 8), M.cream); tower.position.y = 3.25; mill.add(tower);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.4, 8), M.woodDark); cap.position.y = 7.2; mill.add(cap);
  const hub = new THREE.Group(); hub.position.set(0, 6.4, 1.05); mill.add(hub);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2;
    arm.add(mesh(new THREE.BoxGeometry(0.15, 3.6, 0.08), M.woodDark, 0, 1.9, 0));
    arm.add(mesh(new THREE.BoxGeometry(0.85, 2.8, 0.04), M.cream, 0.45, 2.2, 0.02));
    hub.add(arm);
  }
  mill.position.set(-31, 0, -4); mill.rotation.y = 0.6;
  shadowed(mill); island.add(mill);
  addTag(mill, 'Windmill', 'energy, the old way', 'nature', 8.5);
  anim.push((t, dt) => { hub.rotation.z -= dt * 0.6; });
  // a second windmill and cabin further out in the countryside
  const cleanClone = (o) => { const saved = []; o.traverse((c) => { saved.push([c, c.userData]); c.userData = {}; }); const k = o.clone(); saved.forEach(([c, d]) => (c.userData = d)); return k; };
  const mill2 = cleanClone(mill); mill2.position.set(-52, 0, 34); mill2.rotation.y = 0.2; island.add(mill2);
  const hub2 = mill2.children[2];
  anim.push((t, dt) => { hub2.rotation.z -= dt * 0.45; });
  addTag(mill2, 'Windmill', 'grinding grain since 1890', 'nature', 8.5);
  const cabin2 = cleanClone(cabin); cabin2.position.set(-58, 0, -48); cabin2.rotation.y = -0.4; island.add(cabin2);
  addTag(cabin2, 'Reading cabin', 'books, no Wi-Fi', 'nature', 4.5);
}

/* -------------------------------------------------------------- giraffes */
function spotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#e8b15a'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#8a4f22';
  let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 60; i++) {
    const x = r() * 256, y = r() * 256, rad = 10 + r() * 14;
    g.beginPath();
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, rr2 = rad * (0.7 + r() * 0.4); g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
    g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function makeGiraffe(robot) {
  const g = new THREE.Group();
  const skin = robot
    ? new THREE.MeshStandardMaterial({ color: 0xb8c0d4, metalness: 0.85, roughness: 0.28, flatShading: true })
    : new THREE.MeshStandardMaterial({ map: spotTexture(), roughness: 0.85, flatShading: true });
  const joint = robot ? M.neon : skin;
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), skin);
  body.scale.set(1.55, 0.95, 0.85); body.position.y = 3.3; g.add(body);
  const legs = [];
  [[0.95, 0.45], [0.95, -0.45], [-0.95, 0.45], [-0.95, -0.45]].forEach(([x, z], i) => {
    const pivot = new THREE.Group(); pivot.position.set(x, 3.1, z);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.11, 3.1, 6), skin); leg.position.y = -1.55; pivot.add(leg);
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.2, 6), robot ? M.steel : M.woodDark); hoof.position.y = -3.05; pivot.add(hoof);
    if (robot) { const j = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), joint); pivot.add(j); const k = j.clone(); k.position.y = -1.6; k.scale.setScalar(0.7); pivot.add(k); }
    pivot.userData.ph = i === 0 || i === 3 ? 0 : Math.PI;
    g.add(pivot); legs.push(pivot);
  });
  const neck = new THREE.Group(); neck.position.set(1.2, 3.7, 0); neck.rotation.z = -0.42; g.add(neck);
  const nk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.36, 3.3, 7), skin); nk.position.y = 1.6; neck.add(nk);
  const head = new THREE.Group(); head.position.y = 3.3; head.rotation.z = 0.42 + 0.95; neck.add(head);
  const hd = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.05, 0.42), skin); hd.position.y = 0.35; head.add(hd);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.4, 0.36), skin); snout.position.y = 0.95; head.add(snout);
  [0.13, -0.13].forEach((z) => {
    const oss = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.4, 5), robot ? M.steel : M.woodDark);
    oss.position.set(-0.2, 0.0, z); oss.rotation.z = 1.2; head.add(oss);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), robot ? M.neonPink : M.woodDark); tip.position.set(-0.38, -0.07, z); head.add(tip);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), robot ? M.neon : M.black); eye.position.set(0.12, 0.45, z * 1.7); head.add(eye);
  });
  if (robot) {
    for (let i = 0; i < 5; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.29 - i * 0.022, 0.025, 4, 16), M.neon); ring.rotation.x = Math.PI / 2; ring.position.y = 0.4 + i * 0.6; neck.add(ring); }
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.9), M.neon); panel.position.set(0, 4.22, 0); g.add(panel);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.02, 1.2, 4), skin); tail.position.set(-1.6, 3.0, 0); tail.rotation.z = -0.3; g.add(tail);
  g.scale.setScalar(0.9);
  shadowed(g);
  return {
    group: g,
    update(t, speed) {
      legs.forEach((l) => { l.rotation.z = Math.sin(t * speed * 4 + l.userData.ph) * 0.32; });
      neck.rotation.z = -0.42 + Math.sin(t * speed * 4) * 0.05;
      body.position.y = 3.3 + Math.abs(Math.sin(t * speed * 4)) * 0.05;
      tail.rotation.x = Math.sin(t * 3) * 0.3;
    },
  };
}
function walker(creature, cx, cz, rx, rz, speed, label) {
  island.add(creature.group);
  let a = rnd() * 6;
  let pause = 0;
  anim.push((t, dt) => {
    pause -= dt;
    const moving = pause <= 0;
    if (moving) { a += dt * speed; if (rnd() < 0.002) pause = rr(2, 4); }
    const x = cx + Math.cos(a) * rx, z = cz + Math.sin(a) * rz;
    const dx = -Math.sin(a) * rx, dz = Math.cos(a) * rz;
    creature.group.position.set(x, 0, z);
    creature.group.rotation.y = Math.atan2(-dz, dx);
    creature.update(moving ? t : 0, moving ? 1 : 0);
  });
  addTag(creature.group, label[0], label[1], label[2], 6.3);
}
walker(makeGiraffe(false), -12, 13, 5.5, 3.2, 0.12, ['Giraffe', 'grazing since forever', 'nature']);
walker(makeGiraffe(true), 13, -14, 5, 2.6, -0.16, ['Robo-giraffe', 'firmware v2.6', 'future']);
walker(makeGiraffe(false), -44, -24, 6, 3.5, 0.1, ['Giraffe', 'a slow afternoon', 'nature']);
walker(makeGiraffe(true), 45, 30, 5, 3, 0.14, ['Robo-giraffe', 'firmware v3.1', 'future']);
walker(makeGiraffe(true), 40, -40, 4.5, 2.5, -0.13, ['Robo-giraffe', 'charging soon', 'future']);

/* ---------------------------------------------------------- future side */
const blinkers = []; // instanced LEDs that blink
function ledGrid(w, h, cols, rows, colors) {
  const g = new THREE.BoxGeometry(w / cols * 0.55, h / rows * 0.45, 0.05);
  const im = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), cols * rows);
  const m4 = new THREE.Matrix4(), c = new THREE.Color();
  let k = 0;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    m4.makeTranslation(-w / 2 + (i + 0.5) * w / cols, -h / 2 + (j + 0.5) * h / rows, 0);
    im.setMatrixAt(k, m4); im.setColorAt(k++, c.set(pick(colors)).multiplyScalar(rnd() < 0.6 ? 2.2 : 0.15));
  }
  im.userData.colors = colors;
  blinkers.push(im);
  return im;
}

{ // the main data centre, inside the road loop
  const dc = new THREE.Group();
  dc.add(mesh(new THREE.BoxGeometry(8, 4.2, 5.5), M.steel, 0, 2.1, 0));
  dc.add(mesh(new THREE.BoxGeometry(8.3, 0.25, 5.8), M.black, 0, 4.25, 0));
  for (let i = 0; i < 5; i++) dc.add(mesh(new THREE.BoxGeometry(0.08, 3.6, 0.08), M.neon, -3.6 + i * 1.8, 2.1, 2.78));
  const front = ledGrid(6.8, 2.6, 16, 7, [0x41f0e2, 0x41f0e2, 0x7cff6b, 0xff4fb3]);
  front.position.set(0, 2.2, 2.78); dc.add(front);
  const side = ledGrid(4.4, 2.6, 10, 7, [0x41f0e2, 0xffd34f]);
  side.position.set(4.03, 2.2, 0); side.rotation.y = Math.PI / 2; dc.add(side);
  const fans = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Group(); f.position.set(-2.6 + i * 2.6, 4.45, -0.8);
    f.add(mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.3, 16), M.black));
    const blades = new THREE.Group(); blades.position.y = 0.18;
    for (let b = 0; b < 4; b++) { const bl = mesh(new THREE.BoxGeometry(1.5, 0.04, 0.22), M.steelLight); bl.rotation.y = b * Math.PI / 4; blades.add(bl); }
    f.add(blades); fans.push(blades); dc.add(f);
  }
  const ant = mesh(new THREE.CylinderGeometry(0.05, 0.08, 3.2, 5), M.steelLight, 3, 5.9, -1.8); dc.add(ant);
  const beacon = mesh(new THREE.SphereGeometry(0.16, 8, 6), M.neonRed.clone(), 3, 7.55, -1.8); dc.add(beacon);
  dc.position.set(ROAD.cx, 0, ROAD.cz); dc.rotation.y = 0;
  shadowed(dc); island.add(dc);
  addTag(dc, 'Data centre', 'where the thinking happens', 'future', 8);
  anim.push((t, dt) => { fans.forEach((f, i) => (f.rotation.y += dt * (5 + i))); beacon.material.emissiveIntensity = (Math.sin(t * 4) > 0.6) ? 6 : 0.2; });
}

function smartHome(x, z, rot, hue) {
  const h = new THREE.Group();
  h.add(mesh(new THREE.BoxGeometry(3.4, 2.2, 2.8), M.white, 0, 1.1, 0));
  h.add(mesh(new THREE.BoxGeometry(3.6, 0.18, 3.0), M.black, 0, 2.29, 0));
  const glass = mesh(new THREE.BoxGeometry(2.2, 0.9, 0.05), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: hue, emissiveIntensity: 1.4 }), -0.3, 1.3, 1.41); h.add(glass);
  h.add(mesh(new THREE.BoxGeometry(3.42, 0.06, 0.06), M.neon, 0, 0.15, 1.41));
  const panel = mesh(new THREE.BoxGeometry(2.4, 0.06, 1.5), M.solar, -0.2, 2.75, -0.2); panel.rotation.x = -0.35; h.add(panel);
  // the tiny data centre at home
  const rack = new THREE.Group(); rack.position.set(2.35, 0, 0.6);
  rack.add(mesh(new THREE.BoxGeometry(0.9, 1.9, 0.9), M.black, 0, 0.95, 0));
  const leds = ledGrid(0.6, 1.4, 3, 9, [0x41f0e2, 0x7cff6b, 0xffd34f]); leds.position.set(0, 1.0, 0.46); rack.add(leds);
  h.add(rack);
  const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(1.9, 0.3, 0.6), new THREE.Vector3(1.75, 0.02, 0.6), new THREE.Vector3(1.7, 1.5, 0.6)), 8, 0.04, 4), M.neon);
  h.add(cable);
  h.position.set(x, 0, z); h.rotation.y = rot;
  shadowed(h); island.add(h);
  addTag(h, 'Home data centre', 'a tiny rack next to every home', 'future', 3.6);
  return h;
}
smartHome(9, 15, -0.3, 0xff4fb3);
smartHome(25, 14.5, 0.2, 0x41f0e2);
smartHome(36.5, 1, Math.PI / 2 - 0.1, 0x9b7bff);
smartHome(22, -12, Math.PI, 0xffd34f);
const EXTRA_HOMES = [[48, -30, 0.4, 0x41f0e2], [56, 22, -0.2, 0xff4fb3], [40, 44, 0.1, 0x9b7bff], [28, -46, 0.6, 0x7cff6b], [62, -6, -0.5, 0xffd34f], [16, 40, 0.2, 0x41f0e2], [60, 52, 0.3, 0xff4fb3], [52, -56, -0.3, 0x9b7bff]];
EXTRA_HOMES.forEach(([x, z, r, c]) => smartHome(x, z, r, c));

{ // energy pylons along the back edge with glowing cables
  const pts = [[14, -24], [22, -18], [30, -11], [37, -4]];
  const tops = [];
  pts.forEach(([x, z]) => {
    const p = new THREE.Group();
    p.add(mesh(new THREE.CylinderGeometry(0.12, 0.25, 7, 4), M.steelLight, 0, 3.5, 0));
    p.add(mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), M.steelLight, 0, 6.6, 0));
    p.position.set(x, 0, z); p.rotation.y = -0.8; shadowed(p); island.add(p);
    tops.push(new THREE.Vector3(x, 6.6, z));
  });
  for (let i = 0; i < tops.length - 1; i++) {
    const a = tops[i], b = tops[i + 1], mid = a.clone().lerp(b, 0.5); mid.y -= 1.2;
    island.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 16, 0.035, 4), M.neon));
  }
}

{ // hologram billboard
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const msgs = ['AI, in ગુજરાતી', 'geekslab.si', 'build · learn · balance', 'સ્થિતપ્રજ્ઞ'];
  let mi = 0;
  function draw(t) {
    g.clearRect(0, 0, 512, 256);
    g.fillStyle = 'rgba(10,20,40,0.55)'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = 'rgba(79,245,232,.9)'; g.lineWidth = 4; g.strokeRect(6, 6, 500, 244);
    for (let y = 0; y < 256; y += 6) { g.fillStyle = `rgba(79,245,232,${0.05 + 0.04 * Math.sin(y * 0.2 + t * 6)})`; g.fillRect(0, y, 512, 2); }
    g.fillStyle = '#e8fffd'; g.font = '600 58px "Chakra Petch", "Noto Sans Gujarati", "Shruti", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#41f0e2'; g.shadowBlur = 18;
    g.fillText(msgs[mi], 256, 128); g.shadowBlur = 0;
    tex.needsUpdate = true;
  }
  draw(0);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false, opacity: 0.92 }));
  board.position.set(33, 6.2, 9.5); board.rotation.y = -0.15;
  island.add(board);
  island.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 4.7, 6), M.steel, 33, 2.35, 9.4));
  addTag(board, 'Hologram', 'tech, explained in Gujarati', 'future', 1.8);
  let last = 0;
  anim.push((t) => { if (t - last > 3.2) { last = t; mi = (mi + 1) % msgs.length; } if (Math.floor(t * 20) % 2 === 0) draw(t); });
}

{ // light trees: the future's version of a forest, plus street lamps and server cubes
  const taken = [{ x: ROAD.cx, z: ROAD.cz, r: ROAD.rx + 2.5 }, { x: 9, z: 15, r: 3.5 }, { x: 25, z: 14.5, r: 3.5 }, { x: 36.5, z: 1, r: 3.5 }, { x: 22, z: -12, r: 3.5 }, { x: 13, z: -14, r: 7 }, { x: 33, z: 9.5, r: 3.5 }, { x: HEAD_POS.x, z: HEAD_POS.z, r: 6 }, { x: 45, z: 30, r: 7 }, { x: 40, z: -40, r: 7 }, ...EXTRA_HOMES.map(([x, z]) => ({ x, z, r: 3.5 }))];
  const free = (x, z, r) => inIsland(x, z, 2 + r) && x > 6 + Math.sin(z * 0.3) * 2 && taken.every((t) => Math.hypot(x - t.x, z - t.z) > t.r + r);
  const coneGeo = new THREE.ConeGeometry(0.8, 2.6, 4, 1); coneGeo.translate(0, 1.7, 0);
  const stemGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.6, 4); stemGeo.translate(0, 0.3, 0);
  const lt = new THREE.InstancedMesh(coneGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.35, flatShading: true, transparent: true, opacity: 0.85 }), 170);
  const st = new THREE.InstancedMesh(stemGeo, M.steelLight, 170);
  const wire = new THREE.InstancedMesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, toneMapped: false }), 170);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  let n = 0;
  for (let i = 0; i < 9000 && n < 165; i++) {
    const x = rr(4, R), z = rr(-R, R), s = rr(0.55, 1.1);
    if (!free(x, z, 1.1 * s)) continue;
    taken.push({ x, z, r: 1.3 * s });
    q.setFromEuler(new THREE.Euler(0, rnd() * 3, 0));
    m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s, s));
    lt.setMatrixAt(n, m4); st.setMatrixAt(n, m4); wire.setMatrixAt(n, m4);
    const col = pick([0x41f0e2, 0x41f0e2, 0xff4fb3, 0x9b7bff]);
    lt.setColorAt(n, c.set(col).multiplyScalar(0.18)); wire.setColorAt(n, c.set(col).multiplyScalar(1.5));
    n++;
  }
  lt.count = st.count = wire.count = n;
  lt.castShadow = true; island.add(lt, st, wire);
  // server cubes
  const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
  const cubes = new THREE.InstancedMesh(cubeGeo, M.black, 80);
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.02, 0.06, 1.02), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 80);
  n = 0;
  for (let i = 0; i < 6000 && n < 80; i++) {
    const x = rr(6, R), z = rr(-R, R), s = rr(0.5, 1.0);
    if (!free(x, z, s)) continue;
    taken.push({ x, z, r: s });
    const hgt = s * rr(0.8, 1.8);
    m4.compose(new THREE.Vector3(x, hgt / 2, z), q.identity(), new THREE.Vector3(s, hgt, s));
    cubes.setMatrixAt(n, m4);
    caps.setMatrixAt(n, new THREE.Matrix4().compose(new THREE.Vector3(x, hgt + 0.03, z), q, new THREE.Vector3(s, 1, s)));
    caps.setColorAt(n, c.set(pick([0x41f0e2, 0xff4fb3, 0x7cff6b])).multiplyScalar(2));
    n++;
  }
  cubes.count = caps.count = n; shadowed(cubes); island.add(cubes, caps);
  // street lamps around the road
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2 + 0.3;
    const x = ROAD.cx + Math.cos(a) * (ROAD.rx + 2), z = ROAD.cz + Math.sin(a) * (ROAD.rz + 2);
    if (!inIsland(x, z, 2)) continue;
    const lamp = new THREE.Group();
    lamp.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.6, 5), M.steelLight, 0, 1.3, 0));
    lamp.add(mesh(new THREE.BoxGeometry(0.7, 0.08, 0.14), i % 2 ? M.neon : M.neonPink, -0.25, 2.6, 0));
    lamp.position.set(x, 0, z); lamp.rotation.y = -a; island.add(lamp);
  }
}

/* the road loop and the EVs on it */
let roadCurve;
{
  const pts = [];
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; pts.push(new THREE.Vector3(ROAD.cx + Math.cos(a) * ROAD.rx, 0, ROAD.cz + Math.sin(a) * ROAD.rz)); }
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x15161f, roughness: 0.6 });
  roadMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float dash = step(0.5, fract(vUv.y*0.5 - uTime*0.6)) * (1.0 - smoothstep(0.02, 0.05, abs(vUv.x-0.5)));
        float edge = 1.0 - smoothstep(0.0, 0.04, min(vUv.x, 1.0-vUv.x));
        totalEmissiveRadiance += vec3(.25,.95,.9)*dash*1.4 + vec3(1.,.31,.7)*edge*0.9;`);
  };
  roadMat.defines = { USE_UV: '' };
  const r = ribbon(pts, 2.6, roadMat, 0.04, true);
  roadCurve = r.curve; island.add(r.mesh);
}
function makeCar(color, glow) {
  const shape = new THREE.Shape();
  shape.moveTo(-1.25, 0.15); shape.lineTo(1.3, 0.15); shape.lineTo(1.3, 0.45); shape.lineTo(0.25, 0.95);
  shape.lineTo(-0.9, 0.9); shape.lineTo(-1.25, 0.55); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1.15, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1 });
  g.translate(0, 0, -0.575);
  const car = new THREE.Group();
  car.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.3, flatShading: true })));
  car.add(mesh(new THREE.BoxGeometry(0.06, 0.08, 1.15), new THREE.MeshStandardMaterial({ color: 0, emissive: glow, emissiveIntensity: 4 }), 1.33, 0.4, 0));
  car.add(mesh(new THREE.BoxGeometry(0.06, 0.08, 1.15), M.neonRed, -1.28, 0.5, 0));
  const win = mesh(new THREE.BoxGeometry(1.0, 0.3, 1.18), M.glassDark, -0.2, 0.75, 0); win.rotation.z = -0.1; car.add(win);
  [[0.8, 0.6], [0.8, -0.6], [-0.8, 0.6], [-0.8, -0.6]].forEach(([x, z]) => { const w = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 10), M.black, x, 0.22, z); w.rotation.x = Math.PI / 2; car.add(w); });
  return shadowed(car);
}
{
  const cars = [
    { c: makeCar(0xe8ecf4, 0x41f0e2), u: 0, v: 0.045 },
    { c: makeCar(0x2b2f45, 0xff4fb3), u: 0.33, v: 0.05 },
    { c: makeCar(0xc9a5ff, 0x41f0e2), u: 0.6, v: 0.042 },
    { c: makeCar(0x111218, 0xffd34f), u: 0.8, v: 0.047 },
  ];
  cars.forEach((k) => { island.add(k.c); });
  addTag(cars[0].c, 'Autonomous EV', 'no driver, no hurry', 'future', 1.6);
  const tg = new THREE.Vector3();
  anim.push((t, dt) => cars.forEach((k) => {
    k.u = (k.u + dt * k.v) % 1;
    const p = roadCurve.getPointAt(k.u); roadCurve.getTangentAt(k.u, tg);
    const off = new THREE.Vector3(-tg.z, 0, tg.x).multiplyScalar(0.55);
    k.c.position.set(p.x + off.x, 0.06, p.z + off.z);
    k.c.rotation.y = Math.atan2(-tg.z, tg.x);
  }));
}

{ // drone patrol
  const d = new THREE.Group();
  d.add(mesh(new THREE.BoxGeometry(0.8, 0.22, 0.8), M.steel));
  const rotors = [];
  [[0.7, 0.7], [0.7, -0.7], [-0.7, 0.7], [-0.7, -0.7]].forEach(([x, z]) => {
    const arm = mesh(new THREE.BoxGeometry(1.0, 0.06, 0.08), M.steelLight, x / 2, 0.05, z / 2); arm.rotation.y = Math.atan2(-z, x); d.add(arm);
    const rot = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 14), new THREE.MeshStandardMaterial({ color: 0xaab4c8, transparent: true, opacity: 0.35 }), x, 0.12, z);
    d.add(rot); rotors.push(rot);
    d.add(mesh(new THREE.SphereGeometry(0.06, 6, 5), (x > 0 ? M.neon : M.neonRed), x, 0.05, z));
  });
  const cam = mesh(new THREE.SphereGeometry(0.16, 10, 8), M.glassDark, 0, -0.16, 0.25); d.add(cam);
  shadowed(d, true, false);
  island.add(d);
  addTag(d, 'Delivery drone', 'route 07 · on time', 'future', 0.8);
  anim.push((t) => {
    const a = t * 0.18;
    d.position.set(22 + Math.sin(a) * 12, 9 + Math.sin(t * 1.3) * 0.4, 1 + Math.sin(a * 2) * 9);
    d.rotation.y = -Math.atan2(Math.cos(a * 2) * 18, Math.cos(a) * 12);
    d.rotation.z = Math.sin(t) * 0.06;
    rotors.forEach((r) => (r.rotation.y += 0.9));
  });
}

{ // floating particles: fireflies on the left, data motes on the right
  const N = 520;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), seedA = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const left = i < N / 2;
    let x, z;
    do { x = left ? rr(-R, 0) : rr(0, R); z = rr(-R, R); } while (!inIsland(x, z, 3));
    pos.set([x, rr(0.5, 7), z], i * 3);
    const c = new THREE.Color(left ? 0xffe39a : pick([0x41f0e2, 0xff4fb3, 0x9b7bff]));
    col.set([c.r, c.g, c.b], i * 3); seedA[i] = rnd() * 10;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seedA, 1));
  const m = new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; attribute float seed; varying float vA;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float right = step(0.0, position.x);
        transformed.y = mod(position.y + uTime*(0.25 + right*0.6) + seed, 8.0) + 0.3;
        transformed.x += sin(uTime*0.7 + seed*3.0)*(1.0-right)*0.8;
        transformed.z += cos(uTime*0.5 + seed*2.0)*(1.0-right)*0.8;
        vA = 0.5 + 0.5*sin(uTime*2.0 + seed*7.0);`)
      .replace('gl_PointSize = size;', 'gl_PointSize = size * 10.0;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vA;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 pc = gl_PointCoord - 0.5; float d = length(pc); if (d > 0.5) discard;
        diffuseColor.a *= smoothstep(0.5, 0.0, d) * vA * 1.6; diffuseColor.rgb *= 1.6;`);
  };
  const pts = new THREE.Points(g, m); pts.frustumCulled = false;
  island.add(pts);
}

/* ------------------------------------------------- the HDA glass tower */
const gltf = new GLTFLoader();
gltf.setMeshoptDecoder(MeshoptDecoder);
const loading = { total: 0, done: 0 };
const bar = document.getElementById('bar');
function track(p) { loading.total++; return p.finally(() => { loading.done++; bar.style.width = `${(loading.done / loading.total) * 100}%`; }); }
const loadGLB = (url) => track(new Promise((res, rej) => gltf.load(url, res, undefined, rej)));

const hda = new THREE.Group();
hda.position.copy(HDA_POS);
island.add(hda);
{
  const RAD = 5.2, F1 = 0.45, F2 = 5.0, ROOF = 9.6;
  hda.add(mesh(new THREE.CylinderGeometry(RAD + 0.8, RAD + 1.0, 0.45, 48), M.cream, 0, 0.22, 0));
  [F1, F2, ROOF].forEach((y, i) => {
    hda.add(mesh(new THREE.CylinderGeometry(RAD - 0.05, RAD - 0.05, 0.28, 48), M.white, 0, y, 0));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(RAD, 0.06, 6, 64), i === 2 ? M.hda : M.warm);
    ring.rotation.x = Math.PI / 2; ring.position.y = y + 0.15; hda.add(ring);
  });
  // glass skin
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(RAD, RAD, ROOF - F1, 64, 1, true),
    new THREE.MeshPhysicalMaterial({ color: 0xd8f2ff, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.0 })
  );
  glass.position.y = (ROOF + F1) / 2; glass.renderOrder = 5; hda.add(glass);
  // mullions
  for (let i = 0; i < 20; i++) {
    const a = i / 20 * Math.PI * 2;
    const m = mesh(new THREE.BoxGeometry(0.08, ROOF - F1, 0.12), M.steelLight, Math.cos(a) * RAD, (ROOF + F1) / 2, Math.sin(a) * RAD);
    m.rotation.y = -a; hda.add(m);
  }
  // roof garden ring + spire
  hda.add(mesh(new THREE.CylinderGeometry(RAD, RAD, 0.6, 48, 1, true), M.white, 0, ROOF + 0.4, 0));
  const hedge = new THREE.Mesh(new THREE.TorusGeometry(RAD - 0.5, 0.35, 6, 48), new THREE.MeshStandardMaterial({ color: 0x4f8a3c, flatShading: true }));
  hedge.rotation.x = Math.PI / 2; hedge.position.y = ROOF + 0.35; hda.add(hedge);
  hda.add(mesh(new THREE.CylinderGeometry(0.12, 0.25, 2.2, 8), M.steelLight, 0, ROOF + 1.2, 0));
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.18, 32), M.steel); disc.position.y = ROOF + 2.3; hda.add(disc);
  const discGlow = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.04, 6, 48), M.hda); discGlow.rotation.x = Math.PI / 2; discGlow.position.y = ROOF + 2.36; hda.add(discGlow);
  // door
  hda.add(mesh(new THREE.BoxGeometry(1.6, 2.6, 0.15), new THREE.MeshStandardMaterial({ color: 0x3a2a1c, emissive: 0xffb27a, emissiveIntensity: 0.5, roughness: 0.2 }), 0, 1.75, RAD + 0.02));
  hda.add(mesh(new THREE.BoxGeometry(1.8, 0.08, 0.2), M.warm, 0, 3.25, RAD + 0.05));

  // the rotating H
  const hGroup = new THREE.Group(); hGroup.position.y = ROOF + 4.2; hda.add(hGroup);
  track(fetch('assets/H.svg').then((r) => r.text()).then((txt) => {
    const data = new SVGLoader().parse(txt);
    const geos = [];
    data.paths.forEach((p) => SVGLoader.createShapes(p).forEach((s) => geos.push(new THREE.ExtrudeGeometry(s, { depth: 70, bevelEnabled: true, bevelSize: 6, bevelThickness: 6, bevelSegments: 2, curveSegments: 6 }))));
    const g = mergeGeometries(geos);
    g.computeBoundingBox(); const bb = g.boundingBox; const c = bb.getCenter(new THREE.Vector3());
    g.translate(-c.x, -c.y, -c.z); g.scale(1, -1, 1);
    const s = 3.0 / (bb.max.y - bb.min.y); g.scale(s, s, s);
    const H = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xffe2cc, emissive: 0xff6a2b, emissiveIntensity: 0.55, metalness: 0.4, roughness: 0.25 }));
    H.castShadow = true; hGroup.add(H);
  }).catch(() => {}));
  anim.push((t, dt) => { hGroup.rotation.y += dt * 0.7; hGroup.position.y = ROOF + 4.2 + Math.sin(t * 1.4) * 0.15; });

  // HDA furniture from the real office model
  function fitInside(obj, radius, y) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const s = (radius * 2) / Math.max(size.x, size.z);
    obj.scale.setScalar(Math.min(s, 1));
    const box2 = new THREE.Box3().setFromObject(obj), c = box2.getCenter(new THREE.Vector3());
    obj.position.set(-c.x, y - box2.min.y, -c.z);
    obj.traverse((o) => { if (o.isMesh && o.material) { const m = o.material; if (m.emissive && m.emissiveIntensity) m.emissiveIntensity = Math.min(m.emissiveIntensity, 0.6); } });
    shadowed(obj);
  }
  loadGLB('models/hda_pod.glb').then((g) => { const o = g.scene; fitInside(o, RAD - 0.9, F1 + 0.14); o.rotation.y = 0.4; hda.add(o); }).catch(() => {});
  loadGLB('models/hda_class.glb').then((g) => { const o = g.scene; fitInside(o, RAD - 0.6, F2 + 0.14); hda.add(o); }).catch(() => {});
  const glow = new THREE.PointLight(0xffc89a, 2.2, 9, 1.8); glow.position.set(0, 3.5, 0); hda.add(glow);
  const glow2 = new THREE.PointLight(0xffc89a, 1.8, 8, 1.8); glow2.position.set(0, 8, 0); hda.add(glow2);
  // planters around the base
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + 0.3;
    if (Math.abs(a - Math.PI / 2) < 0.4) continue;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), new THREE.MeshStandardMaterial({ color: pick([0x4f8a3c, 0x6a9b45]), flatShading: true }));
    b.position.set(Math.cos(a) * (RAD + 1.6), 0.55, Math.sin(a) * (RAD + 1.6)); b.castShadow = true; hda.add(b);
  }
  const tag = addTag(hda, 'Human Design Academy', 'tap for the app beta', 'nature', ROOF + 6.2, () => window.open('https://testflight.apple.com/join/CxrK3NDW', '_blank', 'noopener'));
  void tag;
}

/* -------------------------------------------- the pedestal for the head */
const pedestal = new THREE.Group();
pedestal.position.copy(HEAD_POS);
island.add(pedestal);
{
  // left half: stone and moss. right half: machined steel. one base, two worlds.
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.9, 1.1, 6, 1, false, Math.PI, Math.PI), new THREE.MeshStandardMaterial({ color: 0x8f8a7c, roughness: 1, flatShading: true }));
  const moss = new THREE.Mesh(new THREE.CylinderGeometry(3.45, 3.45, 0.18, 6, 1, false, Math.PI, Math.PI), new THREE.MeshStandardMaterial({ color: 0x5c8f45, roughness: 1, flatShading: true }));
  const steel = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.9, 1.1, 6, 1, false, 0, Math.PI), M.steel);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.1, 6, 1, false, 0, Math.PI), M.black);
  stone.position.y = steel.position.y = 0.55; moss.position.y = 1.15; plate.position.y = 1.13;
  // rotate so the split runs front-to-back (stone on screen-left, steel on screen-right)
  [stone, moss, steel, plate].forEach((m) => { m.rotation.y = -Math.PI / 2; pedestal.add(m); });
  const seam = mesh(new THREE.BoxGeometry(0.08, 0.05, 6.8), new THREE.MeshStandardMaterial({ color: 0, emissive: 0xffd88a, emissiveIntensity: 3 }), 0, 1.2, 0); pedestal.add(seam);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4 - i * 0.45, 0.04, 6, 64), i === 1 ? M.neonPink : M.neon);
    ring.rotation.x = Math.PI / 2; ring.position.y = 1.6 + i * 0.35; ring.userData.i = i; pedestal.add(ring);
    anim.push((t) => { ring.rotation.z = t * (0.3 + i * 0.25) * (i % 2 ? -1 : 1); ring.position.y = 1.6 + i * 0.35 + Math.sin(t * 1.5 + i) * 0.06; });
  }
  // a little sapling on the moss, a little antenna on the steel
  const sap = new THREE.Group(); sap.position.set(-2.2, 1.2, 1.0);
  sap.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.7, 4), M.trunk, 0, 0.35, 0));
  sap.add(mesh(new THREE.IcosahedronGeometry(0.32, 0), new THREE.MeshStandardMaterial({ color: 0x7fb069, flatShading: true }), 0, 0.8, 0));
  pedestal.add(sap);
  pedestal.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 4), M.steelLight, 2.2, 1.6, 1.0));
  const ant = mesh(new THREE.SphereGeometry(0.08, 6, 5), M.neonPink.clone(), 2.2, 2.08, 1.0); pedestal.add(ant);
  anim.push((t) => { ant.material.emissiveIntensity = 1 + 3 * (Math.sin(t * 5) > 0.3); });
  // soft light column
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 9, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xbff6ff, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.position.y = 5.6; pedestal.add(beam);
  shadowed(pedestal);
  beam.castShadow = false;
}

/* --------------------------------------------------------- Dhaval's head */
const HEAD = {
  url: 'models/head.glb',
  height: 11,                // world units, top of hair to the cut
  floatY: 3.6,                // gap above the pedestal
  // model space (Tripo output): face looks along +X, up is +Y, head is centred on Z=0
  fwd: new THREE.Vector3(1, 0, 0),
  // viewer's right when the face looks at the camera = the model's -Z = the cyber side
  cyber: new THREE.Vector3(0, 0, -1),
  clipY: -0.345, clipTilt: -0.32, // neck cut; rises toward the back to drop the shirt collar
  top: 0.49,
};
const headPivot = new THREE.Group();     // rotates when dragged
const headFloat = new THREE.Group();     // bobs gently
headFloat.add(headPivot);
pedestal.add(headFloat);
const headUniforms = {
  uTime, uHoverN: { value: 0 }, uHoverC: { value: 0 }, uHoverP: { value: new THREE.Vector3(9, 9, 9) },
  uClipY: { value: HEAD.clipY }, uClipTilt: { value: HEAD.clipTilt },
  uCyber: { value: HEAD.cyber }, uFwd: { value: HEAD.fwd }, uReveal: { value: 0 },
  uQuant: { value: new THREE.Matrix4() },
};
let headMeshes = [];
const headModel = new THREE.Group(); // raw model space lives in here
headPivot.add(headModel);
const leafInst = { mesh: null, base: [], grow: null };
const flowerInst = { mesh: null, base: [], bloom: null };
const ledInst = { mesh: null, n: 0 };
let strip = null;

function patchHeadMaterial(mat) {
  mat.side = THREE.DoubleSide;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, headUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj; varying vec3 vNObj; uniform mat4 uQuant;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = (uQuant * vec4(position, 1.0)).xyz; vNObj = normalize(mat3(uQuant) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vObj; varying vec3 vNObj;
        uniform float uTime, uHoverN, uHoverC, uClipY, uClipTilt, uReveal;
        uniform vec3 uHoverP, uCyber, uFwd;
        ${NOISE}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float clipAt = uClipY + uClipTilt * min(dot(vObj, uFwd), 0.0);
        if (vObj.y < clipAt) discard;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float side = dot(vObj, uCyber);                 // <0 nature, >0 cyber
        vec3 nO = normalize(vNObj);
        float front = dot(nO, uFwd);
        float hd = length(vObj - uHoverP);
        // nature half: moss patches on the scalp and the back of the head
        float mossN = vnoise3(vObj*14.0)*0.5 + vnoise3(vObj*45.0)*0.3 + vnoise3(vObj*140.0)*0.2;
        float mossZone = smoothstep(0.02, 0.10, -side) * smoothstep(-0.2, 0.15, vObj.y);
        float lum = dot(diffuseColor.rgb, vec3(.299,.587,.114));
        float hair = smoothstep(0.10, 0.045, lum);
        float faceGuard = 1.0 - smoothstep(0.1, 0.4, front) * step(vObj.y, 0.36);
        float moss = smoothstep(0.52, 0.62, mossN) * mossZone * hair * faceGuard * (0.4 + 0.6*uReveal);
        vec3 mossCol = mix(vec3(.20,.36,.13), vec3(.52,.66,.27), smoothstep(.3,.8,vnoise3(vObj*120.0)));
        diffuseColor.rgb = mix(diffuseColor.rgb, mossCol, moss);
        // cyber half: brushed metal plates on the side of the skull, away from the face
        float cyZone = smoothstep(0.03, 0.12, side) * smoothstep(0.35, -0.05, front) * smoothstep(-0.25, 0.05, vObj.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.16,.18,.24), cyZone*0.65);
        if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.01, 0.015, 0.03);
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        { float side = dot(vObj, uCyber); float front = dot(normalize(vNObj), uFwd);
          float cyZone = smoothstep(0.03, 0.12, side) * smoothstep(0.35, -0.05, front) * smoothstep(-0.25, 0.05, vObj.y);
          roughnessFactor = mix(roughnessFactor, 0.28, cyZone); }`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        { float side = dot(vObj, uCyber); float front = dot(normalize(vNObj), uFwd);
          float cyZone = smoothstep(0.03, 0.12, side) * smoothstep(0.35, -0.05, front) * smoothstep(-0.25, 0.05, vObj.y);
          metalnessFactor = mix(min(metalnessFactor, 0.05), 0.85, cyZone); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float side = dot(vObj, uCyber); vec3 nO = normalize(vNObj); float front = dot(nO, uFwd);
          float hd = length(vObj - uHoverP);
          // the seam down the middle: gold on the nature side, cyan on the cyber side
          float seam = 1.0 - smoothstep(0.0, 0.006, abs(side));
          totalEmissiveRadiance += mix(vec3(1.,.75,.3), vec3(.25,1.,.95), step(0.0, side)) * seam * (1.6 + uHoverN + uHoverC);
          // circuit traces on the cyber plates
          float cyZone = smoothstep(0.03, 0.12, side) * smoothstep(0.35, -0.05, front) * smoothstep(-0.25, 0.05, vObj.y);
          vec3 q = vObj*38.0;
          vec3 cell = abs(fract(q) - 0.5);
          float tr = 1.0 - smoothstep(0.0, 0.06, min(cell.y, min(cell.x, cell.z)));
          float keep = step(0.55, vnoise3(floor(q)*0.77));
          float flow = 0.5 + 0.5*sin(uTime*3.0 - vObj.y*40.0 + side*30.0);
          float near = 1.0 + uHoverC * 3.0 * smoothstep(0.25, 0.0, hd);
          totalEmissiveRadiance += vec3(.25,.95,.95) * tr * keep * cyZone * (0.5 + 0.9*flow) * near;
          // the nature side breathes a soft green when you touch it
          float mossZone = smoothstep(0.02, 0.10, -side);
          totalEmissiveRadiance += vec3(.45,.85,.3) * mossZone * uHoverN * 0.25 * smoothstep(0.3, 0.0, hd);
          if (!gl_FrontFacing) totalEmissiveRadiance += vec3(.05,.35,.4) * 0.6; }
      `);
  };
  mat.needsUpdate = true;
}

function leafGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.bezierCurveTo(0.45, 0.25, 0.4, 0.8, 0, 1.15); s.bezierCurveTo(-0.4, 0.8, -0.45, 0.25, 0, 0);
  const g = new THREE.ShapeGeometry(s, 4);
  g.rotateX(-0.35);
  return g;
}
function flowerGeometry() {
  const geos = [];
  for (let i = 0; i < 5; i++) {
    const p = new THREE.CircleGeometry(0.42, 6); p.scale(0.55, 1, 1); p.translate(0, 0.45, 0); p.rotateZ(i / 5 * Math.PI * 2);
    geos.push(p);
  }
  const g = mergeGeometries(geos);
  return g;
}

function buildHeadDetails(meshes, size) {
  // sample the surface in raw model space
  // the file is quantized: rebuild plain float geometry in model space before sampling
  const merged = meshes.map((m) => {
    const src = m.geometry, pa = src.attributes.position, na = src.attributes.normal;
    const ua = src.attributes.uv;
    const pos = new Float32Array(pa.count * 3), nor = new Float32Array(pa.count * 3), uvs = new Float32Array(pa.count * 2);
    for (let i = 0; i < pa.count; i++) {
      pos.set([pa.getX(i), pa.getY(i), pa.getZ(i)], i * 3);
      if (na) nor.set([na.getX(i), na.getY(i), na.getZ(i)], i * 3);
      if (ua) uvs.set([ua.getX(i), ua.getY(i)], i * 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    if (src.index) g.setIndex(src.index.clone());
    g.applyMatrix4(m.userData.quant);
    if (!na) g.computeVertexNormals();
    return g;
  });
  const tmpMesh = new THREE.Mesh(merged.length > 1 ? mergeGeometries(merged) : merged[0]);
  tmpMesh.geometry.computeBoundingSphere();
  const sampler = new MeshSurfaceSampler(tmpMesh).build();
  const p = new THREE.Vector3(), n = new THREE.Vector3(), uvS = new THREE.Vector2(), colS = new THREE.Color();
  // read the colour texture so vegetation only grows out of hair
  let px = null, PW = 256;
  const img = meshes[0].material.map && meshes[0].material.map.image;
  if (img) {
    const cv = document.createElement('canvas'); cv.width = cv.height = PW;
    const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, PW, PW);
    px = cx.getImageData(0, 0, PW, PW).data;
  }
  const flipY = meshes[0].material.map ? meshes[0].material.map.flipY : false;
  const isHair = (uv) => {
    if (!px) return true;
    const x = Math.min(PW - 1, Math.max(0, Math.floor(uv.x * PW))), y = Math.min(PW - 1, Math.max(0, Math.floor((flipY ? 1 - uv.y : uv.y) * PW)));
    const k = (y * PW + x) * 4, l = (0.299 * px[k] + 0.587 * px[k + 1] + 0.114 * px[k + 2]) / 255;
    return l < 0.2;
  };
  const clipAt = (v) => HEAD.clipY + HEAD.clipTilt * Math.min(v.dot(HEAD.fwd), 0);
  const leaves = [], flowers = [], leds = [];
  for (let i = 0; i < 120000 && (leaves.length < 950 || leds.length < 70); i++) {
    sampler.sample(p, n, colS, uvS);
    if (p.y < clipAt(p) + 0.05) continue;
    const side = p.dot(HEAD.cyber), front = n.dot(HEAD.fwd);
    const faceArea = front > 0.25 && p.y < HEAD.top - 0.12;      // keep the face itself untouched
    if (faceArea) continue;
    if (side < -0.06 && leaves.length < 950) {
      // vegetation grows mostly on the crown, the side and the back
      if (n.y < -0.3) continue;
      if (!isHair(uvS)) continue;
      leaves.push({ p: p.clone(), n: n.clone(), r: rnd() });
      if (flowers.length < 40 && rnd() < 0.08 && n.y > 0.0) flowers.push({ p: p.clone(), n: n.clone(), r: rnd() });
    } else if (side > 0.07 && leds.length < 70 && front < 0.1 && p.y > -0.2 && rnd() < 0.5) {
      leds.push({ p: p.clone(), n: n.clone() });
    }
  }
  // leaves
  const lg = leafGeometry();
  const leafMatH = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide, flatShading: true });
  leafInst.mesh = new THREE.InstancedMesh(lg, leafMatH, leaves.length);
  leafInst.base = leaves;
  leafInst.grow = new Float32Array(leaves.length).fill(0);
  const col = new THREE.Color();
  leaves.forEach((l, i) => leafInst.mesh.setColorAt(i, col.set(pick([0x4f8a3c, 0x6fa04a, 0x87b356, 0x3e7a35, 0x9bc45a]))));
  leafInst.mesh.castShadow = true; leafInst.mesh.frustumCulled = false;
  headModel.add(leafInst.mesh);
  // flowers
  const fg = flowerGeometry();
  flowerInst.mesh = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x221100 }), flowers.length);
  flowerInst.base = flowers;
  flowerInst.bloom = new Float32Array(flowers.length).fill(0);
  flowers.forEach((f, i) => flowerInst.mesh.setColorAt(i, col.set(pick([0xffd84f, 0xff9fc2, 0xffffff, 0xc7a6ff]))));
  flowerInst.mesh.frustumCulled = false; headModel.add(flowerInst.mesh);
  // LEDs
  const ledGeo = new THREE.SphereGeometry(1, 6, 4);
  ledInst.mesh = new THREE.InstancedMesh(ledGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), leds.length);
  ledInst.n = leds.length;
  const m4 = new THREE.Matrix4();
  leds.forEach((l, i) => {
    const s = size * rr(0.006, 0.011);
    m4.compose(l.p.clone().addScaledVector(l.n, size * 0.003), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
    ledInst.mesh.setMatrixAt(i, m4); ledInst.mesh.setColorAt(i, col.set(pick([0x41f0e2, 0x41f0e2, 0xff4fb3])).multiplyScalar(2));
  });
  ledInst.mesh.frustumCulled = false; headModel.add(ledInst.mesh);

  // the light strip, chin to ear, on the cyber side: find the skin by casting rays at the model
  const ray = new THREE.Raycaster();
  const pts = [];
  const cy = HEAD.cyber, fw = HEAD.fwd;
  for (let i = 0; i <= 14; i++) {
    const u = i / 14;
    const ang = THREE.MathUtils.lerp(0.18, 1.45, u);                 // from front toward the side
    const y = THREE.MathUtils.lerp(-0.255, 0.06, Math.pow(u, 1.25)); // chin up to the ear
    const dir = fw.clone().multiplyScalar(Math.cos(ang)).addScaledVector(cy, Math.sin(ang));
    const origin = dir.clone().multiplyScalar(1.5); origin.y = y;
    ray.set(origin, dir.clone().negate());
    const hit = ray.intersectObject(tmpMesh, false)[0];
    if (hit) pts.push(hit.point.clone().addScaledVector(hit.face.normal, size * 0.004));
  }
  if (pts.length > 4) {
    const curve = new THREE.CatmullRomCurve3(pts);
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    stripMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime; sh.uniforms.uHoverC = headUniforms.uHoverC;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vU;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvU = uv;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vU; uniform float uTime; uniform float uHoverC;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float run = fract(vU.x*1.0 - uTime*(0.35 + uHoverC*0.9));
          float pulse = smoothstep(0.0, 0.08, run) * smoothstep(0.22, 0.08, run);
          diffuseColor.rgb = vec3(.25,1.,.95) * (0.9 + pulse*4.0 + uHoverC*1.5);`);
    };
    strip = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, size * 0.0045, 6, false), stripMat);
    headModel.add(strip);
    // little nodes along it, and an ear piece at the end
    const nodeMat = new THREE.MeshStandardMaterial({ color: 0x1b1e2a, metalness: 0.9, roughness: 0.25 });
    [0.0, 0.33, 0.66].forEach((u) => { const nd = new THREE.Mesh(new THREE.SphereGeometry(size * 0.009, 10, 8), nodeMat); nd.position.copy(curve.getPointAt(u)); headModel.add(nd); });
    const ear = new THREE.Mesh(new THREE.TorusGeometry(size * 0.022, size * 0.005, 8, 24), M.neon);
    ear.position.copy(curve.getPointAt(1)); ear.lookAt(ear.position.clone().add(cy)); headModel.add(ear);
  }
  tmpMesh.geometry.dispose();
}

function updateHeadDetails(t, dt) {
  if (!leafInst.mesh) return;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3();
  const hp = headUniforms.uHoverP.value, hn = headUniforms.uHoverN.value, rev = headUniforms.uReveal.value;
  const size = 1;
  leafInst.base.forEach((l, i) => {
    const near = Math.max(0, 1 - l.p.distanceTo(hp) / 0.22) * hn;
    leafInst.grow[i] = THREE.MathUtils.lerp(leafInst.grow[i], near, 0.08);
    const k = Math.min(1, Math.max(0, rev * 1.6 - l.r * 0.6));
    const sc = size * (0.026 + 0.022 * l.r) * k * (1 + leafInst.grow[i] * 0.9) * (1 + 0.06 * Math.sin(t * 2 + l.r * 9));
    q.setFromUnitVectors(up, l.n);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(up, l.r * 6.28 + Math.sin(t * 1.5 + l.r * 5) * 0.15));
    m4.compose(l.p, q, s.set(sc, sc, sc));
    leafInst.mesh.setMatrixAt(i, m4);
  });
  leafInst.mesh.instanceMatrix.needsUpdate = true;
  // flowers bloom: one at a time on their own, all near your cursor when you hover
  flowerInst.base.forEach((f, i) => {
    const near = Math.max(0, 1 - f.p.distanceTo(hp) / 0.3) * hn;
    const auto = Math.max(0, Math.sin(t * 0.5 + f.r * 40)) > 0.97 ? 1 : 0;
    const goal = Math.max(0.15 + 0.35 * f.r, near, auto) * rev;
    flowerInst.bloom[i] = THREE.MathUtils.lerp(flowerInst.bloom[i], goal, near > 0 ? 0.12 : 0.03);
    const b = flowerInst.bloom[i];
    q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), f.n);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), t * 0.2 + f.r * 6));
    const sc = 0.05 * b;
    m4.compose(f.p.clone().addScaledVector(f.n, 0.012), q, s.set(sc, sc, sc));
    flowerInst.mesh.setMatrixAt(i, m4);
  });
  flowerInst.mesh.instanceMatrix.needsUpdate = true;
  // LEDs flicker; a hover sets off a cascade
  const c = new THREE.Color();
  const hc = headUniforms.uHoverC.value;
  for (let i = 0; i < ledInst.n; i++) {
    if (rnd() < 0.04 + hc * 0.2) {
      const on = rnd() < 0.55 + hc * 0.4;
      ledInst.mesh.setColorAt(i, c.set(pick([0x41f0e2, 0x41f0e2, 0xff4fb3, 0x7cff6b])).multiplyScalar(on ? 2.4 + hc * 2 : 0.08));
    }
  }
  ledInst.mesh.instanceColor.needsUpdate = true;
}

loadGLB(HEAD.url).then((g) => {
  const root = g.scene;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.userData.quant = o.matrixWorld.clone();      // node transform = dequantization
    headUniforms.uQuant.value.copy(o.matrixWorld);
    headMeshes.push(o); patchHeadMaterial(o.material); o.castShadow = true; o.receiveShadow = true;
  });
  headModel.add(root);
  // size: from the cut at the neck to the top of the hair
  const span = HEAD.top - HEAD.clipY;
  const s = HEAD.height / span;
  headModel.scale.setScalar(s);
  // face the camera: model +X (the face) → world +Z
  headModel.rotation.y = -Math.PI / 2;
  headModel.position.y = -HEAD.clipY * s;
  headFloat.position.y = 1.2 + HEAD.floatY;
  buildHeadDetails(headMeshes, 1);
  headModel.traverse((o) => { o.userData.hover = headEntry; o.userData.isHead = true; });
}).catch((e) => {
  console.warn('head failed to load', e);
  const bust = new THREE.Mesh(new THREE.SphereGeometry(3, 32, 24), new THREE.MeshStandardMaterial({ color: 0xd9b48f }));
  bust.position.y = 4; headModel.add(bust); headFloat.position.y = 1.2 + HEAD.floatY;
});
const headEntry = addTag(headFloat, 'Dhaval', 'nature on one side, the future on the other', 'future', HEAD.height + 0.8);
headEntry.isHead = true;

/* ---------------------------------------------------------- post FX */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.35, 1.3);
composer.addPass(bloom);
composer.addPass(new OutputPass());

/* -------------------------------------------------------- interaction */
const pointer = new THREE.Vector2(9, 9);
const raycaster = new THREE.Raycaster();
const state = {
  mode: null, // 'pan' | 'head'
  last: { x: 0, y: 0 }, start: { x: 0, y: 0 }, moved: 0,
  vel: new THREE.Vector2(), headVel: new THREE.Vector2(),
  headYaw: 0, headPitch: 0, idle: 0, hovered: null, pointers: new Map(), pinch: 0,
};
const hint = document.getElementById('hint');
function hideHint() { hint.classList.add('gone'); }
setTimeout(hideHint, 9000);

function worldPerPixel() { return (camera.top - camera.bottom) / canvas.clientHeight; }
function pick3D(e) {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(island.children, true);
  for (const h of hits) {
    if (h.object.isPoints) continue;
    if (h.object.userData.isHead && h.object.isMesh && headMeshes.includes(h.object)) {
      const local = headModel.worldToLocal(h.point.clone());
      const clipAt = HEAD.clipY + HEAD.clipTilt * Math.min(local.dot(HEAD.fwd), 0);
      if (local.y < clipAt) continue;
      return { hit: h, entry: headEntry, local };
    }
    if (h.object.userData.hover) return { hit: h, entry: h.object.userData.hover };
    if (h.object.name === 'ground') return { hit: h, entry: null };
  }
  return null;
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (state.pointers.size === 2) { state.mode = 'pinch'; const [a, b] = [...state.pointers.values()]; state.pinch = Math.hypot(a.x - b.x, a.y - b.y); return; }
  const p = pick3D(e);
  state.mode = p && p.entry && p.entry.isHead ? 'head' : 'pan';
  state.last = { x: e.clientX, y: e.clientY }; state.start = { ...state.last }; state.moved = 0;
  state.vel.set(0, 0); state.headVel.set(0, 0);
  canvas.classList.add('dragging');
  hideHint();
});
canvas.addEventListener('pointermove', (e) => {
  if (state.pointers.has(e.pointerId)) state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (state.mode === 'pinch' && state.pointers.size === 2) {
    const [a, b] = [...state.pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    view.zoomGoal = THREE.MathUtils.clamp(view.zoomGoal * d / state.pinch, 0.7, 2.8); state.pinch = d; return;
  }
  const dx = e.clientX - state.last.x, dy = e.clientY - state.last.y;
  if (state.mode === 'pan') {
    const wpp = worldPerPixel();
    state.vel.set(-dx * wpp, -dy * wpp / Math.sin(ELEV));
    target.x += state.vel.x; target.z += state.vel.y;
    state.moved += Math.abs(dx) + Math.abs(dy);
  } else if (state.mode === 'head') {
    state.headVel.set(dx * 0.012, dy * 0.008);
    state.headYaw += state.headVel.x; state.headPitch = THREE.MathUtils.clamp(state.headPitch + state.headVel.y, -0.45, 0.45);
    state.moved += Math.abs(dx) + Math.abs(dy); state.idle = 0;
  } else {
    // hover
    const p = pick3D(e);
    const entry = p && p.entry;
    setHovered(entry, p);
  }
  state.last = { x: e.clientX, y: e.clientY };
});
function endPointer(e) {
  state.pointers.delete(e.pointerId);
  if (state.mode === 'pinch' && state.pointers.size < 2) { state.mode = null; return; }
  if (state.mode && state.moved < 6) {
    const p = pick3D(e);
    if (p && p.entry && p.entry.onClick) p.entry.onClick();
    if (p && p.entry && p.entry.isHead && p.local) pokeHead(p.local, 1);
    if (p && p.entry) { setHovered(p.entry, p); }
  }
  state.mode = null; canvas.classList.remove('dragging');
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => { if (!state.mode) setHovered(null); });
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  view.zoomGoal = THREE.MathUtils.clamp(view.zoomGoal * Math.exp(-e.deltaY * 0.0012), 0.7, 2.8);
  hideHint();
}, { passive: false });
canvas.addEventListener('keydown', (e) => {
  const step = 2;
  if (e.key === 'ArrowLeft') target.x -= step; if (e.key === 'ArrowRight') target.x += step;
  if (e.key === 'ArrowUp') target.z -= step; if (e.key === 'ArrowDown') target.z += step;
  if (e.key === '+' || e.key === '=') view.zoomGoal = Math.min(2.8, view.zoomGoal * 1.15);
  if (e.key === '-') view.zoomGoal = Math.max(0.7, view.zoomGoal / 1.15);
});

function pokeHead(local, strength) {
  headUniforms.uHoverP.value.copy(local);
  const side = local.dot(HEAD.cyber);
  if (side < 0) headUniforms.uHoverN.value = Math.max(headUniforms.uHoverN.value, strength);
  else headUniforms.uHoverC.value = Math.max(headUniforms.uHoverC.value, strength);
}
function setHovered(entry, p) {
  if (state.hovered && state.hovered !== entry) state.hovered.el.classList.remove('show');
  state.hovered = entry || null;
  canvas.classList.toggle('over-head', !!(entry && entry.isHead));
  canvas.classList.toggle('over-hit', !!(entry && !entry.isHead));
  if (entry) entry.el.classList.add('show');
  if (entry && entry.isHead && p && p.local) pokeHead(p.local, 1);
}

/* ------------------------------------------------------------ loop */
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3();
let revealStart = null;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const speed = reduceMotion ? 0.3 : 1;
  uTime.value += dt * speed;
  const t = uTime.value;

  // camera: inertia, bounds, zoom
  if (state.mode !== 'pan') { target.x += state.vel.x; target.z += state.vel.y; state.vel.multiplyScalar(0.92); }
  // never zoom out past the populated world, and never pan to its edge
  view.zoomGoal = Math.max(view.zoomGoal, minZoom());
  view.zoom += (view.zoomGoal - view.zoom) * 0.12;
  fitView();
  {
    const hh = (camera.top - camera.bottom) / 2, hw = (camera.right - camera.left) / 2, hd = hh / Math.sin(ELEV);
    const lx = Math.max(0, R - 1 - hw), lz = Math.max(0, R - 1 - hd);
    target.x = THREE.MathUtils.clamp(target.x, -lx, lx);
    target.z = THREE.MathUtils.clamp(target.z, -lz, lz);
  }
  placeCamera();
  sun.position.copy(target).add(SUN_OFFSET); sun.target.position.copy(target); sun.target.updateMatrixWorld();

  // head: drag to turn, it keeps spinning a little, then settles back to face you
  state.idle += dt;
  if (state.mode !== 'head') {
    state.headYaw += state.headVel.x; state.headPitch = THREE.MathUtils.clamp(state.headPitch + state.headVel.y, -0.45, 0.45);
    state.headVel.multiplyScalar(0.94);
    if (state.idle > 3.5) {
      // settle to the nearest full turn so the face comes back to the viewer
      const home = Math.round(state.headYaw / (Math.PI * 2)) * Math.PI * 2;
      state.headYaw += (home + Math.sin(t * 0.35) * 0.32 - state.headYaw) * 0.02;
      state.headPitch += (0 - state.headPitch) * 0.03;
    }
  }
  headPivot.rotation.set(state.headPitch - 0.16, state.headYaw, 0, 'YXZ');
  headFloat.position.y = 1.2 + HEAD.floatY + Math.sin(t * 1.1) * 0.25;
  headUniforms.uHoverN.value *= 0.965; headUniforms.uHoverC.value *= 0.965;
  if (headMeshes.length && revealStart === null) revealStart = t;
  if (revealStart !== null) headUniforms.uReveal.value = window.__revealNow ? 1 : Math.min(1, (t - revealStart) / 2.5);
  updateHeadDetails(t, dt);

  // world life
  anim.forEach((f) => f(t, dt * speed));
  for (const b of blinkers) {
    const n = b.count, c = new THREE.Color();
    for (let k = 0; k < 2; k++) {
      const i = Math.floor(Math.random() * n);
      b.setColorAt(i, c.set(b.userData.colors[Math.floor(Math.random() * b.userData.colors.length)]).multiplyScalar(Math.random() < 0.6 ? 2.2 : 0.12));
    }
    b.instanceColor.needsUpdate = true;
  }

  // labels follow their objects
  for (const h of hoverables) {
    if (!h.el.classList.contains('show')) continue;
    h.obj.getWorldPosition(tmpV); tmpV.y += h.anchor.y;
    tmpV.project(camera);
    h.el.style.left = `${(tmpV.x * 0.5 + 0.5) * innerWidth}px`;
    h.el.style.top = `${(-tmpV.y * 0.5 + 0.5) * innerHeight}px`;
  }

  composer.render();
  requestAnimationFrame(frame);
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  fitView(); paintSky();
});

/* dock: macOS-style magnification */
{
  const dock = document.getElementById('dock');
  const apps = [...dock.querySelectorAll('.app')];
  const base = () => (innerWidth <= 640 ? 46 : 56);
  if (!isTouch) {
    dock.addEventListener('mousemove', (e) => {
      apps.forEach((a) => {
        const r = a.getBoundingClientRect(); const cx = r.left + r.width / 2;
        const d = Math.abs(e.clientX - cx); const k = Math.max(0, 1 - d / 150);
        a.style.setProperty('--s', `${base() * (1 + 0.62 * k * k)}px`);
      });
    });
    dock.addEventListener('mouseleave', () => apps.forEach((a) => a.style.setProperty('--s', `${base()}px`)));
  }
}

/* start */
const startWhenReady = () => {
  if (loading.done >= loading.total) {
    document.getElementById('loader').classList.add('done');
    if (window.__shot) document.title = 'done';
  } else setTimeout(startWhenReady, 150);
};
setTimeout(startWhenReady, 300);
requestAnimationFrame(frame);

// handles for testing in the console
window.__world = { hda, target, view, state, headUniforms, setHovered, hoverables, leafInst, flowerInst, ledInst };
