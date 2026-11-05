// 시즌 관리(만들기 → 진행 → 종료), 시즌 최종본, 지난 시즌 보기, 작년 오늘, 5년 보관
// FW와 SS는 각각 따로 종료한다

// ---------- 시즌 최종본 (브라우저에 따로 보관) ----------
const SNAP_KEY = 'clothes-snaps-v1';
function loadSnaps() {
  try { return JSON.parse(localStorage.getItem(SNAP_KEY) || '[]'); } catch (e) { return []; }
}
function saveSnaps(list) {
  try { localStorage.setItem(SNAP_KEY, JSON.stringify(list)); return true; }
  catch (e) { alert('저장 공간이 부족해 시즌 최종본을 저장하지 못했습니다. 엑셀로 저장해 두세요.'); return false; }
}
const seasonById = (id) => db.seasons.find((s) => s.id === id);
// 종료된 시즌의 실제 기록 (잠그지 않음: 고치면 그 시즌 최종본에도 반영 — syncFinal)
const isPastRec = (u) => !u.planned && seasonById(u.seasonId)?.status === 'ended';
// 최종본: 그 구분의 종료된 시즌들, 최근 시즌부터
const finalsOf = (type) => loadSnaps().filter((x) => x.type === type && x.kind === 'final').sort((a, b) => (b.seasonStart || '').localeCompare(a.seasonStart || ''));

// 한 구분(FW/SS)의 데이터만 떼어 냄. cut 이면 실제 기록은 기준일까지, 예정일은 날짜와 상관없이 예정 그대로
function typeData(type, { baseDate = todayStr(), cut = false } = {}) {
  const items = db.items.filter((i) => i.type === type);
  const ids = new Set(items.map((i) => i.id));
  return {
    seasons: db.seasons.filter((s) => s.type === type),
    groups: db.groups.filter((g) => g.type === type),
    items,
    usage: db.usage.filter((u) => ids.has(u.itemId) && (u.planned || !cut || u.date <= baseDate)),
    colors: db.colors,
    currentSeason: db.currentSeason[type],
  };
}
function makeSnap(type, kind, { name = '', baseDate = todayStr(), cut = false, seasonId = db.currentSeason[type] } = {}) {
  const s = seasonById(seasonId);
  return {
    id: 'S' + Date.now() + Math.random().toString(36).slice(2, 5),
    type, kind, name, baseDate, cut, seasonId,
    seasonName: s?.name || '', seasonStart: s?.start || '',
    created: new Date().toISOString(),
    data: JSON.parse(JSON.stringify(typeData(type, { baseDate, cut }))),
  };
}
function addSnap(snap) { return saveSnaps([...loadSnaps(), snap]); }

// 최종본을 앱 전체 구조로 (지난 시즌 보기용)
function snapDb(snap) {
  const d = snap.data;
  return {
    version: 1, seasons: d.seasons, currentSeason: { FW: null, SS: null, [snap.type]: snap.kind === 'final' ? snap.seasonId : d.currentSeason },
    viewType: snap.type, groups: d.groups, colors: d.colors, items: d.items, usage: d.usage, terms: db.terms, meta: { lastBackup: null, updated: snap.created },
  };
}
// 지난 시즌 기록을 고치면 그 시즌 최종본에도 같은 내용 반영 (지난 시즌 보기·작년 오늘이 고친 내용을 보여 주도록)
function syncFinal(u, removed = false) {
  if (!u || u.planned || seasonById(u.seasonId)?.status !== 'ended') return;
  const list = loadSnaps();
  let hit = false;
  for (const f of list) {
    if (f.kind !== 'final' || f.seasonId !== u.seasonId) continue;
    const rest = f.data.usage.filter((x) => x.id !== u.id);
    f.data.usage = removed ? rest : [...rest, { ...u }];
    hit = true;
  }
  if (hit) saveSnaps(list);
}

// 5년 보관: 5년이 지난 사용일, 종료된 시즌과 그 최종본은 정리 (시작할 때)
function pruneOld() {
  const cutoff = addDays(todayStr(), -365 * 5);
  const old = new Set(db.seasons.filter((s) => s.status === 'ended' && s.end < cutoff).map((s) => s.id));
  db.usage = db.usage.filter((u) => u.planned || u.date >= cutoff);
  db.seasons = db.seasons.filter((s) => !old.has(s.id));
  const snaps = loadSnaps();
  const keep = snaps.filter((x) => !(x.kind === 'final' && old.has(x.seasonId)));
  if (keep.length !== snaps.length) saveSnaps(keep);
}

