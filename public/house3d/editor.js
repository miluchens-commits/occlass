/* OC 房子 3D：房屋編輯器（放置、移動、旋轉、縮放、刪除、自動儲存） */
import * as THREE from '../vendor/three.module.js';
import { HOUSE, footprintAabb, boxesOverlap, insideInner, touchesOuter, round2 } from './scene.js';
import { itemColliderBoxes } from './furniture.js';

function makeFootprintMesh(color) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 3;
  return m;
}

export class HouseEditor {
  constructor(options) {
    this.scene = options.scene;
    this.camera = options.camera;
    this.renderer = options.renderer;
    this.factory = options.factory;
    this.builder = options.builder;
    this.env = options.env;
    this.catalogMap = options.catalogMap;
    this.maxItems = options.maxItems || 80;
    this.items = (options.items || []).map(it => Object.assign({}, it));
    this.unlocked = new Set(options.unlocked || []);
    this.options = options;

    this.groups = new Map();
    this.active = false;
    this.selectedUid = null;
    this.ghost = null;
    this.ghostMeta = null;
    this.ghostRot = 0;
    this.ghostValid = false;
    this.ghostPoint = null;

    this.orbit = { target: new THREE.Vector3(0, 0.85, 0), radius: 11.5, theta: 0.62, phi: 0.72 };
    this.pointers = new Map();
    this.mode = 'idle'; // idle | orbit | drag
    this.dragUid = null;
    this.dragOrigin = null;
    this.dragStartPoint = null;
    this.lastValid = null;
    this.moved = false;
    this.pendingHouseClick = false;
    this.saveTimer = null;
    this.saving = false;
    this.pendingSave = false;

    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();

    this.selectionHelper = null;
    this.selFootprint = null;
    this.ghostFootprint = makeFootprintMesh('#6fdc93');
    this.ghostFootprint.visible = false;
    this.scene.add(this.ghostFootprint);

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onDblClick = this._onDblClick.bind(this);

    this._buildAll();
    this._applyOrbitCamera();
  }

  /* ---------- 建立／重建模型 ---------- */
  _buildAll() {
    this.groups.forEach(g => {
      this.scene.remove(g);
      this.factory.disposeItem(g);
    });
    this.groups.clear();
    this.items.forEach(it => this._spawnGroup(it));
  }

  _spawnGroup(it) {
    const meta = this.catalogMap[it.itemId];
    if (!meta) return;
    const g = this.factory.make(meta.model);
    g.userData.uid = it.uid;
    g.position.set(it.x, this._baseY(it.x, it.z), it.z);
    g.rotation.y = -it.rot * Math.PI / 180;
    g.scale.setScalar(it.scale);
    this.scene.add(g);
    this.groups.set(it.uid, g);
    return g;
  }

  _baseY(x, z) {
    return (x >= HOUSE.inner.minX && x <= HOUSE.inner.maxX && z >= HOUSE.inner.minZ && z <= HOUSE.inner.maxZ)
      ? HOUSE.floorTop : 0;
  }

  _refreshGroup(it) {
    const g = this.groups.get(it.uid);
    if (!g) return;
    g.position.set(it.x, this._baseY(it.x, it.z), it.z);
    g.rotation.y = -it.rot * Math.PI / 180;
    g.scale.setScalar(it.scale);
    if (this.selectionHelper && this.selectedUid === it.uid) this.selectionHelper.setFromObject(g);
    if (this.selFootprint && this.selectedUid === it.uid) this._placeFootprint(this.selFootprint, it);
  }

  _placeFootprint(mesh, item, box) {
    const meta = this.catalogMap[item.itemId];
    const b = box || footprintAabb(item, meta);
    mesh.position.set((b.minX + b.maxX) / 2, this._baseY(item.x, item.z) + 0.012, (b.minZ + b.maxZ) / 2);
    mesh.scale.set(Math.max(0.05, b.maxX - b.minX), 1, Math.max(0.05, b.maxZ - b.minZ));
    mesh.visible = true;
  }

