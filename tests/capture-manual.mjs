import { chromium } from 'playwright-core';
import fs from 'node:fs';

const out = 'docs/capturas';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  locale: 'es-CO',
  timezoneId: 'America/Bogota',
  acceptDownloads: true
});
const page = await context.newPage();
page.setDefaultTimeout(20000);
const shot = async (name) => {
  await page.waitForTimeout(550);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: false });
  console.log('captured', name);
};

await page.goto('http://127.0.0.1:8787/login', { waitUntil: 'networkidle' });
await shot('01-login');
await page.fill('input[autocomplete="username"]', 'admin');
await page.fill('input[autocomplete="current-password"]', 'admin123');
await page.click('button[type="submit"]');
await page.waitForURL('http://127.0.0.1:8787/');
await page.waitForSelector('h1:has-text("Panel de control")');
await page.waitForTimeout(1500);
await shot('02-panel');
await page.locator('.dashboard-section').scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await shot('03-indicadores');
await page.locator('.eoq-panel').scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
await shot('04-inventario-eoq');

await page.goto('http://127.0.0.1:8787/ventas', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1:has-text("Ventas")');
await page.waitForTimeout(600);
await shot('05-ventas');
await page.click('button:has-text("Nueva venta")');
await page.waitForSelector('#sale-form');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/06-formulario-venta.png`, fullPage: false });
console.log('captured 06-formulario-venta');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

await page.goto('http://127.0.0.1:8787/compras', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1:has-text("Compras")');
await page.waitForTimeout(600);
await shot('07-compras');
await page.click('button:has-text("Nueva compra")');
await page.waitForSelector('#purchase-form');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/08-formulario-compra.png`, fullPage: false });
console.log('captured 08-formulario-compra');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

await page.goto('http://127.0.0.1:8787/inventario', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1:has-text("Inventario")');
await page.waitForTimeout(800);
await shot('09-inventario');
await page.locator('table.data-table tbody tr').first().locator('button[title="Ver kardex"]').click();
await page.waitForSelector('h2:has-text("Kardex")');
await shot('10-kardex');
await page.getByRole('button', { name: 'Cerrar', exact: true }).last().click();

await page.goto('http://127.0.0.1:8787/caja', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1:has-text("Caja y bancos")');
await page.waitForTimeout(800);
await shot('11-caja');

await page.goto('http://127.0.0.1:8787/cxc', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1:has-text("Cuentas por cobrar")');
await page.waitForTimeout(800);
await shot('12-cxc');
await page.locator('button:has-text("Abonar")').first().click();
await page.waitForSelector('#payment-form');
await shot('13-registrar-cobro');
await page.keyboard.press('Escape');

await page.goto('http://127.0.0.1:8787/cxp', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1:has-text("Cuentas por pagar")');
await page.waitForTimeout(700);
await shot('14-cxp');

await page.goto('http://127.0.0.1:8787/cartera', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1:has-text("Cartera y flujo de caja")');
await page.waitForTimeout(1000);
await shot('15-cartera');

await page.goto('http://127.0.0.1:8787/costeo', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1:has-text("Costeo mensual")');
await page.waitForTimeout(1000);
await shot('16-costeo');

await page.goto('http://127.0.0.1:8787/estados', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1:has-text("Estados financieros")');
await page.waitForTimeout(1000);
await shot('17-estados-financieros');

await page.goto('http://127.0.0.1:8787/datos', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1:has-text("Datos y respaldos")');
await page.waitForTimeout(700);
await shot('18-datos-respaldos');

await page.goto('http://127.0.0.1:8787/configuracion', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1:has-text("Configuración")');
await page.waitForTimeout(700);
await shot('19-configuracion');

await page.goto('http://127.0.0.1:8787/ventas', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(700);
await page.locator('table.data-table tbody tr').first().locator('button[title="Ver factura"]').click();
await page.waitForSelector('.document-sheet');
await page.waitForTimeout(700);
await shot('20-documento-venta');
await page.keyboard.press('Escape');

await context.clearCookies();
await page.setViewportSize({ width: 390, height: 844 });
await page.goto('http://127.0.0.1:8787/login', { waitUntil: 'domcontentloaded' });
await page.fill('input[autocomplete="username"]', 'admin');
await page.fill('input[autocomplete="current-password"]', 'admin123');
await page.click('button[type="submit"]');
await page.waitForURL('http://127.0.0.1:8787/');
await page.waitForTimeout(1200);
await shot('21-movil-panel');
await page.goto('http://127.0.0.1:8787/ventas', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);
await shot('22-movil-ventas');

await browser.close();
console.log('Capturas listas en', out);
