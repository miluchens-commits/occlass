/* OC 房子 3D：草原、天空、光照與房屋外觀 */
import * as THREE from '../vendor/three.module.js';

export const HOUSE = {
  area: 10,
  outer: { minX: -4.5, maxX: 4.5, minZ: -3.5, maxZ: 3.5 },
  inner: { minX: -4.0, maxX: 4.0, minZ: -3.0, maxZ: 3.0 },
  wallHeight: 2.7,
  wallThickness: 0.25,
  doorWidth: 1.8,
  doorHeight: 2.1,
  floorTop: 0.08
};

/* ---------------- 程序化貼圖（地板、牆面、草地） ---------------- */
const SCENE_TEX = new Map();

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeTex(key, size, draw, rx = 1, ry = 1) {
  if (SCENE_TEX.has(key)) return SCENE_TEX.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 4;
  SCENE_TEX.set(key, t);
  return t;
}

function floorTexture() {
  return makeTex('house-floor', 256, (ctx, s) => {
    ctx.fillStyle = '#d9b783';
    ctx.fillRect(0, 0, s, s);
    const rnd = seeded(1234);
    for (let i = 0; i < 64; i++) {
      const y = rnd() * s;
      ctx.strokeStyle = i % 4 ? 'rgba(120,78,42,.22)' : 'rgba(80,50,26,.3)';
      ctx.lineWidth = 0.6 + rnd() * 1.8;
      ctx.beginPath();
      for (let x = 0; x <= s; x += 6) {
        const yy = y + Math.sin(x * 0.05 + i) * 3;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      ctx.strokeStyle = 'rgba(110,72,40,.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, i * 64);
      ctx.lineTo(s, i * 64);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#fff6e6' : '#8a5f3c';
      ctx.fillRect((i % 2) * 128, Math.floor(i / 2) * 64, 128, 64);
    }
    ctx.globalAlpha = 1;
  }, 2, 2);
}

function wallTexture() {
  return makeTex('house-wall', 128, (ctx, s) => {
    ctx.fillStyle = '#fff4e4';
    ctx.fillRect(0, 0, s, s);
    const rnd = seeded(4321);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,.16)' : 'rgba(180,150,110,.06)';
      ctx.fillRect(rnd() * s, rnd() * s, 1, 1);
    }
  }, 3, 2);
}

function grassTexture() {
  return makeTex('grass', 256, (ctx, s) => {
    ctx.fillStyle = '#7ac57c';
    ctx.fillRect(0, 0, s, s);
    const rnd = seeded(777);
    for (let i = 0; i < 4200; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      ctx.strokeStyle = rnd() > 0.5 ? 'rgba(58,132,68,.32)' : 'rgba(186,232,166,.3)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rnd() - 0.5) * 3, y - 2 - rnd() * 3);
      ctx.stroke();
    }
  }, 12, 12);
}


export function round2(n) { return Math.round(n * 100) / 100; }

export function footprintAabb(item, meta) {
  const rad = (item.rot || 0) * Math.PI / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const w = meta.footprint.w * item.scale;
  const d = meta.footprint.d * item.scale;
  const hx = (w * c + d * s) / 2;
  const hz = (w * s + d * c) / 2;
  return { minX: item.x - hx, maxX: item.x + hx, minZ: item.z - hz, maxZ: item.z + hz };
}

export function boxesOverlap(a, b, pad = 0) {
  return !(a.maxX <= b.minX + pad || a.minX >= b.maxX - pad ||
           a.maxZ <= b.minZ + pad || a.minZ >= b.maxZ - pad);
}

export function insideInner(box) {
  return box.minX >= HOUSE.inner.minX && box.maxX <= HOUSE.inner.maxX &&
    box.minZ >= HOUSE.inner.minZ && box.maxZ <= HOUSE.inner.maxZ;
}

export function touchesOuter(box) {
  return !(box.maxX <= HOUSE.outer.minX || box.minX >= HOUSE.outer.maxX ||
    box.maxZ <= HOUSE.outer.minZ || box.minZ >= HOUSE.outer.maxZ);
}

