/*
 * OC class 第三版 - 伺服器
 *
 * 資料保存在伺服器端資料檔 data/db.json（伺服器資料庫），
 * 關閉網頁、更換裝置、重新整理後資料仍然存在。
 * 教師與學生的所有權限、獎勵、交易都在伺服器端驗證與計算。
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'db.json');
const RESET_CODE = process.env.RESET_CODE || 'OC-RESET-2026';

/*
 * 測試模式：重新整理網頁或登出後，回到「教師登錄 / 學生登錄」身分選擇畫面。
 * 班級、學生登入號碼、作業與資產都存在伺服器，不會因此消失。
 * 教師仍必須輸入密碼（伺服器驗證）才能進入管理畫面。
 */
const RESET_IDENTITY_ON_LOAD = process.env.KEEP_IDENTITY === '1' ? false : true;

const MAX_PASSWORD_CHANGES = 2;   // 教師密碼最多成功修改 2 次
const MIN_PASSWORD_LEN = 10;      // 密碼最少 10 個字元
const EXCHANGE_COST_COINS = 500;  // 兌換成本
const EXCHANGE_GAIN_DIAMONDS = 100; // 兌換所得（第三版：500 金幣 → 100 鑽石）
const MAX_ASSIGN_REWARD = 9999;
const MAX_HOUSE_NAME = 12;        // 房子名稱最多 12 個字

/* ---------------- 第四版：3D 房子、家具與全擁有卡 ---------------- */
const ALL_CARD_PRICE = 500;                 // 家具全擁有卡價格（OC 鑽石）
const ALL_CARD_INCLUDES_FUTURE = true;      // 未來新增家具是否包含在全擁有卡
const HOUSE_MAX_ITEMS = 80;                 // 每間房子最多擺放物件數
const HOUSE_AREA = 10;                      // 草原可建造範圍 ±10 公尺
const HOUSE_INNER = { minX: -4.0, maxX: 4.0, minZ: -3.0, maxZ: 3.0 };
const HOUSE_OUTER = { minX: -4.5, maxX: 4.5, minZ: -3.5, maxZ: 3.5 };

const HOUSE_CATEGORIES = {
  house: '基本房屋',
  furniture: '家具',
  decor: '裝飾品',
  other: '其他建造物件'
};

/*
 * 房子與家具目錄（伺服器是唯一價格與解鎖來源）
 * footprint：佔地寬度 w（X）與深度 d（Z），單位公尺
 * solid：是否會擋住玩家與其他家具（地毯、花圃等可設 false）
 * model：前端 3D 產生器使用的模型代號
 */
const HOUSE_ITEMS = [
  // 基本房屋（只選一種，不會放在草原上）
  { id: 'house_cottage', name: '奶油小屋', category: 'house', price: 0, model: 'cottage',
    footprint: { w: 7, d: 5.2 }, solid: false, minScale: 1, maxScale: 1 },
  { id: 'house_mushroom', name: '蘑菇小屋', category: 'house', price: 180, model: 'mushroom',
    footprint: { w: 7, d: 5.2 }, solid: false, minScale: 1, maxScale: 1 },
  { id: 'house_cloud', name: '雲朵小屋', category: 'house', price: 250, model: 'cloud',
    footprint: { w: 7, d: 5.2 }, solid: false, minScale: 1, maxScale: 1 },
  { id: 'house_castle', name: '星星城堡', category: 'house', price: 350, model: 'castle',
    footprint: { w: 7, d: 5.2 }, solid: false, minScale: 1, maxScale: 1 },

  // 家具
  { id: 'bed_basic', name: '小熊床', category: 'furniture', price: 0, model: 'bed',
    footprint: { w: 1.5, d: 2.1 }, solid: true, minScale: 0.8, maxScale: 1.3 },
  { id: 'table_basic', name: '木木桌', category: 'furniture', price: 0, model: 'table',
    footprint: { w: 1.1, d: 0.7 }, solid: true, minScale: 0.8, maxScale: 1.3 },
  { id: 'chair_basic', name: '圓圓椅', category: 'furniture', price: 0, model: 'chair',
    footprint: { w: 0.65, d: 0.65 }, solid: true, minScale: 0.8, maxScale: 1.3 },
  { id: 'rug_round', name: '粉紅圓地毯', category: 'furniture', price: 0, model: 'rug',
    footprint: { w: 2.3, d: 2.3 }, solid: false, minScale: 0.8, maxScale: 1.4 },
  { id: 'sofa_cloud', name: '雲朵沙發', category: 'furniture', price: 60, model: 'sofa',
    footprint: { w: 1.9, d: 0.9 }, solid: true, minScale: 0.85, maxScale: 1.25 },
  { id: 'cabinet_cream', name: '奶油小櫃', category: 'furniture', price: 50, model: 'cabinet',
    footprint: { w: 1.0, d: 0.5 }, solid: true, minScale: 0.8, maxScale: 1.3 },
  { id: 'lamp_floor', name: '星星立燈', category: 'furniture', price: 40, model: 'floor_lamp',
    footprint: { w: 0.55, d: 0.55 }, solid: true, minScale: 0.8, maxScale: 1.2 },
  { id: 'shelf_books', name: '書書架', category: 'furniture', price: 55, model: 'bookshelf',
    footprint: { w: 0.95, d: 0.45 }, solid: true, minScale: 0.8, maxScale: 1.25 },
  { id: 'desk_study', name: '讀書桌', category: 'furniture', price: 65, model: 'desk',
    footprint: { w: 1.25, d: 0.65 }, solid: true, minScale: 0.8, maxScale: 1.25 },
  { id: 'stool_gummy', name: '軟糖凳', category: 'furniture', price: 25, model: 'stool',
    footprint: { w: 0.55, d: 0.55 }, solid: true, minScale: 0.8, maxScale: 1.3 },
  { id: 'bed_canopy', name: '皇冠床', category: 'furniture', price: 120, model: 'canopy_bed',
    footprint: { w: 1.7, d: 2.2 }, solid: true, minScale: 0.85, maxScale: 1.2 },
  { id: 'chair_soft', name: '軟軟扶手椅', category: 'furniture', price: 45, model: 'armchair',
    footprint: { w: 0.85, d: 0.85 }, solid: true, minScale: 0.85, maxScale: 1.25 },

  // 家具（第五版擴充：客廳、臥室、書房、廚房、餐廳、衛浴）
  { id: 'tv_cabinet', name: '木紋電視櫃', category: 'furniture', price: 85, model: 'tv_cabinet',
    footprint: { w: 1.8, d: 0.45 }, solid: true, minScale: 0.85, maxScale: 1.2 },
  { id: 'bed_double', name: '雙人床', category: 'furniture', price: 150, model: 'bed_double',
    footprint: { w: 1.7, d: 2.15 }, solid: true, minScale: 0.85, maxScale: 1.2 },
  { id: 'bed_single', name: '單人床', category: 'furniture', price: 90, model: 'bed_single',
    footprint: { w: 1.05, d: 2.05 }, solid: true, minScale: 0.85, maxScale: 1.25 },
  { id: 'wardrobe', name: '原木衣櫃', category: 'furniture', price: 110, model: 'wardrobe',
    footprint: { w: 1.25, d: 0.6 }, solid: true, minScale: 0.85, maxScale: 1.2 },
  { id: 'computer_desk', name: '電腦桌', category: 'furniture', price: 95, model: 'computer_desk',
    footprint: { w: 1.4, d: 0.7 }, solid: true, minScale: 0.85, maxScale: 1.2 },
  { id: 'office_chair', name: '辦公椅', category: 'furniture', price: 70, model: 'office_chair',
    footprint: { w: 0.65, d: 0.65 }, solid: true, minScale: 0.85, maxScale: 1.25 },
  { id: 'fridge', name: '雙門冰箱', category: 'furniture', price: 130, model: 'fridge',
    footprint: { w: 0.78, d: 0.72 }, solid: true, minScale: 0.85, maxScale: 1.2 },
  { id: 'microwave', name: '微波爐', category: 'furniture', price: 55, model: 'microwave',
    footprint: { w: 0.58, d: 0.42 }, solid: true, minScale: 0.85, maxScale: 1.25 },
  { id: 'stove', name: '瓦斯爐', category: 'furniture', price: 90, model: 'stove',
    footprint: { w: 0.72, d: 0.62 }, solid: true, minScale: 0.85, maxScale: 1.2 },
  { id: 'dining_table', name: '六人餐桌', category: 'furniture', price: 120, model: 'dining_table',
    footprint: { w: 1.55, d: 0.95 }, solid: true, minScale: 0.85, maxScale: 1.2 },
  { id: 'dining_chair', name: '餐椅', category: 'furniture', price: 40, model: 'dining_chair',
    footprint: { w: 0.52, d: 0.55 }, solid: true, minScale: 0.85, maxScale: 1.25 },
  { id: 'kitchen_cabinet', name: '廚房櫥櫃', category: 'furniture', price: 85, model: 'kitchen_cabinet',
    footprint: { w: 1.2, d: 0.58 }, solid: true, minScale: 0.85, maxScale: 1.2 },
  { id: 'bathtub', name: '泡澡浴缸', category: 'furniture', price: 160, model: 'bathtub',
    footprint: { w: 1.7, d: 0.8 }, solid: true, minScale: 0.85, maxScale: 1.2 },
  { id: 'sink', name: '洗手台', category: 'furniture', price: 65, model: 'sink',
    footprint: { w: 0.78, d: 0.52 }, solid: true, minScale: 0.85, maxScale: 1.25 },
  { id: 'toilet', name: '馬桶', category: 'furniture', price: 60, model: 'toilet',
    footprint: { w: 0.5, d: 0.68 }, solid: true, minScale: 0.85, maxScale: 1.25 },
  { id: 'curtain', name: '落地窗簾', category: 'furniture', price: 35, model: 'curtain',
    footprint: { w: 1.4, d: 0.18 }, solid: false, minScale: 0.85, maxScale: 1.3 },
  { id: 'rug_rect', name: '長方地毯', category: 'furniture', price: 30, model: 'rug_rect',
    footprint: { w: 2.4, d: 1.6 }, solid: false, minScale: 0.8, maxScale: 1.3 },
  { id: 'wall_art', name: '油畫掛框', category: 'furniture', price: 25, model: 'wall_art',
    footprint: { w: 0.9, d: 0.22 }, solid: false, minScale: 0.85, maxScale: 1.25 },

  // 裝飾品
  { id: 'tree_round', name: '圓圓樹', category: 'decor', price: 20, model: 'tree_round',
    footprint: { w: 0.9, d: 0.9 }, solid: true, minScale: 0.8, maxScale: 1.6 },
  { id: 'tree_pine', name: '尖尖樹', category: 'decor', price: 25, model: 'tree_pine',
    footprint: { w: 0.9, d: 0.9 }, solid: true, minScale: 0.8, maxScale: 1.6 },
  { id: 'flower_patch', name: '小花圃', category: 'decor', price: 10, model: 'flowers',
    footprint: { w: 0.8, d: 0.8 }, solid: false, minScale: 0.8, maxScale: 1.5 },
  { id: 'rock_small', name: '小石頭', category: 'decor', price: 8, model: 'rock',
    footprint: { w: 0.7, d: 0.6 }, solid: false, minScale: 0.8, maxScale: 1.5 },
  { id: 'lamp_post', name: '草原路燈', category: 'decor', price: 35, model: 'lamp_post',
    footprint: { w: 0.45, d: 0.45 }, solid: true, minScale: 0.85, maxScale: 1.2 },
  { id: 'easel_moon', name: '月亮畫架', category: 'decor', price: 30, model: 'easel',
    footprint: { w: 0.7, d: 0.4 }, solid: true, minScale: 0.85, maxScale: 1.2 },
  { id: 'vase_flower', name: '小花瓶', category: 'decor', price: 15, model: 'vase',
    footprint: { w: 0.45, d: 0.45 }, solid: false, minScale: 0.8, maxScale: 1.4 },
  { id: 'fence_white', name: '白色小圍欄', category: 'decor', price: 20, model: 'fence',
    footprint: { w: 1.3, d: 0.18 }, solid: true, minScale: 0.9, maxScale: 1.4 },
  { id: 'picnic_mat', name: '野餐墊', category: 'decor', price: 18, model: 'picnic',
    footprint: { w: 1.7, d: 1.7 }, solid: false, minScale: 0.8, maxScale: 1.3 },
  { id: 'star_light', name: '星星小燈', category: 'decor', price: 22, model: 'star_light',
    footprint: { w: 0.4, d: 0.4 }, solid: false, minScale: 0.8, maxScale: 1.4 },
  { id: 'plant_large', name: '大盆栽', category: 'decor', price: 30, model: 'plant_large',
    footprint: { w: 0.75, d: 0.75 }, solid: true, minScale: 0.85, maxScale: 1.5 },
  { id: 'wall_clock', name: '木框掛鐘', category: 'decor', price: 28, model: 'wall_clock',
    footprint: { w: 0.55, d: 0.16 }, solid: false, minScale: 0.85, maxScale: 1.2 },

  // 其他建造物件
  { id: 'fountain_star', name: '星星噴水池', category: 'other', price: 150, model: 'fountain',
    footprint: { w: 2.3, d: 2.3 }, solid: true, minScale: 0.9, maxScale: 1.2 },
  { id: 'swing_pastel', name: '粉彩鞦韆', category: 'other', price: 130, model: 'swing',
    footprint: { w: 2.1, d: 1.1 }, solid: true, minScale: 0.9, maxScale: 1.2 },
  { id: 'arch_flower', name: '花拱門', category: 'other', price: 90, model: 'arch',
    footprint: { w: 1.7, d: 0.45 }, solid: true, minScale: 0.9, maxScale: 1.2 },
  { id: 'mailbox_cute', name: '小信箱', category: 'other', price: 20, model: 'mailbox',
    footprint: { w: 0.45, d: 0.45 }, solid: true, minScale: 0.8, maxScale: 1.3 },
  { id: 'campfire', name: '溫暖營火', category: 'other', price: 45, model: 'campfire',
    footprint: { w: 0.95, d: 0.95 }, solid: false, minScale: 0.85, maxScale: 1.2 },
  { id: 'bench_wood', name: '草原長椅', category: 'other', price: 40, model: 'bench',
    footprint: { w: 1.5, d: 0.55 }, solid: true, minScale: 0.85, maxScale: 1.25 },
  { id: 'partition_wall', name: '室內隔間牆', category: 'other', price: 70, model: 'partition_wall',
    footprint: { w: 1.8, d: 0.18 }, solid: true, minScale: 0.9, maxScale: 1.6 },
  { id: 'partition_door', name: '隔間門框', category: 'other', price: 80, model: 'partition_door',
    footprint: { w: 1.7, d: 0.2 }, solid: false, minScale: 0.9, maxScale: 1.4 },
  { id: 'stair_steps', name: '木樓梯', category: 'other', price: 95, model: 'stair_steps',
    footprint: { w: 1.2, d: 2.0 }, solid: true, minScale: 0.9, maxScale: 1.3 }
];

