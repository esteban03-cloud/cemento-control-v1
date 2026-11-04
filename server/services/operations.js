import { db, logActivity, nowIso, tx } from '../db.js';
import { getConfig, getNextSequence, consumeSequence, getSetting } from '../config.js';
import {
  addDays,
  diffDays,
  isValidDate,
  todayBogota
} from '../lib/dates.js';
import { money, round2, roundStock } from '../lib/money.js';
import { ApiError } from '../lib/http.js';

const CASH_REFERENCES_TO_SALE = ['venta', 'venta_gmf', 'venta_cargue'];
const CASH_REFERENCES_TO_PURCHASE = ['compra_producto', 'compra_flete', 'compra_descargue'];

function fail(message, status = 422) {
  throw new ApiError(status, message);
}

function ensureDate(value, field) {
  if (!isValidDate(value)) fail(`${field} debe ser una fecha válida.`);
  return value;
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function translateConstraint(error, message = 'El registro ya existe.') {
  if (String(error?.message || '').includes('UNIQUE constraint failed')) {
    throw new ApiError(409, message);
  }
  throw error;
}

export function recalcProduct(productId) {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) return null;
  const movements = db.prepare(`
    SELECT quantity, unit_cost
    FROM inventory_movements
    WHERE product_id = ?
    ORDER BY movement_date ASC, id ASC
  `).all(productId);
  let stock = 0;
  let value = 0;
  for (const movement of movements) {
    const quantity = Number(movement.quantity) || 0;
    if (quantity >= 0) {
      stock += quantity;
      value += quantity * (Number(movement.unit_cost) || 0);
    } else {
      const average = stock > 0.000001 ? value / stock : Number(product.avg_cost) || 0;
      stock += quantity;
      value -= Math.abs(quantity) * average;
      if (stock <= 0.000001) {
        stock = 0;
        value = 0;
      }
    }
  }
  const avgCost = stock > 0.000001 ? round2(value / stock) : Number(product.avg_cost) || 0;
  db.prepare('UPDATE products SET stock = ?, avg_cost = ? WHERE id = ?')
    .run(roundStock(stock), avgCost, productId);
  return { stock: roundStock(stock), avg_cost: avgCost };
}