  /* ---------- 合法性檢查（與伺服器相同規則） ---------- */
  validate(item, ignoreUid) {
    const meta = this.catalogMap[item.itemId];
    if (!meta || meta.category === 'house') return { ok: false, reason: '物件資料不正確。' };
    if (!this.unlocked.has(meta.id)) return { ok: false, reason: `「${meta.name}」尚未解鎖。` };

    const box = footprintAabb(item, meta);
    if (box.minX < -HOUSE.area || box.maxX > HOUSE.area || box.minZ < -HOUSE.area || box.maxZ > HOUSE.area) {
      return { ok: false, reason: '超出可建造範圍。' };
    }
    if (!insideInner(box) && touchesOuter(box)) {
      return { ok: false, reason: '物件會穿過牆壁，請放到屋內或屋外。' };
    }
    if (meta.solid) {
      for (const other of this.items) {
        if (other.uid === ignoreUid) continue;
        const om = this.catalogMap[other.itemId];
        if (!om || !om.solid) continue;
        const ob = footprintAabb(other, om);
        if (boxesOverlap(box, ob, 0.02)) {
          return { ok: false, reason: `和「${om.name}」重疊了，請移開一點。` };
        }
      }
    }
    return { ok: true, box };
  }

  /* ---------- 放置模式 ---------- */
  beginPlacement(itemId) {
    const meta = this.catalogMap[itemId];
    if (!meta || meta.category === 'house') return;
    this.cancelPlacement();
    this.ghostMeta = meta;
    this.ghostRot = 0;
    this.ghost = this.factory.make(meta.model, { ghost: true });
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    this.ghostValid = false;
    this.options.onEditingChange && this.options.onEditingChange(true);
    this.options.onHint && this.options.onHint(`正在放置「${meta.name}」：移動到想放的位置後點一下。按 Esc 取消。`);
  }

