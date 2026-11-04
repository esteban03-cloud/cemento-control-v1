import { Router } from 'express';
import { db, logActivity, nowIso } from '../db.js';
import { getConfig, getNextSequence, saveConfig, setSetting } from '../config.js';
import { hashPassword, verifyPassword, requireAdmin, requireAuth, requirePermission } from '../auth.js';
import { writeBackupFile } from '../services/backup.js';
import { asyncRoute, ApiError, bool, integer, required, text } from '../lib/http.js';
import { todayBogota } from '../lib/dates.js';
import { money } from '../lib/money.js';

const router = Router();
router.use(requireAuth);

const PARTNER_TYPES = {
  customers: { table: 'customers', label: 'cliente', fields: ['nit', 'phone', 'address'] },
  suppliers: { table: 'suppliers', label: 'proveedor', fields: ['nit', 'phone', 'address'] },
  couriers: { table: 'couriers', label: 'cotero', fields: ['phone'] }
};

/* ───────────────────────────── Terceros ───────────────────────────── */

router.get('/partners', requirePermission('terceros:view'), asyncRoute(async (req, res) => {
  res.json({
    customers: db.prepare('SELECT * FROM customers ORDER BY name').all(),
    suppliers: db.prepare('SELECT * FROM suppliers ORDER BY name').all(),
    couriers: db.prepare('SELECT * FROM couriers ORDER BY name').all()
  });
}));

router.post('/partners/:type', requirePermission('terceros:write'), asyncRoute(async (req, res) => {
  const type = PARTNER_TYPES[req.params.type];
  if (!type) throw new ApiError(404, 'Tipo de tercero no válido.');
  required(req.body, ['name'], { name: 'nombre' });
  const name = text(req.body.name, { max: 120 });
  const duplicate = db.prepare(`SELECT id FROM ${type.table} WHERE name = ? COLLATE NOCASE`).get(name);
  if (duplicate) throw new ApiError(409, `Ya existe un ${type.label} con ese nombre.`);
  const fields = type.fields;
  const values = fields.map((field) => text(req.body[field], { max: 250 }));
  let info;
  if (req.params.type === 'couriers') {
    info = db.prepare(`INSERT INTO couriers (name, phone, active, created_at) VALUES (?, ?, 1, ?)`)
      .run(name, values[0] || '', nowIso());
  } else {
    info = db.prepare(`
      INSERT INTO ${type.table} (name, nit, phone, address, created_at) VALUES (?, ?, ?, ?, ?)
    `).run(name, values[0] || '', values[1] || '', values[2] || '', nowIso());
  }
  const created = db.prepare(`SELECT * FROM ${type.table} WHERE id = ?`).get(Number(info.lastInsertRowid));
  logActivity(req.user, 'crear', type.label, created.id, name);
  res.status(201).json({ data: created, message: `${type.label.charAt(0).toUpperCase()}${type.label.slice(1)} creado correctamente.` });
}));

router.put('/partners/:type/:id', requirePermission('terceros:write'), asyncRoute(async (req, res) => {
  const type = PARTNER_TYPES[req.params.type];
  if (!type) throw new ApiError(404, 'Tipo de tercero no válido.');
  const id = integer(req.params.id, 'tercero');
  const existing = db.prepare(`SELECT * FROM ${type.table} WHERE id = ?`).get(id);
  if (!existing) throw new ApiError(404, 'El tercero no existe.');
  const name = text(req.body.name, { max: 120, fallback: existing.name });
  if (!name) throw new ApiError(422, 'El nombre es obligatorio.');
  const duplicate = db.prepare(`SELECT id FROM ${type.table} WHERE name = ? COLLATE NOCASE AND id <> ?`).get(name, id);
  if (duplicate) throw new ApiError(409, 'Ya existe otro tercero con ese nombre.');
  if (req.params.type === 'couriers') {
    db.prepare('UPDATE couriers SET name = ?, phone = ?, active = ? WHERE id = ?')
      .run(name, text(req.body.phone, { max: 40, fallback: existing.phone }), bool(req.body.active, existing.active === 1) ? 1 : 0, id);
  } else {
    db.prepare(`UPDATE ${type.table} SET name = ?, nit = ?, phone = ?, address = ? WHERE id = ?`)
      .run(
        name,
        text(req.body.nit, { max: 40, fallback: existing.nit }),
        text(req.body.phone, { max: 40, fallback: existing.phone }),
        text(req.body.address, { max: 250, fallback: existing.address }),
        id
      );
  }
  logActivity(req.user, 'editar', type.label, id, name);
  res.json({ data: db.prepare(`SELECT * FROM ${type.table} WHERE id = ?`).get(id), message: 'Tercero actualizado.' });
}));

