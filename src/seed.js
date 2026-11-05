// 초기 데이터 (출력물 사진 기준, 2026-11-04)
// 의류 행: [NX, Yr, Brand, Color, Hood, Length, Fit, Pad, Pocket, 소재, 종류, Tg, 사용일(뒤에 * = 착용예정), 비활성]
const SEED_GROUPS = [
  { id: 'G1', name: 'Extra Heavy Weight', temp: '-20 ~ -6℃' },
  { id: 'G2', name: 'Heavy Weight', temp: '-9 ~ 0℃' },
  { id: 'G3', name: 'Mid Weight', temp: '-5 ~ 4℃' },
  { id: 'G4', name: 'Waterproof/Quilted/Light Weight', temp: '-1 ~ 8℃' },
  { id: 'G5', name: 'Suit/Coat', temp: '-3 ~ 6℃' },
  { id: 'G6', name: 'Trench Coat', temp: '5 ~ 14℃' },
];

const SEED_ITEMS = {
  G1: [
    ['', 19, 'Peuterey', 'Blue Navy', 'fur hood', 'long-length', 'Relax', 'Puffer', '2F+2Z', 'down', 'parka', 2, []],
    ['', 24, 'Peuterey', 'Navy', 'hood', 'long-length', 'Slim', 'Puffer', '2Z', 'down', 'parka', 3, []],
    ['New', 25, 'Peuterey', 'Mustard Yellow', 'hood', 'long-length', '', 'Puffer', '1Z+3F', 'down', 'parka', 3, []],
    ['', 21, 'Nobis', 'Black', 'fur hood', 'long-length', 'Slim', '', '2Z', 'down', 'parka', 2, []],
  ],
  G2: [
    ['Ex', 21, 'Nobis', 'Green', 'hood', '', 'Slim', '', '2F+2F', 'down', 'parka', 2, []],
    ['', 22, 'Peuterey', 'Navy', 'hood', 'long-length', 'Slim', 'small Puffer', '2Z', 'down', 'parka', 3, []],
    ['New', 26, 'Huit8', 'Black', 'hood', '', '', 'Puffer', '2Z', 'down', 'parka', 3, []],
    ['', 23, 'Peuterey', 'Navy', 'Hdn hood', '', 'Slim', '', '2F+2Z', 'down', 'safary', 3, []],
    ['Ex', 19, 'Canada Goose', 'Dark Brown', 'fur hood', '', 'Slim', '', '2F+2F', 'down', 'parka', 2, []],
    ['', 24, 'Peuterey', 'Hthrd Sky Blue', 'hood', '', '', 'small Puffer', '2Z', 'down', 'parka', 3, []],
    ['Ex', 21, 'Moncler', 'Black', 'hood', '', '', 'Puffer', '2Z', 'down', 'parka', 3, []],
    ['', 22, 'Moncler', 'Black', 'Lettered zip hood', '', '', 'Puffer', '2Z', 'down', 'parka', 3, []],
    ['New', 26, 'Moncler', 'Black', 'hood', 'long-length', '', 'small Puffer', '2Z', 'down', 'parka', 3, []],
    ['', 23, 'LuLu', 'Brown', 'hood', '', '', 'Puffer', '2Z', 'down', 'parka', 3, []],
    ['New', 25, 'Emporio Armani', 'Grey', 'Waist tied', 'long-length', '', '', '2S', 'down', 'coat', 3, []],
  ],
  G3: [
    ['', 22, 'Peuterey', 'Grey Navy', 'China collar', '', '', 'small Puffer', '2Z', 'Synth Down', 'jacket', 3, ['11/8*']],
    ['', 22, 'Peuterey', 'Dark Navy', 'hood', '', '', 'small Puffer', '2Z', 'Primaloft', 'parka', 3, []],
    ['New', 26, 'Zegna', 'Grey', 'High neck', 'Ribbed WstBnd', 'Overfit', '', '2S', 'Neoplan', 'Blouson', 3, []],
    ['New', 25, 'Zegna', 'Dark Navy', '', 'Ribbed WstBnd', 'Overfit', '', '2S', 'wool', 'Blouson', 3, []],
    ['New', 26, 'Zegna', 'Light Grey', 'hood', 'medium-length', '', '', '2S', 'Lt pad', 'parka', 3, []],
    ['', 21, 'Barbour', 'Navy', 'hood', 'long-length', 'Relax', '', '0+2S', 'Lt pad', 'parka', 3, []],
    ['', 23, 'ASOS', 'Black', 'Waist tied', 'medium-length', 'Slim', '', '2S', 'padded', 'coat', 3, []],
    ['Ex', 22, 'U+J', 'Navy', 'China collar', '', 'Slim', 'small Puffer', '2Z', 'down', 'jacket', 2, []],
    ['Ex', 22, 'Nobis', 'Hthrd Navy', 'shirt collar', 'Short-length', '', '', '1F+2S', 'down', 'jacket', 2, []],
    ['New', 25, 'Huit8', 'Light Beige', 'China collar', 'Short-length', '', '', '2Z', 'down', 'jacket', 3, []],
    ['', 23, 'Moncler', 'Black', 'hood', '', '', 'small Puffer', '0+2Z', 'down', 'parka', 3, []],
    ['', 24, 'Taion', 'Black', 'Packable', 'long-length', 'Relax', 'Box quilt', '0+2F', 'down', 'coat', 3, []],
    ['', 24, 'Taion', 'Dark Navy', 'hood', '', '', 'Puffer', '', 'padded', 'vest', 3, ['10/28']],
    ['New', 25, 'Zegna', 'Black', '', '', 'Overfit', 'Puffer', '1F+2S', 'padded', 'vest', 2, []],
    ['', 22, 'Barbour', 'Navy', '', '', '', 'Puffer', '2S', 'padded', 'vest', 3, []],
  ],
  G4: [
    ['', 23, 'Barbour', 'Black', 'Hdn hd', '', '', '', '2F+2F', 'lined', 'safary', 2, ['9/16', '9/21']],
    ['', 24, 'Dubetica', 'Beige', 'hood', 'medium-length', 'Relax', '', '2F+2F', 'waterproof', 'safary', 3, ['9/17', '9/18']],
    ['New', 26, 'Zegna', 'Denim', '', 'medium-length', '', '', '2', '', 'jacket', 2, ['10/5', '10/7', '10/10']],
    ['', 23, 'Nobis', 'White', 'hood', 'medium-length', 'Slim', '', '2F+2Z', 'shirts', 'safary', 3, ['10/11', '10/12']],
    ['Ex', 21, 'Emporio Armani', 'Navy', '', '', 'Slim', '', '2F', 'Lt pad', 'jacket', 1, ['10/20'], true],
    ['Ex', 22, 'Zegna', 'Navy', 'cordu collar', 'medium-length', '', 'oil look', '0+2F', 'lined', 'Chore Jckt', 3, ['10/22']],
    ['New', 26, 'Zegna', 'Greeny Black', '', '', '', '', '2Z', 'leather', 'jacket', 2, ['10/23', '10/25']],
    ['New', 26, 'Zegna', 'Dark Brown', 'shirt collar', 'medium-length', 'Overfit', '', '2F+2F', 'Lt pad', 'safary', 3, ['10/27', '10/28']],
    ['New', 26, 'E Seconds', 'Black', 'hood', '', 'Overfit', '', '2Z', 'leather', 'jacket', 2, ['10/29', '10/30']],
    ['', 22, 'Barbour Int.', 'Black', 'Viewforth', '', '', '', '2Z', 'Lt pad', 'jacket', 2, ['10/31']],
    ['New', 26, 'Zegna', 'Beige', 'Shirt collar', 'Ribbed WstBnd', 'Overfit', '', '2S', 'Texture', 'Blouson', 2, ['11/1']],
    ['', 22, 'Barbour', 'Black', 'Powell', '', 'Slim', 'X quilt', '2Z', 'Lt pad', 'jacket', 2, ['11/4']],
    ['', 22, 'Barbour', 'Beige', 'Hdn hd', '', 'Relax', '', '2F+2F', 'lined', 'safary', 1, ['11/5*']],
    ['New', 26, 'ASOS', 'Black', 'Shirt collar', '', 'Overfit', '', '2Z', 'leather', 'Chore Jckt', 2, []],
    ['', 18, 'BrooksBrothers', 'Brown', '', '', '', '', '2F+2F', 'leather', 'safary', 1, []],
    ['', 23, 'Parajumpers', 'Black', 'China collar', '', '', 'X quilt', '2Z', 'knit pad', 'jacket', 2, []],
  ],
  G5: [
    ['New', 26, 'Zegna', 'Brown', 'Suit', 'medium-length', '', '', '2S', 'wool', 'Suit', 2, ['9/7', '9/9', '9/10']],
    ['New', 26, 'Zegna', 'Pin Stripe', 'Suit', 'medium-length', '', '', '2S', 'wool', 'Suit', 2, ['10/14', '10/14', '10/15']],
    ['', 24, 'Theory', 'Dark Brown', '', 'long-length', 'Slim', '', '2S', 'wool', 'coat', 2, []],
    ['Ex', 22, 'Club Monaco', 'Black', 'pea coat', 'long-length', 'Slim', '', '2S', 'wool', 'coat', 2, []],
    ['', 22, 'Barbour', 'Hthrd Navy', 'cord collar', 'long-length', '', 'X quilt', '2', 'Lt pad', 'coat', 2, []],
    ['New', 25, 'Taion', 'Dark Olive', 'shirt collar', 'long-length', 'Slim', 'X quilt', '0+2F', 'down', 'coat', 3, []],
    ['', 24, 'Peuterey', 'Dark Navy', 'hood', 'long-length', 'Relax', 'Neoplan', '2Z', 'Padded', 'coat', 3, []],
    ['New', 26, 'Peuterey', 'Charcoal(Navy)', 'hood', 'long-length', 'Relax', '', '2Z', 'Padded', 'coat', 3, []],
    ['New', 26, 'Sandro', 'Black', 'hood', 'medium-length', 'Overfit', '', '2S', 'wool', 'parka', 2, []],
    ['New', 25, 'Zegna', 'Black', '', 'long-length', 'Overfit', '', '2S', 'wool', 'coat', 2, []],
  ],
  G6: [
    ['Ex', 22, 'Club Monaco', 'Grey', '', 'long-length', 'Slim', '', '0+2F', 'packable', 'trench', 3, ['4/30', '10/1', '10/6']],
    ['New', 26, 'Brave Soul', 'Black', 'pea coat', 'medium-length', '', '', '2S', 'Padded', 'trench', 3, ['11/2', '11/3']],
    ['New', 26, 'ASOS', 'Beige', '', 'long-length', 'Relax', '', '2S', 'Padded', 'trench', 2, []],
    ['New', 26, 'Uniqlo U', 'Grey White', 'hood', 'long-length', 'Relax', '', '2S', 'lined', 'Raincoat', 3, ['10/13']],
    ['', 23, 'Peuterey', 'Black', 'hood', 'long-length', '', '', '2Z', 'waterproof', 'Raincoat', 3, ['10/21']],
    ['New', 25, 'Top Man', 'Dark Navy', 'Overfit', 'long-length', 'Overfit', '', '2S', 'lined', 'Raincoat', 2, ['10/26']],
    ['New', 25, 'Top Man', 'Sage', 'Overfit', 'long-length', 'Overfit', '', '2S', 'lined', 'Raincoat', 2, []],
  ],
};