// ---------- 설정: 시즌 칸 ----------
function seasonSectionHtml(type) {
  const list = db.seasons.filter((s) => s.type === type);
  const rank = { active: 0, ready: 1, ended: 2 };
  list.sort((a, b) => rank[a.status] - rank[b.status] || b.start.localeCompare(a.start));
  const finals = finalsOf(type);
  const row = (s) => {
    const fin = finals.find((f) => f.seasonId === s.id);
    const btns = s.status === 'active'
      ? `<button class="btn sm" data-se="${s.id}">기간 수정</button><button class="btn sm danger" data-send="${s.id}">이번 시즌 종료</button>`
      : s.status === 'ready'
        ? `<button class="btn sm" data-se="${s.id}">기간 수정</button><button class="btn sm pri" data-sstart="${s.id}">시즌 시작</button><button class="btn sm danger" data-sdel="${s.id}">삭제</button>`
        : fin ? `<button class="btn sm" onclick="go('#/past/${fin.id}')">보기</button>` : '<span class="muted">최종본 없음</span>';
    return `<div class="list-date" style="flex-wrap:wrap"><span style="flex:1 1 100%"><span class="badge ${s.status === 'active' ? 'b-new' : s.status === 'ready' ? 'b-plan' : 'b-off'}" style="margin:0 6px 0 0">${SEASON_STATUS[s.status]}</span><b>${esc(s.name)}</b>
      <div class="muted">${s.start} ~ ${s.end} · 사용일 집계 ${countWindow(type, seasonYear(s)).join(' ~ ')}</div></span><span class="row" style="gap:4px;margin-left:auto">${btns}</span></div>`;
  };
  const ids = new Set(db.items.filter((i) => i.type === type).map((i) => i.id));
  const orphan = db.usage.filter((u) => ids.has(u.itemId) && !u.seasonId).sort((a, b) => a.date.localeCompare(b.date));
  const orphanHtml = orphan.length ? `<div class="banner" style="margin:0 0 8px">시즌이 없는 사용일 <b>${orphan.length}건</b>: ${[...new Set(orphan.map((u) => u.date))].slice(0, 8).join(', ')}${orphan.length > 8 ? ' …' : ''}<br>그 기간의 시즌을 만들면 자동으로 들어갑니다.</div>` : '';
  return `<div class="section-t">${type} 시즌</div><div class="card">${orphanHtml}${list.map(row).join('') || `<div class="muted">${type} 시즌이 없습니다.</div>`}
    <button class="btn block" id="sAdd" style="margin-top:8px">+ 새 시즌 만들기</button>
    <div class="muted" style="margin-top:6px">새 시즌은 미리 만들어 둘 수 있습니다(준비중). 진행중 시즌을 직접 종료하면 최종본이 저장되고, 전체 데이터를 엑셀(시즌최종본)로도 받을 수 있습니다. 그다음 준비중 시즌을 시작하세요. 날짜가 지나도 자동으로 바뀌지 않습니다. 사용일은 날짜로 시즌이 정해집니다(${type} ${WINDOW_TEXT[type]}).</div></div>`;
}
function bindSeasonSection(type) {
  document.getElementById('sAdd').onclick = () => editSeason(null, type);
  $app.querySelectorAll('[data-se]').forEach((b) => (b.onclick = () => editSeason(b.dataset.se, type)));
  $app.querySelectorAll('[data-send]').forEach((b) => (b.onclick = () => go('#/end/' + b.dataset.send)));
  $app.querySelectorAll('[data-sstart]').forEach((b) => (b.onclick = () => startSeason(b.dataset.sstart)));
  $app.querySelectorAll('[data-sdel]').forEach((b) => (b.onclick = () => {
    const s = seasonById(b.dataset.sdel);
    if (!confirm(`준비중인 ${s.name}을(를) 삭제할까요?`)) return;
    db.seasons = db.seasons.filter((x) => x.id !== s.id); relinkSeasons(db); save(); render();
  }));
}