function houseItemById(id) {
  return HOUSE_ITEMS.find(i => i.id === id) || null;
}

function freeHouseItems() {
  return HOUSE_ITEMS.filter(i => i.price <= 0);
}

/* ---------------- 第三版：能力、服飾、商店、寶箱 ---------------- */
const STAT_KEYS = ['imagination', 'intelligence', 'honesty', 'effort', 'attitude'];
const STAT_NAMES = {
  imagination: '想像力',
  intelligence: '智力',
  honesty: '誠實',
  effort: '努力',
  attitude: '態度'
};

const EQUIP_SLOTS = ['hat', 'glasses', 'top', 'pants', 'shoes', 'back', 'other'];
const SLOT_NAMES = {
  hat: '帽子',
  glasses: '眼鏡',
  top: '上衣',
  pants: '褲子／裙子',
  shoes: '鞋子',
  back: '背部裝飾',
  other: '其他裝飾'
};

const RARITIES = ['junk', 'common', 'super', 'epic'];
const RARITY_NAMES = { junk: '破爛', common: '普通', super: '超級', epic: '史詩' };

const CHEST_COST_DIAMONDS = 60;
const CHEST_WEIGHTS = { junk: 55, common: 30, super: 12, epic: 3 };

/*
 * 服飾商品目錄（伺服器是唯一資料來源）
 * stats：穿戴後提供的五種能力增益
 * visual：前端繪製角色圖層所需的造型參數
 */
