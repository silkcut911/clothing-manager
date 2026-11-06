// 공통 로직: 날짜, 집계, 엑셀 입출력 (앱과 node 스크립트에서 함께 사용)

const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayStr = () => ymd(new Date());
const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const weekday = (s) => WEEK[parseYmd(s).getDay()];

// 시즌 상태: active(진행중) / ready(준비중) / ended(종료, 잠김). 상태가 없던 예전 데이터는 현재 시즌만 진행중
const SEASON_STATUS = { active: '진행중', ready: '준비중', ended: '종료' };
function normalizeSeasons(db) {
  for (const s of db.seasons) if (!SEASON_STATUS[s.status]) s.status = db.currentSeason[s.type] === s.id ? 'active' : 'ended';
}

// 그룹 기온: 최저/최고 두 칸 → 한 칸(기온 · 추천월 자유 입력)
// 예전 줄임말 그룹명 → 원어 (이름이 정확히 같을 때만, 사용자 결정 2026-11-05)
const GROUP_NAMES = {
  'Extra-Hv': 'Extra Heavy Weight', 'Hv-Wt': 'Heavy Weight', 'Mid-Wt': 'Mid Weight',
  'Wt.Qlt.Lt': 'Waterproof/Quilted/Light Weight', 'Trch': 'Trench Coat',
};
function normalizeGroups(db) {
  for (const g of db.groups) {
    if (g.temp == null) g.temp = g.tmin != null && g.tmin !== '' ? `${g.tmin} ~ ${g.tmax}℃` : '';
    delete g.tmin; delete g.tmax;
    if (GROUP_NAMES[g.name]) g.name = GROUP_NAMES[g.name];
  }
}

// 사용일을 세는 기간 (고정, 사용자 결정 2026-11-05): FW = 그해 8/1 ~ 다음 해 6/30, SS = 그해 3/1 ~ 11/30
// 화면의 시즌 기간(start~end)은 경과율·예상 횟수에만 쓰고, 사용일이 어느 시즌인지는 옷의 구분 + 날짜로 정한다
const WINDOW_TEXT = { FW: '8월 ~ 다음 해 6월', SS: '3월 ~ 11월' };
function countWindow(type, year) {
  return type === 'FW' ? [`${year}-08-01`, `${year + 1}-06-30`] : [`${year}-03-01`, `${year}-11-30`];
}
// 날짜가 속하는 집계 연도. null = 그 구분 옷은 입을 수 없는 날 (FW 7월, SS 12~2월)
function windowYear(type, date) {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  if (type === 'FW') return m >= 8 ? y : m <= 6 ? y - 1 : null;
  return m >= 3 && m <= 11 ? y : null;
}
// 시즌의 집계 연도: FW는 시작일이 1~6월이면 전년도 시즌으로 봄
function seasonYear(s) {
  const y = Number(s.start.slice(0, 4)), m = Number(s.start.slice(5, 7));
  return s.type === 'FW' && m <= 6 ? y - 1 : y;
}
// 날짜가 속하는 시즌 ID ('' = 그 기간의 시즌이 아직 없음)
function seasonForDate(db, type, date) {
  const y = windowYear(type, date);
  return y == null ? '' : (db.seasons.find((s) => s.type === type && seasonYear(s) === y)?.id || '');
}
// 모든 사용일의 시즌을 날짜로 다시 정함 (시즌을 만들거나 기간을 고치면, 그 기간의 기록이 자연스럽게 들어감)
function relinkSeasons(db) {
  const typeOf = Object.fromEntries(db.items.map((i) => [i.id, i.type]));
  for (const u of db.usage) if (typeOf[u.itemId]) u.seasonId = seasonForDate(db, typeOf[u.itemId], u.date);
}

function seasonOf(db, type) {
  const id = db.currentSeason[type];
  return db.seasons.find((s) => s.id === id) || null;
}

function itemUsage(db, itemId) {
  return db.usage.filter((u) => u.itemId === itemId).sort((a, b) => b.date.localeCompare(a.date));
}

