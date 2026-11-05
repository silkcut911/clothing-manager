// ---------- 시작 ----------
checkStorage();
db = load();
if (db.termsVersion !== TERMS_VERSION) normalizeTerms(db); // 표기 통일 (버전이 바뀔 때 한 번)
normalizeOrder(db);
normalizeGroups(db);
normalizeSeasons(db);
// 테스트용 1회 수정: 2026-10-05 사용기록을 착용예정으로 (요청 2026-11-05)
if (!db.meta.fix1005) {
  db.usage.forEach((u) => { if (u.date === '2026-10-05') u.planned = true; });
  db.meta.fix1005 = true;
}
save();
render();
// 웹 주소(https)로 열었을 때: 오프라인 실행 + 브라우저가 데이터를 임의로 지우지 않도록 요청
if (location.protocol === 'https:') {
  navigator.serviceWorker?.register('sw.js');
  navigator.storage?.persist?.();
}