const SHOP_ITEMS = [
  { id: 'hat_paper', name: '紙帽子', slot: 'hat', rarity: 'junk', price: 30, stats: {},
    visual: { kind: 'paper', color: '#D9C7F5', color2: '#B9A0E8' } },
  { id: 'hat_straw', name: '小草帽', slot: 'hat', rarity: 'common', price: 120, stats: { imagination: 2 },
    visual: { kind: 'straw', color: '#F2D08A', color2: '#FF9FB4' } },
  { id: 'hat_cap', name: '藍色棒球帽', slot: 'hat', rarity: 'common', price: 140, stats: { effort: 1 },
    visual: { kind: 'cap', color: '#7FB6E8', color2: '#5C9AD0' } },
  { id: 'hat_crown', name: '星星皇冠', slot: 'hat', rarity: 'epic', price: 700, stats: { imagination: 8, honesty: 3 },
    visual: { kind: 'crown', color: '#FFD966', color2: '#FF8FAF' } },

  { id: 'glasses_round', name: '圓框眼鏡', slot: 'glasses', rarity: 'common', price: 100, stats: { intelligence: 3 },
    visual: { kind: 'round', color: '#7A5C3E' } },
  { id: 'glasses_star', name: '星星墨鏡', slot: 'glasses', rarity: 'super', price: 280, stats: { intelligence: 5, imagination: 2 },
    visual: { kind: 'star', color: '#5B4B6E', color2: '#FFE08A' } },

  { id: 'top_tee', name: '彩虹條紋上衣', slot: 'top', rarity: 'common', price: 150, stats: { imagination: 1 },
    visual: { kind: 'tee', color: '#FFB4C2', color2: '#9ED4F5' } },
  { id: 'top_hoodie', name: '小熊連帽衫', slot: 'top', rarity: 'super', price: 320, stats: { effort: 5, honesty: 2 },
    visual: { kind: 'hoodie', color: '#C9B6F0', color2: '#FFF3C4' } },
  { id: 'top_armor', name: '勇者鎧甲', slot: 'top', rarity: 'epic', price: 650, stats: { effort: 8, attitude: 4 },
    visual: { kind: 'armor', color: '#BFD8F2', color2: '#8FA9C9' } },

  { id: 'pants_jeans', name: '牛仔褲', slot: 'pants', rarity: 'junk', price: 40, stats: {},
    visual: { kind: 'jeans', color: '#7FA8D9' } },
  { id: 'pants_shorts', name: '運動短褲', slot: 'pants', rarity: 'junk', price: 50, stats: { effort: 1 },
    visual: { kind: 'shorts', color: '#A8E6C3' } },
  { id: 'pants_skirt', name: '蓬蓬裙', slot: 'pants', rarity: 'common', price: 130, stats: { imagination: 2 },
    visual: { kind: 'skirt', color: '#FFC9DE' } },

  { id: 'shoes_sneakers', name: '運動鞋', slot: 'shoes', rarity: 'common', price: 110, stats: { effort: 2, attitude: 1 },
    visual: { kind: 'sneakers', color: '#FFFFFF', color2: '#7FB6E8' } },
  { id: 'shoes_boots', name: '魔法靴', slot: 'shoes', rarity: 'super', price: 300, stats: { attitude: 5 },
    visual: { kind: 'boots', color: '#8E5B8E', color2: '#FFD966' } },

  { id: 'back_wings', name: '小天使翅膀', slot: 'back', rarity: 'super', price: 340, stats: { honesty: 4, imagination: 2 },
    visual: { kind: 'wings', color: '#FFFFFF', color2: '#CFE8FF' } },
  { id: 'back_cape', name: '英雄披風', slot: 'back', rarity: 'epic', price: 600, stats: { attitude: 5, effort: 3 },
    visual: { kind: 'cape', color: '#E46A7A' } },
  { id: 'back_aura', name: '閃亮星星光環', slot: 'back', rarity: 'epic', price: 800, stats: { imagination: 10, attitude: 3 },
    visual: { kind: 'aura', color: '#FFE08A', color2: '#FFF3C4' } },

  { id: 'other_badge', name: '好寶寶徽章', slot: 'other', rarity: 'common', price: 90, stats: { attitude: 2 },
    visual: { kind: 'badge', color: '#FFD966', color2: '#FF8FAF' } },
  { id: 'other_scarf', name: '暖暖圍巾', slot: 'other', rarity: 'common', price: 110, stats: { honesty: 2 },
    visual: { kind: 'scarf', color: '#FF9FB4', color2: '#FFD3E0' } }
];

function itemById(id) {
  return SHOP_ITEMS.find(i => i.id === id) || null;
}

app.use(express.json());
app.use((req, res, next) => {
  if (process.env.LOG_REQUESTS) console.log(new Date().toISOString(), req.method, req.url);
  next();
});
/*
 * 每次載入／重新整理網頁，都由伺服器端回到「教師登錄 / 學生登錄」。
 * 這樣即使瀏覽器快取了舊版程式，也一定會重新登入。
 * 班級、學生登入號碼、作業、經驗值與金幣都存在伺服器，不會被清除。
 */
app.use((req, res, next) => {
  if (req.method === 'GET' && (req.path === '/' || req.path === '/index.html')) {
    const s = currentSession(req);
    if (s) {
      s.role = null;
      s.studentNo = null;
      if (RESET_IDENTITY_ON_LOAD) s.identity = null;
      saveDb();
    }
  }
  next();
});

// 不要讓瀏覽器快取舊版畫面程式
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store')
}));

/* ---------------- 資料結構 ----------------
 * db.teacher    : { passwordSalt, passwordHash, passwordChanges, passwordUpdatedAt,
 *                   recoverySalt, recoveryHash, recoveryUpdatedAt }  (未設定密碼時為 null)
 * db.class      : { code, grade, klass, studentCount, createdAt }
 * db.students   : [{ no, loginCode, level, exp, coins, diamonds, stats, collection, equipped,
 *                    house: { name, createdAt, updatedAt } }]
 * db.assignments: [{ id, title, content, dueDate, exp, coins, scope, targetNos,
 *                    abilityRewards, createdAt, records: { "1": { completed, completedAt, rewarded } } }]
 * db.shopLogs   : [{ requestId, studentNo, coinsSpent, diamondsGained, at }]
 * db.purchaseLogs: [{ requestId, studentNo, itemId, price, at }]
 * db.chestLogs  : [{ requestId, studentNo, itemId, rarity, cost, at }]
 * db.sessions   : token -> { setupDone, grade, klass, identity, role, studentNo, teacherAuth }
 */
function defaultDb() {
  return {
    teacher: null, class: null, students: [], assignments: [],
    shopLogs: [], purchaseLogs: [], chestLogs: [], housePurchaseLogs: [], sessions: {}
  };
}

function zeroStats() {
  return { imagination: 0, intelligence: 0, honesty: 0, effort: 0, attitude: 0 };
}

function defaultEquipped() {
  return { hat: null, glasses: null, top: null, pants: null, shoes: null, back: null, other: null };
}

function normalizeStats(src) {
  const out = zeroStats();
  if (src && typeof src === 'object') {
    STAT_KEYS.forEach(k => {
      const n = Number(src[k]);
      if (Number.isFinite(n) && n > 0) out[k] = Math.floor(n);
    });
  }
  return out;
}

function normalizeCollection(src) {
  const out = {};
  if (src && typeof src === 'object') {
    Object.keys(src).forEach(id => {
      if (!itemById(id)) return;
      const n = Number(src[id]);
      if (Number.isInteger(n) && n > 0) out[id] = n;
    });
  }
  return out;
}

function normalizeEquipped(src) {
  const out = defaultEquipped();
  if (src && typeof src === 'object') {
    EQUIP_SLOTS.forEach(slot => {
      const id = src[slot];
      const it = id ? itemById(id) : null;
      if (it && it.slot === slot) out[slot] = id;
    });
  }
  return out;
}

/* 第四版：每位學生一間獨立的 OC 房子（只有自己看得到，不會連到別人） */
function emptyHouse() {
  return {
    name: null,
    createdAt: null,
    updatedAt: null,
    model: 'house_cottage',
    items: [],
    unlocked: [],
    cardPurchased: false,
    cardPurchasedAt: null,
    layoutUpdatedAt: null
  };
}

function cleanHouseName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(name);
  if (chars.length < 1 || chars.length > MAX_HOUSE_NAME) return null;
  return chars.join('');
}

function clampNumber(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function normalizeRotation(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  const r = ((n % 360) + 360) % 360;
  return Math.round(r * 100) / 100;
}

function normalizeHouseItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const meta = houseItemById(String(raw.itemId || ''));
  if (!meta || meta.category === 'house') return null;
  const x = Number(raw.x);
  const z = Number(raw.z);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  if (Math.abs(x) > HOUSE_AREA || Math.abs(z) > HOUSE_AREA) return null;
  const scale = clampNumber(Number(raw.scale) || 1, meta.minScale, meta.maxScale);
  return {
    uid: String(raw.uid || crypto.randomBytes(8).toString('hex')).slice(0, 40),
    itemId: meta.id,
    x: Math.round(x * 100) / 100,
    z: Math.round(z * 100) / 100,
    rot: normalizeRotation(raw.rot),
    scale: Math.round(scale * 100) / 100
  };
}

function normalizeHouse(src) {
  const out = emptyHouse();
  if (!src || typeof src !== 'object') return out;

  const name = cleanHouseName(src.name);
  if (name) {
    out.name = name;
    out.createdAt = Number(src.createdAt) || Date.now();
    out.updatedAt = Number(src.updatedAt) || out.createdAt;
  }

  const model = houseItemById(String(src.model || ''));
  if (model && model.category === 'house') out.model = model.id;

  const unlocked = new Set();
  if (Array.isArray(src.unlocked)) {
    src.unlocked.forEach(id => {
      if (houseItemById(id)) unlocked.add(id);
    });
  }
  out.unlocked = [...unlocked];

  out.cardPurchased = !!src.cardPurchased;
  out.cardPurchasedAt = out.cardPurchased ? (Number(src.cardPurchasedAt) || Date.now()) : null;
  out.layoutUpdatedAt = Number(src.layoutUpdatedAt) || null;

  const items = [];
  const uids = new Set();
  if (Array.isArray(src.items)) {
    src.items.slice(0, HOUSE_MAX_ITEMS).forEach(raw => {
      const it = normalizeHouseItem(raw);
      if (!it) return;
      if (uids.has(it.uid)) it.uid = crypto.randomBytes(8).toString('hex');
      uids.add(it.uid);
      items.push(it);
    });
  }
  out.items = items;

  // 舊版房子只有名稱，補上預設值後就完成遷移
  return out;
}

function isHouseItemUnlocked(st, item) {
  if (!item) return false;
  if (item.price <= 0) return true;
  const h = st && st.house;
  if (!h) return false;
  if (h.cardPurchased && ALL_CARD_INCLUDES_FUTURE) return true;
  return Array.isArray(h.unlocked) && h.unlocked.includes(item.id);
}

