/* OC class 第三版前端邏輯：班級、作業、兌換、商店、服飾、寶箱與能力 */

/*
 * 測試用開關：設為 true 時，每次重新整理網頁都會要求重新登入
 * （班級、學生登入號碼、作業、資產都存在伺服器，不會因為重新登入而改變）
 */
const LOGOUT_ON_EVERY_LOAD = true;

const $ = (id) => document.getElementById(id);

// 第二版與第三版畫面
const TEACHER_SCREENS = ['teacher-home', 't-assign-individual', 't-assign-all', 't-records', 't-settings', 't-password'];
const STUDENT_SCREENS = ['s-home', 's-assignments', 's-shop', 's-store', 's-wardrobe', 's-chest', 's-house', 's-card'];
const ALL_SCREENS = [
  'setup', 'role',
  'teacher-password-set', 'teacher-password-login', 'teacher-setup', 'teacher-home',
  't-assign-individual', 't-assign-all', 't-records', 't-settings', 't-password',
  'student-login', 's-home', 's-assignments', 's-shop', 's-store', 's-wardrobe', 's-chest', 's-house', 's-card'
];

const MENU = {
  teacher: [
    ['t-assign-individual', '📝', '個別作業派發'],
    ['t-assign-all', '📚', '全班作業派發'],
    ['t-records', '🗂️', '作業紀錄'],
    ['t-settings', '⚙️', '設定'],
    ['t-password', '🔑', '教師密碼修改']
  ],
  student: [
    ['s-home', '🧸', '我的資料'],
    ['s-house', '🏠', 'OC 房子'],
    ['s-card', '🎴', '家具全擁有卡'],
    ['s-assignments', '📖', '我的作業'],
    ['s-shop', '🪙', '鑽石兌換'],
    ['s-store', '💎', '鑽石商店'],
    ['s-wardrobe', '👕', '我的服飾'],
    ['s-chest', '🎁', '寶箱抽獎']
  ]
};

function show(name) {
  ALL_SCREENS.forEach(s => $('screen-' + s).classList.toggle('hidden', s !== name));
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 2200);
}

function showError(el, msg) {
  if (!el) return;
  if (!msg) { el.classList.add('hidden'); el.textContent = ''; return; }
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideOk(el) { if (el) el.classList.add('hidden'); }

async function api(path, options) {
  const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, options || {}));
  let data = null;
  try { data = await res.json(); } catch (e) { data = { ok: false, message: '伺服器沒有回應，請再試一次。' }; }
  return { status: res.status, data };
}

/* ---------------- 第三版：商品目錄與五種能力 ---------------- */
const STAT_KEYS = ['imagination', 'intelligence', 'honesty', 'effort', 'attitude'];
const STAT_NAMES = {
  imagination: '想像力',
  intelligence: '智力',
  honesty: '誠實',
  effort: '努力',
  attitude: '態度'
};
const STAT_ICONS = {
  imagination: '🌈',
  intelligence: '🧠',
  honesty: '💛',
  effort: '💪',
  attitude: '🌟'
};
const RARITY_NAMES = { junk: '破爛', common: '普通', super: '超級', epic: '史詩' };
const SLOT_NAMES = {
  hat: '帽子', glasses: '眼鏡', top: '上衣', pants: '褲子／裙子',
  shoes: '鞋子', back: '背部裝飾', other: '其他裝飾'
};
const EQUIP_SLOTS = ['hat', 'glasses', 'top', 'pants', 'shoes', 'back', 'other'];

function uid() {
  return (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now() + '-' + Math.random().toString(16).slice(2);
}

let CATALOG = null;
let CATALOG_ITEMS = [];
let CHEST_INFO = { cost: 60 };

async function ensureCatalog() {
  if (CATALOG) return CATALOG;
  const { data } = await api('/api/shop/items');
  CATALOG = {};
  if (data && data.ok) {
    CATALOG_ITEMS = data.items || [];
    CATALOG_ITEMS.forEach(i => { CATALOG[i.id] = i; });
    if (data.chest) CHEST_INFO = data.chest;
  }
  return CATALOG;
}
function itemById(id) { return (CATALOG && id) ? CATALOG[id] : null; }

/* ---------------- 可愛卡通人物（依座號固定造型，加上服飾圖層） ---------------- */
const SKINS = ['#FFE0C2', '#F7CFA9', '#E8B98C', '#C98F63'];
const HAIRS = ['#5B4B6E', '#7A5C3E', '#3E3A55', '#9B6A3C', '#4A6E8A', '#8E5B8E'];
const SHIRTS = ['#C9B6F0', '#FFE08A', '#9ED4F5', '#FFB4C2', '#A8E6C3', '#FFD3A5'];
const HAIR_STYLES = ['short', 'bob', 'spiky', 'twin'];

function rng(seed) {
  let s = seed * 2654435761 % 4294967296;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}
function pick(arr, r) { return arr[Math.floor(r() * arr.length)]; }

function starPoints(cx, cy, outer, inner) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = (i % 2 === 0) ? outer : inner;
    const a = -Math.PI / 2 + i * Math.PI / 5;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

function renderBack(it) {
  if (!it) return '';
  const v = it.visual;
  if (v.kind === 'wings') return `
    <path d="M46 84 q-26 -20 -34 2 q-5 18 14 24 q12 3 22 -10z" fill="${v.color}" stroke="#BFD8F2" stroke-width="2"/>
    <path d="M74 84 q26 -20 34 2 q5 18 -14 24 q-12 3 -22 -10z" fill="${v.color}" stroke="#BFD8F2" stroke-width="2"/>`;
  if (v.kind === 'cape') return `
    <path d="M36 84 q24 -10 48 0 l16 38 q-40 12 -80 0z" fill="${v.color}"/>
    <path d="M42 88 q18 -6 36 0" stroke="rgba(255,255,255,.7)" stroke-width="2" fill="none"/>
    <circle cx="60" cy="86" r="4" fill="${v.color2 || '#FFD966'}"/>`;
  if (v.kind === 'aura') return `
    <circle cx="60" cy="70" r="46" fill="none" stroke="${v.color}" stroke-width="3" stroke-dasharray="3 7" opacity=".9"/>
    <polygon points="${starPoints(22, 42, 6, 2.6)}" fill="${v.color2}"/>
    <polygon points="${starPoints(100, 54, 5, 2.2)}" fill="${v.color2}"/>`;
  return '';
}

function renderPants(it) {
  if (!it) return '';
  const v = it.visual;
  if (v.kind === 'skirt') return `
    <path d="M44 96 h32 l13 20 q-29 6 -58 0z" fill="${v.color}"/>
    <path d="M42 116 q18 5 36 0" stroke="rgba(255,255,255,.75)" stroke-width="3" fill="none"/>`;
  if (v.kind === 'shorts') return `
    <rect x="40" y="99" width="40" height="13" rx="5" fill="${v.color}"/>
    <path d="M60 101 v10" stroke="rgba(255,255,255,.55)" stroke-width="2"/>`;
  return `
    <rect x="38" y="99" width="44" height="18" rx="6" fill="${v.color}"/>
    <path d="M60 101 v14" stroke="rgba(255,255,255,.5)" stroke-width="2"/>`;
}

function renderShoes(it) {
  if (!it) return '';
  const v = it.visual;
  if (v.kind === 'boots') return `
    <rect x="41" y="105" width="14" height="18" rx="5" fill="${v.color}"/>
    <rect x="65" y="105" width="14" height="18" rx="5" fill="${v.color}"/>
    <rect x="40" y="111" width="16" height="4" rx="2" fill="${v.color2}"/>
    <rect x="64" y="111" width="16" height="4" rx="2" fill="${v.color2}"/>`;
  return `
    <ellipse cx="49" cy="119" rx="11" ry="6" fill="${v.color}" stroke="#C9D8EA" stroke-width="1.5"/>
    <ellipse cx="71" cy="119" rx="11" ry="6" fill="${v.color}" stroke="#C9D8EA" stroke-width="1.5"/>
    <path d="M39 121 h20 M61 121 h20" stroke="${v.color2}" stroke-width="3" stroke-linecap="round"/>`;
}

function renderTop(it) {
  if (!it) return '';
  const v = it.visual;
  if (v.kind === 'tee') return `
    <path d="M34 96 h52" stroke="${v.color2}" stroke-width="4"/>
    <path d="M34 104 h52" stroke="#fff" stroke-width="3" opacity=".8"/>`;
  if (v.kind === 'hoodie') return `
    <path d="M42 86 q18 -10 36 0 q-18 10 -36 0z" fill="${v.color2}"/>
    <path d="M49 90 v8 M71 90 v8" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
    <rect x="47" y="101" width="26" height="11" rx="4" fill="${v.color2}" opacity=".85"/>`;
  if (v.kind === 'armor') return `
    <path d="M36 92 h48 l-4 18 q-20 6 -40 0z" fill="${v.color2}" opacity=".6"/>
    <circle cx="30" cy="95" r="7" fill="${v.color2}"/>
    <circle cx="90" cy="95" r="7" fill="${v.color2}"/>
    <path d="M60 94 v16" stroke="#fff" stroke-width="2" opacity=".8"/>`;
  return '';
}

function renderHat(it) {
  if (!it) return '';
  const v = it.visual;
  if (v.kind === 'straw') return `
    <ellipse cx="60" cy="33" rx="38" ry="9" fill="${v.color}"/>
    <path d="M36 33 q4 -19 24 -19 q20 0 24 19z" fill="${v.color}"/>
    <rect x="36" y="30" width="48" height="5" rx="2.5" fill="${v.color2}"/>`;
  if (v.kind === 'cap') return `
    <path d="M34 31 q2 -21 26 -21 q24 0 26 21z" fill="${v.color}"/>
    <path d="M60 31 h29 q5 0 5 4 q0 4 -6 4 h-28z" fill="${v.color2}"/>
    <circle cx="60" cy="11" r="3" fill="${v.color2}"/>`;
  if (v.kind === 'crown') return `
    <path d="M32 33 v-17 l10 8 l8 -14 l10 10 l10 -10 l8 14 l10 -8 v17z" fill="${v.color}"/>
    <rect x="32" y="31" width="56" height="7" rx="3" fill="${v.color}"/>
    <circle cx="60" cy="25" r="3.5" fill="${v.color2}"/>
    <circle cx="43" cy="28" r="2.5" fill="${v.color2}"/>
    <circle cx="77" cy="28" r="2.5" fill="${v.color2}"/>`;
  if (v.kind === 'paper') return `
    <path d="M34 33 l14 -19 l12 10 l12 -10 l14 19z" fill="${v.color}"/>
    <path d="M46 33 l14 -8 l14 8" fill="none" stroke="${v.color2}" stroke-width="2"/>`;
  return '';
}

function renderGlasses(it) {
  if (!it) return '';
  const v = it.visual;
  if (v.kind === 'star') return `
    <polygon points="${starPoints(49, 60, 10, 4.4)}" fill="${v.color}"/>
    <polygon points="${starPoints(71, 60, 10, 4.4)}" fill="${v.color}"/>
    <path d="M58 59 h4" stroke="${v.color}" stroke-width="3"/>`;
  return `
    <circle cx="49" cy="60" r="10" fill="rgba(255,255,255,.25)" stroke="${v.color}" stroke-width="3"/>
    <circle cx="71" cy="60" r="10" fill="rgba(255,255,255,.25)" stroke="${v.color}" stroke-width="3"/>
    <path d="M59 60 h2" stroke="${v.color}" stroke-width="3"/>
    <path d="M39 58 l-7 -2 M81 58 l7 -2" stroke="${v.color}" stroke-width="2.5" stroke-linecap="round"/>`;
}

function renderOther(it) {
  if (!it) return '';
  const v = it.visual;
  if (v.kind === 'badge') return `
    <circle cx="82" cy="97" r="8" fill="${v.color}" stroke="#fff" stroke-width="2"/>
    <polygon points="${starPoints(82, 97, 5, 2.2)}" fill="${v.color2}"/>`;
  if (v.kind === 'scarf') return `
    <path d="M44 83 q16 10 32 0 l3 9 q-19 10 -38 0z" fill="${v.color}"/>
    <path d="M70 91 l6 17 h-8z" fill="${v.color2}"/>`;
  return '';
}

function avatarSVG(no, equipped) {
  const r = rng(no + 7);
  const skin = pick(SKINS, r), hair = pick(HAIRS, r), baseShirt = pick(SHIRTS, r);
  const style = pick(HAIR_STYLES, r);
  const worn = equipped || {};
  const back = itemById(worn.back), hat = itemById(worn.hat), glasses = itemById(worn.glasses);
  const top = itemById(worn.top), pants = itemById(worn.pants), shoes = itemById(worn.shoes);
  const other = itemById(worn.other);
  const shirt = top ? top.visual.color : baseShirt;

  let hairBack = style === 'twin'
    ? `<circle cx="20" cy="66" r="12" fill="${hair}"/><circle cx="100" cy="66" r="12" fill="${hair}"/>` : '';
  let hairFront = '';
  if (style === 'short') hairFront = `<path d="M34 54 q4 -30 26 -30 q22 0 26 30 q-12 -12 -26 -12 q-14 0 -26 12z" fill="${hair}"/>`;
  else if (style === 'bob') hairFront = `<path d="M32 74 q0 -46 28 -46 q28 0 28 46 q-8 -20 -28 -20 q-20 0 -28 20z" fill="${hair}"/>`;
  else if (style === 'spiky') hairFront = `<path d="M34 52 l6 -14 l8 10 l7 -16 l8 14 l9 -12 l6 16 q-14 -10 -26 -8 q-12 2 -18 10z" fill="${hair}"/>`;
  else hairFront = `<path d="M32 56 q4 -32 28 -32 q24 0 28 32 q-14 -14 -28 -14 q-14 0 -28 14z" fill="${hair}"/>`;

  return `<svg viewBox="0 0 120 130" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="60" cy="124" rx="34" ry="5.5" fill="rgba(155,127,212,.18)"/>
    ${renderBack(back)}
    ${hairBack}
    <rect x="52" y="78" width="16" height="14" rx="6" fill="${skin}"/>
    <path d="M27 116 q0 -30 33 -30 q33 0 33 30z" fill="${shirt}"/>
    <rect x="19" y="94" width="10" height="19" rx="5" fill="${shirt}"/>
    <rect x="91" y="94" width="10" height="19" rx="5" fill="${shirt}"/>
    ${renderPants(pants)}
    ${renderShoes(shoes)}
    ${renderTop(top)}
    ${renderOther(other)}
    <circle cx="60" cy="56" r="30" fill="${skin}"/>
    ${hairFront}
    <circle cx="49" cy="60" r="4.2" fill="#3E3A55"/><circle cx="71" cy="60" r="4.2" fill="#3E3A55"/>
    <circle cx="50.5" cy="58.5" r="1.5" fill="#fff"/><circle cx="72.5" cy="58.5" r="1.5" fill="#fff"/>
    <path d="M54 71 q6 6 12 0" stroke="#3E3A55" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="40" cy="68" r="5.5" fill="#FF9FB4" opacity=".75"/>
    <circle cx="80" cy="68" r="5.5" fill="#FF9FB4" opacity=".75"/>
    ${renderGlasses(glasses)}
    ${renderHat(hat)}
  </svg>`;
}

/* ---------------- 能力顯示 ---------------- */
function buffTags(stats) {
  const keys = STAT_KEYS.filter(k => stats && stats[k] > 0);
  if (keys.length === 0) return '<span class="tag">純外觀</span>';
  return keys.map(k => `<span class="tag stat">${STAT_NAMES[k]} +${stats[k]}</span>`).join('');
}

function rarityBadge(rarity) {
  return `<span class="rarity rar-${rarity}">${rarity === 'epic' ? '✦ ' : ''}${RARITY_NAMES[rarity] || rarity}</span>`;
}

function renderStats(container, stats) {
  if (!container) return;
  const total = (stats && stats.total) || {};
  const bonus = (stats && stats.bonus) || {};
  container.innerHTML = STAT_KEYS.map(k => {
    const b = bonus[k] || 0;
    return `<div class="ability-card">
      <div class="ability-icon">${STAT_ICONS[k]}</div>
      <div class="ability-name">${STAT_NAMES[k]}</div>
      <div class="ability-value">${total[k] || 0}${b ? `<small>+${b}</small>` : ''}</div>
    </div>`;
  }).join('');
}

function wornNames(equipped) {
  if (!equipped) return '尚未穿戴';
  const names = [];
  ['hat', 'glasses', 'top', 'pants', 'shoes', 'back', 'other'].forEach(slot => {
    const it = itemById(equipped[slot]);
    if (it) names.push(it.name);
  });
  return names.length ? names.join('、') : '尚未穿戴';
}

/* ---------------- 複製 ---------------- */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(String(text));
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = String(text);
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
}

