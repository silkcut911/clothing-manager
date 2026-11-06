// 의류관리 앱 UI
const STORE_KEY = 'clothes-db-v1';
const $app = document.getElementById('app');
const $top = document.getElementById('top');
const $nav = document.getElementById('nav');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x) => Math.round(x * 100) + '%';
const md = (s) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;

let db, storageOK = true, seededNow = false;
let lastSavedJson = null; // 마지막으로 저장된 현재본 (이전본 만들 때 사용)

// ---------- 저장 ----------
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { lastSavedJson = raw; return JSON.parse(raw); }
  } catch (e) { storageOK = false; }
  seededNow = true;
  return buildSeedDB();
}
function save() {
  syncTerms(db);
  keepPrevVersion(lastSavedJson);
  db.meta.updated = new Date().toISOString();
  sortColors(db.colors);
  lastSavedJson = JSON.stringify(db);
  try { localStorage.setItem(STORE_KEY, lastSavedJson); storageOK = true; }
  catch (e) { storageOK = false; }
}
function checkStorage() {
  try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); } catch (e) { storageOK = false; }
}

// ---------- 공통 ----------
const groupById = (id) => db.groups.find((g) => g.id === id);
const itemById = (id) => db.items.find((i) => i.id === id);
const colorHex = (name) => (db.colors.find((c) => c.name === name) || {}).hex || '#888888';
const typeGroups = (type = db.viewType) => db.groups.filter((g) => g.type === type).sort((a, b) => a.order - b.order);
const groupItems = (gid) => db.items.filter((i) => i.groupId === gid).sort((a, b) => a.order - b.order);
const nextOrder = (gid) => Math.max(0, ...groupItems(gid).map((i) => i.order)) + 1;

// 그룹 소속 의류들의 이번 시즌 사용일(실제) + 착용예정, 날짜순
function groupDates(items) {
  const ids = new Set(items.map((i) => i.id));
  const sid = items[0] && db.currentSeason[items[0].type];
  return db.usage.filter((u) => ids.has(u.itemId) && (u.planned || u.seasonId === sid)).sort((a, b) => a.date.localeCompare(b.date));
}
const datesHtml = (list) => list.length
  ? `<div class="dates">${list.map((u) => (u.planned ? planSpan(u, 'p') : `<span>${md(u.date)}</span>`)).join('')}</div>`
  : '<div class="dates muted">사용일 없음</div>';
// 예정일 표시: 빨간색, 누르면 확정/변경/삭제 창 (날짜가 지난 예정일은 '!' 표시)
const planSpan = (u, cls = 'pl') => `<span class="${cls} pu" data-pu="${u.id}">${md(u.date)}${u.date <= todayStr() ? '!' : ''}</span>`;
function usageBar(st, ratio, dates) {
  return `<div class="row" style="margin-top:6px"><div class="grow"><div class="bar" style="margin:0"><i style="width:${Math.min(100, st.pct * 100)}%"></i>${ratio != null ? `<s style="left:${ratio * 100}%"></s>` : ''}</div></div>
    <span class="muted" style="white-space:nowrap"><b style="color:var(--text)">${st.cur}</b>/${st.tg}회 ${pct(st.pct)} · 달성 ${st.ach}/${st.n}</span></div>` + datesHtml(dates);
}
const nextId = (prefix, arr, len) => prefix + String(Math.max(0, ...arr.map((x) => Number(x.id.slice(prefix.length)) || 0)) + 1).padStart(len, '0');

function textOn(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) || 0);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111' : '#fff';
}
function chipStyle(item) {
  if (!item.active) return 'background:var(--chip-off);color:#bbb';
  const hex = colorHex(item.color);
  let bg = hex;
  if (/stripe/i.test(item.color)) bg = `repeating-linear-gradient(90deg, ${hex} 0 5px, #cfd3da 5px 6px)`;
  return `background:${bg};color:${textOn(hex)}`;
}
// 옷 모양(색 상자): Length로 정하고, 빈칸이면 종류로 짐작 (데이터는 바꾸지 않음)
function shapeOf(it) {
  const ln = it.length || '', k = it.kind || '';
  if (/long/i.test(ln)) return 'long';
  if (/rbd|waist/i.test(ln)) return 'waist'; // 허리줄은 웨이스트밴드일 때만
  if (/short/i.test(ln)) return 'short';
  if (/med/i.test(ln)) return 'medium';
  if (/coat|trench/i.test(k)) return 'long';
  if (/blouson/i.test(k)) return 'short';
  return 'medium';
}
const chip = (item, cls = '', label = '') => `<span class="chipw"><span class="chip ${cls} shp-${shapeOf(item)}" style="${chipStyle(item)}">${label}</span></span>`;
const badges = (it) =>
  (it.nx === 'New' ? '<span class="badge b-new">New</span>' : '') +
  (it.nx === 'Ex' ? '<span class="badge b-ex">처분예정</span>' : '') +
  (!it.active ? '<span class="badge b-off">비활성</span>' : '');
const itemTitle = (it) => `${esc(it.brand)} · ${esc(it.color)}`;
// 구입연도 표시: 2자리 (5 → 05)
const yr2 = (yr) => (yr !== '' && yr != null ? String(yr).padStart(2, '0') : '');
const itemSub = (it) => [it.kind, it.material, yr2(it.yr)].filter(Boolean).map(esc).join(' · ');
// 의류를 구별할 수 있도록 모든 속성을 한 줄로
const specLine = (it) => [it.kind, it.hood, it.length, it.fit, it.pad, it.pocket, it.material, yr2(it.yr)]
  .filter(Boolean).map(esc).join(' · ');
// 말하듯 읽히는 한 줄 이름: "Barbour Black Hdn hd medium-length lined safary"
// 의류 목록 표: 4칸 × 2줄(윗줄/아랫줄)로 항목마다 위치와 굵기 고정 (Brand·종류만 굵게), 빈 값도 자리 유지.
// 칸 폭은 표가 내용에 맞춰 정하므로 단어 중간에서 줄이 바뀌지 않음
// 윗줄(굵게): Brand · Pad · Hood · Type · Pocket / 아랫줄: 색상 · Fit · Material · 모델명 · Dates
// (구입연도는 상세 화면에만. Length는 카드에서 숨김 — 옷 그림 모양으로 보이고, 상세·전체표·엑셀에는 있음)
const COLS = [[['brand', 'Brand', 1], ['color', 'Color']], [['pad', 'Pad', 1], ['fit', 'Fit']], [['hood', 'Hood', 1], ['material', 'Material']], [['kind', 'Type', 1], ['model', 'Model']], [['pocket', 'Pocket'], ['dates', 'Dates']]];
// 사용일 짧게: 같은 달이면 월은 처음 한 번만 (9/16,21 · 9/30,10/1,6). 예정일은 빨간색, 누르면 예정일 창
function shortDates(list) {
  let pm = '';
  return list.map((u) => {
    const m = u.date.slice(5, 7);
    const t = (m === pm ? '' : Number(m) + '/') + Number(u.date.slice(8));
    pm = m;
    return u.planned ? `<span class="pl pu" data-pu="${u.id}">${t}${u.date <= todayStr() ? '!' : ''}</span>` : t;
  }).join(',<wbr>'); // 칸이 모자랄 때만 쉼표 뒤에서 줄바꿈
}
const itemDates = (it, s = itemStats(db, it)) => shortDates([...s.used, ...s.planned].sort((a, b) => a.date.localeCompare(b.date)));
const cellHtml = (it, k) => (k === 'dates' ? itemDates(it) : esc(it[k] || ''));
// 한 줄로 유지하는 항목 (Brand·색상·Pad·소재·사용일은 칸이 모자라면 줄바꿈)
const NOWRAP = new Set(['fit', 'hood', 'length', 'kind', 'pocket', 'model']);
// 색 상자 안 표시: N(New), Ex(처분예정), Off(비활성)
const chipLabel = (it) => (!it.active ? 'Off' : it.nx === 'Ex' ? 'Ex' : it.nx === 'New' ? 'N' : '');
// opts: rowAttr(it, x) → 행 속성, sub(it, x) → 아래 작은 줄(없으면 생략), right(it, x) → 오른쪽 칸, rowClass(it, x), headRight
function itemTable(list, { rowAttr = () => '', sub = () => '', right = () => '', rowClass = () => '', headRight = '' } = {}) {
  let t = `<table class="ctbl"><thead><tr><th></th>${COLS.map((pair) => `<th>${pair.map(([, l]) => l).join('<br>')}</th>`).join('')}<th class="rt">${headRight}</th></tr></thead><tbody>`;
  for (const x of list) {
    const it = x.it || x;
    const attr = rowAttr(it, x), cls = rowClass(it, x);
    const subHtml = sub(it, x); // 비어 있으면 아랫줄 생략
    const rs = subHtml ? 2 : 1;
    t += `<tr class="r1 ${cls} ${subHtml ? '' : 'nosub'}" ${attr}><td class="cc" rowspan="${rs}">${chip(it, 'xs', chipLabel(it))}</td>${COLS.map((pair) => `<td>${pair.map(([k, , b]) => `<div class="${b ? 'w7' : ''}${k === 'dates' ? ' dts' : ''}${NOWRAP.has(k) ? ' nw' : ''}">${cellHtml(it, k) || '&nbsp;'}</div>`).join('')}</td>`).join('')}<td class="rt" rowspan="${rs}">${right(it, x)}</td></tr>` +
      (subHtml ? `<tr class="r2 ${cls}" ${attr}><td colspan="${COLS.length}">${subHtml}</td></tr>` : '');
  }
  return t + '</tbody></table>';
}

