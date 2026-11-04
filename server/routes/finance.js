import { Router } from 'express';
import { db, logActivity, nowIso } from '../db.js';
import { getConfig } from '../config.js';
import { asyncRoute, ApiError, integer, required, text, bool } from '../lib/http.js';
import {
  addDays,
  addMonths,
  isValidDate,
  isValidMonth,
  monthBounds,
  monthLabel,
  monthOf,
  todayBogota
} from '../lib/dates.js';
import { money } from '../lib/money.js';
import { requireAuth, requirePermission } from '../auth.js';
import {
  cashBalances,
  createManualCashMovement,
  deleteManualCashMovement,
  deletePayablePayment,
  deletePurchase,
  deleteReceivablePayment,
  deleteSale,
  registerPayablePayment,
  registerReceivablePayment,
  updateManualCashMovement,
  updatePayableDueDate,
  updatePayablePayment,
  updateReceivableDueDate,
  updateReceivablePayment
} from '../services/operations.js';
import {
  getCosting,
  getDashboard,
  getFinancialStatements,
  getIndirectCosts,
  getPortfolio
} from '../services/analytics.js';

const router = Router();
router.use(requireAuth);

function pageOptions(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(200, Math.max(10, Number(query.limit) || 50));
  return { page, limit, offset: (page - 1) * limit };
}

/* ───────────────────────────── Dashboard ───────────────────────────── */

router.get('/dashboard', requirePermission('dashboard:view'), asyncRoute(async (req, res) => {
  res.json(getDashboard(req.query));
}));

/* ───────────────────────────── Caja ───────────────────────────── */

router.get('/cash', requirePermission('caja:view'), asyncRoute(async (req, res) => {
  const today = todayBogota();
  const from = isValidDate(req.query.from) ? req.query.from : monthBounds(monthOf(today)).start;
  const to = isValidDate(req.query.to) ? req.query.to : today;
  const conditions = ['movement_date BETWEEN ? AND ?'];
  const params = [from, to];
  if (['ingreso', 'egreso'].includes(req.query.type)) {
    conditions.push('type = ?');
    params.push(req.query.type);
  }
  if (['efectivo', 'bancos'].includes(req.query.method)) {
    conditions.push('method = ?');
    params.push(req.query.method);
  }
  if (req.query.category) {
    conditions.push('category = ?');
    params.push(String(req.query.category));
  }
  if (req.query.search) {
    conditions.push('(description LIKE ? OR category LIKE ?)');
    const term = `%${String(req.query.search).trim()}%`;
    params.push(term, term);
  }
  const movements = db.prepare(`
    SELECT c.*, u.full_name AS created_by_name
    FROM cash_movements c LEFT JOIN users u ON u.id = c.created_by
    WHERE ${conditions.join(' AND ')}
    ORDER BY c.movement_date DESC, c.id DESC
  `).all(...params);
  const totalIncome = money(movements.filter((row) => row.type === 'ingreso').reduce((total, row) => total + Number(row.amount), 0));
  const totalExpense = money(movements.filter((row) => row.type === 'egreso').reduce((total, row) => total + Number(row.amount), 0));
  const opening = cashBalances(addDays(from, -1));
  const closing = cashBalances(to);
  const categories = db.prepare('SELECT DISTINCT category FROM cash_movements ORDER BY category').all().map((row) => row.category);
  const { page, limit, offset } = pageOptions(req.query);
  res.json({
    data: movements.slice(offset, offset + limit),
    pagination: {
      page,
      limit,
      total: movements.length,
      pages: Math.max(1, Math.ceil(movements.length / limit))
    },
    filters: { from, to },
    summary: {
      income: totalIncome,
      expense: totalExpense,
      net: money(totalIncome - totalExpense),
      count: movements.length,
      opening: opening.total,
      openingCash: opening.cash,
      openingBank: opening.bank,
      closing: closing.total,
      closingCash: closing.cash,
      closingBank: closing.bank,
      balance: closing.total
    },
    categories
  });
}));

router.post('/cash', requirePermission('caja:write'), asyncRoute(async (req, res) => {
  required(req.body, ['type', 'amount', 'method'], {
    type: 'tipo de movimiento',
    amount: 'valor',
    method: 'medio de pago'
  });
  const movement = createManualCashMovement(req.body, req.user);
  res.status(201).json({ data: movement, message: 'Movimiento de caja registrado correctamente.' });
}));

