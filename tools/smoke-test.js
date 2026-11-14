// 회귀 테스트: dist/clothes.html 을 headless Chrome(폰 폭 384px)으로 열어 주요 기능을 확인한다.
// 준비: 아무 폴더에서 `npm i puppeteer-core` 후 NODE_PATH 로 그 node_modules 를 지정하거나, 이 폴더에 설치.
//       Chrome 경로가 다르면 CHROME_PATH 환경변수로 지정.
// 실행: node build.js && node tools/smoke-test.js   → 마지막 줄이 "OK" 이면 통과
const path = require('path');
const fs = require('fs');
const os = require('os');
const puppeteer = require('puppeteer-core');

const URL = 'file:///' + path.resolve(__dirname, '../dist/clothes.html').replace(/\\/g, '/');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [];
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); if (!ok) fails.push(name); };

(async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clothes-test-'));
  // GitHub Actions(리눅스)에서는 Chrome 샌드박스가 막혀 있어 끔
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir, args: process.env.CI ? ['--no-sandbox'] : [] });
  const page = await browser.newPage();
  await page.setViewport({ width: 384, height: 740, deviceScaleFactor: 2, isMobile: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.evaluateOnNewDocument(() => { // 다운로드는 실제로 받지 않음
    const o = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) return; return o.call(this); };
  });
  const click = (sel) => page.evaluate((s) => document.querySelector(s).click(), sel);
  await page.goto(URL); await wait(300);

  // 1. 모든 화면 열기
  for (const h of ['#/', '#/group/G1', '#/group/G4', '#/item/C032', '#/day', '#/cal', '#/settings']) { await page.goto(URL + h); await wait(200); }
  await page.evaluate(() => { db.homeMode = 'table'; save(); render(); }); await wait(200);
  check('모든 화면 오류 없음', errors.length === 0, errors.join(' | '));

  // 2. 폰 폭: 그룹 표가 화면 안에 들어가는지
  const fits = [];
  for (const g of ['G1', 'G2', 'G3', 'G4', 'G5', 'G6']) {
    await page.goto(URL + '#/group/' + g); await wait(200);
    fits.push(await page.evaluate(() => { const t = document.querySelector('table.ctbl'); return t.getBoundingClientRect().width <= t.parentElement.clientWidth + 1; }));
  }
  check('384px에서 그룹 표가 화면 폭 안', fits.every(Boolean), JSON.stringify(fits));

  // 2-1. SS 추가 데이터: SS 2026 종료(최종본) + SS 2027 준비중, 12벌
  const ss = await page.evaluate(() => {
    const items = db.items.filter((i) => i.type === 'SS');
    const real = db.usage.filter((u) => u.seasonId === 'SS2026' && !u.planned).length;
    const fin = finalsOf('SS')[0];
    return { n: items.length, tg27: items.reduce((a, i) => a + i.tg, 0), real, s26: seasonById('SS2026')?.status, s27: seasonById('SS2027')?.status,
      finTg: fin && fin.data.items.reduce((a, i) => a + i.tg, 0), groups: db.groups.filter((g) => g.type === 'SS').length };
  });
  check('SS 2026·2027 추가', JSON.stringify(ss) === JSON.stringify({ n: 12, tg27: 36, real: 37, s26: 'ended', s27: 'ready', finTg: 35, groups: 3 }), JSON.stringify(ss));

  // 3. 표기 규칙
  const terms = await page.evaluate(() => [normalizeTerm('hood', 'hidden hood'), normalizeTerm('brand', 'Emporio Armani'), normalizeTerm('pocket', '2 Flap + 2 Zip'), normalizeTerm('pad', 'cross quilt'), normalizeYr(2023)]);
  check('표기 규칙', JSON.stringify(terms) === JSON.stringify(['Hdn Hood', 'Emporio A.', '2F+2Z', 'Cross Qlt', 23]), JSON.stringify(terms));

  // 4. 예정일: 날짜가 지나도 자동 전환 안 됨 → 눌러서 확정
  await page.evaluate(() => { db.usage.push({ id: 'U9901', date: addDays(todayStr(), -2), itemId: 'C032', seasonId: db.currentSeason.FW, planned: true, memo: '' }); save(); });
  await page.reload(); await wait(300);
  check('지난 예정일은 그대로 예정', await page.evaluate(() => db.usage.find((u) => u.id === 'U9901').planned === true));
  await page.evaluate(() => planAction('U9901')); await wait(150);
  await click('#paOk'); await wait(200);
  check('예정일 → 실제로 확정', await page.evaluate(() => db.usage.find((u) => u.id === 'U9901').planned === false));

  // 5. 엑셀로 저장 = 최신본 (파일 이름, 이전 최신본 이름 기억), 백업본 칸 없음
  await page.goto(URL + '#/settings'); await wait(200);
  check('설정에 백업본 칸 없음', await page.evaluate(() => !document.getElementById('snapAdd')));
  await click('#exp'); await wait(200);
  await click('#exp'); await wait(200);
  const exp = await page.evaluate(() => db.meta.lastExportName || '');
  check('엑셀로 저장 → 의류관리_최신본_날짜_시각', /^의류관리_최신본_\d{8}_\d{4}\.xlsx$/.test(exp), exp);

  // 6. 시즌: 만들기 → 시작 시도(진행중 있어 종료 화면) → 종료 → 시작
  await page.goto(URL + '#/settings'); await wait(200);
  await click('#sAdd'); await wait(100); await click('#f button.pri'); await wait(200);
  await click('[data-sstart]'); await wait(300);
  check('진행중 시즌이 있으면 종료 검토 화면으로', await page.evaluate(() => location.hash.startsWith('#/end/')));
  while (await page.evaluate(() => { const e = document.querySelector('.list-date[data-pu]'); if (e) e.click(); return !!e; })) { await wait(150); await click('#paOk'); await wait(250); }
  await click('#endOk'); await wait(50); await click('#endBtn'); await wait(400);
  const ended = await page.evaluate(() => ({ cur: db.currentSeason.FW, finals: finalsOf('FW').length }));
  check('시즌 종료 → 최종본', ended.cur === null && ended.finals === 1, JSON.stringify(ended));
  // 지난 시즌 기록도 고칠 수 있고, 고치면 최종본에도 반영
  const past = await page.evaluate(() => {
    const sid = finalsOf('FW')[0].seasonId;
    const recs = db.usage.filter((u) => !u.planned && u.seasonId === sid);
    const [a, b] = recs;
    a.memo = 'past-edit'; syncFinal(a);
    removeUsage(b.id);
    const f = finalsOf('FW')[0];
    return { memo: f.data.usage.find((u) => u.id === a.id)?.memo, removed: !f.data.usage.some((u) => u.id === b.id) && !db.usage.some((u) => u.id === b.id) };
  });
  check('지난 시즌 기록 수정·삭제 → 최종본에도 반영', past.memo === 'past-edit' && past.removed, JSON.stringify(past));
  // 시즌은 옷의 구분 + 날짜로 (FW 8월~다음 해 6월, SS 3월~11월). 기간 밖은 막고, 시즌이 없으면 시즌 없이 기록 → 시즌을 만들면 들어감
  const win = await page.evaluate(() => {
    const fw = db.items.find((i) => i.type === 'FW' && i.active), ss = db.items.find((i) => i.type === 'SS');
    const julBlocked = addUsage(fw.id, '2026-07-15', { silent: true }) === null;
    const decBlocked = addUsage(ss.id, '2025-12-10', { silent: true }) === null;
    const toEnded = addUsage(fw.id, '2027-05-02', { silent: true, planned: false }); // 종료된 FW 2026-27 기간 → 그 최종본에도
    const inFinal = finalsOf('FW')[0].data.usage.some((u) => u.id === toEnded.id);
    const noSeason = addUsage(fw.id, '2025-10-10', { silent: true, planned: false }); // FW 2025-26 시즌 없음
    const orphan = noSeason.seasonId === '';
    db.seasons.push({ id: 'FW2025', type: 'FW', name: 'FW 2025-26', start: '2025-09-01', end: '2026-04-30', status: 'ready' });
    relinkSeasons(db);
    const linked = db.usage.find((u) => u.id === noSeason.id).seasonId === 'FW2025';
    db.seasons = db.seasons.filter((s) => s.id !== 'FW2025');
    db.usage = db.usage.filter((u) => u.id !== noSeason.id); relinkSeasons(db); save();
    return { julBlocked, decBlocked, toEnded: toEnded.seasonId === finalsOf('FW')[0].seasonId, inFinal, orphan, linked };
  });
  check('시즌은 날짜로: 기간 밖 막기, 지난 시즌 추가, 시즌 없으면 나중에 연결', win.julBlocked && win.decBlocked && win.toEnded && win.inFinal && win.orphan && win.linked, JSON.stringify(win));
  await page.goto(URL + '#/settings'); await wait(200);
  const before = await page.evaluate(() => JSON.stringify(db.items.filter((i) => i.type === 'FW').map((i) => [i.id, i.active])));
  await click('[data-sstart]'); await wait(200);
  await click('#f button.pri'); await wait(300);
  const started = await page.evaluate((b) => {
    const sy = Number(seasonById(db.currentSeason.FW).start.slice(2, 4));
    const fw = db.items.filter((i) => i.type === 'FW');
    return { cur: !!db.currentSeason.FW, sameActive: JSON.stringify(fw.map((i) => [i.id, i.active])) === b, exActive: fw.some((i) => i.nx === 'Ex' && i.active), oldNew: fw.filter((i) => i.nx === 'New' && i.yr < sy - 1).length };
  }, before);
  check('새 시즌 시작 (활성/비활성 그대로·Ex도 활성, New는 산 해와 다음 해까지)', started.cur && started.sameActive && started.exActive && started.oldNew === 0, JSON.stringify(started));
  const fid = await page.evaluate(() => finalsOf('FW')[0].id);
  await page.goto(URL + '#/past/' + fid); await wait(300);
  check('지난 시즌 보기 (엑셀 버튼 없음)', await page.evaluate(() => document.querySelectorAll('table.ctbl tr.r1').length > 0 && !document.querySelector('[data-pu]') && !document.getElementById('pxBtn')));

  // 7. 5년 보관: 5년 넘은 기록·종료 시즌·최종본 정리
  const pr = await page.evaluate(() => {
    const it = db.items[0];
    db.usage.push({ id: 'U9990', date: addDays(todayStr(), -365 * 5 - 10), itemId: it.id, seasonId: 'OLD', planned: false, memo: '' });
    db.usage.push({ id: 'U9991', date: addDays(todayStr(), -365 * 4), itemId: it.id, seasonId: 'OLD2', planned: false, memo: '' });
    db.seasons.push({ id: 'OLD', type: 'FW', name: 'FW 2020-21', start: '2020-09-01', end: '2021-04-30', status: 'ended' });
    addSnap({ id: 'SOLD', type: 'FW', kind: 'final', seasonId: 'OLD', seasonName: 'FW 2020-21', seasonStart: '2020-09-01', created: '2021-05-01', data: { seasons: [], groups: [], items: [], usage: [], colors: [] } });
    pruneOld();
    return { oldGone: !db.usage.some((u) => u.id === 'U9990'), recentKept: db.usage.some((u) => u.id === 'U9991'), seasonGone: !seasonById('OLD'), finalGone: !loadSnaps().some((x) => x.id === 'SOLD') };
  });
  check('5년 지난 기록·시즌·최종본 정리, 4년 전 기록은 유지', Object.values(pr).every(Boolean), JSON.stringify(pr));
  await page.evaluate(() => { db.usage = db.usage.filter((u) => u.id !== 'U9991'); save(); });

  // 8. 이전본 되돌리기 (어제 고친 데이터 → 오늘 잘못 고침 → 되돌리기 → 오늘본으로 다시)
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('clothes-db-v1')); d.meta.editDay = '2000-01-01'; d.items[0].memo = 'yesterday'; localStorage.setItem('clothes-db-v1', JSON.stringify(d)); localStorage.removeItem('clothes-undo-v1'); });
  await page.reload(); await wait(300);
  await page.evaluate(() => { db.items[0].memo = 'wrong'; save(); });
  await page.goto(URL + '#/settings'); await wait(200);
  await click('#verPrev'); await wait(300);
  const back = await page.evaluate(() => db.items[0].memo);
  await page.goto(URL + '#/settings'); await wait(200);
  await click('#verUndo'); await wait(300);
  const again = await page.evaluate(() => db.items[0].memo);
  check('이전본 되돌리기 / 오늘본으로 다시', back === 'yesterday' && again === 'wrong', `${back} → ${again}`);

  // 9. 엑셀로 저장 → 불러오기 결과가 같은지
  const rt = await page.evaluate(() => {
    const wb = dbToWorkbook(XLSX, db, '최신본'); addFinalsToWorkbook(wb);
    const wb2 = XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    const nd = workbookToDb(XLSX, wb2);
    const key = (d) => JSON.stringify(d.items.map((i) => [i.id, i.brand, i.color, i.pad, i.tg, i.yr]).sort());
    const info = Object.fromEntries(XLSX.utils.sheet_to_json(wb2.Sheets['정보']).map((r) => [r['항목'], r['값']]));
    return { items: key(nd) === key(db), usage: nd.usage.length === db.usage.length, finals: readFinalsFromWorkbook(wb2).length === finalsOf('FW').length + finalsOf('SS').length, kind: info['파일종류'], noFinalSheets: !wb2.SheetNames.some((n) => n.endsWith(' 최종')) };
  });
  check('엑셀로 저장했다가 불러와도 같음 (+모든 최종본, 파일종류, 펼친 시트 없음)', rt.items && rt.usage && rt.finals && rt.kind === '최신본' && rt.noFinalSheets, JSON.stringify(rt));

  // 10. 모델명: Hood에 있던 값 옮김, 카드(Length 자리)·전체표·엑셀에 보임, 예전 엑셀(모델명 열 없음)도 불러옴
  const md = await page.evaluate(() => {
    const by = (b, m) => db.items.find((i) => i.brand.startsWith(b) && i.model === m);
    const moved = ['Viewforth', 'Powell', 'Pea Coat', 'Packable', 'Waist Tied'].every((m) => db.items.some((i) => i.model === m && !i.hood));
    const kept = db.items.some((i) => i.hood === 'High Neck') && db.items.some((i) => i.hood === 'Suit');
    const vf = by('Barbour', 'Viewforth');
    const wb = dbToWorkbook(XLSX, db, '최신본');
    const rt = workbookToDb(XLSX, XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
    // 예전 엑셀 흉내: 모델명 열을 빼고 Hood에 다시 넣음
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['의류목록']).map((r) => { const o = { ...r }; if (o['Model']) o['Hood'] = o['Model']; delete o['Model']; return o; });
    wb.Sheets['의류목록'] = XLSX.utils.json_to_sheet(rows);
    const old = workbookToDb(XLSX, XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))); moveModels(old);
    return { moved, kept, id: vf && vf.id, group: vf && vf.groupId, rt: rt.items.find((i) => i.id === vf.id).model, old: old.items.find((i) => i.id === vf.id).model };
  });
  await page.goto(URL + '#/group/' + md.group); await wait(200);
  const cardHasModel = await page.evaluate(() => document.querySelector('#app').innerText.includes('Viewforth') && ![...document.querySelectorAll('th')].some((t) => t.textContent.trim() === 'Length'));
  await page.goto(URL + '#/'); await page.evaluate(() => { db.homeMode = 'table'; save(); render(); }); await wait(200);
  const tableHasModel = await page.evaluate(() => [...document.querySelectorAll('table.sheet th')].map((t) => t.textContent).join(',').includes('Color,Model,Hood,Length'));
  check('모델명: Hood에서 옮김(5개), High Neck·Suit는 Hood에 남음', md.moved && md.kept, JSON.stringify(md));
  check('모델명: 카드 Length 자리에 보임, 전체표에 열 있음', cardHasModel && tableHasModel, `${cardHasModel} ${tableHasModel}`);
  const brandTitle = await page.evaluate(() => { const h = document.querySelector('header.top h1'); return h.classList.contains('brand') && h.textContent === 'Silk Wardrobe' && document.title === 'Silk Wardrobe'; });
  const oldColor = await page.evaluate(() => {
    const wb = dbToWorkbook(XLSX, db, '최신본');
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['의류목록']).map((r) => { const o = { ...r, '색상': r['Color'] }; delete o['Color']; return o; });
    wb.Sheets['의류목록'] = XLSX.utils.json_to_sheet(rows);
    const nd = workbookToDb(XLSX, XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
    return nd.items.every((i) => i.color === db.items.find((x) => x.id === i.id).color);
  });
  check('앱 이름 Silk Wardrobe(대문자 제목), 예전 엑셀의 색상 열도 읽음', brandTitle && oldColor, `${brandTitle} ${oldColor}`);
  check('모델명: 엑셀 왕복, 예전 엑셀도 옮겨짐', md.rt === 'Viewforth' && md.old === 'Viewforth', JSON.stringify([md.rt, md.old]));

  // 11. 옷 그림 = 길이 4 × 목 3(후드·칼라·일반), 모든 그림 CSS 있음
  const shp = await page.evaluate(() => {
    const t = (o) => shapeOf({ length: '', kind: '', hood: '', ...o });
    const cases = [t({ hood: 'Hood', length: 'Short-Ln' }) === 'short-hood', t({ hood: 'Fur Hood', length: 'Long-Ln' }) === 'long-hood', t({ hood: 'Hdn Hood' }) === 'medium-plain',
      t({ hood: 'China Cllr' }) === 'medium-plain', t({ hood: 'Shirt Cllr', length: 'Rbd Waist' }) === 'waist-collar', t({ kind: 'Coat' }) === 'long-collar', t({ kind: 'Jacket' }) === 'medium-plain', t({ hood: 'Hood', kind: 'Coat' }) === 'long-hood'];
    const css = [...document.styleSheets].flatMap((s) => [...s.cssRules].map((r) => r.selectorText || ''));
    const all = db.items.every((i) => css.includes('.shp-' + shapeOf(i)));
    return { cases, all };
  });
  const db0id = await page.evaluate(() => db.items.find((i) => i.hood === 'Hood').id);
  // Hood 값의 목 모양은 설정에서 고름: China Cllr → 칼라로 바꾸면 그 옷 그림이 바뀌고, 엑셀 왕복해도 유지, 새 값은 일반
  const nk = await page.evaluate(() => {
    const it = db.items.find((i) => i.hood === 'China Cllr'), before = shapeOf(it);
    db.neck['china cllr'] = 'collar'; const after = shapeOf(it);
    const nd = workbookToDb(XLSX, XLSX.read(XLSX.write(dbToWorkbook(XLSX, db, '최신본'), { type: 'array', bookType: 'xlsx' })));
    const kept = nd.neck['china cllr'] === 'collar' && nd.neck['hood'] === 'hood';
    delete db.neck['china cllr'];
    return { before, after, kept, fresh: shapeOf({ hood: 'Stand Cllr', length: 'Med-Ln' }) };
  });
  await page.goto(URL + '#/settings'); await wait(200);
  const sel = await page.evaluate(() => { document.querySelector('details[data-tf="hood"]').open = true; return document.querySelectorAll('select[data-nk]').length; });
  // 의류 수정에서 Hood 새 값 입력 → 그림 모양도 고름
  await page.goto(URL + '#/item/' + db0id); await wait(200);
  await click('#editBtn'); await wait(150);
  const np = await page.evaluate(() => {
    const f = document.querySelector('form'), sel = f.elements['hood'];
    sel.value = '__new'; sel.dispatchEvent(new Event('change'));
    const shown = !f.querySelector('.neckpick').hidden;
    f.elements['hood__new'].value = 'Stand Cllr'; f.elements['hood__neck'].value = 'collar';
    f.requestSubmit();
    return shown;
  }); await wait(200);
  const np2 = await page.evaluate((id) => [db.items.find((i) => i.id === id).hood, db.neck['stand cllr'], shapeOf(db.items.find((i) => i.id === id)).endsWith('-collar')], db0id);
  check('의류 수정: Hood 새 값 입력 시 그림 모양 선택 → 저장', np && np2[0] === 'Stand Cllr' && np2[1] === 'collar' && np2[2], JSON.stringify([np, ...np2]));
  check('목 모양 설정: 바꾸면 그림 바뀜, 엑셀 왕복 유지, 새 값은 일반, 설정에 선택 칸', nk.before.endsWith('-plain') && nk.after.endsWith('-collar') && nk.kept && nk.fresh === 'medium-plain' && sel > 5, JSON.stringify({ ...nk, sel }));
  check('옷 그림: 길이 × 목(후드·칼라·일반) 규칙, 모든 옷의 그림 있음', shp.cases.every(Boolean) && shp.all, JSON.stringify(shp));

  // 속성 값 수정: 실제 수정 폼으로 모든 필드, FW·SS·비활성, 중복 검사와 복원 확인
  await page.goto(URL + '#/settings'); await wait(200);
  const termEdit = await page.evaluate(() => {
    const original = JSON.stringify(db), finals = localStorage.getItem(SNAP_KEY);
    const results = [];
    const submit = (value) => {
      const form = document.querySelector('#termEdit');
      form.elements.namedItem('value').value = value;
      form.elements.namedItem('value').dispatchEvent(new Event('input'));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    };
    for (const field of TERM_FIELDS) {
      const before = 'Test Old', after = normalizeTerm(field, 'test new');
      db.terms[field].push(before, normalizeTerm(field, 'Test Existing'));
      const fixtures = ['FW', 'SS'].map((type, index) => ({ ...db.items[0], id: 'TEST' + index, type, active: !index, [field]: before }));
      db.items.push(...fixtures);
      if (field === 'hood') db.neck[neckKey(before)] = 'collar';
      render();
      document.querySelector(`details[data-tf="${field}"]`).open = true;
      document.querySelector(`[data-te="${field}"][data-v="${before}"]`).click();
      submit('   ');
      const blankBlocked = !!document.querySelector('#termEdit') && fixtures.every((it) => it[field] === before);
      submit('test existing');
      const duplicateBlocked = !!document.querySelector('#termEdit') && !!document.querySelector('#termError').textContent;
      submit('test new');
      const renamed = fixtures.every((it) => it[field] === after) && !db.terms[field].includes(before) && db.terms[field].includes(after);
      const opened = document.querySelector(`details[data-tf="${field}"]`).open;
      const hood = field !== 'hood' || (db.neck[neckKey(after)] === 'collar' && !db.neck[neckKey(before)]);
      const restored = workbookToDb(XLSX, XLSX.read(XLSX.write(dbToWorkbook(XLSX, db), { type: 'array', bookType: 'xlsx' })));
      const excel = restored.items.filter((it) => it.id.startsWith('TEST')).every((it) => it[field] === after) && restored.terms[field].includes(after) && (field !== 'hood' || restored.neck[neckKey(after)] === 'collar');
      results.push({ field, blankBlocked, duplicateBlocked, renamed, opened, hood, excel });
      db = JSON.parse(original);
    }
    const finalsUnchanged = localStorage.getItem(SNAP_KEY) === finals;
    // 미사용 값 수정과 취소도 확인
    db.terms.fit.push('Unused Test'); render();
    editTerm('fit', 'Unused Test'); submit('Unused New');
    const unused = db.terms.fit.includes('Unused New') && !db.terms.fit.includes('Unused Test');
    editTerm('fit', 'Unused New'); document.querySelector('.modal #cancel').click();
    const cancel = db.terms.fit.includes('Unused New') && !document.querySelector('#termEdit');
    db = JSON.parse(original); save(); render();
    return { results, finalsUnchanged, unused, cancel };
  });
  check('속성 이름 수정: 전체 필드·FW/SS·비활성·입력 검사·Hood·엑셀·최종본 유지', termEdit.results.every((r) => Object.entries(r).every(([k, v]) => k === 'field' || v)) && termEdit.finalsUnchanged && termEdit.unused && termEdit.cancel, JSON.stringify(termEdit));
  await page.evaluate(() => { document.querySelector('.toast')?.remove(); document.querySelector('details[data-tf="hood"]').open = true; });
  await page.screenshot({ path: path.resolve(__dirname, '../dist/term-edit-settings-384.png'), fullPage: true });
  await click('[data-te="hood"]');
  await page.screenshot({ path: path.resolve(__dirname, '../dist/term-edit-dialog-384.png') });
  await click('.modal #cancel');
  await page.evaluate(() => {
    db.terms.fit.push('Reload Old'); save(); render(); editTerm('fit', 'Reload Old');
    const form = document.querySelector('#termEdit');
    form.elements.namedItem('value').value = 'Reload New'; form.requestSubmit();
  });
  await page.reload(); await wait(200);
  check('속성 수정 후 새로고침에도 새 이름 유지', await page.evaluate(() => db.terms.fit.includes('Reload New') && !db.terms.fit.includes('Reload Old')));
  await page.evaluate(() => { db.terms.fit = db.terms.fit.filter((v) => v !== 'Reload New'); save(); });

  // 검색 버튼에서 실제 입력·범위 변경·상세 복귀·한글 조합을 확인한다.
  const searchDb = await page.evaluate(() => {
    const original = JSON.stringify(db);
    for (const [index, type] of ['FW', 'SS'].entries()) db.items.push({ ...db.items[0], id: 'SEARCH' + index, type,
      groupId: typeGroups(type)[0].id, brand: 'SearchBrand', color: 'Navy', model: 'Search Model', memo: '검색테스트 <img src=x>', active: !index });
    db.viewType = 'FW'; db.homeMode = 'group'; save(); return original;
  });
  await page.goto(URL + '#/'); await wait(100); await click('[data-mode="search"]');
  const searchInput = async (value) => page.evaluate((v) => {
    const input = document.querySelector('#clothesSearch'); input.value = v;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return [...document.querySelectorAll('[data-search-item]')].map((r) => r.dataset.searchItem);
  }, value);
  const currentHits = await searchInput('sEaRcHbRaNd navy');
  check('검색: 대소문자·다중 단어·현재 구분', JSON.stringify(currentHits) === JSON.stringify(['SEARCH0']));
  await page.evaluate(() => { const select = document.querySelector('#searchScope'); select.value = 'all'; select.dispatchEvent(new Event('change')); });
  check('검색: 전체 구분·비활성 포함', await page.evaluate(() => document.querySelectorAll('[data-search-item]').length === 2 && document.querySelector('[data-search-item="SEARCH1"]').classList.contains('off')));
  check('검색: Model·메모·한글 및 HTML 안전 표시', (await searchInput('model 검색테스트')).length === 2 && await page.evaluate(() => !document.querySelector('#searchResults img')));
  check('검색: 결과 없음', (await searchInput('nothing-found-123')).length === 0 && await page.evaluate(() => document.querySelector('#searchResults').textContent.includes('검색 결과가 없습니다')));
  await searchInput('검색테스트');
  const composing = await page.evaluate(() => {
    const input = document.querySelector('#clothesSearch'); input.focus(); input.value = '조합중';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    const held = document.querySelectorAll('[data-search-item]').length === 2 && document.activeElement === input;
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    return held && !document.querySelector('[data-search-item]') && document.activeElement === input;
  });
  check('검색: 한글 조합 중 초점·결과 유지, 조합 후 갱신', composing);
  await searchInput('SearchBrand Navy');
  await page.evaluate(() => document.querySelector('#clothesSearch').scrollIntoView({ block: 'start' })); await wait(100);
  const searchY = await page.evaluate(() => scrollY);
  await page.screenshot({ path: path.resolve(__dirname, '../dist/clothes-search-384.png') });
  check('검색: 384px 가로 넘침 없음', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await click('[data-search-item="SEARCH1"]'); await wait(100);
  check('검색 결과 → 의류 상세', await page.evaluate(() => location.hash === '#/item/SEARCH1'));
  await page.goBack(); await wait(150);
  check('검색: 상세 복귀 시 검색어·범위·스크롤 유지', await page.evaluate((y) => document.querySelector('#clothesSearch').value === 'SearchBrand Navy' && document.querySelector('#searchScope').value === 'all' && Math.abs(scrollY - y) < 3, searchY));
  await click('#clearSearch');
  check('검색 초기화 → 이전 그룹별 보기', await page.evaluate(() => !document.querySelector('#clothesSearch') && document.querySelector('[data-mode="group"]').classList.contains('on')));
  await click('[data-mode="search"]'); await searchInput('SearchBrand');
  await page.reload(); await wait(150);
  check('검색: 새로고침 시 초기화', await page.evaluate(() => !document.querySelector('#clothesSearch')));
  await page.evaluate((original) => { db = JSON.parse(original); homeSearch.active = false; homeSearch.query = ''; save(); }, searchDb);

  // 날짜별 착용 확인: 오늘 포함, FW/SS 공통, 명시적 없음 확인과 저장/복원
  const wearOriginal = await page.evaluate(() => {
    const original = JSON.stringify(db), today = todayStr(), start = addDays(today, -10);
    db.usage = db.usage.filter((u) => u.date < start);
    const fw = db.items.find((it) => it.type === 'FW'), ss = db.items.find((it) => it.type === 'SS');
    db.usage.push({ id: 'CHECKFW', itemId: fw.id, date: addDays(today, -1), planned: false },
      { id: 'CHECKSS', itemId: ss.id, date: addDays(today, -2), planned: false },
      { id: 'CHECKPLAN', itemId: fw.id, date: addDays(today, -3), planned: true });
    db.dailyChecks = { start, none: [addDays(today, -4)] }; save(); render(); return original;
  });
  await page.goto(URL + '#/'); await wait(100);
  const wearState = await page.evaluate(() => {
    const today = todayStr(), missing = missingWearDays(db);
    return { today: missing.includes(today), count: missing.length, bothTypes: !missing.includes(addDays(today, -1)) && !missing.includes(addDays(today, -2)),
      planned: missing.includes(addDays(today, -3)), none: !missing.includes(addDays(today, -4)),
      oneLine: document.querySelector('#missingWearText').scrollWidth <= document.querySelector('#missingWearText').clientWidth,
      summary: document.querySelector('#missingWearText').textContent };
  });
  check('착용 확인: 오늘 포함·FW/SS 실제 기록·없음 확인·예정 구분', wearState.today && wearState.count === 8 && wearState.bothTypes && wearState.planned && wearState.none, JSON.stringify(wearState));
  check('착용 확인: 홈 안내 한 줄·총 일수 요약', wearState.oneLine && wearState.summary.includes('등 총 8일'));
  await page.screenshot({ path: path.resolve(__dirname, '../dist/wear-check-home-384.png') });
  await page.setViewport({ width: 360, height: 740, deviceScaleFactor: 2, isMobile: true }); await wait(100);
  check('착용 확인: 360px에서도 한 줄·가로 넘침 없음', await page.evaluate(() => document.querySelector('#missingWearText').scrollWidth <= document.querySelector('#missingWearText').clientWidth && document.documentElement.scrollWidth <= innerWidth + 1));
  await page.setViewport({ width: 384, height: 740, deviceScaleFactor: 2, isMobile: true });
  await click('#missingWear'); await wait(100);
  check('착용 확인: 전체 미확인 날짜 화면', await page.evaluate(() => location.hash === '#/checks' && document.querySelectorAll('a[href^="#/day/"]').length === 8));
  await click('#wearStartEdit');
  await page.evaluate(() => { document.querySelector('#wearStartDate').value = addDays(todayStr(), -7); document.querySelector('#wearStartForm').requestSubmit(); });
  check('착용 확인 시작일 변경', await page.evaluate(() => db.dailyChecks.start === addDays(todayStr(), -7)));
  const wearToday = await page.evaluate(() => todayStr());
  await page.goto(URL + '#/day/' + wearToday); await wait(100);
  await page.screenshot({ path: path.resolve(__dirname, '../dist/wear-check-day-384.png') });
  await click('#noWearConfirm');
  check('착용 의류 없음 확인 → 오늘 경고 해제', await page.evaluate(() => db.dailyChecks.none.includes(todayStr()) && !missingWearDays(db).includes(todayStr())));
  await page.reload(); await wait(100);
  check('착용 의류 없음 확인 새로고침 유지', await page.evaluate(() => !!document.querySelector('#noWearCancel')));
  await click('#noWearCancel');
  check('없음 확인 취소 → 다시 미확인', await page.evaluate(() => missingWearDays(db).includes(todayStr())));
  await click('#noWearConfirm');
  const wearData = await page.evaluate(() => {
    const today = todayStr(), before = JSON.stringify(db.dailyChecks);
    const wb = dbToWorkbook(XLSX, db);
    const restored = workbookToDb(XLSX, XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
    const excel = JSON.stringify(restored.dailyChecks) === before;
    delete wb.Sheets['착용확인']; wb.SheetNames = wb.SheetNames.filter((n) => n !== '착용확인');
    const old = workbookToDb(XLSX, wb), legacy = old.dailyChecks.start === today && old.dailyChecks.none.length === 0;
    const simple = { usage: [] }; normalizeDailyChecks(simple, today); normalizeDailyChecks(simple, addDays(today, 1));
    const migration = simple.dailyChecks.start === today;
    const type = windowYear('FW', today) != null ? 'FW' : 'SS';
    const item = db.items.find((it) => it.type === type);
    const added = addUsage(item.id, today, { silent: true });
    const replaced = !!added && !db.dailyChecks.none.includes(today) && !missingWearDays(db).includes(today);
    markNoWear(today); const blockedReal = !db.dailyChecks.none.includes(today);
    markNoWear(addDays(today, -3)); const blockedPlan = !db.dailyChecks.none.includes(addDays(today, -3));
    removeUsage(added.id); const deleted = missingWearDays(db).includes(today);
    markNoWear(addDays(today, 1)); const future = !db.dailyChecks.none.includes(addDays(today, 1));
    const version = JSON.parse(JSON.stringify(db)); version.dailyChecks.none.push(today); replaceDb(version);
    const restoredVersion = db.dailyChecks.none.includes(today);
    const normalized = { usage: [], dailyChecks: { start: today, none: ['invalid', '2026-02-30', addDays(today, 1), addDays(today, -365 * 5 - 1), today, today] } };
    normalizeDailyChecks(normalized, today);
    return { excel, legacy, migration, replaced, blockedReal, blockedPlan, deleted, future, restoredVersion, clean: JSON.stringify(normalized.dailyChecks.none) === JSON.stringify([today]) };
  });
  check('착용 확인: 엑셀·예전 엑셀·마이그레이션·실제 추가/삭제·충돌·미래 차단·버전 복원·5년 정리', Object.values(wearData).every(Boolean), JSON.stringify(wearData));
  await page.goto(URL + '#/day/' + await page.evaluate(() => addDays(todayStr(), 1))); await wait(100);
  check('미래 날짜에는 착용 의류 없음 확인 없음', await page.evaluate(() => !document.querySelector('#noWearConfirm')));
  await page.evaluate((original) => { db = JSON.parse(original); save(); }, wearOriginal);

  check('전체 과정 오류 없음', errors.length === 0, errors.join(' | '));
  await browser.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
  console.log(fails.length ? `FAILED: ${fails.join(', ')}` : 'OK');
  process.exit(fails.length ? 1 : 0);
})();
