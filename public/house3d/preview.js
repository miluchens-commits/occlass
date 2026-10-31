/* OC 房子 3D：3D 縮圖快取、家具檢視器、房屋檢視器
 *
 * - PreviewStudio：離屏渲染，為每個模型生成 256×256 的 PNG 縮圖（Base64），快取於 localStorage
 * - ItemInspector：獨立場景的模型放大檢視，支援拖曳旋轉、滾輪縮放、重置、關閉
 * - HouseViewer：點擊房屋後的大型模型檢視，支援拖曳旋轉、滾輪縮放、平移、重置、退出
 */
import * as THREE from '../vendor/three.module.js';
import { FurnitureFactory } from './furniture.js';
import { HouseBuilder, HOUSE } from './scene.js';

/* ---------------- 通用：離屏渲染器與環境貼圖 ---------------- */
let sharedRenderer = null;
let sharedEnvMap = null;

function getSharedRenderer() {
  if (sharedRenderer) return sharedRenderer;
  sharedRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  sharedRenderer.setPixelRatio(1);
  sharedRenderer.setSize(256, 256);
  sharedRenderer.outputColorSpace = THREE.SRGBColorSpace;
  sharedRenderer.shadowMap.enabled = true;
  sharedRenderer.shadowMap.type = THREE.PCFShadowMap;
  // 建立共用環境貼圖
  const pmrem = new THREE.PMREMGenerator(sharedRenderer);
  const envScene = new THREE.Scene();
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(10, 16, 10),
    new THREE.MeshBasicMaterial({ color: '#c9ecff', side: THREE.BackSide })
  );
  envScene.add(sky);
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(10, 20),
    new THREE.MeshBasicMaterial({ color: '#6fbd78' })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.4;
  envScene.add(ground);
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(1.2, 12, 8),
    new THREE.MeshBasicMaterial({ color: '#fff9e6' })
  );
  sun.position.set(4, 6, 3);
  envScene.add(sun);
  sharedEnvMap = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
  [sky, ground, sun].forEach(o => { o.geometry.dispose(); o.material.dispose(); });
  return sharedRenderer;
}

function getEnvMap() {
  if (!sharedEnvMap) getSharedRenderer();
  return sharedEnvMap;
}

/* ---------------- PreviewStudio：3D 縮圖生成 ---------------- */
const THUMB_CACHE_KEY = 'oc_house_thumbs_v2';
const THUMB_SIZE = 256;

function loadThumbCache() {
  try { return JSON.parse(localStorage.getItem(THUMB_CACHE_KEY) || '{}'); }
  catch { return {}; }
}

function saveThumbCache(cache) {
  try { localStorage.setItem(THUMB_CACHE_KEY, JSON.stringify(cache)); }
  catch { /* 忽略配額滿 */ }
}

export class PreviewStudio {
  constructor() {
    this.renderer = getSharedRenderer();
    this.cache = loadThumbCache();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    this.factory = new FurnitureFactory();
    this.pending = new Map(); // modelId -> [resolve, reject]
    this.processing = false;
    this.scene.environment = getEnvMap();
    this.scene.environmentIntensity = 0.7;

    // 固定光源
    this.hemi = new THREE.HemisphereLight('#e8f7ff', '#8fc98a', 1.0);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff3d1', 2.0);
    this.sun.position.set(5, 8, 4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(256, 256);
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 20;
    this.sun.shadow.camera.left = -4;
    this.sun.shadow.camera.right = 4;
    this.sun.shadow.camera.top = 4;
    this.sun.shadow.camera.bottom = -4;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // 地面接收陰影
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshStandardMaterial({ color: '#7ac57c', roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;
  }

  /* 取得縮圖：若有快取直接回傳，否則排入佇列非同步生成 */
  getThumb(modelId) {
    if (this.cache[modelId]) return Promise.resolve(this.cache[modelId]);
    return new Promise((resolve, reject) => {
      const arr = this.pending.get(modelId) || [];
      arr.push({ resolve, reject });
      this.pending.set(modelId, arr);
      this._processQueue();
    });
  }

  async _processQueue() {
    if (this.processing || this.pending.size === 0) return;
    this.processing = true;
    while (this.pending.size > 0) {
      const [modelId, waiters] = this.pending.entries().next().value;
      this.pending.delete(modelId);
      try {
        const dataUrl = await this._renderThumb(modelId);
        this.cache[modelId] = dataUrl;
        saveThumbCache(this.cache);
        waiters.forEach(w => w.resolve(dataUrl));
      } catch (e) {
        waiters.forEach(w => w.reject(e));
      }
    }
    this.processing = false;
  }

  async _renderThumb(modelId) {
    // 清空場景物件（保留光源與地面）
    while (this.scene.children.length > 4) {
      const obj = this.scene.children.pop();
      if (obj.isMesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose()); else obj.material.dispose();
      }
    }

    const group = this.factory.make(modelId);
    this.scene.add(group);

    // 計算包圍盒並調整相機
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 1.8;
    this.camera.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist * 0.7);
    this.camera.lookAt(center);
    this.sun.target.position.copy(center);
    this.sun.shadow.camera.update();

    // 等一幀讓陰影計算完成
    await new Promise(r => requestAnimationFrame(r));
    this.renderer.render(this.scene, this.camera);

    // 導出 Base64 PNG
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose() {
    this.scene.traverse(o => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose();
      }
    });
    this.factory = null;
  }
}