router.delete('/cash/:id', requirePermission('caja:write'), asyncRoute(async (req, res) => {
  await deleteManualCashMovement(integer(req.params.id, 'movimiento'), req.user);
  res.json({ message: 'Movimiento de caja eliminado.' });
}));

router.put('/cash/:id', requirePermission('caja:write'), asyncRoute(async (req, res) => {
  const movement = updateManualCashMovement(integer(req.params.id, 'movimiento'), req.body, req.user);
  res.json({ data: movement, message: 'Movimiento de caja actualizado.' });
}));

/* ───────────────────────────── CxC ───────────────────────────── */

function receivableState(row, today = todayBogota()) {
  const balance = money(Math.max(0, Number(row.amount) - Number(row.paid)));
  if (balance <= 0.5) return { balance, status: 'Pagada', statusKey: 'pagada', overdueDays: 0 };
  if (row.due_date < today) {
    const overdueDays = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${row.due_date}T12:00:00Z`)) / 86400000);
    return { balance, status: 'Vencida', statusKey: 'vencida', overdueDays };
  }
  if (row.due_date <= addDays(today, 7)) return { balance, status: 'Por vencer', statusKey: 'por_vencer', overdueDays: 0 };
  return { balance, status: 'Pendiente', statusKey: 'pendiente', overdueDays: 0 };
}

router.get('/receivables', requirePermission('cxc:view'), asyncRoute(async (req, res) => {
  const today = todayBogota();
  const conditions = [];
  const params = [];
  if (req.query.customer_id) {
    conditions.push('ar.customer_id = ?');
    params.push(Number(req.query.customer_id));
  }
  const arFrom = req.query.from || req.query.due_from;
  if (isValidDate(arFrom)) {
    conditions.push('ar.due_date >= ?');
    params.push(arFrom);
  }
  const arTo = req.query.to || req.query.due_to;
  if (isValidDate(arTo)) {
    conditions.push('ar.due_date <= ?');
    params.push(arTo);
  }
  if (req.query.search) {
    const term = `%${String(req.query.search).trim()}%`;
    conditions.push('(c.name LIKE ? OR s.invoice_number LIKE ?)');
    params.push(term, term);
  }
  const sortDirection = req.query.sort === 'newest' ? 'DESC' : 'ASC';
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT ar.*, c.name AS customer_name, c.phone AS customer_phone, c.nit AS customer_nit,
      s.invoice_number, s.delivery_date, s.total AS sale_total, s.payment_condition,
      (SELECT MAX(payment_date) FROM receivable_payments rp WHERE rp.receivable_id = ar.id) AS last_payment_date
    FROM accounts_receivable ar
    JOIN customers c ON c.id = ar.customer_id
    JOIN sales s ON s.id = ar.sale_id
    ${where}
    ORDER BY ar.due_date ${sortDirection}, ar.id ${sortDirection}
  `).all(...params).map((row) => {
    const state = receivableState(row, today);
    return {
      ...row,
      amount: money(row.amount),
      paid: money(row.paid),
      balance: state.balance,
      status: state.status,
      status_key: state.statusKey,
      overdue_days: state.overdueDays
    };
  });
  const statusFilter = String(req.query.status || '').toLowerCase();
  const filtered = statusFilter && statusFilter !== 'todas'
    ? rows.filter((row) => row.status_key === statusFilter)
    : rows;
  const todayMonth = monthOf(today);
  const collectedMonth = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM receivable_payments
    WHERE payment_date BETWEEN ? AND ?
  `).get(monthBounds(todayMonth).start, today);
  const summary = {
    pending: money(rows.filter((row) => row.status_key !== 'pagada').reduce((total, row) => total + row.balance, 0)),
    overdue: money(rows.filter((row) => row.status_key === 'vencida').reduce((total, row) => total + row.balance, 0)),
    upcoming: money(rows.filter((row) => row.status_key === 'por_vencer').reduce((total, row) => total + row.balance, 0)),
    overdueCount: rows.filter((row) => row.status_key === 'vencida').length,
    collectedMonth: money(collectedMonth.total)
  };
  const { page, limit, offset } = pageOptions(req.query);
  res.json({
    data: filtered.slice(offset, offset + limit),
    pagination: {
      page,
      limit,
      total: filtered.length,
      pages: Math.max(1, Math.ceil(filtered.length / limit))
    },
    summary
  });
}));

router.get('/receivables/:id/payments', requirePermission('cxc:view'), asyncRoute(async (req, res) => {
  const receivable = db.prepare(`
    SELECT ar.*, c.name AS customer_name, c.nit AS customer_nit, c.phone AS customer_phone,
      c.address AS customer_address, s.invoice_number, s.delivery_date, s.quantity,
      s.unit_price, s.subtotal, s.loading_value, s.total, s.payment_condition, s.notes,
      p.name AS product_name, p.code AS product_code, p.unit AS product_unit
    FROM accounts_receivable ar
    JOIN customers c ON c.id = ar.customer_id
    JOIN sales s ON s.id = ar.sale_id
    JOIN products p ON p.id = s.product_id
    WHERE ar.id = ?
  `).get(integer(req.params.id, 'cuenta por cobrar'));
  if (!receivable) throw new ApiError(404, 'La cuenta por cobrar no existe.');
  const payments = db.prepare(`
    SELECT rp.*, u.full_name AS created_by_name FROM receivable_payments rp
    LEFT JOIN users u ON u.id = rp.created_by
    WHERE rp.receivable_id = ? ORDER BY rp.payment_date DESC, rp.id DESC
  `).all(receivable.id);
  res.json({
    data: {
      ...receivable,
      amount: money(receivable.amount),
      paid: money(receivable.paid),
      balance: money(receivable.amount - receivable.paid),
      payments
    }
  });
}));

router.put('/receivables/:id', requirePermission('cxc:pay'), asyncRoute(async (req, res) => {
  required(req.body, ['due_date'], { due_date: 'fecha de vencimiento' });
  const result = updateReceivableDueDate(integer(req.params.id, 'cuenta por cobrar'), req.body.due_date, req.user);
  res.json({ data: result, message: 'Vencimiento de la cuenta actualizado.' });
}));

router.post('/receivables/:id/payments', requirePermission('cxc:pay'), asyncRoute(async (req, res) => {
  required(req.body, ['amount', 'payment_date', 'method'], {
    amount: 'valor del abono',
    payment_date: 'fecha del abono',
    method: 'medio de pago'
  });
  if (!isValidDate(req.body.payment_date)) throw new ApiError(422, 'La fecha del abono no es válida.');
  const result = await registerReceivablePayment(integer(req.params.id, 'cuenta por cobrar'), req.body, req.user);
  res.status(201).json({ data: result, message: 'Abono registrado y sumado a la caja.' });
}));

router.put('/receivables/:id/payments/:paymentId', requirePermission('cxc:pay'), asyncRoute(async (req, res) => {
  required(req.body, ['amount', 'payment_date', 'method'], {
    amount: 'valor del abono',
    payment_date: 'fecha del abono',
    method: 'medio de pago'
  });
  if (!isValidDate(req.body.payment_date)) throw new ApiError(422, 'La fecha del abono no es válida.');
  const result = updateReceivablePayment(
    integer(req.params.id, 'cuenta por cobrar'),
    integer(req.params.paymentId, 'abono'),
    req.body,
    req.user
  );
  res.json({ data: result, message: 'Abono actualizado y caja recalculada.' });
}));

router.delete('/receivables/:id/payments/:paymentId', requirePermission('cxc:pay'), asyncRoute(async (req, res) => {
  const result = deleteReceivablePayment(
    integer(req.params.id, 'cuenta por cobrar'),
    integer(req.params.paymentId, 'abono'),
    req.user
  );
  res.json({ data: result, message: 'Abono eliminado y caja recalculada.' });
}));

router.delete('/receivables/:id', requirePermission('ventas:write'), asyncRoute(async (req, res) => {
  const ar = db.prepare('SELECT * FROM accounts_receivable WHERE id = ?').get(integer(req.params.id, 'cuenta por cobrar'));
  if (!ar) throw new ApiError(404, 'La cuenta por cobrar no existe.');
  deleteSale(ar.sale_id, req.user);
  res.json({ message: 'Venta y cuenta por cobrar eliminadas.' });
}));

/* ───────────────────────────── CxP ───────────────────────────── */

function payableState(row, today = todayBogota()) {
  const balance = money(Math.max(0, Number(row.amount) - Number(row.paid)));
  if (balance <= 0.5) return { balance, status: 'Pagada', statusKey: 'pagada', overdueDays: 0 };
  if (row.due_date < today) {
    const overdueDays = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${row.due_date}T12:00:00Z`)) / 86400000);
    return { balance, status: 'Vencida', statusKey: 'vencida', overdueDays };
  }
  if (row.due_date <= addDays(today, 15)) return { balance, status: 'Próxima', statusKey: 'proxima', overdueDays: 0 };
  return { balance, status: 'Pendiente', statusKey: 'pendiente', overdueDays: 0 };
}