// 색상 정렬: 무채색(하양 → 회색 → 검정) 다음 유채색을 색상환 순서(빨주노초파남보)로
function hexHsl(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16) || 0;
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}
function colorSortKey(hex) {
  const { h, s, l } = hexHsl(hex);
  if (s < 0.15 || l < 0.1 || l > 0.94) return 1 - l; // 무채색: 밝은 것부터 (0~1)
  return 1 + (h >= 345 ? h - 360 : h) / 360 + 0.0001 * (1 - l); // 유채색: 빨강(0°)부터 보라까지
}
const sortColors = (list) => list.sort((a, b) => colorSortKey(a.hex) - colorSortKey(b.hex) || a.name.localeCompare(b.name));

let toastTimer;
function toast(msg, undoFn) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(msg)}</span>` + (undoFn ? '<button>되돌리기</button>' : '');
  if (undoFn) el.querySelector('button').onclick = () => { undoFn(); el.remove(); };
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 4000);
}

function modal(html, onMount, onClose) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">${html}</div>`;
  bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
  document.body.appendChild(bg);
  function close() { bg.remove(); onClose?.(); }
  onMount?.(bg.querySelector('.modal'), close);
  return close;
}

// 그 구분 옷을 입을 수 있는 날인지 (FW 8월~다음 해 6월, SS 3월~11월). 아니면 안내하고 false
function okDate(it, date) {
  if (windowYear(it.type, date) != null) return true;
  alert(`${it.type} 옷은 ${WINDOW_TEXT[it.type]}에만 기록할 수 있습니다.\n(${md(date)}은 ${it.type} 기간이 아닙니다)`);
  return false;
}

// 사용 기록 추가. 시즌은 날짜로 정함(그 기간의 시즌이 없으면 시즌 없이 기록 → 시즌을 만들면 자동으로 들어감). 같은 날 중복이면 경고 후 허용
function addUsage(itemId, date, { planned = date > todayStr(), memo = '', silent = false } = {}) {
  const it = itemById(itemId);
  if (!okDate(it, date)) return null;
  const sid = seasonForDate(db, it.type, date);
  if (db.usage.some((u) => u.itemId === itemId && u.date === date)) {
    if (!confirm(`⚠ ${it.brand} ${it.color}은(는) ${md(date)}에 이미 기록되어 있습니다.\n한 번 더 기록할까요?`)) return null;
  }
  const u = { id: nextId('U', db.usage, 4), date, itemId, seasonId: sid, planned, memo };
  db.usage.push(u);
  syncFinal(u); // 지난(종료된) 시즌 날짜면 그 최종본에도
  save();
  if (!silent) toast(`${md(date)} ${u.planned ? '계획' : '실제'} 기록: ${it.brand} ${it.color}`, () => { removeUsage(u.id); render(); });
  return u;
}

// 사용일 추가 창: 날짜와 실제/계획을 고른 뒤 저장
function askUsage(itemId, date = todayStr()) {
  const it = itemById(itemId);
  const kindOf = (d) => (d > todayStr() ? 'plan' : 'real');
  modal(`<h2>사용일 추가</h2>
    <div class="row" style="margin-bottom:10px">${chip(it, 'sm')}<div class="grow"><b>${esc(it.brand)}</b> · ${esc(it.color)} · <b>${esc(it.kind)}</b><div class="muted">${specLine(it)}</div></div></div>
    <form class="form" id="uf">
      <label>날짜</label><input type="date" name="date" value="${date}" required>
      <label>구분</label>
      <div class="seg2"><button type="button" data-k="real">실제 착용</button><button type="button" data-k="plan">계획 (착용예정)</button></div>
      <div class="muted" id="ukHint" style="margin-top:6px"></div>
      <label>메모 (선택)</label><input name="memo" placeholder="행사, 날씨 등">
      <div class="row" style="margin-top:14px"><span class="grow"></span><button type="button" class="btn" id="ucancel">취소</button><button class="btn pri">저장</button></div>
    </form>`, (m, close) => {
    const f = m.querySelector('#uf');
    let kind = kindOf(date);
    const paint = () => {
      m.querySelectorAll('[data-k]').forEach((b) => b.classList.toggle('on', b.dataset.k === kind));
      const d = f.date.value, today = todayStr();
      m.querySelector('#ukHint').textContent =
        kind === 'plan' && d <= today ? '⚠ 계획은 내일 이후 날짜만 가능합니다.' :
        kind === 'real' && d > today ? '⚠ 실제 착용은 오늘까지의 날짜만 가능합니다.' :
        kind === 'plan' ? '빨간 날짜로 표시됩니다. 그날 입으면 날짜를 눌러 실제로 확정하세요.' : '';
    };
    m.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { kind = b.dataset.k; paint(); }));
    f.date.onchange = () => { kind = kindOf(f.date.value); paint(); };
    paint();
    m.querySelector('#ucancel').onclick = close;
    f.onsubmit = (e) => {
      e.preventDefault();
      const d = f.date.value, today = todayStr();
      if (!d) return;
      if (kind === 'plan' && d <= today) return alert('계획은 내일 이후 날짜만 가능합니다.');
      if (kind === 'real' && d > today) return alert('실제 착용은 오늘까지의 날짜만 가능합니다.');
      if (addUsage(itemId, d, { planned: kind === 'plan', memo: f.memo.value.trim() })) { close(); render(); }
    };
  });
}
function removeUsage(uid) {
  const u0 = db.usage.find((u) => u.id === uid);
  db.usage = db.usage.filter((u) => u.id !== uid);
  syncFinal(u0, true); // 지난 시즌 기록이면 최종본에서도 지움
  save();
}

// 사용일 관리 창 (전체 표의 사용일 칸): 날짜 추가, 계획 → 실제 변경, 삭제
function manageDates(itemId) {
  const it = itemById(itemId);
  const sid = db.currentSeason[it.type];
  const restore = keepScroll();
  let toReal = null; // 실제로 바꾸는 중인 기록 ID
  const close = modal('<div id="dm"></div>', (m, close) => {
    const paint = () => {
      const list = db.usage.filter((u) => u.itemId === itemId && (u.planned || u.seasonId === sid)).sort((a, b) => a.date.localeCompare(b.date));
      m.querySelector('#dm').innerHTML = `<h2>사용일</h2>
        <div class="row" style="margin-bottom:8px">${chip(it, 'sm')}<div class="grow"><b>${esc(it.brand)}</b> · ${esc(it.color)} · <b>${esc(it.kind)}</b><div class="muted">${specLine(it)}</div></div></div>
        ${list.length ? list.map((u) => `<div class="list-date">
          <span class="grow">${md(u.date)} (${weekday(u.date)}) <span class="badge ${u.planned ? 'b-plan' : 'b-new'}">${u.planned ? '계획' : '실제'}</span>${u.memo ? `<div class="muted">${esc(u.memo)}</div>` : ''}</span>
          ${toReal === u.id
            ? `<input type="date" id="rd" value="${u.date <= todayStr() ? u.date : todayStr()}" max="${todayStr()}" style="width:140px"><button class="btn sm pri" data-ok="${u.id}">확인</button>`
            : `${u.planned ? `<button class="btn sm" data-real="${u.id}">실제로 변경</button>` : ''}<button class="btn sm danger" data-del="${u.id}">삭제</button>`}
          </div>`).join('') : '<div class="muted">이번 시즌 사용일 없음</div>'}
        ${toReal ? '<div class="muted" style="margin-top:6px">실제로 입은 날짜를 고르세요 (오늘까지)</div>' : ''}
        <div class="row" style="margin-top:14px">${it.active ? '<button class="btn pri" id="dmAdd">+ 날짜 추가</button>' : ''}<span class="grow"></span><button class="btn" id="dmClose">닫기</button></div>`;
      m.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
        const u = db.usage.find((x) => x.id === b.dataset.del);
        if (confirm(`${md(u.date)} ${u.planned ? '계획' : '실제'} 기록을 삭제할까요?`)) { removeUsage(u.id); paint(); }
      }));
      m.querySelectorAll('[data-real]').forEach((b) => (b.onclick = () => { toReal = b.dataset.real; paint(); }));
      m.querySelector('[data-ok]')?.addEventListener('click', () => {
        const u = db.usage.find((x) => x.id === toReal);
        const d = m.querySelector('#rd').value;
        if (!d) return;
        if (d > todayStr()) return alert('실제 착용은 오늘까지의 날짜만 가능합니다.');
        if (!okDate(it, d)) return;
        if (db.usage.some((x) => x !== u && x.itemId === itemId && x.date === d) && !confirm(`⚠ ${md(d)}에 이미 기록되어 있습니다.
한 번 더 기록할까요?`)) return;
        Object.assign(u, { date: d, planned: false, seasonId: seasonForDate(db, it.type, d) });
        syncFinal(u);
        save(); toReal = null; paint();
        toast(`${md(d)} 실제 착용으로 변경: ${it.brand} ${it.color}`);
      });
      m.querySelector('#dmAdd')?.addEventListener('click', () => { close(); askUsage(itemId); });
      m.querySelector('#dmClose').onclick = close;
    };
    paint();
  }, restore);
}

