import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import { chromium } from 'playwright-core';

const root = path.resolve('.');
const docsDir = path.join(root, 'docs');
const assetsDir = path.join(docsDir, 'assets');
fs.mkdirSync(assetsDir, { recursive: true });
fs.copyFileSync(
  path.join(root, 'node_modules', '@fontsource-variable', 'manrope', 'files', 'manrope-latin-wght-normal.woff2'),
  path.join(assetsDir, 'manrope-latin.woff2')
);

const markdown = fs.readFileSync(path.join(docsDir, 'MANUAL_USUARIO.md'), 'utf8')
  .replace(/^# Manual de usuario — CementoControl\s*/m, '');
const content = marked.parse(markdown, { mangle: false, headerIds: true });
const logo = fs.readFileSync(path.join(root, 'web', 'public', 'favicon.svg'), 'utf8');
const generated = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'long',
  timeZone: 'America/Bogota'
}).format(new Date());

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Manual de usuario · CementoControl</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  @font-face {
    font-family: 'Manrope';
    src: url('./assets/manrope-latin.woff2') format('woff2');
    font-weight: 200 800;
    font-style: normal;
    font-display: swap;
  }
  :root {
    --navy: #111d2b;
    --ink: #25313d;
    --muted: #69737d;
    --line: #e1dbcf;
    --accent: #f5b301;
    --paper: #fffdf8;
    --cream: #f6f2e8;
    --green: #21833a;
    --red: #b52c3b;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0;
    background: #ece8de;
    color: var(--ink);
    font-family: 'Manrope', 'Segoe UI', sans-serif;
    font-size: 10.5pt;
    line-height: 1.65;
  }
  .cover {
    position: relative;
    overflow: hidden;
    min-height: 260mm;
    padding: 26mm 20mm 18mm;
    margin: 0 0 18mm;
    color: var(--paper);
    background:
      radial-gradient(circle at 86% 12%, rgba(245, 179, 1, .2), transparent 68mm),
      radial-gradient(circle at 0% 100%, rgba(31, 111, 139, .28), transparent 90mm),
      linear-gradient(145deg, #0b1620, #111d2b 60%, #1a3042);
    page-break-after: always;
  }
  .cover::before {
    content: '';
    position: absolute;
    inset: 0;
    opacity: .2;
    background-image: linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px);
    background-size: 16mm 16mm;
    mask-image: linear-gradient(135deg,#000 20%, transparent 82%);
  }
  .cover-top { position: relative; z-index: 2; display: flex; align-items: center; gap: 12px; }
  .cover-top svg { width: 15mm; height: 15mm; border-radius: 4mm; }
  .cover-brand strong { display: block; font-size: 15pt; letter-spacing: -.04em; color: #fffdf8; }
  .cover-brand span { display: block; color: rgba(255,253,248,.48); font-size: 7.5pt; letter-spacing: .17em; text-transform: uppercase; margin-top: 1mm; }
  .cover strong { color: inherit; }
  .cover-main { position: relative; z-index: 2; max-width: 150mm; margin-top: 55mm; }
  .cover-kicker { display: inline-flex; align-items: center; gap: 7px; padding: 2.4mm 4mm; border: .25mm solid rgba(245,179,1,.35); border-radius: 999px; color: #f7da8b; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .14em; }
  .cover h1 { margin: 7mm 0 0; font-size: 40pt; line-height: 1.02; letter-spacing: -.06em; font-weight: 800; }
  .cover h1 em { color: var(--accent); font-style: normal; }
  .cover p { max-width: 128mm; margin: 8mm 0 0; color: rgba(255,253,248,.62); font-size: 11pt; line-height: 1.7; }
  .cover-foot { position: absolute; z-index: 2; left: 20mm; right: 20mm; bottom: 18mm; display: flex; justify-content: space-between; align-items: flex-end; gap: 12mm; padding-top: 6mm; border-top: .25mm solid rgba(255,255,255,.13); }
  .cover-foot div span { display: block; color: rgba(255,253,248,.35); font-size: 7pt; text-transform: uppercase; letter-spacing: .14em; }
  .cover-foot div strong { display: block; margin-top: 1.5mm; color: rgba(255,253,248,.8); font-size: 9pt; font-weight: 600; }
  .cover-mark { width: 34mm; height: 34mm; display: grid; place-items: center; border: .3mm solid rgba(245,179,1,.28); border-radius: 50%; color: var(--accent); font-size: 7pt; font-weight: 800; letter-spacing: .12em; text-align: center; text-transform: uppercase; }
  .manual-content { background: var(--paper); padding: 16mm 18mm 18mm; }
  .manual-content > h1 { display: none; }
  h2 {
    margin: 0 0 7mm;
    padding-top: 3mm;
    color: var(--navy);
    font-size: 23pt;
    line-height: 1.15;
    letter-spacing: -.045em;
    border-top: 1mm solid var(--accent);
    page-break-before: always;
    page-break-after: avoid;
  }
  .manual-content > h2:first-of-type { page-break-before: auto; }
  h3 {
    color: var(--navy);
    margin: 8mm 0 2.5mm;
    font-size: 13pt;
    letter-spacing: -.02em;
    page-break-after: avoid;
  }
  h4 { color: var(--navy); font-size: 10.5pt; margin: 5mm 0 1.5mm; page-break-after: avoid; }
  p { margin: 0 0 3.2mm; }
  a { color: #12627b; text-decoration: none; }
  strong { color: var(--navy); }
  img {
    display: block;
    width: 100%;
    max-height: 145mm;
    object-fit: contain;
    object-position: top center;
    margin: 4mm 0 1.5mm;
    border: .25mm solid #d8d2c4;
    border-radius: 2.5mm;
    background: #f6f2e8;
    page-break-inside: avoid;
  }
  p > em:only-child, p:has(> em:only-child) {
    display: block;
    color: var(--muted);
    font-size: 8pt;
    text-align: center;
    margin: -1mm 0 6mm;
  }
  ul, ol { margin: 2mm 0 4mm; padding-left: 6mm; }
  li { margin: 1.1mm 0; padding-left: 1mm; }
  hr { border: 0; border-top: .25mm solid var(--line); margin: 8mm 0; }
  blockquote {
    margin: 5mm 0;
    padding: 3.5mm 4.5mm;
    border-left: 1mm solid var(--accent);
    border-radius: 0 2mm 2mm 0;
    background: #fff6d6;
    color: #5d4a0e;
    page-break-inside: avoid;
  }
  blockquote p:last-child { margin-bottom: 0; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 3mm 0 5mm;
    font-size: 8.5pt;
    page-break-inside: avoid;
  }
  th {
    padding: 2.4mm 2.8mm;
    background: var(--navy);
    color: var(--paper);
    text-align: left;
    font-size: 7.5pt;
    text-transform: uppercase;
    letter-spacing: .06em;
  }
  td { padding: 2.2mm 2.8mm; border-bottom: .2mm solid var(--line); vertical-align: top; }
  tbody tr:nth-child(even) td { background: #faf7ef; }
  code { font-family: 'Cascadia Code', Consolas, monospace; background: #f0ece0; padding: .4mm 1mm; border-radius: 1mm; font-size: 8.5pt; }
  .manual-content > p:first-of-type { color: var(--muted); }
  .manual-content > ol, .manual-content > ul { background: #f8f5ec; padding: 5mm 7mm 5mm 11mm; border:.25mm solid var(--line); border-radius: 2.5mm; }
  .chapter-note { color: var(--muted); font-size: 9pt; }
  .page-break { page-break-before: always; }
  @media (max-width: 700px) {
    .cover { min-height: auto; padding: 15mm 10mm; }
    .cover h1 { font-size: 31pt; }
    .manual-content { padding: 10mm; }
    h2 { font-size: 20pt; }
  }
</style>
</head>
<body>
  <section class="cover">
    <div class="cover-top">
      <span>${logo.replace('<svg ', '<svg style="width:15mm;height:15mm;" ').replace('<svg', '<svg')}</span>
      <div class="cover-brand"><strong>Cemento Andino</strong><span>Control de ventas · Colombia</span></div>
    </div>
    <div class="cover-main">
      <span class="cover-kicker">Manual de usuario · v1.0</span>
      <h1>El control de tu operación, <em>del primer bulto al último peso.</em></h1>
      <p>Guía práctica para registrar ventas, compras, inventario y cartera, leer los indicadores del negocio y proteger la información con respaldos.</p>
    </div>
    <div class="cover-foot">
      <div><span>Preparado para</span><strong>Cemento Andino S.A.S. · Distribución de cemento</strong></div>
      <div><span>Actualizado</span><strong>${generated}</strong></div>
      <div class="cover-mark">42.5<br />kg</div>
    </div>
  </section>
  <main class="manual-content">
    ${content}
  </main>
</body>
</html>`;

fs.writeFileSync(path.join(docsDir, 'manual-usuario.html'), html, 'utf8');

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true
});
try {
  const page = await browser.newPage();
  await page.goto(`file:///${path.join(docsDir, 'manual-usuario.html').replaceAll('\\', '/')}`, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.complete ? Promise.resolve() : new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    })));
  });
  await page.pdf({
    path: path.join(docsDir, 'manual-usuario.pdf'),
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: '<div style="width:100%;font-family:Arial,sans-serif;font-size:7px;color:#8a8173;padding:0 16mm;display:flex;justify-content:space-between;"><span>CementoControl · Manual de usuario v1.0</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>',
    margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' }
  });
  console.log('Manual PDF generado en docs/manual-usuario.pdf');
} finally {
  await browser.close();
}