router.get('/payables', requirePermission('cxp:view'), asyncRoute(async (req, res) => {
  const today = todayBogota();
  const conditions = [];
  const params = [];
  if (req.query.concept) {
    conditions.push('ap.concept = ?');
    params.push(req.query.concept);
  }
  if (req.query.provider) {
    conditions.push('ap.provider_name LIKE ?');
    params.push(`%${String(req.query.provider).trim()}%`);
  }
  const apFrom = req.query.from || req.query.due_from;
  if (isValidDate(apFrom)) {
    conditions.push('ap.due_date >= ?');
    params.push(apFrom);
  }
  const apTo = req.query.to || req.query.due_to;
  if (isValidDate(apTo)) {
    conditions.push('ap.due_date <= ?');
    params.push(apTo);
  }
  if (req.query.search) {
    const term = `%${String(req.query.search).trim()}%`;
    conditions.push('(ap.provider_name LIKE ? OR ap.description LIKE ?)');
    params.push(term, term);
  }
  const apSortDirection = req.query.sort === 'newest' ? 'DESC' : 'ASC';
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT ap.*, s.invoice_number, p.doc_number,
      (SELECT MAX(pp.payment_date) FROM payable_payments pp WHERE pp.payable_id = ap.id) AS last_payment_date
    FROM accounts_payable ap
    LEFT JOIN sales s ON s.id = ap.sale_id
    LEFT JOIN purchases p ON p.id = ap.purchase_id
    ${where}
    ORDER BY ap.due_date ${apSortDirection}, ap.id ${apSortDirection}
  `).all(...params).map((row) => {
    const state = payableState(row, today);
    return {
      ...row,
      amount: money(row.amount),
      paid: money(row.paid),
      balance: state.balance,
      status: state.status,
      status_key: state.statusKey,
      overdue_days: state.overdueDays
    };
  });
  const statusFilter = String(req.query.status || '').toLowerCase();
  const filtered = statusFilter && statusFilter !== 'todas'
    ? rows.filter((row) => row.status_key === statusFilter)
    : rows;
  const paidMonth = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM payable_payments
    WHERE payment_date BETWEEN ? AND ?
  `).get(monthBounds(monthOf(today)).start, today);
  const summary = {
    pending: money(rows.filter((row) => row.status_key !== 'pagada').reduce((total, row) => total + row.balance, 0)),
    overdue: money(rows.filter((row) => row.status_key === 'vencida').reduce((total, row) => total + row.balance, 0)),
    upcoming: money(rows.filter((row) => row.status_key === 'proxima').reduce((total, row) => total + row.balance, 0)),
    overdueCount: rows.filter((row) => row.status_key === 'vencida').length,
    paidMonth: money(paidMonth.total)
  };
  const { page, limit, offset } = pageOptions(req.query);
  res.json({
    data: filtered.slice(offset, offset + limit),
    pagination: {
      page,
      limit,
      total: filtered.length,
      pages: Math.max(1, Math.ceil(filtered.length / limit))
    },
    summary
  });
}));