/* ---------------- 草原、天空與自然光 ---------------- */
export class HouseEnvironment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.clouds = [];
    scene.background = new THREE.Color('#bfe9ff');
    scene.fog = new THREE.Fog('#d6f2ff', 34, 70);

    this._buildEnvironmentMap(renderer);

    this.hemi = new THREE.HemisphereLight('#e8f7ff', '#8fc98a', 1.18);
    scene.add(this.hemi);

    // 一點暖色環境光，讓屋內牆面不會被草地的綠色反光染色
    this.ambient = new THREE.AmbientLight('#fff1de', 0.42);
    scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight('#fff3d1', 2.4);
    this.sun.position.set(13, 19, 9);
    this.sun.castShadow = true;
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const shadowSize = coarse ? 1024 : 2048;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 60;
    this.sun.shadow.camera.left = -18;
    this.sun.shadow.camera.right = 18;
    this.sun.shadow.camera.top = 18;
    this.sun.shadow.camera.bottom = -18;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.022;
    scene.add(this.sun);
    scene.add(this.sun.target);

    // 從門口斜射進屋內的補光，讓室內家具的材質看得清楚
    this.fill = new THREE.DirectionalLight('#fff2dc', 0.55);
    this.fill.position.set(-4, 5, 8);
    this.fill.target.position.set(0, 1, 0);
    scene.add(this.fill);
    scene.add(this.fill.target);

    this._buildSky();
    this._buildGround();
    this._buildClouds();
  }

  _buildEnvironmentMap(renderer) {
    if (!renderer || !THREE.PMREMGenerator) return;
    let pmrem = null;
    try {
      pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = new THREE.Scene();
      const sky = new THREE.Mesh(
        new THREE.SphereGeometry(12, 16, 10),
        new THREE.MeshBasicMaterial({ color: '#c9ecff', side: THREE.BackSide })
      );
      envScene.add(sky);
      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(12, 20),
        new THREE.MeshBasicMaterial({ color: '#6fbd78' })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.4;
      envScene.add(ground);
      const sun = new THREE.Mesh(
        new THREE.SphereGeometry(1.4, 12, 8),
        new THREE.MeshBasicMaterial({ color: '#fff9e6' })
      );
      sun.position.set(5, 8, 4);
      envScene.add(sun);
      const target = pmrem.fromScene(envScene, 0.04).texture;
      this.scene.environment = target;
      this.scene.environmentIntensity = 0.7;
      this.envMap = target;
      [sky, ground, sun].forEach(o => {
        o.geometry.dispose();
        o.material.dispose();
      });
    } catch (e) {
      // 環境反射失敗時仍可正常顯示，只是金屬反射較少
    } finally {
      if (pmrem) pmrem.dispose();
    }
  }


  _buildSky() {
    const geo = new THREE.SphereGeometry(120, 24, 14);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color('#5cc0f2') },
        bottomColor: { value: new THREE.Color('#f2fbff') }
      },
      vertexShader: `
        varying float vH;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vH = normalize(wp.xyz).y;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying float vH;
        void main() {
          float h = clamp(vH * 1.3 + 0.08, 0.0, 1.0);
          gl_FragColor = vec4(mix(bottomColor, topColor, h), 1.0);
        }`
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.frustumCulled = false;
    this.scene.add(sky);
    this.sky = sky;
  }

  _buildGround() {
    const groundMat = new THREE.MeshStandardMaterial({
      color: '#ffffff', map: grassTexture(), roughness: 1
    });
    const groundGeo = new THREE.CircleGeometry(55, 64);
    groundGeo.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -0.012;
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.scene.add(ground);
    this.ground = ground;

    // 草原上的小草叢（單一 InstancedMesh，避免物件過多）
    const tuftGeo = new THREE.ConeGeometry(0.085, 0.4, 4);
    tuftGeo.translate(0, 0.2, 0);
    const tuftMat = new THREE.MeshStandardMaterial({ color: '#5faf63', roughness: 1 });
    const COUNT = 520;
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, COUNT);
    const dummy = new THREE.Object3D();
    let seed = 20261028;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < COUNT; i++) {
      const a = rand() * Math.PI * 2;
      const r = 7 + rand() * 24;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      dummy.position.set(x, 0, z);
      dummy.rotation.y = rand() * Math.PI;
      dummy.scale.setScalar(0.7 + rand() * 0.9);
      dummy.updateMatrix();
      tufts.setMatrixAt(i, dummy.matrix);
    }
    tufts.instanceMatrix.needsUpdate = true;
    tufts.castShadow = false;
    tufts.receiveShadow = true;
    this.scene.add(tufts);
    this.tufts = tufts;

    // 遠方小山丘
    const hillMat = new THREE.MeshStandardMaterial({ color: '#8fd08c', roughness: 1, flatShading: true });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      const r = 34 + (i % 3) * 4;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(7 + (i % 4) * 1.6, 14, 8), hillMat);
      hill.position.set(Math.cos(a) * r, -4.2 - (i % 2), Math.sin(a) * r);
      hill.scale.y = 0.55;
      this.scene.add(hill);
    }

    // 門前的小石階
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#d8cfc2', roughness: 0.95 });
    for (let i = 0; i < 5; i++) {
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.05, 12), stoneMat);
      stone.position.set((i % 2 ? 1 : -1) * 0.16, 0.012, 3.25 + i * 0.62);
      stone.receiveShadow = true;
      stone.castShadow = true;
      this.scene.add(stone);
    }
  }

  _buildClouds() {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: '#ffffff', roughness: 1, emissive: '#eaf7ff', emissiveIntensity: 0.35
    });
    const spots = [
      [-24, 17, -18, 2.4], [18, 20, -24, 3.1], [28, 15, 8, 2.0],
      [-30, 19, 14, 2.7], [4, 22, -34, 3.4], [-12, 16, 30, 2.2]
    ];
    spots.forEach(([x, y, z, s]) => {
      const g = new THREE.Group();
      const puffs = [[0, 0, 0, 1.5], [1.5, -0.15, 0.2, 1.1], [-1.5, -0.2, -0.1, 1.05], [0.6, 0.5, -0.2, 1.05]];
      puffs.forEach(([px, py, pz, ps]) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(ps, 14, 10), cloudMat);
        m.position.set(px, py, pz);
        g.add(m);
      });
      g.position.set(x, y, z);
      g.scale.setScalar(s);
      this.scene.add(g);
      this.clouds.push(g);
    });
  }

  update(dt) {
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.position.x += dt * (0.22 + (i % 3) * 0.06);
      if (c.position.x > 44) c.position.x = -44;
    }
  }

  dispose() {
    this.scene.remove(this.sky, this.ground, this.tufts, this.hemi, this.ambient, this.sun, this.sun.target, this.fill, this.fill.target);
    this.clouds.forEach(c => this.scene.remove(c));
    [this.sky, this.ground, this.tufts].forEach(o => {
      if (!o) return;
      o.geometry.dispose();
      if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose();
    });
    if (this.envMap) this.envMap.dispose();
    this.scene.environment = null;
  }
}