// 시즌 만들기/기간 수정 (만들면 '준비중')
function editSeason(sid, type) {
  const s = sid ? seasonById(sid) : null;
  const last = db.seasons.filter((x) => x.type === type).sort((a, b) => b.start.localeCompare(a.start))[0];
  const y = last ? Number(last.start.slice(0, 4)) + 1 : new Date().getFullYear();
  const def = s || (type === 'FW' ? { name: `FW ${y}-${String(y + 1).slice(2)}`, start: `${y}-09-01`, end: `${y + 1}-04-30` } : { name: `SS ${y}`, start: `${y}-05-01`, end: `${y}-09-30` });
  modal(`<h2>${s ? '시즌 기간 수정' : `${type} 새 시즌 만들기`}</h2><form class="form" id="f">
    <label>이름</label><input name="name" value="${esc(def.name)}" required>
    <div class="two"><div><label>시작일</label><input type="date" name="start" value="${def.start}" required></div><div><label>종료일</label><input type="date" name="end" value="${def.end}" required></div></div>
    ${s ? '' : '<div class="muted" style="margin-top:6px">준비중으로 만들어집니다. 지금 시즌은 그대로 계속 쓰고, 나중에 [시즌 시작]을 누르면 시작됩니다.</div>'}
    <div class="row" style="margin-top:14px"><span class="grow"></span><button type="button" class="btn" id="cancel">취소</button><button class="btn pri">저장</button></div></form>`, (m, close) => {
    const f = m.querySelector('#f');
    m.querySelector('#cancel').onclick = close;
    f.onsubmit = (e) => {
      e.preventDefault();
      const v = { name: f.name.value.trim(), start: f.start.value, end: f.end.value };
      if (!v.name || v.start >= v.end) return alert('이름과 기간을 확인하세요.');
      const dup = db.seasons.find((x) => x !== s && x.type === type && seasonYear(x) === seasonYear({ type, ...v }));
      if (dup) return alert(`같은 집계 기간의 시즌(${dup.name})이 이미 있습니다.`);
      if (s) Object.assign(s, v);
      else {
        let id = `${type}${v.start.slice(0, 4)}`;
        while (seasonById(id)) id += 'b';
        db.seasons.push({ id, type, status: 'ready', ...v });
      }
      relinkSeasons(db); // 그 기간에 이미 기록된 사용일이 이 시즌으로 들어감
      save(); close(); render();
    };
  });
}

