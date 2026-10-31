/* OC 房子 3D：第一人稱探索控制器（滑鼠＋鍵盤、觸控搖桿）
 *
 * 碰撞：
 *  - 外牆、門框、室內隔間牆使用 builder.wallBoxes
 *  - 家具與大型裝飾使用每件模型獨立的碰撞盒（editor.getSolidBoxes）
 *  - 地板／天花板以固定視線高度處理，玩家不會掉出房屋
 */
import * as THREE from '../vendor/three.module.js';
import { HOUSE } from './scene.js';

const PLAYER_RADIUS = 0.3;
const EYE_HEIGHT = 1.66;
const MAP_LIMIT = 9.4;

function circleHitsBox(x, z, r, b) {
  const cx = Math.max(b.minX, Math.min(x, b.maxX));
  const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

export class FirstPersonController {
  constructor(options) {
    this.camera = options.camera;
    this.dom = options.dom;
    this.builder = options.builder;
    this.editor = options.editor;
    this.joystick = options.joystick || null;
    this.knob = options.knob || null;
    this.onHint = options.onHint || null;
    this.onLockChange = options.onLockChange || null;

    this.active = false;
    this.pos = new THREE.Vector3(0, EYE_HEIGHT, 7.8);
    this.yaw = 0;
    this.pitch = -0.02;
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.lookPointer = null;
    this.lastLook = null;
    this.coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    this.lockRequested = false;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onCanvasPointerDown = this._onCanvasPointerDown.bind(this);
    this._onCanvasPointerMove = this._onCanvasPointerMove.bind(this);
    this._onCanvasPointerUp = this._onCanvasPointerUp.bind(this);
    this._onLockChange = this._onLockChange.bind(this);
    this._onJoyDown = this._onJoyDown.bind(this);
    this._onJoyMove = this._onJoyMove.bind(this);
    this._onJoyUp = this._onJoyUp.bind(this);
    this._onBlur = this._onBlur.bind(this);

    this.joystickId = null;
  }

  _insideHouse(x, z) {
    return x > HOUSE.inner.minX - 0.12 && x < HOUSE.inner.maxX + 0.12 &&
      z > HOUSE.inner.minZ - 0.12 && z < HOUSE.inner.maxZ + 0.12;
  }

  eyeY(x, z) {
    return (this._insideHouse(x, z) ? HOUSE.floorTop : 0) + EYE_HEIGHT;
  }

  blocked(x, z) {
    if (Math.abs(x) > MAP_LIMIT || Math.abs(z) > MAP_LIMIT) return true;
    for (const b of this.builder.wallBoxes) {
      if (circleHitsBox(x, z, PLAYER_RADIUS, b)) return true;
    }
    for (const b of this.editor.getSolidBoxes()) {
      if (circleHitsBox(x, z, PLAYER_RADIUS, b)) return true;
    }
    return false;
  }

  requestLock() {
    if (this.coarse || !this.dom.requestPointerLock) return;
    if (document.pointerLockElement === this.dom) return;
    // 確保 canvas 有焦點
    this.dom.focus();
    try {
      const p = this.dom.requestPointerLock();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { 
      console.warn('Pointer lock request failed:', e);
      /* 瀏覽器拒絕時仍可用拖曳看四周 */ 
    }
  }

  enter() {
    if (this.active) return;
    this.active = true;
    this.pos.set(0, EYE_HEIGHT + HOUSE.floorTop, 7.8);
    this.yaw = 0;
    this.pitch = -0.02;
    this.camera.rotation.order = 'YXZ';
    this._applyCamera();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('pointerlockchange', this._onLockChange);
    this.dom.addEventListener('pointerdown', this._onCanvasPointerDown);
    this.dom.addEventListener('pointermove', this._onCanvasPointerMove);
    this.dom.addEventListener('pointerup', this._onCanvasPointerUp);
    this.dom.style.touchAction = 'none';

    if (this.joystick) {
      this.joystick.classList.toggle('hidden', !this.coarse);
      this.joystick.addEventListener('pointerdown', this._onJoyDown);
      window.addEventListener('pointermove', this._onJoyMove);
      window.addEventListener('pointerup', this._onJoyUp);
    }

    // 電腦版：確保 canvas 有焦點並在同一個使用者點擊事件內立刻鎖定滑鼠
    this.dom.focus();
    this.requestLock();
    this.onHint && this.onHint(this.coarse ? '左邊搖桿移動，拖曳畫面看四周。' : 'WASD／方向鍵移動 · 滑鼠看四周 · Esc 放開滑鼠');
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    this.dom.removeEventListener('pointerdown', this._onCanvasPointerDown);
    this.dom.removeEventListener('pointermove', this._onCanvasPointerMove);
    this.dom.removeEventListener('pointerup', this._onCanvasPointerUp);
    if (document.pointerLockElement === this.dom) document.exitPointerLock();
    if (this.joystick) {
      this.joystick.classList.add('hidden');
      this.joystick.removeEventListener('pointerdown', this._onJoyDown);
      window.removeEventListener('pointermove', this._onJoyMove);
      window.removeEventListener('pointerup', this._onJoyUp);
    }
    this.keys.clear();
    this.joy.x = 0;
    this.joy.y = 0;
    this.lookPointer = null;
    this.lastLook = null;
    this._resetKnob();
  }

  _applyCamera() {
    this.camera.position.copy(this.pos);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  _onLockChange() {
    if (!this.active) return;
    const locked = document.pointerLockElement === this.dom;
    this.lockRequested = false;
    this.onLockChange && this.onLockChange(locked);
    this.onHint && this.onHint(locked
      ? 'WASD／方向鍵移動 · 滑鼠看四周 · Esc 放開滑鼠'
      : (this.coarse ? '左邊搖桿移動，拖曳畫面看四周。' : '滑鼠已放開；點一下畫面可繼續探索。'));
  }

  _onKeyDown(e) {
    if (!this.active) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
      this.keys.add(e.code);
      e.preventDefault();
    }
  }

  _onKeyUp(e) {
    this.keys.delete(e.code);
  }

  _onBlur() {
    this.keys.clear();
  }

  _onMouseMove(e) {
    if (!this.active || document.pointerLockElement !== this.dom) return;
    this.yaw -= e.movementX * 0.0022;
    this.pitch -= e.movementY * 0.0022;
    this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch));
    this._applyCamera();
  }

  _onCanvasPointerDown(e) {
    if (!this.active) return;
    if (this.joystick && this.joystick.contains(e.target)) return;
    this.dom.setPointerCapture && this.dom.setPointerCapture(e.pointerId);
    // 確保 canvas 有焦點
    this.dom.focus();
    if (!this.coarse && document.pointerLockElement !== this.dom) {
      this.requestLock();
      // 鎖定失敗時的備援：按住拖曳也能轉動視角
      this.lookPointer = e.pointerId;
      this.lastLook = { x: e.clientX, y: e.clientY };
      return;
    }
    if (this.coarse && this.lookPointer === null) {
      this.lookPointer = e.pointerId;
      this.lastLook = { x: e.clientX, y: e.clientY };
    }
  }

  _onCanvasPointerMove(e) {
    if (!this.active) return;
    if (this.coarse && this.lookPointer === e.pointerId && this.lastLook) {
      const dx = e.clientX - this.lastLook.x;
      const dy = e.clientY - this.lastLook.y;
      this.lastLook = { x: e.clientX, y: e.clientY };
      this.yaw -= dx * 0.005;
      this.pitch -= dy * 0.005;
      this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch));
      this._applyCamera();
      return;
    }
    if (!this.coarse && document.pointerLockElement !== this.dom &&
      this.lookPointer === e.pointerId && this.lastLook) {
      const dx = e.clientX - this.lastLook.x;
      const dy = e.clientY - this.lastLook.y;
      this.lastLook = { x: e.clientX, y: e.clientY };
      this.yaw -= dx * 0.005;
      this.pitch -= dy * 0.005;
      this.pitch = Math.max(-1.1, Math.min(1.1, this.pitch));
      this._applyCamera();
    }
  }

  _onCanvasPointerUp(e) {
    if (this.lookPointer === e.pointerId) {
      this.lookPointer = null;
      this.lastLook = null;
    }
  }

  /* ---------- 觸控搖桿 ---------- */
  _joyCenter() {
    const r = this.joystick.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width * 0.32 };
  }

  _onJoyDown(e) {
    if (!this.active) return;
    e.preventDefault();
    e.stopPropagation();
    this.joystickId = e.pointerId;
    this.joystick.setPointerCapture && this.joystick.setPointerCapture(e.pointerId);
    this._updateJoy(e);
  }

  _onJoyMove(e) {
    if (this.joystickId !== e.pointerId) return;
    this._updateJoy(e);
  }

  _onJoyUp(e) {
    if (this.joystickId !== e.pointerId) return;
    this.joystickId = null;
    this.joy.x = 0;
    this.joy.y = 0;
    this._resetKnob();
  }

  _updateJoy(e) {
    const c = this._joyCenter();
    let dx = e.clientX - c.x;
    let dy = e.clientY - c.y;
    const len = Math.hypot(dx, dy);
    if (len > c.r) {
      dx = dx / len * c.r;
      dy = dy / len * c.r;
    }
    this.joy.x = dx / c.r;
    this.joy.y = dy / c.r;
    if (this.knob) {
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  }

  _resetKnob() {
    if (this.knob) this.knob.style.transform = 'translate(0px, 0px)';
  }

  _tryMove(dx, dz) {
    // 分成小步，避免高速穿過薄牆或家具邊角
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.08));
    const sx = dx / steps;
    const sz = dz / steps;
    for (let i = 0; i < steps; i++) {
      if (!this.blocked(this.pos.x + sx, this.pos.z)) this.pos.x += sx;
      if (!this.blocked(this.pos.x, this.pos.z + sz)) this.pos.z += sz;
    }
    // 如果仍然卡在碰撞盒內（例如房子重新載入後），推到最近的合法位置
    if (this.blocked(this.pos.x, this.pos.z)) {
      const dirs = [[0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2], [0.2, 0.2], [-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2]];
      for (const [ox, oz] of dirs) {
        if (!this.blocked(this.pos.x + ox, this.pos.z + oz)) {
          this.pos.x += ox;
          this.pos.z += oz;
          break;
        }
      }
    }
  }

  update(dt) {
    if (!this.active) return;
    let forward = 0;
    let strafe = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafe += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafe -= 1;

    forward += -this.joy.y;
    strafe += this.joy.x;
    const mag = Math.hypot(forward, strafe);
    if (mag > 1) { forward /= mag; strafe /= mag; }
    if (mag >= 0.04) {
      const speed = 3.1;
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      // 相機前方為 -Z：forward 往 -Z、strafe 往 +X
      const dx = (-sin * forward + cos * strafe) * speed * dt;
      const dz = (-cos * forward - sin * strafe) * speed * dt;
      this._tryMove(dx, dz);
    }

    // 地板／天花板：固定視線高度，進屋時踩上木地板，不會掉出屋外
    const targetY = this.eyeY(this.pos.x, this.pos.z);
    this.pos.y += (targetY - this.pos.y) * Math.min(1, dt * 12);
    this._applyCamera();
  }

  dispose() {
    this.exit();
  }
}