// 의류 한 벌의 현재 시즌 집계
function itemStats(db, item) {
  const sid = db.currentSeason[item.type];
  const all = itemUsage(db, item.id);
  const used = all.filter((u) => !u.planned && u.seasonId === sid);
  const planned = all.filter((u) => u.planned);
  const lastAll = all.find((u) => !u.planned);
  return {
    cur: used.length,
    achieved: used.length >= (item.tg || 0) && item.tg > 0,
    last: lastAll ? lastAll.date : null,
    planned,
    used,
  };
}

function groupStats(db, items) {
  let cur = 0, tg = 0, ach = 0;
  for (const it of items) {
    const s = itemStats(db, it);
    cur += s.cur; tg += it.tg || 0; if (s.achieved) ach++;
  }
  return { cur, tg, ach, n: items.length, pct: tg ? cur / tg : 0 };
}

// 시즌 경과율과 예상 사용 횟수
function seasonProgress(db, type, totalTg, today = todayStr()) {
  const s = seasonOf(db, type);
  if (!s) return null;
  const total = daysBetween(s.start, s.end);
  const ratio = total > 0 ? Math.min(1, Math.max(0, daysBetween(s.start, today) / total)) : 0;
  return { season: s, ratio, expected: Math.round(totalTg * ratio) };
}

// ---------- 옷 그림의 목 모양 ----------
// Hood 값마다 그림의 목 모양(hood 후드 / collar 칼라 / plain 일반)을 db.neck 에 둔다. 설정 → 속성 값 → Hood 에서 고름(사용자 결정 2026-11-06).
// 목록에 없는 값은 일반. 키는 소문자. 처음 값(db.neck 이 없을 때만 채움):
const NECK_DEFAULT = { 'hood': 'hood', 'fur hood': 'hood', 'lttrd z hd': 'hood', 'shirt cllr': 'collar', 'cord. cllr': 'collar', 'suit': 'collar' };
const NECK_NAME = { hood: '후드', collar: '칼라', plain: '일반' };
const neckKey = (v) => String(v || '').trim().toLowerCase();
function ensureNeck(db) { if (!db.neck) db.neck = { ...NECK_DEFAULT }; }

// ---------- 모델명 ----------
// 예전에는 모델명·특징 일부가 Hood 칸에 들어가 있었음 → 모델명 칸으로 옮김(사용자 결정 2026-11-06).
// 칼라 모양(High Neck 등)과 Suit는 Hood에 남김. 모델명이 이미 있으면 건드리지 않음(여러 번 실행해도 같음)
const HOOD_TO_MODEL = ['viewforth', 'powell', 'pea coat', 'packable', 'waist tied'];
function moveModels(db) {
  let n = 0;
  for (const it of db.items) {
    if (it.model == null) it.model = '';
    if (!it.model && HOOD_TO_MODEL.includes(String(it.hood || '').trim().toLowerCase())) { it.model = it.hood; it.hood = ''; n++; }
  }
  // Hood 값 목록에서도 빼기(쓰는 옷이 없을 때만)
  if (db.terms?.hood) db.terms.hood = db.terms.hood.filter((v) => !HOOD_TO_MODEL.includes(v.toLowerCase()) || db.items.some((i) => i.hood === v));
  return n;
}

// ---------- 엑셀 ----------
const ITEM_COLS = [
  ['ID', 'id'], ['시즌구분', 'type'], ['그룹ID', 'groupId'], ['그룹', null], ['순서', 'order'], ['활성', 'active'],
  ['Cur Us', null], ['Tg N.', 'tg'], ['NX', 'nx'], ['Yr', 'yr'], ['Brand', 'brand'], ['Color', 'color'], ['Model', 'model'],
  ['Hood', 'hood'], ['Length', 'length'], ['Fit', 'fit'], ['Pad', 'pad'], ['Pocket', 'pocket'],
  ['소재', 'material'], ['종류', 'kind'], ['메모', 'memo'], ['마지막사용일', null], ['이번시즌 사용일', null], ['착용예정', null],
];

