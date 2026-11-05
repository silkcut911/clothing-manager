# 의류관리 앱 — AI·개발자용 작업 안내

이 문서는 이 프로그램을 고치는 AI(Claude, ChatGPT, Gemini 등)와 개발자를 위한 것입니다.
사용법은 [README.md](README.md)에 있습니다.
여기 적힌 규칙은 **사용자가 하나하나 확인하고 정한 것**입니다. 바꾸려면 먼저 사용자에게 물어보세요.

## 0. 작업 원칙 (반드시 지킬 것)
1. **계획을 먼저 보여 주고, 사용자가 승인한 뒤 고친다.** 사용자가 "안을 줘", "의견 먼저"라고 하면 코드를 건드리지 않는다.
2. 요청받지 않은 기존 동작, 표기, 화면 배치는 **바꾸지 않는다.** 아래 "확정된 규칙"과 부딪히는 요청이 오면 먼저 확인한다.
3. 사용자와의 대화와 화면 문구는 **한국어**로 쓴다. 의류 속성 값(Brand, Hood 등)은 영어로 쓴다.
4. 고친 뒤에는 `node build.js`를 실행하고 [tools/smoke-test.js](tools/smoke-test.js)로 확인한다. 화면을 고쳤으면 폰 폭(384px)에서 스크린샷을 찍어 본다.
5. 기능이나 규칙이 바뀌면 **README.md(사용법)와 이 문서를 같이 고친다.**
6. **실제 데이터는 이 폴더(저장소)에 없다.** 저장소는 공개(Public)이므로 실제 데이터 엑셀을 커밋하지 않는다(.gitignore에 *.xlsx). 사용자가 최신 데이터를 엑셀(설정 → 엑셀로 저장 파일)로 따로 줄 수 있다. 그 파일은 **테스트용으로만** 쓴다(앱에서 엑셀 불러오기로 확인). `src/seed.js`나 결과물에 넣지 않는다. 사용자는 새 `clothes.html`로 바꿔도 폰에 있는 데이터를 그대로 이어서 쓴다.
7. 사용자 데이터는 폰 브라우저(localStorage)에 있다. 데이터 구조를 바꿀 때는 **기존 데이터를 자동으로 바꿔 주는 코드(마이그레이션)**를 꼭 넣는다. 여러 번 실행해도 결과가 같아야 한다(idempotent).

