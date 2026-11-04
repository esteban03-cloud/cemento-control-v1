import { Router } from 'express';
import { db, logActivity, nowIso } from '../db.js';
import { getConfig, getNextSequence } from '../config.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  hashPassword,
  publicUser,
  requireAuth,
  recordLogin,
  sessionCookie,
  verifyPassword
} from '../auth.js';
import { ApiError, asyncRoute, required, text } from '../lib/http.js';
import { todayBogota } from '../lib/dates.js';
import { permissionsFor } from '../permissions.js';

const router = Router();
const loginAttempts = new Map();

function publicBusiness() {
  const config = getConfig();
  return {
    name: config.business.name,
    shortName: config.business.shortName,
    logo: config.business.logo,
    city: config.business.city,
    phone: config.business.phone,
    email: config.business.email
  };
}

router.get('/public/config', (req, res) => {
  res.json({
    business: publicBusiness(),
    today: todayBogota(),
    demo: db.prepare('SELECT COUNT(*) AS count FROM users').get().count > 0
  });
});

router.post('/auth/login', asyncRoute(async (req, res) => {
  const username = text(req.body?.username, { max: 80 }).toLowerCase();
  const password = String(req.body?.password || '');
  const key = `${req.ip}:${username}`;
  const now = Date.now();
  const attempt = loginAttempts.get(key) || { count: 0, first: now };
  if (now - attempt.first > 10 * 60 * 1000) {
    attempt.count = 0;
    attempt.first = now;
  }
  if (attempt.count >= 8) {
    throw new ApiError(429, 'Demasiados intentos fallidos. Espera 10 minutos e intenta de nuevo.');
  }
  if (!username || !password) throw new ApiError(422, 'Ingresa tu usuario y contraseña.');
  const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
  if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
    attempt.count += 1;
    loginAttempts.set(key, attempt);
    throw new ApiError(401, 'Usuario o contraseña incorrectos.');
  }
  loginAttempts.delete(key);
  const session = createSession(user.id);
  res.setHeader('Set-Cookie', sessionCookie(session.token));
  recordLogin(user);
  res.json({
    user: publicUser(user),
    business: publicBusiness(),
    expiresAt: session.expiresAt
  });
}));

router.get('/auth/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({
    user: publicUser(user),
    business: publicBusiness(),
    serverTime: nowIso(),
    today: todayBogota(),
    permissions: permissionsFor(user.role)
  });
});

router.post('/auth/logout', asyncRoute(async (req, res) => {
  if (req.user) logActivity(req.user, 'logout', 'sesión', req.user.id, 'Cierre de sesión');
  destroySession(req.sessionToken);
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.json({ ok: true });
}));

router.post('/auth/password', requireAuth, asyncRoute(async (req, res) => {
  required(req.body, ['current_password', 'new_password'], {
    current_password: 'contraseña actual',
    new_password: 'nueva contraseña'
  });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(String(req.body.current_password), user.password_hash)) {
    throw new ApiError(422, 'La contraseña actual no es correcta.');
  }
  const newPassword = String(req.body.new_password);
  if (newPassword.length < 8) throw new ApiError(422, 'La nueva contraseña debe tener al menos 8 caracteres.');
  if (newPassword === String(req.body.current_password)) {
    throw new ApiError(422, 'La nueva contraseña debe ser diferente a la actual.');
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), user.id);
  destroySession(req.sessionToken);
  const session = createSession(user.id);
  res.setHeader('Set-Cookie', sessionCookie(session.token));
  logActivity(req.user, 'cambiar contraseña', 'usuario', user.id, 'Contraseña actualizada');
  res.json({ ok: true });
}));

router.get('/meta', requireAuth, (req, res) => {
  const config = getConfig();
  const products = db.prepare(`
    SELECT id, code, name, unit, stock, avg_cost, sale_price, min_stock, ordering_cost, holding_rate, active
    FROM products WHERE active = 1 ORDER BY name
  `).all();
  const customers = db.prepare('SELECT * FROM customers ORDER BY name').all();
  const suppliers = db.prepare('SELECT * FROM suppliers ORDER BY name').all();
  const couriers = db.prepare('SELECT * FROM couriers WHERE active = 1 ORDER BY name').all();
  res.json({
    business: config.business,
    fiscal: config.fiscal,
    thresholds: config.thresholds,
    inventory: config.inventory,
    products,
    customers,
    suppliers,
    couriers,
    today: todayBogota(),
    nextSale: getNextSequence('sale').label,
    nextPurchase: getNextSequence('purchase').label,
    cashCategories: {
      ingreso: ['ventas', 'cobros', 'aportes', 'otros'],
      egreso: ['compras', 'flete', 'descargue', 'cargue', 'nómina', 'arriendo', 'servicios', 'gmf', 'impuestos', 'otros']
    }
  });
});

router.get('/alerts', requireAuth, asyncRoute(async (req, res) => {
  const { computeAlerts } = await import('../services/analytics.js');
  const alerts = computeAlerts();
  res.json({ alerts, critical: alerts.filter((item) => item.severity === 'red').length });
}));

export default router;
