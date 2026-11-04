import { Router } from 'express';
import { db } from '../db.js';
import { asyncRoute, required, ApiError, integer } from '../lib/http.js';
import { addDays, isValidDate, todayBogota } from '../lib/dates.js';
import { money } from '../lib/money.js';
import { requireAuth, requirePermission } from '../auth.js';
import {
  createSale,
  deleteSale,
  getSaleById,
  updateSale,
  createPurchase,
  deletePurchase,
  getPurchaseById,
  updatePurchase
} from '../services/operations.js';

const router = Router();
router.use(requireAuth);

function queryOptions(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(5, Number(query.limit) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

function saleStatus(row, today = todayBogota()) {
  const balance = row.payment_condition === 'credito'
    ? money(Math.max(0, Number(row.receivable_amount || 0) - Number(row.receivable_paid || 0)))
    : 0;
  if (balance <= 0.5) return { balance: 0, status: 'Pagada', statusKey: 'pagada' };
  if (!row.due_date) return { balance, status: 'Pendiente', statusKey: 'pendiente' };
  if (row.due_date < today) return { balance, status: 'Vencida', statusKey: 'vencida' };
  if (row.due_date <= addDays(today, 7)) return { balance, status: 'Por vencer', statusKey: 'por_vencer' };
  return { balance, status: 'Pendiente', statusKey: 'pendiente' };
}

router.get('/sales', requirePermission('ventas:view'), asyncRoute(async (req, res) => {
  const { page, limit, offset } = queryOptions(req.query);
  const today = todayBogota();
  const conditions = [];
  const params = [];
  if (isValidDate(req.query.from)) {
    conditions.push('s.delivery_date >= ?');
    params.push(req.query.from);
  }
  if (isValidDate(req.query.to)) {
    conditions.push('s.delivery_date <= ?');
    params.push(req.query.to);
  }
  if (req.query.search) {
    conditions.push('(s.invoice_number LIKE ? OR c.name LIKE ? OR p.name LIKE ?)');
    const term = `%${String(req.query.search).trim()}%`;
    params.push(term, term, term);
  }
  if (req.query.customer_id) {
    conditions.push('s.customer_id = ?');
    params.push(Number(req.query.customer_id));
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT s.*, c.name AS customer_name, c.nit AS customer_nit, p.name AS product_name,
      p.code AS product_code, co.name AS courier_name,
      ar.id AS receivable_id, ar.amount AS receivable_amount, ar.paid AS receivable_paid
    FROM sales s
    JOIN customers c ON c.id = s.customer_id
    JOIN products p ON p.id = s.product_id
    LEFT JOIN couriers co ON co.id = s.courier_id
    LEFT JOIN accounts_receivable ar ON ar.sale_id = s.id
    ${where}
    ORDER BY s.delivery_date DESC, s.id DESC
  `).all(...params).map((row) => {
    const state = saleStatus(row, today);
    return {
      ...row,
      total: money(row.total),
      subtotal: money(row.subtotal),
      balance: state.balance,
      status: state.status,
      status_key: state.statusKey,
      paid_display: row.payment_condition === 'credito'
        ? money(row.receivable_paid)
        : money(row.total)
    };
  });
  const statusFilter = String(req.query.status || '').toLowerCase();
  const filtered = statusFilter && statusFilter !== 'todas'
    ? rows.filter((row) => row.status_key === statusFilter)
    : rows;
  const totalValue = money(filtered.reduce((total, row) => total + row.total, 0));
  const totalBalance = money(filtered.reduce((total, row) => total + row.balance, 0));
  const paged = filtered.slice(offset, offset + limit);
  res.json({
    data: paged,
    pagination: {
      page,
      limit,
      total: filtered.length,
      pages: Math.max(1, Math.ceil(filtered.length / limit))
    },
    summary: {
      count: filtered.length,
      total: totalValue,
      balance: totalBalance,
      overdue: filtered.filter((row) => row.status_key === 'vencida').length
    }
  });
}));

router.get('/sales/:id', requirePermission('ventas:view'), asyncRoute(async (req, res) => {
  const sale = getSaleById(integer(req.params.id, 'venta'), true);
  if (!sale) throw new ApiError(404, 'La venta no existe.');
  res.json({ data: sale });
}));

router.post('/sales', requirePermission('ventas:write'), asyncRoute(async (req, res) => {
  required(req.body, ['delivery_date', 'payment_condition', 'product_id', 'quantity', 'unit_price'], {
    delivery_date: 'fecha de entrega',
    payment_condition: 'condición de pago',
    product_id: 'producto',
    quantity: 'cantidad',
    unit_price: 'precio unitario'
  });
  if (!req.body.customer_id && !req.body.customer_name) {
    throw new ApiError(422, 'Selecciona un cliente o registra uno nuevo.');
  }
  if (req.body.payment_condition === 'credito' && !req.body.due_date) {
    throw new ApiError(422, 'La fecha de vencimiento es obligatoria para ventas a crédito.');
  }
  const sale = createSale(req.body, req.user);
  res.status(201).json({ data: sale, message: `Venta ${sale.invoice_number} registrada correctamente.` });
}));

router.put('/sales/:id', requirePermission('ventas:write'), asyncRoute(async (req, res) => {
  const sale = updateSale(integer(req.params.id, 'venta'), req.body, req.user);
  res.json({ data: sale, message: `Venta ${sale.invoice_number} actualizada correctamente.` });
}));

router.delete('/sales/:id', requirePermission('ventas:write'), asyncRoute(async (req, res) => {
  await deleteSale(integer(req.params.id, 'venta'), req.user);
  res.json({ message: 'Venta eliminada y movimientos asociados revertidos.' });
}));

function purchaseStatus(row, today = todayBogota()) {
  const balance = money(Number(row.total_cost) - Number(row.total_paid_at_creation) - Number(row.ap_paid || 0));
  if (balance <= 0.5) return { balance: 0, status: 'Pagada', statusKey: 'pagada' };
  if (row.credit_due_date && row.credit_due_date < today) return { balance, status: 'Vencida', statusKey: 'vencida' };
  if (row.credit_due_date && row.credit_due_date <= addDays(today, 7)) return { balance, status: 'Por vencer', statusKey: 'por_vencer' };
  return { balance, status: 'Crédito', statusKey: 'credito' };
}

router.get('/purchases', requirePermission('compras:view'), asyncRoute(async (req, res) => {
  const { page, limit, offset } = queryOptions(req.query);
  const today = todayBogota();
  const conditions = [];
  const params = [];
  if (isValidDate(req.query.from)) {
    conditions.push('p.arrival_date >= ?');
    params.push(req.query.from);
  }
  if (isValidDate(req.query.to)) {
    conditions.push('p.arrival_date <= ?');
    params.push(req.query.to);
  }
  if (req.query.search) {
    conditions.push('(p.doc_number LIKE ? OR s.name LIKE ? OR pr.name LIKE ? OR p.driver_name LIKE ?)');
    const term = `%${String(req.query.search).trim()}%`;
    params.push(term, term, term, term);
  }
  if (req.query.supplier_id) {
    conditions.push('p.supplier_id = ?');
    params.push(Number(req.query.supplier_id));
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT p.*, s.name AS supplier_name, pr.code AS product_code, pr.name AS product_name,
      pr.unit AS product_unit,
      COALESCE((SELECT SUM(amount) FROM accounts_payable WHERE purchase_id = p.id), 0) AS credit_total,
      COALESCE((SELECT SUM(paid) FROM accounts_payable WHERE purchase_id = p.id), 0) AS ap_paid
    FROM purchases p
    JOIN suppliers s ON s.id = p.supplier_id
    JOIN products pr ON pr.id = p.product_id
    ${where}
    ORDER BY p.arrival_date DESC, p.id DESC
  `).all(...params).map((row) => {
    const state = purchaseStatus(row, today);
    return {
      ...row,
      total_cost: money(row.total_cost),
      total_paid_at_creation: money(row.total_paid_at_creation),
      balance: state.balance,
      status: state.status,
      status_key: state.statusKey,
      paid_total: money(Number(row.total_paid_at_creation) + Number(row.ap_paid || 0)),
      landed_unit_cost: row.quantity ? money(row.total_cost / row.quantity) : 0
    };
  });
  const statusFilter = String(req.query.status || '').toLowerCase();
  const filtered = statusFilter && statusFilter !== 'todas'
    ? rows.filter((row) => row.status_key === statusFilter)
    : rows;
  const paged = filtered.slice(offset, offset + limit);
  res.json({
    data: paged,
    pagination: {
      page,
      limit,
      total: filtered.length,
      pages: Math.max(1, Math.ceil(filtered.length / limit))
    },
    summary: {
      count: filtered.length,
      total: money(filtered.reduce((total, row) => total + row.total_cost, 0)),
      balance: money(filtered.reduce((total, row) => total + row.balance, 0)),
      overdue: filtered.filter((row) => row.status_key === 'vencida').length
    }
  });
}));

router.get('/purchases/:id', requirePermission('compras:view'), asyncRoute(async (req, res) => {
  const purchase = getPurchaseById(integer(req.params.id, 'compra'));
  if (!purchase) throw new ApiError(404, 'La compra no existe.');
  const payables = db.prepare('SELECT * FROM accounts_payable WHERE purchase_id = ? ORDER BY id').all(purchase.id);
  const payments = db.prepare(`
    SELECT pp.* FROM payable_payments pp
    JOIN accounts_payable ap ON ap.id = pp.payable_id
    WHERE ap.purchase_id = ? ORDER BY pp.payment_date, pp.id
  `).all(purchase.id);
  res.json({ data: { ...purchase, payables, payments } });
}));

router.post('/purchases', requirePermission('compras:write'), asyncRoute(async (req, res) => {
  required(req.body, ['arrival_date', 'quantity', 'unit_cost'], {
    arrival_date: 'fecha de llegada',
    quantity: 'cantidad comprada',
    unit_cost: 'costo unitario'
  });
  if (!req.body.supplier_id && !req.body.supplier_name) {
    throw new ApiError(422, 'Selecciona un proveedor o registra uno nuevo.');
  }
  if (!req.body.product_id && (!req.body.product_code || !req.body.product_name)) {
    throw new ApiError(422, 'Selecciona un producto o créalo con código y nombre.');
  }
  const purchase = createPurchase(req.body, req.user);
  res.status(201).json({ data: purchase, message: `Compra ${purchase.doc_number} registrada correctamente.` });
}));

router.put('/purchases/:id', requirePermission('compras:write'), asyncRoute(async (req, res) => {
  const purchase = updatePurchase(integer(req.params.id, 'compra'), req.body, req.user);
  res.json({ data: purchase, message: `Compra ${purchase.doc_number} actualizada correctamente.` });
}));

router.delete('/purchases/:id', requirePermission('compras:write'), asyncRoute(async (req, res) => {
  await deletePurchase(integer(req.params.id, 'compra'), req.user);
  res.json({ message: 'Compra eliminada y movimientos asociados revertidos.' });
}));

export default router;
