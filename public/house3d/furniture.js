/* OC 房子 3D：程序化高細節家具、材質貼圖與獨立碰撞設定
 *
 * 所有模型都由 Three.js 幾何體即時組合，不載入外部 GLB。
 * 木紋、布料、皮革、金屬、大理石、玻璃與畫作使用 CanvasTexture，
 * 材質與貼圖會快取共用；刪除家具時只釋放「每個模型獨有」的幾何體，
 * 不會誤刪其他家具仍在使用的材質。
 */
import * as THREE from '../vendor/three.module.js';

/* ---------------- 程式化貼圖 ---------------- */
const TEX_CACHE = new Map();

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvasTex(key, size, draw, repeatX = 1, repeatY = 1) {
  if (TEX_CACHE.has(key)) return TEX_CACHE.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  draw(ctx, size);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  TEX_CACHE.set(key, t);
  return t;
}

function woodTexture(name, base, dark, light) {
  return canvasTex('wood-' + name, 256, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    const rnd = seeded(name.length * 7919 + 31);
    for (let i = 0; i < 78; i++) {
      const y = rnd() * s;
      const amp = 2 + rnd() * 6;
      ctx.beginPath();
      ctx.strokeStyle = i % 4 === 0 ? dark : 'rgba(90,58,32,.16)';
      ctx.globalAlpha = 0.16 + rnd() * 0.24;
      ctx.lineWidth = 0.7 + rnd() * 2.1;
      for (let x = -4; x <= s + 4; x += 5) {
        const yy = y + Math.sin((x / s) * Math.PI * 3 + i) * amp;
        if (x === -4) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 0.3;
    for (let i = 0; i < 4; i++) {
      const cx = rnd() * s;
      const cy = rnd() * s;
      ctx.strokeStyle = dark;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 4 + rnd() * 8, 2 + rnd() * 4, rnd(), 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = light;
      ctx.globalAlpha = 0.16;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 2 + rnd() * 3, 1 + rnd() * 2, rnd(), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.3;
    }
    const g = ctx.createLinearGradient(0, 0, s, 0);
    g.addColorStop(0, 'rgba(255,255,255,.08)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,.08)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }, 2, 2);
}

function fabricTexture(name, base) {
  return canvasTex('fabric-' + name, 128, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    const rnd = seeded(name.length * 104729 + 7);
    for (let y = 0; y < s; y += 3) {
      ctx.fillStyle = 'rgba(255,255,255,.055)';
      ctx.fillRect(0, y, s, 1);
      ctx.fillStyle = 'rgba(0,0,0,.045)';
      ctx.fillRect(0, y + 1, s, 1);
    }
    for (let x = 0; x < s; x += 3) {
      ctx.fillStyle = 'rgba(255,255,255,.035)';
      ctx.fillRect(x, 0, 1, s);
    }
    for (let i = 0; i < 360; i++) {
      ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,.09)' : 'rgba(0,0,0,.05)';
      ctx.fillRect(rnd() * s, rnd() * s, 1, 1);
    }
  }, 3, 3);
}

function leatherTexture(name, base, dark) {
  return canvasTex('leather-' + name, 128, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    const rnd = seeded(name.length * 65537 + 13);
    for (let i = 0; i < 180; i++) {
      ctx.globalAlpha = 0.06 + rnd() * 0.14;
      ctx.fillStyle = rnd() > 0.5 ? dark : '#ffffff';
      ctx.beginPath();
      ctx.ellipse(rnd() * s, rnd() * s, 1 + rnd() * 5, 1 + rnd() * 3, rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, 2, 2);
}

function metalTexture(base, dark) {
  return canvasTex('metal-' + base, 256, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    const rnd = seeded(base.length * 3571 + 5);
    for (let x = 0; x < s; x += 2) {
      ctx.globalAlpha = 0.04 + rnd() * 0.14;
      ctx.fillStyle = rnd() > 0.45 ? '#ffffff' : dark;
      ctx.fillRect(x, 0, 1, s);
    }
    const g = ctx.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, 'rgba(255,255,255,.22)');
    g.addColorStop(0.45, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,.16)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }, 1, 1);
}

function marbleTexture() {
  return canvasTex('marble-white', 256, (ctx, s) => {
    ctx.fillStyle = '#f7f4ee';
    ctx.fillRect(0, 0, s, s);
    const rnd = seeded(98765);
    for (let i = 0; i < 15; i++) {
      ctx.beginPath();
      ctx.strokeStyle = i % 3 === 0 ? 'rgba(135,130,122,.38)' : 'rgba(180,174,166,.28)';
      ctx.lineWidth = 0.7 + rnd() * 2;
      let x = rnd() * s;
      ctx.moveTo(x, -5);
      for (let y = -5; y < s + 6; y += 7) {
        x += (rnd() - 0.5) * 10;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, 1, 1);
}

function rugTexture(name, base, accent, border) {
  return canvasTex('rug-' + name, 256, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = border;
    ctx.lineWidth = 12;
    ctx.strokeRect(7, 7, s - 14, s - 14);
    ctx.lineWidth = 3;
    ctx.strokeRect(22, 22, s - 44, s - 44);
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        if ((i + j) % 2) continue;
        ctx.beginPath();
        ctx.arc(48 + i * 40, 48 + j * 40, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 1;
    for (let y = 0; y < s; y += 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(s, y);
      ctx.stroke();
    }
  }, 1, 1);
}

function artTexture() {
  return canvasTex('art-landscape', 256, (ctx, s) => {
    const sky = ctx.createLinearGradient(0, 0, 0, s);
    sky.addColorStop(0, '#a9d8f7');
    sky.addColorStop(0.55, '#f8e6c4');
    sky.addColorStop(1, '#d9b98a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#ffe7a3';
    ctx.beginPath();
    ctx.arc(190, 62, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7dbd83';
    ctx.beginPath();
    ctx.moveTo(0, 190);
    ctx.quadraticCurveTo(70, 120, 150, 186);
    ctx.quadraticCurveTo(205, 225, 256, 176);
    ctx.lineTo(256, 256);
    ctx.lineTo(0, 256);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5f9f6a';
    ctx.beginPath();
    ctx.moveTo(0, 220);
    ctx.quadraticCurveTo(90, 172, 180, 218);
    ctx.quadraticCurveTo(225, 238, 256, 212);
    ctx.lineTo(256, 256);
    ctx.lineTo(0, 256);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3f7a51';
    ctx.fillRect(48, 168, 6, 46);
    ctx.beginPath();
    ctx.arc(51, 160, 22, 0, Math.PI * 2);
    ctx.fill();
  }, 1, 1);
}

/* ---------------- 材質 ---------------- */
const MAT_CACHE = new Map();

function materialKey(color, tex, opts) {
  return [color, tex, opts.roughness, opts.metalness, opts.emissive, opts.emissiveIntensity,
    opts.transparent ? 1 : 0, opts.opacity, opts.side || 0, opts.flat ? 1 : 0,
    opts.envMapIntensity].join('|');
}

function mat(color, opts = {}) {
  const tex = opts.tex || null;
  const key = materialKey(color, tex, {
    roughness: opts.roughness ?? 0.82,
    metalness: opts.metalness ?? 0,
    emissive: opts.emissive ?? '',
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    side: opts.side || 0,
    flat: !!opts.flat,
    envMapIntensity: opts.envMapIntensity ?? 0.55
  });
  if (MAT_CACHE.has(key)) return MAT_CACHE.get(key);
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.82,
    metalness: opts.metalness ?? 0,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 0,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
    side: opts.side || THREE.FrontSide,
    flatShading: !!opts.flat,
    envMapIntensity: opts.envMapIntensity ?? 0.55
  });
  if (tex) {
    m.map = getTexture(tex);
    m.color.set('#ffffff');
  }
  MAT_CACHE.set(key, m);
  return m;
}

function getTexture(name) {
  if (name.startsWith('wood-')) {
    const map = {
      'wood-light': ['#d9b783', '#a9774c', '#f1d6ab'],
      'wood-medium': ['#b98a5f', '#7d5334', '#d8b07c'],
      'wood-dark': ['#8a5f3c', '#5e3c23', '#b1855e'],
      'wood-white': ['#efe4d3', '#c4b39c', '#fff8ee']
    };
    const c = map[name] || map['wood-medium'];
    return woodTexture(name.slice(5), c[0], c[1], c[2]);
  }
  if (name.startsWith('fabric-')) {
    const map = {
      'fabric-blue': '#bcdcf7', 'fabric-pink': '#ffc9de', 'fabric-cream': '#fff1dd',
      'fabric-green': '#a8e6c3', 'fabric-lilac': '#d8c8f2', 'fabric-grey': '#c9c7cf'
    };
    return fabricTexture(name.slice(7), map[name] || '#e9e2d8');
  }
  if (name.startsWith('leather-')) {
    const map = { 'leather-tan': ['#b98255', '#7a4c2c'], 'leather-brown': ['#7f5436', '#4f3120'] };
    const c = map[name] || map['leather-tan'];
    return leatherTexture(name.slice(8), c[0], c[1]);
  }
  if (name === 'metal-silver') return metalTexture('#d9dee4', '#7d8791');
  if (name === 'metal-dark') return metalTexture('#5d6168', '#292c31');
  if (name === 'metal-gold') return metalTexture('#e8c681', '#a57b34');
  if (name === 'marble-white') return marbleTexture();
  if (name.startsWith('rug-')) {
    const map = {
      'rug-pink': ['#ffd3e0', '#fff4f7', '#ef9ab4'],
      'rug-blue': ['#c9e6ff', '#f6fbff', '#7fb6e8'],
      'rug-cream': ['#f6e3c5', '#fffaf0', '#d8b07c']
    };
    const c = map[name] || map['rug-pink'];
    return rugTexture(name.slice(4), c[0], c[1], c[2]);
  }
  if (name === 'art-landscape') return artTexture();
  return null;
}

const M = {
  woodLight: mat('#ffffff', { tex: 'wood-light', roughness: 0.62 }),
  wood: mat('#ffffff', { tex: 'wood-medium', roughness: 0.64 }),
  woodDark: mat('#ffffff', { tex: 'wood-dark', roughness: 0.66 }),
  woodWhite: mat('#ffffff', { tex: 'wood-white', roughness: 0.7 }),
  fabricBlue: mat('#ffffff', { tex: 'fabric-blue', roughness: 0.97 }),
  fabricPink: mat('#ffffff', { tex: 'fabric-pink', roughness: 0.97 }),
  fabricCream: mat('#ffffff', { tex: 'fabric-cream', roughness: 0.97 }),
  fabricGreen: mat('#ffffff', { tex: 'fabric-green', roughness: 0.97 }),
  fabricLilac: mat('#ffffff', { tex: 'fabric-lilac', roughness: 0.97 }),
  fabricGrey: mat('#ffffff', { tex: 'fabric-grey', roughness: 0.97 }),
  leather: mat('#ffffff', { tex: 'leather-tan', roughness: 0.5 }),
  leatherBrown: mat('#ffffff', { tex: 'leather-brown', roughness: 0.52 }),
  metal: mat('#ffffff', { tex: 'metal-silver', roughness: 0.3, metalness: 0.78 }),
  metalDark: mat('#ffffff', { tex: 'metal-dark', roughness: 0.34, metalness: 0.7 }),
  gold: mat('#ffffff', { tex: 'metal-gold', roughness: 0.26, metalness: 0.85 }),
  marble: mat('#ffffff', { tex: 'marble-white', roughness: 0.24 }),
  glass: mat('#dff4ff', {
    roughness: 0.06, metalness: 0.2, transparent: true, opacity: 0.34, envMapIntensity: 1.4
  }),
  mirror: mat('#cfe4f2', {
    roughness: 0.04, metalness: 0.92, transparent: true, opacity: 0.65, envMapIntensity: 1.6
  }),
  ceramic: mat('#fffdf8', { roughness: 0.16 }),
  chrome: mat('#eef3f6', { roughness: 0.12, metalness: 0.95 }),
  black: mat('#2c2f36', { roughness: 0.5, metalness: 0.25 }),
  screen: mat('#1d2b3d', { roughness: 0.18, metalness: 0.3, emissive: '#2f5f8f', emissiveIntensity: 0.5 }),
  warmLight: mat('#fff2c4', { roughness: 0.4, emissive: '#ffd966', emissiveIntensity: 0.9 }),
  flame: mat('#ffb347', { roughness: 0.4, emissive: '#ff8c42', emissiveIntensity: 0.9 }),
  leaf: mat('#72bf83', { roughness: 0.86 }),
  leafDark: mat('#4f9d68', { roughness: 0.88 }),
  leafLight: mat('#9ada9f', { roughness: 0.9 }),
  soil: mat('#6e4b34', { roughness: 1 }),
  stone: mat('#b9b3ad', { roughness: 0.95, flat: true }),
  stoneLight: mat('#d4cec5', { roughness: 0.94, flat: true }),
  water: mat('#8fd8f2', {
    roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.72, envMapIntensity: 1.2
  }),
  white: mat('#fffdf8', { roughness: 0.5 }),
  cream: mat('#fff3df', { roughness: 0.85 })
};

function asMat(value, opts = {}) {
  if (value && value.isMaterial) return value;
  return mat(value || '#e9e2d8', opts);
}

/* ---------------- 幾何小工具 ---------------- */
function mesh(g, geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}

function box(g, w, h, d, color, x = 0, y = 0, z = 0, opts = {}) {
  return mesh(g, new THREE.BoxGeometry(w, h, d), asMat(color, opts), x, y + h / 2, z);
}

function cyl(g, rt, rb, h, color, x = 0, y = 0, z = 0, seg = 16, opts = {}) {
  return mesh(g, new THREE.CylinderGeometry(rt, rb, h, seg), asMat(color, opts), x, y + h / 2, z);
}

function sph(g, r, color, x = 0, y = 0, z = 0, opts = {}) {
  return mesh(g, new THREE.SphereGeometry(r, 16, 12), asMat(color, opts), x, y, z);
}

function cone(g, r, h, color, x = 0, y = 0, z = 0, seg = 16, opts = {}) {
  return mesh(g, new THREE.ConeGeometry(r, h, seg), asMat(color, opts), x, y + h / 2, z);
}

function torus(g, r, tube, color, x, y, z, opts = {}) {
  return mesh(g, new THREE.TorusGeometry(r, tube, 8, 24), asMat(color, opts), x, y, z);
}

function legs(g, w, d, h, color, inset = 0.08, size = 0.07) {
  const xs = [-w / 2 + inset, w / 2 - inset];
  const zs = [-d / 2 + inset, d / 2 - inset];
  xs.forEach(x => zs.forEach(z => box(g, size, h, size, color, x, 0, z)));
}

function cushioned(g, w, h, d, material, x, y, z) {
  const m = box(g, w, h, d, material, x, y, z);
  m.geometry = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
  return m;
}

function pillow(g, w, h, d, material, x, y, z, tilt = 0) {
  const p = box(g, w, h, d, material, x, y, z);
  p.rotation.x = tilt;
  return p;
}

/* ---------------- 家具模型 ---------------- */
function bedModel(g, w, d, colors) {
  const frame = colors.frame || M.woodLight;
  const quilt = colors.quilt || M.fabricPink;
  const accent = colors.accent || M.fabricCream;
  const legH = 0.12;
  legs(g, w - 0.1, d - 0.1, legH, frame, 0.1, 0.09);
  box(g, w, 0.24, d, frame, 0, legH, 0);
  box(g, w, 0.07, d, M.woodDark, 0, legH + 0.24, 0);
  box(g, w + 0.04, 0.82, 0.12, frame, 0, legH + 0.16, -d / 2 + 0.06);
  const mattressW = w - 0.1;
  const mattressD = d - 0.16;
  box(g, mattressW, 0.24, mattressD, M.fabricCream, 0, legH + 0.31, 0.04);
  box(g, mattressW + 0.02, 0.14, mattressD * 0.58, quilt, 0, legH + 0.55, mattressD * 0.19);
  box(g, mattressW + 0.03, 0.07, 0.34, accent, 0, legH + 0.69, mattressD * 0.4);
  const pillowW = w > 1.4 ? (w - 0.22) / 2 : w - 0.3;
  const px = w > 1.4 ? (pillowW / 2 + 0.03) : 0;
  pillow(g, pillowW, 0.14, 0.38, M.fabricCream, -px, legH + 0.58, -d / 2 + 0.35, -0.12);
  if (w > 1.4) pillow(g, pillowW, 0.14, 0.38, M.fabricCream, px, legH + 0.58, -d / 2 + 0.35, -0.12);
  // 床尾板與鉚釘
  box(g, w + 0.04, 0.42, 0.1, frame, 0, legH + 0.16, d / 2 - 0.05);
  for (let i = -1; i <= 1; i++) {
    sph(g, 0.022, M.gold, i * w * 0.28, legH + 0.5, d / 2 + 0.005);
  }
}

function chairModel(g, { seatW = 0.62, seatD = 0.6, seatH = 0.45, backH = 0.55, fabric = M.fabricCream, frame = M.wood } = {}) {
  legs(g, seatW, seatD, seatH, frame, 0.055, 0.06);
  box(g, seatW, 0.09, seatD, frame, 0, seatH, 0);
  box(g, seatW - 0.06, 0.07, seatD - 0.06, fabric, 0, seatH + 0.09, 0);
  box(g, seatW, 0.08, 0.07, frame, 0, seatH + 0.1, -seatD / 2 + 0.04);
  [-1, 1].forEach(s => box(g, 0.055, backH, 0.06, frame, s * (seatW / 2 - 0.035), seatH + 0.12, -seatD / 2 + 0.04));
  box(g, seatW - 0.09, 0.07, 0.06, frame, 0, seatH + 0.12 + backH - 0.08, -seatD / 2 + 0.04);
  for (let i = 0; i < 3; i++) {
    box(g, seatW - 0.14, 0.06, 0.045, fabric, 0, seatH + 0.25 + i * 0.13, -seatD / 2 + 0.06);
  }
}

const FIT = {
  bed(g) { bedModel(g, 1.5, 2.1, { quilt: M.fabricPink, accent: M.fabricCream }); },
  bed_double(g) { bedModel(g, 1.7, 2.15, { quilt: M.fabricLilac, accent: M.fabricCream }); },
  bed_single(g) { bedModel(g, 1.05, 2.05, { quilt: M.fabricBlue, accent: M.fabricCream }); },

  table(g) {
    box(g, 1.1, 0.09, 0.7, M.woodLight, 0, 0.67, 0);
    box(g, 1.06, 0.05, 0.66, M.woodDark, 0, 0.62, 0);
    legs(g, 1.1, 0.7, 0.62, M.wood, 0.09, 0.08);
    cyl(g, 0.085, 0.095, 0.14, M.ceramic, 0.28, 0.76, 0.1);
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 0.66;
      cyl(g, 0.009, 0.009, 0.18, M.leafDark, 0.28 + Math.cos(a) * 0.04, 0.9, 0.1 + Math.sin(a) * 0.04, 5);
      sph(g, 0.045, [M.fabricPink, M.warmLight, M.fabricLilac][i], 0.28 + Math.cos(a) * 0.06, 1.09, 0.1 + Math.sin(a) * 0.06);
    }
  },

  chair(g) { chairModel(g, { fabric: M.fabricPink }); },

  rug(g) {
    const rug = mesh(g, new THREE.CylinderGeometry(1.15, 1.15, 0.025, 40), M.fabricPink, 0, 0.012, 0);
    rug.material = mat('#ffffff', { tex: 'rug-pink', roughness: 1 });
    const ring = torus(g, 0.98, 0.022, '#fff7fa', 0, 0.03, 0, { roughness: 1 });
    ring.rotation.x = Math.PI / 2;
    const ring2 = torus(g, 0.62, 0.018, '#efb8c8', 0, 0.032, 0, { roughness: 1 });
    ring2.rotation.x = Math.PI / 2;
  },

  sofa(g) {
    // 木腳
    legs(g, 1.7, 0.72, 0.12, M.woodDark, 0.09, 0.06);
    box(g, 1.9, 0.3, 0.9, M.fabricBlue, 0, 0.12, 0);
    // 二段座墊
    [-0.46, 0.46].forEach(x => {
      box(g, 0.88, 0.17, 0.72, M.fabricBlue, x, 0.4, 0.03);
      box(g, 0.86, 0.12, 0.7, M.fabricCream, x, 0.55, 0.04);
    });
    box(g, 1.9, 0.58, 0.2, M.fabricBlue, 0, 0.38, -0.36);
    [-0.93, 0.93].forEach(x => {
      box(g, 0.23, 0.5, 0.88, M.fabricBlue, x, 0.3, 0);
      box(g, 0.2, 0.08, 0.82, M.fabricCream, x, 0.8, 0);
    });
    pillow(g, 0.38, 0.3, 0.14, M.fabricPink, -0.48, 0.62, -0.2, 0.18);
    pillow(g, 0.34, 0.26, 0.13, M.warmLight, 0.52, 0.6, -0.18, -0.14);
    // 坐墊滾邊
    [-0.9, 0.9].forEach(x => box(g, 0.03, 0.05, 0.74, M.fabricCream, x, 0.53, 0.04));
  },

  armchair(g) {
    box(g, 0.85, 0.3, 0.85, M.fabricPink, 0, 0.08, 0);
    box(g, 0.66, 0.16, 0.66, M.fabricCream, 0, 0.38, 0.03);
    box(g, 0.85, 0.62, 0.18, M.fabricPink, 0, 0.36, -0.35);
    [-0.38, 0.38].forEach(x => box(g, 0.16, 0.46, 0.85, M.fabricPink, x, 0.28, 0));
    legs(g, 0.7, 0.7, 0.08, M.woodDark, 0.08, 0.06);
    pillow(g, 0.3, 0.25, 0.12, M.warmLight, 0, 0.46, 0.1, 0.2);
  },

  tv_cabinet(g) {
    legs(g, 1.6, 0.34, 0.1, M.metalDark, 0.1, 0.035);
    box(g, 1.8, 0.46, 0.45, M.wood, 0, 0.1, 0);
    box(g, 1.84, 0.04, 0.48, M.woodDark, 0, 0.56, 0);
    [-0.45, 0.45].forEach(x => {
      box(g, 0.86, 0.34, 0.02, M.woodLight, x, 0.16, 0.235);
      box(g, 0.1, 0.035, 0.025, M.metal, x, 0.31, 0.25);
    });
    // 電視
    box(g, 1.45, 0.82, 0.06, M.black, 0, 0.76, -0.03);
    box(g, 1.34, 0.72, 0.012, M.screen, 0, 0.81, 0.006);
    box(g, 0.32, 0.05, 0.22, M.metalDark, 0, 0.62, -0.03);
    box(g, 1.0, 0.07, 0.1, M.metalDark, 0, 0.58, 0.25);
    // 小裝飾
    sph(g, 0.07, M.leafLight, -0.68, 0.64, 0.12);
    box(g, 0.16, 0.18, 0.1, M.fabricLilac, 0.62, 0.6, 0.13);
  },

  wardrobe(g) {
    box(g, 1.25, 2.05, 0.6, M.wood, 0, 0.08, 0);
    box(g, 1.31, 0.07, 0.66, M.woodDark, 0, 2.13, 0);
    box(g, 1.07, 0.05, 0.58, M.woodDark, 0, 0.03, 0);
    legs(g, 1.15, 0.5, 0.08, M.woodDark, 0.08, 0.06);
    [-0.32, 0.32].forEach((x, i) => {
      box(g, 0.58, 1.82, 0.025, i ? M.woodLight : M.mirror, x, 0.2, 0.31);
      box(g, 0.44, 1.62, 0.02, i ? M.wood : M.mirror, x, 0.3, 0.325);
      box(g, 0.035, 0.19, 0.04, M.gold, x + (i ? -0.23 : 0.23), 1.02, 0.35);
    });
    for (let i = 0; i < 3; i++) {
      box(g, 0.68, 0.025, 0.02, M.woodDark, -0.32, 1.35 + i * 0.18, 0.34);
    }
  },

  cabinet(g) {
    box(g, 1.0, 1.05, 0.5, M.woodWhite, 0, 0.06, 0);
    box(g, 1.05, 0.05, 0.55, M.woodLight, 0, 1.11, 0);
    [-0.24, 0.24].forEach(x => {
      box(g, 0.44, 0.82, 0.025, M.woodLight, x, 0.2, 0.26);
      box(g, 0.34, 0.68, 0.018, M.woodWhite, x, 0.27, 0.275);
      sph(g, 0.035, M.gold, x + (x < 0 ? 0.15 : -0.15), 0.6, 0.3);
    });
    legs(g, 0.9, 0.4, 0.08, M.woodDark, 0.06, 0.05);
    sph(g, 0.08, M.leafLight, -0.3, 1.22, 0.02);
  },

  floor_lamp(g) {
    cyl(g, 0.24, 0.28, 0.06, M.metalDark, 0, 0, 0, 20);
    cyl(g, 0.028, 0.032, 1.48, M.metal, 0, 0.06, 0, 10);
    const shade = mesh(g, new THREE.CylinderGeometry(0.2, 0.38, 0.42, 24, 1, true), mat('#fff3d0', {
      roughness: 0.7, emissive: '#ffd966', emissiveIntensity: 0.25, side: THREE.DoubleSide
    }), 0, 1.72, 0);
    shade.castShadow = false;
    cyl(g, 0.1, 0.1, 0.04, M.gold, 0, 1.94, 0, 16);
    sph(g, 0.075, M.warmLight, 0, 1.7, 0);
    cyl(g, 0.012, 0.012, 0.08, M.metal, 0, 1.56, 0, 6);
  },

  bookshelf(g) {
    box(g, 0.95, 1.7, 0.42, M.wood, 0, 0.04, 0);
    box(g, 0.83, 1.56, 0.04, M.woodWhite, 0, 0.12, -0.2);
    for (let i = 0; i < 4; i++) box(g, 0.84, 0.035, 0.38, M.woodDark, 0, 0.44 + i * 0.36, 0);
    const colors = [M.fabricPink, M.fabricGreen, M.fabricBlue, M.warmLight, M.fabricLilac, M.fabricGrey];
    for (let i = 0; i < 14; i++) {
      const shelf = Math.floor(i / 4);
      const row = i % 4;
      if (shelf > 2) break;
      box(g, 0.085, 0.22 + (i % 3) * 0.02, 0.2, colors[i % colors.length], -0.31 + row * 0.145, 0.47 + shelf * 0.36, 0.03);
    }
    // 小盆栽與相框
    cyl(g, 0.06, 0.05, 0.1, M.ceramic, 0.29, 1.22, 0.05, 10);
    sph(g, 0.1, M.leaf, 0.29, 1.38, 0.05);
    box(g, 0.18, 0.22, 0.02, M.woodDark, -0.28, 1.36, 0.08);
    box(g, 0.14, 0.17, 0.015, M.screen, -0.28, 1.39, 0.095);
  },

  desk(g) {
    box(g, 1.25, 0.08, 0.65, M.woodLight, 0, 0.72, 0);
    box(g, 1.19, 0.05, 0.59, M.woodDark, 0, 0.68, 0);
    legs(g, 1.25, 0.65, 0.68, M.wood, 0.07, 0.07);
    box(g, 0.38, 0.52, 0.52, M.wood, 0.4, 0.12, 0);
    for (let i = 0; i < 3; i++) {
      box(g, 0.33, 0.13, 0.02, M.woodLight, 0.4, 0.18 + i * 0.15, 0.265);
      box(g, 0.05, 0.02, 0.025, M.metal, 0.4, 0.26 + i * 0.15, 0.28);
    }
    // 檯燈、書本、杯子
    cyl(g, 0.09, 0.11, 0.03, M.metalDark, -0.38, 0.8, -0.08, 14);
    cyl(g, 0.012, 0.012, 0.32, M.metal, -0.38, 0.83, -0.08, 8);
    const shade = mesh(g, new THREE.ConeGeometry(0.13, 0.18, 16, 1, true), mat('#fff0c8', {
      roughness: 0.6, emissive: '#ffd966', emissiveIntensity: 0.3, side: THREE.DoubleSide
    }), -0.38, 1.19, -0.08);
    shade.castShadow = false;
    box(g, 0.3, 0.035, 0.22, M.fabricBlue, -0.22, 0.8, 0.12);
    box(g, 0.28, 0.03, 0.2, M.woodWhite, -0.22, 0.835, 0.12);
    cyl(g, 0.045, 0.04, 0.11, M.ceramic, 0.15, 0.8, 0.16, 12);
  },

  stool(g) {
    cyl(g, 0.27, 0.25, 0.12, M.fabricPink, 0, 0.38, 0, 22);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const leg = box(g, 0.055, 0.38, 0.055, M.wood, Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16);
      leg.rotation.z = -Math.cos(a) * 0.11;
      leg.rotation.x = Math.sin(a) * 0.11;
    }
    torus(g, 0.15, 0.014, M.woodDark, 0, 0.12, 0).rotation.x = Math.PI / 2;
  },

  canopy_bed(g) {
    bedModel(g, 1.7, 2.2, { quilt: M.fabricLilac, accent: M.fabricCream });
    [[-0.82, -1.04], [0.82, -1.04], [-0.82, 1.04], [0.82, 1.04]].forEach(([x, z]) => {
      cyl(g, 0.042, 0.042, 2.3, M.gold, x, 0.12, z, 10);
      sph(g, 0.07, M.gold, x, 2.46, z);
    });
    box(g, 1.82, 0.1, 2.34, M.woodLight, 0, 2.42, 0);
    box(g, 1.74, 0.06, 2.26, M.fabricCream, 0, 2.52, 0);
    // 半透明床幔
    const drape = mat('#f8ecff', {
      roughness: 0.9, transparent: true, opacity: 0.55, side: THREE.DoubleSide
    });
    [-1, 1].forEach(s => {
      const p = mesh(g, new THREE.PlaneGeometry(0.72, 1.8, 6, 1), drape, s * 0.88, 1.46, 0.5);
      p.rotation.y = s * Math.PI / 2;
      p.castShadow = false;
    });
    box(g, 1.66, 0.1, 0.5, M.fabricLilac, 0, 2.36, 0.78);
  },

  dining_table(g) {
    box(g, 1.55, 0.09, 0.95, M.woodLight, 0, 0.72, 0);
    box(g, 1.49, 0.1, 0.89, M.wood, 0, 0.63, 0);
    legs(g, 1.45, 0.85, 0.63, M.woodDark, 0.09, 0.09);
    // 桌巾與水果盤
    box(g, 1.05, 0.012, 0.5, M.fabricCream, 0, 0.815, 0);
    cyl(g, 0.2, 0.16, 0.08, M.ceramic, 0, 0.83, 0, 20);
    sph(g, 0.07, '#ff9f6e', -0.07, 0.94, 0.02);
    sph(g, 0.06, '#ffe08a', 0.06, 0.93, -0.04);
    sph(g, 0.055, '#a8e6c3', 0.02, 0.93, 0.08);
    cyl(g, 0.04, 0.05, 0.15, M.glass, 0.52, 0.82, 0.2, 12);
  },

  dining_chair(g) {
    chairModel(g, { seatW: 0.5, seatD: 0.52, seatH: 0.46, backH: 0.62, fabric: M.fabricCream, frame: M.wood });
    box(g, 0.42, 0.4, 0.04, M.woodLight, 0, 0.68, -0.22);
  },

  kitchen_cabinet(g) {
    box(g, 1.2, 0.88, 0.58, M.woodWhite, 0, 0.06, 0);
    box(g, 1.24, 0.06, 0.62, M.marble, 0, 0.94, 0);
    [-0.3, 0.3].forEach(x => {
      box(g, 0.54, 0.62, 0.02, M.woodLight, x, 0.18, 0.3);
      box(g, 0.42, 0.5, 0.016, M.woodWhite, x, 0.24, 0.315);
      box(g, 0.12, 0.025, 0.03, M.metal, x, 0.52, 0.33);
    });
    box(g, 1.0, 0.04, 0.46, M.metalDark, 0, 1.0, 0);
    // 調味罐
    [-0.35, -0.22, 0.38].forEach((x, i) => {
      cyl(g, 0.045, 0.045, 0.14 + i * 0.02, i === 2 ? M.glass : M.ceramic, x, 1.0, -0.1, 12);
      cyl(g, 0.03, 0.03, 0.03, M.gold, x, 1.14 + i * 0.02, -0.1, 10);
    });
    box(g, 0.26, 0.05, 0.18, M.woodDark, 0.2, 1.0, 0.12);
  },

  computer_desk(g) {
    box(g, 1.4, 0.07, 0.7, M.woodWhite, 0, 0.73, 0);
    box(g, 1.34, 0.06, 0.64, M.wood, 0, 0.67, 0);
    [-1, 1].forEach(s => {
      box(g, 0.06, 0.67, 0.06, M.metalDark, s * 0.62, 0, 0.27);
      box(g, 0.06, 0.67, 0.06, M.metalDark, s * 0.62, 0, -0.27);
      box(g, 0.06, 0.05, 0.56, M.metalDark, s * 0.62, 0.62, 0);
    });
    box(g, 0.72, 0.42, 0.05, M.black, 0, 0.95, -0.16);
    box(g, 0.67, 0.37, 0.012, M.screen, 0, 0.98, -0.132);
    box(g, 0.1, 0.14, 0.06, M.metalDark, 0, 0.8, -0.16);
    box(g, 0.42, 0.025, 0.14, M.metalDark, 0, 0.78, 0.12);
    box(g, 0.42, 0.012, 0.13, M.black, 0, 0.8, 0.12);
    // 主機與耳機
    box(g, 0.2, 0.42, 0.42, M.metalDark, 0.5, 0.06, 0);
    box(g, 0.012, 0.3, 0.3, M.screen, 0.605, 0.12, 0);
    const hp = torus(g, 0.09, 0.018, M.black, -0.42, 0.84, 0.08);
    hp.rotation.y = Math.PI / 2;
    // 小椅收在桌下
    box(g, 0.26, 0.03, 0.26, M.fabricBlue, -0.3, 0.25, 0.28);
  },

  office_chair(g) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const arm = box(g, 0.05, 0.05, 0.28, M.metalDark, Math.cos(a) * 0.14, 0.08, Math.sin(a) * 0.14);
      arm.rotation.y = -a;
      sph(g, 0.028, M.black, Math.cos(a) * 0.27, 0.045, Math.sin(a) * 0.27);
    }
    cyl(g, 0.06, 0.06, 0.13, M.metal, 0, 0.12, 0, 12);
    cyl(g, 0.035, 0.035, 0.22, M.chrome, 0, 0.25, 0, 10);
    box(g, 0.54, 0.1, 0.54, M.fabricGrey, 0, 0.47, 0);
    box(g, 0.48, 0.1, 0.48, M.fabricBlue, 0, 0.57, 0.01);
    box(g, 0.48, 0.6, 0.1, M.fabricGrey, 0, 0.62, -0.25);
    box(g, 0.4, 0.48, 0.07, M.fabricBlue, 0, 0.68, -0.205);
    [-0.31, 0.31].forEach(x => {
      box(g, 0.05, 0.24, 0.05, M.metalDark, x, 0.48, -0.02);
      box(g, 0.06, 0.045, 0.34, M.black, x, 0.69, 0.03);
    });
  },

  fridge(g) {
    box(g, 0.78, 1.82, 0.72, M.white, 0, 0.06, 0);
    box(g, 0.8, 0.04, 0.74, M.metal, 0, 1.88, 0);
    box(g, 0.74, 0.012, 0.68, M.metal, 0, 1.22, 0);
    box(g, 0.72, 0.72, 0.02, M.ceramic, 0, 1.3, 0.365);
    box(g, 0.72, 0.5, 0.02, M.ceramic, 0, 0.68, 0.365);
    [-0.28, 0.28].forEach(x => box(g, 0.035, 0.32, 0.04, M.chrome, x, 1.36, 0.39));
    box(g, 0.035, 0.28, 0.04, M.chrome, -0.28, 0.8, 0.39);
    // 磁鐵與便條
    box(g, 0.12, 0.13, 0.01, '#fff6c8', 0.2, 1.5, 0.38);
    sph(g, 0.025, '#ff9fb4', 0.27, 1.6, 0.385);
    box(g, 0.16, 0.16, 0.015, M.fabricPink, -0.2, 0.95, 0.38);
    legs(g, 0.7, 0.6, 0.06, M.metalDark, 0.08, 0.04);
  },

  microwave(g) {
    box(g, 0.58, 0.36, 0.42, M.white, 0, 0.02, 0);
    box(g, 0.4, 0.26, 0.02, M.black, -0.07, 0.07, 0.215);
    box(g, 0.35, 0.21, 0.012, M.screen, -0.07, 0.095, 0.228);
    box(g, 0.14, 0.3, 0.02, M.metal, 0.2, 0.05, 0.215);
    box(g, 0.09, 0.025, 0.012, M.screen, 0.2, 0.3, 0.228);
    for (let i = 0; i < 3; i++) sph(g, 0.016, M.metalDark, 0.165 + i * 0.04, 0.14, 0.228);
    box(g, 0.035, 0.31, 0.035, M.chrome, 0.26, 0.04, 0.23);
  },

  stove(g) {
    box(g, 0.72, 0.8, 0.62, M.metal, 0, 0.06, 0);
    box(g, 0.7, 0.03, 0.6, M.black, 0, 0.86, 0);
    box(g, 0.56, 0.36, 0.02, M.screen, 0, 0.32, 0.315);
    box(g, 0.56, 0.04, 0.04, M.chrome, 0, 0.72, 0.33);
    for (let i = 0; i < 4; i++) {
      const x = i % 2 ? 0.19 : -0.19;
      const z = i < 2 ? -0.15 : 0.15;
      cyl(g, 0.09, 0.09, 0.025, M.black, x, 0.89, z, 18);
      torus(g, 0.07, 0.012, M.metalDark, x, 0.91, z).rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < 3; i++) {
      cyl(g, 0.025, 0.025, 0.03, M.metalDark, -0.22 + i * 0.22, 0.76, 0.33, 12);
    }
    // 水壺
    cyl(g, 0.08, 0.09, 0.14, M.chrome, -0.19, 0.91, -0.15, 16);
    torus(g, 0.055, 0.012, M.black, -0.19, 1.04, -0.15).rotation.z = Math.PI / 2;
  },

  bathtub(g) {
    // 外殼與內缸
    box(g, 1.7, 0.52, 0.8, M.ceramic, 0, 0.06, 0);
    box(g, 1.52, 0.34, 0.62, M.white, 0, 0.27, 0);
    box(g, 1.42, 0.05, 0.54, M.water, 0, 0.48, 0);
    // 圓角修飾
    [-0.82, 0.82].forEach(x => {
      cyl(g, 0.1, 0.1, 0.46, M.ceramic, x, 0.06, -0.33, 14);
      cyl(g, 0.1, 0.1, 0.46, M.ceramic, x, 0.06, 0.33, 14);
    });
    // 水龍頭
    cyl(g, 0.025, 0.03, 0.3, M.chrome, 0, 0.52, -0.38, 12);
    const spout = box(g, 0.05, 0.05, 0.24, M.chrome, 0, 0.78, -0.3);
    spout.rotation.x = 0.2;
    for (let i = 0; i < 4; i++) sph(g, 0.018, '#ffffff', -0.2 + i * 0.13, 0.51, 0.16);
    legs(g, 1.5, 0.6, 0.06, M.metalDark, 0.1, 0.05);
  },

  sink(g) {
    cyl(g, 0.12, 0.16, 0.62, M.ceramic, 0, 0.02, 0, 16);
    box(g, 0.78, 0.12, 0.52, M.marble, 0, 0.64, 0);
    box(g, 0.58, 0.1, 0.36, M.ceramic, 0, 0.72, 0);
    box(g, 0.48, 0.04, 0.27, M.white, 0, 0.74, 0);
    cyl(g, 0.022, 0.026, 0.3, M.chrome, 0, 0.76, -0.16, 12);
    const spout = box(g, 0.04, 0.04, 0.2, M.chrome, 0, 1.03, -0.07);
    spout.rotation.x = 0.25;
    [-0.1, 0.1].forEach(x => cyl(g, 0.02, 0.02, 0.05, M.chrome, x, 1.0, -0.16, 8));
    box(g, 0.55, 0.5, 0.03, M.mirror, 0, 1.2, -0.26);
  },

  toilet(g) {
    box(g, 0.4, 0.36, 0.52, M.ceramic, 0, 0.06, 0.04);
    cyl(g, 0.18, 0.22, 0.16, M.ceramic, 0, 0.36, 0.08, 20);
    const seat = torus(g, 0.19, 0.035, M.white, 0, 0.52, 0.08);
    seat.rotation.x = Math.PI / 2;
    box(g, 0.34, 0.02, 0.42, M.white, 0, 0.5, 0.06);
    box(g, 0.42, 0.48, 0.2, M.ceramic, 0, 0.48, -0.22);
    box(g, 0.36, 0.04, 0.16, M.white, 0, 0.96, -0.22);
    cyl(g, 0.045, 0.045, 0.02, M.chrome, 0.12, 0.98, -0.22, 12);
    box(g, 0.06, 0.03, 0.18, M.chrome, -0.26, 0.9, 0.06);
    legs(g, 0.3, 0.4, 0.06, M.metalDark, 0.06, 0.05);
  },

  curtain(g) {
    cyl(g, 0.02, 0.02, 1.42, M.metalDark, 0, 2.18, 0, 10).rotation.z = Math.PI / 2;
    [-0.74, 0.74].forEach(x => sph(g, 0.05, M.gold, x, 2.18, 0));
    // 兩片波浪窗簾
    [-1, 1].forEach(side => {
      for (let i = 0; i < 8; i++) {
        const z = -0.05 + Math.sin(i * 0.9) * 0.035;
        const w = 0.075;
        box(g, w, 1.95, 0.05, side < 0 ? M.fabricLilac : M.fabricPink, side * (0.2 + i * 0.075), 0.1, z);
      }
      box(g, 0.08, 1.92, 0.06, M.fabricCream, side * 0.62, 0.12, 0);
      torus(g, 0.06, 0.012, M.gold, side * 0.6, 1.2, 0).rotation.y = Math.PI / 2;
      for (let i = 0; i < 5; i++) torus(g, 0.025, 0.008, M.metal, side * (0.2 + i * 0.1), 2.12, 0).rotation.y = Math.PI / 2;
    });
  },

  rug_rect(g) {
    box(g, 2.4, 0.022, 1.6, M.fabricCream, 0, 0.004, 0);
    const top = mesh(g, new THREE.BoxGeometry(2.3, 0.006, 1.5), mat('#ffffff', { tex: 'rug-blue', roughness: 1 }), 0, 0.022, 0);
    top.receiveShadow = true;
    // 流蘇
    for (let i = -5; i <= 5; i++) {
      box(g, 0.035, 0.012, 0.09, M.fabricCream, i * 0.2, 0.008, 0.83);
      box(g, 0.035, 0.012, 0.09, M.fabricCream, i * 0.2, 0.008, -0.83);
    }
  },

  wall_art(g) {
    box(g, 0.9, 0.72, 0.06, M.woodDark, 0, 0.35, 0);
    box(g, 0.78, 0.6, 0.025, mat('#ffffff', { tex: 'art-landscape', roughness: 0.8 }), 0, 0.41, 0.04);
    box(g, 0.86, 0.04, 0.08, M.gold, 0, 1.07, 0);
    // 畫架式腳座
    const a = box(g, 0.055, 1.05, 0.055, M.woodDark, -0.34, 0, 0.02);
    a.rotation.z = 0.12;
    const b = box(g, 0.055, 1.05, 0.055, M.woodDark, 0.34, 0, 0.02);
    b.rotation.z = -0.12;
    box(g, 0.7, 0.05, 0.05, M.woodDark, 0, 0.38, 0.04);
  },

  plant_large(g) {
    cyl(g, 0.28, 0.22, 0.36, M.ceramic, 0, 0, 0, 20);
    cyl(g, 0.25, 0.25, 0.02, M.soil, 0, 0.34, 0, 20);
    cyl(g, 0.045, 0.06, 0.85, M.woodDark, 0, 0.36, 0, 10);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const r = 0.18 + (i % 3) * 0.08;
      const leaf = sph(g, 0.28 + (i % 2) * 0.06, i % 2 ? M.leaf : M.leafLight,
        Math.cos(a) * r, 1.18 + (i % 3) * 0.16, Math.sin(a) * r);
      leaf.scale.set(1, 0.55, 0.75);
    }
    sph(g, 0.22, M.leafDark, 0, 1.48, 0);
    // 幾片長葉
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.6;
      const leaf = box(g, 0.08, 0.5, 0.18, M.leafDark, Math.cos(a) * 0.28, 0.8, Math.sin(a) * 0.28);
      leaf.rotation.y = -a;
      leaf.rotation.z = 0.45;
    }
  },

  wall_clock(g) {
    box(g, 0.06, 0.9, 0.06, M.woodDark, 0, 0, -0.03);
    box(g, 0.5, 0.06, 0.16, M.woodDark, 0, 0, 0.03);
    const frame = mesh(g, new THREE.CylinderGeometry(0.25, 0.25, 0.06, 28), M.woodDark, 0, 0.78, 0.02);
    frame.rotation.x = Math.PI / 2;
    const face = mesh(g, new THREE.CylinderGeometry(0.21, 0.21, 0.02, 28), M.cream, 0, 0.78, 0.055);
    face.rotation.x = Math.PI / 2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      box(g, 0.012, 0.035, 0.01, M.woodDark, Math.cos(a) * 0.17, 0.78 + Math.sin(a) * 0.17, 0.07);
    }
    const hour = box(g, 0.018, 0.11, 0.012, M.black, 0, 0.84, 0.075);
    hour.rotation.z = -0.5;
    const minute = box(g, 0.014, 0.16, 0.012, M.black, 0, 0.86, 0.08);
    minute.rotation.z = 1.1;
    sph(g, 0.022, M.gold, 0, 0.78, 0.085);
  },

  partition_wall(g) {
    box(g, 1.8, 2.52, 0.16, M.cream, 0, 0, 0);
    box(g, 1.86, 0.09, 0.22, M.woodWhite, 0, 2.52, 0);
    box(g, 1.84, 0.11, 0.2, M.woodWhite, 0, 0.02, 0);
    box(g, 1.74, 0.08, 0.18, M.woodLight, 0, 2.36, 0);
    // 腰線
    box(g, 1.78, 0.05, 0.18, M.woodLight, 0, 0.95, 0);
  },

  partition_door(g) {
    const post = mat('#fff8ec', { roughness: 0.8 });
    [-0.78, 0.78].forEach(x => {
      box(g, 0.14, 2.2, 0.22, post, x, 0, 0);
      box(g, 0.19, 0.08, 0.26, M.woodWhite, x, 2.2, 0);
    });
    box(g, 1.7, 0.14, 0.22, post, 0, 2.2, 0);
    box(g, 1.7, 0.05, 0.3, M.woodWhite, 0, 0.02, 0);
    // 打開的門板（貼在左側，不擋通道）
    const door = box(g, 0.66, 1.98, 0.06, M.woodLight, -0.86, 0.08, 0.34);
    door.rotation.y = -Math.PI / 2.15;
    box(g, 0.1, 0.04, 0.04, M.gold, -1.0, 1.05, 0.37);
    box(g, 0.3, 0.4, 0.02, M.woodWhite, -0.9, 0.55, 0.35);
  },

  stair_steps(g) {
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      box(g, 1.2, 0.16, 0.34, M.woodLight, 0, i * 0.19, -0.72 + i * 0.3);
      box(g, 1.16, 0.03, 0.3, M.woodDark, 0, i * 0.19 + 0.16, -0.72 + i * 0.3);
      box(g, 1.18, 0.16, 0.02, M.woodDark, 0, i * 0.19, -0.55 + i * 0.3);
    }
    // 兩側扶手
    [-0.62, 0.62].forEach(x => {
      box(g, 0.07, 0.95, 0.07, M.woodDark, x, 0, -0.82);
      box(g, 0.07, 0.95, 0.07, M.woodDark, x, 0, 0.82);
      const rail = box(g, 0.06, 0.06, 1.72, M.woodDark, x, 0.95, 0);
      rail.rotation.x = -0.18;
      for (let i = 0; i < 3; i++) box(g, 0.05, 0.55, 0.05, M.wood, x, 0.18 + i * 0.22, -0.55 + i * 0.55);
    });
    box(g, 0.9, 0.5, 0.04, M.woodWhite, 0, 0.02, -0.9);
  },

  /* ---------- 裝飾品 ---------- */
  tree_round(g) {
    cyl(g, 0.14, 0.2, 1.1, M.woodDark, 0, 0, 0, 12);
    sph(g, 0.92, M.leaf, 0, 1.82, 0);
    sph(g, 0.62, M.leafLight, -0.55, 1.55, 0.2);
    sph(g, 0.58, M.leafDark, 0.55, 1.62, -0.15);
    sph(g, 0.42, M.leafLight, 0.1, 2.35, 0.25);
    sph(g, 0.3, M.leaf, -0.3, 2.2, -0.35);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      sph(g, 0.06, '#ffb4c2', Math.cos(a) * 0.7, 1.9 + (i % 2) * 0.3, Math.sin(a) * 0.7);
    }
  },

  tree_pine(g) {
    cyl(g, 0.13, 0.18, 1.0, M.woodDark, 0, 0, 0, 12);
    cone(g, 0.95, 1.3, M.leafDark, 0, 0.8, 0, 14);
    cone(g, 0.78, 1.1, M.leaf, 0, 1.55, 0, 14);
    cone(g, 0.56, 0.95, M.leafLight, 0, 2.2, 0, 14);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      sph(g, 0.035, M.warmLight, Math.cos(a) * (0.5 - i * 0.035), 1.0 + i * 0.2, Math.sin(a) * (0.5 - i * 0.035));
    }
  },

  flowers(g) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = 0.2 + (i % 3) * 0.1;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      cyl(g, 0.014, 0.018, 0.34, M.leafDark, x, 0, z, 6);
      sph(g, 0.085, [M.fabricPink, M.warmLight, M.fabricLilac, M.white][i % 4], x, 0.37, z);
      sph(g, 0.035, M.warmLight, x, 0.39, z);
    }
    cyl(g, 0.4, 0.44, 0.05, M.leaf, 0, 0, 0, 20);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      box(g, 0.22, 0.02, 0.08, M.leafDark, Math.cos(a) * 0.25, 0.06, Math.sin(a) * 0.25).rotation.y = -a;
    }
  },

  rock(g) {
    const r = mesh(g, new THREE.DodecahedronGeometry(0.38, 0), M.stone, 0, 0.26, 0);
    r.scale.set(1, 0.72, 0.9);
    const r2 = mesh(g, new THREE.DodecahedronGeometry(0.2, 0), M.stoneLight, 0.34, 0.14, 0.16);
    r2.scale.set(1, 0.7, 1);
  },

  lamp_post(g) {
    cyl(g, 0.16, 0.2, 0.1, M.metalDark, 0, 0, 0, 14);
    cyl(g, 0.045, 0.05, 1.85, M.metalDark, 0, 0.1, 0, 10);
    box(g, 0.3, 0.36, 0.3, mat('#fff3d0', {
      roughness: 0.5, emissive: '#ffd966', emissiveIntensity: 0.5
    }), 0, 1.95, 0);
    const cap = cone(g, 0.26, 0.18, M.metalDark, 0, 2.31, 0, 10);
    cap.rotation.x = Math.PI;
    cap.position.y = 2.49;
    box(g, 0.02, 0.02, 0.02, M.warmLight, 0, 2.31, 0);
  },

  easel(g) {
    const a = box(g, 0.06, 1.1, 0.06, M.wood, -0.26, 0, 0);
    a.rotation.z = 0.2;
    const b = box(g, 0.06, 1.1, 0.06, M.wood, 0.26, 0, 0);
    b.rotation.z = -0.2;
    box(g, 0.06, 1.0, 0.06, M.woodDark, 0, 0.02, 0.28);
    box(g, 0.62, 0.02, 0.05, M.wood, 0, 0.62, -0.02);
    box(g, 0.58, 0.55, 0.03, mat('#ffffff', { tex: 'art-landscape', roughness: 0.85 }), 0, 0.66, -0.03);
    box(g, 0.64, 0.04, 0.05, M.woodDark, 0, 1.19, -0.03);
    cyl(g, 0.07, 0.08, 0.13, M.ceramic, 0.36, 0, 0.1, 12);
    sph(g, 0.1, M.leaf, 0.36, 0.2, 0.1);
  },

  vase(g) {
    cyl(g, 0.13, 0.09, 0.32, M.glass, 0, 0, 0, 18);
    cyl(g, 0.1, 0.13, 0.1, M.ceramic, 0, 0.3, 0, 18);
    [[0, 0.52, 0, M.fabricPink], [0.13, 0.46, 0.05, M.warmLight], [-0.12, 0.48, -0.04, M.fabricLilac]].forEach(([x, y, z, c]) => {
      cyl(g, 0.01, 0.01, 0.24, M.leafDark, x, 0.3, z, 5);
      sph(g, 0.075, c, x, y, z);
    });
  },

  fence(g) {
    for (let i = -2; i <= 2; i++) {
      box(g, 0.09, 0.75, 0.09, M.woodWhite, i * 0.3, 0, 0);
      cone(g, 0.075, 0.12, M.woodWhite, i * 0.3, 0.75, 0, 8);
    }
    box(g, 1.3, 0.08, 0.05, M.woodLight, 0, 0.28, 0);
    box(g, 1.3, 0.08, 0.05, M.woodLight, 0, 0.55, 0);
  },

  picnic(g) {
    box(g, 1.7, 0.02, 1.7, M.fabricPink, 0, 0, 0);
    for (let i = -2; i <= 2; i++) {
      box(g, 0.16, 0.025, 1.7, M.fabricCream, i * 0.32, 0, 0);
      box(g, 1.7, 0.025, 0.16, M.fabricCream, 0, 0, i * 0.32);
    }
    cyl(g, 0.2, 0.2, 0.14, M.wood, 0.2, 0.03, 0.15, 16);
    sph(g, 0.1, M.fabricPink, -0.35, 0.11, -0.2);
    sph(g, 0.1, M.warmLight, 0.45, 0.11, -0.36);
    cyl(g, 0.04, 0.05, 0.12, M.glass, -0.2, 0.24, 0.3, 10);
  },

  star_light(g) {
    cyl(g, 0.025, 0.03, 0.5, M.metalDark, 0, 0, 0, 8);
    const star = mesh(g, new THREE.OctahedronGeometry(0.18, 0), M.warmLight, 0, 0.68, 0);
    star.scale.set(0.7, 1, 0.7);
    const halo = sph(g, 0.5, '#fff3c4', 0, 0.66, 0);
    halo.material = mat('#fff3c4', { transparent: true, opacity: 0.08, roughness: 1 });
    halo.castShadow = false;
  },

  fountain(g) {
    cyl(g, 1.1, 1.2, 0.34, M.stoneLight, 0, 0, 0, 28);
    cyl(g, 1.02, 1.02, 0.06, M.water, 0, 0.3, 0, 28);
    cyl(g, 0.16, 0.2, 0.7, M.stoneLight, 0, 0.3, 0, 16);
    const star = mesh(g, new THREE.OctahedronGeometry(0.36, 0), M.gold, 0, 1.26, 0);
    star.scale.set(0.8, 1.1, 0.8);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      sph(g, 0.075, M.water, Math.cos(a) * 0.62, 0.44, Math.sin(a) * 0.62);
    }
  },

  swing(g) {
    const frameMat = M.wood;
    [-0.95, 0.95].forEach(x => {
      const l1 = box(g, 0.09, 1.9, 0.09, frameMat, x, 0, -0.42);
      l1.rotation.x = -0.22;
      const l2 = box(g, 0.09, 1.9, 0.09, frameMat, x, 0, 0.42);
      l2.rotation.x = 0.22;
    });
    const top = cyl(g, 0.05, 0.05, 2.0, frameMat, 0, 1.82, 0, 10);
    top.rotation.z = Math.PI / 2;
    [-0.38, 0.38].forEach(x => cyl(g, 0.016, 0.016, 1.0, M.metal, x, 0.72, 0, 6));
    box(g, 0.9, 0.07, 0.34, M.fabricPink, 0, 0.7, 0);
    box(g, 0.9, 0.3, 0.05, M.fabricPink, 0, 0.77, -0.16);
  },

  arch(g) {
    const arch = mesh(g, new THREE.TorusGeometry(0.78, 0.075, 10, 24, Math.PI), M.woodWhite, 0, 1.4, 0);
    [-0.78, 0.78].forEach(x => cyl(g, 0.075, 0.075, 1.4, M.woodWhite, x, 0, 0, 12));
    const colors = [M.fabricPink, M.warmLight, M.fabricLilac, M.fabricGreen];
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.06 + i * 0.11);
      sph(g, 0.085, colors[i % 4], Math.cos(a) * 0.78, 1.4 + Math.sin(a) * 0.78, 0.02);
    }
    for (let i = 0; i < 3; i++) {
      sph(g, 0.08, colors[i], -0.78, 0.35 + i * 0.3, 0.08);
      sph(g, 0.08, colors[(i + 2) % 4], 0.78, 0.35 + i * 0.3, 0.08);
    }
  },

  mailbox(g) {
    cyl(g, 0.055, 0.06, 1.0, M.woodDark, 0, 0, 0, 10);
    box(g, 0.4, 0.32, 0.28, M.fabricBlue, 0, 0.98, 0);
    box(g, 0.42, 0.06, 0.3, M.fabricLilac, 0, 1.28, 0);
    box(g, 0.06, 0.26, 0.03, M.fabricPink, 0.23, 1.05, 0.12);
    box(g, 0.17, 0.13, 0.02, M.fabricPink, 0.29, 1.27, 0.12);
    sph(g, 0.03, M.gold, 0.29, 1.33, 0.02);
  },

  campfire(g) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const log = cyl(g, 0.07, 0.08, 0.62, M.woodDark, Math.cos(a) * 0.18, 0.04, Math.sin(a) * 0.18, 8);
      log.rotation.z = Math.PI / 2.4;
      log.rotation.y = a;
    }
    cone(g, 0.24, 0.55, M.flame, 0, 0.12, 0, 10);
    cone(g, 0.14, 0.38, M.warmLight, 0, 0.18, 0, 10);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      sph(g, 0.07, M.stone, Math.cos(a) * 0.5, 0.07, Math.sin(a) * 0.5);
    }
    const glow = sph(g, 0.7, '#ffb347', 0, 0.38, 0);
    glow.material = mat('#ffb347', { transparent: true, opacity: 0.1, roughness: 1 });
    glow.castShadow = false;
  },

  bench(g) {
    box(g, 1.5, 0.1, 0.42, M.woodLight, 0, 0.42, 0);
    box(g, 1.5, 0.4, 0.08, M.woodLight, 0, 0.72, -0.2);
    box(g, 0.09, 0.42, 0.4, M.metalDark, -0.6, 0, 0);
    box(g, 0.09, 0.42, 0.4, M.metalDark, 0.6, 0, 0);
    for (let i = 0; i < 3; i++) box(g, 1.38, 0.03, 0.1, M.wood, 0, 0.77 + i * 0.11, -0.2);
    box(g, 1.4, 0.03, 0.1, M.wood, 0, 0.52, 0.06);
  }
};

