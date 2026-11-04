import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cemento-control-test-'));
process.env.DB_FILE = path.join(tmpDir, 'test.db');
process.env.HOST = '127.0.0.1';

let server;
let baseUrl;
let adminCookie;
let vendorCookie;
let db;
let salePayload;
let createdSale;
let initialStock;

function cookieFrom(response) {
  return response.headers.getSetCookie()[0].split(';')[0];
}

async function api(pathname, { cookie = adminCookie, method = 'GET', body, headers = {} } = {}) {
  const init = { method, headers: { ...headers } };
  if (cookie) init.headers.cookie = cookie;
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${baseUrl}${pathname}`, init);
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  return { response, data };
}

before(async () => {
  const { seedDatabase } = await import('../server/seed.js');
  await seedDatabase({ force: true, verbose: false });
  const { db: database } = await import('../server/db.js');
  db = database;
  const { createApp } = await import('../server/app.js');
  const app = createApp();
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}/api`;

  const login = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });
  assert.equal(login.status, 200);
  adminCookie = cookieFrom(login);

  const vendorLogin = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'vendedor', password: 'venta123' })
  });
  assert.equal(vendorLogin.status, 200);
  vendorCookie = cookieFrom(vendorLogin);
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db) db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('health check y login', async () => {
  const { response, data } = await api('/health', { cookie: null });
  assert.equal(response.status, 200);
  assert.equal(data.status, 'ok');

  const failed = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'incorrecta' })
  });
  assert.equal(failed.status, 401);
});

test('dashboard returns all KPI groups', async () => {
  const { response, data } = await api('/dashboard');
  assert.equal(response.status, 200);
  assert.ok(data.summary.revenue > 0);
  assert.ok(data.kpis.cash);
  assert.ok(data.kpis.eoq);
  assert.ok(data.chart.months.length === 12);
  assert.equal(data.balanceSheet, undefined);
});

test('sales endpoint rejects anonymous requests and vendor cannot read purchases', async () => {
  const anonymous = await api('/sales', { cookie: null });
  assert.equal(anonymous.response.status, 401);
  const vendorPurchases = await api('/purchases', { cookie: vendorCookie });
  assert.equal(vendorPurchases.response.status, 403);
  const vendorSales = await api('/sales?limit=1', { cookie: vendorCookie });
  assert.equal(vendorSales.response.status, 200);
});

test('create sale with automatic invoice and CxC', async () => {
  const meta = (await api('/meta')).data;
  const product = meta.products.find((item) => item.code === 'CEM-001');
  initialStock = Number(product.stock);
  salePayload = {
    delivery_date: meta.today,
    customer_id: meta.customers[0].id,
    payment_condition: 'credito',
    due_date: meta.today,
    payment_method: 'bancos',
    product_id: product.id,
    quantity: 5,
    unit_price: product.sale_price,
    courier_id: meta.couriers[0].id,
    loading_value: 50000,
    loading_type: 'contado',
    notes: 'Venta de prueba automatizada'
  };
  const { response, data } = await api('/sales', { method: 'POST', body: salePayload });
  assert.equal(response.status, 201, JSON.stringify(data));
  assert.match(data.data.invoice_number, /^FV-\d+$/);
  createdSale = data.data;
  assert.equal(data.data.balance, salePayload.quantity * salePayload.unit_price + salePayload.loading_value);
  assert.equal(data.data.payment_condition, 'credito');

  const inventory = (await api('/inventory')).data;
  const updated = inventory.products.find((item) => item.code === 'CEM-001');
  assert.equal(Number(updated.stock), initialStock - 5);

  const receivable = (await api(`/receivables?limit=200&search=${encodeURIComponent(createdSale.invoice_number)}`)).data.data.find((row) => row.invoice_number === createdSale.invoice_number);
  assert.ok(receivable);
  assert.equal(receivable.balance, createdSale.total);
});

test('register CxC payment and update cash', async () => {
  const receivables = (await api(`/receivables?limit=200&search=${encodeURIComponent(createdSale.invoice_number)}`)).data;
  const row = receivables.data.find((item) => item.invoice_number === createdSale.invoice_number);
  assert.ok(row);
  const cashBefore = (await api('/cash')).data.summary.closing;
  const { response, data } = await api(`/receivables/${row.id}/payments`, {
    method: 'POST',
    body: {
      amount: 100000,
      payment_date: (await api('/meta')).data.today,
      method: 'bancos',
      notes: 'Abono automatizado'
    }
  });
  assert.equal(response.status, 201, JSON.stringify(data));
  const cashAfter = (await api('/cash')).data.summary.closing;
  assert.equal(Math.round(cashAfter - cashBefore), Math.round(100000 - data.data.fee));
  const after = await api(`/sales/${createdSale.id}`);
  assert.equal(after.data.data.balance, createdSale.total - 100000);
});

test('create purchase updates stock and creates payable when credit', async () => {
  const meta = (await api('/meta')).data;
  const product = meta.products.find((item) => item.code === 'CEM-001');
  const stockBefore = Number((await api('/inventory')).data.products.find((item) => item.id === product.id).stock);
  const body = {
    arrival_date: meta.today,
    payment_date: meta.today,
    supplier_id: meta.suppliers[0].id,
    product_id: product.id,
    quantity: 10,
    unit_cost: 22000,
    purchase_type: 'credito',
    initial_payment: 50000,
    credit_due_date: meta.today,
    payment_method: 'bancos',
    freight_payer: 'yo',
    freight_value: 100000,
    freight_type: 'contado',
    unloading_value: 20000,
    unloading_type: 'contado'
  };
  const { response, data } = await api('/purchases', { method: 'POST', body });
  assert.equal(response.status, 201, JSON.stringify(data));
  assert.match(data.data.doc_number, /^FC-\d+$/);
  assert.equal(data.data.total_cost, 10 * 22000 + 100000 + 20000);
  assert.equal(data.data.invoice_total, 10 * 22000 + 100000);
  assert.equal(data.data.paid_total, 50000 + 100000);
  assert.equal(data.data.balance, 10 * 22000 - 50000);
  const stockAfter = Number((await api('/inventory')).data.products.find((item) => item.id === product.id).stock);
  assert.equal(stockAfter, stockBefore + 10);
  const payables = (await api('/payables?limit=200')).data.data.filter((item) => item.doc_number === data.data.doc_number);
  assert.ok(payables.length >= 1);
  assert.equal(payables.reduce((sum, item) => sum + item.balance, 0), 10 * 22000 - 50000);
});