/* ---------------- ItemInspector：家具獨立模型檢視 ---------------- */
export class ItemInspector {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.onClose = options.onClose || (() => {});
    this.modelId = null;
    this.item = null;
    this.meta = null;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'inspector-canvas';
    this.renderer.domElement.tabIndex = 0;

    this.scene = new THREE.Scene();
    this.scene.environment = getEnvMap();
    this.scene.environmentIntensity = 0.8;

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.controls = null;
    this.factory = new FurnitureFactory();
    this.group = null;
    this.target = new THREE.Vector3();

    this._buildUI();
    this._bindEvents();
  }

  _buildUI() {
    this.wrap = document.createElement('div');
    this.wrap.className = 'item-inspector-wrap';
    this.wrap.innerHTML = `
      <div class="inspector-panel">
        <div class="inspector-header">
          <h3 id="inspectorTitle">模型檢視</h3>
          <div class="inspector-actions">
            <button id="inspectorReset" class="inspector-btn" title="重置視角">⟳</button>
            <button id="inspectorClose" class="inspector-btn" title="關閉">✕</button>
          </div>
        </div>
        <div id="inspectorCanvasHost"></div>
        <div class="inspector-hint">拖曳旋轉 · 滾輪縮放 · 雙擊重置</div>
      </div>
      <div class="inspector-backdrop"></div>
    `;
    this.container.appendChild(this.wrap);
    this.canvasHost = this.wrap.querySelector('#inspectorCanvasHost');
    this.canvasHost.appendChild(this.renderer.domElement);
  }

  _bindEvents() {
    this.wrap.querySelector('#inspectorClose').addEventListener('click', () => this.close());
    this.wrap.querySelector('#inspectorReset').addEventListener('click', () => this.resetView());
    this.wrap.querySelector('.inspector-backdrop').addEventListener('click', () => this.close());

    // 滑鼠拖曳旋轉
    let dragging = false, lastX = 0, lastY = 0;
    this.renderer.domElement.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      this.renderer.domElement.setPointerCapture(e.pointerId);
      this.renderer.domElement.focus();
    });
    window.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      this._orbit(dx * 0.01, dy * 0.01);
    });
    window.addEventListener('pointerup', e => {
      if (dragging) {
        dragging = false;
        this.renderer.domElement.releasePointerCapture && this.renderer.domElement.releasePointerCapture(e.pointerId);
      }
    });

    // 滾輪縮放
    this.renderer.domElement.addEventListener('wheel', e => {
      e.preventDefault();
      this._zoom(e.deltaY > 0 ? 1.15 : 0.87);
    }, { passive: false });

    // 雙擊重置
    this.renderer.domElement.addEventListener('dblclick', () => this.resetView());

    // 鍵盤：Esc 關閉，R 重置
    this._onKeyDown = e => {
      if (e.key === 'Escape') this.close();
      else if (e.key === 'r' || e.key === 'R') this.resetView();
    };
    window.addEventListener('keydown', this._onKeyDown);

    // ResizeObserver
    this.ro = new ResizeObserver(() => this._resize());
    this.ro.observe(this.canvasHost);
  }

  open(item, meta) {
    this.item = item;
    this.meta = meta;
    this.modelId = meta.model;
    this.wrap.classList.add('open');
    document.body.style.overflow = 'hidden';

    // 清除舊模型
    if (this.group) {
      this.scene.remove(this.group);
      this.factory.disposeItem(this.group);
    }
    try {
      this.group = this.factory.make(meta.model);
      this.scene.add(this.group);
      this.group.scale.setScalar(item.scale || 1);

      this._fitToModel();
      this._startRenderLoop();
      this.wrap.querySelector('#inspectorTitle').textContent = meta.name || '模型檢視';
    } catch (e) {
      console.error('ItemInspector open error:', e);
      this.close();
      alert('模型檢視開啟失敗：' + e.message);
    }
  }

  _fitToModel() {
    const box = new THREE.Box3().setFromObject(this.group);
    const size = box.getSize(new THREE.Vector3());
    this.target.copy(box.getCenter(new THREE.Vector3()));
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 2.2;
    this.camera.position.set(this.target.x + dist * 0.6, this.target.y + dist * 0.4, this.target.z + dist * 0.6);
    this.camera.lookAt(this.target);
    this.camera.near = 0.1;
    this.camera.far = dist * 4;
    this.camera.updateProjectionMatrix();
    this._baseDist = dist;
    this._baseTarget = this.target.clone();
  }

  resetView() {
    if (!this._baseDist) return;
    this.camera.position.set(this._baseTarget.x + this._baseDist * 0.6, this._baseTarget.y + this._baseDist * 0.4, this._baseTarget.z + this._baseDist * 0.6);
    this.camera.lookAt(this._baseTarget);
    this.target.copy(this._baseTarget);
  }

  _orbit(dx, dy) {
    const radius = this.camera.position.distanceTo(this.target);
    let phi = Math.acos((this.camera.position.y - this.target.y) / radius);
    let theta = Math.atan2(this.camera.position.x - this.target.x, this.camera.position.z - this.target.z);
    theta -= dx;
    phi = Math.max(0.15, Math.min(Math.PI - 0.15, phi + dy));
    this.camera.position.set(
      this.target.x + radius * Math.sin(phi) * Math.sin(theta),
      this.target.y + radius * Math.cos(phi),
      this.target.z + radius * Math.sin(phi) * Math.cos(theta)
    );
    this.camera.lookAt(this.target);
  }

  _zoom(factor) {
    const dir = new THREE.Vector3().subVectors(this.camera.position, this.target);
    dir.multiplyScalar(factor);
    this.camera.position.copy(this.target).add(dir);
    // 限制最小/最大距離
    const dist = this.camera.position.distanceTo(this.target);
    const minD = this._baseDist * 0.3;
    const maxD = this._baseDist * 4;
    if (dist < minD || dist > maxD) {
      dir.setLength(Math.max(minD, Math.min(maxD, dist)));
      this.camera.position.copy(this.target).add(dir);
    }
  }

  _resize() {
    const w = this.canvasHost.clientWidth;
    const h = this.canvasHost.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _startRenderLoop() {
    this._animId = requestAnimationFrame(() => this._renderLoop());
  }

  _renderLoop() {
    if (!this.wrap.classList.contains('open')) return;
    this.renderer.render(this.scene, this.camera);
    this._animId = requestAnimationFrame(() => this._renderLoop());
  }

  close() {
    this.wrap.classList.remove('open');
    document.body.style.overflow = '';
    cancelAnimationFrame(this._animId);
    window.removeEventListener('keydown', this._onKeyDown);
    this.ro.disconnect();
    if (this.group) {
      this.scene.remove(this.group);
      this.factory.disposeItem(this.group);
      this.group = null;
    }
    this.onClose();
  }

  dispose() {
    this.close();
    this.wrap.remove();
    this.renderer.dispose();
    this.factory = null;
  }
}