export function cashMovement({
  date,
  type,
  category,
  amount,
  method,
  description,
  referenceType = null,
  referenceId = null,
  userId = null,
  auto = 1
}) {
  const value = money(amount);
  if (value <= 0) return null;
  const info = db.prepare(`
    INSERT INTO cash_movements
      (movement_date, type, category, amount, method, description, reference_type, reference_id, auto, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    date,
    type,
    category,
    value,
    method,
    clean(description),
    referenceType,
    referenceId,
    auto ? 1 : 0,
    userId,
    nowIso()
  );
  return Number(info.lastInsertRowid);
}

function deleteCashMovements(ids) {
  if (!ids?.length) return;
  const statement = db.prepare('DELETE FROM cash_movements WHERE id = ?');
  for (const id of ids) statement.run(id);
}

export function cashBalances(asOf = todayBogota()) {
  const config = getConfig();
  const sums = db.prepare(`
    SELECT method,
      SUM(CASE WHEN type = 'ingreso' THEN amount ELSE 0 END) AS income,
      SUM(CASE WHEN type = 'egreso' THEN amount ELSE 0 END) AS expense
    FROM cash_movements
    WHERE movement_date <= ?
    GROUP BY method
  `).all(asOf);
  const byMethod = { efectivo: { income: 0, expense: 0 }, bancos: { income: 0, expense: 0 } };
  for (const row of sums) {
    if (byMethod[row.method]) {
      byMethod[row.method] = { income: Number(row.income) || 0, expense: Number(row.expense) || 0 };
    }
  }
  const cash = money(config.openingBalances.cash + byMethod.efectivo.income - byMethod.efectivo.expense);
  const bank = money(config.openingBalances.bank + byMethod.bancos.income - byMethod.bancos.expense);
  return {
    cash,
    bank,
    total: money(cash + bank),
    income: money(byMethod.efectivo.income + byMethod.bancos.income),
    expense: money(byMethod.efectivo.expense + byMethod.bancos.expense)
  };
}

function resolveCustomer(input) {
  if (input.customer_id) {
    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(input.customer_id);
    if (!existing) fail('El cliente seleccionado no existe.');
    return existing;
  }
  const name = clean(input.customer_name);
  if (!name) fail('Selecciona un cliente o escribe el nombre de uno nuevo.');
  const existing = db.prepare('SELECT * FROM customers WHERE name = ? COLLATE NOCASE').get(name);
  if (existing) return existing;
  const info = db.prepare(`
    INSERT INTO customers (name, nit, phone, address, created_at) VALUES (?, ?, ?, ?, ?)
  `).run(name, clean(input.customer_nit), clean(input.customer_phone), clean(input.customer_address), nowIso());
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(Number(info.lastInsertRowid));
}

function resolveSupplier(input) {
  if (input.supplier_id) {
    const existing = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(input.supplier_id);
    if (!existing) fail('El proveedor seleccionado no existe.');
    return existing;
  }
  const name = clean(input.supplier_name);
  if (!name) fail('Selecciona un proveedor o escribe el nombre de uno nuevo.');
  const existing = db.prepare('SELECT * FROM suppliers WHERE name = ? COLLATE NOCASE').get(name);
  if (existing) return existing;
  const info = db.prepare(`
    INSERT INTO suppliers (name, nit, phone, address, created_at) VALUES (?, ?, ?, ?, ?)
  `).run(name, clean(input.supplier_nit), clean(input.supplier_phone), clean(input.supplier_address), nowIso());
  return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(Number(info.lastInsertRowid));
}

function resolveCourier(input) {
  if (input.courier_id) {
    const existing = db.prepare('SELECT * FROM couriers WHERE id = ?').get(input.courier_id);
    if (!existing) fail('El cotero seleccionado no existe.');
    return existing;
  }
  const name = clean(input.courier_name);
  if (!name) return null;
  const existing = db.prepare('SELECT * FROM couriers WHERE name = ? COLLATE NOCASE').get(name);
  if (existing) return existing;
  const info = db.prepare(`
    INSERT INTO couriers (name, phone, active, created_at) VALUES (?, ?, 1, ?)
  `).run(name, clean(input.courier_phone), nowIso());
  return db.prepare('SELECT * FROM couriers WHERE id = ?').get(Number(info.lastInsertRowid));
}

function resolveProductForPurchase(input) {
  if (input.product_id) {
    const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(input.product_id);
    if (!existing) fail('El producto seleccionado no existe.');
    return existing;
  }
  const code = clean(input.product_code);
  const name = clean(input.product_name);
  if (!code || !name) fail('Selecciona un producto o crea uno nuevo con código y nombre.');
  const existing = db.prepare('SELECT * FROM products WHERE code = ? COLLATE NOCASE').get(code);
  if (existing) return existing;
  const info = db.prepare(`
    INSERT INTO products
      (code, name, unit, stock, avg_cost, sale_price, min_stock, ordering_cost, holding_rate, active, created_at)
    VALUES (?, ?, 'Bulto', 0, 0, ?, ?, ?, ?, 1, ?)
  `).run(
    code,
    name,
    money(input.new_product_sale_price),
    Number(input.new_product_min_stock) || 0,
    Number(input.new_product_ordering_cost) || getConfig().inventory.defaultOrderingCost,
    Number(input.new_product_holding_rate) || getConfig().inventory.defaultHoldingRate,
    nowIso()
  );
  return db.prepare('SELECT * FROM products WHERE id = ?').get(Number(info.lastInsertRowid));
}

function nextDocument(kind, provided) {
  const custom = clean(provided);
  if (custom) return { label: custom, auto: false };
  return { label: getNextSequence(kind).label, auto: true };
}

function insertPurchase(input, user) {
  const arrivalDate = ensureDate(input.arrival_date, 'La fecha de llegada');
  const paymentDate = input.payment_date ? ensureDate(input.payment_date, 'La fecha de pago') : arrivalDate;
  const quantity = Number(input.quantity);
  const unitCost = money(input.unit_cost);
  if (!Number.isFinite(quantity) || quantity <= 0) fail('La cantidad comprada debe ser mayor que cero.');
  if (!Number.isFinite(unitCost) || unitCost < 0) fail('El costo unitario no puede ser negativo.');
  const purchaseType = input.purchase_type === 'credito' ? 'credito' : 'contado';
  const freightPayer = input.freight_payer === 'proveedor' ? 'proveedor' : 'yo';
  const freightType = input.freight_type === 'credito' ? 'credito' : 'contado';
  const unloadingType = input.unloading_type === 'credito' ? 'credito' : 'contado';
  const paymentMethod = input.payment_method === 'bancos' ? 'bancos' : 'efectivo';

  const supplier = resolveSupplier(input);
  const product = resolveProductForPurchase(input);
  const doc = nextDocument('purchase', input.doc_number);

  const productCost = money(quantity * unitCost);
  const freightValue = freightPayer === 'yo' ? money(input.freight_value) : 0;
  const unloadingValue = money(input.unloading_value);
  if (freightValue < 0 || unloadingValue < 0) fail('Los valores de flete y descargue no pueden ser negativos.');
  const landedCost = money(productCost + freightValue + unloadingValue);

  let productPaid;
  if (purchaseType === 'contado') {
    productPaid = productCost;
  } else {
    productPaid = Math.min(productCost, Math.max(0, money(input.initial_payment)));
  }

  const freightPaid = freightValue > 0
    ? (freightType === 'contado' ? freightValue : Math.min(freightValue, Math.max(0, money(input.freight_advance))))
    : 0;
  const unloadingPaid = unloadingValue > 0
    ? (unloadingType === 'contado' ? unloadingValue : Math.min(unloadingValue, Math.max(0, money(input.unloading_advance))))
    : 0;

  const hasCredit = (purchaseType === 'credito' && productPaid < productCost)
    || (freightValue > 0 && freightType === 'credito' && freightPaid < freightValue)
    || (unloadingValue > 0 && unloadingType === 'credito' && unloadingPaid < unloadingValue);
  let dueDate = null;
  if (hasCredit) {
    dueDate = input.credit_due_date
      ? ensureDate(input.credit_due_date, 'La fecha de vencimiento del crédito')
      : addDays(arrivalDate, 30);
    if (diffDays(arrivalDate, dueDate) < 0) fail('La fecha de vencimiento no puede ser anterior a la fecha de llegada.');
  }

  const totalPaidAtCreation = money(productPaid + freightPaid + unloadingPaid);
  let info;
  try {
    info = db.prepare(`
      INSERT INTO purchases (
        doc_number, arrival_date, payment_date, supplier_id, product_id, quantity, unit_cost,
        purchase_type, initial_payment, credit_due_date, payment_method, freight_payer, driver_name,
        freight_value, freight_type, freight_advance, freight_provider, unloading_value,
        unloading_type, unloading_advance, unloading_provider, notes, total_cost,
        total_paid_at_creation, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      doc.label,
      arrivalDate,
      paymentDate,
      supplier.id,
      product.id,
      roundStock(quantity),
      unitCost,
      purchaseType,
      productPaid,
      dueDate,
      paymentMethod,
      freightPayer,
      clean(input.driver_name),
      freightValue,
      freightType,
      freightPaid,
      clean(input.freight_provider) || (freightValue > 0 ? supplier.name : ''),
      unloadingValue,
      unloadingType,
      unloadingPaid,
      clean(input.unloading_provider) || (unloadingValue > 0 ? supplier.name : ''),
      clean(input.notes),
      landedCost,
      totalPaidAtCreation,
      user.id,
      nowIso()
    );
  } catch (error) {
    translateConstraint(error, 'Ya existe una compra con ese documento.');
  }
  const purchaseId = Number(info.lastInsertRowid);
  if (doc.auto) consumeSequence('purchase', doc.label);

  const productOutstanding = money(productCost - productPaid);
  if (productOutstanding > 0) {
    db.prepare(`
      INSERT INTO accounts_payable
        (purchase_id, sale_id, supplier_id, provider_name, concept, description, amount, paid, due_date, created_at)
      VALUES (?, NULL, ?, ?, 'producto', ?, ?, 0, ?, ?)
    `).run(
      purchaseId,
      supplier.id,
      supplier.name,
      `Compra ${doc.label} · ${product.name}`,
      productOutstanding,
      dueDate,
      nowIso()
    );
  }
  if (freightValue > 0) {
    const freightOutstanding = money(freightValue - freightPaid);
    if (freightOutstanding > 0) {
      db.prepare(`
        INSERT INTO accounts_payable
          (purchase_id, sale_id, supplier_id, provider_name, concept, description, amount, paid, due_date, created_at)
        VALUES (?, NULL, NULL, ?, 'flete', ?, ?, 0, ?, ?)
      `).run(
        purchaseId,
        clean(input.freight_provider) || supplier.name,
        `Flete compra ${doc.label}`,
        freightOutstanding,
        dueDate,
        nowIso()
      );
    }
  }
  if (unloadingValue > 0) {
    const unloadingOutstanding = money(unloadingValue - unloadingPaid);
    if (unloadingOutstanding > 0) {
      db.prepare(`
        INSERT INTO accounts_payable
          (purchase_id, sale_id, supplier_id, provider_name, concept, description, amount, paid, due_date, created_at)
        VALUES (?, NULL, NULL, ?, 'descargue', ?, ?, 0, ?, ?)
      `).run(
        purchaseId,
        clean(input.unloading_provider) || supplier.name,
        `Descargue compra ${doc.label}`,
        unloadingOutstanding,
        dueDate,
        nowIso()
      );
    }
  }

  if (productPaid > 0) {
    cashMovement({
      date: paymentDate,
      type: 'egreso',
      category: 'compras',
      amount: productPaid,
      method: paymentMethod,
      description: `Compra ${doc.label} · producto`,
      referenceType: 'compra_producto',
      referenceId: purchaseId,
      userId: user.id
    });
  }
  if (freightPaid > 0) {
    cashMovement({
      date: paymentDate,
      type: 'egreso',
      category: 'flete',
      amount: freightPaid,
      method: paymentMethod,
      description: `Flete compra ${doc.label}`,
      referenceType: 'compra_flete',
      referenceId: purchaseId,
      userId: user.id
    });
  }
  if (unloadingPaid > 0) {
    cashMovement({
      date: paymentDate,
      type: 'egreso',
      category: 'descargue',
      amount: unloadingPaid,
      method: paymentMethod,
      description: `Descargue compra ${doc.label}`,
      referenceType: 'compra_descargue',
      referenceId: purchaseId,
      userId: user.id
    });
  }

  if (landedCost > 0) {
    db.prepare(`
      INSERT INTO inventory_movements
        (product_id, movement_date, type, reference_type, reference_id, quantity, unit_cost, note, created_by, created_at)
      VALUES (?, ?, 'compra', 'compra', ?, ?, ?, ?, ?, ?)
    `).run(
      product.id,
      arrivalDate,
      purchaseId,
      roundStock(quantity),
      round2(landedCost / quantity),
      `Compra ${doc.label} · ${supplier.name}`,
      user.id,
      nowIso()
    );
    recalcProduct(product.id);
  }

  logActivity(user, 'crear', 'compra', purchaseId, `${doc.label} · ${product.name} · $${landedCost}`);
  return getPurchaseById(purchaseId);
}