function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------------- 畫面狀態 ---------------- */
let state = null;
let current = null;
let currentStudent = null;   // 教師點開的學生資料

function setScreen(name) {
  if (current === 's-house' && name !== 's-house') teardownHouse();
  current = name;
  show(name);
  render(name);
}

function go(name) {
  if (name !== 's-house') teardownHouse();
  current = name;
  refresh();
}

async function refresh() {
  const { data } = await api('/api/state');
  state = data;
  applyState();
}

function updateHeader() {
  const st = state;
  const badge = $('roleBadge'), logout = $('logoutBtn'), menuBtn = $('menuBtn');
  const canMenu = !!(st && st.setupDone && st.identity);
  menuBtn.classList.toggle('hidden', !canMenu);
  logout.classList.toggle('hidden', !(st && st.role));
  if (!st || !st.identity) { badge.classList.add('hidden'); return; }
  badge.classList.remove('hidden');
  badge.textContent = st.identity === 'teacher' ? '🧑‍🏫 教師' : '🎒 學生';
  buildMenu();
}

function applyState() {
  updateHeader();
  const st = state;
  if (!st.setupDone) return setScreen('setup');
  if (!st.identity) {
    $('roleClassInfo').textContent = st.hasClass
      ? `${st.grade} 年 ${st.klass} 班 · 班級代碼 ${st.classCode}（班級資料已保留，不用重新設定）`
      : '';
    return setScreen('role');
  }

  if (st.identity === 'teacher') {
    if (!st.passwordSet) return setScreen('teacher-password-set');
    if (st.role !== 'teacher') return setScreen('teacher-password-login');
    if (!st.hasClass) return setScreen('teacher-setup');
    if (!TEACHER_SCREENS.includes(current)) current = 'teacher-home';
  } else {
    if (st.role !== 'student') return setScreen('student-login');
    if (!STUDENT_SCREENS.includes(current)) current = 's-home';
  }
  show(current);
  render(current);
}

function render(name) {
  try {
    if (name === 'teacher-home') renderDashboard();
    else if (name === 't-assign-individual') renderAssignIndividual();
    else if (name === 't-assign-all') renderAssignAll();
    else if (name === 't-records') renderRecords();
    else if (name === 't-settings') renderSettings();
    else if (name === 't-password') renderPasswordPage();
    else if (name === 's-home') renderStudentHome();
    else if (name === 's-assignments') renderStudentAssignments();
    else if (name === 's-shop') renderShop();
    else if (name === 's-store') renderStore();
    else if (name === 's-wardrobe') renderWardrobe();
    else if (name === 's-chest') renderChest();
    else if (name === 's-house') renderHouse();
    else if (name === 's-card') renderCard();
  } catch (e) {
    console.error(e);
  }
}

/* ---------------- 右側三條槓選單 ---------------- */
function openDrawer() { $('drawerMask').classList.remove('hidden'); $('drawer').classList.remove('hidden'); }
function closeDrawer() { $('drawerMask').classList.add('hidden'); $('drawer').classList.add('hidden'); }

function buildMenu() {
  const list = $('menuList');
  list.innerHTML = '';
  const st = state;
  let items = [];
  if (st.identity === 'teacher') {
    items = (st.role === 'teacher')
      ? MENU.teacher
      : [['teacher-password-login', '🔑', '教師密碼登入']];
  } else {
    items = (st.role === 'student')
      ? MENU.student
      : [['student-login', '🎒', '學生登入']];
  }
  items.forEach(([screen, icon, label]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-item' + (current === screen ? ' active' : '');
    btn.innerHTML = `<span class="mi-icon">${icon}</span><span>${label}</span>`;
    btn.addEventListener('click', () => { closeDrawer(); go(screen); });
    list.appendChild(btn);
  });
}

$('menuBtn').addEventListener('click', openDrawer);
$('drawerClose').addEventListener('click', closeDrawer);
$('drawerMask').addEventListener('click', closeDrawer);