/* ---------------- 獨立碰撞設定 ----------------
 * 回傳的是「模型區域座標」的方形碰撞盒（公尺，scale = 1 時）。
 * 沒有列出的模型沿用伺服器 footprint；門框、拱門、樹木與立燈
 * 使用更貼近實體的局部碰撞盒，避免碰撞箱過大或過小。
 */
const LOCAL_COLLIDERS = {
  tree_round: [{ x: 0, z: 0, w: 0.5, d: 0.5 }],
  tree_pine: [{ x: 0, z: 0, w: 0.45, d: 0.45 }],
  plant_large: [{ x: 0, z: 0, w: 0.62, d: 0.62 }],
  floor_lamp: [{ x: 0, z: 0, w: 0.38, d: 0.38 }],
  lamp_post: [{ x: 0, z: 0, w: 0.32, d: 0.32 }],
  partition_door: [
    { x: -0.79, z: 0, w: 0.16, d: 0.26 },
    { x: 0.79, z: 0, w: 0.16, d: 0.26 }
  ],
  arch: [
    { x: -0.78, z: 0, w: 0.2, d: 0.26 },
    { x: 0.78, z: 0, w: 0.2, d: 0.26 }
  ],
  stair_steps: [{ x: 0, z: 0, w: 1.2, d: 2.0 }]
};