export function createPurchase(input, user) {
  return tx(() => insertPurchase(input, user));
}

function removePurchaseDependencies(purchase) {
  const payables = db.prepare('SELECT id FROM accounts_payable WHERE purchase_id = ?').all(purchase.id);
  const payableIds = payables.map((p) => p.id);
  const payments = payableIds.length
    ? db.prepare(`SELECT * FROM payable_payments WHERE payable_id IN (${payableIds.map(() => '?').join(',')})`).all(...payableIds)
    : [];
  deleteCashMovements(payments.map((p) => p.cash_movement_id).filter(Boolean));
  if (payableIds.length) {
    const placeholders = payableIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM payable_payments WHERE payable_id IN (${placeholders})`).run(...payableIds);
    db.prepare(`DELETE FROM accounts_payable WHERE id IN (${placeholders})`).run(...payableIds);
  }
  const cashRows = db.prepare(`
    SELECT id FROM cash_movements
    WHERE reference_type IN (${CASH_REFERENCES_TO_PURCHASE.map(() => '?').join(',')}) AND reference_id = ?
  `).all(...CASH_REFERENCES_TO_PURCHASE, purchase.id);
  deleteCashMovements(cashRows.map((row) => row.id));
  db.prepare('DELETE FROM inventory_movements WHERE reference_type = ? AND reference_id = ?')
    .run('compra', purchase.id);
}

export function updatePurchase(id, input, user) {
  return tx(() => {
    const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(id);
    if (!purchase) fail('La compra no existe.', 404);
    removePurchaseDependencies(purchase);
    db.prepare('DELETE FROM purchases WHERE id = ?').run(id);
    const stock = recalcProduct(purchase.product_id);
    if (stock && stock.stock < -0.0001) {
      fail('No se puede editar la compra: el producto ya fue vendido y el inventario quedaría negativo.', 409);
    }
    const payload = { ...input, doc_number: clean(input.doc_number) || purchase.doc_number };
    const created = insertPurchase(payload, user);
    logActivity(user, 'editar', 'compra', created.id, `${created.doc_number} · reemplaza compra #${id}`);
    return created;
  });
}

export function deletePurchase(id, user) {
  return tx(() => {
    const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(id);
    if (!purchase) fail('La compra no existe.', 404);
    removePurchaseDependencies(purchase);
    db.prepare('DELETE FROM purchases WHERE id = ?').run(id);
    const stock = recalcProduct(purchase.product_id);
    if (stock && stock.stock < -0.0001) {
      fail('No se puede eliminar la compra: el inventario quedaría negativo por ventas posteriores.', 409);
    }
    logActivity(user, 'eliminar', 'compra', id, purchase.doc_number);
    return { ok: true };
  });
}

export function getPurchaseById(id) {
  const row = db.prepare(`
    SELECT p.*, s.name AS supplier_name, s.nit AS supplier_nit, s.phone AS supplier_phone,
      pr.code AS product_code, pr.name AS product_name, pr.unit AS product_unit,
      u.full_name AS created_by_name,
      COALESCE((SELECT SUM(amount) FROM accounts_payable WHERE purchase_id = p.id), 0) AS credit_total,
      COALESCE((SELECT SUM(paid) FROM accounts_payable WHERE purchase_id = p.id), 0) AS credit_paid
    FROM purchases p
    JOIN suppliers s ON s.id = p.supplier_id
    JOIN products pr ON pr.id = p.product_id
    LEFT JOIN users u ON u.id = p.created_by
    WHERE p.id = ?
  `).get(id);
  if (!row) return null;
  const paid = money(row.total_paid_at_creation + row.credit_paid);
  const balance = money(row.total_cost - paid);
  const today = todayBogota();
  let status = 'Pagada';
  if (balance > 0.5) {
    status = row.credit_due_date && row.credit_due_date < today ? 'Vencida' : 'Crédito';
  }
  return {
    ...row,
    paid_total: paid,
    balance,
    status,
    payment_condition: row.purchase_type
  };
}

function resolveCourierOrNew(input) {
  const courier = resolveCourier(input);
  return courier;
}