/* ---------------- 房子外觀 ---------------- */
const ROOF_COLORS = {
  house_cottage: { roof: '#ff9fb4', wall: '#fff4e4', trim: '#f5c98e', door: '#b98a5f' },
  house_mushroom: { roof: '#f2798b', wall: '#fff1dd', trim: '#f7d9ae', door: '#9b6b45' },
  house_cloud: { roof: '#a9dcff', wall: '#f4fbff', trim: '#cfeaff', door: '#8fb8d8' },
  house_castle: { roof: '#b79bf0', wall: '#f7efff', trim: '#d9c8ff', door: '#8a6fb5' }
};

function makePlaqueTexture(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f7e0ae';
  const r = 26;
  ctx.beginPath();
  ctx.moveTo(14 + r, 12);
  ctx.arcTo(626, 12, 626, 148, r);
  ctx.arcTo(626, 148, 14, 148, r);
  ctx.arcTo(14, 148, 14, 12, r);
  ctx.arcTo(14, 12, 626, 12, r);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#d9ae6d';
  ctx.stroke();
  ctx.fillStyle = '#7a5c3e';
  ctx.font = 'bold 62px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label = String(name || '我的小屋');
  ctx.fillText(label.length > 9 ? label.slice(0, 9) + '…' : label, 320, 84);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function disposeGroup(group) {
  group.traverse(o => {
    if (o.isMesh) {
      o.geometry.dispose();
      if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose();
    }
  });
}

export class HouseBuilder {
  constructor(scene, catalogMap) {
    this.scene = scene;
    this.catalogMap = catalogMap;
    this.group = new THREE.Group();
    this.group.name = 'house';
    scene.add(this.group);
    this.wallBoxes = [];
    this.pickMeshes = [];
    this.modelId = 'house_cottage';
    this.name = '';
  }

  setModel(modelId, name) {
    const meta = this.catalogMap[modelId];
    const id = meta && meta.category === 'house' ? modelId : 'house_cottage';
    this.modelId = id;
    this.name = name || this.name || '';
    this._clear();
    this._buildShell(id);
    this._buildRoof(id);
    this._buildPlaque(this.name);
    return id;
  }

  setName(name) {
    this.name = name || '';
    if (this.plaque) {
      this.plaque.material.map.dispose();
      this.plaque.material.dispose();
      this.group.remove(this.plaque);
      this.plaque = null;
    }
    this._buildPlaque(this.name);
  }

  _clear() {
    if (this.shell) {
      this.group.remove(this.shell);
      disposeGroup(this.shell);
      this.shell = null;
    }
    this.wallBoxes = [];
    this.pickMeshes = [];
    this.plaque = null;
    this._roofChildren = [];
  }

  _addWallBox(cx, cz, w, d) {
    this.wallBoxes.push({
      minX: cx - w / 2, maxX: cx + w / 2,
      minZ: cz - d / 2, maxZ: cz + d / 2
    });
  }

  _buildShell(id) {
    const pal = ROOF_COLORS[id] || ROOF_COLORS.house_cottage;
    const g = new THREE.Group();
    this.shell = g;
    this.group.add(g);

    const wallMat = new THREE.MeshStandardMaterial({
      color: pal.wall, map: wallTexture(), roughness: 0.9, emissive: '#ffedcf', emissiveIntensity: 0.14
    });
    const trimMat = new THREE.MeshStandardMaterial({ color: pal.trim, roughness: 0.8 });
    const doorMat = new THREE.MeshStandardMaterial({ color: pal.door, roughness: 0.75 });
    const glassMat = new THREE.MeshStandardMaterial({
      color: '#c6ecff', emissive: '#8fd8ff', emissiveIntensity: 0.32,
      roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.55, envMapIntensity: 1.4
    });
    const woodMat = new THREE.MeshStandardMaterial({ color: '#f0d3a6', roughness: 0.85 });

    const { outer, wallHeight: H, wallThickness: T } = HOUSE;
    const W = outer.maxX - outer.minX;
    const D = outer.maxZ - outer.minZ;
    const doorHalf = HOUSE.doorWidth / 2;
    const sideW = (W - HOUSE.doorWidth) / 2;

    const addWall = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };

    // 地板（有厚度，讓屋內外有小小台階）
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(W, HOUSE.floorTop, D),
      new THREE.MeshStandardMaterial({ color: '#ffffff', map: floorTexture(), roughness: 0.82 })
    );
    floor.position.y = HOUSE.floorTop / 2;
    floor.receiveShadow = true;
    floor.castShadow = true;
    g.add(floor);
    this.pickMeshes.push(floor);

    // 木頭地板拼線
    const seamMat = new THREE.MeshStandardMaterial({ color: '#c49a68', roughness: 1 });
    for (let i = -2; i <= 2; i++) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(W - 0.3, 0.005, 0.025), seamMat);
      seam.position.set(0, HOUSE.floorTop + 0.003, i * 0.95);
      g.add(seam);
    }
    // 踢腳板
    const baseMat = new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.75 });
    const baseH = 0.12;
    const addBase = (w, d, x, z) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, baseH, d), baseMat);
      b.position.set(x, baseH / 2 + HOUSE.floorTop, z);
      b.castShadow = true;
      b.receiveShadow = true;
      g.add(b);
    };
    addBase(W - 0.3, 0.05, 0, outer.minZ + T / 2 + 0.03);
    addBase(0.05, D - 0.3, outer.minX + T / 2 + 0.03, 0);
    addBase(0.05, D - 0.3, outer.maxX - T / 2 - 0.03, 0);
    addBase(sideW - 0.1, 0.05, -(doorHalf + sideW / 2), outer.maxZ - T / 2 - 0.03);
    addBase(sideW - 0.1, 0.05, doorHalf + sideW / 2, outer.maxZ - T / 2 - 0.03);

    // 四面牆（前面留門洞）
    addWall(W, H, T, 0, H / 2, outer.minZ);
    this._addWallBox(0, outer.minZ, W, T);
    addWall(T, H, D, outer.minX, H / 2, 0);
    this._addWallBox(outer.minX, 0, T, D);
    addWall(T, H, D, outer.maxX, H / 2, 0);
    this._addWallBox(outer.maxX, 0, T, D);
    addWall(sideW, H, T, -(doorHalf + sideW / 2), H / 2, outer.maxZ);
    this._addWallBox(-(doorHalf + sideW / 2), outer.maxZ, sideW, T);
    addWall(sideW, H, T, doorHalf + sideW / 2, H / 2, outer.maxZ);
    this._addWallBox(doorHalf + sideW / 2, outer.maxZ, sideW, T);
    // 門楣
    const lintelH = H - HOUSE.doorHeight;
    addWall(HOUSE.doorWidth, lintelH, T, 0, HOUSE.doorHeight + lintelH / 2, outer.maxZ);

    // 門框與踏墊
    const frame = new THREE.Mesh(new THREE.BoxGeometry(HOUSE.doorWidth + 0.16, 0.1, T + 0.06), doorMat);
    frame.position.set(0, HOUSE.doorHeight + 0.05, outer.maxZ);
    frame.castShadow = true;
    g.add(frame);
    [-1, 1].forEach(s => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, HOUSE.doorHeight, T + 0.06), doorMat);
      post.position.set(s * (doorHalf + 0.05), HOUSE.doorHeight / 2, outer.maxZ);
      post.castShadow = true;
      g.add(post);
      // 門框立柱也有碰撞，玩家不會從門框邊緣穿模
      this._addWallBox(s * (doorHalf + 0.05), outer.maxZ, 0.14, T + 0.1);
    });
    // 半開的門板，貼在門框左側，不擋住通道
    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.72, HOUSE.doorHeight - 0.08, 0.05), doorMat);
    doorPanel.position.set(-doorHalf - 0.45, HOUSE.doorHeight / 2, outer.maxZ + 0.3);
    doorPanel.rotation.y = -Math.PI / 2.4;
    doorPanel.castShadow = true;
    g.add(doorPanel);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshStandardMaterial({
      color: '#e8c681', roughness: 0.28, metalness: 0.8
    }));
    knob.position.set(-doorHalf - 0.18, 1.02, outer.maxZ + 0.56);
    g.add(knob);
    const mat = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.03, 0.7), new THREE.MeshStandardMaterial({ color: '#d99bb0', roughness: 1 }));
    mat.position.set(0, HOUSE.floorTop + 0.016, outer.maxZ + 0.34);
    mat.receiveShadow = true;
    g.add(mat);

    // 窗戶（左右各一）
    const winFrame = new THREE.MeshStandardMaterial({ color: pal.trim, roughness: 0.8 });
    [-1, 1].forEach(s => {
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.02, 1.18), glassMat);
      glass.position.set(s * (outer.maxX - 0.02), 1.55, -0.55);
      g.add(glass);
      const fTop = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.11, 1.4), winFrame);
      const fBot = fTop.clone();
      const fL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.24, 0.11), winFrame);
      const fR = fL.clone();
      fTop.position.set(s * (outer.maxX - 0.005), 2.12, -0.55);
      fBot.position.set(s * (outer.maxX - 0.005), 0.98, -0.55);
      fL.position.set(s * (outer.maxX - 0.005), 1.55, -1.2);
      fR.position.set(s * (outer.maxX - 0.005), 1.55, 0.1);
      [fTop, fBot, fL, fR].forEach(m => { m.castShadow = true; g.add(m); });
    });

    // 門口小盆栽
    const potMat = new THREE.MeshStandardMaterial({ color: '#e7a3b8', roughness: 0.9 });
    const leafMat = new THREE.MeshStandardMaterial({ color: '#7bc98b', roughness: 0.9 });
    [-1, 1].forEach(s => {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.24, 10), potMat);
      pot.position.set(s * 1.25, 0.12, outer.maxZ + 0.16);
      pot.castShadow = true;
      g.add(pot);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), leafMat);
      leaf.position.set(s * 1.25, 0.33, outer.maxZ + 0.16);
      leaf.scale.y = 1.2;
      leaf.castShadow = true;
      g.add(leaf);
    });

    // 屋內小燈，讓室內不要全黑
    // 室內暖光：屋頂蓋上後，靠這盞燈把奶油色牆面照亮
    const lamp = new THREE.PointLight('#fff0d6', 6, 10, 1.55);
    lamp.position.set(0, 1.55, 0);
    g.add(lamp);
    const doorGlow = new THREE.PointLight('#fff4de', 2.6, 7, 1.8);
    doorGlow.position.set(0, 1.9, 1.9);
    g.add(doorGlow);
  }

  _buildRoof(id) {
    const g = this.shell;
    const startIndex = g.children.length;
    const pal = ROOF_COLORS[id] || ROOF_COLORS.house_cottage;
    const roofMat = new THREE.MeshStandardMaterial({ color: pal.roof, roughness: 0.75, flatShading: true });
    const trimMat = new THREE.MeshStandardMaterial({ color: pal.trim, roughness: 0.8 });
    const y = HOUSE.wallHeight;
    const W = HOUSE.outer.maxX - HOUSE.outer.minX;
    // 天花板：屋頂收起時一起隱藏，探索時讓室內更溫暖
    const ceiling = new THREE.Mesh(
      new THREE.BoxGeometry(W - 0.1, 0.08, HOUSE.outer.maxZ - HOUSE.outer.minZ - 0.1),
      new THREE.MeshBasicMaterial({ color: '#fff6e4' })
    );
    ceiling.position.y = y - 0.24;   // 壓在屋頂裝飾下方，探索時才看得到乾淨的天花板
    ceiling.receiveShadow = true;
    g.add(ceiling);

    // 吊燈（跟著天花板一起顯示，探索時室內更有氣氛）
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6),
      new THREE.MeshStandardMaterial({ color: '#8b7fa0', roughness: 0.6 })
    );
    cord.position.set(0, y - 0.4, 0);
    g.add(cord);
    const shadeMat = new THREE.MeshStandardMaterial({
      color: '#fff1c9', roughness: 0.55, emissive: '#ffd966', emissiveIntensity: 0.28,
      side: THREE.DoubleSide
    });
    const pendant = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.32, 0.24, 20, 1, true), shadeMat);
    pendant.position.set(0, y - 0.62, 0);
    g.add(pendant);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 10, 8),
      new THREE.MeshStandardMaterial({ color: '#fff7d6', emissive: '#ffe08a', emissiveIntensity: 1.2 })
    );
    bulb.position.set(0, y - 0.7, 0);
    g.add(bulb);

    if (id === 'house_mushroom') {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(5.05, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), roofMat);
      cap.position.y = y - 0.15;
      cap.scale.y = 0.62;
      cap.castShadow = true;
      g.add(cap);
      const spotMat = new THREE.MeshStandardMaterial({ color: '#fff6ee', roughness: 0.9 });
      const spots = [[0, 2.72, 2.3, 0.42], [2.6, 1.55, 1.4, 0.34], [-2.4, 1.7, 1.6, 0.36], [1.5, 2.1, -2.2, 0.3], [-1.6, 2.2, -1.9, 0.28]];
      spots.forEach(([x, sy, z, r]) => {
        const spot = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), spotMat);
        spot.position.set(x, y - 0.15 + sy * 0.62, z);
        spot.scale.set(1, 0.35, 1);
        g.add(spot);
      });
      const stemTrim = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.7, 0.2, 28), trimMat);
      stemTrim.position.y = y - 0.05;
      g.add(stemTrim);
      this._captureRoof(startIndex);
      return;
    }

    if (id === 'house_cloud') {
      const puffMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, emissive: '#dff4ff', emissiveIntensity: 0.25 });
      const puffs = [[0, 0.7, 0, 2.4], [2.1, 0.2, 0.3, 1.7], [-2.2, 0.25, -0.2, 1.8], [0.8, 0.1, -1.8, 1.5], [-1.2, 0.15, 1.8, 1.5]];
      puffs.forEach(([x, py, z, r]) => {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), puffMat);
        puff.position.set(x, y + py, z);
        puff.scale.y = 0.55;
        puff.castShadow = true;
        g.add(puff);
      });
      const trim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.25, 0.22, 5.75), trimMat);
      trim.position.y = y + 0.1;
      trim.castShadow = true;
      g.add(trim);
      this._captureRoof(startIndex);
      return;
    }

    if (id === 'house_castle') {
      const turretMat = new THREE.MeshStandardMaterial({ color: pal.wall, roughness: 0.85 });
      const coneMat = new THREE.MeshStandardMaterial({ color: pal.roof, roughness: 0.7, flatShading: true });
      const spots = [[-4.0, -3.05], [4.0, -3.05], [-4.0, 3.05], [4.0, 3.05]];
      spots.forEach(([x, z]) => {
        const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.66, 4.3, 12), turretMat);
        turret.position.set(x, 2.15, z);
        turret.castShadow = true;
        turret.receiveShadow = true;
        g.add(turret);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.78, 1.5, 12), coneMat);
        cone.position.set(x, 5.05, z);
        cone.castShadow = true;
        g.add(cone);
        this._addWallBox(x, z, 1.25, 1.25);
      });
      const roof = new THREE.Mesh(new THREE.ConeGeometry(5.15, 2.6, 4), roofMat);
      roof.position.y = y + 1.3;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      g.add(roof);
      const band = new THREE.Mesh(new THREE.BoxGeometry(W + 0.35, 0.3, 5.85), trimMat);
      band.position.y = y + 0.05;
      g.add(band);
      this._captureRoof(startIndex);
      return;
    }

    // 奶油小屋：尖尖屋頂 + 煙囪
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.3, 2.9, 4), roofMat);
    roof.position.y = y + 1.45;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    const band = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.22, 5.8), trimMat);
    band.position.y = y + 0.06;
    band.castShadow = true;
    g.add(band);

    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.5, 0.55), new THREE.MeshStandardMaterial({ color: '#e8b3a1', roughness: 0.9 }));
    chimney.position.set(1.75, y + 1.65, -1.1);
    chimney.castShadow = true;
    g.add(chimney);
    const smokeMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.65, roughness: 1 });
    for (let i = 0; i < 3; i++) {
      const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.22 + i * 0.07, 10, 8), smokeMat);
      smoke.position.set(1.75 + i * 0.18, y + 2.55 + i * 0.45, -1.1);
      g.add(smoke);
    }
    this._captureRoof(startIndex);
  }

  _captureRoof(startIndex) {
    this._roofChildren = this.shell.children.slice(startIndex);
  }

  setRoofVisible(visible) {
    if (!this.shell) return;
    if (this._roofChildren === undefined) return;
    this._roofChildren.forEach(o => { o.visible = !!visible; });
  }

  _buildPlaque(name) {
    const tex = makePlaqueTexture(name);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), mat);
    plaque.position.set(0, 2.42, HOUSE.outer.maxZ + 0.15);
    this.group.add(plaque);
    this.plaque = plaque;
  }

  dispose() {
    this._clear();
    this.scene.remove(this.group);
  }
}
