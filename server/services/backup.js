import fs from 'node:fs';
import path from 'node:path';
import { db, projectRootDir } from '../db.js';
import { getConfig } from '../config.js';
import { logActivity } from '../db.js';
import { nowBogotaParts, todayBogota } from '../lib/dates.js';
import { ApiError } from '../lib/http.js';

const BACKUP_DIR = path.join(projectRootDir, 'data', 'backups');
fs.mkdirSync(BACKUP_DIR, { recursive: true });

export const BACKUP_TABLES = [
  'users',
  'settings',
  'customers',
  'suppliers',
  'couriers',
  'products',
  'purchases',
  'sales',
  'accounts_receivable',
  'receivable_payments',
  'accounts_payable',
  'payable_payments',
  'cash_movements',
  'inventory_movements',
  'inventory_adjustments',
  'indirect_costs',
  'loans',
  'loan_payments',
  'quotes',
  'quote_items',
  'debts',
  'debt_installments',
  'debt_payments',
  'activity_log'
];

function safeFilename(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '');
}

export function tableColumns(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
}

export function createBackupObject() {
  const tables = {};
  for (const table of BACKUP_TABLES) {
    tables[table] = db.prepare(`SELECT * FROM ${table}`).all();
  }
  return {
    app: 'CementoControl',
    version: 1,
    exportedAt: new Date().toISOString(),
    timezone: 'America/Bogota',
    company: getConfig().business.name,
    tables
  };
}

export function backupFilename(prefix = 'respaldo') {
  const parts = nowBogotaParts();
  return `${prefix}-${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}.json`;
}

export function writeBackupFile({ prefix = 'respaldo' } = {}) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const filename = backupFilename(prefix);
  const target = path.join(BACKUP_DIR, filename);
  const payload = createBackupObject();
  fs.writeFileSync(target, JSON.stringify(payload, null, 2), 'utf8');
  pruneBackups();
  return { filename, path: target, size: fs.statSync(target).size, exportedAt: payload.exportedAt };
}

export function pruneBackups() {
  const retention = Number(getConfig().backup.retention) || 14;
  const cutoff = Date.now() - retention * 24 * 3600 * 1000;
  for (const entry of fs.readdirSync(BACKUP_DIR)) {
    const full = path.join(BACKUP_DIR, entry);
    if (!entry.endsWith('.json') || entry.startsWith('pre-restauracion')) continue;
    try {
      if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
    } catch {
      // A backup that cannot be inspected should not interrupt the app.
    }
  }
}

export function listBackups() {
  return fs.readdirSync(BACKUP_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, name));
      return {
        filename: name,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
        automatic: !name.startsWith('manual') && !name.startsWith('pre-restauracion'),
        url: `/api/export/backups/${encodeURIComponent(name)}`
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function readBackupFile(filename) {
  const safe = safeFilename(filename);
  if (!safe.endsWith('.json')) throw new ApiError(400, 'Archivo de respaldo no válido.');
  const target = path.join(BACKUP_DIR, safe);
  if (!target.startsWith(BACKUP_DIR) || !fs.existsSync(target)) throw new ApiError(404, 'El respaldo no existe.');
  return { path: target, filename: safe };
}

export function restoreBackupObject(payload) {
  if (!payload || payload.app !== 'CementoControl' || !payload.tables) {
    throw new ApiError(422, 'El archivo no es un respaldo válido de CementoControl.');
  }
  if (Number(payload.version) !== 1) {
    throw new ApiError(422, 'La versión del respaldo no es compatible con esta instalación.');
  }
  for (const table of ['users', 'settings', 'products', 'sales', 'purchases']) {
    if (!Array.isArray(payload.tables[table])) {
      throw new ApiError(422, `El respaldo está incompleto: falta la tabla ${table}.`);
    }
  }
  if (!payload.tables.users.some((user) => user.role === 'administrador' && Number(user.active) === 1)) {
    throw new ApiError(422, 'El respaldo no contiene un administrador activo.');
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  writeBackupFile({ prefix: 'pre-restauracion' });

  const deletes = [
    'sessions',
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
    'customers',
    'settings',
    'users'
  ];
  const counts = {};
  db.exec('PRAGMA foreign_keys = OFF;');
  try {
    db.exec('BEGIN IMMEDIATE;');
    for (const table of deletes) db.exec(`DELETE FROM ${table};`);
    for (const table of BACKUP_TABLES) {
      const rows = payload.tables[table];
      if (!Array.isArray(rows)) continue;
      const columns = tableColumns(table);
      let inserted = 0;
      for (const row of rows) {
        const keys = columns.filter((column) => Object.prototype.hasOwnProperty.call(row, column));
        if (!keys.length) continue;
        const placeholders = keys.map(() => '?').join(', ');
        const values = keys.map((key) => row[key] ?? null);
        db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`).run(...values);
        inserted += 1;
      }
      counts[table] = inserted;
    }
    db.exec('COMMIT;');
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch { /* ignore */ }
    throw new ApiError(422, `No se pudo restaurar el respaldo: ${error.message}`);
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
  db.prepare('DELETE FROM sessions').run();
  return { ok: true, counts, note: 'Las sesiones se cerraron. Inicia sesión con un usuario del respaldo.' };
}

let schedulerStarted = false;

export function startBackupScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;
  const tick = () => {
    try {
      const config = getConfig();
      if (!config.backup.enabled) return;
      const parts = nowBogotaParts();
      const hour = Number(parts.hour);
      if (hour < Number(config.backup.hour)) return;
      const todayPrefix = `${parts.year}${parts.month}${parts.day}`;
      const exists = fs.readdirSync(BACKUP_DIR).some((name) => name.startsWith('automatico-') && name.includes(todayPrefix));
      if (!exists) {
        const result = writeBackupFile({ prefix: 'automatico' });
        console.log(`Respaldo automático creado: ${result.filename}`);
      }
    } catch (error) {
      console.error('No se pudo crear el respaldo automático:', error.message);
    }
  };
  tick();
  const timer = setInterval(tick, 60 * 60 * 1000);
  timer.unref();
}

export function logBackup(user, action, details) {
  logActivity(user, action, 'respaldo', null, details);
}

export function backupStatus() {
  const config = getConfig();
  const backups = listBackups();
  return {
    enabled: config.backup.enabled,
    hour: config.backup.hour,
    retention: config.backup.retention,
    directory: 'data/backups',
    count: backups.length,
    latest: backups[0] || null,
    backups
  };
}

export function exportBackupJson() {
  const payload = createBackupObject();
  return {
    buffer: Buffer.from(JSON.stringify(payload, null, 2), 'utf8'),
    filename: `respaldo-completo-${todayBogota()}.json`,
    contentType: 'application/json; charset=utf-8'
  };
}