function insertSale(input, user) {
  const config = getConfig();
  const deliveryDate = ensureDate(input.delivery_date, 'La fecha de entrega');
  const quantity = Number(input.quantity);
  const unitPrice = money(input.unit_price);
  if (!Number.isFinite(quantity) || quantity <= 0) fail('La cantidad vendida debe ser mayor que cero.');
  if (!Number.isFinite(unitPrice) || unitPrice < 0) fail('El precio unitario no puede ser negativo.');
  const condition = input.payment_condition === 'credito' ? 'credito' : 'contado';
  const method = input.payment_method === 'bancos' ? 'bancos' : 'efectivo';
  const paymentDate = input.money_entry_date
    ? ensureDate(input.money_entry_date, 'La fecha de entrada del dinero')
    : deliveryDate;
  let dueDate = null;
  if (condition === 'credito') {
    dueDate = ensureDate(input.due_date, 'La fecha de vencimiento');
    if (diffDays(deliveryDate, dueDate) < 0) fail('La fecha de vencimiento no puede ser anterior a la entrega.');
  }

  const customer = resolveCustomer(input);
  const courier = resolveCourierOrNew(input);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(input.product_id);
  if (!product) fail('El producto seleccionado no existe.');
  if (Number(product.stock) + 0.0001 < quantity) {
    fail(`Inventario insuficiente de ${product.name}. Disponible: ${product.stock} ${product.unit}.`);
  }
  const loadingValue = Math.max(0, money(input.loading_value));
  const loadingType = input.loading_type === 'credito' ? 'credito' : 'contado';
  const loadingProvider = clean(input.loading_provider)
    || courier?.name
    || (loadingValue > 0 ? 'Proveedor de cargue' : '');
  const subtotal = money(quantity * unitPrice);
  const total = money(subtotal + loadingValue);
  const costOfGoods = money(quantity * Number(product.avg_cost || 0));
  const gmfRate = Math.max(0, Number(config.fiscal.gmfRate) || 0);
  const fourPerMille = condition === 'contado' && method === 'bancos' ? money(total * gmfRate) : 0;
  const doc = nextDocument('sale', input.invoice_number);
  if (doc.auto === false) {
    const duplicate = db.prepare('SELECT id FROM sales WHERE invoice_number = ? COLLATE NOCASE').get(doc.label);
    if (duplicate) fail('Ya existe una venta con ese número de factura.', 409);
  }

  let info;
  try {
    info = db.prepare(`
      INSERT INTO sales (
        invoice_number, delivery_date, customer_id, payment_condition, due_date,
        money_entry_date, payment_method, four_per_mille, courier_id, loading_value,
        loading_type, loading_provider, product_id, quantity, unit_price, subtotal, total,
        cost_of_goods, loading_cost, paid_amount, status, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      doc.label,
      deliveryDate,
      customer.id,
      condition,
      dueDate,
      condition === 'contado' ? paymentDate : null,
      method,
      fourPerMille,
      courier?.id ?? null,
      loadingValue,
      loadingType,
      loadingProvider,
      product.id,
      roundStock(quantity),
      unitPrice,
      subtotal,
      total,
      costOfGoods,
      loadingValue,
      condition === 'contado' ? total : 0,
      condition === 'contado' ? 'pagada' : 'pendiente',
      clean(input.notes),
      user.id,
      nowIso()
    );
  } catch (error) {
    translateConstraint(error, 'Ya existe una venta con ese número de factura.');
  }
  const saleId = Number(info.lastInsertRowid);
  if (doc.auto) consumeSequence('sale', doc.label);

  if (condition === 'credito') {
    db.prepare(`
      INSERT INTO accounts_receivable (sale_id, customer_id, amount, paid, due_date, created_at)
      VALUES (?, ?, ?, 0, ?, ?)
    `).run(saleId, customer.id, total, dueDate, nowIso());
  } else {
    cashMovement({
      date: paymentDate,
      type: 'ingreso',
      category: 'ventas',
      amount: total,
      method,
      description: `Venta ${doc.label} · ${customer.name}`,
      referenceType: 'venta',
      referenceId: saleId,
      userId: user.id
    });
    if (fourPerMille > 0) {
      cashMovement({
        date: paymentDate,
        type: 'egreso',
        category: 'gmf',
        amount: fourPerMille,
        method,
        description: `4x1000 venta ${doc.label}`,
        referenceType: 'venta_gmf',
        referenceId: saleId,
        userId: user.id
      });
    }
  }

  if (loadingValue > 0) {
    if (loadingType === 'credito') {
      const loadingDueDate = input.loading_due_date && isValidDate(input.loading_due_date)
        ? input.loading_due_date
        : (dueDate || addDays(deliveryDate, 30));
      db.prepare(`
        INSERT INTO accounts_payable
          (purchase_id, sale_id, supplier_id, provider_name, concept, description, amount, paid, due_date, created_at)
        VALUES (NULL, ?, NULL, ?, 'cargue', ?, ?, 0, ?, ?)
      `).run(
        saleId,
        loadingProvider,
        `Cargue factura ${doc.label}`,
        loadingValue,
        loadingDueDate,
        nowIso()
      );
    } else {
      cashMovement({
        date: deliveryDate,
        type: 'egreso',
        category: 'cargue',
        amount: loadingValue,
        method,
        description: `Cargue factura ${doc.label}`,
        referenceType: 'venta_cargue',
        referenceId: saleId,
        userId: user.id
      });
    }
  }

  db.prepare(`
    INSERT INTO inventory_movements
      (product_id, movement_date, type, reference_type, reference_id, quantity, unit_cost, note, created_by, created_at)
    VALUES (?, ?, 'venta', 'venta', ?, ?, ?, ?, ?, ?)
  `).run(
    product.id,
    deliveryDate,
    saleId,
    -roundStock(quantity),
    money(product.avg_cost),
    `Factura ${doc.label} · ${customer.name}`,
    user.id,
    nowIso()
  );
  recalcProduct(product.id);
  logActivity(user, 'crear', 'venta', saleId, `${doc.label} · ${customer.name} · $${total}`);
  return getSaleById(saleId);
}

export function createSale(input, user) {
  return tx(() => insertSale(input, user));
}

function removeSaleDependencies(sale) {
  const receivable = db.prepare('SELECT * FROM accounts_receivable WHERE sale_id = ?').get(sale.id);
  if (receivable && Number(receivable.paid) > 0.5) {
    fail('La venta tiene abonos de cartera registrados. No se puede editar ni eliminar para conservar el historial de cobros.', 409);
  }
  const payables = db.prepare('SELECT * FROM accounts_payable WHERE sale_id = ?').all(sale.id);
  if (payables.some((p) => Number(p.paid) > 0.5)) {
    fail('La venta tiene pagos de cargue registrados. No se puede editar ni eliminar para conservar el historial de pagos.', 409);
  }
  if (receivable) {
    const payments = db.prepare('SELECT * FROM receivable_payments WHERE receivable_id = ?').all(receivable.id);
    deleteCashMovements(payments.map((p) => p.cash_movement_id).filter(Boolean));
    db.prepare('DELETE FROM receivable_payments WHERE receivable_id = ?').run(receivable.id);
    db.prepare('DELETE FROM accounts_receivable WHERE id = ?').run(receivable.id);
  }
  const payableIds = payables.map((p) => p.id);
  if (payableIds.length) {
    const placeholders = payableIds.map(() => '?').join(',');
    const payments = db.prepare(`SELECT * FROM payable_payments WHERE payable_id IN (${placeholders})`).all(...payableIds);
    deleteCashMovements(payments.map((p) => p.cash_movement_id).filter(Boolean));
    db.prepare(`DELETE FROM payable_payments WHERE payable_id IN (${placeholders})`).run(...payableIds);
    db.prepare(`DELETE FROM accounts_payable WHERE id IN (${placeholders})`).run(...payableIds);
  }
  const cashRows = db.prepare(`
    SELECT id FROM cash_movements
    WHERE reference_type IN (${CASH_REFERENCES_TO_SALE.map(() => '?').join(',')}) AND reference_id = ?
  `).all(...CASH_REFERENCES_TO_SALE, sale.id);
  deleteCashMovements(cashRows.map((row) => row.id));
  db.prepare('DELETE FROM inventory_movements WHERE reference_type = ? AND reference_id = ?')
    .run('venta', sale.id);
}

export function updateSale(id, input, user) {
  return tx(() => {
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
    if (!sale) fail('La venta no existe.', 404);
    removeSaleDependencies(sale);
    db.prepare('DELETE FROM sales WHERE id = ?').run(id);
    recalcProduct(sale.product_id);
    const payload = { ...input, invoice_number: clean(input.invoice_number) || sale.invoice_number };
    const created = insertSale(payload, user);
    logActivity(user, 'editar', 'venta', created.id, `${created.invoice_number} · reemplaza venta #${id}`);
    return created;
  });
}