function publicHouse(st) {
  const h = normalizeHouse((st && st.house) || null);
  const unlocked = HOUSE_ITEMS
    .filter(item => isHouseItemUnlocked(st, item))
    .map(item => item.id);
  return {
    name: h.name || null,
    isNamed: !!h.name,
    createdAt: h.createdAt || null,
    updatedAt: h.updatedAt || null,
    model: h.model,
    items: h.items.map(it => Object.assign({}, it)),
    unlocked,
    layoutUpdatedAt: h.layoutUpdatedAt || null,
    card: {
      price: ALL_CARD_PRICE,
      purchased: !!h.cardPurchased,
      purchasedAt: h.cardPurchasedAt || null,
      includesFuture: ALL_CARD_INCLUDES_FUTURE
    }
  };
}

function houseItemAabb(it) {
  const meta = houseItemById(it.itemId);
  const rad = normalizeRotation(it.rot) * Math.PI / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  const w = meta.footprint.w * it.scale;
  const d = meta.footprint.d * it.scale;
  const hx = Math.round(((w * c) + (d * s)) * 1000) / 2000;
  const hz = Math.round(((w * s) + (d * c)) * 1000) / 2000;
  return { minX: it.x - hx, maxX: it.x + hx, minZ: it.z - hz, maxZ: it.z + hz };
}

function aabbOverlap(a, b, pad) {
  const p = pad || 0;
  return !(a.maxX <= b.minX + p || a.minX >= b.maxX - p ||
           a.maxZ <= b.minZ + p || a.minZ >= b.maxZ - p);
}

/* 回傳 null 表示合法，否則回傳錯誤訊息 */
function validateHouseLayout(st, model, items) {
  if (!model || model.category !== 'house') return '房屋外觀不正確。';
  if (!isHouseItemUnlocked(st, model)) return `「${model.name}」尚未解鎖。`;
  if (items.length > HOUSE_MAX_ITEMS) return `最多只能擺放 ${HOUSE_MAX_ITEMS} 個物件。`;

  const seen = new Set();
  const boxes = [];
  for (const it of items) {
    if (seen.has(it.uid)) return '有重複的物件編號，請重新整理後再試。';
    seen.add(it.uid);
    const meta = houseItemById(it.itemId);
    if (!meta || meta.category === 'house') return '有物件資料不正確。';
    if (!isHouseItemUnlocked(st, meta)) return `「${meta.name}」尚未解鎖。`;

    const box = houseItemAabb(it);
    if (box.minX < -HOUSE_AREA || box.maxX > HOUSE_AREA || box.minZ < -HOUSE_AREA || box.maxZ > HOUSE_AREA) {
      return `「${meta.name}」超出可建造範圍。`;
    }

    const insideHouse = box.minX >= HOUSE_INNER.minX && box.maxX <= HOUSE_INNER.maxX &&
      box.minZ >= HOUSE_INNER.minZ && box.maxZ <= HOUSE_INNER.maxZ;
    const touchesHouse = !(box.maxX <= HOUSE_OUTER.minX || box.minX >= HOUSE_OUTER.maxX ||
      box.maxZ <= HOUSE_OUTER.minZ || box.minZ >= HOUSE_OUTER.maxZ);
    if (!insideHouse && touchesHouse) {
      return `「${meta.name}」會穿過牆壁，請放到屋內或屋外。`;
    }

    if (meta.solid) {
      for (const other of boxes) {
        if (!other.solid) continue;
        if (aabbOverlap(box, other.box, 0.02)) {
          return `「${meta.name}」和「${other.name}」重疊了，請移開一點。`;
        }
      }
    }
    boxes.push({ solid: !!meta.solid, box, name: meta.name });
  }
  return null;
}

function equippedBonus(equipped) {
  const bonus = zeroStats();
  Object.keys(equipped || {}).forEach(slot => {
    const it = itemById(equipped[slot]);
    if (!it) return;
    STAT_KEYS.forEach(k => { bonus[k] += Number(it.stats[k] || 0); });
  });
  return bonus;
}

/* 能力 = 基礎值（作業累積） + 目前穿戴服飾的增益（即時計算，不會重複累加） */
function statsOf(s) {
  const base = Object.assign(zeroStats(), s.stats || {});
  const bonus = equippedBonus(s.equipped);
  const total = zeroStats();
  STAT_KEYS.forEach(k => { total[k] = base[k] + bonus[k]; });
  return { base, bonus, total };
}

function addStats(s, gains) {
  STAT_KEYS.forEach(k => {
    const n = Number(gains && gains[k]);
    if (Number.isFinite(n) && n > 0) s.stats[k] += Math.floor(n);
  });
}

function publicStudent(s, full) {
  const out = {
    no: s.no,
    loginCode: s.loginCode,
    level: s.level,
    exp: s.exp,
    coins: s.coins,
    diamonds: s.diamonds,
    expNeeded: expNeeded(s.level),
    equipped: Object.assign({}, s.equipped || defaultEquipped()),
    stats: statsOf(s)
  };
  if (full) out.collection = Object.assign({}, s.collection || {});
  return out;
}

let db = defaultDb();

function loadDb() {
  if (!fs.existsSync(DB_FILE)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

    // 從第一版格式遷移（保留固定不變的登入號碼）
    if (!db.class && raw.classInfo) {
      db.class = {
        code: raw.classInfo.classCode,
        grade: raw.classInfo.grade !== undefined ? raw.classInfo.grade : raw.grade,
        klass: raw.classInfo.klass !== undefined ? raw.classInfo.klass : raw.klass,
        studentCount: raw.classInfo.studentCount,
        createdAt: raw.classInfo.createdAt
      };
    }
    db.teacher = raw.teacher || null;
    db.class = db.class || raw.class || null;
    db.students = (raw.students || []).map(s => ({
      no: s.no,
      loginCode: s.loginCode,
      level: s.level || 1,
      exp: s.exp || 0,
      coins: s.coins || 0,
      diamonds: s.diamonds || 0,
      // 第三版新增：五種能力、服飾收藏、目前穿戴
      stats: normalizeStats(s.stats),
      collection: normalizeCollection(s.collection),
      equipped: normalizeEquipped(s.equipped),
      house: normalizeHouse(s.house)
    }));
    db.assignments = (raw.assignments || []).map(a => Object.assign({}, a, {
      records: a.records || {},
      abilityRewards: normalizeStats(a.abilityRewards)
    }));
    db.shopLogs = raw.shopLogs || [];
    db.purchaseLogs = raw.purchaseLogs || [];
    db.chestLogs = raw.chestLogs || [];
    db.housePurchaseLogs = raw.housePurchaseLogs || [];
    db.sessions = raw.sessions || {};

    // 工作階段欄位補齊
    Object.keys(db.sessions).forEach(t => {
      const s = db.sessions[t];
      if (s.setupDone === undefined) s.setupDone = false;
      if (s.identity === undefined) s.identity = null;
      if (s.role === undefined) s.role = null;
      if (s.studentNo === undefined) s.studentNo = null;
      // 尚未設定教師密碼時，不允許直接保有教師工作階段
      if (!db.teacher && s.identity === 'teacher') s.role = null;
    });
  } catch (e) {
    console.error('讀取資料庫失敗：', e.message);
  }
}

let saveTimer = null;
function saveDb() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
      const tmp = DB_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
      fs.renameSync(tmp, DB_FILE);
    } catch (e) {
      console.error('寫入資料庫失敗：', e.message);
    }
  }, 30);
}
loadDb();

/* ---------------- 通用工具 ---------------- */
function getToken(req) {
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)oc_token=([^;]+)/);
  return m ? m[1] : null;
}

function setCookie(res, token) {
  res.setHeader('Set-Cookie', `oc_token=${token}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`);
}

function ensureSession(req, res) {
  const token = getToken(req);
  if (token && db.sessions[token]) return db.sessions[token];
  const newTok = crypto.randomBytes(24).toString('hex');
  db.sessions[newTok] = {
    setupDone: false, grade: null, klass: null,
    identity: null, role: null, studentNo: null
  };
  setCookie(res, newTok);
  saveDb();
  return db.sessions[newTok];
}

function currentSession(req) {
  const token = getToken(req);
  return token ? db.sessions[token] || null : null;
}

// 教師權限：必須由伺服器驗證過密碼的教師工作階段
function requireTeacher(req, res, next) {
  const s = currentSession(req);
  if (!s || s.role !== 'teacher' || !db.teacher) {
    return res.status(403).json({ ok: false, message: '請先以教師身分登入。' });
  }
  req.session = s;
  next();
}

// 學生權限：必須由伺服器驗證班級代碼與登入號碼
function requireStudent(req, res, next) {
  const s = currentSession(req);
  if (!s || s.role !== 'student') {
    return res.status(403).json({ ok: false, message: '請先以學生身分登入。' });
  }
  req.session = s;
  next();
}

function hashValue(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a), 'hex');
  const bb = Buffer.from(String(b), 'hex');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function makePasswordRecord(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { passwordSalt: salt, passwordHash: hashValue(password, salt), passwordUpdatedAt: Date.now() };
}

function makeRecoveryCode() {
  const salt = crypto.randomBytes(16).toString('hex');
  const code = crypto.randomBytes(6).toString('hex').toUpperCase();
  return { code, recoverySalt: salt, recoveryHash: hashValue(code, salt), recoveryUpdatedAt: Date.now() };
}

