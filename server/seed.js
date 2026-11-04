import { fileURLToPath } from 'node:url';
import { db, nowIso, tx } from './db.js';
import { saveConfig, setSetting } from './config.js';
import { hashPassword } from './auth.js';
import {
  addDays,
  isValidDate,
  monthBounds,
  monthLabel,
  monthOf,
  monthRange,
  todayBogota
} from './lib/dates.js';
import { money } from './lib/money.js';
import {
  createPurchase,
  createSale,
  registerPayablePayment,
  registerReceivablePayment
} from './services/operations.js';

const DEMO_CUSTOMERS = [
  ['Ferretería El Constructor', '830.112.554-1', '+57 310 445 2281', 'Calle 13 # 24-56, Bogotá'],
  ['Distribuidora La 80', '900.781.233-4', '+57 315 768 1190', 'Av. 80 # 45-12, Bogotá'],
  ['Construcciones Andinas S.A.S.', '901.556.298-7', '+57 312 220 9084', 'Carrera 68 # 22-15, Bogotá'],
  ['Materiales San Rafael', '79.584.220-5', '+57 300 873 4412', 'Calle 50 Sur # 18-30, Bogotá'],
  ['Ferretería Central', '900.224.781-9', '+57 311 902 7388', 'Carrera 10 # 19-42, Bogotá'],
  ['Obra Civil S.A.S.', '901.888.002-6', '+57 321 550 9831', 'Av. Boyacá # 63-08, Bogotá'],
  ['Depósito Los Pinos', '83.220.154-8', '+57 313 440 7782', 'Calle 72 # 50-21, Bogotá'],
  ['Constructora Horizonte', '901.334.762-0', '+57 318 660 3544', 'Carrera 7 # 116-50, Bogotá'],
  ['Ferretería La Esperanza', '1.020.884.552-3', '+57 304 225 6701', 'Calle 38 Sur # 72-14, Bogotá'],
  ['Maderas y Materiales El Roble', '900.998.120-2', '+57 316 118 9234', 'Av. Caracas # 48-55, Bogotá']
];

const DEMO_SUPPLIERS = [
  ['Cementos Argos', '890.100.251-6', '+57 601 325 4200', 'Planta Fontibón, Bogotá'],
  ['Cemex Colombia', '890.107.245-8', '+57 601 603 9000', 'Planta La Calera, Cundinamarca'],
  ['Holcim Colombia', '860.030.580-1', '+57 601 745 8000', 'Zona Industrial, Nobsa'],
  ['Transportes El Volcán', '900.442.188-3', '+57 310 772 4410', 'Soacha, Cundinamarca'],
  ['Servicios de Descargue Rápidos', '901.220.451-0', '+57 320 553 1770', 'Kennedy, Bogotá']
];

const DEMO_COURIERS = [
  ['Jhon Ramírez', '+57 311 554 7712'],
  ['Carlos Pérez', '+57 300 441 9280'],
  ['Luis Gómez', '+57 314 882 1170'],
  ['Andrés Torres', '+57 320 775 6631']
];

const DEMO_PRODUCTS = [
  {
    code: 'CEM-001',
    name: 'Cemento Gris Uso General 50 kg',
    unit: 'Bulto',
    salePrice: 31500,
    baseCost: 21800,
    minStock: 300,
    orderingCost: 130000,
    holdingRate: 0.18,
    baseDemand: 1250
  },
  {
    code: 'CEM-002',
    name: 'Cemento Estructural 50 kg',
    unit: 'Bulto',
    salePrice: 34500,
    baseCost: 23800,
    minStock: 160,
    orderingCost: 120000,
    holdingRate: 0.18,
    baseDemand: 420
  },
  {
    code: 'CEM-003',
    name: 'Cemento Blanco 50 kg',
    unit: 'Bulto',
    salePrice: 39800,
    baseCost: 28200,
    minStock: 80,
    orderingCost: 90000,
    holdingRate: 0.20,
    baseDemand: 180
  },
  {
    code: 'CEM-004',
    name: 'Mortero Listo 40 kg',
    unit: 'Bulto',
    salePrice: 26500,
    baseCost: 16800,
    minStock: 110,
    orderingCost: 80000,
    holdingRate: 0.20,
    baseDemand: 300
  },
  {
    code: 'CEM-005',
    name: 'Cemento Gris 42.5 kg',
    unit: 'Bulto',
    salePrice: 29900,
    baseCost: 20200,
    minStock: 200,
    orderingCost: 110000,
    holdingRate: 0.18,
    baseDemand: 520
  }
];