export function deleteSale(id, user) {
  return tx(() => {
    const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(id);
    if (!sale) fail('La venta no existe.', 404);
    removeSaleDependencies(sale);
    db.prepare('DELETE FROM sales WHERE id = ?').run(id);
    recalcProduct(sale.product_id);
    logActivity(user, 'eliminar', 'venta', id, sale.invoice_number);
    return { ok: true };
  });
}

export function getSaleById(id, includePayments = false) {
  const row = db.prepare(`
    SELECT s.*, c.name AS customer_name, c.nit AS customer_nit, c.phone AS customer_phone,
      c.address AS customer_address, p.code AS product_code, p.name AS product_name,
      p.unit AS product_unit, p.avg_cost AS product_avg_cost, co.name AS courier_name,
      u.full_name AS created_by_name,
      ar.id AS receivable_id, ar.paid AS receivable_paid, ar.amount AS receivable_amount
    FROM sales s
    JOIN customers c ON c.id = s.customer_id
    JOIN products p ON p.id = s.product_id
    LEFT JOIN couriers co ON co.id = s.courier_id
    LEFT JOIN accounts_receivable ar ON ar.sale_id = s.id
    LEFT JOIN users u ON u.id = s.created_by
    WHERE s.id = ?
  `).get(id);
  if (!row) return null;
  const today = todayBogota();
  const balance = row.payment_condition === 'credito'
    ? money(row.receivable_amount - row.receivable_paid)
    : 0;
  let status = 'Pagada';
  if (balance > 0.5) {
    if (row.due_date && row.due_date < today) status = 'Vencida';
    else if (row.due_date && diffDays(today, row.due_date) <= 7) status = 'Por vencer';
    else status = 'Pendiente';
  }
  const payments = includePayments && row.receivable_id
    ? db.prepare('SELECT * FROM receivable_payments WHERE receivable_id = ? ORDER BY payment_date, id').all(row.receivable_id)
    : [];
  return {
    ...row,
    balance,
    status,
    receivable_status: status,
    payments
  };
}