function verifyTeacherPassword(password) {
  if (!db.teacher) return false;
  return safeEqual(hashValue(password, db.teacher.passwordSalt), db.teacher.passwordHash);
}

function makeLoginCodes(count) {
  const used = new Set();
  const codes = [];
  let guard = 0;
  while (codes.length < count && guard++ < 200000) {
    const n = crypto.randomInt(10000, 100000);
    if (!used.has(n)) { used.add(n); codes.push(n); }
  }
  return codes;
}

/* 等級 / 經驗值規則（伺服器計算）：升級所需經驗值 = 目前等級 * 100 */
function expNeeded(level) {
  return level * 100;
}

function award(student, exp, coins) {
  student.coins += coins;
  student.exp += exp;
  let guard = 0;
  while (student.exp >= expNeeded(student.level) && guard++ < 10000) {
    student.exp -= expNeeded(student.level);
    student.level += 1;
  }
}

function findStudent(no) {
  return db.students.find(s => s.no === no) || null;
}

function findAssignment(id) {
  return db.assignments.find(a => a.id === id) || null;
}

function myStudent(session) {
  return findStudent(session.studentNo);
}

/* ---------------- 狀態 ---------------- */
app.get('/api/state', (req, res) => {
  const s = ensureSession(req, res);
  const cls = db.class;
  res.json({
    ok: true,
    // 班級已建立過，就不需要再設定年級／班級
    setupDone: !!cls || s.setupDone,
    identity: s.identity,
    role: s.role,
    studentNo: s.studentNo,
    grade: cls ? cls.grade : s.grade,
    klass: cls ? cls.klass : s.klass,
    passwordSet: !!db.teacher,
    passwordChanges: db.teacher ? db.teacher.passwordChanges : 0,
    maxPasswordChanges: MAX_PASSWORD_CHANGES,
    hasClass: !!db.class,
    classCode: db.class ? db.class.code : null,
    studentCount: db.class ? db.class.studentCount : null
  });
});

/* ---------------- 一、初始設定與身分 ---------------- */
app.post('/api/setup', (req, res) => {
  const s = ensureSession(req, res);
  // 已經建立過班級：直接沿用班級資料，不需要再設定一次
  if (db.class) {
    s.setupDone = true;
    s.grade = db.class.grade;
    s.klass = db.class.klass;
    saveDb();
    return res.json({ ok: true });
  }
  if (s.setupDone) return res.json({ ok: true });
  const g = String(req.body.grade || '').trim();
  const k = String(req.body.klass || '').trim();
  if (!/^[1-6]$/.test(g)) return res.status(400).json({ ok: false, message: '請輸入正確的年級（1-6）。' });
  if (!/^[0-9A-Za-z\u4e00-\u9fa5]{1,4}$/.test(k)) return res.status(400).json({ ok: false, message: '請輸入正確的班級。' });
  s.grade = Number(g);
  s.klass = k;
  s.setupDone = true;
  saveDb();
  res.json({ ok: true });
});

app.post('/api/setup/role', (req, res) => {
  const s = ensureSession(req, res);
  if (s.role) return res.status(400).json({ ok: false, message: '請先登出，再切換身分。' });
  if (!s.setupDone && !db.class) return res.status(400).json({ ok: false, message: '請先完成年級與班級設定。' });
  const { role } = req.body || {};
  if (role !== 'teacher' && role !== 'student') {
    return res.status(400).json({ ok: false, message: '請選擇教師或學生身分。' });
  }
  s.identity = role;
  s.role = null; // 教師需設定／輸入密碼，學生需登入號碼
  saveDb();
  res.json({ ok: true, role: null });
});

/* ---------------- 二、教師密碼 ---------------- */
// 第一次：設定教師密碼
app.post('/api/teacher/setup', (req, res) => {
  const s = ensureSession(req, res);
  if (s.identity !== 'teacher') return res.status(403).json({ ok: false, message: '請先選擇教師身分。' });
  if (db.teacher) return res.status(400).json({ ok: false, message: '教師密碼已設定過，請直接登入。' });

  const pw = String(req.body.password || '');
  const pw2 = String(req.body.passwordConfirm || req.body.password || '');
  if (pw.length < MIN_PASSWORD_LEN) {
    return res.status(400).json({ ok: false, message: `密碼至少需要 ${MIN_PASSWORD_LEN} 個字元。` });
  }
  if (pw !== pw2) return res.status(400).json({ ok: false, message: '兩次輸入的密碼不一致。' });

  const rec = makeRecoveryCode();
  db.teacher = Object.assign(makePasswordRecord(pw), {
    passwordChanges: 0,
    recoverySalt: rec.recoverySalt,
    recoveryHash: rec.recoveryHash,
    recoveryUpdatedAt: rec.recoveryUpdatedAt
  });
  s.role = 'teacher';
  saveDb();
  // 帳號恢復代碼只在這一次回傳
  res.json({ ok: true, recoveryCode: rec.code });
});

// 教師登入（輸入密碼）
app.post('/api/teacher/login', (req, res) => {
  const s = ensureSession(req, res);
  if (s.identity !== 'teacher') return res.status(403).json({ ok: false, message: '此裝置的身分不是教師。' });
  if (!db.teacher) return res.status(400).json({ ok: false, message: '尚未設定教師密碼，請先設定密碼。' });
  const pw = String(req.body.password || '');
  if (!verifyTeacherPassword(pw)) return res.status(400).json({ ok: false, message: '密碼不正確，請再試一次。' });
  s.role = 'teacher';
  saveDb();
  res.json({ ok: true, role: 'teacher' });
});

// 修改密碼（需驗證目前密碼，最多 2 次）
app.post('/api/teacher/password', requireTeacher, (req, res) => {
  if (db.teacher.passwordChanges >= MAX_PASSWORD_CHANGES) {
    return res.status(400).json({
      ok: false,
      message: `密碼已成功修改 ${db.teacher.passwordChanges} 次，已達上限（${MAX_PASSWORD_CHANGES} 次），請聯繫管理者重設。`
    });
  }
  const current = String(req.body.current || '');
  const next = String(req.body.next || '');
  const next2 = String(req.body.nextConfirm || req.body.next || '');
  if (!verifyTeacherPassword(current)) return res.status(400).json({ ok: false, message: '目前密碼不正確。' });
  if (next.length < MIN_PASSWORD_LEN) return res.status(400).json({ ok: false, message: `新密碼至少需要 ${MIN_PASSWORD_LEN} 個字元。` });
  if (next !== next2) return res.status(400).json({ ok: false, message: '兩次輸入的新密碼不一致。' });
  if (verifyTeacherPassword(next)) return res.status(400).json({ ok: false, message: '新密碼不能與目前密碼相同。' });

  const rec = makePasswordRecord(next);
  db.teacher.passwordSalt = rec.passwordSalt;
  db.teacher.passwordHash = rec.passwordHash;
  db.teacher.passwordUpdatedAt = rec.passwordUpdatedAt;
  db.teacher.passwordChanges += 1;
  saveDb();
  res.json({
    ok: true,
    passwordChanges: db.teacher.passwordChanges,
    maxPasswordChanges: MAX_PASSWORD_CHANGES,
    message: `密碼修改成功，已使用 ${db.teacher.passwordChanges} / ${MAX_PASSWORD_CHANGES} 次。`
  });
});

// 驗證目前密碼後，取得／重新產生帳號恢復代碼
app.post('/api/teacher/recovery-code', requireTeacher, (req, res) => {
  const pw = String(req.body.password || '');
  if (!verifyTeacherPassword(pw)) return res.status(400).json({ ok: false, message: '密碼不正確。' });
  const rec = makeRecoveryCode();
  db.teacher.recoverySalt = rec.recoverySalt;
  db.teacher.recoveryHash = rec.recoveryHash;
  db.teacher.recoveryUpdatedAt = rec.recoveryUpdatedAt;
  saveDb();
  res.json({ ok: true, recoveryCode: rec.code, message: '請立即保存新的恢復代碼，舊代碼將失效。' });
});

// 忘記密碼：可直接設定新密碼；若填了恢復代碼則一併驗證（計入修改次數）
app.post('/api/teacher/recover', (req, res) => {
  const s = ensureSession(req, res);
  if (!db.teacher) return res.status(400).json({ ok: false, message: '尚未設定教師密碼。' });
  if (s.identity !== 'teacher') return res.status(403).json({ ok: false, message: '請先選擇教師身分。' });

  const code = String(req.body.recoveryCode || '').trim().toUpperCase();
  const next = String(req.body.newPassword || '');
  const next2 = String(req.body.newPasswordConfirm || req.body.newPassword || '');
  const usingCode = code.length > 0;

  if (usingCode) {
    if (db.teacher.passwordChanges >= MAX_PASSWORD_CHANGES) {
      return res.status(400).json({ ok: false, message: `密碼修改次數已達上限（${MAX_PASSWORD_CHANGES} 次），請使用管理者重設。` });
    }
    if (!safeEqual(hashValue(code, db.teacher.recoverySalt), db.teacher.recoveryHash)) {
      return res.status(400).json({ ok: false, message: '帳號恢復代碼不正確。' });
    }
  }

  if (next.length < MIN_PASSWORD_LEN) return res.status(400).json({ ok: false, message: `新密碼至少需要 ${MIN_PASSWORD_LEN} 個字元。` });
  if (next !== next2) return res.status(400).json({ ok: false, message: '兩次輸入的新密碼不一致。' });

  const rec = makePasswordRecord(next);
  db.teacher.passwordSalt = rec.passwordSalt;
  db.teacher.passwordHash = rec.passwordHash;
  db.teacher.passwordUpdatedAt = rec.passwordUpdatedAt;
  // 直接重設（未使用恢復代碼）不計入修改次數，並重新開始計算
  db.teacher.passwordChanges = usingCode ? db.teacher.passwordChanges + 1 : 0;
  // 重設後重新產生恢復代碼（一次性）
  const nr = makeRecoveryCode();
  db.teacher.recoverySalt = nr.recoverySalt;
  db.teacher.recoveryHash = nr.recoveryHash;
  db.teacher.recoveryUpdatedAt = nr.recoveryUpdatedAt;
  saveDb();
  res.json({ ok: true, message: '密碼已重設，請用新密碼登入。', passwordChanges: db.teacher.passwordChanges });
});