/* ---------------- 一、初始設定 ---------------- */
$('setupConfirmBtn').addEventListener('click', async () => {
  const grade = $('inputGrade').value.trim();
  const klass = $('inputKlass').value.trim();
  showError($('setupError'), '');
  if (!grade) return showError($('setupError'), '請輸入年級喔～');
  if (!klass) return showError($('setupError'), '請輸入班級喔～');
  const { data } = await api('/api/setup', { method: 'POST', body: JSON.stringify({ grade, klass }) });
  if (!data.ok) return showError($('setupError'), data.message);
  show('role');
});
$('inputGrade').addEventListener('keydown', e => { if (e.key === 'Enter') $('inputKlass').focus(); });
$('inputKlass').addEventListener('keydown', e => { if (e.key === 'Enter') $('setupConfirmBtn').click(); });

/* ---------------- 二、身分選擇 ---------------- */
document.querySelectorAll('.btn-role').forEach(btn => {
  btn.addEventListener('click', async () => {
    showError($('roleError'), '');
    const { data } = await api('/api/setup/role', { method: 'POST', body: JSON.stringify({ role: btn.dataset.role }) });
    if (!data.ok) return showError($('roleError'), data.message);
    refresh();
  });
});

/* ---------------- 教師密碼：設定 / 登入 / 修改 / 恢復 ---------------- */
$('pwSetBtn').addEventListener('click', async () => {
  const pw = $('pwSet').value, pw2 = $('pwSet2').value;
  showError($('pwSetError'), '');
  if (pw.length < 10) return showError($('pwSetError'), '密碼至少需要 10 個字元。');
  if (pw !== pw2) return showError($('pwSetError'), '兩次輸入的密碼不一致。');
  const { data } = await api('/api/teacher/setup', { method: 'POST', body: JSON.stringify({ password: pw, passwordConfirm: pw2 }) });
  if (!data.ok) return showError($('pwSetError'), data.message);
  // 顯示一次性帳號恢復代碼
  $('rcCode').textContent = data.recoveryCode;
  hideOk($('rcCopyMsg'));
  $('rcMask').classList.remove('hidden');
  refresh();
});
$('rcClose').addEventListener('click', () => $('rcMask').classList.add('hidden'));
$('rcCopyBtn').addEventListener('click', async () => {
  const ok = await copyText($('rcCode').textContent);
  $('rcCopyMsg').textContent = ok ? '已複製到剪貼簿，請保存好！' : '請手動選取並複製。';
  $('rcCopyMsg').classList.remove('hidden');
});

$('pwLoginBtn').addEventListener('click', async () => {
  showError($('pwLoginError'), '');
  const pw = $('pwLogin').value;
  if (!pw) return showError($('pwLoginError'), '請輸入教師密碼。');
  const { data } = await api('/api/teacher/login', { method: 'POST', body: JSON.stringify({ password: pw }) });
  if (!data.ok) return showError($('pwLoginError'), data.message);
  $('pwLogin').value = '';
  toast('登入成功！');
  refresh();
});
$('pwLogin').addEventListener('keydown', e => { if (e.key === 'Enter') $('pwLoginBtn').click(); });

// 忘記密碼（直接設定新密碼，不需要恢復代碼）
$('forgotBtn').addEventListener('click', () => {
  $('fgNew').value = ''; $('fgNew2').value = '';
  showError($('fgError'), '');
  $('forgotMask').classList.remove('hidden');
});
$('forgotClose').addEventListener('click', () => $('forgotMask').classList.add('hidden'));
$('fgBtn').addEventListener('click', async () => {
  showError($('fgError'), '');
  const n = $('fgNew').value, n2 = $('fgNew2').value;
  if (n.length < 10) return showError($('fgError'), '新密碼至少需要 10 個字元。');
  if (n !== n2) return showError($('fgError'), '兩次輸入的新密碼不一致。');
  const { data } = await api('/api/teacher/recover', {
    method: 'POST', body: JSON.stringify({ newPassword: n, newPasswordConfirm: n2 })
  });
  if (!data.ok) return showError($('fgError'), data.message);
  $('forgotMask').classList.add('hidden');
  toast(data.message);
  refresh();
});

// 教師設定頁
function renderSettings() {
  const st = state;
  $('settingsInfo').innerHTML = `
    <div class="info-row"><span>年級 / 班級</span><b>${st.grade ?? '-'} 年 ${st.klass ?? '-'} 班</b></div>
    <div class="info-row"><span>班級代碼</span><b>${st.classCode || '-'}</b></div>
    <div class="info-row"><span>學生人數</span><b>${st.studentCount || 0} 人</b></div>
    <div class="info-row"><span>密碼修改次數</span><b>${st.passwordChanges} / ${st.maxPasswordChanges} 次</b></div>`;
  showError($('rcError'), ''); hideOk($('rcOk'));
}
$('rcBtn').addEventListener('click', async () => {
  showError($('rcError'), ''); hideOk($('rcOk'));
  const pw = $('rcPassword').value;
  if (!pw) return showError($('rcError'), '請先輸入目前密碼。');
  const { data } = await api('/api/teacher/recovery-code', { method: 'POST', body: JSON.stringify({ password: pw }) });
  if (!data.ok) return showError($('rcError'), data.message);
  $('rcPassword').value = '';
  $('rcCode').textContent = data.recoveryCode;
  $('rcCopyMsg').textContent = '';
  $('rcMask').classList.remove('hidden');
  showError($('rcOk'), data.message);
  $('rcOk').classList.remove('hidden');
});
$('goPwChangeBtn').addEventListener('click', () => go('t-password'));

let pwFlash = '';

function renderPasswordPage() {
  const st = state;
  const left = Math.max(0, st.maxPasswordChanges - st.passwordChanges);
  $('pwChangeInfo').innerHTML = `
    <div class="info-row"><span>密碼修改次數</span><b>${st.passwordChanges} / ${st.maxPasswordChanges} 次</b></div>
    <div class="info-row"><span>還可以修改</span><b>${left} 次</b></div>`;
  showError($('pwChangeError'), '');
  if (pwFlash) {
    $('pwChangeOk').textContent = pwFlash;
    $('pwChangeOk').classList.remove('hidden');
    pwFlash = '';
  } else {
    hideOk($('pwChangeOk'));
  }
  const reached = left <= 0;
  ['pwCur', 'pwNew', 'pwNew2'].forEach(id => { $(id).disabled = reached; });
  $('pwChangeBtn').disabled = reached;
  if (reached) showError($('pwChangeError'), `密碼已達修改上限（${st.maxPasswordChanges} 次），請聯繫管理者重設。`);
}
$('pwChangeBtn').addEventListener('click', async () => {
  showError($('pwChangeError'), ''); hideOk($('pwChangeOk'));
  const cur = $('pwCur').value, n = $('pwNew').value, n2 = $('pwNew2').value;
  if (!cur) return showError($('pwChangeError'), '請輸入目前密碼。');
  if (n.length < 10) return showError($('pwChangeError'), '新密碼至少需要 10 個字元。');
  if (n !== n2) return showError($('pwChangeError'), '兩次輸入的新密碼不一致。');
  const { data } = await api('/api/teacher/password', {
    method: 'POST', body: JSON.stringify({ current: cur, next: n, nextConfirm: n2 })
  });
  if (!data.ok) return showError($('pwChangeError'), data.message);
  $('pwCur').value = ''; $('pwNew').value = ''; $('pwNew2').value = '';
  pwFlash = data.message;
  refresh();
});

/* ---------------- 三、教師建立班級（第一版流程） ---------------- */
$('createClassBtn').addEventListener('click', async () => {
  const classCode = $('inputClassCode').value.trim();
  const studentCount = $('inputStudentCount').value.trim();
  showError($('teacherSetupError'), '');
  if (!classCode) return showError($('teacherSetupError'), '請輸入班級代碼，例如 OC503。');
  if (!studentCount) return showError($('teacherSetupError'), '請輸入學生人數，例如 28。');
  const { data } = await api('/api/class/create', { method: 'POST', body: JSON.stringify({ classCode, studentCount }) });
  if (!data.ok) return showError($('teacherSetupError'), data.message);
  toast('班級建立完成！');
  refresh();
});

/* ---------------- 四、教師班級管理（第一版） + 人物視窗 ---------------- */
async function renderDashboard() {
  await ensureCatalog();
  const { data } = await api('/api/class');
  if (!data.ok) return toast(data.message);
  $('tGradeBadge').textContent = data.grade + ' 年級';
  $('tKlassBadge').textContent = data.klass + ' 班';
  $('tCodeBadge').textContent = '班級代碼 ' + data.classCode;
  $('tCountBadge').textContent = '共 ' + data.studentCount + ' 人';

  const grid = $('studentGrid');
  grid.innerHTML = '';
  data.students.forEach(s => {
    const cell = document.createElement('div');
    cell.className = 'student-cell';
    cell.innerHTML = avatarSVG(s.no, s.equipped) + `<div class="seat">${s.no} 號</div>`;
    cell.addEventListener('click', () => openStudentModal(s.no));
    grid.appendChild(cell);
  });
}

async function openStudentModal(no) {
  await ensureCatalog();
  const { data } = await api('/api/student/' + no);
  if (!data.ok) return toast(data.message);
  const s = data.student;
  currentStudent = s;
  $('modalAvatar').innerHTML = avatarSVG(s.no, s.equipped);
  $('modalTitle').textContent = s.no + ' 號同學';
  $('modalNo').textContent = s.no + ' 號';
  $('modalCode').textContent = s.loginCode;
  $('modalLevel').textContent = `Lv.${s.level}　${s.exp} / ${s.expNeeded}`;
  $('modalMoney').textContent = `🪙 ${s.coins}　💎 ${s.diamonds}`;
  $('modalStats').innerHTML = STAT_KEYS
    .map(k => `${STAT_ICONS[k]} ${STAT_NAMES[k]} ${s.stats.total[k]}`)
    .join('　');
  $('modalWorn').textContent = wornNames(s.equipped);
  hideOk($('modalMsg'));
  $('modalMask').classList.remove('hidden');
}
$('modalClose').addEventListener('click', () => $('modalMask').classList.add('hidden'));
$('modalMask').addEventListener('click', e => { if (e.target === $('modalMask')) $('modalMask').classList.add('hidden'); });
$('modalCopyBtn').addEventListener('click', async () => {
  if (!currentStudent) return;
  const ok = await copyText(currentStudent.loginCode);
  showError($('modalMsg'), ok ? '已複製 ' + currentStudent.loginCode + ' 到剪貼簿！' : '請手動選取號碼複製。');
  $('modalMsg').classList.remove('hidden');
});