// ---------- 시즌 종료: 검토 화면에서 확인·수정한 뒤 직접 종료 ----------
function viewEnd(sid) {
  const s = seasonById(sid);
  if (!s || s.status !== 'active') return go('#/settings');
  const type = s.type;
  setTop({ title: `${s.name} 종료`, back: true });
  setNav('settings');
  const items = db.items.filter((i) => i.type === type);
  const tot = groupStats(db, items);
  const ids = new Set(items.map((i) => i.id));
  const planned = db.usage.filter((u) => u.planned && ids.has(u.itemId)).sort((a, b) => a.date.localeCompare(b.date));
  const due = planned.filter((u) => u.date <= todayStr());
  let h = `<div class="card"><div class="title">${esc(s.name)} · ${s.start} ~ ${s.end}</div>
      <div class="stat3" style="margin-top:10px">
        <div><b>${tot.cur}<span class="muted">/${tot.tg}</span></b><span class="muted">사용 ${pct(tot.pct)}</span></div>
        <div><b>${tot.ach}<span class="muted">/${tot.n}</span></b><span class="muted">목표달성</span></div>
        <div><b>${planned.length}</b><span class="muted">예정</span></div>
      </div>
      <p class="muted" style="margin-top:10px">종료하면 지금 내용이 <b>${esc(s.name)} 최종본</b>으로 저장되고, 이 시즌의 사용기록은 잠겨서 고칠 수 없습니다. 종료 전에 아래 내용을 확인하고 필요하면 고치세요.</p></div>`;
  if (due.length) {
    h += `<div class="section-t">⚠ 확인 필요한 예정일 ${due.length}건 (누르면 확정·변경·삭제)</div><div class="card">` +
      due.map((u) => { const it = itemById(u.itemId); return `<div class="list-date" data-pu="${u.id}" style="cursor:pointer">${chip(it, 'sm')}<span class="grow">${itemTitle(it)}</span><span class="badge b-plan">${md(u.date)} 지남</span></div>`; }).join('') +
      `<div class="muted" style="margin-top:6px">날짜가 지난 예정일을 정리해야 종료할 수 있습니다.</div></div>`;
  }
  const future = planned.length - due.length;
  if (future) h += `<div class="card muted">아직 오지 않은 예정일 ${future}건은 다음 시즌을 시작할 때 새 시즌으로 넘어갑니다.</div>`;
  h += `<div class="section-t">전체 목록 (Dates 칸을 눌러 사용일 수정, 다른 칸은 의류 상세)</div>` + homeTable(typeGroups(type));
  h += `<div class="card" style="margin-top:12px">
      <label class="row" style="gap:8px"><input type="checkbox" id="endOk" style="width:auto"> 내용을 확인했고 ${esc(s.name)}을(를) 종료합니다</label>
      <button class="btn danger block" id="endBtn" style="margin-top:10px" disabled>이번 시즌 종료하고 최종본 저장</button>
      <a class="btn block" href="#/settings" style="margin-top:8px">아직 종료하지 않음</a></div>`;
  $app.innerHTML = h;
  $app.querySelectorAll('tr[data-i]').forEach((tr) => (tr.onclick = (e) => {
    const dm = e.target.closest('[data-dm]');
    dm ? manageDates(dm.dataset.dm) : go('#/item/' + tr.dataset.i);
  }));
  $app.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => go('#/group/' + b.dataset.g)));
  const ok = document.getElementById('endOk'), btn = document.getElementById('endBtn');
  ok.onchange = () => (btn.disabled = !ok.checked || due.length > 0);
  btn.onclick = () => {
    if (due.length) return alert('날짜가 지난 예정일을 먼저 정리하세요.');
    if (!confirm(`${s.name}을(를) 종료할까요?\n최종본이 저장됩니다. 지난 시즌 기록은 나중에도 고칠 수 있습니다.`)) return;
    const snap = makeSnap(type, 'final', { name: `${s.name} 최종본`, seasonId: s.id });
    if (!addSnap(snap)) return;
    s.status = 'ended';
    db.currentSeason[type] = null;
    save();
    if (confirm(`${s.name}을(를) 종료하고 최종본을 저장했습니다.\n지금까지의 전체 데이터를 엑셀(시즌최종본)로 저장할까요? (권장)`))
      saveFullXlsx(`의류관리_시즌최종본_${s.name.replace(/\s+/g, '')}_${todayStr().replace(/-/g, '')}.xlsx`, '시즌최종본');
    go('#/settings');
  };
}