/* ---------------- 三、班級與學生 ---------------- */
app.post('/api/class/create', requireTeacher, (req, res) => {
  if (db.class) return res.status(400).json({ ok: false, message: '班級已建立過，如需重建請先使用重設流程。' });
  const classCode = String(req.body.classCode || '').trim().toUpperCase();
  const studentCount = Number(req.body.studentCount);
  if (!/^[A-Z0-9]{3,10}$/.test(classCode)) {
    return res.status(400).json({ ok: false, message: '班級代碼只能是 3-10 位英文字母與數字，例如 OC503。' });
  }
  if (db.class && db.class.code === classCode) {
    return res.status(400).json({ ok: false, message: '這個班級代碼已被使用，請換一個。' });
  }
  if (!Number.isInteger(studentCount) || studentCount < 1 || studentCount > 60) {
    return res.status(400).json({ ok: false, message: '學生人數請輸入 1 到 60 之間的整數。' });
  }
  const codes = makeLoginCodes(studentCount);
  db.students = codes.map((c, i) => ({
    no: i + 1, loginCode: c, level: 1, exp: 0, coins: 0, diamonds: 0,
    stats: zeroStats(), collection: {}, equipped: defaultEquipped(), house: emptyHouse()
  }));
  db.class = { code: classCode, grade: req.session.grade, klass: req.session.klass, studentCount, createdAt: Date.now() };
  saveDb();
  res.json({ ok: true, classCode, studentCount });
});

app.get('/api/class', requireTeacher, (req, res) => {
  if (!db.class) return res.status(404).json({ ok: false, message: '尚未建立班級。' });
  res.json({
    ok: true,
    grade: db.class.grade,
    klass: db.class.klass,
    classCode: db.class.code,
    studentCount: db.class.studentCount,
    students: db.students.map(publicStudent)
  });
});

/* ---------------- 五、六、作業派發 ---------------- */
function validateAssignmentBody(body) {
  const title = String(body.title || '').trim();
  const content = String(body.content || '').trim();
  const exp = Number(body.exp);
  const coins = Number(body.coins);
  const dueDate = body.dueDate ? String(body.dueDate) : '';
  if (!title) return { error: '請輸入作業名稱。' };
  if (title.length > 60) return { error: '作業名稱太長了（最多 60 字）。' };
  if (!content) return { error: '請輸入作業內容。' };
  if (content.length > 2000) return { error: '作業內容太長了（最多 2000 字）。' };
  if (!Number.isInteger(exp) || exp < 0 || exp > MAX_ASSIGN_REWARD) return { error: '經驗值請輸入 0 到 9999 的整數。' };
  if (!Number.isInteger(coins) || coins < 0 || coins > MAX_ASSIGN_REWARD) return { error: 'OC 金幣請輸入 0 到 9999 的整數。' };
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { error: '截止日期格式不正確。' };

  // 第三版：作業可設定多種能力增益
  const abilityRewards = {};
  const rawGains = body.abilityRewards;
  if (rawGains && typeof rawGains === 'object') {
    for (const k of STAT_KEYS) {
      if (rawGains[k] === undefined || rawGains[k] === null || rawGains[k] === '') continue;
      const n = Number(rawGains[k]);
      if (!Number.isInteger(n) || n < 0 || n > 999) {
        return { error: `${STAT_NAMES[k]}增益請輸入 0 到 999 的整數。` };
      }
      if (n > 0) abilityRewards[k] = n;
    }
  }

  return { title, content, exp, coins, dueDate: dueDate || null, abilityRewards };
}

app.post('/api/assignments', requireTeacher, (req, res) => {
  if (!db.class) return res.status(400).json({ ok: false, message: '尚未建立班級。' });
  const v = validateAssignmentBody(req.body || {});
  if (v.error) return res.status(400).json({ ok: false, message: v.error });

  const scope = (req.body.scope === 'individual') ? 'individual' : 'all';
  let targetNos = [];
  if (scope === 'individual') {
    targetNos = Array.isArray(req.body.targetNos) ? [...new Set(req.body.targetNos.map(Number))] : [];
    targetNos = targetNos.filter(n => Number.isInteger(n) && n >= 1 && n <= db.class.studentCount);
    if (targetNos.length === 0) return res.status(400).json({ ok: false, message: '請至少選擇一位學生。' });
  } else {
    targetNos = db.students.map(s => s.no);
  }

  const records = {};
  targetNos.forEach(no => { records[String(no)] = { completed: false, completedAt: null, rewarded: false }; });

  const assignment = {
    id: crypto.randomBytes(8).toString('hex'),
    title: v.title,
    content: v.content,
    dueDate: v.dueDate,
    exp: v.exp,
    coins: v.coins,
    abilityRewards: v.abilityRewards,
    scope,
    targetNos,
    createdAt: Date.now(),
    records
  };
  db.assignments.unshift(assignment);
  saveDb();
  res.json({
    ok: true,
    assignment: {
      id: assignment.id, title: assignment.title, scope: assignment.scope,
      targetCount: targetNos.length, exp: assignment.exp, coins: assignment.coins,
      abilityRewards: assignment.abilityRewards
    }
  });
});

// 教師查看作業紀錄（含每位學生完成狀態）
app.get('/api/assignments', requireTeacher, (req, res) => {
  res.json({
    ok: true,
    students: db.students.map(s => ({ no: s.no, level: s.level, exp: s.exp, coins: s.coins, diamonds: s.diamonds })),
    assignments: db.assignments.map(a => ({
      id: a.id, title: a.title, content: a.content, dueDate: a.dueDate,
      exp: a.exp, coins: a.coins, abilityRewards: a.abilityRewards || {}, scope: a.scope, targetNos: a.targetNos,
      createdAt: a.createdAt, records: a.records
    }))
  });
});

/* ---------------- 學生：完成作業（伺服器發放獎勵，避免重複） ---------------- */
app.post('/api/assignments/:id/complete', requireStudent, (req, res) => {
  const a = findAssignment(req.params.id);
  const st = myStudent(req.session);
  if (!a || !st) return res.status(404).json({ ok: false, message: '找不到這份作業。' });
  const key = String(st.no);
  if (!a.records[key]) return res.status(403).json({ ok: false, message: '這份作業不屬於你。' });

  const record = a.records[key];
  if (record.completed) {
    return res.json({ ok: true, already: true, message: '這份作業已經完成過囉。', student: publicStudent(st) });
  }

  record.completed = true;
  record.completedAt = Date.now();
  if (!record.rewarded) {
    award(st, a.exp, a.coins);       // 經驗值與金幣只發放一次
    addStats(st, a.abilityRewards);  // 能力增益也只發放一次
    record.rewarded = true;
  }
  saveDb();

  const gains = STAT_KEYS
    .filter(k => a.abilityRewards && a.abilityRewards[k] > 0)
    .map(k => `${STAT_NAMES[k]} +${a.abilityRewards[k]}`)
    .join('、');
  res.json({
    ok: true,
    message: `完成！獲得 ${a.exp} 經驗值、${a.coins} OC 金幣${gains ? `，以及 ${gains}` : ''}。`,
    student: publicStudent(st, true)
  });
});

/* ---------------- 學生：個人資料與作業清單 ---------------- */
app.get('/api/student/me', requireStudent, (req, res) => {
  const st = myStudent(req.session);
  if (!st) return res.status(404).json({ ok: false, message: '找不到你的資料。' });
  res.json({
    ok: true,
    student: publicStudent(st, true),
    classCode: db.class ? db.class.code : null,
    grade: db.class ? db.class.grade : null,
    klass: db.class ? db.class.klass : null
  });
});

app.get('/api/student/assignments', requireStudent, (req, res) => {
  const st = myStudent(req.session);
  if (!st) return res.status(404).json({ ok: false, message: '找不到你的資料。' });
  const key = String(st.no);
  const list = db.assignments
    .filter(a => a.records[key])
    .map(a => ({
      id: a.id, title: a.title, content: a.content, dueDate: a.dueDate,
      exp: a.exp, coins: a.coins, abilityRewards: a.abilityRewards || {}, scope: a.scope, createdAt: a.createdAt,
      completed: !!a.records[key].completed,
      completedAt: a.records[key].completedAt
    }));
  res.json({ ok: true, assignments: list });
});