/* ---------------- HouseViewer：房屋大型模型檢視 ---------------- */
export class HouseViewer {
  constructor(options = {}) {
    this.container = options.container || document.body;
    this.onClose = options.onClose || (() => {});
    this.houseData = null;
    this.catalogMap = null;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.className = 'house-viewer-canvas';
    this.renderer.domElement.tabIndex = 0;

    this.scene = new THREE.Scene();
    this.scene.environment = getEnvMap();
    this.scene.environmentIntensity = 0.7;

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    this.factory = new FurnitureFactory();
    this.houseGroup = null;
    this.target = new THREE.Vector3(0, 1.2, 0);
    this.orbit = { radius: 14, theta: 0.6, phi: 0.7 };

    this._buildUI();
    this._bindEvents();
  }

  _buildUI() {
    this.wrap = document.createElement('div');
    this.wrap.className = 'house-viewer-wrap';
    this.wrap.innerHTML = `
      <div class="house-viewer-panel">
        <div class="house-viewer-header">
          <h3 id="houseViewerTitle">房屋檢視</h3>
          <div class="house-viewer-actions">
            <button id="houseViewerReset" class="viewer-btn" title="重置視角">⟳</button>
            <button id="houseViewerExit" class="viewer-btn viewer-btn-exit" title="退出">✕</button>
          </div>
        </div>
        <div id="houseViewerCanvasHost"></div>
        <div class="house-viewer-hint">拖曳旋轉 · 滾輪縮放 · 右鍵/雙指平移 · 雙擊重置</div>
      </div>
      <div class="house-viewer-backdrop"></div>
    `;
    this.container.appendChild(this.wrap);
    this.canvasHost = this.wrap.querySelector('#houseViewerCanvasHost');
    this.canvasHost.appendChild(this.renderer.domElement);
  }