$('showAllBtn').addEventListener('click', async () => {
  const { data } = await api('/api/class');
  if (!data.ok) return toast(data.message);
  const list = $('allList');
  list.innerHTML = '';
  data.students.forEach(s => {
    const row = document.createElement('div');
    row.className = 'all-row';
    row.innerHTML = `<span>${s.no} 號</span><b>${s.loginCode}</b>`;
    row.addEventListener('click', async () => { toast(await copyText(s.loginCode) ? `已複製 ${s.no} 號的號碼` : '請手動複製'); });
    list.appendChild(row);
  });
  hideOk($('allMsg'));
  $('allMask').classList.remove('hidden');
});
$('allClose').addEventListener('click', () => $('allMask').classList.add('hidden'));
$('allMask').addEventListener('click', e => { if (e.target === $('allMask')) $('allMask').classList.add('hidden'); });
$('allCopyBtn').addEventListener('click', async () => {
  const { data } = await api('/api/class');
  if (!data.ok) return toast(data.message);
  const ok = await copyText(data.students.map(s => `${s.no} 號：${s.loginCode}`).join('\n'));
  showError($('allMsg'), ok ? '已複製全班號碼！' : '請手動複製。');
  $('allMsg').classList.remove('hidden');
});

$('goAssignAllBtn').addEventListener('click', () => go('t-assign-all'));

/* ---------------- 五、個別作業派發 ---------------- */
let aiSelected = new Set();

function fillClassSelect(sel) {
  sel.innerHTML = '';
  if (!state || !state.classCode) return;
  const opt = document.createElement('option');
  opt.value = state.classCode;
  opt.textContent = `${state.grade} 年 ${state.klass} 班（${state.classCode}）`;
  sel.appendChild(opt);
}

async function renderAssignIndividual() {
  await ensureCatalog();
  fillClassSelect($('aiClass'));
  const { data } = await api('/api/class');
  if (!data.ok) return toast(data.message);
  aiSelected = new Set();
  const box = $('aiStudents');
  box.innerHTML = '';
  data.students.forEach(s => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'pick-item';
    item.innerHTML = avatarSVG(s.no, s.equipped) + `<span class="no">${s.no} 號</span>`;
    item.addEventListener('click', () => {
      if (aiSelected.has(s.no)) aiSelected.delete(s.no); else aiSelected.add(s.no);
      item.classList.toggle('checked', aiSelected.has(s.no));
      updateAiCount();
    });
    box.appendChild(item);
  });
  updateAiCount();
  resetAbilityEditor('aiAbilities');
  showError($('aiError')); hideOk($('aiOk'));
}
function updateAiCount() {
  $('aiSelectedCount').textContent = aiSelected.size + ' 位';
}
$('aiAll').addEventListener('click', () => {
  document.querySelectorAll('#aiStudents .pick-item').forEach((el, i) => { aiSelected.add(i + 1); el.classList.add('checked'); });
  updateAiCount();
});
$('aiNone').addEventListener('click', () => {
  aiSelected.clear();
  document.querySelectorAll('#aiStudents .pick-item').forEach(el => el.classList.remove('checked'));
  updateAiCount();
});

/* ---------------- 教師：作業能力增益編輯器 ---------------- */
function addAbilityRow(containerId) {
  const box = $(containerId);
  if (!box || box.children.length >= 5) return;
  const row = document.createElement('div');
  row.className = 'ability-row';
  row.innerHTML = `
    <select class="ability-pick">
      ${STAT_KEYS.map(k => `<option value="${k}">${STAT_ICONS[k]} ${STAT_NAMES[k]}</option>`).join('')}
    </select>
    <input class="ability-value" type="number" inputmode="numeric" min="1" max="999" value="1" aria-label="增加數值">
    <button class="btn btn-mini btn-ghost ability-remove" type="button">移除</button>`;
  row.querySelector('.ability-remove').addEventListener('click', () => row.remove());
  box.appendChild(row);
}
function resetAbilityEditor(containerId) {
  const box = $(containerId);
  if (box) box.innerHTML = '';
}
function readAbilityEditor(containerId) {
  const box = $(containerId);
  const rewards = {};
  let error = null;
  if (!box) return { rewards, error };
  [...box.querySelectorAll('.ability-row')].forEach(row => {
    if (error) return;
    const key = row.querySelector('.ability-pick').value;
    const raw = row.querySelector('.ability-value').value.trim();
    if (raw === '') { error = `請輸入「${STAT_NAMES[key]}」要增加多少。`; return; }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > 999) {
      error = `${STAT_NAMES[key]}增益請輸入 1 到 999 的整數。`;
      return;
    }
    rewards[key] = (rewards[key] || 0) + n;
    if (rewards[key] > 999) error = `${STAT_NAMES[key]}的總增益不可超過 999。`;
  });
  return { rewards, error };
}
function abilityTags(a) {
  const rewards = (a && a.abilityRewards) || {};
  return STAT_KEYS
    .filter(k => rewards[k] > 0)
    .map(k => `<span class="tag stat">${STAT_ICONS[k]} ${STAT_NAMES[k]} +${rewards[k]}</span>`)
    .join('');
}
$('aiAddAbility').addEventListener('click', () => addAbilityRow('aiAbilities'));
$('aaAddAbility').addEventListener('click', () => addAbilityRow('aaAbilities'));

async function submitAssignment(scope) {
  const isInd = scope === 'individual';
  const title = $(isInd ? 'aiTitle' : 'aaTitle').value.trim();
  const content = $(isInd ? 'aiContent' : 'aaContent').value.trim();
  const dueDate = $(isInd ? 'aiDue' : 'aaDue').value;
  const exp = $(isInd ? 'aiExp' : 'aaExp').value.trim();
  const coins = $(isInd ? 'aiCoins' : 'aaCoins').value.trim();
  const errEl = $(isInd ? 'aiError' : 'aaError');
  const okEl = $(isInd ? 'aiOk' : 'aaOk');
  showError(errEl, ''); hideOk(okEl);

  if (isInd && aiSelected.size === 0) return showError(errEl, '請至少選擇一位學生。');
  if (!title) return showError(errEl, '請輸入作業名稱。');
  if (!content) return showError(errEl, '請輸入作業內容。');
  if (exp === '' || coins === '') return showError(errEl, '請輸入經驗值與 OC 金幣獎勵（沒有就填 0）。');

  const ability = readAbilityEditor(isInd ? 'aiAbilities' : 'aaAbilities');
  if (ability.error) return showError(errEl, ability.error);

  const body = {
    scope, title, content, dueDate: dueDate || null,
    exp: Number(exp), coins: Number(coins),
    abilityRewards: ability.rewards
  };
  if (isInd) body.targetNos = [...aiSelected];

  const { data } = await api('/api/assignments', { method: 'POST', body: JSON.stringify(body) });
  if (!data.ok) return showError(errEl, data.message);
  showError(okEl, `已派發給 ${data.assignment.targetCount} 位學生！`);
  okEl.classList.remove('hidden');
  if (isInd) {
    $('aiTitle').value = ''; $('aiContent').value = ''; $('aiDue').value = '';
    $('aiExp').value = ''; $('aiCoins').value = '';
    resetAbilityEditor('aiAbilities');
    aiSelected.clear();
    document.querySelectorAll('#aiStudents .pick-item').forEach(el => el.classList.remove('checked'));
    updateAiCount();
  } else {
    $('aaTitle').value = ''; $('aaContent').value = ''; $('aaDue').value = '';
    $('aaExp').value = ''; $('aaCoins').value = '';
    resetAbilityEditor('aaAbilities');
  }
  toast('作業已派發');
}
$('aiSubmit').addEventListener('click', () => submitAssignment('individual'));
$('aaSubmit').addEventListener('click', () => submitAssignment('all'));

function renderAssignAll() {
  fillClassSelect($('aaClass'));
  resetAbilityEditor('aaAbilities');
  showError($('aaError')); hideOk($('aaOk'));
}