// 화면을 다시 그린 뒤 보던 위치(위아래, 표 좌우)로 돌아가는 함수를 돌려줌
function keepScroll() {
  const y = scrollY, x = document.querySelector('.tblwrap')?.scrollLeft || 0;
  return () => {
    render();
    const t = document.querySelector('.tblwrap');
    if (t) t.scrollLeft = x;
    window.scrollTo(0, y);
  };
}

// 예정일 창: 실제로 확정(날짜 선택), 예정일 변경, 삭제. 예정일은 날짜가 지나도 자동으로 바뀌지 않음
function planAction(uid) {
  const u = db.usage.find((x) => x.id === uid);
  if (!u) return;
  const it = itemById(u.itemId);
  const today = todayStr();
  const past = u.date <= today;
  modal(`<h2>착용예정 ${md(u.date)} (${weekday(u.date)})${past ? ' <span class="badge b-plan">확인 필요</span>' : ''}</h2>
    <div class="row" style="margin-bottom:10px">${chip(it, 'sm')}<div class="grow"><b>${esc(it.brand)}</b> · ${esc(it.color)} · <b>${esc(it.kind)}</b><div class="muted">${specLine(it)}</div></div></div>
    ${u.memo ? `<div class="muted" style="margin-bottom:8px">메모: ${esc(u.memo)}</div>` : ''}
    <div class="form">
      <label>실제로 입은 날짜 (오늘까지)</label>
      <div class="row"><input type="date" id="paReal" value="${past ? u.date : today}" max="${today}" style="flex:1"><button class="btn pri" id="paOk">실제로 확정</button></div>
      <label>예정일 바꾸기 (내일 이후)</label>
      <div class="row"><input type="date" id="paPlan" value="${past ? addDays(today, 1) : u.date}" min="${addDays(today, 1)}" style="flex:1"><button class="btn" id="paMove">예정일 변경</button></div>
    </div>
    <div class="row" style="margin-top:16px"><button class="btn danger" id="paDel">예정 삭제</button><span class="grow"></span><button class="btn" id="paClose">닫기</button></div>`, (m, close) => {
    m.querySelector('#paClose').onclick = close;
    m.querySelector('#paOk').onclick = () => {
      const d = m.querySelector('#paReal').value;
      if (!d) return;
      if (d > todayStr()) return alert('실제 착용은 오늘까지의 날짜만 가능합니다.');
      if (!okDate(it, d)) return;
      if (db.usage.some((x) => x !== u && x.itemId === u.itemId && x.date === d) && !confirm(`⚠ ${it.brand} ${it.color}은(는) ${md(d)}에 이미 기록되어 있습니다.\n한 번 더 기록할까요?`)) return;
      Object.assign(u, { date: d, planned: false, seasonId: seasonForDate(db, it.type, d) });
      syncFinal(u);
      save(); close();
      toast(`${md(d)} 실제 착용으로 확정: ${it.brand} ${it.color}`);
    };
    m.querySelector('#paMove').onclick = () => {
      const d = m.querySelector('#paPlan').value;
      if (!d || d <= todayStr()) return alert('예정일은 내일 이후 날짜만 가능합니다.');
      if (!okDate(it, d)) return;
      Object.assign(u, { date: d, seasonId: seasonForDate(db, it.type, d) }); save(); close();
      toast(`예정일 변경: ${md(d)} ${it.brand} ${it.color}`);
    };
    m.querySelector('#paDel').onclick = () => {
      if (!confirm(`${md(u.date)} 착용예정을 삭제할까요?`)) return;
      removeUsage(u.id); close();
    };
  }, keepScroll());
}
// 빨간 예정일을 누르면 어느 화면에서든 예정일 창 (행/카드 이동보다 먼저 처리)
document.addEventListener('click', (e) => {
  const p = e.target.closest('[data-pu]');
  if (!p) return;
  e.preventDefault(); e.stopPropagation();
  planAction(p.dataset.pu);
}, true);

// ---------- 라우팅 ----------
function go(hash) { location.hash = hash; }
window.addEventListener('hashchange', render);

function setTop({ title, back, seg, brand }) {
  $top.innerHTML =
    (back ? '<button class="back" id="backBtn" aria-label="뒤로">‹</button>' : '') +
    `<h1${brand ? ' class="brand"' : ''}>${esc(title)}</h1>` +
    (seg ? `<div class="seg">${['FW', 'SS'].map((t) => `<button data-t="${t}" class="${db.viewType === t ? 'on' : ''}">${t}</button>`).join('')}</div>` : '');
  if (back) document.getElementById('backBtn').onclick = () => (history.length > 1 ? history.back() : go('#/'));
  $top.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => { db.viewType = b.dataset.t; save(); render(); }));
}
function setNav(active) {
  const tabs = [['#/', '⌂', '홈', 'home'], ['#/day', '✎', '날짜기록', 'day'], ['#/cal', '▦', '달력', 'cal'], ['#/settings', '⚙', '설정', 'settings']];
  $nav.innerHTML = tabs.map(([h, ic, t, k]) => `<a href="${h}" class="${active === k ? 'on' : ''}"><b>${ic}</b>${t}</a>`).join('');
}

function render() {
  document.querySelector('.fab')?.remove();
  const [, view, arg] = (location.hash || '#/').split('/');
  const views = { '': viewHome, group: viewGroup, item: viewItem, day: viewDay, cal: viewCal, settings: viewSettings, end: viewEnd, past: viewPast };
  (views[view] || viewHome)(arg ? decodeURIComponent(arg) : undefined);
  window.scrollTo(0, 0);
}