  _bindEvents() {
    this.wrap.querySelector('#houseViewerExit').addEventListener('click', () => this.close());
    this.wrap.querySelector('#houseViewerReset').addEventListener('click', () => this.resetView());
    this.wrap.querySelector('.house-viewer-backdrop').addEventListener('click', () => this.close());

    // 滑鼠：左鍵旋轉，右鍵平移，滾輪縮放
    let dragMode = null;
    let lastX = 0, lastY = 0;
    this.renderer.domElement.addEventListener('pointerdown', e => {
      if (e.button === 0) dragMode = 'orbit';
      else if (e.button === 2) dragMode = 'pan';
      else return;
      lastX = e.clientX;
      lastY = e.clientY;
      this.renderer.domElement.setPointerCapture(e.pointerId);
      this.renderer.domElement.focus();
      e.preventDefault();
    });
    window.addEventListener('pointermove', e => {
      if (!dragMode) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (dragMode === 'orbit') this._orbit(dx * 0.008, dy * 0.008);
      else if (dragMode === 'pan') this._pan(dx * 0.008, dy * 0.008);
    });
    window.addEventListener('pointerup', e => {
      if (dragMode) {
        dragMode = null;
        this.renderer.domElement.releasePointerCapture && this.renderer.domElement.releasePointerCapture(e.pointerId);
      }
    });
    this.renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

    // 滾輪縮放
    this.renderer.domElement.addEventListener('wheel', e => {
      e.preventDefault();
      this._zoom(e.deltaY > 0 ? 1.12 : 0.89);
    }, { passive: false });

    // 雙擊重置
    this.renderer.domElement.addEventListener('dblclick', () => this.resetView());

    // 鍵盤
    this._onKeyDown = e => {
      if (e.key === 'Escape') this.close();
      else if (e.key === 'r' || e.key === 'R') this.resetView();
    };
    window.addEventListener('keydown', this._onKeyDown);

    // ResizeObserver
    this.ro = new ResizeObserver(() => this._resize());
    this.ro.observe(this.canvasHost);
  }

  open(houseData, catalogMap) {
    this.houseData = houseData;
    this.catalogMap = catalogMap;
    this.wrap.classList.add('open');
    document.body.style.overflow = 'hidden';

    // 清除舊模型
    if (this.houseGroup) {
      this.scene.remove(this.houseGroup);
      this._disposeGroup(this.houseGroup);
      this.houseGroup = null;
    }

    try {
      // 建立房屋模型（直接構建，不依賴 HouseBuilder 的場景）
      this.houseGroup = new THREE.Group();
      this.houseGroup.name = 'house';
      this.scene.add(this.houseGroup);

      // 使用 HouseBuilder 產生房屋幾何體
      const tempScene = new THREE.Scene();
      const builder = new HouseBuilder(tempScene, catalogMap);
      builder.setModel(houseData.model, houseData.name);
      
      // 將 builder.group 的內容移動到 this.houseGroup
      while (builder.group.children.length > 0) {
        const child = builder.group.children[0];
        builder.group.remove(child);
        this.houseGroup.add(child);
      }
      // 複製 wallBoxes 供碰撞參考（雖然檢視模式不需要碰撞）
      this.wallBoxes = builder.wallBoxes;

      // 為 HouseViewer 場景添加光源（模仿主場景）
      const hemi = new THREE.HemisphereLight('#e8f7ff', '#8fc98a', 1.18);
      this.scene.add(hemi);
      const sun = new THREE.DirectionalLight('#fff3d1', 2.3);
      sun.position.set(13, 19, 9);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 60;
      sun.shadow.camera.left = -18;
      sun.shadow.camera.right = 18;
      sun.shadow.camera.top = 18;
      sun.shadow.camera.bottom = -18;
      sun.shadow.bias = -0.0015;
      sun.shadow.normalBias = 0.02;
      this.scene.add(sun);
      this.scene.add(sun.target);
      // 門口補光
      const fill = new THREE.DirectionalLight('#fff2dc', 0.55);
      fill.position.set(-4, 5, 8);
      fill.target.position.set(0, 1, 0);
      this.scene.add(fill);
      this.scene.add(fill.target);

      // 地面接收陰影
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(50, 50),
        new THREE.MeshStandardMaterial({ color: '#7ac57c', roughness: 1 })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.012;
      ground.receiveShadow = true;
      ground.name = 'ground';
      this.scene.add(ground);

      // 加入家具（使用 HOUSE 內部範圍判斷）
      const { inner } = HOUSE;
      (houseData.items || []).forEach(it => {
        const meta = catalogMap[it.itemId];
        if (!meta || meta.category === 'house') return;
        const g = this.factory.make(meta.model);
        const isInside = it.x >= inner.minX && it.x <= inner.maxX && it.z >= inner.minZ && it.z <= inner.maxZ;
        g.position.set(it.x, isInside ? HOUSE.floorTop : 0, it.z);
        g.rotation.y = -it.rot * Math.PI / 180;
        g.scale.setScalar(it.scale);
        this.houseGroup.add(g);
      });

      this._fitToHouse();
      this._startRenderLoop();
      this.wrap.querySelector('#houseViewerTitle').textContent = houseData.name || '房屋檢視';
    } catch (e) {
      console.error('HouseViewer open error:', e);
      this.close();
      alert('房屋檢視開啟失敗：' + e.message);
    }
  }