// ---------- 표기 정리 (줄임말 통일, 단어마다 첫 글자 대문자) ----------
// 예전 표기(줄임/풀어쓴 말, 소문자로 비교) → 현재 표기
const TERMS = {
  brand: { 'barbour int.': 'Barbour I.', 'barbour international': 'Barbour I.', 'barbour intn.': 'Barbour I.', 'u+j': 'Uniqlo +J', 'brooksbrothers': 'Brooks B.', 'parajumpers': 'Parajumprs' },
  color: { 'hthrd sky blue': 'Hthr. Sky Blue', 'heathered sky blue': 'Hthr. Sky Blue', 'hthrd navy': 'Hthr. Navy', 'heathered navy': 'Hthr. Navy', 'charcoal(navy)': 'Chrcl Navy', 'charcoal navy': 'Chrcl Navy' },
  hood: {
    'hdn hd': 'Hdn hood', 'hidden hood': 'Hdn hood',
    'cordu collar': 'Cord. cllr', 'cord collar': 'Cord. cllr', 'corduroy collar': 'Cord. cllr',
    'shirt collar': 'Shirt cllr', 'china collar': 'China cllr',
    'lettered zip hood': 'Lttrd Z Hd', 'lttrd zip hood': 'Lttrd Z Hd', 'overfit': '',
  },
  length: {
    'ribbed wstbnd': 'Rbd waist', 'ribbed waistband': 'Rbd waist', 'rbd waistband': 'Rbd waist',
    'long-length': 'Long-ln', 'long-lgth': 'Long-ln', 'medium-length': 'Med-ln', 'medium-lgth': 'Med-ln', 'med-lgth': 'Med-ln',
    'short-length': 'Short-ln', 'short-lgth': 'Short-ln',
  },
  pad: { 'x quilt': 'Cross Qlt', 'small puffer': 'Small Pffr' },
  material: {
    'lt pad': 'Lt pad', 'light padding': 'Lt pad', 'knit padding': 'Knit pad', 'padded': 'Pad',
    'synth down': 'Synth. down', 'synthetic down': 'Synth. down',
  },
  kind: { 'chore jckt': 'Chore Jkt', 'chore jacket': 'Chore Jkt', 'safary': 'Safari' },
};
const TERMS_VERSION = 9;
// 브랜드 이름은 10자까지. 넘으면 뒷단어를 첫 글자로 (Emporio Armani → Emporio A.), 그래도 길면 잘라서 '.'
const BRAND_MAX = 10;
function shortBrand(v) {
  if (v.length <= BRAND_MAX) return v;
  const [first, ...rest] = v.split(/\s+/);
  const s = rest.length ? `${first} ${rest.map((w) => w[0].toUpperCase() + '.').join(' ')}` : v;
  return s.length <= BRAND_MAX ? s : s.slice(0, BRAND_MAX - 1).replace(/[.\s]+$/, '') + '.';
}
const CAP_FIELDS = ['hood', 'length', 'fit', 'pad', 'material', 'kind'];
// 선택 상자로 고르는 의류 속성 (값 목록을 db.terms 에 따로 관리)
const TERM_FIELDS = ['brand', 'hood', 'length', 'fit', 'pad', 'pocket', 'material', 'kind'];
// 단어마다(띄어쓰기, - 뒤) 첫 글자 대문자: "Hdn hood" → "Hdn Hood", "Long-lgth" → "Long-Lgth"
const capWords = (s) => (s ? s.replace(/(^|[\s-])(\p{Ll})/gu, (_, sep, c) => sep + c.toUpperCase()) : s);