router.get('/payables/:id/payments', requirePermission('cxp:view'), asyncRoute(async (req, res) => {
  const payable = db.prepare(`
    SELECT ap.*, p.doc_number, p.arrival_date, p.quantity AS purchase_quantity,
      p.unit_cost, p.freight_value, p.unloading_value,
      pp.name AS purchase_product_name, pp.code AS purchase_product_code, pp.unit AS purchase_product_unit,
      s.invoice_number, s.delivery_date, s.quantity AS sale_quantity, s.unit_price,
      sp.name AS sale_product_name, sp.code AS sale_product_code, sp.unit AS sale_product_unit
    FROM accounts_payable ap
    LEFT JOIN purchases p ON p.id = ap.purchase_id
    LEFT JOIN products pp ON pp.id = p.product_id
    LEFT JOIN sales s ON s.id = ap.sale_id
    LEFT JOIN products sp ON sp.id = s.product_id
    WHERE ap.id = ?
  `).get(integer(req.params.id, 'cuenta por pagar'));
  if (!payable) throw new ApiError(404, 'La cuenta por pagar no existe.');
  const payments = db.prepare(`
    SELECT pp.*, u.full_name AS created_by_name FROM payable_payments pp
    LEFT JOIN users u ON u.id = pp.created_by
    WHERE pp.payable_id = ? ORDER BY pp.payment_date DESC, pp.id DESC
  `).all(payable.id);
  const productName = payable.purchase_product_name || payable.sale_product_name || null;
  const productCode = payable.purchase_product_code || payable.sale_product_code || null;
  const productUnit = payable.purchase_product_unit || payable.sale_product_unit || null;
  const quantity = payable.purchase_quantity || payable.sale_quantity || null;
  const unitValue = payable.unit_cost || payable.unit_price || null;
  res.json({
    data: {
      ...payable,
      amount: money(payable.amount),
      paid: money(payable.paid),
      balance: money(payable.amount - payable.paid),
      reference_number: payable.doc_number || payable.invoice_number || null,
      reference_date: payable.arrival_date || payable.delivery_date || null,
      product: productName ? { name: productName, code: productCode, unit: productUnit, quantity, unit_value: unitValue } : null,
      payments
    }
  });
}));