router.delete('/partners/:type/:id', requirePermission('terceros:write'), asyncRoute(async (req, res) => {
  const type = PARTNER_TYPES[req.params.type];
  if (!type) throw new ApiError(404, 'Tipo de tercero no válido.');
  const id = integer(req.params.id, 'tercero');
  const existing = db.prepare(`SELECT * FROM ${type.table} WHERE id = ?`).get(id);
  if (!existing) throw new ApiError(404, 'El tercero no existe.');
  const usage = req.params.type === 'customers'
    ? db.prepare('SELECT COUNT(*) AS count FROM sales WHERE customer_id = ?').get(id).count
    : req.params.type === 'suppliers'
      ? db.prepare('SELECT COUNT(*) AS count FROM purchases WHERE supplier_id = ?').get(id).count
      : db.prepare('SELECT COUNT(*) AS count FROM sales WHERE courier_id = ?').get(id).count;
  if (usage > 0) throw new ApiError(409, 'No se puede eliminar porque tiene movimientos asociados. Puedes desactivarlo si es un cotero.');
  db.prepare(`DELETE FROM ${type.table} WHERE id = ?`).run(id);
  logActivity(req.user, 'eliminar', type.label, id, existing.name);
  res.json({ message: 'Tercero eliminado.' });
}));

/* ───────────────────────────── Configuración ───────────────────────────── */

function validateConfigPatch(body) {
  const current = getConfig();
  const patch = {};
  if (body.business) {
    const business = body.business;
    if (!text(business.name, { max: 160 })) throw new ApiError(422, 'El nombre de la empresa es obligatorio.');
    const logo = business.logo === undefined ? current.business.logo : String(business.logo || '');
    if (logo && !/^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(logo)) {
      throw new ApiError(422, 'El logo debe ser una imagen PNG, JPG, WEBP o SVG.');
    }
    if (logo.length > 1_500_000) throw new ApiError(422, 'El logo es demasiado grande. Usa una imagen menor a 1 MB.');
    patch.business = {
      name: text(business.name, { max: 160 }),
      shortName: text(business.shortName, { max: 80, fallback: text(business.name, { max: 80 }) }),
      nit: text(business.nit, { max: 40 }),
      address: text(business.address, { max: 250 }),
      city: text(business.city, { max: 80 }),
      phone: text(business.phone, { max: 40 }),
      email: text(business.email, { max: 120 }),
      logo
    };
  }
  if (body.fiscal) {
    const gmfRate = Number(body.fiscal.gmfRate);
    const ivaRate = Number(body.fiscal.ivaRate);
    if (!Number.isFinite(gmfRate) || gmfRate < 0 || gmfRate > 0.05) {
      throw new ApiError(422, 'La tarifa del 4x1000 debe estar entre 0% y 5%.');
    }
    if (!Number.isFinite(ivaRate) || ivaRate < 0 || ivaRate > 0.5) {
      throw new ApiError(422, 'La tarifa de IVA debe estar entre 0% y 50%.');
    }
    patch.fiscal = {
      gmfRate,
      ivaEnabled: bool(body.fiscal.ivaEnabled, current.fiscal.ivaEnabled),
      ivaRate
    };
  }
  if (body.openingBalances) {
    const opening = {};
    for (const key of ['cash', 'bank', 'capital']) {
      const value = money(body.openingBalances[key]);
      if (!Number.isFinite(value) || value < 0) throw new ApiError(422, 'Los saldos iniciales no pueden ser negativos.');
      opening[key] = value;
    }
    patch.openingBalances = opening;
  }
  if (body.inventory) {
    const orderingCost = Number(body.inventory.defaultOrderingCost);
    const holdingRate = Number(body.inventory.defaultHoldingRate);
    if (!(orderingCost > 0)) throw new ApiError(422, 'El costo por pedido debe ser mayor que cero.');
    if (!(holdingRate >= 0 && holdingRate <= 1)) throw new ApiError(422, 'La tasa de mantenimiento debe estar entre 0% y 100%.');
    patch.inventory = { defaultOrderingCost: orderingCost, defaultHoldingRate: holdingRate };
  }
  if (body.thresholds) {
    const allowed = [
      'salesGrowthGreen', 'salesGrowthYellow', 'marginGreen', 'marginYellow',
      'cashCoverageGreen', 'cashCoverageYellow', 'cashDaysGreen', 'cashDaysYellow',
      'receivablesGreen', 'receivablesYellow', 'profitabilityGreen', 'profitabilityYellow',
      'materialGreen', 'materialRed', 'customerGreen', 'customerRed',
      'inventoryGreenMonths', 'inventoryRedMonths'
    ];
    const thresholds = {};
    for (const key of allowed) {
      if (body.thresholds[key] === undefined) continue;
      const value = Number(body.thresholds[key]);
      if (!Number.isFinite(value) || value < 0 || value > 10000) {
        throw new ApiError(422, `El umbral ${key} no es válido.`);
      }
      thresholds[key] = value;
    }
    patch.thresholds = thresholds;
  }
  if (body.backup) {
    const hour = Number(body.backup.hour);
    const retention = Number(body.backup.retention);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new ApiError(422, 'La hora del respaldo debe estar entre 0 y 23.');
    if (!Number.isInteger(retention) || retention < 1 || retention > 365) throw new ApiError(422, 'La retención debe estar entre 1 y 365 días.');
    patch.backup = {
      enabled: bool(body.backup.enabled, current.backup.enabled),
      hour,
      retention
    };
  }
  if (body.sequences) {
    const salePrefix = text(body.sequences.salePrefix, { max: 10, fallback: current.sequences.salePrefix }).toUpperCase();
    const purchasePrefix = text(body.sequences.purchasePrefix, { max: 10, fallback: current.sequences.purchasePrefix }).toUpperCase();
    if (!/^[A-Z0-9-]{1,10}$/.test(salePrefix) || !/^[A-Z0-9-]{1,10}$/.test(purchasePrefix)) {
      throw new ApiError(422, 'Los prefijos solo pueden contener letras, números y guiones.');
    }
    patch.sequences = {
      salePrefix,
      purchasePrefix,
      saleNext: current.sequences.saleNext,
      purchaseNext: current.sequences.purchaseNext
    };
  }
  return patch;
}