// ---------- 준비중 시즌 시작: 목록 정리(유지/비활성/제외, 새 목표) ----------
function startSeason(sid) {
  const s = seasonById(sid);
  const type = s.type;
  const act = db.seasons.find((x) => x.type === type && x.status === 'active');
  if (act) {
    if (confirm(`진행중인 ${act.name}을(를) 먼저 종료해야 합니다.\n종료 검토 화면으로 갈까요?`)) go('#/end/' + act.id);
    return;
  }
  const items = db.items.filter((i) => i.type === type).sort((a, b) => (groupById(a.groupId)?.order - groupById(b.groupId)?.order) || a.order - b.order);
  const prev = finalsOf(type)[0];
  const prevCnt = (id) => (prev ? prev.data.usage.filter((u) => u.itemId === id && !u.planned && u.seasonId === prev.seasonId).length : null);
  // 기본값은 지금 상태 그대로. 처분예정(Ex)은 활성이며 비활성은 사용자가 직접만 바꿈
  const defAct = (it) => (it.active ? 'keep' : 'off');
  modal(`<h2>${esc(s.name)} 시작 · 목록 정리</h2>
    <div class="muted" style="margin-bottom:8px">${prev ? `지난 시즌(${esc(prev.seasonName)}) 결과를 보고 옷마다 정하세요.` : '옷마다 정하세요.'} 기본값은 지금 상태 그대로입니다(처분예정도 '유지'). 비활성으로 바꿀 옷만 직접 고르세요. New 표시는 산 해와 다음 해까지만 남고, 그보다 오래된 옷은 지워집니다.</div>
    <form id="f"><div class="tblwrap" style="max-height:55vh;overflow:auto"><table class="sheet stbl" style="font-size:12px"><thead><tr><th>의류</th><th>지난</th><th>목표</th><th>처리</th></tr></thead><tbody>
    ${items.map((it) => { const c = prevCnt(it.id); return `<tr><td>${chip(it, 'sm')} <b>${esc(it.brand)}</b> ${esc(it.color)} · ${esc(it.kind)}${it.nx === 'Ex' ? ' <span class="badge b-ex">Ex</span>' : ''}</td>
      <td class="num">${c == null ? '-' : `${c}/${it.tg}`}</td>
      <td><input type="number" min="0" name="tg_${it.id}" value="${esc(it.tg)}" ></td>
      <td><select name="act_${it.id}">${[['keep', '유지'], ['off', '비활성'], ['del', '제외']].map(([v, t]) => `<option value="${v}" ${defAct(it) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="muted" style="margin-top:6px">'제외'는 목록에서 삭제합니다. 지난 시즌 기록은 최종본에 남습니다.</div>
    <div class="row" style="margin-top:12px"><span class="grow"></span><button type="button" class="btn" id="cancel">취소</button><button class="btn pri">${esc(s.name)} 시작</button></div></form>`, (m, close) => {
    const f = m.querySelector('#f');
    m.querySelector('#cancel').onclick = close;
    f.onsubmit = (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(f));
      const del = items.filter((it) => v['act_' + it.id] === 'del');
      if (del.length && !confirm(`${del.length}벌을 목록에서 제외(삭제)합니다. 계속할까요?`)) return;
      for (const it of items) {
        const a = v['act_' + it.id];
        it.tg = Number(v['tg_' + it.id]) || 0;
        if (a === 'off') it.active = false;
        if (a === 'keep') it.active = true;
      }
      // New는 산 해와 다음 해까지 (예: SS 2027 시작 → 26·27년 산만 New 유지)
      const sy = Number(s.start.slice(2, 4));
      for (const it of items) if (it.nx === 'New' && Number(it.yr) < sy - 1) it.nx = '';
      const delIds = new Set(del.map((i) => i.id));
      db.items = db.items.filter((i) => !delIds.has(i.id));
      db.usage = db.usage.filter((u) => !delIds.has(u.itemId));
      normalizeOrder(db);
      s.status = 'active';
      db.currentSeason[type] = s.id;
      save(); close();
      toast(`${s.name} 시작`);
      go('#/');
    };
  });
}

// ---------- 지난 시즌 보기 (최종본) ----------
function viewPast(snapId) {
  const snap = loadSnaps().find((x) => x.id === snapId);
  if (!snap) return go('#/settings');
  setTop({ title: `${snap.seasonName} (지난 시즌)`, back: true });
  setNav('home');
  const live = db;
  db = snapDb(snap); // 화면을 그리는 동안만 최종본 데이터로
  let h;
  try {
    const items = db.items;
    const tot = groupStats(db, items);
    const s = db.seasons.find((x) => x.id === snap.seasonId) || {};
    h = `<div class="banner">${esc(snap.seasonName)} 최종본 (${snap.created.slice(0, 10)} 저장) · 사용일은 의류 상세에서 고칠 수 있습니다</div>
      <div class="card"><div class="title">${esc(snap.seasonName)}</div><div class="muted">${s.start || ''} ~ ${s.end || ''}</div>
      <div class="stat3" style="margin-top:10px">
        <div><b>${tot.cur}<span class="muted">/${tot.tg}</span></b><span class="muted">사용 ${pct(tot.pct)}</span></div>
        <div><b>${tot.ach}<span class="muted">/${tot.n}</span></b><span class="muted">목표달성</span></div>
        <div><b>${tot.n}</b><span class="muted">의류</span></div>
      </div></div>`;
    for (const g of [...db.groups].sort((a, b) => a.order - b.order)) {
      const list = items.filter((i) => i.groupId === g.id).sort((a, b) => a.order - b.order);
      if (!list.length) continue;
      const st = groupStats(db, list);
      h += `<div class="section-t">${esc(g.name)} <span class="muted">${tempLabel(g)} · ${st.cur}/${st.tg}회 · 달성 ${st.ach}/${st.n}</span></div><div class="clist">` +
        itemTable(list, { headRight: '사용', right: (it) => { const x = itemStats(db, it); return `<div class="rtw"><div class="cnt${x.achieved ? ' ach' : ''}">${x.cur}<span class="muted">/${it.tg}</span></div></div>`; } }) + `</div>`;
    }
  } finally { db = live; }
  $app.innerHTML = h;
  $app.querySelectorAll('[data-pu]').forEach((e) => e.removeAttribute('data-pu')); // 보기 전용 (고치기는 의류 상세의 사용일 기록에서)
}

// ---------- 의류 상세: 지난 시즌에 입은 날 ----------
function pastSeasonsHtml(it) {
  const ended = db.seasons.filter((s) => s.type === it.type && s.status === 'ended').sort((a, b) => b.start.localeCompare(a.start));
  const rows = ended.map((s) => {
    const list = db.usage.filter((u) => u.itemId === it.id && !u.planned && u.seasonId === s.id).sort((a, b) => a.date.localeCompare(b.date));
    const fin = finalsOf(it.type).find((f) => f.seasonId === s.id);
    const tg = fin?.data.items.find((x) => x.id === it.id)?.tg;
    return `<div class="list-date"><span class="grow"><b>${esc(s.name)}</b> <span class="muted">${list.length}${tg != null ? '/' + tg : ''}회</span>
      <div class="muted">${list.length ? shortDates(list) : '입은 날 없음'}</div></span></div>`;
  });
  return rows.length ? `<div class="card"><div class="title" style="margin-bottom:4px">지난 시즌</div>${rows.join('')}</div>` : '';
}

// ---------- 작년 오늘 / 작년 이날 ----------
// 지금 데이터와 최종본의 실제 기록을 합쳐서 찾음 (목록에서 뺀 옷도 나옴). 그날 없으면 앞뒤 3일
function lastYearWorn(date, type) {
  const [y, m, d] = date.split('-').map(Number);
  let target = `${y - 1}-${String(m).padStart(2, '0')}-${String(Math.min(d, m === 2 ? 28 : 31)).padStart(2, '0')}`;
  const items = new Map(), recs = new Map();
  for (const f of finalsOf(type)) {
    f.data.items.forEach((i) => items.set(i.id, i));
    f.data.usage.forEach((u) => { if (!u.planned) recs.set(u.id + u.date, u); });
  }
  db.items.filter((i) => i.type === type).forEach((i) => items.set(i.id, i));
  db.usage.forEach((u) => { if (!u.planned && items.has(u.itemId)) recs.set(u.id + u.date, u); });
  const all = [...recs.values()];
  for (const off of [0, -1, 1, -2, 2, -3, 3]) {
    const day = addDays(target, off);
    const list = all.filter((u) => u.date === day && items.get(u.itemId)?.type === type);
    if (list.length) return { day, off, list: list.map((u) => ({ u, it: items.get(u.itemId) })) };
  }
  return null;
}
function lastYearHtml(date, type, label) {
  const r = lastYearWorn(date, type);
  if (!r) return '';
  const title = r.off === 0 ? `${label} (${r.day} ${weekday(r.day)})` : `${label} · 기록이 없어 가까운 날 ${md(r.day)} (${weekday(r.day)})`;
  return `<div class="section-t">${title}</div><div class="card">` + r.list.map(({ it }) =>
    `<${db.items.includes(it) ? `a href="#/item/${it.id}"` : 'div'} class="list-date" style="color:inherit;text-decoration:none">${chip(it, 'sm')}<span class="grow">${itemTitle(it)}<div class="muted">${specLine(it)}</div></span></${db.items.includes(it) ? 'a' : 'div'}>`).join('') + `</div>`;
}

// ---------- 전체 엑셀에 시즌 최종본 포함 (5년 치 모두, 불러올 때 복원용. 사용일은 사용기록 시트에 이미 있음) ----------
function addFinalsToWorkbook(wb) {
  const finals = ['FW', 'SS'].flatMap((t) => finalsOf(t));
  if (!finals.length) return;
  const restore = [];
  for (const f of finals) {
    const json = JSON.stringify(f);
    for (let i = 0, k = 0; i < json.length; i += 30000, k++) restore.push({ 'ID': f.id, '조각': k, '데이터': json.slice(i, i + 30000) });
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(restore), '최종본(복원용)');
}
function readFinalsFromWorkbook(wb) {
  const ws = wb.Sheets['최종본(복원용)'];
  if (!ws) return [];
  const parts = {};
  for (const r of XLSX.utils.sheet_to_json(ws, { defval: '' })) (parts[r['ID']] ||= []).push(r);
  return Object.values(parts).map((ps) => {
    try { return JSON.parse(ps.sort((a, b) => a['조각'] - b['조각']).map((p) => p['데이터']).join('')); } catch (e) { return null; }
  }).filter(Boolean);
}

// ---------- 이전본: 그날 처음 고치기 직전 상태(FW·SS 전체)를 자동 보관 → 잘못 고친 날 되돌리기 ----------
const PREV_KEY = 'clothes-prev-v1';   // { day: 마지막으로 고친 날, savedAt, data } = 오늘 고치기 전 버전
const UNDO_KEY = 'clothes-undo-v1';   // 되돌리기 직전의 오늘 버전 (다시 오늘 버전으로 돌아갈 때)
const readVer = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const writeVer = (k, v) => { try { v ? localStorage.setItem(k, JSON.stringify(v)) : localStorage.removeItem(k); } catch (e) { /* 공간 부족 시 이전본만 포기 */ } };
// save() 직전에 호출: 마지막으로 고친 날이 오늘이 아니면, 그때까지의 상태를 이전본으로 남김
function keepPrevVersion(lastJson) {
  const today = todayStr();
  if (!lastJson || db.meta.editDay === today) { db.meta.editDay = today; return; }
  const last = JSON.parse(lastJson);
  writeVer(PREV_KEY, { day: last.meta.editDay || (last.meta.updated || '').slice(0, 10), savedAt: last.meta.updated, data: last });
  db.meta.editDay = today;
}
function versionSectionHtml() {
  const prev = readVer(PREV_KEY), undo = readVer(UNDO_KEY);
  const t = (iso) => (iso ? iso.slice(0, 16).replace('T', ' ') : '');
  return `<div class="section-t">되돌리기 (FW·SS 전체)</div><div class="card">
    <div class="list-date"><span class="grow"><b>현재본</b><div class="muted">고칠 때마다 자동 저장 · 최종 ${t(db.meta.updated)}</div></span></div>
    <div class="list-date"><span class="grow"><b>이전본</b><div class="muted">${prev ? `${prev.day || ''} 까지의 상태 · ${t(prev.savedAt)}` : '아직 없음 (다른 날 처음 고칠 때 자동으로 생김)'}</div></span>${prev ? '<button class="btn sm" id="verPrev">이 버전으로 되돌리기</button>' : ''}</div>
    ${undo ? `<div class="list-date"><span class="grow"><b>되돌리기 전 오늘본</b><div class="muted">${t(undo.savedAt)}</div></span><button class="btn sm pri" id="verUndo">오늘본으로 다시</button></div>` : ''}
    <div class="muted" style="margin-top:6px">오늘 잘못 고쳤으면 이전본으로 되돌리세요. 되돌린 뒤에도 '오늘본으로 다시'로 돌아갈 수 있습니다. 시즌 최종본은 바뀌지 않습니다.</div></div>`;
}
function bindVersionSection() {
  document.getElementById('verPrev')?.addEventListener('click', () => {
    const prev = readVer(PREV_KEY);
    if (!confirm(`현재본을 이전본(${prev.day} 까지의 상태)으로 되돌릴까요?\n오늘 고친 버전은 '되돌리기 전 오늘본'으로 남아 다시 돌아갈 수 있습니다.`)) return;
    writeVer(UNDO_KEY, { savedAt: db.meta.updated, data: JSON.parse(JSON.stringify(db)) });
    replaceDb(prev.data);
    toast('이전본으로 되돌렸습니다');
  });
  document.getElementById('verUndo')?.addEventListener('click', () => {
    const undo = readVer(UNDO_KEY);
    if (!confirm('되돌리기 전의 오늘본으로 다시 바꿀까요?')) return;
    writeVer(UNDO_KEY, null);
    replaceDb(undo.data);
    toast('오늘본으로 돌아왔습니다');
  });
}
// 버전 교체: 이전본이 덮이지 않도록 오늘 고친 것으로 표시하고 저장
function replaceDb(data) {
  const view = db.viewType;
  db = JSON.parse(JSON.stringify(data));
  db.viewType = view;
  db.meta.editDay = todayStr();
  normalizeSeasons(db);
  save();
  render();
}