export function registerReceivablePayment(receivableId, input, user) {
  return tx(() => {
    const config = getConfig();
    const receivable = db.prepare(`
      SELECT ar.*, s.invoice_number, s.customer_id, s.paid_amount, c.name AS customer_name
      FROM accounts_receivable ar
      JOIN sales s ON s.id = ar.sale_id
      JOIN customers c ON c.id = ar.customer_id
      WHERE ar.id = ?
    `).get(receivableId);
    if (!receivable) fail('La cuenta por cobrar no existe.', 404);
    const outstanding = money(receivable.amount - receivable.paid);
    if (outstanding <= 0.5) fail('Esta factura ya está pagada en su totalidad.', 409);
    const amount = money(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) fail('El valor del abono debe ser mayor que cero.');
    if (amount > outstanding + 0.5) fail(`El abono supera el saldo pendiente (${outstanding}).`);
    const method = input.method === 'bancos' ? 'bancos' : 'efectivo';
    const paymentDate = ensureDate(input.payment_date || todayBogota(), 'La fecha del abono');
    if (paymentDate > todayBogota()) fail('La fecha del abono no puede ser futura.');
    const fee = method === 'bancos' ? money(amount * (Number(config.fiscal.gmfRate) || 0)) : 0;
    const info = db.prepare(`
      INSERT INTO receivable_payments
        (receivable_id, amount, payment_date, method, fee, notes, cash_movement_id, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).run(receivableId, amount, paymentDate, method, fee, clean(input.notes), user.id, nowIso());
    const paymentId = Number(info.lastInsertRowid);
    const cashId = cashMovement({
      date: paymentDate,
      type: 'ingreso',
      category: 'cobros',
      amount,
      method,
      description: `Abono factura ${receivable.invoice_number} · ${receivable.customer_name}`,
      referenceType: 'cobro_cxc',
      referenceId: paymentId,
      userId: user.id
    });
    if (fee > 0) {
      cashMovement({
        date: paymentDate,
        type: 'egreso',
        category: 'gmf',
        amount: fee,
        method,
        description: `4x1000 abono factura ${receivable.invoice_number}`,
        referenceType: 'cobro_cxc_gmf',
        referenceId: paymentId,
        userId: user.id
      });
    }
    db.prepare('UPDATE receivable_payments SET cash_movement_id = ? WHERE id = ?').run(cashId, paymentId);
    const newPaid = money(receivable.paid + amount);
    db.prepare('UPDATE accounts_receivable SET paid = ? WHERE id = ?').run(newPaid, receivableId);
    const newStatus = newPaid >= receivable.amount - 0.5 ? 'pagada' : 'pendiente';
    db.prepare('UPDATE sales SET paid_amount = ?, status = ? WHERE id = ?')
      .run(newPaid, newStatus, receivable.sale_id);
    logActivity(user, 'abono', 'cxc', receivableId, `Factura ${receivable.invoice_number} · $${amount}`);
    return {
      id: paymentId,
      amount,
      fee,
      newPaid,
      outstanding: money(receivable.amount - newPaid)
    };
  });
}

export function registerPayablePayment(payableId, input, user) {  return tx(() => {
    const payable = db.prepare(`
      SELECT ap.*, p.doc_number, s.invoice_number
      FROM accounts_payable ap
      LEFT JOIN purchases p ON p.id = ap.purchase_id
      LEFT JOIN sales s ON s.id = ap.sale_id
      WHERE ap.id = ?
    `).get(payableId);
    if (!payable) fail('La cuenta por pagar no existe.', 404);
    const outstanding = money(payable.amount - payable.paid);
    if (outstanding <= 0.5) fail('Esta obligación ya está pagada en su totalidad.', 409);
    const amount = money(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) fail('El valor del pago debe ser mayor que cero.');
    if (amount > outstanding + 0.5) fail(`El pago supera el saldo pendiente (${outstanding}).`);
    const method = input.method === 'bancos' ? 'bancos' : 'efectivo';
    const paymentDate = ensureDate(input.payment_date || todayBogota(), 'La fecha del pago');
    if (paymentDate > todayBogota()) fail('La fecha del pago no puede ser futura.');
    const info = db.prepare(`
      INSERT INTO payable_payments
        (payable_id, amount, payment_date, method, notes, cash_movement_id, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
    `).run(payableId, amount, paymentDate, method, clean(input.notes), user.id, nowIso());
    const paymentId = Number(info.lastInsertRowid);
    const categoryByConcept = {
      producto: 'compras',
      flete: 'flete',
      descargue: 'descargue',
      cargue: 'cargue',
      servicio: 'servicios'
    };
    const cashId = cashMovement({
      date: paymentDate,
      type: 'egreso',
      category: categoryByConcept[payable.concept] || 'compras',
      amount,
      method,
      description: `Pago ${payable.concept} · ${payable.provider_name}${payable.doc_number ? ` · ${payable.doc_number}` : payable.invoice_number ? ` · ${payable.invoice_number}` : ''}`,
      referenceType: 'pago_cxp',
      referenceId: paymentId,
      userId: user.id
    });
    db.prepare('UPDATE payable_payments SET cash_movement_id = ? WHERE id = ?').run(cashId, paymentId);
    const newPaid = money(payable.paid + amount);
    db.prepare('UPDATE accounts_payable SET paid = ? WHERE id = ?').run(newPaid, payableId);
    logActivity(user, 'pago', 'cxp', payableId, `${payable.provider_name} · $${amount}`);
    return {
      id: paymentId,
      amount,
      newPaid,
      outstanding: money(payable.amount - newPaid)
    };
  });
}

function removePaymentCashMovements(referenceTypes, paymentId) {
  if (!referenceTypes.length) return;
  const placeholders = referenceTypes.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT id FROM cash_movements WHERE reference_type IN (${placeholders}) AND reference_id = ?
  `).all(...referenceTypes, paymentId);
  deleteCashMovements(rows.map((row) => row.id));
}

function recalcReceivable(receivableId, saleId) {
  const paid = money(db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM receivable_payments WHERE receivable_id = ?
  `).get(receivableId).total);
  const receivable = db.prepare('SELECT amount FROM accounts_receivable WHERE id = ?').get(receivableId);
  db.prepare('UPDATE accounts_receivable SET paid = ? WHERE id = ?').run(paid, receivableId);
  db.prepare('UPDATE sales SET paid_amount = ?, status = ? WHERE id = ?')
    .run(paid, paid >= receivable.amount - 0.5 ? 'pagada' : 'pendiente', saleId);
  return paid;
}

function recalcPayable(payableId) {
  const paid = money(db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM payable_payments WHERE payable_id = ?
  `).get(payableId).total);
  db.prepare('UPDATE accounts_payable SET paid = ? WHERE id = ?').run(paid, payableId);
  return paid;
}

export function updateReceivablePayment(receivableId, paymentId, input, user) {
  return tx(() => {
    const config = getConfig();
    const payment = db.prepare(`
      SELECT * FROM receivable_payments WHERE id = ? AND receivable_id = ?
    `).get(paymentId, receivableId);
    if (!payment) fail('El abono no existe.', 404);
    const receivable = db.prepare(`
      SELECT ar.*, s.invoice_number, s.id AS sale_id, c.name AS customer_name
      FROM accounts_receivable ar
      JOIN sales s ON s.id = ar.sale_id
      JOIN customers c ON c.id = ar.customer_id
      WHERE ar.id = ?
    `).get(receivableId);
    if (!receivable) fail('La cuenta por cobrar no existe.', 404);
    const amount = money(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) fail('El valor del abono debe ser mayor que cero.');
    const maxAmount = money(receivable.amount - (receivable.paid - payment.amount));
    if (amount > maxAmount + 0.5) {
      fail(`El abono supera el saldo permitido (${maxAmount}).`);
    }
    const method = input.method === 'bancos' ? 'bancos' : 'efectivo';
    const paymentDate = ensureDate(input.payment_date || payment.payment_date, 'La fecha del abono');
    if (paymentDate > todayBogota()) fail('La fecha del abono no puede ser futura.');
    const fee = method === 'bancos' ? money(amount * (Number(config.fiscal.gmfRate) || 0)) : 0;
    removePaymentCashMovements(['cobro_cxc', 'cobro_cxc_gmf'], paymentId);
    const cashId = cashMovement({
      date: paymentDate,
      type: 'ingreso',
      category: 'cobros',
      amount,
      method,
      description: `Abono factura ${receivable.invoice_number} · ${receivable.customer_name}`,
      referenceType: 'cobro_cxc',
      referenceId: paymentId,
      userId: user.id
    });
    if (fee > 0) {
      cashMovement({
        date: paymentDate,
        type: 'egreso',
        category: 'gmf',
        amount: fee,
        method,
        description: `4x1000 abono factura ${receivable.invoice_number}`,
        referenceType: 'cobro_cxc_gmf',
        referenceId: paymentId,
        userId: user.id
      });
    }
    db.prepare(`
      UPDATE receivable_payments
      SET amount = ?, payment_date = ?, method = ?, fee = ?, notes = ?, cash_movement_id = ?
      WHERE id = ?
    `).run(amount, paymentDate, method, fee, clean(input.notes), cashId, paymentId);
    const newPaid = recalcReceivable(receivableId, receivable.sale_id);
    logActivity(user, 'editar', 'cxc_abono', paymentId, `Factura ${receivable.invoice_number} · $${amount}`);
    return { id: paymentId, amount, fee, newPaid, outstanding: money(receivable.amount - newPaid) };
  });
}

export function deleteReceivablePayment(receivableId, paymentId, user) {
  return tx(() => {
    const payment = db.prepare(`
      SELECT * FROM receivable_payments WHERE id = ? AND receivable_id = ?
    `).get(paymentId, receivableId);
    if (!payment) fail('El abono no existe.', 404);
    const receivable = db.prepare(`
      SELECT ar.*, s.invoice_number, s.id AS sale_id
      FROM accounts_receivable ar JOIN sales s ON s.id = ar.sale_id
      WHERE ar.id = ?
    `).get(receivableId);
    if (!receivable) fail('La cuenta por cobrar no existe.', 404);
    removePaymentCashMovements(['cobro_cxc', 'cobro_cxc_gmf'], paymentId);
    db.prepare('DELETE FROM receivable_payments WHERE id = ?').run(paymentId);
    const newPaid = recalcReceivable(receivableId, receivable.sale_id);
    logActivity(user, 'eliminar', 'cxc_abono', paymentId, `Factura ${receivable.invoice_number} · $${payment.amount}`);
    return { ok: true, newPaid, outstanding: money(receivable.amount - newPaid) };
  });
}

export function updatePayablePayment(payableId, paymentId, input, user) {
  return tx(() => {
    const payment = db.prepare(`
      SELECT * FROM payable_payments WHERE id = ? AND payable_id = ?
    `).get(paymentId, payableId);
    if (!payment) fail('El pago no existe.', 404);
    const payable = db.prepare(`
      SELECT ap.*, p.doc_number, s.invoice_number
      FROM accounts_payable ap
      LEFT JOIN purchases p ON p.id = ap.purchase_id
      LEFT JOIN sales s ON s.id = ap.sale_id
      WHERE ap.id = ?
    `).get(payableId);
    if (!payable) fail('La cuenta por pagar no existe.', 404);
    const amount = money(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) fail('El valor del pago debe ser mayor que cero.');
    const maxAmount = money(payable.amount - (payable.paid - payment.amount));
    if (amount > maxAmount + 0.5) fail(`El pago supera el saldo permitido (${maxAmount}).`);
    const method = input.method === 'bancos' ? 'bancos' : 'efectivo';
    const paymentDate = ensureDate(input.payment_date || payment.payment_date, 'La fecha del pago');
    if (paymentDate > todayBogota()) fail('La fecha del pago no puede ser futura.');
    const categoryByConcept = {
      producto: 'compras',
      flete: 'flete',
      descargue: 'descargue',
      cargue: 'cargue',
      servicio: 'servicios'
    };
    removePaymentCashMovements(['pago_cxp'], paymentId);
    const cashId = cashMovement({
      date: paymentDate,
      type: 'egreso',
      category: categoryByConcept[payable.concept] || 'compras',
      amount,
      method,
      description: `Pago ${payable.concept} · ${payable.provider_name}${payable.doc_number ? ` · ${payable.doc_number}` : payable.invoice_number ? ` · ${payable.invoice_number}` : ''}`,
      referenceType: 'pago_cxp',
      referenceId: paymentId,
      userId: user.id
    });
    db.prepare(`
      UPDATE payable_payments
      SET amount = ?, payment_date = ?, method = ?, notes = ?, cash_movement_id = ?
      WHERE id = ?
    `).run(amount, paymentDate, method, clean(input.notes), cashId, paymentId);
    const newPaid = recalcPayable(payableId);
    logActivity(user, 'editar', 'cxp_pago', paymentId, `${payable.provider_name} · $${amount}`);
    return { id: paymentId, amount, newPaid, outstanding: money(payable.amount - newPaid) };
  });
}

export function deletePayablePayment(payableId, paymentId, user) {
  return tx(() => {
    const payment = db.prepare(`
      SELECT * FROM payable_payments WHERE id = ? AND payable_id = ?
    `).get(paymentId, payableId);
    if (!payment) fail('El pago no existe.', 404);
    const payable = db.prepare('SELECT * FROM accounts_payable WHERE id = ?').get(payableId);
    if (!payable) fail('La cuenta por pagar no existe.', 404);
    removePaymentCashMovements(['pago_cxp'], paymentId);
    db.prepare('DELETE FROM payable_payments WHERE id = ?').run(paymentId);
    const newPaid = recalcPayable(payableId);
    logActivity(user, 'eliminar', 'cxp_pago', paymentId, `${payable.provider_name} · $${payment.amount}`);
    return { ok: true, newPaid, outstanding: money(payable.amount - newPaid) };
  });
}

export function updateReceivableDueDate(receivableId, dueDate, user) {
  return tx(() => {
    const receivable = db.prepare(`
      SELECT ar.*, s.id AS sale_id, s.delivery_date, s.invoice_number
      FROM accounts_receivable ar JOIN sales s ON s.id = ar.sale_id
      WHERE ar.id = ?
    `).get(receivableId);
    if (!receivable) fail('La cuenta por cobrar no existe.', 404);
    const date = ensureDate(dueDate, 'La fecha de vencimiento');
    if (date < receivable.delivery_date) fail('El vencimiento no puede ser anterior a la entrega.');
    db.prepare('UPDATE accounts_receivable SET due_date = ? WHERE id = ?').run(date, receivableId);
    db.prepare('UPDATE sales SET due_date = ? WHERE id = ?').run(date, receivable.sale_id);
    logActivity(user, 'editar', 'cxc', receivableId, `Nuevo vencimiento ${date}`);
    return { due_date: date };
  });
}

export function updatePayableDueDate(payableId, dueDate, user) {
  return tx(() => {
    const payable = db.prepare('SELECT * FROM accounts_payable WHERE id = ?').get(payableId);
    if (!payable) fail('La cuenta por pagar no existe.', 404);
    const date = ensureDate(dueDate, 'La fecha de vencimiento');
    db.prepare('UPDATE accounts_payable SET due_date = ? WHERE id = ?').run(date, payableId);
    logActivity(user, 'editar', 'cxp', payableId, `Nuevo vencimiento ${date}`);
    return { due_date: date };
  });
}

export function createInventoryAdjustment(input, user) {
  return tx(() => {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(input.product_id);
    if (!product) fail('El producto no existe.');
    const type = input.type === 'salida' ? 'salida' : 'entrada';
    const quantity = Number(input.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      fail('La cantidad del ajuste debe ser un número entero mayor que cero.');
    }
    const reason = clean(input.reason);
    if (!reason) fail('El motivo del ajuste es obligatorio.');
    const adjustmentDate = ensureDate(input.adjustment_date || todayBogota(), 'La fecha del ajuste');
    if (type === 'salida' && quantity > Number(product.stock) + 0.0001) {
      fail(`No puedes retirar ${quantity} ${product.unit}: el stock actual es ${product.stock}.`);
    }
    const unitCost = type === 'entrada'
      ? (Number(input.unit_cost) > 0 ? money(input.unit_cost) : money(product.avg_cost))
      : money(product.avg_cost);
    const info = db.prepare(`
      INSERT INTO inventory_adjustments
        (product_id, adjustment_date, type, quantity, unit_cost, reason, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(product.id, adjustmentDate, type, roundStock(quantity), unitCost, reason, user.id, nowIso());
    const adjustmentId = Number(info.lastInsertRowid);
    db.prepare(`
      INSERT INTO inventory_movements
        (product_id, movement_date, type, reference_type, reference_id, quantity, unit_cost, note, created_by, created_at)
      VALUES (?, ?, ?, 'ajuste', ?, ?, ?, ?, ?, ?)
    `).run(
      product.id,
      adjustmentDate,
      `ajuste_${type}`,
      adjustmentId,
      type === 'entrada' ? roundStock(quantity) : -roundStock(quantity),
      unitCost,
      reason,
      user.id,
      nowIso()
    );
    recalcProduct(product.id);
    logActivity(user, 'ajuste', 'inventario', product.id, `${type} ${quantity} ${product.unit} · ${reason}`);
    return db.prepare(`
      SELECT a.*, p.name AS product_name, p.code AS product_code, u.full_name AS created_by_name
      FROM inventory_adjustments a
      JOIN products p ON p.id = a.product_id
      LEFT JOIN users u ON u.id = a.created_by
      WHERE a.id = ?
    `).get(adjustmentId);
  });
}

export function deleteInventoryAdjustment(adjustmentId, user) {
  return tx(() => {
    const adj = db.prepare('SELECT * FROM inventory_adjustments WHERE id = ?').get(adjustmentId);
    if (!adj) fail('El ajuste no existe.', 404);
    db.prepare("DELETE FROM inventory_movements WHERE reference_type = 'ajuste' AND reference_id = ?").run(adjustmentId);
    db.prepare('DELETE FROM inventory_adjustments WHERE id = ?').run(adjustmentId);
    recalcProduct(adj.product_id);
    logActivity(user, 'eliminar', 'ajuste_inventario', adj.id, `Ajuste ${adj.type} de ${adj.quantity} revertido`);
    return { ok: true };
  });
}

export function createManualCashMovement(input, user) {
  return tx(() => {
    const date = ensureDate(input.movement_date || todayBogota(), 'La fecha del movimiento');
    if (date > todayBogota()) fail('La fecha del movimiento no puede ser futura.');
    const type = input.type === 'ingreso' ? 'ingreso' : 'egreso';
    const method = input.method === 'bancos' ? 'bancos' : 'efectivo';
    const amount = money(input.amount);
    if (amount <= 0) fail('El valor del movimiento debe ser mayor que cero.');
    const category = clean(input.category) || 'otros';
    const description = clean(input.description) || (type === 'ingreso' ? 'Ingreso manual' : 'Egreso manual');
    const id = cashMovement({
      date,
      type,
      category,
      amount,
      method,
      description,
      referenceType: 'manual',
      referenceId: null,
      userId: user.id,
      auto: 0
    });
    logActivity(user, 'crear', 'caja', id, `${type} $${amount} · ${description}`);
    return db.prepare('SELECT * FROM cash_movements WHERE id = ?').get(id);
  });
}

export function deleteManualCashMovement(id, user) {
  return tx(() => {
    const row = db.prepare('SELECT * FROM cash_movements WHERE id = ?').get(id);
    if (!row) fail('El movimiento no existe.', 404);
    if (row.auto === 1) fail('Los movimientos automáticos se gestionan desde su compra, venta o abono.', 409);
    db.prepare('DELETE FROM cash_movements WHERE id = ?').run(id);
    logActivity(user, 'eliminar', 'caja', id, row.description);
    return { ok: true };
  });
}

export function updateManualCashMovement(id, input, user) {
  return tx(() => {
    const row = db.prepare('SELECT * FROM cash_movements WHERE id = ?').get(id);
    if (!row) fail('El movimiento no existe.', 404);
    if (row.auto === 1) {
      fail('Este movimiento se generó automáticamente por una venta, compra, cobro o pago. Edítalo desde su operación de origen para mantener la contabilidad conciliada.', 409);
    }
    const date = ensureDate(input.movement_date || row.movement_date, 'La fecha del movimiento');
    if (date > todayBogota()) fail('La fecha del movimiento no puede ser futura.');
    const type = input.type === 'ingreso' ? 'ingreso' : 'egreso';
    const method = input.method === 'bancos' ? 'bancos' : 'efectivo';
    const amount = money(input.amount);
    if (amount <= 0) fail('El valor del movimiento debe ser mayor que cero.');
    const category = clean(input.category) || row.category;
    const description = clean(input.description) || row.description;
    db.prepare(`
      UPDATE cash_movements
      SET movement_date = ?, type = ?, category = ?, amount = ?, method = ?, description = ?
      WHERE id = ?
    `).run(date, type, category, amount, method, description, id);
    logActivity(user, 'editar', 'caja', id, `${type} $${amount} · ${description}`);
    return db.prepare('SELECT * FROM cash_movements WHERE id = ?').get(id);
  });
}

export function nextDocumentPreview(kind) {
  return getNextSequence(kind).label;
}

export function recalculateAllProducts() {
  const products = db.prepare('SELECT id FROM products').all();
  for (const product of products) recalcProduct(product.id);
}

export function currentSequenceSetting() {
  return {
    sale: getSetting('seq_sale_next', getConfig().sequences.saleNext),
    purchase: getSetting('seq_purchase_next', getConfig().sequences.purchaseNext)
  };
}