// ---------- 홈 ----------
function viewHome() {
  setTop({ title: 'Silk Wardrobe', seg: true, brand: true }); // 앱 이름: 대문자 + 넓은 자간(사용자 결정 C안)
  setNav('home');
  const type = db.viewType;
  const groups = typeGroups(type);
  const allItems = db.items.filter((i) => i.type === type);
  const tot = groupStats(db, allItems);
  const prog = seasonProgress(db, type, tot.tg);
  // 순서: 자동저장 경고 → 착용예정 → 그룹별/전체 표 → 시즌 통계 → 백업 알림
  let h = banners('top');
  let stats = '';
  if (!prog) {
    h += `<div class="card"><div class="title">${type} 진행중인 시즌이 없습니다</div><p class="muted">설정 → ${type} 시즌에서 새 시즌을 만들고 시작하세요. 지난 시즌은 [지난 시즌 보기]로 볼 수 있습니다.</p><a class="btn pri" href="#/settings">설정으로</a></div>`;
  } else {
    const s = prog.season;
    stats = `<div class="section-t">시즌 통계</div><div class="card">
      <div class="row"><div class="grow"><div class="title">${esc(s.name)}</div><div class="muted">${s.start} ~ ${s.end} · 경과 ${pct(prog.ratio)}</div></div></div>
      <div class="stat3" style="margin-top:10px">
        <div><b>${tot.cur}<span class="muted">/${tot.tg}</span></b><span class="muted">사용 ${pct(tot.pct)}</span></div>
        <div><b>${prog.expected}</b><span class="muted">예상 횟수</span></div>
        <div><b>${tot.ach}<span class="muted">/${tot.n}</span></b><span class="muted">목표달성</span></div>
      </div>
      <div class="bar"><i style="width:${Math.min(100, tot.pct * 100)}%"></i><s style="left:${prog.ratio * 100}%"></s></div>
      <div class="muted" style="margin-top:4px">막대 = 사용률, 주황선 = 예상(경과율)</div>
    </div>`;
  }

  const upcoming = db.usage.filter((u) => u.planned && itemById(u.itemId)?.type === type).sort((a, b) => a.date.localeCompare(b.date));
  if (upcoming.length) {
    const due = upcoming.filter((u) => u.date <= todayStr()).length;
    h += `<div class="section-t">착용예정${due ? ` <span class="badge b-plan">확인 필요 ${due}건 · 눌러서 의류 화면에서 확정</span>` : ''}</div><div class="card">` + upcoming.map((u) => {
      const it = itemById(u.itemId);
      // 한 줄: 색 상자 · Brand · Type · Pad · Hood · Length · Fit · Pocket · Material(들어가는 만큼, 넘치면 …) · 사용횟수/목표 · 날짜.
      // 색상 글자는 넣지 않음(색 상자로 봄). 누르면 의류 화면(거기서 빨간 예정일을 눌러 확정)
      const spec = [it.kind, it.pad, it.hood, it.length, it.fit, it.pocket, it.material].filter(Boolean).map(esc).join(' · ');
      return `<a class="list-date plan1" href="#/item/${it.id}">${chip(it, 'sm')}<span class="grow ell"><b>${esc(it.brand)}</b>${spec ? ' · ' + spec : ''}</span><span class="pc">${itemStats(db, it).cur}/${it.tg}</span><span class="badge b-plan">${md(u.date)} (${weekday(u.date)})${u.date < todayStr() ? ' 지남' : u.date === todayStr() ? ' 오늘' : ''}</span></a>`;
    }).join('') + `</div>`;
  }

  h += lastYearHtml(todayStr(), type, '작년 오늘');

  const mode = db.homeMode === 'table' ? 'table' : 'group';
  h += `<div class="row" style="margin:14px 2px 6px"><span class="section-t grow" style="margin:0">${mode === 'table' ? '전체 표' : '그룹'}</span>
    <div class="seg2 sm"><button data-mode="group" class="${mode === 'group' ? 'on' : ''}">그룹별</button><button data-mode="table" class="${mode === 'table' ? 'on' : ''}">전체 표</button></div></div>`;
  if (mode === 'table') h += homeTable(groups);
  else {
    for (const g of groups) {
      const items = groupItems(g.id);
      const st = groupStats(db, items);
      h += `<div class="gcard" data-g="${g.id}">
        <div class="row"><span class="name grow">${esc(g.name)}</span><span class="muted">${tempLabel(g)} · ${st.n}벌 ›</span></div>
        <div class="boxes">${items.map((it) => `<i class="shp-${shapeOf(it)}" style="${chipStyle(it)}" title="${esc(it.brand + ' ' + it.color)}"></i>`).join('')}</div>
        ${usageBar(st, prog?.ratio, groupDates(items))}
      </div>`;
    }
  }
  if (!groups.length && prog) h += `<div class="empty">그룹이 없습니다. 설정에서 그룹을 추가하세요.</div>`;
  const lastFinal = finalsOf(type)[0];
  if (lastFinal) stats += `<button class="btn block" onclick="go('#/past/${lastFinal.id}')" style="margin-bottom:10px">지난 시즌 보기 (${esc(lastFinal.seasonName)})</button>`;
  h += stats + banners('bottom');
  $app.innerHTML = h;
  $app.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => go('#/group/' + b.dataset.g)));
  $app.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { db.homeMode = b.dataset.mode; save(); render(); }));
  $app.querySelectorAll('tr[data-i]').forEach((tr) => (tr.onclick = (e) => {
    const dm = e.target.closest('[data-dm]');
    dm ? manageDates(dm.dataset.dm) : go('#/item/' + tr.dataset.i);
  }));
  bindBanners();
  if (groups.length) {
    const fab = document.createElement('button');
    fab.className = 'btn pri fab';
    fab.textContent = '+ 의류 추가';
    fab.onclick = () => editItem(null);
    document.body.appendChild(fab);
  }
}
// 출력물과 같은 형식의 전체 표: 그룹 머리줄(집계) + 의류 행(옷 색으로 칠함) + 사용일 열
function homeTable(groups) {
  const cols = ['Cur', 'Tg', 'NX', 'Yr', 'Brand', 'Color', 'Model', 'Hood', 'Length', 'Fit', 'Pad', 'Pocket', 'Material', 'Type', '달성', 'Dates'];
  let t = `<div class="tblwrap"><table class="sheet"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>`;
  for (const g of groups) {
    const items = groupItems(g.id);
    const st = groupStats(db, items);
    t += `<tr class="ghead" data-g="${g.id}"><td colspan="${cols.length}"><b>${esc(g.name)}</b> <span class="muted">${tempLabel(g)}</span>
      <span class="gst">사용 <b>${st.cur}</b>/${st.tg} (${pct(st.pct)}) · 달성 <b>${st.ach}</b>/${st.n} (${pct(st.n ? st.ach / st.n : 0)})</span></td></tr>`;
    for (const it of items) {
      const s = itemStats(db, it);
      const hex = colorHex(it.color);
      const rowBg = it.active ? `color-mix(in srgb, ${hex} 22%, var(--card))` : '#3a3a3a';
      const strong = it.active ? `background:${hex};color:${textOn(hex)}` : 'background:#2c2c2c;color:#aaa';
      const dates = [...s.used, ...s.planned].sort((a, b) => a.date.localeCompare(b.date))
        .map((u) => (u.planned ? planSpan(u) : md(u.date))).join(' ');
      t += `<tr data-i="${it.id}" class="${it.active ? '' : 'off'}" style="background:${rowBg}">
        <td class="num">${s.cur || '-'}</td><td class="num">${esc(it.tg)}</td><td>${esc(it.nx)}</td><td class="num">${yr2(it.yr)}</td>
        <td style="${strong}" class="b">${esc(it.brand)}</td><td style="${strong}">${esc(it.color)}</td><td>${esc(it.model)}</td>
        <td>${esc(it.hood)}</td><td>${esc(it.length)}</td><td>${esc(it.fit)}</td><td>${esc(it.pad)}</td><td>${esc(it.pocket)}</td>
        <td>${esc(it.material)}</td><td class="b">${esc(it.kind)}</td>
        <td class="chk">${s.achieved ? '<i></i>' : '-'}</td><td class="dt" data-dm="${it.id}">${dates || '<span class="muted">+</span>'}</td></tr>`;
    }
  }
  return t + `</tbody></table></div><div class="muted" style="margin:4px 2px 0">좌우로 밀어서 보세요 · Dates 칸을 누르면 날짜 입력·변경 · 다른 칸을 누르면 상세 · 빨간 날짜 = 계획</div>`;
}
const tempLabel = (g) => g.temp || '';

// part: 'top' = 자동저장 경고만, 'bottom' = 나머지 안내, 생략 = 전부
function banners(part) {
  let h = '';
  if (!storageOK && part !== 'bottom') h += `<div class="banner red">⚠ 이 방식으로 열면 브라우저 자동저장이 되지 않습니다. 변경 후 반드시 <b>설정 → 엑셀로 저장</b>을 하세요.</div>`;
  if (part === 'top') return h;
  if (seededNow) h += `<div class="banner">처음 실행이라 <b>초기 데이터(출력물 기준)</b>로 시작했습니다. 백업 엑셀이 있으면 <a href="#" id="bnImport">엑셀 불러오기</a>.</div>`;
  const lb = db.meta.lastBackup;
  if (!seededNow && (!lb || daysBetween(lb.slice(0, 10), todayStr()) >= 7))
    h += `<div class="banner">마지막 엑셀 백업: <b>${lb ? lb.slice(0, 10) : '없음'}</b> · <a href="#" id="bnBackup">지금 엑셀로 저장</a></div>`;
  return h;
}
function bindBanners() {
  document.getElementById('bnImport')?.addEventListener('click', (e) => { e.preventDefault(); importXlsx(); });
  document.getElementById('bnBackup')?.addEventListener('click', (e) => { e.preventDefault(); exportXlsx(); });}