function normalizeTerm(field, value) {
  let v = String(value ?? '').trim();
  const map = TERMS[field];
  if (map && Object.prototype.hasOwnProperty.call(map, v.toLowerCase())) v = map[v.toLowerCase()];
  // Pocket: "2 Flap + 2 Zip", "2F + 2Z" → "2F+2Z"
  if (field === 'pocket') v = v.replace(/(\d+)\s*(Flap|Zip|Slash|F|Z|S)\b/gi, (_, n, c) => n + c[0].toUpperCase()).replace(/\s*\+\s*/g, '+');
  if (field === 'pad') v = v.replace(/\bquilt\b/gi, 'Qlt'); // Cross Quilt → Cross Qlt
  if (CAP_FIELDS.includes(field)) v = capWords(v);
  if (field === 'brand') v = shortBrand(v);
  return v;
}
// 구입연도: 2자리로 저장 (2023 → 23)
const normalizeYr = (v) => (v === '' || v == null || isNaN(Number(v)) ? '' : Number(v) % 100);

// 의류에 쓰인 값을 속성 값 목록에 추가 (목록에만 있는 값은 남겨 둠)
function syncTerms(db) {
  db.terms ||= {};
  for (const f of TERM_FIELDS) {
    const list = (db.terms[f] ||= []);
    for (const it of db.items) if (it[f] && !list.includes(it[f])) list.push(it[f]);
  }
}

// 의류 속성, 속성 값 목록, 색상 마스터에 표기 정리 적용 (여러 번 적용해도 결과 같음)
function normalizeTerms(db) {
  for (const it of db.items) {
    for (const f of ['brand', 'color', 'pocket', ...CAP_FIELDS]) it[f] = normalizeTerm(f, it[f]);
    it.yr = normalizeYr(it.yr);
  }
  for (const f of Object.keys(db.terms || {})) db.terms[f] = [...new Set(db.terms[f].map((v) => normalizeTerm(f, v)).filter(Boolean))];
  syncTerms(db);
  const seen = new Set();
  db.colors = db.colors.filter((c) => {
    c.name = normalizeTerm('color', c.name);
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });
  db.termsVersion = TERMS_VERSION;
}

// 그룹마다 의류 순서를 1부터 빈틈없이 다시 매김 (순서 없는 의류는 뒤로)
function normalizeOrder(db) {
  const byGroup = {};
  for (const it of db.items) (byGroup[it.groupId] ||= []).push(it);
  for (const list of Object.values(byGroup)) {
    list.sort((a, b) => (Number(a.order) || 1e9) - (Number(b.order) || 1e9));
    list.forEach((it, i) => (it.order = i + 1));
  }
}

