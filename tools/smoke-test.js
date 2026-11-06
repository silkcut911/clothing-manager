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
  const tableHasModel = await page.evaluate(() => [...document.querySelectorAll('table.sheet th')].map((t) => t.textContent).join(',').includes('색상,Model,Hood,Length'));
  check('모델명: Hood에서 옮김(5개), High Neck·Suit는 Hood에 남음', md.moved && md.kept, JSON.stringify(md));
  check('모델명: 카드 Length 자리에 보임, 전체표에 열 있음', cardHasModel && tableHasModel, `${cardHasModel} ${tableHasModel}`);
  check('모델명: 엑셀 왕복, 예전 엑셀도 옮겨짐', md.rt === 'Viewforth' && md.old === 'Viewforth', JSON.stringify([md.rt, md.old]));

  check('전체 과정 오류 없음', errors.length === 0, errors.join(' | '));
  await browser.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
  console.log(fails.length ? `FAILED: ${fails.join(', ')}` : 'OK');
  process.exit(fails.length ? 1 : 0);
})();
