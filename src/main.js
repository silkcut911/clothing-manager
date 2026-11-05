// ---------- 시작 ----------
checkStorage();
db = load();
if (db.termsVersion !== TERMS_VERSION) normalizeTerms(db); // 표기 통일 (버전이 바뀔 때 한 번)
normalizeOrder(db);
normalizeGroups(db);
normalizeSeasons(db);
pruneOld(); // 5년이 지난 기록·시즌 정리
relinkSeasons(db); // 사용일의 시즌을 날짜로 (FW 8월~다음 해 6월, SS 3월~11월)
// 테스트용 1회 수정: 2026-10-05 사용기록을 착용예정으로 (요청 2026-11-05)
if (!db.meta.fix1005) {
  db.usage.forEach((u) => { if (u.date === '2026-10-05') u.planned = true; });
  db.meta.fix1005 = true;
}
// SS 2026(종료, 최종본 포함)·SS 2027(준비중) 추가: 출력물 사진 기준, 한 번만 (요청 2026-11-05). SS 옷이 이미 있으면 건너뜀
if (!db.meta.ss2026) {
  if (!db.items.some((i) => i.type === 'SS'))
    addSeedSS(db, () => finalsOf('SS').some((f) => f.seasonId === 'SS2026') || addSnap(makeSnap('SS', 'final', { name: 'SS 2026 최종본', baseDate: '2026-09-30', seasonId: 'SS2026' })));
  db.meta.ss2026 = true;
}
save();
render();
// 웹 주소(https)로 열었을 때: 오프라인 실행 + 브라우저가 데이터를 임의로 지우지 않도록 요청
if (location.protocol === 'https:') {
  navigator.serviceWorker?.register('sw.js');
  navigator.storage?.persist?.();
}