router.put('/payables/:id', requirePermission('cxp:pay'), asyncRoute(async (req, res) => {
  required(req.body, ['due_date'], { due_date: 'fecha de vencimiento' });
  const result = updatePayableDueDate(integer(req.params.id, 'cuenta por pagar'), req.body.due_date, req.user);
  res.json({ data: result, message: 'Vencimiento de la obligación actualizado.' });
}));

router.post('/payables/:id/payments', requirePermission('cxp:pay'), asyncRoute(async (req, res) => {
  required(req.body, ['amount', 'payment_date', 'method'], {
    amount: 'valor del pago',
    payment_date: 'fecha del pago',
    method: 'medio de pago'
  });
  if (!isValidDate(req.body.payment_date)) throw new ApiError(422, 'La fecha del pago no es válida.');
  const result = await registerPayablePayment(integer(req.params.id, 'cuenta por pagar'), req.body, req.user);
  res.status(201).json({ data: result, message: 'Pago registrado y descontado de la caja.' });
}));

router.put('/payables/:id/payments/:paymentId', requirePermission('cxp:pay'), asyncRoute(async (req, res) => {
  required(req.body, ['amount', 'payment_date', 'method'], {
    amount: 'valor del pago',
    payment_date: 'fecha del pago',
    method: 'medio de pago'
  });
  if (!isValidDate(req.body.payment_date)) throw new ApiError(422, 'La fecha del pago no es válida.');
  const result = updatePayablePayment(
    integer(req.params.id, 'cuenta por pagar'),
    integer(req.params.paymentId, 'pago'),
    req.body,
    req.user
  );
  res.json({ data: result, message: 'Pago actualizado y caja recalculada.' });
}));

router.delete('/payables/:id/payments/:paymentId', requirePermission('cxp:pay'), asyncRoute(async (req, res) => {
  const result = deletePayablePayment(
    integer(req.params.id, 'cuenta por pagar'),
    integer(req.params.paymentId, 'pago'),
    req.user
  );
  res.json({ data: result, message: 'Pago eliminado y caja recalculada.' });
}));

router.delete('/payables/:id', requirePermission('compras:write'), asyncRoute(async (req, res) => {
  const ap = db.prepare('SELECT * FROM accounts_payable WHERE id = ?').get(integer(req.params.id, 'cuenta por pagar'));
  if (!ap) throw new ApiError(404, 'La cuenta por pagar no existe.');
  if (ap.purchase_id) {
    deletePurchase(ap.purchase_id, req.user);
  } else {
    const paid = db.prepare('SELECT COUNT(*) AS count FROM payable_payments WHERE payable_id = ?').get(ap.id).count;
    if (paid > 0) throw new ApiError(409, 'No se puede eliminar una cuenta por pagar con pagos registrados.');
    db.prepare('DELETE FROM accounts_payable WHERE id = ?').run(ap.id);
  }
  res.json({ message: 'Cuenta por pagar eliminada.' });
}));

/* ───────────────────────────── Cartera ───────────────────────────── */

router.get('/portfolio', requirePermission('cartera:view'), asyncRoute(async (req, res) => {
  res.json(getPortfolio());
}));