const SEED_COLORS = {
  'Black': '#111111', 'Navy': '#1c2a4a', 'Blue Navy': '#22407a', 'Dark Navy': '#141c30',
  'Grey Navy': '#4a5568', 'Hthrd Navy': '#3d4b66', 'Charcoal(Navy)': '#2e3440',
  'Mustard Yellow': '#d4a017', 'Green': '#5a8a3c', 'Dark Olive': '#4b5320', 'Sage': '#a3b48c',
  'Greeny Black': '#262e24', 'Hthrd Sky Blue': '#8db6d9', 'Denim': '#4f6f99',
  'Brown': '#8a5a3b', 'Dark Brown': '#4a2f1f',
  'Grey': '#8c8c8c', 'Light Grey': '#c9c9c9', 'Grey White': '#e3e3e0', 'White': '#f7f7f5',
  'Beige': '#d8c6a2', 'Light Beige': '#ece2c8', 'Pin Stripe': '#30343c',
};

// 시드 의류 행 → 앱 데이터 (사용일의 연도: 5~12월 → 2026, 1~4월 → 2027 단, 4/30처럼 시즌 전이면 2026)
function buildSeedDB() {
  const season = { id: 'FW2026', type: 'FW', name: 'FW 2026-27', start: '2026-09-14', end: '2027-04-11' };
  const db = {
    version: 1,
    seasons: [season],
    currentSeason: { FW: 'FW2026', SS: null },
    viewType: 'FW',
    groups: SEED_GROUPS.map((g, i) => ({ ...g, type: 'FW', order: i + 1 })),
    colors: Object.entries(SEED_COLORS).map(([name, hex]) => ({ name, hex })),
    items: [],
    usage: [],
    meta: { lastBackup: null, updated: new Date().toISOString() },
  };
  let n = 0, u = 0;
  for (const g of SEED_GROUPS) {
    for (const [i, r] of SEED_ITEMS[g.id].entries()) {
      const id = 'C' + String(++n).padStart(3, '0');
      db.items.push({
        id, type: 'FW', groupId: g.id, order: i + 1, active: !r[13], tg: r[11],
        nx: r[0], yr: r[1], brand: r[2], color: r[3], hood: r[4], length: r[5],
        fit: r[6], pad: r[7], pocket: r[8], material: r[9], kind: r[10], memo: '',
      });
      for (const d of r[12]) {
        const planned = d.endsWith('*');
        const [m, day] = d.replace('*', '').split('/').map(Number);
        const date = `2026-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        db.usage.push({ id: 'U' + String(++u).padStart(4, '0'), date, itemId: id, seasonId: 'FW2026', planned, memo: '' });
      }
    }
  }
  // 출력물의 줄임말을 원래 말로 (브라우저에서는 core.js 전역 함수, node에서는 require)
  (typeof normalizeTerms === 'function' ? normalizeTerms : require('./core.js').normalizeTerms)(db);
  return db;
}

// ---------- SS: 출력물 사진 기준 (2026-11-05). SS 2026 = 종료된 시즌(사용일 포함), SS 2027 = 준비중 ----------
// 올해 비활성이던 6벌은 사용자 요청으로 넣지 않음.
// 의류 행: [NX, Yr, Brand, Color, Hood, Length, Fit, Pad, Pocket, 소재, 종류, Tg, 사용일(2026)] + 다음 시즌 { tg, order, nx }
const SEED_SS_GROUPS = [
  { key: 'Summer', temp: '20 ~ 34℃' },
  { key: 'Spring', temp: '14 ~ 28℃' },
  { key: 'Jacket', temp: '14 ~ 28℃' },
];
const SEED_SS_ITEMS = {
  Summer: [
    [['', 23, 'Barbour', 'Black', 'Hdn hood', '', '', '', '2', 'Thin', 'safary', 3, ['6/1', '6/2', '6/3']], { tg: 3, order: 1, nx: '' }],
    [['', 24, 'Stone Island', 'Black', 'shirt collar', '', '', '', '2', 'Thin', 'safary', 3, ['5/20', '6/11', '6/16']], { tg: 3, order: 2, nx: '' }],
  ],
  Spring: [
    [['New', 26, 'Barbour', 'Mint', 'cordu collar', 'medium-length', '', '', '2', '', 'Chore Jckt', 3, ['9/6', '9/12', '9/13']], { tg: 3, order: 4, nx: 'New' }],
    [['New', 26, 'Muji', 'Black', 'cordu collar', 'medium-length', '', '', '2', 'waterproof', 'Chore Jckt', 3, ['4/26', '4/28', '4/29', '4/30']], { tg: 3, order: 6, nx: 'New' }],
    [['New', 26, 'Zegna', 'Black', 'hood', 'medium-length', '', '', '2', 'pleated', 'Blouson', 2, ['9/22', '9/25', '9/28']], { tg: 3, order: 2, nx: 'New' }],
    [['', 20, 'Wallass Barnes', 'Green', 'hood', 'medium-length', '', '', '4', '', 'jumper', 2, ['8/16', '9/2']], { tg: 2, order: 7, nx: 'Ex' }],
    [['New', 25, 'Barbour', 'Green', 'hood', 'medium-length', '', '', '4', '', 'jumper', 3, ['5/7', '5/9', '5/10']], { tg: 3, order: 8, nx: '' }],
    [['New', 25, 'Huit8', 'Black', 'hood', 'medium-length', '', '', '2', 'waterproof', 'jumper', 3, ['4/19', '4/20', '4/22']], { tg: 3, order: 5, nx: '' }],
    [['New', 26, 'Zegna', 'Navy', 'hood', 'Short-length', 'Overfit', '', '2', 'waterproof', 'jumper', 2, ['9/29', '9/30']], { tg: 3, order: 1, nx: 'New' }],
    [['New', 24, 'LuLu', 'Beige', 'hood', '', '', '', '3', 'waterproof', 'jumper', 5, ['5/2', '5/3', '5/5', '5/6', '9/8']], { tg: 4, order: 3, nx: '' }],
  ],
  Jacket: [
    [['', 22, 'Emporio Armani', 'Dark Green', 'hood', 'medium-length', '', '', '2', 'Thin', 'Blazer', 3, ['5/26', '6/5', '6/7']], { tg: 3, order: 1, nx: '' }],
    [['', 22, 'Peuterey', 'Beige Grey', '', 'medium-length', '', '', '2', '', 'Blazer', 3, ['5/15', '5/19', '9/3']], { tg: 3, order: 2, nx: '' }],
  ],
};
const SEED_SS_COLORS = { 'Mint': '#a9dcd0', 'Dark Green': '#2f4f3a', 'Beige Grey': '#bdb6a6' };

// 기존 db에 SS 2026(종료)·SS 2027(준비중)을 덧붙임. ID는 기존 것 뒤에 이어서.
// onEnded: SS 2026 값이 들어간 상태에서 호출(최종본 저장용). 그 뒤 의류 목표·순서·NX를 SS 2027 값으로 바꿈
function addSeedSS(db, onEnded) {
  const next = (prefix, arr, len) => { let n = Math.max(0, ...arr.map((x) => Number(String(x.id).slice(prefix.length)) || 0)); return () => prefix + String(++n).padStart(len, '0'); };
  const gId = next('G', db.groups, 1), cId = next('C', db.items, 3), uId = next('U', db.usage, 4);
  for (const s of [
    { id: 'SS2026', type: 'SS', name: 'SS 2026', start: '2026-05-01', end: '2026-09-30', status: 'ended' },
    { id: 'SS2027', type: 'SS', name: 'SS 2027', start: '2027-05-01', end: '2027-09-30', status: 'ready' },
  ]) if (!db.seasons.some((x) => x.id === s.id)) db.seasons.push(s);
  for (const [name, hex] of Object.entries(SEED_SS_COLORS)) if (!db.colors.some((c) => c.name === name)) db.colors.push({ name, hex });
  const nexts = [];
  for (const [gi, g] of SEED_SS_GROUPS.entries()) {
    const groupId = gId();
    db.groups.push({ id: groupId, type: 'SS', name: g.key, temp: g.temp, order: gi + 1 });
    for (const [i, [r, nx]] of SEED_SS_ITEMS[g.key].entries()) {
      const id = cId();
      const it = {
        id, type: 'SS', groupId, order: i + 1, active: true, tg: r[11],
        nx: r[0], yr: r[1], brand: r[2], color: r[3], hood: r[4], length: r[5],
        fit: r[6], pad: r[7], pocket: r[8], material: r[9], kind: r[10], memo: '',
      };
      db.items.push(it);
      nexts.push([it, nx]);
      for (const d of r[12]) {
        const [m, day] = d.split('/').map(Number);
        db.usage.push({ id: uId(), date: `2026-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`, itemId: id, seasonId: 'SS2026', planned: false, memo: '' });
      }
    }
  }
  (typeof normalizeTerms === 'function' ? normalizeTerms : require('./core.js').normalizeTerms)(db);
  if (onEnded) onEnded();
  for (const [it, nx] of nexts) Object.assign(it, nx);
}

if (typeof module !== 'undefined') module.exports = { buildSeedDB, addSeedSS };
