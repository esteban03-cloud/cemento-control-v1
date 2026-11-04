import { Router } from 'express';
import multer from 'multer';
import { db, logActivity } from '../db.js';
import { getConfig } from '../config.js';
import { requireAdmin, requireAuth, requirePermission } from '../auth.js';
import { ApiError, asyncRoute } from '../lib/http.js';
import { isValidMonth, monthLabel, monthOf, todayBogota } from '../lib/dates.js';
import { requirePermission as _rp } from '../auth.js';
import {
  buildFinancialPdf,
  buildWorkbookBuffer,
  csvFromRows,
  getExportDataset,
  sendCsvExport,
  sendExcelExport
} from '../services/reports.js';
import {
  BACKUP_TABLES,
  backupStatus,
  exportBackupJson,
  listBackups,
  readBackupFile,
  restoreBackupObject,
  writeBackupFile
} from '../services/backup.js';
import {
  createTemplateBuffer,
  getTemplate,
  IMPORT_ENTITIES,
  runImport,
  validateImport
} from '../services/importer.js';

const router = Router();
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!/\.(csv|xlsx|xlsm)$/i.test(file.originalname || '')) {
      return callback(new ApiError(422, 'El archivo debe ser .csv o .xlsx.'));
    }
    callback(null, true);
  }
});
const backupUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (!/\.json$/i.test(file.originalname || '')) {
      return callback(new ApiError(422, 'El respaldo debe ser un archivo .json.'));
    }
    callback(null, true);
  }
});

router.use(requireAuth);

/* ───────────────────────────── Exportaciones ───────────────────────────── */

router.get('/export/backup.json', requireAdmin, asyncRoute(async (req, res) => {
  const backup = exportBackupJson();
  logActivity(req.user, 'exportar', 'respaldo', null, 'Respaldo JSON completo');
  res.setHeader('Content-Type', backup.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(backup.buffer);
}));

router.get('/export/backup.xlsx', requireAdmin, asyncRoute(async (req, res) => {
  const company = getConfig().business;
  const sheets = BACKUP_TABLES.map((table) => {
    const rows = db.prepare(`SELECT * FROM ${table}`).all();
    const headers = rows.length ? Object.keys(rows[0]) : db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
    return {
      name: table,
      columns: headers.map((header) => ({ header, key: header, width: Math.max(14, Math.min(28, header.length + 4)) })),
      rows
    };
  });
  const buffer = await buildWorkbookBuffer({
    title: 'Respaldo completo de datos',
    company,
    sheets,
    meta: [
      ['Generado', new Date().toISOString()],
      ['Uso', 'Respaldo técnico. Para restaurar usa el archivo JSON.'],
      ['Tablas', String(BACKUP_TABLES.length)]
    ]
  });
  logActivity(req.user, 'exportar', 'respaldo', null, 'Respaldo Excel completo');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="respaldo-completo-${todayBogota()}.xlsx"`);
  res.send(buffer);
}));

router.get('/export/template/:entity', requirePermission('reportes:export'), asyncRoute(async (req, res) => {
  const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
  getTemplate(req.params.entity);
  const template = await createTemplateBuffer(req.params.entity, format);
  res.setHeader('Content-Type', template.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${template.filename}"`);
  res.send(template.buffer);
}));

router.get('/export/financial.pdf', requirePermission('reportes:export'), asyncRoute(async (req, res) => {
  const month = isValidMonth(req.query.month) ? req.query.month : monthOf(todayBogota());
  const buffer = await buildFinancialPdf(month);
  logActivity(req.user, 'exportar', 'estados financieros', month, 'PDF de estados financieros');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="estados-financieros-${month}.pdf"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
}));

router.get('/export/backups/:filename', requireAdmin, asyncRoute(async (req, res) => {
  const file = readBackupFile(req.params.filename);
  res.download(file.path, file.filename);
}));

router.get('/export/:entity', requirePermission('reportes:export'), asyncRoute(async (req, res) => {
  const dataset = getExportDataset(req.params.entity, req.query);
  const format = req.query.format === 'csv' ? 'csv' : 'xlsx';
  if (format === 'csv') {
    sendCsvExport(res, dataset);
    return;
  }
  await sendExcelExport(res, dataset, [
    ['Filtros', `Desde ${req.query.from || 'inicio'} · Hasta ${req.query.to || todayBogota()}`]
  ]);
  logActivity(req.user, 'exportar', req.params.entity, null, `Reporte ${format.toUpperCase()}`);
}));

/* ───────────────────────────── Respaldos ───────────────────────────── */

router.get('/backup/status', requireAdmin, asyncRoute(async (req, res) => {
  res.json(backupStatus());
}));

router.post('/backup/run', requireAdmin, asyncRoute(async (req, res) => {
  const result = writeBackupFile({ prefix: 'manual' });
  logActivity(req.user, 'crear', 'respaldo', null, result.filename);
  res.status(201).json({
    data: result,
    message: 'Respaldo manual creado correctamente en data/backups.'
  });
}));

router.post('/backup/restore', requireAdmin, backupUpload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) throw new ApiError(422, 'Selecciona un archivo de respaldo JSON.');
  let payload;
  try {
    payload = JSON.parse(req.file.buffer.toString('utf8'));
  } catch {
    throw new ApiError(422, 'El archivo no contiene un JSON válido.');
  }
  const result = restoreBackupObject(payload);
  res.setHeader('Set-Cookie', 'cc_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({
    ...result,
    message: 'Respaldo restaurado correctamente. Vuelve a iniciar sesión con los usuarios del respaldo.'
  });
}));

/* ───────────────────────────── Importaciones ───────────────────────────── */

router.get('/import/catalog', requireAdmin, asyncRoute(async (req, res) => {
  res.json({
    entities: IMPORT_ENTITIES.map((entity) => ({
      key: entity,
      label: getTemplate(entity).label,
      headers: getTemplate(entity).headers,
      templateCsv: `/api/export/template/${entity}?format=csv`,
      templateXlsx: `/api/export/template/${entity}?format=xlsx`
    }))
  });
}));

router.post('/import/:entity/validate', requireAdmin, importUpload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) throw new ApiError(422, 'Selecciona un archivo para validar.');
  const result = await validateImport(req.params.entity, req.file.buffer, req.file.originalname);
  res.json({
    valid: result.errors.length === 0,
    ...result
  });
}));

router.post('/import/:entity', requireAdmin, importUpload.single('file'), asyncRoute(async (req, res) => {
  if (!req.file) throw new ApiError(422, 'Selecciona un archivo para importar.');
  const result = await runImport(req.params.entity, req.file.buffer, req.file.originalname, req.user);
  res.status(201).json({
    data: result,
    message: `Importación completada: ${result.imported} fila(s) procesada(s).`
  });
}));

export default router;
