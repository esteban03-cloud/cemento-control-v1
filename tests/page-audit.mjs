import { chromium } from 'playwright-core';
import fs from 'node:fs';

fs.mkdirSync('tests/artifacts', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'es-CO', timezoneId: 'America/Bogota', acceptDownloads: true });
const page = await context.newPage();
const logs = [];
page.on('console', (msg) => { if (msg.type() === 'error' && !msg.text().includes('401')) logs.push(`${page.url()} console: ${msg.text()}`); });
page.on('pageerror', (error) => logs.push(`${page.url()} pageerror: ${error.message}`));
page.setDefaultTimeout(20000);

async function login(username = 'admin', password = 'admin123') {
  await page.goto('http://127.0.0.1:8788/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[autocomplete="username"]', username);
  await page.fill('input[autocomplete="current-password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('http://127.0.0.1:8788/', { timeout: 20000 });
  await page.waitForSelector('h1');
}
await login();
const routes = [
  ['/', 'Panel de control'],
  ['/ventas', 'Ventas'],
  ['/compras', 'Compras'],
  ['/inventario', 'Inventario'],
  ['/caja', 'Caja y bancos'],
  ['/cxc', 'Cuentas por cobrar'],
  ['/cxp', 'Cuentas por pagar'],
  ['/cartera', 'Cartera y flujo de caja'],
  ['/costeo', 'Costeo mensual'],
  ['/costos', 'Asignación de costos'],
  ['/estados', 'Estados financieros'],
  ['/datos', 'Datos y respaldos'],
  ['/configuracion', 'Configuración']
];
for (const [path, heading] of routes) {
  await page.goto(`http://127.0.0.1:8788${path}`, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForSelector(`h1:has-text("${heading}")`, { timeout: 12000 });
    await page.waitForTimeout(500);
    const bodyText = await page.locator('body').innerText();
    console.log(`PASS ${path} (${bodyText.length} chars)`);
  } catch (error) {
    console.log(`FAIL ${path}: ${error.message.split('\n')[0]}`);
    await page.screenshot({ path: `tests/artifacts/fail-${path.replaceAll('/', '-') || 'home'}.png`, fullPage: true });
  }
}

// Settings tab interactions
await page.goto('http://127.0.0.1:8788/configuracion', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1:has-text("Configuración")');
for (const label of ['Operación e impuestos', 'Semáforos', 'Terceros', 'Usuarios', 'Respaldo', 'Empresa']) {
  await page.getByRole('button', { name: label }).click();
  await page.waitForTimeout(250);
  console.log('settings tab', label, 'ok');
}
await page.getByRole('button', { name: 'Guardar cambios' }).click();
await page.waitForTimeout(1000);
console.log('settings save toast:', await page.locator('.toast').last().innerText().catch(() => 'none'));

// Data exports and backup
await page.goto('http://127.0.0.1:8788/datos', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1:has-text("Datos y respaldos")');
await page.waitForTimeout(500);
await page.locator('.export-card').filter({ hasText: 'Ventas' }).getByRole('button', { name: 'Excel' }).click();
await page.waitForTimeout(2000);
console.log('export toast:', await page.locator('.toast').last().innerText().catch(() => 'none'));
await page.getByRole('tab').filter({ hasText: 'Respaldos' }).click().catch(async () => {
  await page.getByRole('button', { name: /Respaldos/ }).click();
});
await page.waitForTimeout(700);
console.log('backup section present:', await page.locator('h2:has-text("Respaldo de la base de datos")').isVisible().catch(() => false));

// Mobile pages
await page.setViewportSize({ width: 390, height: 844 });
for (const [path, heading] of [['/ventas', 'Ventas'], ['/cxc', 'Cuentas por cobrar'], ['/configuracion', 'Configuración']]) {
  await page.goto(`http://127.0.0.1:8788${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  console.log(`mobile ${path}: scrollWidth=${scrollWidth}`);
  await page.screenshot({ path: `tests/artifacts/mobile-${path.replaceAll('/', '-') || 'home'}.png`, fullPage: false });
}

console.log('ERRORS:', logs);
await browser.close();
