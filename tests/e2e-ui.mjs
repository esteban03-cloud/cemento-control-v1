import { chromium } from 'playwright-core';
import fs from 'node:fs';

fs.mkdirSync('tests/artifacts', { recursive: true });

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 950 }, locale: 'es-CO', timezoneId: 'America/Bogota', acceptDownloads: true });
const page = await context.newPage();
const logs = [];
page.on('console', (msg) => { if (msg.type() === 'error') logs.push(`console: ${msg.text()}`); });
page.on('pageerror', (error) => logs.push(`pageerror: ${error.message}`));
page.setDefaultTimeout(15000);

async function login(username = 'admin', password = 'admin123') {
  await page.goto('http://127.0.0.1:8788/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[autocomplete="username"]', username);
  await page.fill('input[autocomplete="current-password"]', password);
  await Promise.all([
    page.waitForURL('http://127.0.0.1:8788/', { timeout: 15000 }),
    page.click('button[type="submit"]')
  ]);
  await page.waitForSelector('h1:has-text("Panel de control")');
  await page.waitForTimeout(500);
}

try {
  await login();
  console.log('PASS login');

  await page.goto('http://127.0.0.1:8788/ventas', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1:has-text("Ventas")');
  await page.waitForTimeout(600);
  await page.click('button:has-text("Nueva venta")');
  await page.waitForSelector('#sale-form');
  const beforeMeta = await page.evaluate(async () => (await fetch('/api/meta')).json());
  console.log('next invoice before:', beforeMeta.nextSale);
  await page.click('button[form="sale-form"]');
  await page.waitForSelector('#sale-form', { state: 'detached', timeout: 15000 });
  await page.waitForTimeout(800);
  const toastText = await page.locator('.toast').last().innerText().catch(() => '');
  console.log('toast:', toastText.replace(/\n/g, ' | '));
  const afterMeta = await page.evaluate(async () => (await fetch('/api/meta')).json());
  const latestSales = await page.evaluate(async () => (await fetch('/api/sales?limit=1&page=1')).json());
  console.log('next invoice after:', afterMeta.nextSale);
  console.log('latest sale:', JSON.stringify(latestSales.data[0], ['invoice_number', 'total', 'status', 'customer_name', 'product_name']));
  console.log('PASS sale creation');

  await page.goto('http://127.0.0.1:8788/compras', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1:has-text("Compras")');
  await page.waitForTimeout(500);
  await page.click('button:has-text("Nueva compra")');
  await page.waitForSelector('#purchase-form');
  await page.click('button[form="purchase-form"]');
  await page.waitForSelector('#purchase-form', { state: 'detached', timeout: 15000 });
  await page.waitForTimeout(800);
  const latestPurchase = await page.evaluate(async () => (await fetch('/api/purchases?limit=1&page=1')).json());
  console.log('latest purchase:', JSON.stringify(latestPurchase.data[0], ['doc_number', 'total_cost', 'quantity', 'supplier_name']));
  console.log('PASS purchase creation');

  await page.goto('http://127.0.0.1:8788/caja', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1:has-text("Caja y bancos")');
  await page.click('button:has-text("Nuevo movimiento")');
  await page.waitForSelector('#cash-form');
  await page.fill('#cash-form .input-affix input', '10000');
  await page.fill('#cash-form textarea', 'Prueba E2E de ingreso manual');
  await page.click('button[form="cash-form"]');
  await page.waitForSelector('#cash-form', { state: 'detached', timeout: 15000 });
  console.log('PASS manual cash movement');

  await page.goto('http://127.0.0.1:8788/cxc', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1:has-text("Cuentas por cobrar")');
  await page.waitForTimeout(500);
  const abonar = page.locator('button:has-text("Abonar")').first();
  await abonar.click();
  await page.waitForSelector('#payment-form');
  await page.click('button[form="payment-form"]');
  await page.waitForSelector('#payment-form', { state: 'detached', timeout: 15000 });
  console.log('PASS cxc payment');

  await page.goto('http://127.0.0.1:8788/inventario', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1:has-text("Inventario")');
  await page.waitForTimeout(500);
  await page.click('button:has-text("Existencias")');
  await page.locator('table.data-table tbody tr').first().locator('button[title="Ver kardex"]').click();
  await page.waitForSelector('h2:has-text("Kardex")');
  await page.getByRole('button', { name: 'Cerrar' }).last().click();
  console.log('PASS kardex');

  await page.goto('http://127.0.0.1:8788/ventas', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.locator('table.data-table tbody tr').first().locator('button[title="Ver factura"]').click();
  await page.waitForSelector('.document-sheet');
  await page.screenshot({ path: 'tests/artifacts/10-documento-venta.png', fullPage: false });
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('button', { name: 'Descargar PDF' }).click()
  ]);
  console.log('PDF download:', download.suggestedFilename());
  await download.saveAs('tests/artifacts/factura-e2e.pdf');
  const [downloadPng] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('button', { name: 'PNG', exact: true }).click()
  ]);
  console.log('PNG download:', downloadPng.suggestedFilename());
  await downloadPng.saveAs('tests/artifacts/factura-e2e.png');
  console.log('PASS record PDF/PNG');

  await page.goto('http://127.0.0.1:8788/estados', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('h1:has-text("Estados financieros")');
  await page.waitForTimeout(700);
  const [finPdf] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('button', { name: /Exportar informe/i }).click().then(async () => {
      await page.getByRole('menuitem', { name: /PDF ejecutivo/i }).click();
    })
  ]);
  console.log('financial PDF:', finPdf.suggestedFilename());
  await finPdf.saveAs('tests/artifacts/estados-financieros-e2e.pdf');
  console.log('PASS financial PDF');

  console.log('ERRORS:', logs);
} catch (error) {
  console.error('TEST FAILED:', error.message);
  console.error(logs);
  await page.screenshot({ path: 'tests/artifacts/e2e-failure.png', fullPage: true });
  process.exitCode = 1;
} finally {
  await browser.close();
}