// ---------- 그룹 ----------
let groupFilter = { showOff: true, sort: 'order', edit: false };
function viewGroup(gid) {
  const g = groupById(gid);
  if (!g) return go('#/');
  const all = groupItems(gid);
  const st = groupStats(db, all);
  const prog = seasonProgress(db, g.type, st.tg);
  setTop({ title: `${g.name}  ${tempLabel(g)}`, back: true });
  setNav('home');
  const editing = groupFilter.edit;
  let items = all.map((it) => ({ it, s: itemStats(db, it) }));
  if (!editing) {
    if (!groupFilter.showOff) items = items.filter((x) => x.it.active);
    if (groupFilter.sort === 'less') items.sort((a, b) => (a.s.cur - a.it.tg) - (b.s.cur - b.it.tg));
    if (groupFilter.sort === 'last') items.sort((a, b) => (a.s.last || '').localeCompare(b.s.last || ''));
  }
  const today = todayStr();

  let h = `<div class="card">
      <div class="boxes">${all.map((it) => `<i class="shp-${shapeOf(it)}" style="${chipStyle(it)}"></i>`).join('')}</div>
      ${usageBar(st, prog?.ratio, groupDates(all))}
    </div>
    <div class="tabs">` + (editing
      ? `<button data-edit class="on">✓ 순서 편집 완료</button>`
      : `<button data-sort="order" class="${groupFilter.sort === 'order' ? 'on' : ''}">기본순</button>
      <button data-sort="less" class="${groupFilter.sort === 'less' ? 'on' : ''}">목표 미달순</button>
      <button data-sort="last" class="${groupFilter.sort === 'last' ? 'on' : ''}">오래 안 입은 순</button>
      <button data-off class="${groupFilter.showOff ? 'on' : ''}">비활성 표시</button>
      <button data-edit>⇅ 순서·그룹 편집</button>`) + `</div>`;

  if (editing) {
    const others = typeGroups(g.type);
    h += `<div class="muted" style="margin:0 2px 8px">↑↓로 순서를 바꾸고, 오른쪽에서 그룹을 고르면 그 그룹의 맨 뒤로 옮겨집니다.</div>`;
    h += items.map(({ it }, i) => `<div class="item ${it.active ? '' : 'off'}">
      <b class="muted" style="width:20px;text-align:right">${i + 1}</b>${chip(it, 'sm')}
      <div class="grow"><div class="title">${itemTitle(it)}</div><div class="muted">${specLine(it)}</div>
        <div class="row" style="gap:6px;margin-top:6px">
          <button class="btn sm" data-mv="${it.id}" data-d="-1" ${i === 0 ? 'disabled' : ''}>↑ 위로</button>
          <button class="btn sm" data-mv="${it.id}" data-d="1" ${i === items.length - 1 ? 'disabled' : ''}>↓ 아래로</button>
          <select data-mg="${it.id}" style="flex:1;padding:5px">${others.map((o) => `<option value="${o.id}" ${o.id === gid ? 'selected' : ''}>${o.id === gid ? '그룹: ' : '→ '}${esc(o.name)}</option>`).join('')}</select>
        </div></div>
    </div>`).join('');
  } else {
    h += `<div class="clist">` + itemTable(items, {
      headRight: '사용',
      rowAttr: (it) => `data-i="${it.id}"`,
      rowClass: (it) => (it.active ? '' : 'off'),
      right: (it, { s }) => `<div class="rtw"><div class="cnt${s.achieved ? ' ach' : ''}" title="${s.achieved ? '목표 달성' : ''}">${s.cur}<span class="muted">/${it.tg}</span></div>` +
        (it.active ? `<button class="wear" data-wear="${it.id}" aria-label="사용일 추가">+</button>` : '<span class="wear-sp"></span>') + `</div>`,
    }) + `</div>`;
    if (!items.length) h += `<div class="empty">의류가 없습니다.</div>`;
  }
  $app.innerHTML = h;
  $app.querySelectorAll('[data-sort]').forEach((b) => (b.onclick = () => { groupFilter.sort = b.dataset.sort; render(); }));
  $app.querySelector('[data-off]')?.addEventListener('click', () => { groupFilter.showOff = !groupFilter.showOff; render(); });
  $app.querySelector('[data-edit]').onclick = () => { groupFilter.edit = !groupFilter.edit; render(); };
  $app.querySelectorAll('[data-i]').forEach((el) => (el.onclick = (e) => { if (!e.target.closest('[data-wear]')) go('#/item/' + el.dataset.i); }));
  $app.querySelectorAll('[data-wear]').forEach((b) => (b.onclick = () => askUsage(b.dataset.wear, today)));
  $app.querySelectorAll('[data-mv]').forEach((b) => (b.onclick = () => {
    const i = all.findIndex((x) => x.id === b.dataset.mv);
    const j = i + Number(b.dataset.d);
    [all[i].order, all[j].order] = [all[j].order, all[i].order];
    save(); render();
  }));
  $app.querySelectorAll('[data-mg]').forEach((sel) => (sel.onchange = () => {
    const it = itemById(sel.dataset.mg);
    const to = groupById(sel.value);
    it.groupId = to.id;
    it.order = 1e9; // 옮긴 그룹의 맨 뒤
    normalizeOrder(db);
    save();
    toast(`${it.brand} ${it.color} → ${to.name}`);
    render();
  }));
  if (!editing) {
    const fab = document.createElement('button');
    fab.className = 'btn pri fab';
    fab.textContent = '+ 의류 추가';
    fab.onclick = () => editItem(null, gid);
    document.body.appendChild(fab);
  }
}

// ---------- 의류 상세 ----------
function viewItem(id) {
  const it = itemById(id);
  if (!it) return go('#/');
  const g = groupById(it.groupId);
  const s = itemStats(db, it);
  const all = db.usage.filter((u) => u.itemId === id).sort((a, b) => b.date.localeCompare(a.date));
  const sid = db.currentSeason[it.type];
  const seasonName = (sid2) => (db.seasons.find((x) => x.id === sid2) || {}).name || sid2;
  setTop({ title: `${it.brand} ${it.color}`, back: true });
  setNav('home');
  const f = (k, v) => (v !== '' && v != null ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : '');

  let h = `<div class="card"><div class="row">${chip(it, 'lg')}<div class="grow">
      <div class="title" style="font-size:17px">${itemTitle(it)}${badges(it)}</div>
      <div class="muted">${esc(g?.name)} · ${itemSub(it)}</div></div></div>
      <div class="stat3" style="margin-top:12px">
        <div><b>${s.cur}<span class="muted">/${it.tg}</span></b><span class="muted">이번 시즌</span></div>
        <div><b>${s.last ? md(s.last) : '-'}</b><span class="muted">마지막 사용</span></div>
        <div><b>${s.planned.length}</b><span class="muted">착용예정</span></div>
      </div>
      ${s.achieved ? '<div style="margin-top:8px"><span class="badge b-ok" style="margin:0">목표 달성</span></div>' : ''}
    </div>
    <div class="card">
      <div class="row" style="margin-bottom:6px"><div class="title grow">사용일 기록</div><button class="btn sm pri" id="addBtn">+ 사용일 추가</button></div>
      ${all.length ? all.map((u) => `<div class="list-date">
          <span class="grow">${u.date} (${weekday(u.date)}) ${u.planned ? '<span class="badge b-plan">예정</span>' : ''}${u.seasonId !== sid ? `<span class="muted"> · ${u.seasonId ? esc(seasonName(u.seasonId)) : '시즌 없음'}</span>` : ''}${u.memo ? `<div class="muted">${esc(u.memo)}</div>` : ''}</span>
          ${u.planned ? `<button class="btn sm pri" data-pu="${u.id}">확정·변경</button>` : `<button class="btn sm" data-redate="${u.id}">날짜</button>`}<button class="btn sm" data-memo="${u.id}">메모</button>
          <button class="btn sm danger" data-del="${u.id}">삭제</button></div>`).join('') : '<div class="muted">기록 없음</div>'}
    </div>
    ${pastSeasonsHtml(it)}
    <div class="card">
      <div class="row" style="margin-bottom:8px"><div class="title grow">상세 정보</div><button class="btn sm" id="editBtn">수정</button></div>
      <dl class="kv kv2">
        ${f('그룹', g?.name)}${f('Brand', it.brand)}${f('Color', it.color)}${f('Model', it.model)}${f('Yr', yr2(it.yr))}${f('NX', it.nx === 'Ex' ? 'Ex (처분예정)' : it.nx)}
        ${f('Tg N.', it.tg)}${f('Hood', it.hood)}${f('Length', it.length)}${f('Fit', it.fit)}${f('Pad', it.pad)}
        ${f('Pocket', it.pocket)}${f('소재', it.material)}${f('종류', it.kind)}${f('상태', it.active ? '활성' : '비활성')}${f('ID', it.id)}${it.memo ? `<dt>메모</dt><dd class="wide">${esc(it.memo)}</dd>` : ''}
      </dl>
    </div>`;
  $app.innerHTML = h;
  document.getElementById('addBtn').onclick = () => askUsage(id);
  document.getElementById('editBtn').onclick = () => editItem(id);
  $app.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
    const u = db.usage.find((x) => x.id === b.dataset.del);
    if (confirm(`${u.date} 기록을 삭제할까요?`)) { removeUsage(u.id); render(); }
  }));
  $app.querySelectorAll('[data-memo]').forEach((b) => (b.onclick = () => {
    const u = db.usage.find((x) => x.id === b.dataset.memo);
    const m = prompt('메모 (행사, 날씨 등)', u.memo || '');
    if (m !== null) { u.memo = m.trim(); syncFinal(u); save(); render(); }
  }));
  $app.querySelectorAll('[data-redate]').forEach((b) => (b.onclick = () => redateUsage(b.dataset.redate)));
}

// 실제 기록의 날짜 바꾸기 (지난 시즌 기록도 가능, 시즌은 새 날짜로 다시 정함). 오늘까지만
function redateUsage(uid) {
  const u = db.usage.find((x) => x.id === uid);
  const it = itemById(u.itemId);
  modal(`<h2>사용일 날짜 바꾸기</h2>
    <div class="muted" style="margin-bottom:8px">${esc(it.brand)} · ${esc(it.color)} · ${u.date} (${weekday(u.date)})${u.seasonId !== db.currentSeason[it.type] ? ` · ${esc(seasonById(u.seasonId)?.name || '')}` : ''}</div>
    <form class="form" id="rf"><label>새 날짜 (오늘까지)</label><input type="date" name="d" value="${u.date}" max="${todayStr()}" required>
    <div class="row" style="margin-top:14px"><span class="grow"></span><button type="button" class="btn" id="rcancel">취소</button><button class="btn pri">저장</button></div></form>`, (m, close) => {
    const f = m.querySelector('#rf');
    m.querySelector('#rcancel').onclick = close;
    f.onsubmit = (e) => {
      e.preventDefault();
      const d = f.d.value;
      if (!d || d === u.date) return close();
      if (d > todayStr()) return alert('실제 착용은 오늘까지의 날짜만 가능합니다.');
      if (!okDate(it, d)) return;
      if (db.usage.some((x) => x !== u && x.itemId === u.itemId && x.date === d) && !confirm(`⚠ ${md(d)}에 이미 기록되어 있습니다.\n그래도 바꿀까요?`)) return;
      syncFinal(u, true);
      Object.assign(u, { date: d, seasonId: seasonForDate(db, it.type, d) });
      syncFinal(u); save(); close(); render();
      toast(`날짜 변경: ${md(d)} ${it.brand} ${it.color}`);
    };
  });
}

