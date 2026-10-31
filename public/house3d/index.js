/* OC 房子 3D：入口，組合場景、家具、編輯器與第一人稱控制器 */
import * as THREE from '../vendor/three.module.js';
import { HouseEnvironment, HouseBuilder } from './scene.js';
import { FurnitureFactory } from './furniture.js';
import { HouseEditor } from './editor.js';
import { FirstPersonController } from './player.js';
import { ItemInspector, HouseViewer, PreviewStudio } from './preview.js';

export function mountHouse3D(opts) {
  const {
    container, house, catalog, callbacks = {}
  } = opts;
  const catalogMap = {};
  (catalog.items || []).forEach(it => { catalogMap[it.id] = it; });

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 200);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.className = 'house-canvas';
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  const env = new HouseEnvironment(scene, renderer);
  const builder = new HouseBuilder(scene, catalogMap);
  builder.setModel(house.model, house.name);

  const factory = new FurnitureFactory();
  const editor = new HouseEditor({
    scene, camera, renderer, factory, builder, env, catalogMap,
    items: house.items || [],
    unlocked: house.unlocked || [],
    maxItems: catalog.maxItems || 80,
    houseName: house.name || '',
    save: async (layout) => {
      const res = await callbacks.saveLayout(layout);
      if (res && res.ok && res.house) {
        house.model = res.house.model;
        house.items = res.house.items;
        house.unlocked = res.house.unlocked;
        editor.setUnlocked(res.house.unlocked);
        editor.items = (res.house.items || []).map(it => Object.assign({}, it));
        callbacks.onStudent && callbacks.onStudent(res.house, res.student);
      }
      return res;
    },
    onToast: (msg) => callbacks.toast && callbacks.toast(msg),
    onHint: (msg) => callbacks.onHint && callbacks.onHint(msg),
    onSelection: (sel) => {
      syncSelectionBar(sel);
      callbacks.onSelection && callbacks.onSelection(sel);
    },
    onCount: (n, max) => callbacks.onCount && callbacks.onCount(n, max),
    onSaveState: (s) => callbacks.onSaveState && callbacks.onSaveState(s),
    onEditingChange: (on) => callbacks.onEditingChange && callbacks.onEditingChange(on),
    onInspect: (item, meta) => openItemInspector(item, meta),
    onHouseClick: () => openHouseViewer()
  });

  const joystick = document.getElementById('houseJoystick');
  const knob = document.getElementById('houseJoystickKnob');
  const player = new FirstPersonController({
    camera, dom: renderer.domElement, builder, editor,
    joystick, knob,
    onHint: (msg) => callbacks.onHint && callbacks.onHint(msg)
  });

  /* ---------- PreviewStudio：預先產生縮圖 ---------- */
  const previewStudio = new PreviewStudio();
  (catalog.items || []).forEach(it => {
    if (it.category !== 'house') previewStudio.getThumb(it.model).catch(() => {});
  });

  /* ---------- ItemInspector 與 HouseViewer ---------- */
  let itemInspector = null;
  let houseViewer = null;

  function openItemInspector(item, meta) {
    if (itemInspector) itemInspector.dispose();
    itemInspector = new ItemInspector({ container: document.body, onClose: () => { itemInspector = null; } });
    itemInspector.open(item, meta);
  }

  function openHouseViewer() {
    if (houseViewer) houseViewer.dispose();
    houseViewer = new HouseViewer({ container: document.body, onClose: () => { houseViewer = null; } });
    houseViewer.open(house, catalogMap);
  }

  /* ---------- 選取工具列 ---------- */
  const selBar = document.getElementById('houseSelectionBar');
  const selName = document.getElementById('houseSelName');
  const selScale = document.getElementById('houseSelScale');
  function syncSelectionBar(sel) {
    if (!selBar) return;
    if (!sel) {
      selBar.classList.add('hidden');
      return;
    }
    selBar.classList.remove('hidden');
    if (selName) selName.textContent = sel.meta ? sel.meta.name : '';
    if (selScale) selScale.textContent = Math.round(sel.item.scale * 100) + '%';
  }
  if (selBar && !selBar._wired) {
    selBar._wired = true;
    selBar.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'rotl') editor.rotateSelected(-15);
        else if (act === 'rotr') editor.rotateSelected(15);
        else if (act === 'bigger') editor.scaleSelected(0.1);
        else if (act === 'smaller') editor.scaleSelected(-0.1);
        else if (act === 'delete') editor.deleteSelected();
        else if (act === 'inspect') editor.inspectItem(editor.selectedUid);
      });
    });
  }

  /* ---------- 尺寸 ---------- */
  function resize() {
    const w = Math.max(1, container.clientWidth || 1);
    const h = Math.max(1, container.clientHeight || 1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (editor) editor.fitView();
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  /* ---------- 模式切換 ---------- */
  let mode = 'edit';
  function setMode(next) {
    if (next === mode) return;
    mode = next;
    if (mode === 'explore') {
      editor.disable();
      builder.setRoofVisible(true);
      player.enter();
      syncSelectionBar(null);
    } else {
      player.exit();
      builder.setRoofVisible(false);
      editor.enable();
      editor.fitView();
    }
    callbacks.onModeChange && callbacks.onModeChange(mode);
  }

  /* ---------- 自動儲存與離開前草稿 ---------- */
  function flushBeacon() {
    try {
      // 僅在房子已命名且有變更時才發送 beacon
      if (!house || !house.name) return;
      const body = JSON.stringify({ model: builder.modelId, items: editor.serialize() });
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon) navigator.sendBeacon('/api/house/save', blob);
    } catch (e) { /* 忽略：下次進屋仍會使用伺服器上的版本 */ }
  }
  function onPageHide() { flushBeacon(); }
  function onVisibility() {
    if (document.visibilityState === 'hidden') flushBeacon();
  }
  window.addEventListener('pagehide', onPageHide);
  document.addEventListener('visibilitychange', onVisibility);

  /* ---------- 渲染迴圈 ---------- */
  let last = performance.now();
  renderer.setAnimationLoop((t) => {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    env.update(dt);
    if (mode === 'explore') player.update(dt);
    renderer.render(scene, camera);
  });

  builder.setRoofVisible(false);
  editor.enable();
  editor.fitView();
  callbacks.onCount && callbacks.onCount(editor.items.length, catalog.maxItems || 80);
  callbacks.onModeChange && callbacks.onModeChange('edit');

  let disposed = false;
  return {
    setMode,
    getMode: () => mode,
    beginPlacement(itemId) {
      if (mode !== 'edit') return;
      editor.beginPlacement(itemId);
    },
    rotateGhost(delta) { editor.rotateGhost(delta || 15); },
    setHouseModel(modelId) {
      const meta = catalogMap[modelId];
      if (!meta || meta.category !== 'house') return false;
      if (!editor.unlocked.has(modelId)) return false;
      builder.setModel(modelId, house.name);
      house.model = modelId;
      editor.markDirty();
      callbacks.onModelChange && callbacks.onModelChange(modelId);
      return true;
    },
    setUnlocked(list) { editor.setUnlocked(list); },
    setName(name) {
      house.name = name;
      builder.setName(name);
      editor.options.houseName = name;
    },
    saveNow(auto) { return editor.saveNow(auto !== false); },
    clearSelection() { editor.deselect(); },
    debug: { scene, camera, renderer, builder, editor, player },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      ro.disconnect();
      renderer.setAnimationLoop(null);
      if (itemInspector) { itemInspector.dispose(); itemInspector = null; }
      if (houseViewer) { houseViewer.dispose(); houseViewer = null; }
      previewStudio.dispose();
      player.dispose();
      editor.dispose();
      builder.dispose();
      env.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
  };
}