function dbToWorkbook(XLSX, db, kind = '') { // kind: 최신본 / 시즌최종본 (정보 시트에 적음)
  const gName = Object.fromEntries(db.groups.map((g) => [g.id, g.name]));
  const gOrder = Object.fromEntries(db.groups.map((g) => [g.id, g.order]));
  const sorted = [...db.items].sort((a, b) => a.type.localeCompare(b.type) || (gOrder[a.groupId] ?? 99) - (gOrder[b.groupId] ?? 99) || a.order - b.order);
  const items = sorted.map((it) => {
    const s = itemStats(db, it);
    const row = {};
    for (const [h, k] of ITEM_COLS) row[h] = k ? (it[k] ?? '') : '';
    row['그룹'] = gName[it.groupId] || '';
    row['활성'] = it.active ? 'Y' : 'N';
    row['Cur Us'] = s.cur;
    row['마지막사용일'] = s.last || '';
    row['이번시즌 사용일'] = s.used.map((u) => u.date.slice(5)).reverse().join(', ');
    row['착용예정'] = s.planned.map((u) => u.date.slice(5)).reverse().join(', ');
    return row;
  });
  const itemById = Object.fromEntries(db.items.map((i) => [i.id, i]));
  // 옷 정보는 의류목록에만 (의류ID로 연결)
  const usageRows = (type) => db.usage.filter((u) => (itemById[u.itemId] || {}).type === type).sort((a, b) => a.date.localeCompare(b.date)).map((u) => ({
    '기록ID': u.id, '사용일': u.date, '구분': u.planned ? '예정' : '실제', '의류ID': u.itemId,
    '메모': u.memo || '',
  }));
  const groups = db.groups.map((g) => ({ 'ID': g.id, '시즌구분': g.type, '그룹명': g.name, '기온·추천월': g.temp || '', '순서': g.order }));
  const colors = db.colors.map((c) => ({ '색상명': c.name, '색상코드': c.hex }));
  const seasons = db.seasons.map((s) => ({
    'ID': s.id, '구분': s.type, '이름': s.name, '시작일': s.start, '종료일': s.end,
    '현재': db.currentSeason[s.type] === s.id ? 'Y' : 'N', '상태': SEASON_STATUS[s.status] || '',
  }));
  const terms = TERM_FIELDS.flatMap((f) => (db.terms?.[f] || []).map((v) => ({ '항목': f, '값': v, '그림': f === 'hood' ? NECK_NAME[db.neck?.[neckKey(v)] || 'plain'] : '' })));
  const info = [
    ...(kind ? [{ '항목': '파일종류', '값': kind }] : []),
    { '항목': '저장일시', '값': new Date().toLocaleString('ko-KR') },
    { '항목': '형식버전', '값': db.version },
    { '항목': '안내', '값': '의류목록의 Cur Us/그룹/마지막사용일/사용일 열은 계산값이라 불러올 때 무시됩니다. 사용일 수정은 사용기록FW/사용기록SS 시트에서 하세요.' },
  ];

  const wb = XLSX.utils.book_new();
  const add = (name, rows, header, widths) => {
    const ws = XLSX.utils.json_to_sheet(rows, header ? { header } : undefined);
    if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  add('의류목록', items, ITEM_COLS.map((c) => c[0]),
    [6, 6, 6, 10, 4, 4, 6, 5, 5, 4, 14, 14, 14, 14, 13, 7, 11, 8, 10, 10, 12, 11, 24, 12]);
  for (const t of ['FW', 'SS']) add('사용기록' + t, usageRows(t), ['기록ID', '사용일', '구분', '의류ID', '메모'],
    [7, 11, 5, 6, 8, 16]);
  add('그룹', groups, ['ID', '시즌구분', '그룹명', '기온·추천월', '순서'], [5, 7, 12, 24, 5]);
  add('색상', colors, ['색상명', '색상코드'], [16, 10]);
  add('속성값', terms, ['항목', '값', '그림'], [10, 24, 6]); // 그림: Hood 값의 옷 그림 목 모양(후드/칼라/일반)
  add('시즌', seasons, ['ID', '구분', '이름', '시작일', '종료일', '현재', '상태'], [8, 5, 12, 11, 11, 5, 7]);
  add('정보', info, ['항목', '값'], [10, 80]);
  return wb;
}

// 엑셀 셀 값을 YYYY-MM-DD 로
function cellDate(v) {
  if (v instanceof Date) return ymd(v);
  if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400000)); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; }
  const s = String(v || '').trim().replace(/[./]/g, '-');
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? `${m[1]}-${pad2(m[2])}-${pad2(m[3])}` : '';
}