// ---------- 의류 추가/수정 ----------
const FIELDS = [['brand', 'Brand'], ['model', 'Model'], ['hood', 'Hood'], ['length', 'Length'], ['fit', 'Fit'], ['pad', 'Pad'], ['pocket', 'Pocket'], ['material', '소재'], ['kind', '종류']];
// 기존 값 목록 + "새로 입력" 선택 상자
function combo(name, values, cur, { none = '— 없음 —', newLabel = '+ 새로 입력…' } = {}) {
  const list = [...new Set([...values, cur].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return `<select name="${name}" data-combo>${none !== null ? `<option value="">${none}</option>` : ''}${list.map((v) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('')}<option value="__new">${newLabel}</option></select>
    <input name="${name}__new" placeholder="새 값 입력" hidden style="margin-top:4px">`;
}
function editItem(id, gid) {
  const isNew = !id;
  if (isNew && !gid) gid = typeGroups()[0]?.id;
  if (isNew && !gid) return alert('먼저 설정에서 그룹을 만드세요.');
  const type = isNew ? groupById(gid).type : itemById(id).type;
  const it = isNew ? { type, groupId: gid, active: true, tg: 2, nx: 'New', yr: new Date().getFullYear() % 100, brand: '', color: '', model: '', hood: '', length: '', fit: '', pad: '', pocket: '', material: '', kind: '', memo: '' } : { ...itemById(id) };
  const vals = (k) => db.terms[k] || [];
  const groups = typeGroups(type);
  const html = `<h2>${isNew ? '의류 추가' : '의류 수정'}</h2><form class="form" id="f">
    <div class="two">
      <div><label>그룹</label><select name="groupId" data-combo>${groups.map((g) => `<option value="${g.id}" ${g.id === it.groupId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}<option value="__new">+ 새 그룹…</option></select>
        <input name="groupId__new" placeholder="새 그룹 이름" hidden style="margin-top:4px"></div>
      <div><label>상태</label><select name="active"><option value="1" ${it.active ? 'selected' : ''}>활성</option><option value="0" ${!it.active ? 'selected' : ''}>비활성</option></select></div>
    </div>
    <label>Brand *</label>${combo('brand', vals('brand'), it.brand, { none: '— 선택 —' })}
    <label>Color *</label>
    <input type="hidden" name="color" value="${esc(db.colors.find((c) => c.name === it.color) ? it.color : '')}">
    <div class="cpick">${sortColors([...db.colors]).map((c) => `<button type="button" class="cp ${c.name === it.color ? 'on' : ''}" data-c="${esc(c.name)}"><i style="background:${esc(c.hex)}"></i>${esc(c.name)}</button>`).join('')}<button type="button" class="cp" data-c="__new">+ 새 색상…</button></div>
    <div class="row" id="newHexRow" hidden style="margin-top:6px"><input type="color" name="color__hex" value="#888888" style="width:52px;height:38px;padding:2px;flex:none"><input name="color__new" placeholder="새 색상 이름 (예: Camel)"></div>
    <div class="two">
      <div><label>Tg N. (목표)</label><input name="tg" type="number" min="0" inputmode="numeric" value="${esc(it.tg)}"></div>
      <div><label>NX</label><select name="nx">${[['', '-'], ['New', 'New'], ['Ex', 'Ex (처분예정)']].map(([v, t]) => `<option value="${v}" ${it.nx === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div><label>Yr (구입연도 2자리)</label><input name="yr" type="number" inputmode="numeric" placeholder="예: 24" value="${esc(yr2(it.yr))}"></div>
      ${FIELDS.slice(1).map(([k, t]) => `<div><label>${t}</label>${combo(k, vals(k), it[k])}</div>`).join('')}
    </div>
    <label>메모</label><textarea name="memo" rows="2">${esc(it.memo)}</textarea>
    <div class="row" style="margin-top:14px">
      ${isNew ? '' : '<button type="button" class="btn danger" id="delItem">삭제</button>'}
      <span class="grow"></span><button type="button" class="btn" id="cancel">취소</button><button class="btn pri">저장</button>
    </div></form>`;
  modal(html, (m, close) => {
    const f = m.querySelector('#f');
    m.querySelectorAll('.cp').forEach((b) => (b.onclick = () => {
      f.color.value = b.dataset.c;
      m.querySelectorAll('.cp').forEach((x) => x.classList.toggle('on', x === b));
      const isNewColor = b.dataset.c === '__new';
      m.querySelector('#newHexRow').hidden = !isNewColor;
      if (isNewColor) f.color__new.focus();
    }));
    f.querySelectorAll('[data-combo]').forEach((sel) => {
      sel.addEventListener('change', () => {
        const inp = f.elements[sel.name + '__new'];
        inp.hidden = sel.value !== '__new';
        if (!inp.hidden) inp.focus();
      });
    });
    m.querySelector('#cancel').onclick = close;
    m.querySelector('#delItem')?.addEventListener('click', () => {
      const n = db.usage.filter((u) => u.itemId === id).length;
      if (!confirm(`${it.brand} ${it.color}을(를) 삭제할까요?\n사용기록 ${n}건도 함께 삭제됩니다.\n(입지 않게 된 옷은 삭제 대신 '비활성'을 권장합니다)`)) return;
      db.items = db.items.filter((x) => x.id !== id);
      db.usage = db.usage.filter((u) => u.itemId !== id);
      save(); close(); history.back();
    });
    f.onsubmit = (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(f));
      const pick = (k) => (v[k] === '__new' ? (v[k + '__new'] || '').trim() : (v[k] || '').trim());
      const brand = normalizeTerm('brand', pick('brand'));
      const color = normalizeTerm('color', pick('color'));
      if (!brand) return alert('Brand를 고르거나 새로 입력하세요.');
      if (!color) return alert('색상을 고르거나 새로 입력하세요.');
      let groupId = v.groupId;
      if (groupId === '__new') {
        const name = pick('groupId');
        if (!name) return alert('새 그룹 이름을 입력하세요.');
        groupId = nextId('G', db.groups, 1);
        db.groups.push({ id: groupId, type, name, temp: '', order: Math.max(0, ...groups.map((g) => g.order)) + 1 });
      }
      if (!db.colors.find((c) => c.name === color)) db.colors.push({ name: color, hex: v.color__hex || '#888888' });
      const out = { ...it, groupId, active: v.active === '1', brand, color, tg: Number(v.tg) || 0, nx: v.nx, yr: normalizeYr(v.yr), memo: v.memo.trim() };
      for (const [k] of FIELDS.slice(1)) out[k] = normalizeTerm(k, pick(k));
      if (isNew) { out.id = nextId('C', db.items, 3); out.order = nextOrder(out.groupId); db.items.push(out); }
      else {
        if (out.groupId !== itemById(id).groupId) out.order = 1e9; // 옮긴 그룹의 맨 뒤
        Object.assign(itemById(id), out);
        normalizeOrder(db);
      }
      save(); close();
      if (isNew) { toast(`추가됨: ${brand} ${color}`); go('#/item/' + out.id); } else render();
    };
  });
}

function newColorPrompt() {
  const name = (prompt('새 색상 이름 (예: Camel)') || '').trim();
  if (!name) return null;
  if (!db.colors.find((c) => c.name === name)) {
    const hex = (prompt('색상 코드 (예: #c19a6b). 나중에 설정 → 색상에서 바꿀 수 있습니다.', '#888888') || '#888888').trim();
    db.colors.push({ name, hex: /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#888888' });
    save();
  }
  return name;
}

// ---------- 날짜별 기록 ----------
let pickGroup = null;
function viewDay(date) {
  date = date || todayStr();
  setTop({ title: '날짜별 기록', seg: true });
  setNav('day');
  const recs = db.usage.filter((u) => u.date === date).map((u) => ({ u, it: itemById(u.itemId) })).filter((x) => x.it);
  const groups = typeGroups();
  if (!pickGroup || !groups.find((g) => g.id === pickGroup)) pickGroup = groups[0]?.id;
  const isFuture = date > todayStr();
  const label = date === todayStr() ? '오늘' : isFuture ? '예정' : '';

  let h = `<div class="card"><div class="row" style="gap:6px">
      <button class="btn" id="prev">‹</button>
      <input type="date" id="dt" value="${date}" style="flex:1;text-align:center">
      <button class="btn" id="next">›</button></div>
      <div class="muted" style="text-align:center;margin-top:6px">${weekday(date)}요일 ${label ? `· <b>${label}</b>` : ''}${date !== todayStr() ? ' · <a href="#/day">오늘로</a>' : ''}</div></div>
    <div class="section-t">${md(date)} 기록 (${recs.length})</div>`;
  h += recs.length ? `<div class="clist">` + itemTable(recs, {
    rowAttr: (it) => `data-i="${it.id}"`,
    sub: (it, { u }) => (u.planned ? '<span class="badge b-plan" style="margin:0 4px 0 0">계획</span>' : '<span class="badge b-new" style="margin:0 4px 0 0">실제</span>') +
      esc(groupById(it.groupId)?.name) + (u.memo ? ' · ' + esc(u.memo) : ''),
    right: (it, { u }) => `<button class="wear done" style="color:var(--bad)" data-del="${u.id}" aria-label="삭제">×</button>`,
  }) + `</div>` : '<div class="card muted">기록 없음</div>';
  h += `<div class="section-t">의류 추가 (누르면 날짜·실제/계획 선택)</div>
    <div class="tabs">${groups.map((g) => `<button data-pg="${g.id}" class="${g.id === pickGroup ? 'on' : ''}">${esc(g.name)}</button>`).join('')}</div>`;
  const cands = pickGroup ? groupItems(pickGroup).filter((i) => i.active) : [];
  const nOn = (it) => recs.filter((r) => r.it.id === it.id).length;
  h += cands.length ? `<div class="clist">` + itemTable(cands, {
    rowAttr: (it) => `data-add="${it.id}"`,
    rowClass: (it) => (nOn(it) ? 'sel' : ''),
    right: (it) => { const n = nOn(it); return `<span class="wear ${n ? 'done' : ''}">${n ? '✓' + (n > 1 ? n : '') : '+'}</span>`; },
  }) + `</div>` : '<div class="empty">활성 의류가 없습니다.</div>';
  h += lastYearHtml(date, db.viewType, '작년 이날');
  $app.innerHTML = h;
  const to = (d) => go('#/day/' + d);
  document.getElementById('prev').onclick = () => to(addDays(date, -1));
  document.getElementById('next').onclick = () => to(addDays(date, 1));
  document.getElementById('dt').onchange = (e) => e.target.value && to(e.target.value);
  $app.querySelectorAll('[data-pg]').forEach((b) => (b.onclick = () => { pickGroup = b.dataset.pg; render(); }));
  $app.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => askUsage(b.dataset.add, date)));
  $app.querySelectorAll('tr[data-i]').forEach((tr) => (tr.onclick = (e) => { if (!e.target.closest('[data-del]')) go('#/item/' + tr.dataset.i); }));
  $app.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => { removeUsage(b.dataset.del); render(); }));
}

// ---------- 달력 ----------
function viewCal(ym) {
  ym = ym || todayStr().slice(0, 7);
  setTop({ title: '달력', seg: true });
  setNav('cal');
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const start = addDays(ym + '-01', -first.getDay());
  const prevYm = new Date(y, m - 2, 1), nextYm = new Date(y, m, 1);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const byDate = {};
  for (const u of db.usage) {
    const it = itemById(u.itemId);
    if (it && it.type === db.viewType) (byDate[u.date] ||= []).push({ u, it });
  }
  const today = todayStr();
  let monthCnt = 0;
  let h = `<div class="row" style="margin-bottom:8px"><button class="btn" id="pm">‹</button><div class="grow title" style="text-align:center;font-size:17px">${y}년 ${m}월</div><button class="btn" id="nm">›</button></div>
    <div class="cal">${WEEK.map((w) => `<div class="h">${w}</div>`).join('')}`;
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    const recs = byDate[d] || [];
    const inMonth = d.slice(0, 7) === ym;
    if (inMonth) monthCnt += recs.filter((r) => !r.u.planned).length;
    h += `<button class="d ${inMonth ? '' : 'out'} ${d === today ? 'today' : ''}" data-d="${d}">
      <span>${Number(d.slice(8))}</span>
      <span class="dots">${recs.slice(0, 6).map(({ u, it }) => `<i class="${u.planned ? 'p' : ''}" style="${chipStyle(it)}"></i>`).join('')}</span></button>`;
    if (i === 34 && addDays(start, 35).slice(0, 7) !== ym) break;
  }
  h += `</div><div class="muted" style="margin-top:8px">${m}월 착용 ${monthCnt}회 · 칸의 색 = 입은 옷 색상, 점선 = 착용예정 · 날짜를 누르면 기록 화면</div>`;
  $app.innerHTML = h;
  document.getElementById('pm').onclick = () => go('#/cal/' + fmt(prevYm));
  document.getElementById('nm').onclick = () => go('#/cal/' + fmt(nextYm));
  $app.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => go('#/day/' + b.dataset.d)));
}

