import { chromium } from 'playwright-core';
import fs from 'node:fs';

fs.mkdirSync('tests/artifacts', { recursive: true });

fs.writeFileSync(
  'tests/import-clientes.csv',
  '\uFEFFnombre;nit;telefono;direccion\r\nFerretería Los Andes;900.123.456-7;+57 300 555 1111;Calle 100 # 15-20, Bogotá\r\nMateriales El Progreso;901.222.333-4;+57 310 666 2222;Carrera 50 # 12-34, Bogotá\r\n',
  'utf8'
);

const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 950 }, locale: 'es-CO', timezoneId: 'America/Bogota', acceptDownloads: true });
const page = await context.newPage();
const logs = [];
page.on('console', (msg) => { if (msg.type() === 'error' && !msg.text().includes('401')) logs.push(`console: ${msg.text()}`); });
page.on('pageerror', (error) => logs.push(`pageerror: ${error.message}`));
page.setDefaultTimeout(20000);

async function login(username, password) {
  await page.goto('http://127.0.0.1:8788/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[autocomplete="username"]', username);
  await page.fill('input[autocomplete="current-password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL('http://127.0.0.1:8788/', { timeout: 20000 });
  await page.waitForSelector('h1:has-text("Panel de control")');
}
async function logout() {
  await page.locator('.topbar-profile').click();
  await page.getByRole('button', { name: /Cerrar sesión/ }).click();
  await page.waitForURL('http://127.0.0.1:8788/login');
}

try {
  await login('admin', 'admin123');
  const adminNav = await page.locator('.sidebar-nav').innerText();
  console.log('admin nav includes Configuración:', adminNav.includes('Configuración'));

  // Import customers through UI
  await page.goto('http://127.0.0.1:8788/datos', { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /Importar datos/ }).click();
  await page.waitForTimeout(400);
  const input = page.locator('.import-panel input[type="file"]');
  await input.setInputFiles('tests/import-clientes.csv');
  await page.getByRole('button', { name: 'Validar archivo' }).click();
  await page.waitForTimeout(1200);
  console.log('validation summary:', await page.locator('.validation-summary').innerText().catch(() => 'missing'));
  await page.getByRole('button', { name: /Importar 2 filas/ }).click();
  await page.waitForTimeout(1500);
  console.log('import toast:', await page.locator('.toast').last().innerText().catch(() => 'none'));
  const importedCustomer = await page.evaluate(async () => {
    const response = await fetch('/api/partners');
    const data = await response.json();
    return data.customers.find((c) => c.name.includes('Los Andes'));
  });
  console.log('imported customer:', importedCustomer?.name, importedCustomer?.nit);

  // Create backup
  await page.getByRole('tab', { name: /Respaldos/ }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Crear respaldo ahora' }).click();
  await page.waitForTimeout(1500);
  console.log('backup toast:', await page.locator('.toast').last().innerText().catch(() => 'none'));
  console.log('backup rows:', await page.locator('.backup-main tbody tr').count());

  // Vendedor restrictions
  await logout();
  await login('vendedor', 'venta123');
  const vendorNav = await page.locator('.sidebar-nav').innerText();
  console.log('vendor has Compras menu:', vendorNav.includes('Compras'), '| Caja menu:', vendorNav.includes('Caja y bancos'));
  await page.goto('http://127.0.0.1:8788/compras', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  console.log('vendor /compras access denied:', (await page.locator('body').innerText()).includes('Acceso restringido'));
  await page.goto('http://127.0.0.1:8788/cxc', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  console.log('vendor /cxc accessible:', (await page.locator('body').innerText()).includes('Cuentas por cobrar'));
  await page.screenshot({ path: 'tests/artifacts/mobile-vendor.png', fullPage: false });

  // Contador restrictions
  await logout();
  await login('contador', 'contador123');
  const accountantNav = await page.locator('.sidebar-nav').innerText();
  console.log('accountant has Compras:', accountantNav.includes('Compras'), '| Estados:', accountantNav.includes('Estados financieros'), '| Config:', accountantNav.includes('Configuración'));
  await page.goto('http://127.0.0.1:8788/configuracion', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  console.log('accountant /configuracion access denied:', (await page.locator('body').innerText()).includes('Acceso restringido'));

  console.log('LOGS:', logs);
  console.log('ROLE/IMPORT TESTS COMPLETE');
} catch (error) {
  console.error('TEST FAILED:', error.message);
  console.error(logs);
  await page.screenshot({ path: 'tests/artifacts/import-role-failure.png', fullPage: true });
  process.exitCode = 1;
} finally {
  await browser.close();
}
