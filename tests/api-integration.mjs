import fs from 'node:fs';

fs.mkdirSync('tests/artifacts', { recursive: true });

const base = 'http://127.0.0.1:8788/api';
let cookie = '';
async function login() {
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  console.log('login', response.status);
  cookie = response.headers.getSetCookie()[0].split(';')[0];
}
async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: { cookie, ...(options.headers || {}) }
  });
  return response;
}
async function uploadCsv(path, csvText, filename) {
  const form = new FormData();
  form.append('file', new Blob([csvText], { type: 'text/csv' }), filename);
  return request(path, { method: 'POST', body: form });
}

await login();
const backupResponse = await request('/export/backup.json');
const backupBuffer = Buffer.from(await backupResponse.arrayBuffer());
console.log('backup json:', backupResponse.status, backupResponse.headers.get('content-type'), backupBuffer.length);
const backup = JSON.parse(backupBuffer.toString('utf8'));
console.log('backup tables:', Object.keys(backup.tables).length, 'users', backup.tables.users.length, 'sales', backup.tables.sales.length);

const csvResponse = await request('/export/sales?format=csv');
const csv = await csvResponse.text();
console.log('sales csv:', csvResponse.status, csvResponse.headers.get('content-type'), csv.split('\n').length, 'lines', csv.slice(0, 30).replace(/\n/g, ' '));
const pdfResponse = await request('/export/financial.pdf?month=2026-11');
const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
console.log('financial pdf:', pdfResponse.status, pdfResponse.headers.get('content-type'), pdfBuffer.length, pdfBuffer.slice(0, 4).toString());
fs.writeFileSync('tests/artifacts/api-financial.pdf', pdfBuffer);

const saleCsv = 'factura;fecha_entrega;cliente;condicion_pago;vencimiento;medio_pago;fecha_dinero;producto;cantidad;precio_unitario;cotero;valor_cargue;tipo_cargue;notas\r\n;2026-11-03;Ferretería El Constructor;contado;;efectivo;2026-11-03;CEM-001;5;31500;Jhon Ramírez;50000;contado;Importación de prueba\r\n';
let response = await uploadCsv('/import/sales/validate', saleCsv, 'ventas-prueba.csv');
console.log('sale import validation:', response.status, JSON.stringify(await response.clone().json()).slice(0, 500));
response = await uploadCsv('/import/sales', saleCsv, 'ventas-prueba.csv');
console.log('sale import:', response.status, (await response.text()).slice(0, 500));

const purchaseCsv = 'documento;fecha_llegada;fecha_pago;proveedor;codigo_producto;cantidad;costo_unitario;tipo_compra;abono_inicial;medio_pago;vencimiento_credito;flete_pagado_por;conductor;valor_flete;tipo_flete;anticipo_flete;valor_descargue;tipo_descargue;anticipo_descargue;proveedor_flete;proveedor_descargue;notas\r\n;2026-11-03;2026-11-03;Cementos Argos;CEM-001;10;22000;contado;0;bancos;;proveedor;;0;contado;0;0;contado;0;;;Importación de prueba\r\n';
response = await uploadCsv('/import/purchases/validate', purchaseCsv, 'compras-prueba.csv');
console.log('purchase import validation:', response.status, JSON.stringify(await response.clone().json()).slice(0, 500));
response = await uploadCsv('/import/purchases', purchaseCsv, 'compras-prueba.csv');
console.log('purchase import:', response.status, (await response.text()).slice(0, 500));

response = await request('/settings', {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ thresholds: { marginGreen: 22, marginYellow: 11 } })
});
const settings = await response.json();
console.log('settings put:', response.status, settings.config?.thresholds?.marginGreen, settings.config?.thresholds?.marginYellow);

const userResponse = await request('/users', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'prueba.e2e', full_name: 'Usuario de Prueba', role: 'vendedor', password: 'prueba123' })
});
const createdUser = await userResponse.json();
console.log('user create:', userResponse.status, createdUser.data?.username, createdUser.data?.role);

// Restore the backup and verify the previous session is invalidated.
const form = new FormData();
form.append('file', new Blob([backupBuffer], { type: 'application/json' }), 'respaldo.json');
const restoreResponse = await fetch(`${base}/backup/restore`, { method: 'POST', headers: { cookie }, body: form });
const restoreText = await restoreResponse.text();
console.log('restore:', restoreResponse.status, restoreText.slice(0, 350));
const afterRestore = await fetch(`${base}/dashboard`, { headers: { cookie } });
console.log('old session after restore:', afterRestore.status);
await login();
const restored = await fetch(`${base}/settings`, { headers: { cookie } });
const restoredData = await restored.json();
console.log('restored threshold:', restoredData.config.thresholds.marginGreen);
const saleRows = await (await fetch(`${base}/sales?limit=1`, { headers: { cookie } })).json();
console.log('latest sale after restore:', saleRows.data?.[0]?.invoice_number);
console.log('API INTEGRATION TESTS COMPLETE');