function boxCorners(x, z, w, d, rotRad) {
  const hx = w / 2;
  const hz = d / 2;
  const c = Math.cos(rotRad);
  const s = Math.sin(rotRad);
  const pts = [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [px, pz] of pts) {
    const wx = x + px * c - pz * s;
    const wz = z + px * s + pz * c;
    minX = Math.min(minX, wx);
    maxX = Math.max(maxX, wx);
    minZ = Math.min(minZ, wz);
    maxZ = Math.max(maxZ, wz);
  }
  return { minX, maxX, minZ, maxZ };
}

export function itemColliderBoxes(item, meta) {
  if (!meta || !meta.solid) return [];
  const scale = item.scale || 1;
  const rotRad = (item.rot || 0) * Math.PI / 180;
  const local = LOCAL_COLLIDERS[meta.model];
  if (!local) {
    return [boxCorners(item.x, item.z, meta.footprint.w * scale, meta.footprint.d * scale, rotRad)];
  }
  return local.map(b => boxCorners(
    item.x + b.x * scale,
    item.z + b.z * scale,
    b.w * scale,
    b.d * scale,
    rotRad
  ));
}

export class FurnitureFactory {
  constructor() {
    this.group = new THREE.Group();
  }

  make(modelId, { ghost = false } = {}) {
    const g = new THREE.Group();
    g.name = 'item-' + modelId;
    const fn = FIT[modelId];
    if (fn) fn(g);
    else box(g, 0.6, 0.6, 0.6, M.fabricLilac, 0, 0, 0);
    if (ghost) {
      g.traverse(o => {
        if (!o.isMesh) return;
        const base = Array.isArray(o.material) ? o.material : [o.material];
        const cloned = base.map(m => {
          const c = m.clone();
          c.transparent = true;
          c.opacity = 0.5;
          c.depthWrite = false;
          c.userData.__ghost = true;
          return c;
        });
        o.material = Array.isArray(o.material) ? cloned : cloned[0];
        o.castShadow = false;
        o.receiveShadow = false;
      });
    }
    return g;
  }

  disposeItem(g) {
    if (!g) return;
    g.traverse(o => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach(m => {
        if (m && m.userData && m.userData.__ghost) m.dispose();
      });
    });
  }
}
