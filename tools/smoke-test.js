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

  // 5. 백업본 저장 (기준일까지 + 예정일)
  await page.evaluate(() => { db.usage.push({ id: 'U9902', date: addDays(todayStr(), 10), itemId: 'C033', seasonId: db.currentSeason.FW, planned: true, memo: '' }); save(); });
  await page.goto(URL + '#/settings'); await wait(200);
  await click('#snapAdd'); await wait(100);
  await page.evaluate(() => { const f = document.querySelector('#f'); f.name.value = 'T'; f.base.value = '2026-10-01'; f.cut.checked = true; });
  await click('#f button.pri'); await wait(200);
  const snap = await page.evaluate(() => { const s = savesOf('FW')[0]; return { maxReal: s.data.usage.filter((u) => !u.planned).map((u) => u.date).sort().pop(), hasPlan: s.data.usage.some((u) => u.id === 'U9902') }; });
  check('백업본: 기준일까지 실제 + 예정일 포함', snap.maxReal <= '2026-10-01' && snap.hasPlan, JSON.stringify(snap));

  // 6. 시즌: 만들기 → 시작 시도(진행중 있어 종료 화면) → 종료 → 시작
  await click('#sAdd'); await wait(100); await click('#f button.pri'); await wait(200);
  await click('[data-sstart]'); await wait(300);
  check('진행중 시즌이 있으면 종료 검토 화면으로', await page.evaluate(() => location.hash.startsWith('#/end/')));
  while (await page.evaluate(() => { const e = document.querySelector('.list-date[data-pu]'); if (e) e.click(); return !!e; })) { await wait(150); await click('#paOk'); await wait(250); }
  await click('#endOk'); await wait(50); await click('#endBtn'); await wait(400);
  const ended = await page.evaluate(() => ({ cur: db.currentSeason.FW, finals: finalsOf('FW').length, locked: removeUsage(db.usage.find((u) => !u.planned).id) === false }));
  check('시즌 종료 → 최종본 + 잠김', ended.cur === null && ended.finals === 1 && ended.locked, JSON.stringify(ended));
  check('진행중 시즌 없으면 기록 막힘', await page.evaluate(() => addUsage('C002', todayStr()) === null));
  await page.goto(URL + '#/settings'); await wait(200);
  await click('[data-sstart]'); await wait(200);
  await click('#f button.pri'); await wait(300);
  const started = await page.evaluate(() => ({ cur: !!db.currentSeason.FW, ex: db.items.filter((i) => i.nx === 'Ex').every((i) => !i.active), news: db.items.filter((i) => i.nx === 'New').length }));
  check('새 시즌 시작 (Ex 비활성, New 해제)', started.cur && started.ex && started.news === 0, JSON.stringify(started));
  const fid = await page.evaluate(() => finalsOf('FW')[0].id);
  await page.goto(URL + '#/past/' + fid); await wait(300);
  check('지난 시즌 보기 (읽기 전용)', await page.evaluate(() => document.querySelectorAll('table.ctbl tr.r1').length > 0 && !document.querySelector('[data-pu]')));

  // 7. 백업본 복원
  await page.evaluate(() => restoreSnap(savesOf('FW').find((x) => x.name === 'T'))); await wait(200);
  check('백업본 복원 + 복원 전 자동 백업', await page.evaluate(() => savesOf('FW').some((x) => x.name === '복원 전 자동')));

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
    const wb = dbToWorkbook(XLSX, db); addFinalsToWorkbook(wb);
    const wb2 = XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
    const nd = workbookToDb(XLSX, wb2);
    const key = (d) => JSON.stringify(d.items.map((i) => [i.id, i.brand, i.color, i.pad, i.tg, i.yr]).sort());
    return { items: key(nd) === key(db), usage: nd.usage.length === db.usage.length, finals: readFinalsFromWorkbook(wb2).length };
  });
  check('엑셀로 저장했다가 불러와도 같음 (+최종본)', rt.items && rt.usage && rt.finals >= 1, JSON.stringify(rt));

  check('전체 과정 오류 없음', errors.length === 0, errors.join(' | '));
  await browser.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });
  console.log(fails.length ? `FAILED: ${fails.join(', ')}` : 'OK');
  process.exit(fails.length ? 1 : 0);
})();