// 學生的私人房子：只有本人可以讀取與命名／改名
app.get('/api/house', requireStudent, (req, res) => {
  const st = myStudent(req.session);
  if (!st) return res.status(404).json({ ok: false, message: '找不到你的資料。' });
  res.json({ ok: true, private: true, house: publicHouse(st), maxNameLength: MAX_HOUSE_NAME });
});

app.post('/api/house/name', requireStudent, (req, res) => {
  const st = myStudent(req.session);
  if (!st) return res.status(404).json({ ok: false, message: '找不到你的資料。' });

  const name = cleanHouseName(req.body && req.body.name);
  if (!name) {
    return res.status(400).json({ ok: false, message: `房子名稱請輸入 1 到 ${MAX_HOUSE_NAME} 個字。` });
  }

  if (!st.house) st.house = emptyHouse();
  const firstTime = !st.house.name;
  const now = Date.now();
  st.house.name = name;
  if (firstTime) st.house.createdAt = now;
  st.house.updatedAt = now;
  saveDb();

  res.json({
    ok: true,
    private: true,
    house: publicHouse(st),
    message: firstTime
      ? `「${name}」蓋好了！這是只屬於你的獨立房子。`
      : `房子已改名為「${name}」。`
  });
});

// 家具目錄與全擁有卡設定（價格由伺服器提供，前端不能自行決定）
app.get('/api/house/catalog', (req, res) => {
  res.json({
    ok: true,
    categories: HOUSE_CATEGORIES,
    items: HOUSE_ITEMS,
    maxItems: HOUSE_MAX_ITEMS,
    area: HOUSE_AREA,
    allCard: {
      price: ALL_CARD_PRICE,
      includesFuture: ALL_CARD_INCLUDES_FUTURE
    }
  });
});

// 儲存整間房子的佈置（只允許擁有者，伺服器重新驗證解鎖狀態、範圍與碰撞）
app.post('/api/house/save', requireStudent, (req, res) => {
  const st = myStudent(req.session);
  if (!st) return res.status(404).json({ ok: false, message: '找不到你的資料。' });
  if (!st.house) st.house = emptyHouse();
  if (!st.house.name) return res.status(400).json({ ok: false, message: '請先幫房子取名字。' });

  const body = req.body || {};
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length > HOUSE_MAX_ITEMS) {
    return res.status(400).json({ ok: false, message: `最多只能擺放 ${HOUSE_MAX_ITEMS} 個物件。` });
  }

  const model = houseItemById(String(body.model || st.house.model || 'house_cottage'));
  if (!model) return res.status(400).json({ ok: false, message: '房屋外觀不正確。' });

  const items = [];
  const uids = new Set();
  for (const raw of rawItems) {
    const it = normalizeHouseItem(raw);
    if (!it) return res.status(400).json({ ok: false, message: '有物件資料不完整，請重新整理後再試。' });
    if (uids.has(it.uid)) {
      return res.status(400).json({ ok: false, message: '有重複的物件編號，請重新整理後再試。' });
    }
    uids.add(it.uid);
    items.push(it);
  }

  const layoutError = validateHouseLayout(st, model, items);
  if (layoutError) return res.status(400).json({ ok: false, message: layoutError });

  const now = Date.now();
  st.house.model = model.id;
  st.house.items = items;
  st.house.layoutUpdatedAt = now;
  st.house.updatedAt = now;
  saveDb();

  res.json({
    ok: true,
    house: publicHouse(st),
    message: '佈置已自動儲存。'
  });
});

// 購買單一家具／裝飾／房屋外觀
app.post('/api/house/buy-item', requireStudent, (req, res) => {
  const st = myStudent(req.session);
  if (!st) return res.status(404).json({ ok: false, message: '找不到你的資料。' });
  if (!st.house) st.house = emptyHouse();

  const requestId = String((req.body && req.body.requestId) || '').trim();
  const item = houseItemById(String((req.body && req.body.itemId) || ''));
  if (!requestId) return res.status(400).json({ ok: false, message: '缺少交易編號，請再試一次。' });
  if (!item) return res.status(404).json({ ok: false, message: '找不到這個物件。' });

  const existed = db.housePurchaseLogs.find(l => l.requestId === requestId && l.studentNo === st.no);
  if (existed) {
    return res.json({
      ok: true, duplicate: true, house: publicHouse(st), student: publicStudent(st),
      message: '這筆購買已經完成囉。'
    });
  }

  if (isHouseItemUnlocked(st, item)) {
    return res.json({
      ok: true, alreadyUnlocked: true, house: publicHouse(st), student: publicStudent(st),
      message: `「${item.name}」已經可以使用了。`
    });
  }

  if (st.diamonds < item.price) {
    return res.status(400).json({
      ok: false,
      message: `OC 鑽石不足，需要 ${item.price} OC 鑽石才能解鎖「${item.name}」。`
    });
  }

  st.diamonds -= item.price;
  if (!st.house.unlocked.includes(item.id)) st.house.unlocked.push(item.id);
  db.housePurchaseLogs.unshift({
    requestId, studentNo: st.no, itemId: item.id, price: item.price, kind: 'item', at: Date.now()
  });
  saveDb();

  res.json({
    ok: true,
    house: publicHouse(st),
    student: publicStudent(st),
    item,
    message: `已解鎖「${item.name}」！現在可以自由擺放。`
  });
});

// 家具全擁有卡：500 鑽石，每個帳號只能購買一次
app.post('/api/house/all-card', requireStudent, (req, res) => {
  const st = myStudent(req.session);
  if (!st) return res.status(404).json({ ok: false, message: '找不到你的資料。' });
  if (!st.house) st.house = emptyHouse();

  if (st.house.cardPurchased) {
    return res.json({
      ok: true, alreadyOwned: true, house: publicHouse(st), student: publicStudent(st),
      message: '你已經解鎖全部家具了。'
    });
  }

  const requestId = String((req.body && req.body.requestId) || '').trim();
  if (!requestId) return res.status(400).json({ ok: false, message: '缺少交易編號，請再試一次。' });

  const existed = db.housePurchaseLogs.find(l => l.requestId === requestId && l.studentNo === st.no);
  if (existed) {
    return res.json({
      ok: true, duplicate: true, house: publicHouse(st), student: publicStudent(st),
      message: '這筆購買已經完成囉。'
    });
  }

  if (st.diamonds < ALL_CARD_PRICE) {
    return res.status(400).json({
      ok: false,
      message: `OC 鑽石不足，家具全擁有卡需要 ${ALL_CARD_PRICE} OC 鑽石。`
    });
  }

  st.diamonds -= ALL_CARD_PRICE;
  st.house.cardPurchased = true;
  st.house.cardPurchasedAt = Date.now();
  st.house.unlocked = [...new Set([
    ...st.house.unlocked,
    ...HOUSE_ITEMS.filter(i => i.price > 0).map(i => i.id)
  ])];
  db.housePurchaseLogs.unshift({
    requestId, studentNo: st.no, itemId: 'all_furniture_card',
    price: ALL_CARD_PRICE, kind: 'all-card', at: Date.now()
  });
  saveDb();

  res.json({
    ok: true,
    house: publicHouse(st),
    student: publicStudent(st),
    message: '恭喜！所有家具、裝飾品與房屋外觀都已解鎖。'
  });
});

// 教師查看單一學生（必須在 /me、/assignments 之後註冊，避免路徑被吃掉）
app.get('/api/student/:no', requireTeacher, (req, res) => {
  const st = findStudent(Number(req.params.no));
  if (!st) return res.status(404).json({ ok: false, message: '找不到這位學生。' });
  res.json({ ok: true, student: publicStudent(st, true) });
});

// 學生登錄：班級代碼 + 五位數登入號碼
app.post('/api/student/login', (req, res) => {
  const s = ensureSession(req, res);
  if (!db.class) return res.status(400).json({ ok: false, message: '這個班級還沒建立，請先請老師建立班級。' });

  const classCode = String(req.body.classCode || '').trim().toUpperCase();
  const loginCode = String(req.body.loginCode || '').trim();
  if (classCode !== db.class.code) {
    return res.status(400).json({ ok: false, message: '班級代碼不正確，請再確認一次。' });
  }
  if (!/^\d{5}$/.test(loginCode)) {
    return res.status(400).json({ ok: false, message: '請輸入五位數的登入號碼。' });
  }
  const st = db.students.find(x => String(x.loginCode) === loginCode);
  if (!st) return res.status(400).json({ ok: false, message: '登入號碼不正確，請向老師確認。' });

  s.role = 'student';
  s.studentNo = st.no;
  saveDb();
  res.json({ ok: true, no: st.no, classCode: db.class.code });
});

