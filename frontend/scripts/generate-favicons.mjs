import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.resolve(__dirname, '../public');

// 洗練された「生産ナビ」ブランドSVGアイコン（工場×製造×ナビゲーション）
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- メイングランド：ロイヤルブルーからスカイブルー -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0284c7" />
      <stop offset="60%" stop-color="#0369a1" />
      <stop offset="100%" stop-color="#075985" />
    </linearGradient>

    <!-- ナビゲーション・スパークスター用グラデーション -->
    <linearGradient id="sparkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#bae6fd" />
    </linearGradient>

    <!-- クッキリしたドロップシャドウ -->
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#001830" flood-opacity="0.35" />
    </filter>

    <!-- 内側の微光 -->
    <linearGradient id="innerGlow" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.05" />
    </linearGradient>
  </defs>

  <!-- 背景ベース（角丸スクワークル） -->
  <rect width="512" height="512" rx="116" fill="url(#bgGrad)" />

  <!-- 外枠微光ハイライト -->
  <rect width="496" height="496" x="8" y="8" rx="108" fill="none" stroke="url(#innerGlow)" stroke-width="8" />

  <!-- シンボル：工場（製造・MES）とナビゲーションの融合 -->
  <g filter="url(#shadow)">
    <!-- 工場メインシルエット -->
    <path
      d="M76 404 V160 c0-12 10-22 22-22 h36 c12 0 22 10 22 22 v68 l104 -78 v68 l112 -84 c8 -6 18 -1 18 10 v220 c0 12 -10 22 -22 22 H98 c-12 0 -22 -10 -22 -22 Z"
      fill="#ffffff"
    />

    <!-- 工場の窓（MESデータのパルスをイメージ） -->
    <rect x="116" y="322" width="38" height="46" rx="6" fill="#0284c7" />
    <rect x="186" y="322" width="38" height="46" rx="6" fill="#0284c7" />
    <rect x="256" y="322" width="38" height="46" rx="6" fill="#0284c7" />
    <rect x="326" y="322" width="38" height="46" rx="6" fill="#0284c7" />

    <!-- 2階窓 -->
    <rect x="256" y="240" width="38" height="42" rx="6" fill="#0284c7" />
    <rect x="326" y="240" width="38" height="42" rx="6" fill="#0284c7" />

    <!-- 煙突の煙 / 上昇のパルス -->
    <circle cx="120" cy="96" r="14" fill="#ffffff" fill-opacity="0.85" />
    <circle cx="136" cy="66" r="10" fill="#ffffff" fill-opacity="0.65" />
    <circle cx="152" cy="42" r="7" fill="#ffffff" fill-opacity="0.45" />

    <!-- ナビゲーション・コンパススター（北東アクセント） -->
    <path
      d="M396 60 L412 110 L462 126 L412 142 L396 192 L380 142 L330 126 L380 110 Z"
      fill="url(#sparkGrad)"
      stroke="#ffffff"
      stroke-width="5"
      stroke-linejoin="round"
    />
  </g>
</svg>
`;

function createIco(images) {
  // images: array of { width, height, buffer }
  const count = images.length;
  const headerSize = 6;
  const entrySize = 16;
  let offset = headerSize + count * entrySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(count, 4); // count

  const entries = [];
  for (const img of images) {
    const entry = Buffer.alloc(entrySize);
    entry.writeUInt8(img.width === 256 ? 0 : img.width, 0);
    entry.writeUInt8(img.height === 256 ? 0 : img.height, 1);
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(img.buffer.length, 8); // bytes in res
    entry.writeUInt32LE(offset, 12); // offset

    offset += img.buffer.length;
    entries.push(entry);
  }

  return Buffer.concat([header, ...entries, ...images.map(img => img.buffer)]);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const svgPath = path.join(outDir, 'favicon.svg');
  fs.writeFileSync(svgPath, svgContent, 'utf-8');
  console.log(`Saved favicon.svg to ${svgPath}`);

  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
          svg { display: block; width: 100vw; height: 100vh; }
        </style>
      </head>
      <body>${svgContent}</body>
    </html>
  `);

  // 180x180 (apple-touch-icon.png)
  await page.setViewportSize({ width: 180, height: 180 });
  const buf180 = await page.screenshot({ omitBackground: true });
  fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), buf180);
  console.log('Saved apple-touch-icon.png (180x180)');

  // 48x48
  await page.setViewportSize({ width: 48, height: 48 });
  const buf48 = await page.screenshot({ omitBackground: true });
  fs.writeFileSync(path.join(outDir, 'favicon-48x48.png'), buf48);
  console.log('Saved favicon-48x48.png (48x48)');

  // 32x32
  await page.setViewportSize({ width: 32, height: 32 });
  const buf32 = await page.screenshot({ omitBackground: true });
  fs.writeFileSync(path.join(outDir, 'favicon-32x32.png'), buf32);
  console.log('Saved favicon-32x32.png (32x32)');

  // 16x16
  await page.setViewportSize({ width: 16, height: 16 });
  const buf16 = await page.screenshot({ omitBackground: true });
  fs.writeFileSync(path.join(outDir, 'favicon-16x16.png'), buf16);
  console.log('Saved favicon-16x16.png (16x16)');

  // マルチ解像度ICOファイルの作成 (16, 32, 48)
  const icoBuffer = createIco([
    { width: 16, height: 16, buffer: buf16 },
    { width: 32, height: 32, buffer: buf32 },
    { width: 48, height: 48, buffer: buf48 },
  ]);
  fs.writeFileSync(path.join(outDir, 'favicon.ico'), icoBuffer);
  console.log('Saved multi-resolution favicon.ico (16, 32, 48)');

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