const INDIRECT_TEMPLATE = [
  ['Arriendo bodega', 'Arriendo de bodega y patio de maniobras', 2450000, 'volumen', 1],
  ['Nómina administrativa', 'Salarios administración y prestaciones', 2650000, 'valor_venta', 1],
  ['Energía y servicios', 'Energía, agua e internet de la operación', 540000, 'volumen', 1],
  ['Contabilidad y honorarios', 'Revisoría fiscal y servicios contables', 480000, 'valor_venta', 1],
  ['Seguros y otros', 'Pólizas, seguridad y papelería', 310000, 'volumen', 1],
  ['Mantenimiento bodega', 'Mantenimiento correctivo y aseo', 260000, 'volumen', 0]
];

function clearAllData() {
  const tables = [
    'activity_log',
    'sessions',
    'payable_payments',
    'accounts_payable',
    'receivable_payments',
    'accounts_receivable',
    'sales',
    'purchases',
    'inventory_adjustments',
    'inventory_movements',
    'cash_movements',
    'indirect_costs',
    'products',
    'couriers',
    'suppliers',
    'customers',
    'users',
    'settings'
  ];
  db.exec('PRAGMA foreign_keys = OFF;');
  try {
    db.exec('BEGIN IMMEDIATE;');
    for (const table of tables) db.exec(`DELETE FROM ${table};`);
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('users','customers','suppliers','couriers','products','purchases','sales','accounts_receivable','receivable_payments','accounts_payable','payable_payments','cash_movements','inventory_movements','inventory_adjustments','indirect_costs','activity_log');");
    db.exec('COMMIT;');
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch { /* ignore */ }
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

function insertUser({ username, password, fullName, role }) {
  return Number(db.prepare(`
    INSERT INTO users (username, password_hash, full_name, role, active, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(username, hashPassword(password), fullName, role, nowIso()).lastInsertRowid);
}

function insertPartners() {
  const customers = [];
  const customerStmt = db.prepare(`
    INSERT INTO customers (name, nit, phone, address, created_at) VALUES (?, ?, ?, ?, ?)
  `);
  for (const [name, nit, phone, address] of DEMO_CUSTOMERS) {
    const id = Number(customerStmt.run(name, nit, phone, address, nowIso()).lastInsertRowid);
    customers.push({ id, name });
  }
  const suppliers = [];
  const supplierStmt = db.prepare(`
    INSERT INTO suppliers (name, nit, phone, address, created_at) VALUES (?, ?, ?, ?, ?)
  `);
  for (const [name, nit, phone, address] of DEMO_SUPPLIERS) {
    const id = Number(supplierStmt.run(name, nit, phone, address, nowIso()).lastInsertRowid);
    suppliers.push({ id, name });
  }
  const couriers = [];
  const courierStmt = db.prepare(`
    INSERT INTO couriers (name, phone, active, created_at) VALUES (?, ?, 1, ?)
  `);
  for (const [name, phone] of DEMO_COURIERS) {
    const id = Number(courierStmt.run(name, phone, nowIso()).lastInsertRowid);
    couriers.push({ id, name });
  }
  return { customers, suppliers, couriers };
}

function insertProducts() {
  const products = [];
  const stmt = db.prepare(`
    INSERT INTO products
      (code, name, unit, stock, avg_cost, sale_price, min_stock, ordering_cost, holding_rate, active, created_at)
    VALUES (?, ?, ?, 0, 0, ?, ?, ?, ?, 1, ?)
  `);
  for (const product of DEMO_PRODUCTS) {
    const id = Number(stmt.run(
      product.code,
      product.name,
      product.unit,
      product.salePrice,
      product.minStock,
      product.orderingCost,
      product.holdingRate,
      nowIso()
    ).lastInsertRowid);
    products.push({ ...product, id });
  }
  return products;
}

function dateFor(month, day) {
  const { lastDay } = monthBounds(month);
  const clamped = Math.max(1, Math.min(day, lastDay));
  return `${month}-${String(clamped).padStart(2, '0')}`;
}

function insertIndirectCosts(months) {
  const stmt = db.prepare(`
    INSERT INTO indirect_costs
      (period, category, description, amount, allocation_method, is_fixed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  months.forEach((month, index) => {
    const factor = 1 + index * 0.004;
    for (const [category, description, amount, method, fixed] of INDIRECT_TEMPLATE) {
      stmt.run(month, category, description, money(amount * factor), method, fixed, nowIso());
    }
  });
}

function targetQuantities(index) {
  const growth = 1 + index * 0.055;
  const currentBoost = index === 11 ? 1.02 : 1;
  return DEMO_PRODUCTS.map((product) => Math.round(product.baseDemand * growth * currentBoost));
}

function splitQuantity(total, parts = 4) {
  const weights = [0.2, 0.23, 0.27, 0.3];
  const quantities = weights.map((weight) => Math.max(1, Math.round(total * weight)));
  const diff = total - quantities.reduce((sum, value) => sum + value, 0);
  quantities[quantities.length - 1] += diff;
  return quantities;
}

function payOpenPayables(accountant, payableIds, skipModulo = 8) {
  let counter = 0;
  for (const payableId of payableIds) {
    const payable = db.prepare('SELECT * FROM accounts_payable WHERE id = ?').get(payableId);
    if (!payable) continue;
    const outstanding = money(payable.amount - payable.paid);
    if (outstanding <= 0.5) continue;
    if (payable.due_date > todayBogota()) continue;
    counter += 1;
    if (counter % skipModulo === 0) continue;
    const amount = counter % 6 === 0 ? money(outstanding * 0.55) : outstanding;
    const method = counter % 10 === 0 ? 'efectivo' : 'bancos';
    registerPayablePayment(payableId, {
      amount,
      payment_date: payable.due_date,
      method,
      notes: 'Pago programado de demostración'
    }, accountant);
  }
}

function payReceivables(accountant, creditSales) {
  let counter = 0;
  for (const sale of creditSales) {
    if (!sale.receivable_id) continue;
    if (!sale.due_date || sale.due_date > todayBogota()) continue;
    const balance = money(sale.receivable_amount - sale.receivable_paid);
    if (balance <= 0.5) continue;
    counter += 1;
    if (counter % 9 === 0) continue;
    const amount = counter % 7 === 0 ? money(balance * 0.6) : balance;
    const method = counter % 7 === 0 ? 'efectivo' : 'bancos';
    try {
      registerReceivablePayment(sale.receivable_id, {
        amount,
        payment_date: sale.due_date,
        method,
        notes: 'Recaudo de demostración'
      }, accountant);
    } catch (error) {
      console.warn('No se pudo registrar recaudo de ejemplo:', error.message);
    }
  }
}

export async function seedDatabase({ force = false, verbose = true } = {}) {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (existing > 0 && !force) return { seeded: false, reason: 'La base de datos ya tiene usuarios.' };

  const originalSync = db.prepare('PRAGMA synchronous').get();
  db.exec('PRAGMA synchronous = OFF;');
  const log = verbose ? (...args) => console.log(...args) : () => {};
  log('Cargando datos de demostración de CementoControl…');
  try {
    if (force || existing > 0) clearAllData();

    const adminId = insertUser({
      username: 'admin',
      password: 'admin123',
      fullName: 'Andrea Morales',
      role: 'administrador'
    });
    insertUser({
      username: 'vendedor',
      password: 'venta123',
      fullName: 'Diego Rojas',
      role: 'vendedor'
    });
    insertUser({
      username: 'contador',
      password: 'contador123',
      fullName: 'Laura Cárdenas',
      role: 'contador'
    });
    const admin = { id: adminId, full_name: 'Andrea Morales', username: 'admin', role: 'administrador' };
    const seller = { id: adminId, full_name: 'Diego Rojas', username: 'vendedor', role: 'vendedor' };
    const accountant = { id: adminId, full_name: 'Laura Cárdenas', username: 'contador', role: 'contador' };

    saveConfig({
      business: {
        name: 'Cemento Andino S.A.S.',
        shortName: 'Cemento Andino',
        nit: '901.482.763-5',
        address: 'Km 4 Vía Soacha – Bogotá, Bodega 12',
        city: 'Bogotá D.C.',
        phone: '+57 320 458 7721',
        email: 'ventas@cementoandino.co',
        logo: ''
      },
      openingBalances: { cash: 15000000, bank: 70000000, capital: 85000000 },
      fiscal: { gmfRate: 0.004, ivaEnabled: false, ivaRate: 0.19 },
      inventory: { defaultOrderingCost: 120000, defaultHoldingRate: 0.18 },
      backup: { enabled: true, hour: 23, retention: 14 }
    });
    setSetting('seq_sale_next', 1001);
    setSetting('seq_purchase_next', 1);
    setSetting('seed_version', '1.0.0');
    setSetting('seeded_at', nowIso());

    const { customers, suppliers, couriers } = insertPartners();
    const products = insertProducts();

    const today = todayBogota();
    const currentMonth = monthOf(today);
    const currentDay = Number(today.slice(8, 10));
    const months = monthRange(currentMonth, 12);
    insertIndirectCosts(months);

    let saleCounter = 0;

    for (let index = 0; index < months.length; index += 1) {
      const month = months[index];
      const isCurrent = month === currentMonth;
      const { lastDay } = monthBounds(month);
      const effectiveDays = isCurrent ? currentDay : lastDay;
      const targets = targetQuantities(index);
      const monthlyPurchases = [];
      const monthlySales = [];
      const monthlyCreditSales = [];

      for (let productIndex = 0; productIndex < products.length; productIndex += 1) {
        const product = products[productIndex];
        const target = targets[productIndex];
        const purchaseQuantity = Math.round(target * 1.02 + 40 + (index === 0 ? 150 : 0));
        const costFactor = 1 + index * 0.0055;
        const supplier = suppliers[productIndex % 3];
        const transportProvider = suppliers[3];
        const unloadingProvider = suppliers[4];
        const creditForProduct = (index + productIndex) % 3 === 0 || isCurrent;
        const freightByUs = (index + productIndex) % 5 !== 0;
        const purchaseCost = money(purchaseQuantity * product.baseCost * costFactor);
        const freight = freightByUs ? money(purchaseQuantity * 540 + 450000) : 0;
        const unloading = money(purchaseQuantity * 110 + 90000);
        const paymentDate = dateFor(month, 1);
        const initialPayment = creditForProduct ? money(purchaseCost * 0.3) : 0;
        const purchase = createPurchase({
          doc_number: '',
          arrival_date: dateFor(month, 1),
          payment_date: paymentDate,
          supplier_id: supplier.id,
          product_id: product.id,
          quantity: purchaseQuantity,
          unit_cost: money(product.baseCost * costFactor),
          purchase_type: creditForProduct ? 'credito' : 'contado',
          initial_payment: initialPayment,
          credit_due_date: addDays(dateFor(month, 1), isCurrent && productIndex === 0 ? 10 : 30),
          payment_method: (index * 3 + productIndex) % 17 === 0 ? 'efectivo' : 'bancos',
          freight_payer: freightByUs ? 'yo' : 'proveedor',
          driver_name: freightByUs ? ['Jhon Ramírez', 'Carlos Pérez', 'Luis Gómez'][(index + productIndex) % 3] : '',
          freight_value: freight,
          freight_type: (index + productIndex) % 4 === 0 ? 'credito' : 'contado',
          freight_advance: (index + productIndex) % 4 === 0 ? money(freight * 0.25) : 0,
          freight_provider: freightByUs ? transportProvider.name : '',
          unloading_value: unloading,
          unloading_type: 'contado',
          unloading_advance: 0,
          unloading_provider: unloadingProvider.name,
          notes: `Abastecimiento ${monthLabel(month)} · ${product.code}`
        }, admin);
        monthlyPurchases.push(purchase);

        const quantities = splitQuantity(target, 4);
        for (let part = 0; part < quantities.length; part += 1) {
          const quantity = quantities[part];
          if (quantity <= 0) continue;
          const day = Math.max(1, Math.min(effectiveDays, 1 + Math.round(((part + 0.35) / quantities.length) * Math.max(1, effectiveDays - 1))));
          const deliveryDate = dateFor(month, day);
          const customer = customers[(index * 3 + productIndex * 2 + part) % customers.length];
          const courier = couriers[(index + productIndex + part) % couriers.length];
          const priceNudge = 1 + ((((index + 3) * (productIndex + 2) + part * 5) % 5) - 2) / 100;
          const unitPrice = money(product.salePrice * (1 + index * 0.0025) * priceNudge);
          const condition = (index + productIndex + part) % 2 === 0 ? 'contado' : 'credito';
          const loadingValue = money(75000 + quantity * 105 + ((index + part) % 4) * 15000);
          const loadingCredit = (index + productIndex + part) % 11 === 0;
          const sale = createSale({
            invoice_number: '',
            delivery_date: deliveryDate,
            customer_id: customer.id,
            payment_condition: condition,
            due_date: condition === 'credito' ? addDays(deliveryDate, 30) : '',
            money_entry_date: deliveryDate,
            payment_method: (index + productIndex + part) % 8 === 0 ? 'efectivo' : 'bancos',
            courier_id: courier.id,
            loading_value: loadingValue,
            loading_type: loadingCredit ? 'credito' : 'contado',
            loading_provider: loadingCredit ? transportProvider.name : courier.name,
            product_id: product.id,
            quantity,
            unit_price: unitPrice,
            notes: `Entrega de ${quantity} bultos · ${customer.name}`
          }, seller);
          saleCounter += 1;
          monthlySales.push(sale);
          if (condition === 'credito') monthlyCreditSales.push(sale);
        }
      }

      const purchasePayableIds = monthlyPurchases.flatMap((purchase) => db
        .prepare('SELECT id FROM accounts_payable WHERE purchase_id = ? AND amount - paid > 0.5')
        .all(purchase.id)
        .map((row) => row.id));
      const salePayableIds = monthlySales.flatMap((sale) => db
        .prepare('SELECT id FROM accounts_payable WHERE sale_id = ? AND amount - paid > 0.5')
        .all(sale.id)
        .map((row) => row.id));
      payOpenPayables(accountant, [...new Set([...purchasePayableIds, ...salePayableIds])], 8);
      payReceivables(accountant, monthlyCreditSales);

      log(`  ${monthLabel(month)}: ${monthlyPurchases.length} compras, ${monthlySales.length} ventas`);
    }

    db.prepare('DELETE FROM activity_log').run();
    db.prepare(`
      INSERT INTO activity_log (user_id, user_name, action, entity, entity_id, details, created_at)
      VALUES (?, 'Sistema', 'instalación', 'sistema', NULL, 'Datos de demostración cargados correctamente', ?)
    `).run(adminId, nowIso());

    const counts = {
      customers: db.prepare('SELECT COUNT(*) AS n FROM customers').get().n,
      products: db.prepare('SELECT COUNT(*) AS n FROM products').get().n,
      purchases: db.prepare('SELECT COUNT(*) AS n FROM purchases').get().n,
      sales: db.prepare('SELECT COUNT(*) AS n FROM sales').get().n,
      salesCount: saleCounter
    };
    log(`Datos listos: ${counts.customers} clientes, ${counts.products} productos, ${counts.purchases} compras y ${counts.sales} ventas.`);
    return { seeded: true, counts };
  } finally {
    db.exec(`PRAGMA synchronous = ${originalSync?.synchronous === '0' ? 'OFF' : 'FULL'};`);
  }
}

export async function ensureSeed() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (count === 0) {
    return seedDatabase({ force: false });
  }
  return { seeded: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const force = process.argv.includes('--reset') || process.argv.includes('--force');
  seedDatabase({ force })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error al cargar los datos:', error);
      process.exit(1);
    });
}