/* ---------------- 九、鑽石兌換商店（避免重複扣款） ---------------- */
app.post('/api/shop/exchange', requireStudent, (req, res) => {
  const st = myStudent(req.session);
  if (!st) return res.status(404).json({ ok: false, message: '找不到你的資料。' });
  const requestId = String(req.body.requestId || '').trim();
  if (!requestId) return res.status(400).json({ ok: false, message: '缺少交易編號，請再試一次。' });

  // 同一筆請求重複送出：直接回傳結果，不重複扣款
  const existed = db.shopLogs.find(l => l.requestId === requestId && l.studentNo === st.no);
  if (existed) {
    return res.json({ ok: true, duplicate: true, student: publicStudent(st), message: '這筆兌換已經完成囉。' });
  }

  if (st.coins < EXCHANGE_COST_COINS) {
    return res.status(400).json({
      ok: false,
      message: `OC 金幣不足，需要 ${EXCHANGE_COST_COINS} OC 金幣才能兌換 ${EXCHANGE_GAIN_DIAMONDS} OC 鑽石。`
    });
  }

  st.coins -= EXCHANGE_COST_COINS;
  st.diamonds += EXCHANGE_GAIN_DIAMONDS;
  db.shopLogs.unshift({
    requestId,
    studentNo: st.no,
    coinsSpent: EXCHANGE_COST_COINS,
    diamondsGained: EXCHANGE_GAIN_DIAMONDS,
    at: Date.now()
  });
  saveDb();
  res.json({
    ok: true,
    student: publicStudent(st),
    message: `兌換成功！扣除 ${EXCHANGE_COST_COINS} OC 金幣，獲得 ${EXCHANGE_GAIN_DIAMONDS} OC 鑽石。`
  });
});

app.get('/api/shop/logs', requireStudent, (req, res) => {
  const st = myStudent(req.session);
  if (!st) return res.status(404).json({ ok: false, message: '找不到你的資料。' });
  res.json({
    ok: true,
    cost: EXCHANGE_COST_COINS,
    gain: EXCHANGE_GAIN_DIAMONDS,
    logs: db.shopLogs.filter(l => l.studentNo === st.no).slice(0, 20)
  });
});

/* ---------------- 第三版：服飾商店 / 穿戴 / 寶箱 ---------------- */
// 商品目錄（公開資料，讓教師與學生都能畫出相同的角色造型）
app.get('/api/shop/items', (req, res) => {
  res.json({
    ok: true,
    items: SHOP_ITEMS.map(i => Object.assign({}, i, {
      rarityName: RARITY_NAMES[i.rarity],
      slotName: SLOT_NAMES[i.slot]
    })),
    slots: EQUIP_SLOTS.map(s => ({ key: s, name: SLOT_NAMES[s] })),
    statNames: STAT_NAMES,
    chest: { cost: CHEST_COST_DIAMONDS, weights: CHEST_WEIGHTS }
  });
});

// 購買服飾（requestId 防止重複扣款）
app.post('/api/shop/buy', requireStudent, (req, res) => {
  const st = myStudent(req.session);
  if (!st) return res.status(404).json({ ok: false, message: '找不到你的資料。' });

  const requestId = String(req.body.requestId || '').trim();
  const item = itemById(String(req.body.itemId || ''));
  if (!requestId) return res.status(400).json({ ok: false, message: '缺少交易編號，請再試一次。' });
  if (!item) return res.status(404).json({ ok: false, message: '找不到這件商品。' });

  const existed = db.purchaseLogs.find(l => l.requestId === requestId && l.studentNo === st.no);
  if (existed) {
    return res.json({
      ok: true, duplicate: true, student: publicStudent(st, true),
      itemId: existed.itemId, message: '這筆購買已經完成囉。'
    });
  }

  if (st.diamonds < item.price) {
    return res.status(400).json({
      ok: false,
      message: `OC 鑽石不足，需要 ${item.price} OC 鑽石才能購買「${item.name}」。`
    });
  }

  st.diamonds -= item.price;
  st.collection[item.id] = (st.collection[item.id] || 0) + 1;
  db.purchaseLogs.unshift({
    requestId, studentNo: st.no, itemId: item.id, price: item.price, at: Date.now()
  });
  saveDb();
  res.json({
    ok: true,
    student: publicStudent(st, true),
    item,
    owned: st.collection[item.id],
    message: `購買成功！「${item.name}」已永久加入你的服飾收藏。`
  });
});

// 穿戴／脫下服飾（伺服器驗證擁有權與部位）
app.post('/api/shop/equip', requireStudent, (req, res) => {
  const st = myStudent(req.session);
  if (!st) return res.status(404).json({ ok: false, message: '找不到你的資料。' });

  const slot = String(req.body.slot || '');
  if (!EQUIP_SLOTS.includes(slot)) {
    return res.status(400).json({ ok: false, message: '不正確的穿戴部位。' });
  }
  const itemId = req.body.itemId ? String(req.body.itemId) : null;

  if (!itemId) {
    st.equipped[slot] = null;
    saveDb();
    return res.json({
      ok: true, student: publicStudent(st, true),
      message: `已脫下${SLOT_NAMES[slot]}。`
    });
  }

  const item = itemById(itemId);
  if (!item || item.slot !== slot) {
    return res.status(400).json({ ok: false, message: '這件服飾不能穿戴在這個部位。' });
  }
  if (!st.collection[item.id]) {
    return res.status(403).json({ ok: false, message: '你還沒有這件服飾，先去商店購買或抽寶箱吧。' });
  }

  st.equipped[slot] = item.id;
  saveDb();
  res.json({
    ok: true, student: publicStudent(st, true),
    message: `已穿上「${item.name}」！`
  });
});

// 寶箱抽獎：結果完全由伺服器決定
function pickChestItem() {
  const total = RARITIES.reduce((sum, r) => sum + (CHEST_WEIGHTS[r] || 0), 0);
  let roll = crypto.randomInt(1, total + 1);
  let rarity = RARITIES[0];
  for (const r of RARITIES) {
    roll -= (CHEST_WEIGHTS[r] || 0);
    if (roll <= 0) { rarity = r; break; }
  }
  const pool = SHOP_ITEMS.filter(i => i.rarity === rarity);
  return pool[crypto.randomInt(0, pool.length)] || SHOP_ITEMS[0];
}

app.post('/api/chest/draw', requireStudent, (req, res) => {
  const st = myStudent(req.session);
  if (!st) return res.status(404).json({ ok: false, message: '找不到你的資料。' });

  const requestId = String(req.body.requestId || '').trim();
  if (!requestId) return res.status(400).json({ ok: false, message: '缺少抽獎編號，請再試一次。' });

  // 同一筆抽獎重複送出：回傳原本結果，不重複扣鑽石或發放
  const existed = db.chestLogs.find(l => l.requestId === requestId && l.studentNo === st.no);
  if (existed) {
    const prevItem = itemById(existed.itemId);
    return res.json({
      ok: true, duplicate: true, student: publicStudent(st, true),
      item: prevItem, owned: st.collection[existed.itemId] || 0,
      duplicateOwned: (st.collection[existed.itemId] || 0) > 1,
      message: '這筆抽獎已經完成了，結果如下。'
    });
  }

  if (st.diamonds < CHEST_COST_DIAMONDS) {
    return res.status(400).json({
      ok: false,
      message: `OC 鑽石不足，抽一次寶箱需要 ${CHEST_COST_DIAMONDS} OC 鑽石。`
    });
  }

  const item = pickChestItem();
  st.diamonds -= CHEST_COST_DIAMONDS;
  st.collection[item.id] = (st.collection[item.id] || 0) + 1;
  db.chestLogs.unshift({
    requestId, studentNo: st.no, itemId: item.id, rarity: item.rarity,
    cost: CHEST_COST_DIAMONDS, at: Date.now()
  });
  saveDb();

  const owned = st.collection[item.id];
  res.json({
    ok: true,
    student: publicStudent(st, true),
    item,
    owned,
    duplicateOwned: owned > 1,
    message: owned > 1
      ? `抽到重複的「${item.name}」！已記錄為第 ${owned} 件收藏。`
      : `恭喜抽到「${item.name}」！已加入你的服飾收藏。`
  });
});

app.get('/api/chest/logs', requireStudent, (req, res) => {
  const st = myStudent(req.session);
  if (!st) return res.status(404).json({ ok: false, message: '找不到你的資料。' });
  res.json({
    ok: true,
    cost: CHEST_COST_DIAMONDS,
    logs: db.chestLogs.filter(l => l.studentNo === st.no).slice(0, 20).map(l => {
      const item = itemById(l.itemId);
      return {
        requestId: l.requestId, itemId: l.itemId, at: l.at,
        name: item ? item.name : l.itemId,
        rarity: l.rarity,
        slot: item ? item.slot : null
      };
    })
  });
});

/* ---------------- 登出與重設 ---------------- */
// 每次開啟／重新整理網頁時呼叫：回到身分選擇，需重新登入
app.post('/api/session/start', (req, res) => {
  const s = ensureSession(req, res);
  s.role = null;
  s.studentNo = null;
  if (RESET_IDENTITY_ON_LOAD) s.identity = null;
  saveDb();
  res.json({ ok: true, identity: s.identity, role: s.role });
});

app.post('/api/logout', (req, res) => {
  const s = currentSession(req);
  if (s) {
    s.role = null;
    s.studentNo = null;
    if (RESET_IDENTITY_ON_LOAD) s.identity = null;
    saveDb();
  }
  res.json({ ok: true });
});

app.post('/api/reset', (req, res) => {
  const code = String(req.body.code || '').trim();
  if (code !== RESET_CODE) return res.status(403).json({ ok: false, message: '重設代碼不正確。' });
  db = defaultDb();
  saveDb();
  res.setHeader('Set-Cookie', 'oc_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
  res.json({ ok: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`OC class 第三版已啟動： http://localhost:${PORT}`);
});
