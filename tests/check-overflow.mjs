import { chromium } from 'playwright-core';

const base = process.env.BASE_URL || 'http://127.0.0.1:8788';
const routes = ['/', '/ventas', '/compras', '/inventario', '/caja', '/cxc', '/cxp', '/cartera', '/costeo', '/costos', '/estados', '/datos', '/configuracion'];
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'es-CO' });
const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(error.message));
await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('input[autocomplete="username"]', 'admin');
await page.fill('input[autocomplete="current-password"]', 'admin123');
await page.click('button[type="submit"]');
await page.waitForSelector('h1:has-text("Panel de control")');
let failed = false;
for (const route of routes) {
  await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  const { scrollWidth, path } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, path: location.pathname }));
  const viewport = page.viewportSize();
  const ok = scrollWidth <= viewport.width + 2;
  if (!ok) failed = true;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${path} · scrollWidth ${scrollWidth}/${viewport.width}`);
}
console.log('console errors:', consoleErrors.length, consoleErrors);
await browser.close();
if (failed) process.exit(1);