function workbookToDb(XLSX, wb) {
  const rows = (name) => {
    const ws = wb.Sheets[name];
    if (!ws) throw new Error(`'${name}' 시트가 없습니다.`);
    return XLSX.utils.sheet_to_json(ws, { defval: '' });
  };
  const str = (v) => String(v ?? '').trim();
  const num = (v, d = 0) => (v === '' || v == null || isNaN(Number(v)) ? d : Number(v));

  const seasons = rows('시즌').map((r) => ({
    id: str(r['ID']), type: str(r['구분']), name: str(r['이름']), start: cellDate(r['시작일']), end: cellDate(r['종료일']), cur: str(r['현재']) === 'Y',
    status: Object.keys(SEASON_STATUS).find((k) => SEASON_STATUS[k] === str(r['상태'])),
  })).filter((s) => s.id);
  const currentSeason = { FW: null, SS: null };
  for (const s of seasons) if (s.cur) currentSeason[s.type] = s.id;
  seasons.forEach((s) => delete s.cur);

  const groups = rows('그룹').map((r) => ({
    id: str(r['ID']), type: str(r['시즌구분']) || 'FW', name: str(r['그룹명']), order: num(r['순서']),
    // 예전 백업은 최저/최고기온 두 칸
    temp: '기온·추천월' in r ? str(r['기온·추천월']) : r['최저기온'] !== '' && r['최저기온'] != null ? `${r['최저기온']} ~ ${r['최고기온']}℃` : '',
  })).filter((g) => g.id);

  const colors = rows('색상').map((r) => ({ name: str(r['색상명']), hex: str(r['색상코드']) || '#888888' })).filter((c) => c.name);

  const items = rows('의류목록').map((r) => {
    const it = {};
    for (const [h, k] of ITEM_COLS) if (k) it[k] = str(r[h] ?? (h === 'Color' ? r['색상'] : undefined)); // 예전 엑셀은 '색상' 열
    it.active = it.active.toUpperCase() !== 'N';
    it.tg = num(it.tg);
    it.order = num(it.order, null);
    it.yr = normalizeYr(it.yr);
    it.type = it.type || 'FW';
    return it;
  }).filter((i) => i.id);
  normalizeOrder({ items });

  const ids = new Set(items.map((i) => i.id));
  // 사용기록FW·사용기록SS 두 시트 (예전 백업은 '사용기록' 한 시트)
  const usageSheets = ['사용기록FW', '사용기록SS'].filter((n) => wb.Sheets[n]);
  const usage = (usageSheets.length ? usageSheets : ['사용기록']).flatMap((n) => rows(n)).map((r) => ({
    id: str(r['기록ID']), date: cellDate(r['사용일']), itemId: str(r['의류ID']),
    planned: str(r['구분']) === '예정', memo: str(r['메모']),
  })).filter((u) => u.date && ids.has(u.itemId));
  // ID 없는 기록(엑셀에서 직접 추가한 줄)에 ID 부여. 시즌은 저장하지 않고 옷의 구분 + 날짜로 정함
  let maxU = Math.max(0, ...usage.map((u) => Number(u.id.slice(1)) || 0));
  const typeOf = Object.fromEntries(items.map((i) => [i.id, i.type]));
  for (const u of usage) {
    if (!u.id) u.id = 'U' + String(++maxU).padStart(4, '0');
    u.seasonId = seasonForDate({ seasons }, typeOf[u.itemId], u.date);
  }

  // 의류목록에 있지만 색상 시트에 없는 색은 회색으로 추가
  for (const it of items) if (it.color && !colors.find((c) => c.name === it.color)) colors.push({ name: it.color, hex: '#888888' });

  // 속성값 시트는 없어도 됨 (예전 백업) → 의류에 쓰인 값으로 채움
  const terms = {};
  let neck = null; // 예전 엑셀(그림 열 없음)이면 처음 값
  if (wb.Sheets['속성값']) for (const r of rows('속성값')) {
    const f = str(r['항목']), v = str(r['값']), pic = str(r['그림']);
    if (TERM_FIELDS.includes(f) && v) (terms[f] ||= []).push(v);
    const k = Object.keys(NECK_NAME).find((x) => NECK_NAME[x] === pic);
    if (f === 'hood' && v && k) { neck ||= {}; if (k !== 'plain') neck[neckKey(v)] = k; }
  }

  const db = {
    version: 1, seasons, currentSeason, viewType: 'FW', groups, colors, items, usage, terms, neck: neck || { ...NECK_DEFAULT },
    meta: { lastBackup: null, updated: new Date().toISOString() },
  };
  normalizeTerms(db);
  normalizeSeasons(db);
  return db;
}

if (typeof module !== 'undefined') {
  module.exports = { NECK_DEFAULT, NECK_NAME, neckKey, ensureNeck, moveModels, HOOD_TO_MODEL, countWindow, windowYear, seasonYear, seasonForDate, relinkSeasons, WINDOW_TEXT, todayStr, addDays, daysBetween, weekday, normalizeGroups, normalizeSeasons, SEASON_STATUS, normalizeOrder, normalizeTerm, normalizeTerms, normalizeYr, syncTerms, TERM_FIELDS, TERMS_VERSION, seasonOf, itemStats, groupStats, seasonProgress, dbToWorkbook, workbookToDb };
}
