import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db, logActivity, nowIso } from './db.js';
import { permissionsFor } from './permissions.js';

export const SESSION_COOKIE = 'cc_session';
const SESSION_HOURS = 12;

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const derived = scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, encoded) {
  try {
    const [algorithm, salt, expected] = String(encoded).split('$');
    if (algorithm !== 'scrypt' || !salt || !expected) return false;
    const actual = scryptSync(String(password), salt, 64);
    const expectedBuffer = Buffer.from(expected, 'hex');
    return expectedBuffer.length === actual.length && timingSafeEqual(expectedBuffer, actual);
  } catch {
    return false;
  }
}

export function parseCookies(header = '') {
  return Object.fromEntries(
    String(header)
      .split(';')
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const index = chunk.indexOf('=');
        if (index < 0) return [chunk, ''];
        return [decodeURIComponent(chunk.slice(0, index)), decodeURIComponent(chunk.slice(index + 1))];
      })
  );
}

export function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    role: row.role,
    active: Boolean(row.active),
    permissions: permissionsFor(row.role)
  };
}

export function sessionCookie(token, maxAgeSeconds = SESSION_HOURS * 3600) {
  const secure = process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(createdAt);
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, createdAt, expiresAt);
  return { token, expiresAt };
}

export function destroySession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function authenticate(req, _res, next) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  req.sessionToken = token || null;
  if (!token) return next();
  const row = db.prepare(`
    SELECT u.*, s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ? AND u.active = 1
  `).get(token, nowIso());
  if (!row) {
    destroySession(token);
    return next();
  }
  req.user = publicUser(row);
  req.userRow = row;
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Tu sesión expiró o no has iniciado sesión.' });
  }
  next();
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Debes iniciar sesión.' });
    const perms = req.user.permissions;
    if (perms.includes('*') || perms.includes(permission)) return next();
    return res.status(403).json({ error: 'No tienes permiso para realizar esta acción.' });
  };
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Debes iniciar sesión.' });
  if (req.user.role !== 'administrador') {
    return res.status(403).json({ error: 'Esta acción requiere el rol de administrador.' });
  }
  next();
}

export function recordLogin(user) {
  logActivity(user, 'login', 'sesión', user.id, 'Inicio de sesión');
}