router.get('/settings', requireAdmin, asyncRoute(async (req, res) => {
  res.json({
    config: getConfig(),
    next: {
      sale: getNextSequence('sale'),
      purchase: getNextSequence('purchase')
    },
    today: todayBogota()
  });
}));

router.put('/settings', requireAdmin, asyncRoute(async (req, res) => {
  const patch = validateConfigPatch(req.body || {});
  saveConfig(patch);
  logActivity(req.user, 'editar', 'configuración', 1, 'Parámetros del sistema actualizados');
  res.json({
    config: getConfig(),
    message: 'Configuración guardada correctamente.'
  });
}));

/* ───────────────────────────── Usuarios ───────────────────────────── */

function serializeUser(row) {
  return {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    role: row.role,
    active: Boolean(row.active),
    created_at: row.created_at
  };
}

router.get('/users', requireAdmin, asyncRoute(async (req, res) => {
  const users = db.prepare('SELECT id, username, full_name, role, active, created_at FROM users ORDER BY id').all();
  res.json({ data: users.map(serializeUser) });
}));

router.post('/users', requireAdmin, asyncRoute(async (req, res) => {
  required(req.body, ['username', 'full_name', 'role', 'password'], {
    username: 'usuario',
    full_name: 'nombre completo',
    role: 'rol',
    password: 'contraseña'
  });
  const username = text(req.body.username, { max: 40 }).toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    throw new ApiError(422, 'El usuario debe tener entre 3 y 40 caracteres: letras, números, punto, guion o guion bajo.');
  }
  const password = String(req.body.password);
  if (password.length < 8) throw new ApiError(422, 'La contraseña debe tener al menos 8 caracteres.');
  const role = text(req.body.role, { max: 30 });
  if (!['administrador', 'vendedor', 'contador'].includes(role)) throw new ApiError(422, 'El rol no es válido.');
  if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) {
    throw new ApiError(409, 'Ese nombre de usuario ya está en uso.');
  }
  const info = db.prepare(`
    INSERT INTO users (username, password_hash, full_name, role, active, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(username, hashPassword(password), text(req.body.full_name, { max: 120 }), role, nowIso());
  const user = db.prepare('SELECT id, username, full_name, role, active, created_at FROM users WHERE id = ?').get(Number(info.lastInsertRowid));
  logActivity(req.user, 'crear', 'usuario', user.id, `${username} · ${role}`);
  res.status(201).json({ data: serializeUser(user), message: 'Usuario creado correctamente.' });
}));

router.put('/users/:id', requireAdmin, asyncRoute(async (req, res) => {
  const id = integer(req.params.id, 'usuario');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) throw new ApiError(404, 'El usuario no existe.');
  const fullName = text(req.body.full_name, { max: 120, fallback: user.full_name });
  const role = text(req.body.role, { max: 30, fallback: user.role });
  if (!['administrador', 'vendedor', 'contador'].includes(role)) throw new ApiError(422, 'El rol no es válido.');
  const active = bool(req.body.active, user.active === 1);
  if (id === req.user.id && !active) throw new ApiError(422, 'No puedes desactivar tu propio usuario.');
  if (id === req.user.id && role !== 'administrador') throw new ApiError(422, 'No puedes quitarte el rol de administrador.');
  if (user.role === 'administrador' && (role !== 'administrador' || !active)) {
    const admins = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'administrador' AND active = 1").get().count;
    if (admins <= 1) throw new ApiError(409, 'Debe existir al menos un administrador activo.');
  }
  const password = req.body.password ? String(req.body.password) : null;
  if (password !== null && password.length < 8) throw new ApiError(422, 'La contraseña debe tener al menos 8 caracteres.');
  if (password) {
    db.prepare('UPDATE users SET full_name = ?, role = ?, active = ?, password_hash = ? WHERE id = ?')
      .run(fullName, role, active ? 1 : 0, hashPassword(password), id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  } else {
    db.prepare('UPDATE users SET full_name = ?, role = ?, active = ? WHERE id = ?')
      .run(fullName, role, active ? 1 : 0, id);
    if (!active) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  }
  logActivity(req.user, 'editar', 'usuario', id, `${user.username} · ${role} · ${active ? 'activo' : 'inactivo'}`);
  res.json({
    data: serializeUser(db.prepare('SELECT id, username, full_name, role, active, created_at FROM users WHERE id = ?').get(id)),
    message: 'Usuario actualizado.'
  });
}));

router.delete('/users/:id', requireAdmin, asyncRoute(async (req, res) => {
  const id = integer(req.params.id, 'usuario');
  if (id === req.user.id) throw new ApiError(422, 'No puedes eliminar tu propio usuario.');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) throw new ApiError(404, 'El usuario no existe.');
  const admins = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'administrador' AND active = 1").get().count;
  if (user.role === 'administrador' && user.active && admins <= 1) {
    throw new ApiError(409, 'Debe existir al menos un administrador activo.');
  }
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(id);
  logActivity(req.user, 'desactivar', 'usuario', id, user.username);
  res.json({ message: 'Usuario desactivado. Su historial se conserva.' });
}));

router.post('/settings/reset-database', requireAdmin, asyncRoute(async (req, res) => {
  required(req.body, ['password'], { password: 'contraseña del administrador' });
  const admin = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!admin || !verifyPassword(req.body.password, admin.password_hash)) {
    throw new ApiError(401, 'La contraseña del administrador es incorrecta.');
  }

  // Generar copia de seguridad automática preventiva antes de borrar
  const backup = writeBackupFile({ prefix: 'pre-restablecimiento' });

  const tablesToClear = [
    'debt_payments',
    'debt_installments',
    'debts',
    'quote_items',
    'quotes',
    'loan_payments',
    'loans',
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
    'activity_log',
    'products',
    'couriers',
    'suppliers',
    'customers'
  ];

  db.exec('PRAGMA foreign_keys = OFF;');
  try {
    db.exec('BEGIN IMMEDIATE;');
    for (const table of tablesToClear) {
      db.exec(`DELETE FROM ${table};`);
    }
    setSetting('seq_sale_next', 1);
    setSetting('seq_purchase_next', 1);
    setSetting('seq_quote_next', 1);
    db.exec('COMMIT;');
  } catch (err) {
    try { db.exec('ROLLBACK;'); } catch { /* ignore */ }
    throw new ApiError(500, `No se pudo restablecer la base de datos: ${err.message}`);
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }

  logActivity(req.user, 'restablecer', 'sistema', 0, `Base de datos restablecida en blanco. Copia preventiva: ${backup.filename}`);
  res.json({
    ok: true,
    message: 'Sistema restablecido con éxito. Se creó una copia de seguridad y la aplicación quedó en blanco para tus datos reales.',
    backup: backup.filename
  });
}));

export default router;