  cancelPlacement() {
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this.factory.disposeItem(this.ghost);
      this.ghost = null;
    }
    this.ghostMeta = null;
    this.ghostValid = false;
    this.ghostFootprint.visible = false;
    this.options.onEditingChange && this.options.onEditingChange(false);
    this.options.onHint && this.options.onHint('選一個物件放到草原或房子裡。');
  }

  rotateGhost(delta) {
    if (!this.ghost) return;
    this.ghostRot = (this.ghostRot + delta + 360) % 360;
    this.ghost.rotation.y = -this.ghostRot * Math.PI / 180;
    if (this.ghostPoint) this._updateGhost(this.ghostPoint);
  }

  _updateGhost(point) {
    if (!this.ghost || !this.ghostMeta) return;
    this.ghostPoint = point.clone();
    const x = round2(point.x);
    const z = round2(point.z);
    const candidate = {
      uid: '__ghost__', itemId: this.ghostMeta.id, x, z,
      rot: this.ghostRot, scale: 1
    };
    const baseY = this._baseY(x, z);
    this.ghost.position.set(x, baseY, z);
    this.ghost.rotation.y = -this.ghostRot * Math.PI / 180;
    this.ghost.visible = true;

    let res = this.validate(candidate, '__ghost__');
    if (this.items.length >= this.maxItems) res = { ok: false, reason: `最多只能擺放 ${this.maxItems} 個物件。` };
    this.ghostValid = res.ok;
    const color = res.ok ? '#6fdc93' : '#ff7b8f';
    this.ghostFootprint.material.color.set(color);
    this._placeFootprint(this.ghostFootprint, candidate, res.box);
    this.ghostFootprint.visible = true;
    this._ghostReason = res.reason || '';
  }

  placeGhost() {
    if (!this.ghost || !this.ghostMeta) return;
    if (!this.ghostValid) {
      this.options.onToast && this.options.onToast(this._ghostReason || '這裡不能放，請換個位置。');
      return;
    }
    if (this.items.length >= this.maxItems) {
      this.options.onToast && this.options.onToast(`最多只能擺放 ${this.maxItems} 個物件。`);
      return;
    }
    const x = round2(this.ghost.position.x);
    const z = round2(this.ghost.position.z);
    const item = {
      uid: (crypto.randomUUID ? crypto.randomUUID() : 'it-' + Date.now() + '-' + Math.random().toString(16).slice(2)),
      itemId: this.ghostMeta.id, x, z, rot: this.ghostRot, scale: 1
    };
    this.items.push(item);
    this._spawnGroup(item);
    this.select(item.uid);
    this.markDirty();
    this.options.onToast && this.options.onToast(`已放置「${this.ghostMeta.name}」。`);
    this._updateGhost(this.ghostPoint);
  }

  /* ---------- 選取與編輯 ---------- */
  select(uid) {
    this.selectedUid = uid;
    if (this.selectionHelper) {
      this.scene.remove(this.selectionHelper);
      this.selectionHelper.geometry.dispose();
      this.selectionHelper.material.dispose();
      this.selectionHelper = null;
    }
    if (this.selFootprint) {
      this.scene.remove(this.selFootprint);
      this.selFootprint.geometry.dispose();
      this.selFootprint.material.dispose();
      this.selFootprint = null;
    }
    const it = this.getSelected();
    if (!it) {
      this.options.onSelection && this.options.onSelection(null);
      return;
    }
    const g = this.groups.get(uid);
    if (g) {
      this.selectionHelper = new THREE.BoxHelper(g, 0xffc94d);
      this.selectionHelper.material.depthTest = false;
      this.selectionHelper.renderOrder = 4;
      this.scene.add(this.selectionHelper);
    }
    this.selFootprint = makeFootprintMesh('#ffc94d');
    this.selFootprint.material.opacity = 0.25;
    this.scene.add(this.selFootprint);
    this._placeFootprint(this.selFootprint, it);
    this.options.onSelection && this.options.onSelection({ item: it, meta: this.catalogMap[it.itemId] });
  }

  deselect() { this.select(null); }

  getSelected() {
    return this.items.find(it => it.uid === this.selectedUid) || null;
  }

  tryChange(uid, patch) {
    const it = this.items.find(x => x.uid === uid);
    if (!it) return false;
    const candidate = Object.assign({}, it, patch);
    const meta = this.catalogMap[it.itemId];
    if (patch.scale != null) {
      candidate.scale = round2(Math.min(meta.maxScale, Math.max(meta.minScale, patch.scale)));
    }
    candidate.rot = ((candidate.rot % 360) + 360) % 360;
    const res = this.validate(candidate, uid);
    if (!res.ok) {
      this.options.onToast && this.options.onToast(res.reason);
      return false;
    }
    Object.assign(it, candidate);
    this._refreshGroup(it);
    this.markDirty();
    if (this.options.onSelection) this.options.onSelection({ item: it, meta });
    return true;
  }

  rotateSelected(delta) {
    const it = this.getSelected();
    if (it) this.tryChange(it.uid, { rot: it.rot + delta });
  }

  scaleSelected(delta) {
    const it = this.getSelected();
    if (it) this.tryChange(it.uid, { scale: it.scale + delta });
  }

  deleteSelected() {
    const it = this.getSelected();
    if (!it) return;
    const g = this.groups.get(it.uid);
    if (g) {
      this.scene.remove(g);
      this.factory.disposeItem(g);
      this.groups.delete(it.uid);
    }
    this.items = this.items.filter(x => x.uid !== it.uid);
    this.deselect();
    this.markDirty();
    this.options.onToast && this.options.onToast('已刪除這個物件。');
  }

  /* ---------- 與滑鼠／觸控互動 ---------- */
  enable() {
    if (this.active) return;
    this.active = true;
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this._onPointerDown);
    dom.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    dom.addEventListener('wheel', this._onWheel, { passive: false });
    dom.addEventListener('dblclick', this._onDblClick);
    window.addEventListener('keydown', this._onKeyDown);
    dom.style.touchAction = 'none';
  }

  disable() {
    if (!this.active) return;
    this.active = false;
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this._onPointerDown);
    dom.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    dom.removeEventListener('wheel', this._onWheel);
    dom.removeEventListener('dblclick', this._onDblClick);
    window.removeEventListener('keydown', this._onKeyDown);
    this.cancelPlacement();
    this.deselect();
    this.mode = 'idle';
    this.pointers.clear();
  }

  _pointerToNdc(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    return this.ndc;
  }

  _groundPoint(e) {
    this._pointerToNdc(e);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const targets = [this.env.ground, ...this.builder.pickMeshes];
    const hits = this.raycaster.intersectObjects(targets, false);
    if (!hits.length) return null;
    const p = hits[0].point.clone();
    p.y = 0;
    return p;
  }

  _itemAt(e) {
    this._pointerToNdc(e);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects([...this.groups.values()], true);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o && !o.userData.uid) o = o.parent;
    return o ? o.userData.uid : null;
  }

  _houseAt(e) {
    if (!this.builder || !this.builder.group) return false;
    this._pointerToNdc(e);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.builder.group, true);
    if (!hits.length) return false;
    // 點到地板不算「點房屋」，避免在屋內選取時誤開大型檢視
    return hits[0].point.y > 0.22;
  }

  inspectItem(uid) {
    const it = uid ? this.items.find(x => x.uid === uid) : this.getSelected();
    if (!it) return false;
    const meta = this.catalogMap[it.itemId];
    if (!meta) return false;
    this.options.onInspect && this.options.onInspect(it, meta);
    return true;
  }

  _onDblClick(e) {
    if (!this.active || this.ghost) return;
    const uid = this._itemAt(e);
    if (uid) {
      this.select(uid);
      this.inspectItem(uid);
      e.preventDefault();
    }
  }

  _onPointerDown(e) {
    if (!this.active) return;
    if (e.button !== undefined && e.button !== 0) return;
    this.pendingHouseClick = false;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.renderer.domElement.setPointerCapture && this.renderer.domElement.setPointerCapture(e.pointerId);

    if (this.ghost) {
      const p = this._groundPoint(e);
      if (p) {
        this._updateGhost(p);
        this.placeGhost();
      }
      return;
    }

    const uid = this._itemAt(e);
    if (uid) {
      this.select(uid);
      const p = this._groundPoint(e);
      const it = this.getSelected();
      if (it && p) {
        this.mode = 'drag';
        this.dragUid = uid;
        this.dragStartPoint = { x: e.clientX, y: e.clientY };
        this.dragOrigin = { x: it.x, z: it.z };
        this.lastValid = { x: it.x, z: it.z };
        this.moved = false;
      }
      return;
    }

    this.mode = 'orbit';
    this.orbitStart = { x: e.clientX, y: e.clientY, theta: this.orbit.theta, phi: this.orbit.phi };
    this.pendingHouseClick = this._houseAt(e);
  }

  _onPointerMove(e) {
    if (!this.active) return;
    if (this.ghost) {
      const p = this._groundPoint(e);
      if (p) this._updateGhost(p);
      return;
    }
    if (this.mode === 'orbit' && this.orbitStart) {
      const dx = e.clientX - this.orbitStart.x;
      const dy = e.clientY - this.orbitStart.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) this.pendingHouseClick = false;
      this.orbit.theta = this.orbitStart.theta - dx * 0.006;
      this.orbit.phi = Math.max(0.22, Math.min(1.45, this.orbitStart.phi + dy * 0.005));
      this._applyOrbitCamera();
      return;
    }
    if (this.mode === 'drag' && this.dragUid) {
      if (this.dragStartPoint) {
        const dx = e.clientX - this.dragStartPoint.x;
        const dy = e.clientY - this.dragStartPoint.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) this.moved = true;
      }
      if (!this.moved) return;
      const it = this.items.find(x => x.uid === this.dragUid);
      const p = this._groundPoint(e);
      if (!it || !p) return;
      const candidate = Object.assign({}, it, { x: round2(p.x), z: round2(p.z) });
      const res = this.validate(candidate, it.uid);
      const g = this.groups.get(it.uid);
      if (g) {
        g.position.set(candidate.x, this._baseY(candidate.x, candidate.z), candidate.z);
      }
      if (this.selFootprint) {
        const meta = this.catalogMap[it.itemId];
        const box = footprintAabb(candidate, meta);
        this.selFootprint.material.color.set(res.ok ? '#ffc94d' : '#ff7b8f');
        this._placeFootprint(this.selFootprint, candidate, box);
      }
      if (res.ok) {
        it.x = candidate.x;
        it.z = candidate.z;
        this.lastValid = { x: it.x, z: it.z };
      }
    }
  }

  _onPointerUp(e) {
    if (!this.active) return;
    this.pointers.delete(e.pointerId);
    if (this.mode === 'drag' && this.dragUid) {
      const it = this.items.find(x => x.uid === this.dragUid);
      if (it && !this.dragStartPoint) return;
      if (it) {
        const finalRes = this.validate(it, it.uid);
        if (!finalRes.ok && this.lastValid) {
          it.x = this.lastValid.x;
          it.z = this.lastValid.z;
        }
        this._refreshGroup(it);
        if (this.moved) this.markDirty();
        if (this.options.onSelection) this.options.onSelection({ item: it, meta: this.catalogMap[it.itemId] });
      }
    }
    this.mode = 'idle';
    this.dragUid = null;
    this.dragStartPoint = null;
    this.orbitStart = null;
    if (this.pendingHouseClick) {
      this.pendingHouseClick = false;
      this.options.onHouseClick && this.options.onHouseClick();
    }
  }

  _onWheel(e) {
    if (!this.active) return;
    e.preventDefault();
    this.orbit.radius = Math.max(4.5, Math.min(24, this.orbit.radius + e.deltaY * 0.012));
    this._applyOrbitCamera();
  }

  _onKeyDown(e) {
    if (!this.active) return;
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'Escape') {
      if (this.ghost) this.cancelPlacement();
      else this.deselect();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.selectedUid) {
        e.preventDefault();
        this.deleteSelected();
      }
      return;
    }
    if (e.key === 'r' || e.key === 'R') {
      if (this.ghost) this.rotateGhost(15);
      else this.rotateSelected(15);
    }
  }

  _applyOrbitCamera() {
    const { target, radius, theta, phi } = this.orbit;
    this.camera.position.set(
      target.x + radius * Math.sin(phi) * Math.sin(theta),
      target.y + radius * Math.cos(phi),
      target.z + radius * Math.sin(phi) * Math.cos(theta)
    );
    this.camera.lookAt(target);
  }

  focusCamera() { this._applyOrbitCamera(); }

  // 依畫面比例自動把鏡頭拉到剛好裝得下整棟房子的距離
  fitView() {
    if (!this.active) return;
    const a = this.camera.aspect || 1;
    const vHalf = this.camera.fov * Math.PI / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * a);
    const half = Math.min(vHalf, hHalf);
    const r = 5.3 / Math.sin(Math.max(0.18, half));
    this.orbit.radius = Math.max(8.5, Math.min(24, r));
    this._applyOrbitCamera();
  }


  /* ---------- 儲存 ---------- */
  serialize() {
    return this.items.map(it => ({
      uid: it.uid,
      itemId: it.itemId,
      x: round2(it.x),
      z: round2(it.z),
      rot: round2(((it.rot % 360) + 360) % 360),
      scale: round2(it.scale)
    }));
  }

  layout() {
    return { model: this.builder.modelId, items: this.serialize() };
  }

  markDirty() {
    this.options.onCount && this.options.onCount(this.items.length, this.maxItems);
    this.options.onSaveState && this.options.onSaveState('pending');
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(true), 800);
  }

  async saveNow(auto) {
    clearTimeout(this.saveTimer);
    if (this.saving) {
      this.pendingSave = true;
      return { ok: false, pending: true };
    }
    // 防止未命名房子時嘗試儲存
    if (!this.options.houseName || !this.options.houseName.trim()) {
      const msg = '請先幫房子取名字。';
      this.options.onSaveState && this.options.onSaveState('error');
      this.options.onToast && this.options.onToast(msg);
      return { ok: false, message: msg };
    }
    this.saving = true;
    this.options.onSaveState && this.options.onSaveState('saving');
    let res;
    try {
      res = await this.options.save(this.layout());
    } catch (e) {
      res = { ok: false, message: '儲存失敗，請再試一次。' };
    }
    this.saving = false;
    if (res && res.ok) {
      this.options.onSaveState && this.options.onSaveState('saved');
      if (!auto) this.options.onToast && this.options.onToast('房子佈置已儲存。');
    } else {
      this.options.onSaveState && this.options.onSaveState('error');
      this.options.onToast && this.options.onToast((res && res.message) || '儲存失敗，請再試一次。');
    }
    if (this.pendingSave) {
      this.pendingSave = false;
      this.saveNow(true);
    }
    return res;
  }

  getSolidBoxes() {
    const out = [];
    for (const it of this.items) {
      const meta = this.catalogMap[it.itemId];
      if (!meta || !meta.solid) continue;
      out.push(footprintAabb(it, meta));
    }
    return out;
  }

  setUnlocked(list) {
    this.unlocked = new Set(list || []);
  }

  dispose() {
    clearTimeout(this.saveTimer);
    this.disable();
    this.scene.remove(this.ghostFootprint);
    this.ghostFootprint.geometry.dispose();
    this.ghostFootprint.material.dispose();
    if (this.selectionHelper) {
      this.scene.remove(this.selectionHelper);
      this.selectionHelper.geometry.dispose();
      this.selectionHelper.material.dispose();
    }
    if (this.selFootprint) {
      this.scene.remove(this.selFootprint);
      this.selFootprint.geometry.dispose();
      this.selFootprint.material.dispose();
    }
    this.groups.forEach(g => {
      this.scene.remove(g);
      this.factory.disposeItem(g);
    });
    this.groups.clear();
  }
}