test('manual cash movement and inventory adjustment', async () => {
  const meta = (await api('/meta')).data;
  const movement = await api('/cash', {
    method: 'POST',
    body: {
      movement_date: meta.today,
      type: 'ingreso',
      amount: 75000,
      method: 'efectivo',
      category: 'aportes',
      description: 'Aporte de prueba'
    }
  });
  assert.equal(movement.response.status, 201);

  const product = meta.products[0];
  const stockBefore = Number((await api('/inventory')).data.products.find((item) => item.id === product.id).stock);
  const adjustment = await api('/inventory/adjustments', {
    method: 'POST',
    body: {
      product_id: product.id,
      adjustment_date: meta.today,
      type: 'entrada',
      quantity: 3,
      unit_cost: 20000,
      reason: 'Prueba automatizada de ajuste'
    }
  });
  assert.equal(adjustment.response.status, 201, JSON.stringify(adjustment.data));
  const stockAfter = Number((await api('/inventory')).data.products.find((item) => item.id === product.id).stock);
  assert.equal(stockAfter, stockBefore + 3);
});

test('settings, exports, costing and financial statements', async () => {
  const settings = await api('/settings');
  assert.equal(settings.response.status, 200);

  const update = await api('/settings', {
    method: 'PUT',
    body: { thresholds: { marginGreen: 21, marginYellow: 10 } }
  });
  assert.equal(update.response.status, 200);
  assert.equal(update.data.config.thresholds.marginGreen, 21);

  const forbidden = await api('/settings', { cookie: vendorCookie, method: 'PUT', body: { thresholds: {} } });
  assert.equal(forbidden.response.status, 403);

  const newUser = await api('/users', {
    method: 'POST',
    body: {
      username: 'auditor.calidad',
      full_name: 'Auditor de Calidad',
      role: 'contador',
      password: 'auditor123'
    }
  });
  assert.equal(newUser.response.status, 201, JSON.stringify(newUser.data));
  const auditorLogin = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'auditor.calidad', password: 'auditor123' })
  });
  assert.equal(auditorLogin.status, 200);
  const auditorCookie = cookieFrom(auditorLogin);
  const auditorMe = await api('/auth/me', { cookie: auditorCookie });
  assert.equal(auditorMe.data.user.role, 'contador');
  const auditorSettings = await api('/settings', { cookie: auditorCookie });
  assert.equal(auditorSettings.response.status, 403);

  const csv = await fetch(`${baseUrl}/export/sales?format=csv`, { headers: { cookie: adminCookie } });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  const csvText = await csv.text();
  assert.ok(csvText.includes('Factura;Fecha entrega'));

  const financial = await api('/financial-statements');
  assert.equal(financial.response.status, 200);
  assert.equal(financial.data.balanceSheet.balanced, true);

  const costing = await api('/costing');
  assert.equal(costing.response.status, 200);
  assert.ok(costing.data.rows.length > 0);
  assert.ok(costing.data.totals.totalCost > 0);
});

test('export PDF and backup JSON endpoints return valid binaries', async () => {
  const today = (await api('/meta')).data.today;
  const pdfResponse = await fetch(`${baseUrl}/export/financial.pdf?month=${today.slice(0, 7)}`, {
    headers: { cookie: adminCookie }
  });
  assert.equal(pdfResponse.status, 200);
  const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
  assert.equal(pdfBuffer.subarray(0, 4).toString(), '%PDF');
  assert.ok(pdfBuffer.length > 1000);

  const backupResponse = await fetch(`${baseUrl}/export/backup.json`, { headers: { cookie: adminCookie } });
  assert.equal(backupResponse.status, 200);
  const backup = await backupResponse.json();
  assert.equal(backup.app, 'CementoControl');
  assert.ok(Array.isArray(backup.tables.sales));
});


test('personal debt interest payments do not reduce outstanding principal', async () => {
  const meta = (await api('/meta')).data;
  const created = await api('/debts', {
    method: 'POST',
    body: {
      creditor_name: 'Prestamista de prueba',
      creditor_type: 'persona',
      principal: 1000000,
      monthly_interest_rate: 2,
      term_months: 3,
      start_date: meta.today,
      first_payment_date: meta.today,
      description: 'Prueba de interés personal'
    }
  });
  assert.equal(created.response.status, 201, JSON.stringify(created.data));
  const debt = created.data.data;
  const interestInstallment = debt.installments.find((row) => row.kind === 'interes');
  assert.ok(interestInstallment);
  const payment = await api(`/debts/${debt.id}/installments/${interestInstallment.id}/pay`, {
    method: 'POST',
    body: { payment_date: meta.today, method: 'efectivo' }
  });
  assert.equal(payment.response.status, 201, JSON.stringify(payment.data));
  const listed = await api('/debts');
  const row = listed.data.data.find((item) => item.id === debt.id);
  assert.equal(row.pending_balance, 1000000);
  assert.equal(row.total_paid, 20000);
});