/* ───────────────────────────── Costeo ───────────────────────────── */

router.get('/costing', requirePermission('costos:view'), asyncRoute(async (req, res) => {
  res.json(getCosting(req.query));
}));

router.get('/indirect-costs', requirePermission('costos:view'), asyncRoute(async (req, res) => {
  const month = isValidMonth(req.query.month) ? req.query.month : monthOf(todayBogota());
  res.json({
    data: getIndirectCosts(month).map((row) => ({ ...row, amount: money(row.amount) })),
    month,
    monthLabel: monthLabel(month)
  });
}));

router.post('/indirect-costs', requirePermission('costos:write'), asyncRoute(async (req, res) => {
  required(req.body, ['month', 'category', 'amount'], {
    month: 'período',
    category: 'categoría',
    amount: 'valor'
  });
  if (!isValidMonth(req.body.month)) throw new ApiError(422, 'El período debe tener el formato AAAA-MM.');
  const amount = money(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(422, 'El valor debe ser mayor que cero.');
  const category = text(req.body.category, { max: 80 });
  const allocationMethod = ['volumen', 'valor_venta'].includes(req.body.allocation_method)
    ? req.body.allocation_method
    : 'volumen';
  const description = text(req.body.description, { max: 250 });
  const isFixed = bool(req.body.is_fixed, true) ? 1 : 0;
  const info = db.prepare(`
    INSERT INTO indirect_costs
      (period, category, description, amount, allocation_method, is_fixed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.body.month, category, description, amount, allocationMethod, isFixed, nowIso());
  logActivity(req.user, 'crear', 'costo_indirecto', Number(info.lastInsertRowid), `${category} · $${amount}`);
  res.status(201).json({ data: db.prepare('SELECT * FROM indirect_costs WHERE id = ?').get(Number(info.lastInsertRowid)), message: 'Costo indirecto registrado.' });
}));

router.put('/indirect-costs/:id', requirePermission('costos:write'), asyncRoute(async (req, res) => {
  const id = integer(req.params.id, 'costo indirecto');
  const existing = db.prepare('SELECT * FROM indirect_costs WHERE id = ?').get(id);
  if (!existing) throw new ApiError(404, 'El costo indirecto no existe.');
  required(req.body, ['category', 'amount'], { category: 'categoría', amount: 'valor' });
  const amount = money(req.body.amount);
  if (amount <= 0) throw new ApiError(422, 'El valor debe ser mayor que cero.');
  const allocationMethod = ['volumen', 'valor_venta'].includes(req.body.allocation_method)
    ? req.body.allocation_method
    : existing.allocation_method;
  db.prepare(`
    UPDATE indirect_costs SET category = ?, description = ?, amount = ?, allocation_method = ?, is_fixed = ?
    WHERE id = ?
  `).run(
    text(req.body.category, { max: 80 }),
    text(req.body.description, { max: 250 }),
    amount,
    allocationMethod,
    bool(req.body.is_fixed, existing.is_fixed === 1) ? 1 : 0,
    id
  );
  logActivity(req.user, 'editar', 'costo_indirecto', id, text(req.body.category, { max: 80 }));
  res.json({ data: db.prepare('SELECT * FROM indirect_costs WHERE id = ?').get(id), message: 'Costo indirecto actualizado.' });
}));

router.delete('/indirect-costs/:id', requirePermission('costos:write'), asyncRoute(async (req, res) => {
  const id = integer(req.params.id, 'costo indirecto');
  const existing = db.prepare('SELECT * FROM indirect_costs WHERE id = ?').get(id);
  if (!existing) throw new ApiError(404, 'El costo indirecto no existe.');
  db.prepare('DELETE FROM indirect_costs WHERE id = ?').run(id);
  logActivity(req.user, 'eliminar', 'costo_indirecto', id, existing.category);
  res.json({ message: 'Costo indirecto eliminado.' });
}));

/* ───────────────────────────── Estados financieros ───────────────────────────── */

router.get('/financial-statements', requirePermission('estados:view'), asyncRoute(async (req, res) => {
  res.json(getFinancialStatements(req.query.month));
}));

router.get('/financial-years', requirePermission('estados:view'), asyncRoute(async (req, res) => {
  const years = db.prepare(`
    SELECT DISTINCT substr(delivery_date, 1, 4) AS year FROM sales ORDER BY year DESC
  `).all().map((row) => row.year);
  res.json({ years });
}));

export default router;