// ---------- 설정 ----------
const FIELD_LABEL = { brand: 'Brand', model: 'Model', hood: 'Hood', length: 'Length', fit: 'Fit', pad: 'Pad', pocket: 'Pocket', material: '소재', kind: '종류' };
const openTerms = new Set();
function viewSettings() {
  setTop({ title: '설정', seg: true });
  setNav('settings');
  const type = db.viewType;
  const groups = typeGroups(type);
  const usedColors = new Set(db.items.map((i) => i.color));

  let h = banners() + `<div class="section-t">엑셀 백업 / 복원</div><div class="card">
      <button class="btn pri block" id="exp">엑셀로 저장 (최신본: 현재 데이터 전체)</button>
      <button class="btn block" id="imp" style="margin-top:8px">엑셀 불러오기 (현재 데이터 교체)</button>
      <div class="muted" style="margin-top:8px">마지막 최신본: ${db.meta.lastExportName ? `<b>${esc(db.meta.lastExportName)}</b>` : '없음'}</div>
      <div class="muted" style="margin-top:4px">마지막 백업: ${db.meta.lastBackup ? db.meta.lastBackup.slice(0, 16).replace('T', ' ') : '없음'} · 자동저장: ${storageOK ? '사용 중' : '<b style="color:var(--bad)">불가 — 엑셀 저장 필수</b>'}</div>
      <div class="muted" style="margin-top:4px">구글드라이브·카톡으로 보내기: 엑셀로 저장 후 <b>내 파일 → 다운로드</b>에서 파일을 길게 눌러 <b>공유</b></div>
    </div>` + versionSectionHtml() + seasonSectionHtml(type);
  h += `<div class="section-t">${type} 그룹</div><div class="card">` +
    groups.map((g, i) => `<div class="list-date"><span class="grow"><b>${esc(g.name)}</b> <span class="muted">${tempLabel(g)} · ${groupItems(g.id).length}벌</span></span>
      <button class="btn sm" data-gm="${g.id}" data-d="-1" ${i === 0 ? 'disabled' : ''}>↑</button>
      <button class="btn sm" data-gm="${g.id}" data-d="1" ${i === groups.length - 1 ? 'disabled' : ''}>↓</button>
      <button class="btn sm" data-ge="${g.id}">수정</button></div>`).join('') +
    `<button class="btn block" id="gAdd" style="margin-top:8px">+ 그룹 추가</button>
    <div class="muted" style="margin-top:6px">↑↓로 순서 변경 · 수정에서 이름, 기온·추천월, 삭제</div></div>
    <div class="section-t">속성 값</div><div class="card">
      <div class="muted" style="margin-bottom:6px">의류 추가/수정에서 고르는 값 목록입니다. 쓰는 의류가 없는 값(0벌)만 삭제할 수 있습니다.</div>` +
    TERM_FIELDS.map((f) => {
      const list = [...(db.terms[f] || [])].sort((a, b) => a.localeCompare(b));
      const nUse = (v) => db.items.filter((x) => x[f] === v).length;
      const unused = list.filter((v) => !nUse(v)).length;
      return `<details class="terms"${openTerms.has(f) ? ' open' : ''} data-tf="${f}"><summary><b>${FIELD_LABEL[f]}</b> <span class="muted">${list.length}개${unused ? ` · 안 쓰는 값 ${unused}` : ''}</span></summary>` +
        list.map((v) => { const n = nUse(v); return `<div class="list-date"><span class="grow">${esc(v)} <span class="muted">${n}벌</span></span>${n ? '' : `<button class="btn sm danger" data-td="${f}" data-v="${esc(v)}">삭제</button>`}</div>`; }).join('') +
        `</details>`;
    }).join('') + `</div>
    <div class="section-t">색상 (${db.colors.length})</div><div class="card">` +
    db.colors.map((c, i) => `<div class="list-date"><input type="color" data-ci="${i}" value="${esc(c.hex)}" style="width:44px;height:34px;padding:2px">
      <span class="grow">${esc(c.name)} <span class="muted">${esc(c.hex)} · ${db.items.filter((x) => x.color === c.name).length}벌</span></span>
      <button class="btn sm" data-cr="${i}">이름</button>${usedColors.has(c.name) ? '' : `<button class="btn sm danger" data-cd="${i}">삭제</button>`}</div>`).join('') +
    `<button class="btn block" id="cAdd" style="margin-top:8px">+ 색상 추가</button></div>
    <div class="section-t">기타</div><div class="card">
      <button class="btn block danger" id="reset">초기 데이터(출력물 기준)로 되돌리기</button>
      <div class="muted" style="margin-top:6px">이 기기 화면 폭: <b>${innerWidth}px</b> (360px 이상이면 의류 목록이 한 화면 폭에 맞음)</div>
      <div class="muted" style="margin-top:6px">데이터 ${db.items.length}벌 · 사용기록 ${db.usage.length}건 · 최종수정 ${db.meta.updated.slice(0, 16).replace('T', ' ')}</div></div>`;
  $app.innerHTML = h;
  bindBanners();
  document.getElementById('exp').onclick = exportXlsx;
  document.getElementById('imp').onclick = importXlsx;
  bindSeasonSection(type);
  bindVersionSection();
  $app.querySelectorAll('[data-gm]').forEach((b) => (b.onclick = () => {
    const i = groups.findIndex((g) => g.id === b.dataset.gm);
    const j = i + Number(b.dataset.d);
    groups.forEach((g, k) => (g.order = k + 1)); // 순서 번호 정리 후 맞바꿈
    [groups[i].order, groups[j].order] = [groups[j].order, groups[i].order];
    save(); render();
  }));
  $app.querySelectorAll('details[data-tf]').forEach((d) => d.addEventListener('toggle', () => { d.open ? openTerms.add(d.dataset.tf) : openTerms.delete(d.dataset.tf); }));
  $app.querySelectorAll('[data-td]').forEach((b) => (b.onclick = () => {
    const f = b.dataset.td, v = b.dataset.v;
    if (db.items.some((x) => x[f] === v)) return alert('이 값을 쓰는 의류가 있어 삭제할 수 없습니다.');
    if (!confirm(`${FIELD_LABEL[f]} 값 '${v}'을(를) 목록에서 삭제할까요?`)) return;
    db.terms[f] = db.terms[f].filter((x) => x !== v);
    const y = scrollY; save(); render(); window.scrollTo(0, y);
  }));
  $app.querySelectorAll('[data-ge]').forEach((b) => (b.onclick = () => editGroup(b.dataset.ge)));
  document.getElementById('gAdd').onclick = () => editGroup(null);
  $app.querySelectorAll('[data-ci]').forEach((inp) => (inp.onchange = () => { db.colors[inp.dataset.ci].hex = inp.value; save(); render(); }));
  $app.querySelectorAll('[data-cr]').forEach((b) => (b.onclick = () => {
    const c = db.colors[b.dataset.cr];
    const n = (prompt('색상 이름 변경 (이 색을 쓰는 의류도 함께 바뀝니다)', c.name) || '').trim();
    if (!n || n === c.name) return;
    if (db.colors.find((x) => x.name === n)) return alert('이미 있는 이름입니다.');
    db.items.forEach((x) => { if (x.color === c.name) x.color = n; });
    c.name = n; save(); render();
  }));
  $app.querySelectorAll('[data-cd]').forEach((b) => (b.onclick = () => { db.colors.splice(b.dataset.cd, 1); save(); render(); }));
  document.getElementById('cAdd').onclick = () => { if (newColorPrompt()) render(); };
  document.getElementById('reset').onclick = () => {
    if (!confirm('현재 데이터를 모두 지우고 초기 데이터로 되돌릴까요?\n먼저 엑셀로 저장해 두는 것을 권장합니다.')) return;
    if (!confirm('정말 되돌릴까요? 되돌릴 수 없습니다.')) return;
    db = buildSeedDB(); normalizeGroups(db); save(); render();
  };
}

