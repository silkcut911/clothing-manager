// src/* 를 하나의 HTML(dist/clothes.html)로 묶고, 초기 데이터 엑셀(dist/의류관리_초기데이터.xlsx)을 만든다
const fs = require('fs');
const path = require('path');
const XLSX = require('./vendor/xlsx.full.min.js');
const { buildSeedDB } = require('./src/seed.js');
const core = require('./src/core.js');

const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const script = (code) => `<script>\n${code.replace(/<\/script/gi, '<\\/script')}\n</script>`;

const html = read('src/app.html')
  .replace('<!--XLSX-->', () => script(read('vendor/xlsx.full.min.js')))
  .replace('<!--CORE-->', () => script(read('src/core.js')))
  .replace('<!--SEED-->', () => script(read('src/seed.js')))
  .replace('<!--APP-->', () => script(['src/app.js', 'src/season.js', 'src/main.js'].map(read).join('\n')));

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist/clothes.html'), html);

// 웹 배포용(GitHub Pages가 docs/ 폴더를 그대로 올림): 같은 HTML + 홈 화면 앱(manifest)·오프라인(sw.js) 파일
fs.mkdirSync(path.join(__dirname, 'docs'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'docs/index.html'),
  html.replace('</head>', '<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icon-192.png">\n</head>'));
for (const f of fs.readdirSync(path.join(__dirname, 'web'))) fs.copyFileSync(path.join(__dirname, 'web', f), path.join(__dirname, 'docs', f));

const db = buildSeedDB();
fs.writeFileSync(path.join(__dirname, 'dist/의류관리_초기데이터.xlsx'), XLSX.write(core.dbToWorkbook(XLSX, db), { type: 'buffer', bookType: 'xlsx' }));

console.log('dist/clothes.html', (html.length / 1024).toFixed(0) + 'KB');
console.log('dist/의류관리_초기데이터.xlsx', db.items.length + '벌', db.usage.length + '건');
