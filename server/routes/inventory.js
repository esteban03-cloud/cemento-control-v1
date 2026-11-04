import { Router } from 'express';
import { db, logActivity, nowIso } from '../db.js';
import { asyncRoute, ApiError, integer, required, text, bool } from '../lib/http.js';
import { addDays, isValidDate, monthOf, todayBogota } from '../lib/dates.js';
import { money, roundStock } from '../lib/money.js';
import { requireAuth, requirePermission } from '../auth.js';
import { createInventoryAdjustment, deleteInventoryAdjustment } from '../services/operations.js';
import { getInventoryOverview } from '../services/analytics.js';

const router = Router();
router.use(requireAuth);

router.get('/inventory', requirePermission('inventario:view'), asyncRoute(async (req, res) => {
  res.json(getInventoryOverview());
}));

router.get('/inventory/adjustments', requirePermission('inventario:view'), asyncRoute(async (req, res) => {
  const conditions = [];
  const params = [];
  if (isValidDate(req.query.from)) {
    conditions.push('a.adjustment_date >= ?');
    params.push(req.query.from);
  }
  if (isValidDate(req.query.to)) {
    conditions.push('a.adjustment_date <= ?');
    params.push(req.query.to);
  }
  if (req.query.search) {
    const term = `%${String(req.query.search).trim()}%`;
    conditions.push('(p.name LIKE ? OR p.code LIKE ? OR a.reason LIKE ?)');
    params.push(term, term, term);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT a.*, p.name AS product_name, p.code AS product_code, p.unit AS product_unit,
      u.full_name AS created_by_name
    FROM inventory_adjustments a
    JOIN products p ON p.id = a.product_id
    LEFT JOIN users u ON u.id = a.created_by
    ${where}
    ORDER BY a.adjustment_date DESC, a.id DESC
  `).all(...params);
  const entries = rows.filter((row) => row.type === 'entrada');
  const exits = rows.filter((row) => row.type === 'salida');
  res.json({
    data: rows,
    summary: {
      count: rows.length,
      entries: roundStock(entries.reduce((total, row) => total + Number(row.quantity), 0)),
      exits: roundStock(exits.reduce((total, row) => total + Number(row.quantity), 0)),
      cost: money(rows.reduce((total, row) => total + Number(row.quantity) * Number(row.unit_cost), 0))
    }
  });
}));

router.post('/inventory/adjustments', requirePermission('ajustes:write'), asyncRoute(async (req, res) => {
  required(req.body, ['product_id', 'type', 'quantity', 'reason'], {
    product_id: 'producto',
    type: 'tipo de ajuste',
    quantity: 'cantidad',
    reason: 'motivo'
  });
  if (!['entrada', 'salida'].includes(req.body.type)) throw new ApiError(422, 'El tipo de ajuste no es válido.');
  if (!isValidDate(req.body.adjustment_date || todayBogota())) {
    throw new ApiError(422, 'La fecha del ajuste no es válida.');
  }
  const adjustment = createInventoryAdjustment(req.body, req.user);
  res.status(201).json({
    data: adjustment,
    message: `Ajuste de ${req.body.type} registrado. El inventario y el costo promedio se actualizaron.`
  });
}));

router.delete('/inventory/adjustments/:id', requirePermission('ajustes:write'), asyncRoute(async (req, res) => {
  const id = integer(req.params.id, 'ajuste');
  deleteInventoryAdjustment(id, req.user);
  res.json({ message: 'Ajuste de inventario eliminado y stock recalculado.' });
}));

router.get('/inventory/:productId/movements', requirePermission('inventario:view'), asyncRoute(async (req, res) => {
  const productId = integer(req.params.productId, 'producto');
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) throw new ApiError(404, 'El producto no existe.');
  const from = isValidDate(req.query.from) ? req.query.from : addDays(todayBogota(), -365);
  const to = isValidDate(req.query.to) ? req.query.to : todayBogota();
  const movements = db.prepare(`
    SELECT im.*, u.full_name AS created_by_name
    FROM inventory_movements im LEFT JOIN users u ON u.id = im.created_by
    WHERE im.product_id = ? AND im.movement_date BETWEEN ? AND ?
    ORDER BY im.movement_date ASC, im.id ASC
  `).all(productId, from, to);
  let running = 0;
  const withBalance = movements.map((row) => {
    running = roundStock(running + Number(row.quantity));
    return {
      ...row,
      quantity: roundStock(row.quantity),
      unit_cost: money(row.unit_cost),
      running_balance: running
    };
  });
  res.json({
    data: {
      product: {
        ...product,
        stock: roundStock(product.stock),
        avg_cost: money(product.avg_cost)
      },
      movements: withBalance.reverse(),
      range: { from, to }
    }
  });
}));

router.get('/products', requirePermission('inventario:view'), asyncRoute(async (req, res) => {
  const includeInactive = req.query.all === 'true';
  const products = db.prepare(`
    SELECT * FROM products ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY active DESC, name
  `).all().map((row) => ({
    ...row,
    stock: roundStock(row.stock),
    avg_cost: money(row.avg_cost),
    sale_price: money(row.sale_price),
    inventory_value: money(row.stock * row.avg_cost)
  }));
  res.json({ data: products });
}));

router.post('/products', requirePermission('productos:write'), asyncRoute(async (req, res) => {
  required(req.body, ['code', 'name'], {
    code: 'código',
    name: 'nombre'
  });
  const code = text(req.body.code, { max: 30 }).toUpperCase();
  const name = text(req.body.name, { max: 120 });
  const salePrice = money(req.body.sale_price);
  if (!code || !name) throw new ApiError(422, 'El código y el nombre son obligatorios.');
  if (salePrice < 0) throw new ApiError(422, 'El precio de venta no puede ser negativo.');
  const duplicate = db.prepare('SELECT id FROM products WHERE code = ? COLLATE NOCASE').get(code);
  if (duplicate) throw new ApiError(409, 'Ya existe un producto con ese código.');
  const info = db.prepare(`
    INSERT INTO products
      (code, name, unit, stock, avg_cost, sale_price, min_stock, ordering_cost, holding_rate, active, created_at)
    VALUES (?, ?, ?, 0, 0, ?, ?, ?, ?, 1, ?)
  `).run(
    code,
    name,
    text(req.body.unit, { max: 20, fallback: 'Bulto' }) || 'Bulto',
    salePrice,
    Number(req.body.min_stock) || 0,
    Number(req.body.ordering_cost) || 120000,
    Number(req.body.holding_rate) || 0.18,
    nowIso()
  );
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(info.lastInsertRowid));
  logActivity(req.user, 'crear', 'producto', product.id, `${code} · ${name}`);
  res.status(201).json({ data: product, message: 'Producto creado correctamente. El precio de venta se puede definir al editarlo o al facturarlo.' });
}));

router.put('/products/:id', requirePermission('productos:write'), asyncRoute(async (req, res) => {
  const id = integer(req.params.id, 'producto');
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) throw new ApiError(404, 'El producto no existe.');
  const code = text(req.body.code, { max: 30, fallback: existing.code }).toUpperCase();
  const name = text(req.body.name, { max: 120, fallback: existing.name });
  const salePrice = req.body.sale_price !== undefined ? money(req.body.sale_price) : existing.sale_price;
  if (!code || !name) throw new ApiError(422, 'El código y el nombre son obligatorios.');
  if (salePrice < 0) throw new ApiError(422, 'El precio de venta no puede ser negativo.');
  const duplicate = db.prepare('SELECT id FROM products WHERE code = ? COLLATE NOCASE AND id <> ?').get(code, id);
  if (duplicate) throw new ApiError(409, 'Ya existe otro producto con ese código.');
  db.prepare(`
    UPDATE products SET code = ?, name = ?, unit = ?, sale_price = ?, min_stock = ?,
      ordering_cost = ?, holding_rate = ?, active = ?
    WHERE id = ?
  `).run(
    code,
    name,
    text(req.body.unit, { max: 20, fallback: existing.unit }) || 'Bulto',
    salePrice,
    req.body.min_stock !== undefined ? Number(req.body.min_stock) || 0 : existing.min_stock,
    req.body.ordering_cost !== undefined ? Number(req.body.ordering_cost) || existing.ordering_cost : existing.ordering_cost,
    req.body.holding_rate !== undefined ? Number(req.body.holding_rate) || existing.holding_rate : existing.holding_rate,
    bool(req.body.active, existing.active === 1) ? 1 : 0,
    id
  );
  logActivity(req.user, 'editar', 'producto', id, `${code} · ${name}`);
  res.json({ data: db.prepare('SELECT * FROM products WHERE id = ?').get(id), message: 'Producto actualizado.' });
}));

router.delete('/products/:id', requirePermission('productos:write'), asyncRoute(async (req, res) => {
  const id = integer(req.params.id, 'producto');
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) throw new ApiError(404, 'El producto no existe.');
  const used = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM sales WHERE product_id = ?) +
      (SELECT COUNT(*) FROM purchases WHERE product_id = ?) +
      (SELECT COUNT(*) FROM inventory_movements WHERE product_id = ?) +
      (SELECT COUNT(*) FROM inventory_adjustments WHERE product_id = ?) AS count
  `).get(id, id, id, id).count;
  if (used > 0) {
    throw new ApiError(409, 'El producto ya tiene movimientos y no se puede borrar sin perder el historial. Puedes desactivarlo desde su edición.');
  }
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  logActivity(req.user, 'eliminar', 'producto', id, existing.name);
  res.json({ message: 'Producto eliminado correctamente.' });
}));

export default router;