  _fitToHouse() {
    if (!this.houseGroup) return;
    const box = new THREE.Box3().setFromObject(this.houseGroup);
    const size = box.getSize(new THREE.Vector3());
    this.target.copy(box.getCenter(new THREE.Vector3()));
    const maxDim = Math.max(size.x, size.z);
    this.orbit.radius = maxDim * 2.2;
    this._baseOrbit = { ...this.orbit };
    this._baseTarget = this.target.clone();
    this._updateCamera();
  }

  _fitToHouse(builder) {
    const box = new THREE.Box3().setFromObject(this.houseGroup);
    const size = box.getSize(new THREE.Vector3());
    this.target.copy(box.getCenter(new THREE.Vector3()));
    const maxDim = Math.max(size.x, size.z);
    this.orbit.radius = maxDim * 2.2;
    this._baseOrbit = { ...this.orbit };
    this._baseTarget = this.target.clone();
    this._updateCamera();
  }

  resetView() {
    if (!this._baseOrbit) return;
    this.orbit = { ...this._baseOrbit };
    this.target.copy(this._baseTarget);
    this._updateCamera();
  }

  _orbit(dTheta, dPhi) {
    this.orbit.theta -= dTheta;
    this.orbit.phi = Math.max(0.18, Math.min(1.45, this.orbit.phi + dPhi));
    this._updateCamera();
  }

  _pan(dx, dy) {
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0));
    this.target.addScaledVector(right, -dx * this.orbit.radius * 0.12);
    this.target.addScaledVector(forward, dy * this.orbit.radius * 0.12);
    this._updateCamera();
  }

  _zoom(factor) {
    this.orbit.radius = Math.max(4, Math.min(60, this.orbit.radius * factor));
    this._updateCamera();
  }

  _updateCamera() {
    const { radius, theta, phi } = this.orbit;
    this.camera.position.set(
      this.target.x + radius * Math.sin(phi) * Math.sin(theta),
      this.target.y + radius * Math.cos(phi),
      this.target.z + radius * Math.sin(phi) * Math.cos(theta)
    );
    this.camera.lookAt(this.target);
    this.camera.near = 0.1;
    this.camera.far = radius * 5 + 20;
    this.camera.updateProjectionMatrix();
  }

  _resize() {
    const w = this.canvasHost.clientWidth;
    const h = this.canvasHost.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  _startRenderLoop() {
    this._animId = requestAnimationFrame(() => this._renderLoop());
  }

  _renderLoop() {
    if (!this.wrap.classList.contains('open')) return;
    this.renderer.render(this.scene, this.camera);
    this._animId = requestAnimationFrame(() => this._renderLoop());
  }

  _disposeGroup(group) {
    group.traverse(o => {
      if (o.isMesh) {
        o.geometry.dispose();
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose();
      }
    });
  }

  close() {
    this.wrap.classList.remove('open');
    document.body.style.overflow = '';
    cancelAnimationFrame(this._animId);
    window.removeEventListener('keydown', this._onKeyDown);
    this.ro.disconnect();
    if (this.houseGroup) {
      this.scene.remove(this.houseGroup);
      this._disposeGroup(this.houseGroup);
      this.houseGroup = null;
    }
    this.onClose();
  }

  dispose() {
    this.close();
    this.wrap.remove();
    this.renderer.dispose();
    this.factory = null;
  }
}