function editGroup(gid) {
  const type = db.viewType;
  const g = gid ? groupById(gid) : { name: '', temp: '' };
  modal(`<h2>${gid ? '그룹 수정' : '그룹 추가'}</h2><form class="form" id="f">
    <label>그룹명</label><input name="name" value="${esc(g.name)}" required>
    <label>기온 · 추천월</label><input name="temp" value="${esc(g.temp)}" placeholder="예: -9 ~ 0℃ · 12~1월">
    <div class="muted" style="margin-top:4px">자유롭게 적습니다. 그룹 이름 옆에 그대로 표시됩니다.</div>
    <div class="row" style="margin-top:14px">${gid ? '<button type="button" class="btn danger" id="gDel">삭제</button>' : ''}
    <span class="grow"></span><button type="button" class="btn" id="cancel">취소</button><button class="btn pri">저장</button></div></form>`, (m, close) => {
    const f = m.querySelector('#f');
    m.querySelector('#cancel').onclick = close;
    m.querySelector('#gDel')?.addEventListener('click', () => { close(); deleteGroup(gid); });
    f.onsubmit = (e) => {
      e.preventDefault();
      const v = { name: f.name.value.trim(), temp: f.temp.value.trim() };
      if (gid) Object.assign(g, v);
      else db.groups.push({ id: nextId('G', db.groups, 1), type, order: Math.max(0, ...typeGroups(type).map((x) => x.order)) + 1, ...v });
      save(); close(); render();
    };
  });
}

// 그룹 삭제: 소속 의류가 있으면 옮길 그룹을 고른 뒤 옮기고 삭제 (사용기록은 그대로)
function deleteGroup(gid) {
  const g = groupById(gid);
  const items = groupItems(gid);
  const others = typeGroups(g.type).filter((x) => x.id !== gid);
  const finish = () => { db.groups = db.groups.filter((x) => x.id !== gid); typeGroups(g.type).forEach((x, i) => (x.order = i + 1)); save(); render(); };
  if (!items.length) { if (confirm(`'${g.name}' 그룹을 삭제할까요?`)) finish(); return; }
  if (!others.length) return alert('옮길 다른 그룹이 없습니다. 먼저 그룹을 추가하세요.');
  modal(`<h2>그룹 삭제</h2><form class="form" id="f">
    <p>'${esc(g.name)}' 그룹에 의류 <b>${items.length}벌</b>이 있습니다. 어느 그룹으로 옮길까요?<br><span class="muted">옮긴 의류는 그 그룹의 맨 뒤에 놓이고, 사용기록은 그대로 남습니다.</span></p>
    <select name="to">${others.map((o) => `<option value="${o.id}">${esc(o.name)} ${tempLabel(o)}</option>`).join('')}</select>
    <div class="row" style="margin-top:14px"><span class="grow"></span><button type="button" class="btn" id="cancel">취소</button><button class="btn danger">옮기고 삭제</button></div></form>`, (m, close) => {
    const f = m.querySelector('#f');
    m.querySelector('#cancel').onclick = close;
    f.onsubmit = (e) => {
      e.preventDefault();
      const to = groupById(f.to.value);
      items.forEach((it, i) => { it.groupId = to.id; it.order = 1e9 + i; });
      normalizeOrder(db);
      close(); finish();
      toast(`${items.length}벌 → ${to.name}, '${g.name}' 삭제됨`);
    };
  });
}

// ---------- 엑셀 ----------
// 공유 버튼(Web Share)은 두지 않음: 안드로이드 크롬이 .xlsx 공유를 막음(Permission denied). 다운로드 후 '내 파일'에서 공유하도록 안내
// 현재 데이터 전체(+ 5년 치 시즌 최종본)를 엑셀 파일로. kind: 최신본 / 시즌최종본 (정보 시트에 적음)
function saveFullXlsx(name, kind) {
  const wb = dbToWorkbook(XLSX, db, kind);
  addFinalsToWorkbook(wb);
  XLSX.writeFile(wb, name);
  db.meta.lastBackup = new Date().toISOString();
  seededNow = false;
}
// 엑셀로 저장 = 최신본. 다운로드 폴더에 최신본은 하나만 두도록 이전 파일을 지우라고 안내
function exportXlsx() {
  const d = new Date();
  const name = `의류관리_최신본_${todayStr().replace(/-/g, '')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.xlsx`;
  const prev = db.meta.lastExportName;
  saveFullXlsx(name, '최신본');
  db.meta.lastExportName = name;
  save();
  render();
  alert(`저장됨: ${name} (다운로드 폴더)` + (prev && prev !== name ? `\n\n다운로드 폴더에서 이전 최신본 「${prev}」을(를) 지우세요. 최신본은 하나만 두면 됩니다.` : '') +
    '\n\n드라이브·카톡으로 보내려면 내 파일 → 다운로드에서 파일을 길게 눌러 공유하세요.');
}
function importXlsx() {
  const inp = document.getElementById('fileIn');
  inp.value = '';
  inp.onchange = async () => {
    const file = inp.files[0];
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const nd = workbookToDb(XLSX, wb);
      const finals = readFinalsFromWorkbook(wb);
      const info = wb.Sheets['정보'] ? Object.fromEntries(XLSX.utils.sheet_to_json(wb.Sheets['정보'], { defval: '' }).map((r) => [r['항목'], r['값']])) : {};
      if (!confirm(`${file.name}\n${info['파일종류'] ? info['파일종류'] + ' · ' : ''}저장 ${info['저장일시'] || '알 수 없음'}\n의류 ${nd.items.length}벌, 사용기록 ${nd.usage.length}건\n\n현재 데이터를 이 파일로 교체할까요?\n(파일을 저장한 뒤에 넣은 기록은 사라집니다)`)) return;
      nd.viewType = db.viewType;
      nd.meta.lastBackup = db.meta.lastBackup;
      nd.meta.lastExportName = db.meta.lastExportName;
      normalizeGroups(nd); // 예전 엑셀의 줄임말 그룹명도 원어로
      moveModels(nd); // 예전 엑셀은 Hood 칸에 모델명이 있음
      relinkSeasons(nd);
      db = nd;
      if (finals.length) { const keep = loadSnaps().filter((x) => !finals.some((f) => f.id === x.id)); saveSnaps([...keep, ...finals]); }
      seededNow = false;
      save();
      toast('불러오기 완료');
      go('#/');
      render();
    } catch (e) {
      alert('불러오기 실패: ' + e.message);
    }
  };
  inp.click();
}