## 1. 무엇인가
- 개인 의류 관리 앱입니다. **안드로이드 폰(갤럭시 S25) 크롬**에서 씁니다. PC 크롬에서도 똑같이 돕니다.
- 실행 방식: **GitHub Pages 웹 주소**(https://silkcut911.github.io/clothing-manager/, 저장소 silkcut911/clothing-manager)로 여는 것이 기본입니다. `main`에 push되면 [.github/workflows/deploy.yml](.github/workflows/deploy.yml)이 빌드 → smoke-test → Pages 배포를 합니다(테스트 실패 시 배포 안 됨). 서비스워커로 오프라인 실행되고, 데이터는 여전히 폰 브라우저에만 있습니다(서버 없음). `dist/clothes.html` 파일판도 계속 동작해야 합니다.
- 데이터는 브라우저 localStorage에 자동 저장되고, 엑셀(.xlsx)로 백업·복원합니다.
- 초기 데이터는 사용자가 쓰던 **출력물 시트(FW 2026-27)**를 옮긴 것입니다([src/seed.js](src/seed.js)).
- SS는 출력물 사진 2장(올여름 SS 2026, 내년 SS 2027)을 옮겼습니다(`addSeedSS`). SS 2026은 종료(최종본 포함), SS 2027은 준비중이고 의류의 목표·순서·NX는 SS 2027 값입니다. 올해 비활성이던 6벌은 사용자 요청으로 넣지 않았습니다. main.js가 `meta.ss2026`이 없고 SS 옷이 하나도 없을 때 한 번만 덧붙입니다.

## 2. 파일 구성과 빌드
```
clothing-manager/
  src/app.html   화면 틀 + CSS. <!--XLSX--> <!--CORE--> <!--SEED--> <!--APP--> 자리에 스크립트가 들어감
  src/core.js    공통 로직: 날짜, 집계(itemStats/groupStats/seasonProgress), 표기 정리(TERMS),
                 시즌 상태, 엑셀 입출력(dbToWorkbook/workbookToDb). node에서도 require 가능
  src/seed.js    출력물에서 옮긴 초기 데이터 + buildSeedDB()(FW), addSeedSS()(SS 2026 종료·SS 2027 준비중, main.js가 한 번 덧붙임)
  src/app.js     화면(라우터, 홈/그룹/의류/날짜/달력/설정), 저장(load/save)
  src/season.js  시즌 만들기·종료·시작, 시즌 최종본(syncFinal), 5년 보관(pruneOld), 지난 시즌 보기, 작년 오늘, 이전본(되돌리기)
  src/main.js    시작 코드(불러오기 → 마이그레이션 → 저장 → 첫 화면)
  vendor/xlsx.full.min.js  SheetJS 0.18.5 (오프라인용으로 HTML에 넣음)
  web/           웹 배포용 고정 파일: manifest.webmanifest, sw.js(오프라인, 네트워크 우선), 아이콘
  build.js       src/* → dist/clothes.html, dist/의류관리_초기데이터.xlsx, docs/(index.html + web/*)
  docs/          빌드 결과(웹 배포용). 커밋하지 않음(.gitignore) — Actions가 빌드해서 배포
  .github/workflows/deploy.yml  push 시 자동 빌드·테스트·배포
  tools/smoke-test.js  회귀 테스트 (headless Chrome)
```
- 빌드: `node build.js`. 앱은 **HTML 하나**(`dist/clothes.html` = `docs/index.html`, docs 쪽만 manifest 링크 추가)입니다. 고친 뒤 빌드 → 테스트 → `src/` 등을 커밋하고 push하면 Actions가 배포해 폰에 반영됩니다(push는 사용자 확인 후). push 후 Actions 결과가 성공인지 확인한다.
- https로 열 때만: 서비스워커 등록·저장공간 보존 요청(main.js).
- **엑셀 공유 버튼(Web Share API)은 넣지 않는다.** 안드로이드 크롬은 .xlsx 공유를 막아 `navigator.share`가 'Permission denied'로 실패한다(canShare는 true를 돌려줘서 속음, 2026-11-05 실제 폰 확인). 대신 다운로드 후 '내 파일'에서 공유하라고 안내한다.
- app.js, season.js, main.js는 **하나의 `<script>`로 이어 붙습니다**(build.js). 그래서 시작 코드는 반드시 main.js에 두세요. app.js 끝에 두면 season.js의 const보다 먼저 실행되어 오류가 납니다.
- **외부 라이브러리나 CDN을 쓰지 않습니다.** 오프라인 단일 파일이 원칙입니다.

## 3. 데이터 구조
localStorage 키:

| 키 | 내용 |
|---|---|
| `clothes-db-v1` | 현재본(db). 고칠 때마다 `save()`가 자동 저장 |
| `clothes-snaps-v1` | 시즌 최종본 배열 (예전 백업본 `kind:'save'`가 남아 있을 수 있으나 화면에서 쓰지 않음) |
| `clothes-prev-v1` | 이전본: 그날 처음 고치기 직전의 db 전체 |
| `clothes-undo-v1` | 되돌리기 직전의 오늘본 ('오늘본으로 다시'용) |

db 구조:
```js
{
  version, viewType: 'FW'|'SS', homeMode: 'group'|'table', termsVersion,
  seasons: [{ id, type: 'FW'|'SS', name, start, end, status: 'active'|'ready'|'ended' }],
  currentSeason: { FW: seasonId|null, SS: seasonId|null },   // status 'active'인 시즌
  groups: [{ id, type, name, temp /* "기온 · 추천월" 자유 입력 한 칸 */, order }],
  colors: [{ name, hex }],
  terms: { brand:[], hood:[], length:[], fit:[], pad:[], pocket:[], material:[], kind:[] }, // 선택 상자 값 목록
  items: [{ id:'C001', type, groupId, order, active, tg, nx: ''|'New'|'Ex', yr /* 2자리 숫자 */,
            brand, color, hood, length, fit, pad, pocket, material, kind, memo }],
  usage: [{ id:'U0001', date:'YYYY-MM-DD', itemId, seasonId, planned: bool, memo }],
  meta: { lastBackup, updated, editDay /* 마지막으로 고친 날 */, fix1005, ss2026 /* SS 추가 완료 */ }
}
```
- 화면 칸 이름과 필드 대응: Material = `material`(소재), Type = `kind`(종류), Dates = 사용일.
- 시즌 최종본: `{ id, type, kind:'final', name, baseDate, cut, seasonId, seasonName, seasonStart, created, data:{ seasons, groups, items, usage, colors, currentSeason } }`. **FW와 SS는 따로** 저장합니다.

## 4. 확정된 도메인 규칙 (사용자 확인 완료 — 임의로 바꾸지 말 것)
**시즌과 횟수**
- FW(9~4월)와 SS(5~9월)는 의류, 그룹, 시즌, 백업, 시즌 종료가 **모두 따로**입니다. 위쪽 FW/SS 버튼으로 전환합니다.
- **사용일의 시즌은 옷의 구분(FW/SS) + 날짜로 정합니다**(사용자 결정, 2026-11-05. 예전의 "기록할 때 진행중 시즌 / 기간 밖 날짜도 현재 시즌" 규칙을 바꿈).
  - 옷에는 연도 없이 FW/SS만 있습니다(`item.type`).
  - **고정 집계 기간**: FW = 그해 8/1 ~ 다음 해 6/30, SS = 그해 3/1 ~ 11/30 (`countWindow`, `windowYear`). 화면의 시즌 기간(start~end, 예: FW 9~3월)은 경과율·예상 횟수에만 씁니다.
  - 집계 기간 밖 날짜(FW 7월, SS 12~2월)는 **기록을 막습니다**(`okDate`).
  - 그 기간의 시즌이 아직 없으면 **시즌 없이 기록**하고(`seasonId: ''`), 시즌을 만들면 `relinkSeasons`가 자동으로 연결합니다. 설정의 시즌 칸에 '시즌이 없는 사용일'을 알려 줍니다. 시즌은 자동으로 만들지 않습니다.
  - 종료된 시즌 기간의 날짜도 추가할 수 있고, 그 시즌 최종본에 반영됩니다(`syncFinal`).
  - `usage.seasonId`는 날짜에서 계산한 값을 담아 두는 것뿐입니다. 시작할 때·시즌을 만들거나 고칠 때·엑셀을 불러올 때 `relinkSeasons`로 다시 계산합니다. 엑셀 사용기록 시트에는 시즌 칸이 없습니다.
  - 같은 구분에 같은 집계 연도의 시즌은 하나만 만들 수 있습니다.
- 사용 횟수(Cur)는 **현재 진행중 시즌**의 집계 기간에 든 **실제** 기록 수입니다.
- 예상 % = 경과일 ÷ 시즌 일수, 예상 횟수 = 총 목표 × 예상 %.
- 같은 날 같은 옷을 두 번 기록하면 **경고를 띄우되 허용**합니다.
- `nx: 'Ex'` = 처분예정. **처분예정은 비활성이 아닙니다**(활성 옷이고, 다시 Ex가 아니게 바뀔 수 있음). **비활성(`active: false`)은 사용자가 직접만 바꿉니다** — 코드가 Ex 등을 이유로 자동으로 비활성으로 만들지 않습니다(사용자 결정, 2026-11-05). 비활성 옷은 진한 회색입니다.

**예정일(착용예정, planned)**
- 사용 횟수에 넣지 않습니다. **날짜가 지나도 자동으로 실제로 바꾸지 않습니다**(예전의 promotePlanned 기능은 일부러 없앴습니다).
- 예정일은 모든 화면에서 빨간색입니다. 누르면(`data-pu` → `planAction`) **실제로 확정(날짜 선택, 오늘까지) / 예정일 변경(내일 이후) / 삭제**를 할 수 있습니다. 날짜가 지난 예정일에는 `!`가 붙고, 홈에 '확인 필요'로 나옵니다.
- **예외: 홈의 착용예정 목록**은 누르면 확정 창이 아니라 **그 옷의 의류 상세(`#/item/<id>`)**로 갑니다(사용자 결정). 확정은 의류 상세의 사용일 기록에서 합니다.
- 사용일 추가(+)는 바로 기록하지 않고, 창에서 날짜와 실제/계획을 고르게 합니다(`askUsage`). 실제는 오늘까지, 계획은 내일 이후만 됩니다.

**시즌 운영 — 자동 처리는 하나도 없음**
- **새 시즌 만들기**: 언제든 만들 수 있고, 만들면 `ready`(준비중)입니다.
- **이번 시즌 종료**: 바로 끝내지 않고 **검토 화면**(`#/end/<id>`)을 거칩니다. 날짜가 지난 예정일이 있으면 종료할 수 없고, 확인 체크 후 직접 종료합니다. 종료하면 시즌 최종본을 저장하고 `ended`가 되며, **전체 데이터를 엑셀(시즌최종본)로 저장할지** 묻습니다.
- **지난 시즌 기록도 고칠 수 있음**(사용자 결정, 2026-11-05, 예전의 잠금 규칙을 바꿈): 의류 상세에서 날짜 변경(`redateUsage`, 오늘까지·시즌은 그대로)·메모·삭제. 고치면 `syncFinal`이 그 시즌 최종본에도 반영합니다. 지난 시즌 기간의 날짜 추가도 됩니다.
- **5년 보관**: 현재본에 사용일을 5년 치 쌓고, 시작할 때 `pruneOld`가 5년 지난 사용일·종료 시즌·그 최종본을 정리합니다.
- **시즌 시작**: 진행중 시즌이 있으면 먼저 종료하라고 안내합니다. 목록 정리 화면에서 유지/비활성/제외와 새 목표를 정합니다. 처리 기본값은 지금 상태 그대로(활성 → 유지, 비활성 → 비활성)입니다. 처분예정도 '유지'입니다. **New는 산 해와 다음 해까지**(사용자 규칙, 2026-11-05): 시즌 시작 연도(2자리) − 1보다 구입연도가 작으면 New를 지웁니다. 예정일은 날짜로 시즌이 정해지므로 옮기지 않습니다.

**버전 관리 — 사용자가 정한 이름**

| 이름 | 저장 방식 | 내용 |
|---|---|---|
| 현재본 | 자동 | 지금 데이터 |
| 이전본 | 자동, 하루 1번 | 그날 처음 고치기 직전 상태. 되돌리기 / 오늘본으로 다시 |
| 시즌 최종본 | 시즌 종료 때 | 지난 시즌 보기, 작년 오늘, 의류 상세의 지난 시즌에 쓰임 |
| 최신본 엑셀 | 엑셀로 저장 | `의류관리_최신본_YYYYMMDD_HHMM.xlsx`. 저장 후 이전 최신본(`meta.lastExportName`)을 지우라고 안내 |
| 시즌최종본 엑셀 | 시즌 종료 때 묻고 | `의류관리_시즌최종본_<시즌명>_YYYYMMDD.xlsx`, 전체 데이터 |

- **백업본(브라우저 안에 직접 저장) 기능은 없앴습니다**(사용자 결정, 2026-11-05). 지난 시즌 보기의 '최종본 엑셀로 받기'(한쪽 구분만 담는 파일)도 없앴습니다. 다시 넣지 마세요.
- 엑셀 '정보' 시트에 `파일종류`(최신본/시즌최종본)를 적고, 불러오기 확인 창에 파일 종류와 저장 일시를 보여 줍니다. 불러오기는 통째로 교체입니다(합치기 아님 — 지운 기록이 되살아나는 문제 때문).

- 엑셀의 사용기록은 `사용기록FW`·`사용기록SS` 두 시트로 나눕니다(옷의 type 기준, 지난 시즌 기록도 이어서). 불러올 때 두 시트를 합치고, 예전 형식의 `사용기록` 한 시트도 읽습니다. 사용기록 시트에는 옷 정보(그룹·Brand·색상 등)를 중복해 넣지 않습니다(사용자 결정, 의류ID로만 연결).
- 전체 엑셀에는 **5년 치 시즌 최종본을 모두** `최종본(복원용)` 시트에 넣고, 엑셀을 불러올 때 다시 복원합니다. 시즌별로 펼친 시트는 넣지 않습니다(사용일은 사용기록 시트에 이미 있음).

**작년 오늘**
- 1년 전 그날 입은 옷을 보여 줍니다. 그날 기록이 없으면 **앞뒤 3일** 안에서 가장 가까운 날을 보여 줍니다. 현재본과 최종본을 합쳐서 찾습니다.

## 5. 표기 규칙 (저장값 자체를 바꾸는 방식)
- 표기는 [src/core.js](src/core.js)의 `TERMS`와 `normalizeTerm`이 정합니다. 화면에서만 줄이지 않고 **저장값을 바꿉니다**. 예전 표기로 된 엑셀을 불러와도 자동으로 바뀝니다.
- **표기 규칙을 바꾸면 `TERMS_VERSION`을 1 올리세요.** 그래야 사용자 폰의 기존 데이터에 한 번 다시 적용됩니다.
- Hood, Length, Fit, Pad, 소재, 종류는 **단어마다 첫 글자를 대문자**로 씁니다(`capWords`). 예: `Hdn Hood`, `Long-Ln`
- **Brand**: 10자까지만 씁니다. 넘으면 뒷단어를 첫 글자로 줄입니다. 예: `Emporio A.`, `Canada G.`, `Barbour I.`, `Parajumprs`
- **Pocket**: 붙여 씁니다. 예: `2F+2Z` (F=Flap, Z=Zip, S=Slash)
- **구입연도**: 2자리로 저장합니다. 예: 23
- **확정된 줄임말**: Hdn Hood, Cord. Cllr, Shirt Cllr, China Cllr, Lttrd Z Hd, Long-Ln, Med-Ln, Short-Ln, Rbd Waist, Lt Pad, Knit Pad, Pad(=Padded), Synth. Down, Small Pffr, Cross Qlt, Box Qlt, Chore Jkt, Chrcl Navy, Hthr. Sky Blue, Hthr. Navy
- **사용자가 줄이지 말라고 한 것**: 색상 이름(Chrcl Navy 하나만 예외), Waterproof, 2단어 이하의 짧은 브랜드
- 색상 순서: 하양 → 회색 → 검정, 그다음 빨주노초파남보(`colorSortKey`). 색 이름 옆에 색 견본을 함께 보여 줍니다.

## 6. 화면 규칙 (사용자가 여러 번 다듬은 결과)
- **폰 기준**: 갤럭시 S25. 크롬 폭은 384px로 가정하고, 360px(글자 크게 설정)까지 대응합니다. 폭 400px 이하에서는 표 글씨가 10.5px입니다(app.html의 `@media`).
  - **의류 한 벌은 2줄**이 목표입니다. 384px에서 63벌 모두 2줄임을 확인했습니다. 칸이나 단어를 늘리면 다시 측정하세요.
- **의류 목록 표**(`itemTable`, 그룹 화면·날짜기록·지난 시즌): 칸 위치가 고정입니다(`COLS`).
  - 윗줄(굵게): Brand · Pad · Hood · Type · Pocket
  - 아랫줄(보통 글씨): 색상 · Fit · Material · Length · Dates
  - 맨 오른쪽: 사용 횟수(목표 달성 시 진한 빨강 바탕) + **오른쪽 정렬된 + 버튼**
  - 색 상자 안 표시: `N`=New, `Ex`=처분예정, `Off`=비활성
- **색 상자는 옷 모양**(사용자 결정, 2026-11-05): 짧은 옷 / 중간 / 긴 옷 3가지(조끼 모양 없음). `shapeOf(it)`이 Length(Long·Med·Short/Rbd)로 정하고, 빈칸이면 종류로 짐작(Coat·Trench·Raincoat → 긴 옷, Blouson → 짧은 옷, 나머지 중간). **데이터는 바꾸지 않습니다.** CSS mask(`.shp-*`, app.html)로 배경을 잘라 내고, 넓은 몸통·둥근 어깨·팔은 몸통에 겹침(외곽선 없음), 칸 맨 위에서 시작(긴 옷 끝까지, 중간 약 4/5, 짧은 옷 약 5/8 + 허리 밴드). 윤곽은 감싸는 `.chipw`/`.boxes`의 drop-shadow. 달력의 작은 칸은 네모 그대로.
  - 구입연도는 목록에 넣지 않습니다(의류 상세에만).
  - Dates는 같은 달이면 월을 한 번만 씁니다. 예: `9/16,21` `9/30,10/1,6`
- **홈 착용예정**: 한 건 **한 줄**(`.plan1`): 색 상자 · **Brand** · Type · Pad · Hood · Length · Fit · Pocket · Material(들어가는 만큼) · 사용횟수/목표(작게, `.pc`) · 날짜 배지. 그룹명과 색상 글자는 넣지 않는다(사용자 결정, 색은 색 상자로). 넘치면 가운데 글자를 `…`로 줄인다(상세정보는 넣지 않음).
- **의류 상세의 상세 정보**: 한 줄에 2개씩(`dl.kv.kv2`, 4칸 그리드), 메모만 한 줄 전체.
- **홈 화면 순서**: (자동저장 실패 시 빨간 경고) → 착용예정 → 작년 오늘 → [그룹별 / 전체 표] → 시즌 통계 → 지난 시즌 보기 → 백업 알림.
  - **전체 표**는 출력물과 같은 형식입니다. Dates 칸을 누르면 날짜 관리 창(`manageDates`), 다른 칸을 누르면 의류 상세로 갑니다.
- **그룹 화면**: 그룹 카드에 의류마다 색상만 있는 작은 박스, 목표 막대, 그룹 사용일이 나옵니다. 순서·그룹 편집 모드가 있습니다.
- **의류 추가/수정**: 모든 속성은 기존 값을 고르거나 새로 입력할 수 있습니다. 설정 → 속성 값에서 쓰는 옷이 0벌인 값만 지울 수 있습니다.
- 그룹 기온은 '기온 · 추천월' 한 칸에 자유 입력합니다.
- **그룹명은 줄임말 없이 원어로** 씁니다(사용자 결정, 2026-11-05): Extra Heavy Weight, Heavy Weight, Mid Weight, Waterproof/Quilted/Light Weight, Suit/Coat, Trench Coat (SS: Summer, Spring, Jacket). Weight는 띄어 씁니다. 예전 줄임말은 `normalizeGroups`의 `GROUP_NAMES`가 시작할 때·엑셀 불러올 때 바꿉니다(이름이 정확히 같을 때만).
- 화면 아래 탭: 홈 / 날짜기록 / 달력 / 설정. 주소(라우트): `#/` `#/group/G1` `#/item/C001` `#/day/YYYY-MM-DD` `#/cal/YYYY-MM` `#/settings` `#/end/<seasonId>` `#/past/<snapId>`

## 7. 코드 작성 관례
- 주변 코드처럼 씁니다: 짧은 한국어 주석, 템플릿 문자열 HTML, `esc()`로 이스케이프, 화면은 `render()`가 다시 그립니다.
- 데이터를 고치면 `save()`를 부릅니다. save가 속성 값 목록 동기화, 이전본 보관, 색상 정렬을 함께 처리합니다.
- 화면을 다시 그린 뒤 스크롤 위치를 지켜야 하면 `keepScroll()`을 씁니다.
- 날짜는 문자열 `YYYY-MM-DD`로 다루고 `todayStr`, `addDays`(core.js)를 씁니다.

## 8. 검증 방법
```
node build.js
node tools/smoke-test.js     # puppeteer-core와 Chrome 필요 (파일 첫 부분 설명 참고)
```
- smoke-test는 다음을 확인합니다.
  - 모든 화면에서 오류가 없는지
  - 384px에서 그룹 표가 화면 폭 안에 들어가는지
  - 예정일 확정
  - 시즌 종료 → 시작 흐름
  - 최신본 파일 이름, 지난 시즌 기록 수정이 최종본에 반영되는지, 5년 보관 정리
  - 이전본 되돌리기
  - 엑셀로 저장했다가 불러와도 같은지
- **아직 확인 못 한 것**: 실제 안드로이드 기기에서 `file://`로 열었을 때 localStorage가 유지되는지. 문제가 생기면 GitHub Pages 배포를 대안으로 검토합니다.