/* ---------------- 六、作業紀錄（教師） ---------------- */
async function renderRecords() {
  const { data } = await api('/api/assignments');
  if (!data.ok) return toast(data.message);
  const box = $('recordsList');
  box.innerHTML = '';
  if (data.assignments.length === 0) {
    box.innerHTML = '<div class="empty">還沒有派發過作業，先去「全班作業派發」或「個別作業派發」試試吧！</div>';
    return;
  }
  data.assignments.forEach(a => {
    const total = a.targetNos.length;
    const done = a.targetNos.filter(no => a.records[String(no)] && a.records[String(no)].completed).length;
    const card = document.createElement('div');
    card.className = 'record-card';
    const due = a.dueDate ? `<span class="tag due">截止 ${a.dueDate}</span>` : '<span class="tag">無截止日期</span>';
    const people = a.targetNos.map(no => {
      const rec = a.records[String(no)];
      return `<span class="person ${rec && rec.completed ? 'ok' : ''}">${no} 號 ${rec && rec.completed ? '✓ 完成' : '未完成'}</span>`;
    }).join('');
    card.innerHTML = `
      <div class="record-head">
        <div class="record-title">${a.scope === 'all' ? '📚' : '📌'} ${escapeHtml(a.title)}</div>
        <div class="record-progress">${done} / ${total} 位完成</div>
      </div>
      <div class="assign-meta">
        <span class="tag exp">+${a.exp} 經驗值</span>
        <span class="tag coin">+${a.coins} OC 金幣</span>
        ${abilityTags(a)}
        ${due}
        <span class="tag">${a.scope === 'all' ? '全班作業' : '個別作業'}</span>
      </div>
      <div class="record-bar"><div style="width:${total ? Math.round(done / total * 100) : 0}%"></div></div>
      <div class="record-people">${people}</div>`;
    box.appendChild(card);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------------- 學生：登入（第一版） ---------------- */
$('studentLoginBtn').addEventListener('click', async () => {
  const classCode = $('loginClassCode').value.trim();
  const loginCode = $('loginCode').value.trim();
  showError($('loginError'), '');
  if (!classCode) return showError($('loginError'), '請輸入班級代碼。');
  if (!loginCode) return showError($('loginError'), '請輸入五位數登入號碼。');
  const { data } = await api('/api/student/login', { method: 'POST', body: JSON.stringify({ classCode, loginCode }) });
  if (!data.ok) return showError($('loginError'), data.message);
  toast('登入成功！');
  refresh();
});
$('loginClassCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('loginCode').focus(); });
$('loginCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('studentLoginBtn').click(); });

/* ---------------- 七、學生首頁：個人資料 + 全班作業 ---------------- */
async function renderStudentHome() {
  await ensureCatalog();
  const [meRes, asRes] = await Promise.all([api('/api/student/me'), api('/api/student/assignments')]);
  if (!meRes.data.ok) return;
  const st = meRes.data.student;
  $('sAvatar').innerHTML = avatarSVG(st.no, st.equipped);
  $('sName').textContent = `${meRes.data.grade} 年 ${meRes.data.klass} 班 · ${st.no} 號`;
  $('sLevel').textContent = 'Lv.' + st.level;
  $('sExp').textContent = st.exp;
  $('sExpLabel').textContent = `經驗值 / ${st.expNeeded}`;
  $('sExpFill').style.width = Math.min(100, Math.round(st.exp / st.expNeeded * 100)) + '%';
  $('sCoins').textContent = st.coins;
  $('sDiamonds').textContent = st.diamonds;
  $('sClassInfo').textContent = `${meRes.data.grade} 年 ${meRes.data.klass} 班（${meRes.data.classCode}）`;
  $('sSeat').textContent = st.no + ' 號';
  $('sCode').textContent = st.loginCode;
  renderStats($('sStats'), st.stats);
  hideOk($('studentMsg'));

  if (asRes.data.ok) {
    const list = asRes.data.assignments;
    renderAssignments($('homeAssignAll'), list.filter(a => a.scope === 'all'), '目前沒有全班作業');
    renderAssignments($('homeAssignMine'), list.filter(a => a.scope !== 'all'), '目前沒有指派給你的作業');
  }
}

function renderAssignments(container, list, emptyText) {
  container.innerHTML = '';
  if (list.length === 0) {
    container.innerHTML = `<div class="empty">${emptyText}</div>`;
    return;
  }
  list.forEach(a => {
    const item = document.createElement('div');
    item.className = 'assign-item' + (a.scope !== 'all' ? ' mine' : '') + (a.completed ? ' done' : '');
    const overdue = a.dueDate && !a.completed && a.dueDate < todayStr();
    const dueTag = a.dueDate
      ? `<span class="tag ${overdue ? 'overdue' : 'due'}">截止 ${a.dueDate}${overdue ? '（已超過）' : ''}</span>`
      : '<span class="tag">無截止日期</span>';
    item.innerHTML = `
      <div class="assign-top">
        <div class="assign-title">${escapeHtml(a.title)}</div>
        <span class="assign-scope ${a.scope !== 'all' ? 'mine' : ''}">${a.scope === 'all' ? '全班作業' : '📌 指派給我'}</span>
      </div>
      <div class="assign-content">${escapeHtml(a.content)}</div>
      <div class="assign-meta">
        <span class="tag exp">+${a.exp} 經驗值</span>
        <span class="tag coin">+${a.coins} OC 金幣</span>
        ${abilityTags(a)}
        ${dueTag}
      </div>
      <div class="assign-foot">
        <span class="status ${a.completed ? 'ok' : 'todo'}">${a.completed ? '✅ 已完成' : '⏳ 尚未完成'}</span>
        ${a.completed ? '' : '<button class="btn btn-mini btn-primary" type="button">完成作業</button>'}
      </div>`;
    const btn = item.querySelector('button');
    if (btn) btn.addEventListener('click', async () => {
      btn.disabled = true;
      const { data } = await api(`/api/assignments/${a.id}/complete`, { method: 'POST', body: JSON.stringify({}) });
      if (!data.ok) { btn.disabled = false; return toast(data.message); }
      toast(data.message);
      refresh();
    });
    container.appendChild(item);
  });
}

async function renderStudentAssignments() {
  const res = await api('/api/student/assignments');
  if (!res.data.ok) return;
  const list = res.data.assignments;
  renderAssignments($('pageAssignAll'), list.filter(a => a.scope === 'all'), '目前沒有全班作業');
  renderAssignments($('pageAssignMine'), list.filter(a => a.scope !== 'all'), '目前沒有指派給你的作業');
}

$('copyMyCodeBtn').addEventListener('click', async () => {
  const { data } = await api('/api/student/me');
  if (!data.ok) return toast(data.message);
  const ok = await copyText(data.student.loginCode);
  showError($('studentMsg'), ok ? '已複製你的登入號碼！' : '請手動複製號碼。');
  $('studentMsg').classList.remove('hidden');
});

/* ---------------- 九、鑽石兌換商店 ---------------- */
async function renderShop() {
  const [meRes, logRes] = await Promise.all([api('/api/student/me'), api('/api/shop/logs')]);
  if (meRes.data.ok) {
    $('shopCoins').textContent = meRes.data.student.coins;
    $('shopDiamonds').textContent = meRes.data.student.diamonds;
  }
  const box = $('shopLogs');
  box.innerHTML = '';
  if (logRes.data.ok) {
    if (logRes.data.logs.length === 0) {
      box.innerHTML = '<div class="empty">還沒有兌換紀錄</div>';
    } else {
      logRes.data.logs.forEach(l => {
        const row = document.createElement('div');
        row.className = 'log-row';
        row.innerHTML = `<span>${fmtDate(l.at)}</span><b>-${l.coinsSpent} 金幣 → +${l.diamondsGained} 鑽石</b>`;
        box.appendChild(row);
      });
    }
  }
  hideOk($('shopMsg')); showError($('shopError'));
}

$('exchangeBtn').addEventListener('click', async () => {
  hideOk($('shopMsg')); showError($('shopError'));
  const btn = $('exchangeBtn');
  btn.disabled = true;
  // 每次點擊都產生新的交易編號，伺服器用它避免重複扣款
  const requestId = (window.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : Date.now() + '-' + Math.random().toString(16).slice(2);
  const { data } = await api('/api/shop/exchange', { method: 'POST', body: JSON.stringify({ requestId }) });
  btn.disabled = false;
  if (!data.ok) return showError($('shopError'), data.message);
  await refresh();
  showError($('shopMsg'), data.message);
  $('shopMsg').classList.remove('hidden');
});

/* ---------------- 十、鑽石商店：購買服飾 ---------------- */
let shopStudent = null;
let previewItem = null;

function itemThumb(no, item, equipped) {
  const worn = equipped || { [item.slot]: item.id };
  return avatarSVG(no, worn);
}

async function renderStore() {
  await ensureCatalog();
  const { data } = await api('/api/student/me');
  if (!data.ok) return toast(data.message);
  shopStudent = data.student;
  $('storeDiamonds').textContent = shopStudent.diamonds;
  renderStoreGrid();
  hideOk($('storeMsg'));
  showError($('storeError'), '');
}

function renderStoreGrid() {
  const grid = $('storeGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const collection = (shopStudent && shopStudent.collection) || {};
  CATALOG_ITEMS.forEach(item => {
    const owned = collection[item.id] || 0;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `store-card rarity-border-${item.rarity}`;
    card.innerHTML = `
      <div class="store-thumb">${itemThumb(shopStudent ? shopStudent.no : 1, item)}</div>
      <div class="store-name">${escapeHtml(item.name)}</div>
      <div class="store-meta">${rarityBadge(item.rarity)}<span class="tag">${SLOT_NAMES[item.slot]}</span></div>
      <div class="store-stats">${buffTags(item.stats)}</div>
      <div class="store-price">💎 ${item.price}${owned ? `<small>已擁有 ${owned} 件</small>` : ''}</div>
      <span class="store-preview-btn">${owned ? '再買一件' : '預覽／購買'}</span>`;
    card.addEventListener('click', () => openItemPreview(item));
    grid.appendChild(card);
  });
}

function openItemPreview(item) {
  previewItem = item;
  const no = shopStudent ? shopStudent.no : 1;
  const equipped = Object.assign({}, (shopStudent && shopStudent.equipped) || {}, { [item.slot]: item.id });
  $('itemAvatar').innerHTML = avatarSVG(no, equipped);
  $('itemName').textContent = item.name;
  $('itemRarity').innerHTML = rarityBadge(item.rarity);
  $('itemPrice').textContent = `💎 ${item.price} OC 鑽石`;
  $('itemSlot').textContent = SLOT_NAMES[item.slot];
  $('itemStats').innerHTML = buffTags(item.stats);
  const owned = ((shopStudent && shopStudent.collection) || {})[item.id] || 0;
  $('itemOwned').textContent = owned ? `${owned} 件` : '尚未擁有';
  $('itemBuyBtn').textContent = `${owned ? '再買一件' : '購買'}（💎 ${item.price}）`;
  $('itemBuyBtn').disabled = false;
  showError($('itemError'), ''); hideOk($('itemMsg'));
  $('itemMask').classList.remove('hidden');
}

$('itemClose').addEventListener('click', () => $('itemMask').classList.add('hidden'));
$('itemMask').addEventListener('click', e => { if (e.target === $('itemMask')) $('itemMask').classList.add('hidden'); });
$('itemBuyBtn').addEventListener('click', async () => {
  if (!previewItem) return;
  const btn = $('itemBuyBtn');
  btn.disabled = true;
  showError($('itemError'), ''); hideOk($('itemMsg'));
  const { data } = await api('/api/shop/buy', {
    method: 'POST',
    body: JSON.stringify({ itemId: previewItem.id, requestId: uid() })
  });
  btn.disabled = false;
  if (!data.ok) return showError($('itemError'), data.message);
  shopStudent = data.student;
  $('storeDiamonds').textContent = shopStudent.diamonds;
  renderStoreGrid();
  const owned = (shopStudent.collection || {})[previewItem.id] || 0;
  $('itemOwned').textContent = `${owned} 件`;
  $('itemBuyBtn').textContent = `再買一件（💎 ${previewItem.price}）`;
  $('itemMsg').textContent = data.message;
  $('itemMsg').classList.remove('hidden');
});

/* ---------------- 十一、我的服飾：穿戴／脫下 ---------------- */
let wardrobeStudent = null;

async function renderWardrobe() {
  await ensureCatalog();
  const { data } = await api('/api/student/me');
  if (!data.ok) return toast(data.message);
  wardrobeStudent = data.student;
  renderWardrobeBody();
  hideOk($('wardrobeMsg'));
  showError($('wardrobeError'), '');
}

function renderWardrobeBody() {
  const st = wardrobeStudent;
  if (!st) return;
  $('wardrobeAvatar').innerHTML = avatarSVG(st.no, st.equipped);
  const worn = EQUIP_SLOTS.filter(slot => itemById(st.equipped[slot]));
  $('wardrobeCount').textContent = `${worn.length} 件`;
  $('wardrobeWorn').innerHTML = worn.length
    ? worn.map(slot => {
        const it = itemById(st.equipped[slot]);
        return `<span class="tag">${SLOT_NAMES[slot]}：${escapeHtml(it.name)}</span>`;
      }).join('')
    : '<span class="tag">尚未穿戴</span>';
  $('wardrobeBonus').innerHTML = buffTags(st.stats && st.stats.bonus);

  const box = $('wardrobeSlots');
  box.innerHTML = '';
  EQUIP_SLOTS.forEach(slot => {
    const owned = CATALOG_ITEMS.filter(i => i.slot === slot && (st.collection[i.id] || 0) > 0);
    const block = document.createElement('div');
    block.className = 'slot-block';
    const current = itemById(st.equipped[slot]);
    block.innerHTML = `<div class="slot-head"><b>${SLOT_NAMES[slot]}</b><span>${current ? '目前：' + escapeHtml(current.name) : '尚未穿戴'}</span></div>`;
    const items = document.createElement('div');
    items.className = 'slot-items';
    if (owned.length === 0) {
      items.innerHTML = '<div class="slot-empty">還沒有這個部位的服飾，去商店逛逛吧！</div>';
    } else {
      owned.forEach(it => {
        const equipped = st.equipped[slot] === it.id;
        const cell = document.createElement('div');
        cell.className = 'slot-item' + (equipped ? ' active' : '');
        cell.innerHTML = `
          <div class="slot-thumb">${itemThumb(st.no, it, { [slot]: it.id })}</div>
          <div class="slot-name">${escapeHtml(it.name)}</div>
          <div class="slot-meta">${rarityBadge(it.rarity)}${buffTags(it.stats)}</div>
          <button class="btn btn-mini ${equipped ? 'btn-ghost' : 'btn-primary'}" type="button">${equipped ? '脫下' : '穿戴'}</button>`;
        cell.querySelector('button').addEventListener('click', ev => {
          ev.stopPropagation();
          equipItem(slot, equipped ? null : it.id, ev.currentTarget);
        });
        items.appendChild(cell);
      });
    }
    block.appendChild(items);
    box.appendChild(block);
  });
}

async function equipItem(slot, itemId, btn) {
  if (btn) btn.disabled = true;
  showError($('wardrobeError'), ''); hideOk($('wardrobeMsg'));
  const { data } = await api('/api/shop/equip', {
    method: 'POST',
    body: JSON.stringify({ slot, itemId })
  });
  if (!data.ok) {
    if (btn) btn.disabled = false;
    return showError($('wardrobeError'), data.message);
  }
  wardrobeStudent = data.student;
  renderWardrobeBody();
  $('wardrobeMsg').textContent = data.message;
  $('wardrobeMsg').classList.remove('hidden');
}

/* ---------------- 十二、寶箱抽獎 ---------------- */
let chestStudent = null;

async function renderChest() {
  await ensureCatalog();
  const [meRes, logRes] = await Promise.all([api('/api/student/me'), api('/api/chest/logs')]);
  if (!meRes.data.ok) return toast(meRes.data.message);
  chestStudent = meRes.data.student;
  $('chestDiamonds').textContent = chestStudent.diamonds;
  renderChestPool();
  const logs = (logRes.data.ok && logRes.data.logs) || [];
  $('chestTimes').textContent = logs.length;
  renderChestLogs(logs);
  hideOk($('chestMsg'));
  showError($('chestError'), '');
}

function renderChestPool() {
  const box = $('chestPool');
  if (!box) return;
  box.innerHTML = '';
  CATALOG_ITEMS.forEach(item => {
    const cell = document.createElement('div');
    cell.className = `pool-card rarity-border-${item.rarity}`;
    cell.innerHTML = `
      <div class="pool-thumb">${itemThumb(chestStudent ? chestStudent.no : 1, item)}</div>
      <div class="pool-name">${escapeHtml(item.name)}</div>
      <div class="pool-meta">${rarityBadge(item.rarity)}</div>`;
    box.appendChild(cell);
  });
}

function renderChestLogs(logs) {
  const box = $('chestLogs');
  box.innerHTML = '';
  if (!logs || logs.length === 0) {
    box.innerHTML = '<div class="empty">還沒有抽獎紀錄</div>';
    return;
  }
  logs.forEach(l => {
    const row = document.createElement('div');
    row.className = 'log-row';
    row.innerHTML = `<span>${fmtDate(l.at)}</span><b>${rarityBadge(l.rarity)} ${escapeHtml(l.name)}</b>`;
    box.appendChild(row);
  });
}

$('chestDrawBtn').addEventListener('click', async () => {
  const btn = $('chestDrawBtn');
  if (btn.disabled) return;
  btn.disabled = true;
  hideOk($('chestMsg')); showError($('chestError'), '');
  const box = $('chestBox');
  box.classList.add('opening');
  const started = Date.now();

  const { data } = await api('/api/chest/draw', {
    method: 'POST',
    body: JSON.stringify({ requestId: uid() })
  });

  // 保留一點開箱動畫時間，也避免連點
  await new Promise(resolve => setTimeout(resolve, Math.max(0, 900 - (Date.now() - started))));
  box.classList.remove('opening');
  btn.disabled = false;

  if (!data.ok) return showError($('chestError'), data.message);
  chestStudent = data.student;
  $('chestDiamonds').textContent = chestStudent.diamonds;
  const logRes = await api('/api/chest/logs');
  if (logRes.data.ok) {
    $('chestTimes').textContent = logRes.data.logs.length;
    renderChestLogs(logRes.data.logs);
  }
  showChestResult(data);
});

function showChestResult(data) {
  const item = data.item;
  if (!item) return;
  const no = chestStudent ? chestStudent.no : 1;
  $('chestResultAvatar').innerHTML = itemThumb(no, item);
  $('chestResultRarity').innerHTML = rarityBadge(item.rarity);
  $('chestResultName').textContent = item.name;
  $('chestResultMsg').textContent = data.message;
  $('chestMask').classList.remove('hidden');
}
$('chestOkBtn').addEventListener('click', () => $('chestMask').classList.add('hidden'));
$('chestClose').addEventListener('click', () => $('chestMask').classList.add('hidden'));
$('chestMask').addEventListener('click', e => { if (e.target === $('chestMask')) $('chestMask').classList.add('hidden'); });

/* ---------------- 十三、OC 房子（3D 草原、家具與第一人稱探索） ---------------- */
const HOUSE_NAME_MAX = 12;
const HOUSE_CATS = [
  ['house', '基本房屋'],
  ['furniture', '家具'],
  ['decor', '裝飾品'],
  ['other', '其他物件']
];

let houseData = null;
let houseStudent = null;
let houseCatalog = null;
let houseCtrl = null;
let houseMountedFor = null;   // 目前 3D 場景是哪位學生的房子
let houseMounting = false;
let houseMode = 'edit';
let housePanelCat = 'house';
let houseBuyResolve = null;
let houseBuyItem = null;
let cardRequestId = null;

function updateHouseHud() {
  if (!houseData) return;
  const nameEl = $('houseNamePill');
  if (nameEl) nameEl.textContent = houseData.name || '';
  const sinceEl = $('houseSince');
  if (sinceEl) sinceEl.textContent = houseData.createdAt ? fmtDate(houseData.createdAt) : '-';
  const diaEl = $('houseDiamondCount');
  if (diaEl) diaEl.textContent = houseStudent ? houseStudent.diamonds : '0';
}

async function renderHouse() {
  const [houseRes, meRes, catRes] = await Promise.all([
    api('/api/house'),
    api('/api/student/me'),
    api('/api/house/catalog')
  ]);
  if (!houseRes.data.ok) return toast(houseRes.data.message || '讀不到你的房子。');
  houseData = houseRes.data.house;
  houseStudent = meRes.data.ok ? meRes.data.student : null;
  houseCatalog = catRes.data.ok ? catRes.data : null;
  updateHouseHud();
  showError($('houseNameError'), '');

  if (houseData.isNamed) {
    showHouseRoom();
  } else {
    showHouseNaming(false);
  }
}

function showHouseRoom() {
  $('houseNaming').classList.add('hidden');
  $('houseView').classList.remove('hidden');
  updateHouseHud();
  renderHousePanel(housePanelCat);
  mountHouseScene();
}

function showHouseNaming(isRename) {
  if (document.pointerLockElement) document.exitPointerLock();
  $('houseView').classList.add('hidden');
  $('houseNaming').classList.remove('hidden');
  closeHousePanel();
  $('houseNamingTitle').textContent = isRename ? '幫房子換個名字吧！' : '先幫你的房子取個名字吧！';
  $('houseNameBtn').textContent = isRename ? '儲存新名字' : '蓋好我的房子';
  $('houseNameCancel').classList.toggle('hidden', !isRename);
  $('houseNameInput').value = isRename && houseData ? (houseData.name || '') : '';
  showError($('houseNameError'), '');
  setTimeout(() => $('houseNameInput').focus(), 80);
}

async function saveHouseName() {
  const raw = $('houseNameInput').value.trim();
  const len = Array.from(raw).length;
  showError($('houseNameError'), '');
  if (len < 1) return showError($('houseNameError'), '請先幫房子取個名字喔～');
  if (len > HOUSE_NAME_MAX) return showError($('houseNameError'), `房子名稱最多 ${HOUSE_NAME_MAX} 個字。`);

  const btn = $('houseNameBtn');
  btn.disabled = true;
  const { data } = await api('/api/house/name', {
    method: 'POST',
    body: JSON.stringify({ name: raw })
  });
  btn.disabled = false;
  if (!data.ok) return showError($('houseNameError'), data.message);

  const wasNamed = !!(houseData && houseData.isNamed);
  houseData = data.house;
  if (houseCtrl && wasNamed) houseCtrl.setName(houseData.name);
  showHouseRoom();
  toast(data.message);
}

/* ---------- 掛載 3D 場景 ---------- */
async function mountHouseScene() {
  // 直接切換帳號時，舊場景可能還掛著；擁有者不同就整個重建，避免別人的家具被儲存進來
  const ownerNo = houseStudent ? houseStudent.no : null;
  if (houseCtrl) {
    if (houseMountedFor === ownerNo) return;
    teardownHouse();
  }
  if (houseMounting) return;
  if (!houseData || !houseData.isNamed) return;
  if (!houseCatalog) {
    toast('家具目錄讀取失敗，請重新整理。');
    return;
  }
  houseMounting = true;
  const loading = $('houseLoading');
  if (loading) loading.classList.remove('hidden');

  try {
    const mod = await import('./house3d/index.js?v=10');
    houseMounting = false;
    if (current !== 's-house' || !houseData || !houseData.isNamed) {
      if (loading) loading.classList.add('hidden');
      return;
    }
    houseCtrl = mod.mountHouse3D({
      container: $('houseCanvasHost'),
      house: houseData,
      catalog: houseCatalog,
      callbacks: {
        saveLayout: async (layout) => {
          const { data } = await api('/api/house/save', {
            method: 'POST',
            body: JSON.stringify(layout)
          });
          return data;
        },
        toast,
        onStudent: (h, st) => {
          if (h) houseData = h;
          if (st) houseStudent = st;
          updateHouseHud();
        },
        onCount: (n, max) => {
          const el = $('houseEditCount');
          if (el) el.textContent = `${n} / ${max}`;
        },
        onSaveState: (s) => {
          const el = $('houseSaveState');
          if (!el) return;
          el.dataset.state = s;
          el.textContent = s === 'pending' ? '有變更…'
            : s === 'saving' ? '儲存中…'
            : s === 'saved' ? '已同步 ✓' : '儲存失敗';
        },
        onHint: (msg) => {
          const bh = $('houseBuildHint');
          if (bh && houseMode === 'edit') bh.textContent = msg;
          if (houseMode === 'explore') {
            const et = $('houseExploreTip');
            if (et) et.textContent = msg;
          }
        },
        onSelection: (sel) => {
          const bar = $('houseSelectionBar');
          if (!bar) return;
          bar.classList.toggle('hidden', !sel || houseMode !== 'edit');
        },
        onEditingChange: () => {},
        onModeChange: (m) => {
          houseMode = m;
          applyHouseMode();
        },
        onModelChange: () => renderHousePanel('house')
      }
    });
    houseMountedFor = ownerNo;
    if (loading) loading.classList.add('hidden');
    applyHouseMode();
    renderHousePanel(housePanelCat);
  } catch (e) {
    houseMounting = false;
    if (loading) loading.classList.add('hidden');
    console.error(e);
    toast('3D 場景載入失敗，請重新整理再試一次。');
  }
}

function teardownHouse() {
  closeHousePanel();
  if (houseCtrl) {
    try { houseCtrl.dispose(); } catch (e) { console.error(e); }
    houseCtrl = null;
  }
  houseMountedFor = null;
  houseMounting = false;
  const host = $('houseCanvasHost');
  if (host) host.innerHTML = '';
  const loading = $('houseLoading');
  if (loading) loading.classList.remove('hidden');
}

function applyHouseMode() {
  const edit = houseMode === 'edit';
  $('houseEditBar').classList.toggle('hidden', !edit);
  $('houseExploreBar').classList.toggle('hidden', edit);
  $('housePanelToggle').classList.toggle('hidden', !edit);
  if (!edit) {
    closeHousePanel();
    $('houseSelectionBar').classList.add('hidden');
  }
  const tip = $('houseExploreTip');
  if (tip && !edit) tip.textContent = '點一下畫面開始探索';
}

/* ---------- 建造面板 ---------- */
function openHousePanel() {
  if (houseMode !== 'edit' || !houseCtrl) return;
  $('houseBuildPanel').classList.remove('hidden');
  $('housePanelToggle').textContent = '‹';
  $('housePanelToggle').setAttribute('aria-expanded', 'true');
  renderHousePanel(housePanelCat);
}

function closeHousePanel() {
  $('houseBuildPanel').classList.add('hidden');
  $('housePanelToggle').textContent = '›';
  $('housePanelToggle').setAttribute('aria-expanded', 'false');
}

function toggleHousePanel() {
  if ($('houseBuildPanel').classList.contains('hidden')) openHousePanel();
  else closeHousePanel();
}

function renderHousePanel(cat) {
  if (!houseCatalog) return;
  if (!HOUSE_CATS.some(c => c[0] === cat)) cat = 'house';
  housePanelCat = cat;

  const tabs = $('houseBuildTabs');
  tabs.innerHTML = '';
  HOUSE_CATS.forEach(([key, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hbp-tab' + (key === cat ? ' active' : '');
    b.dataset.cat = key;
    b.textContent = label;
    b.addEventListener('click', () => renderHousePanel(key));
    tabs.appendChild(b);
  });

  const grid = $('houseBuildGrid');
  grid.innerHTML = '';
  const items = (houseCatalog.items || []).filter(i => i.category === cat);
  items.forEach(item => {
    const unlocked = !!(houseData && Array.isArray(houseData.unlocked) && houseData.unlocked.includes(item.id));
    const current = cat === 'house' && houseData && houseData.model === item.id;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'hbp-card' + (unlocked ? '' : ' locked') + (current ? ' current' : '');
    b.dataset.itemId = item.id;
    const price = item.price > 0 ? `<span class="hbp-price">💎 ${item.price}</span>` : '<span class="hbp-free">免費</span>';
    const meta = (houseCatalog.items || []).find(it => it.id === item.id) || item;
    const thumb = meta.thumb || '';
    b.innerHTML = `
      <div class="hbp-thumb">${thumb ? `<img src="${thumb}" alt="" loading="lazy">` : '<span class="hbp-thumb-placeholder"></span>'}</div>
      <div class="hbp-info">
        <span class="hbp-name">${item.name}</span>
        <span class="hbp-meta">${current ? '<span class="hbp-current">使用中</span>' : (unlocked ? '<span class="hbp-unlocked">已解鎖</span>' : price)}</span>
      </div>
    `;
    b.addEventListener('click', (e) => {
      // 如果有縮圖且點擊在圖片區域，開啟預覽模態框
      if (thumb && e.target.closest('.hbp-thumb')) {
        openHouseItemPreview(item);
      } else {
        chooseHouseItem(item);
      }
    });
    grid.appendChild(b);
  });

  const hint = $('houseBuildHint');
  if (hint) hint.textContent = cat === 'house'
    ? '點選房屋外觀就會立刻換上；沒解鎖的房子需要先購買。'
    : '點選物件後，在草原或屋內點一下就能放下。點擊縮圖可預覽 3D 模型。';
}

/* ---------- 3D 模型預覽模態框 ---------- */
// 開啟家具 3D 模型預覽
function openHouseItemPreview(item) {
  if (!houseCtrl || !houseCtrl.debug) return;
  const factory = houseCtrl.debug.editor.factory;
  const catalogMap = houseCtrl.debug.editor.catalogMap;
  const meta = catalogMap[item.id];
  if (!meta) return;

  if (previewModal) closeHouseItemPreview();

  previewModal = document.createElement('div');
  previewModal.className = 'preview-modal';
  previewModal.innerHTML = `
    <div class="preview-modal-content">
      <div class="preview-header">
        <h3>${meta.name}</h3>
        <button class="preview-close" aria-label="關閉">✕</button>
      </div>
      <div id="previewCanvasHost"></div>
      <div class="preview-hint">拖曳旋轉 · 滾輪縮放 · 雙擊重置</div>
    </div>
    <div class="preview-backdrop"></div>
  `;
  document.body.appendChild(previewModal);
  document.body.style.overflow = 'hidden';

  const canvasHost = previewModal.querySelector('#previewCanvasHost');
  const closeBtn = previewModal.querySelector('.preview-close');
  const backdrop = previewModal.querySelector('.preview-backdrop');

  // 使用 FurnitureFactory 建立預覽模型
  let renderer = null;
  let scene = null;
  let camera = null;
  let group = null;
  let animId = null;
  let baseDist = 0;
  let baseTarget = new THREE.Vector3();
  let center = new THREE.Vector3();

  try {
    scene = new THREE.Scene();
    scene.environment = houseCtrl.debug.scene.environment;
    scene.environmentIntensity = 0.8;

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.className = 'preview-canvas';
    renderer.domElement.tabIndex = 0;
    canvasHost.appendChild(renderer.domElement);

    camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

    // 光源
    const hemi = new THREE.HemisphereLight('#e8f7ff', '#8fc98a', 1.0);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight('#fff3d1', 2.0);
    sun.position.set(5, 8, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(256, 256);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 20;
    sun.shadow.camera.left = -4;
    sun.shadow.camera.right = 4;
    sun.shadow.camera.top = 4;
    sun.shadow.camera.bottom = -4;
    scene.add(sun);
    scene.add(sun.target);

    // 地面
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshStandardMaterial({ color: '#7ac57c', roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    group = factory.make(meta.model);
    scene.add(group);

    // 調整相機
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    center.copy(box.getCenter(new THREE.Vector3()));
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 2.2;
    baseDist = dist;
    baseTarget.copy(center);
    camera.position.set(center.x + dist * 0.6, center.y + dist * 0.4, center.z + dist * 0.6);
    camera.lookAt(center);
    sun.target.position.copy(center);

    function resetView() {
      camera.position.set(baseTarget.x + baseDist * 0.6, baseTarget.y + baseDist * 0.4, baseTarget.z + baseDist * 0.6);
      camera.lookAt(baseTarget);
    }

    // 滑鼠互動
    let dragging = false, lastX = 0, lastY = 0;
    renderer.domElement.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
      renderer.domElement.focus();
    });
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    renderer.domElement.addEventListener('dblclick', resetView);

    function onPointerMove(e) {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const radius = camera.position.distanceTo(center);
      let phi = Math.acos((camera.position.y - center.y) / radius);
      let theta = Math.atan2(camera.position.x - center.x, camera.position.z - center.z);
      theta -= dx * 0.01;
      phi = Math.max(0.15, Math.min(Math.PI - 0.15, phi + dy * 0.01));
      camera.position.set(
        center.x + radius * Math.sin(phi) * Math.sin(theta),
        center.y + radius * Math.cos(phi),
        center.z + radius * Math.sin(phi) * Math.cos(theta)
      );
      camera.lookAt(center);
    }
    function onPointerUp(e) {
      if (dragging) {
        dragging = false;
        renderer.domElement.releasePointerCapture && renderer.domElement.releasePointerCapture(e.pointerId);
      }
    }
    function onWheel(e) {
      e.preventDefault();
      const dir = new THREE.Vector3().subVectors(camera.position, center);
      const factor = e.deltaY > 0 ? 1.15 : 0.87;
      dir.multiplyScalar(factor);
      const dist = dir.length();
      const minD = baseDist * 0.3;
      const maxD = baseDist * 4;
      if (dist >= minD && dist <= maxD) {
        camera.position.copy(center).add(dir);
      }
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') closeHouseItemPreview();
      else if (e.key === 'r' || e.key === 'R') resetView();
    }
    window.addEventListener('keydown', onKeyDown);

    closeBtn.addEventListener('click', closeHouseItemPreview);
    backdrop.addEventListener('click', closeHouseItemPreview);

    function resize() {
      const w = canvasHost.clientWidth;
      const h = canvasHost.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvasHost);

    function renderLoop() {
      if (!previewModal || !previewModal.parentNode) return;
      renderer.render(scene, camera);
      animId = requestAnimationFrame(renderLoop);
    }
    renderLoop();

    // 觸發首次渲染以生成縮圖（如果還沒有）
    if (!meta.thumb) {
      setTimeout(() => {
        try {
          meta.thumb = renderer.domElement.toDataURL('image/png');
          // 更新面板上的縮圖
          const card = grid.querySelector(`[data-item-id="${item.id}"]`);
          if (card) {
            const thumbEl = card.querySelector('.hbp-thumb');
            if (thumbEl) thumbEl.innerHTML = `<img src="${meta.thumb}" alt="" loading="lazy">`;
          }
        } catch (e) { /* 忽略 */ }
      }, 100);
    }
  } catch (e) {
    console.error('Preview modal error:', e);
    closeHouseItemPreview();
    alert('預覽開啟失敗：' + e.message);
    return;
  }

  function closeHouseItemPreview() {
    if (!previewModal) return;
    cancelAnimationFrame(animId);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    if (ro) ro.disconnect();
    if (scene) {
      scene.traverse(o => {
        if (o.isMesh) {
          o.geometry.dispose();
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose()); else o.material.dispose();
        }
      });
    }
    if (renderer) renderer.dispose();
    previewModal.remove();
    document.body.style.overflow = '';
    previewModal = null;
  }
}

// 選擇家具項目（購買或放置）
async function chooseHouseItem(item) {
  if (!houseCtrl) return;
  const unlocked = houseData && Array.isArray(houseData.unlocked) && houseData.unlocked.includes(item.id);
  if (!unlocked) {
    const ok = await purchaseHouseItem(item);
    if (!ok) return;
  }
  if (item.category === 'house') {
    if (houseCtrl.setHouseModel(item.id)) {
      toast(`已換成「${item.name}」。`);
      renderHousePanel('house');
    }
    return;
  }
  houseCtrl.beginPlacement(item.id);
  const hint = $('houseBuildHint');
  if (hint) hint.textContent = `正在放置「${item.name}」：點草原放置，按 Esc 取消。`;
  // 手機螢幕較小：選好物件後先收起面板，才看得到草原
  if (window.matchMedia && window.matchMedia('(max-width: 560px)').matches) closeHousePanel();
}

/* ---------- 單一物件購買 ---------- */
function purchaseHouseItem(item) {
  return new Promise(resolve => {
    houseBuyResolve = resolve;
    houseBuyItem = item;
    $('houseBuyTitle').textContent = `解鎖「${item.name}」`;
    $('houseBuyText').innerHTML = `需要 <b>${item.price} OC 鑽石</b>。解鎖後就能在自己的房子裡自由使用。`;
    showError($('houseBuyError'), '');
    $('houseBuyConfirm').disabled = false;
    $('houseBuyMask').classList.remove('hidden');
  });
}

function closeHouseBuy(ok) {
  $('houseBuyMask').classList.add('hidden');
  const fn = houseBuyResolve;
  houseBuyResolve = null;
  houseBuyItem = null;
  if (fn) fn(!!ok);
}

$('houseBuyConfirm').addEventListener('click', async () => {
  const btn = $('houseBuyConfirm');
  btn.disabled = true;
  const item = houseBuyItem;
  if (!item) {
    btn.disabled = false;
    return showError($('houseBuyError'), '找不到這個物件，請再點一次。');
  }
  const { data } = await api('/api/house/buy-item', {
    method: 'POST',
    body: JSON.stringify({ itemId: item.id, requestId: uid() })
  });
  btn.disabled = false;
  if (!data.ok) return showError($('houseBuyError'), data.message);
  houseData = data.house;
  if (data.student) houseStudent = data.student;
  updateHouseHud();
  if (houseCtrl) houseCtrl.setUnlocked(houseData.unlocked);
  renderHousePanel(housePanelCat);
  closeHouseBuy(true);
  toast(data.message);
});
$('houseBuyCancel').addEventListener('click', () => closeHouseBuy(false));
$('houseBuyMask').addEventListener('click', e => { if (e.target === $('houseBuyMask')) closeHouseBuy(false); });

/* ---------- 家具全擁有卡 ---------- */
async function renderCard() {
  const [houseRes, meRes] = await Promise.all([api('/api/house'), api('/api/student/me')]);
  if (!houseRes.data.ok) return toast(houseRes.data.message || '讀不到你的房子。');
  houseData = houseRes.data.house;
  houseStudent = meRes.data.ok ? meRes.data.student : null;
  updateCardUI();
}

function updateCardUI() {
  if (!houseData) return;
  const card = houseData.card || { price: 500, purchased: false };
  const diamonds = houseStudent ? houseStudent.diamonds : 0;
  const price = card.price || 500;
  $('cardPrice').textContent = price;
  $('cardDiamondNote').textContent = `你目前有 ${diamonds} 顆 OC 鑽石。`;
  const badge = $('cardOwnedBadge');
  const btn = $('cardBuyBtn');
  const status = $('cardStatus');
  $('cardPrice').parentElement.classList.remove('hidden');

  badge.classList.toggle('hidden', !card.purchased);
  if (card.purchased) {
    btn.disabled = true;
    btn.textContent = '✅ 已解鎖全部家具';
    status.textContent = card.purchasedAt
      ? `已於 ${fmtDate(card.purchasedAt)} 解鎖，所有家具都能自由使用。`
      : '所有家具都能自由使用。';
    status.className = 'all-card-status ok';
    return;
  }

  if (diamonds < price) {
    btn.disabled = true;
    btn.textContent = `還需要 ${price - diamonds} 顆鑽石`;
    status.textContent = `鑽石不足，先去完成作業或兌換鑽石吧！`;
    status.className = 'all-card-status warn';
  } else {
    btn.disabled = false;
    btn.textContent = `用 ${price} 鑽石解鎖全部家具`;
    status.textContent = '';
    status.className = 'all-card-status';
  }
}

$('cardBuyBtn').addEventListener('click', () => {
  if (!houseData || !houseData.card || houseData.card.purchased) return;
  const price = houseData.card.price || 500;
  const sym = document.querySelector('#houseCardMask .modal-price');
  if (sym) sym.textContent = `${price} OC 鑽石`;
  showError($('houseCardError'), '');
  $('houseCardConfirm').disabled = false;
  cardRequestId = uid();
  $('houseCardMask').classList.remove('hidden');
});

$('houseCardCancel').addEventListener('click', () => $('houseCardMask').classList.add('hidden'));
$('houseCardMask').addEventListener('click', e => { if (e.target === $('houseCardMask')) $('houseCardMask').classList.add('hidden'); });

$('houseCardConfirm').addEventListener('click', async () => {
  const btn = $('houseCardConfirm');
  showError($('houseCardError'), '');
  btn.disabled = true;
  const { data } = await api('/api/house/all-card', {
    method: 'POST',
    body: JSON.stringify({ requestId: cardRequestId || uid() })
  });
  btn.disabled = false;
  if (!data.ok) return showError($('houseCardError'), data.message);
  houseData = data.house;
  if (data.student) houseStudent = data.student;
  $('houseCardMask').classList.add('hidden');
  updateHouseHud();
  updateCardUI();
  if (houseCtrl) {
    houseCtrl.setUnlocked(houseData.unlocked);
    renderHousePanel(housePanelCat);
  }
  toast(data.message);
});

/* ---------- 3D 畫面按鈕 ---------- */
$('housePanelToggle').addEventListener('click', toggleHousePanel);
$('housePanelClose').addEventListener('click', closeHousePanel);

$('houseFinishBtn').addEventListener('click', async () => {
  if (!houseCtrl) return;
  const btn = $('houseFinishBtn');
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = '儲存中…';
  const res = await houseCtrl.saveNow(true);
  btn.disabled = false;
  btn.textContent = old;
  if (res && res.ok) {
    houseCtrl.setMode('explore');
    toast('佈置完成！可以用第一人稱在草原上走走。');
  }
});

$('houseRedecorateBtn').addEventListener('click', () => {
  if (!houseCtrl) return;
  houseCtrl.setMode('edit');
  toast('回到裝飾模式，可以繼續佈置。');
});

$('houseViewHouseBtn').addEventListener('click', () => {
  if (!houseCtrl) return;
  // 觸發編輯器的房屋點擊回調，開啟 HouseViewer
  const editor = houseCtrl.debug.editor;
  if (editor.options.onHouseClick) editor.options.onHouseClick();
});

$('houseCardShortcut').addEventListener('click', () => {
  if (document.pointerLockElement) document.exitPointerLock();
  go('s-card');
});

$('houseNameBtn').addEventListener('click', saveHouseName);
$('houseNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') saveHouseName(); });
$('houseRenameBtn').addEventListener('click', () => showHouseNaming(true));
$('houseNameCancel').addEventListener('click', () => {
  if (houseData && houseData.isNamed) showHouseRoom();
  else showHouseNaming(false);
});

/* ---------------- 登出與重設 ---------------- */
$('logoutBtn').addEventListener('click', async () => {
  teardownHouse();
  await api('/api/logout', { method: 'POST' });
  toast('已登出');
  refresh();
});

$('resetBtn').addEventListener('click', () => {
  $('resetCode').value = '';
  showError($('resetError'), '');
  $('resetMask').classList.remove('hidden');
});
$('resetClose').addEventListener('click', () => $('resetMask').classList.add('hidden'));
$('resetMask').addEventListener('click', e => { if (e.target === $('resetMask')) $('resetMask').classList.add('hidden'); });
$('resetConfirmBtn').addEventListener('click', async () => {
  showError($('resetError'), '');
  const { data } = await api('/api/reset', { method: 'POST', body: JSON.stringify({ code: $('resetCode').value.trim() }) });
  if (!data.ok) return showError($('resetError'), data.message);
  $('resetMask').classList.add('hidden');
  current = null;
  toast('已重設，請重新設定');
  refresh();
});

/* ---------------- 啟動 ---------------- */
async function boot() {
  // 重新整理後回到身分選擇，由伺服器在載入網頁時處理（見 server.js），
  // 這裡只要讀取最新狀態即可，避免與使用者點選身分的請求互相干擾。
  await refresh();
}
boot();
