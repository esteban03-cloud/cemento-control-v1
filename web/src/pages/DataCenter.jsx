import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowDownToLine,
  CheckCircle2,
  CloudDownload,
  Database,
  FileJson,
  FileSpreadsheet,
  FileText,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Upload,
  UploadCloud,
  XCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  PageHeader,
  TabBar,
  DataTable,
  ErrorPanel,
  StatusBadge,
  Spinner,
  Semaforo
} from '../components/DataDisplay.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';
import {
  classNames,
  formatDate,
  formatDateTime,
  formatFileSize
} from '../utils.js';

const EXPORTS = [
  { key: 'sales', label: 'Ventas', description: 'Facturas, cartera y condiciones de pago.', icon: FileSpreadsheet },
  { key: 'purchases', label: 'Compras', description: 'Costo landed, flete, descargue y saldos.', icon: FileSpreadsheet },
  { key: 'inventory', label: 'Inventario', description: 'Existencias, costo promedio, margen y EOQ.', icon: Archive },
  { key: 'cash', label: 'Caja y bancos', description: 'Movimientos de caja del período.', icon: FileSpreadsheet },
  { key: 'receivables', label: 'Cartera CxC', description: 'Facturas por cobrar y vencimientos.', icon: FileText },
  { key: 'payables', label: 'Cartera CxP', description: 'Obligaciones por proveedor y concepto.', icon: FileText },
  { key: 'costing', label: 'Costeo mensual', description: 'Costo por producto e indirectos asignados.', icon: FileSpreadsheet },
  { key: 'financial', label: 'Estados financieros', description: 'Resultados, balance y flujo de caja.', icon: FileText, formats: ['xlsx', 'pdf'] }
];

const IMPORT_ORDER = [
  ['customers', 'Clientes'],
  ['suppliers', 'Proveedores'],
  ['products', 'Productos'],
  ['purchases', 'Compras'],
  ['sales', 'Ventas']
];

export default function DataCenter() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'administrador';
  const [tab, setTab] = useState('export');
  const [backupStatus, setBackupStatus] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [busyDownload, setBusyDownload] = useState('');
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [importEntity, setImportEntity] = useState('customers');
  const [importFile, setImportFile] = useState(null);
  const [validation, setValidation] = useState(null);
  const [validating, setValidating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const restoreInputRef = useRef(null);
  const importInputRef = useRef(null);

  const tabs = [
    { key: 'export', label: 'Exportar reportes', icon: <ArrowDownToLine size={15} /> },
    ...(isAdmin ? [
      { key: 'import', label: 'Importar datos', icon: <Upload size={15} /> },
      { key: 'backup', label: 'Respaldos', icon: <Database size={15} /> }
    ] : [])
  ];

  const loadBackups = async () => {
    if (!isAdmin) return;
    setBackupLoading(true);
    try {
      setBackupStatus(await api.get('/backup/status'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBackupLoading(false);
    }
  };

  useEffect(() => { loadBackups(); }, [isAdmin]);

  useEffect(() => {
    setImportFile(null);
    setValidation(null);
    setImportError(null);
    if (importInputRef.current) importInputRef.current.value = '';
  }, [importEntity]);

  const download = async (path, key, filename) => {
    setBusyDownload(`${key}-${path}`);
    try {
      await api.download(path, filename);
      toast.success('Archivo generado correctamente.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyDownload('');
    }
  };

  const exportBackupJson = () => download('/export/backup.json', 'backup-json', 'respaldo-completo.json');
  const exportBackupExcel = () => download('/export/backup.xlsx', 'backup-excel', 'respaldo-completo.xlsx');

  const runBackup = async () => {
    try {
      const response = await api.post('/backup/run', {});
      toast.success(response.message || 'Respaldo creado.');
      loadBackups();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const restoreBackup = async () => {
    if (!restoreFile) return;
    setRestoring(true);
    try {
      const response = await api.upload('/backup/restore', restoreFile);
      toast.success(response.message || 'Respaldo restaurado.');
      setRestoreFile(null);
      setRestoreConfirmOpen(false);
      if (restoreInputRef.current) restoreInputRef.current.value = '';
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRestoring(false);
    }
  };

  const validateFile = async () => {
    if (!importFile) {
      toast.warning('Selecciona primero un archivo.');
      return;
    }
    setValidating(true);
    setValidation(null);
    setImportError(null);
    try {
      const response = await api.upload(`/import/${importEntity}/validate`, importFile);
      setValidation(response);
      if (response.valid) toast.success(`Archivo válido: ${response.rows.length} filas listas para importar.`);
      else toast.warning('La validación encontró errores. Revisa el detalle.');
    } catch (err) {
      setImportError(err);
      toast.error(err.message);
    } finally {
      setValidating(false);
    }
  };

  const executeImport = async () => {
    if (!validation?.valid || !importFile) return;
    setImporting(true);
    setImportError(null);
    try {
      const response = await api.upload(`/import/${importEntity}`, importFile);
      toast.success(response.message || 'Importación completada.');
      setValidation(null);
      setImportFile(null);
      if (importInputRef.current) importInputRef.current.value = '';
      if (isAdmin) loadBackups();
    } catch (err) {
      setImportError(err);
      toast.error(err.message);
    } finally {
      setImporting(false);
    }
  };

  const importErrors = useMemo(() => {
    if (importError?.details?.errors) return importError.details.errors;
    if (validation?.errors) return validation.errors;
    return [];
  }, [importError, validation]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Información y continuidad"
        title="Datos y respaldos"
        description="Exporta reportes, carga información masiva y protege la base de datos de la operación."
        actions={isAdmin && <button type="button" className="btn btn-secondary" onClick={exportBackupJson} disabled={busyDownload === 'backup-json'}><CloudDownload size={16} /> Descargar respaldo</button>}
      />

      <TabBar tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'export' && (
        <>
          <div className="data-intro panel">
            <div>
              <span className="eyebrow">Reportes operativos</span>
              <h2>Descarga la información que necesitas</h2>
              <p>Los archivos Excel conservan formato, filtros y totales. Los CSV son ideales para integrar con otros sistemas.</p>
            </div>
            <StatusBadge status="Zona horaria Colombia" tone="blue" dot={false} />
          </div>
          <div className="export-grid">
            {EXPORTS.map((entity) => {
              const Icon = entity.icon;
              const formats = entity.formats || ['xlsx', 'csv'];
              return (
                <article className="export-card" key={entity.key}>
                  <span className="export-icon"><Icon size={20} /></span>
                  <div>
                    <h3>{entity.label}</h3>
                    <p>{entity.description}</p>
                  </div>
                  <div className="export-actions">
                    {formats.includes('xlsx') && (
                      <button type="button" className="btn btn-small btn-secondary" onClick={() => download(`/export/${entity.key}?format=xlsx`, entity.key)} disabled={Boolean(busyDownload)}>
                        {busyDownload === `${entity.key}-/export/${entity.key}?format=xlsx` ? <Spinner size={13} /> : <FileSpreadsheet size={14} />} Excel
                      </button>
                    )}
                    {formats.includes('csv') && (
                      <button type="button" className="btn btn-small btn-ghost" onClick={() => download(`/export/${entity.key}?format=csv`, entity.key)} disabled={Boolean(busyDownload)}>
                        {busyDownload === `${entity.key}-/export/${entity.key}?format=csv` ? <Spinner size={13} /> : <FileText size={14} />} CSV
                      </button>
                    )}
                    {formats.includes('pdf') && (
                      <button type="button" className="btn btn-small btn-ghost" onClick={() => download(`/export/financial.pdf`, 'financial-pdf')} disabled={Boolean(busyDownload)}>
                        {busyDownload === 'financial-/export/financial.pdf' ? <Spinner size={13} /> : <FileText size={14} />} PDF
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {!isAdmin && <div className="footnote-box"><FileText size={15} /><span>La importación masiva y la restauración de respaldos están disponibles solo para administradores.</span></div>}
        </>
      )}

      {tab === 'import' && isAdmin && (
        <div className="import-layout">
          <div className="panel import-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">Carga masiva</span><h2>Importar información</h2><p>Valida el archivo antes de confirmar. No se escribe nada hasta que la validación sea correcta.</p></div>
              <StatusBadge status="Solo administradores" tone="blue" dot={false} />
            </div>
            <div className="import-entity-tabs">
              {IMPORT_ORDER.map(([key, label], index) => (
                <button type="button" key={key} className={classNames('import-entity', importEntity === key && 'active')} onClick={() => setImportEntity(key)}>
                  <span>{index + 1}</span>
                  {label}
                </button>
              ))}
            </div>
            <div className="import-instructions">
              <div>
                <strong>{IMPORT_ORDER.find(([key]) => key === importEntity)?.[1]}</strong>
                <span>Descarga la plantilla con los encabezados exactos, completa tus datos y cárgala en formato CSV o XLSX.</span>
              </div>
              <div className="import-template-actions">
                <button type="button" className="btn btn-small btn-secondary" onClick={() => download(`/export/template/${importEntity}?format=xlsx`, `template-${importEntity}`)}><FileSpreadsheet size={14} /> Plantilla Excel</button>
                <button type="button" className="btn btn-small btn-ghost" onClick={() => download(`/export/template/${importEntity}?format=csv`, `template-${importEntity}`)}><FileText size={14} /> Plantilla CSV</button>
              </div>
            </div>
            <label
              className={classNames('file-dropzone', importFile && 'has-file')}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files?.[0];
                if (file) { setImportFile(file); setValidation(null); setImportError(null); }
              }}
            >
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,.xlsx"
                onChange={(event) => { setImportFile(event.target.files?.[0] || null); setValidation(null); setImportError(null); }}
              />
              <span className="dropzone-icon">{importFile ? <CheckCircle2 size={22} /> : <UploadCloud size={23} />}</span>
              <strong>{importFile ? importFile.name : 'Arrastra tu archivo aquí o haz clic para seleccionar'}</strong>
              <span>{importFile ? formatFileSize(importFile.size) : 'Formatos aceptados: .csv o .xlsx. Máximo 12 MB.'}</span>
            </label>
            <div className="import-actions">
              <button type="button" className="btn btn-secondary" onClick={validateFile} disabled={!importFile || validating}>
                {validating ? <Loader2 size={16} className="spin" /> : <ShieldAlert size={16} />}
                {validating ? 'Validando…' : 'Validar archivo'}
              </button>
              {validation?.valid && (
                <button type="button" className="btn btn-primary" onClick={executeImport} disabled={importing}>
                  {importing ? <Loader2 size={16} className="spin" /> : <Upload size={16} />}
                  {importing ? 'Importando…' : `Importar ${validation.rows.length} filas`}
                </button>
              )}
            </div>

            {validation && (
              <div className={classNames('validation-summary', validation.valid ? 'valid' : 'invalid')}>
                <Semaforo tone={validation.valid ? 'green' : 'red'} label={validation.valid ? 'Archivo validado' : 'Errores de validación'} />
                <div className="validation-stats">
                  <span><strong>{validation.rows.length}</strong> filas</span>
                  <span><strong>{validation.counts.valid}</strong> válidas</span>
                  <span><strong>{validation.counts.invalid}</strong> con error</span>
                  {Object.entries(validation.counts.actions || {}).map(([action, count]) => <span key={action}>{count} por {action}</span>)}
                </div>
              </div>
            )}

            {importErrors.length > 0 && (
              <div className="import-error-list">
                <h4><XCircle size={16} /> Corrige estos puntos</h4>
                <ul>
                  {importErrors.slice(0, 30).map((error, index) => (
                    <li key={`${error.row}-${index}`}><span>Fila {error.row}</span>{error.message}</li>
                  ))}
                </ul>
                {importErrors.length > 30 && <p>Hay {importErrors.length - 30} errores adicionales.</p>}
              </div>
            )}

            {validation?.valid && (
              <div className="table-card import-preview">
                <div className="panel-heading compact"><div><span className="eyebrow">Vista previa</span><h3>{validation.rows.length} fila(s) listas</h3></div></div>
                <div className="table-scroll">
                  <table className="data-table data-table-compact">
                    <thead><tr><th>Fila</th><th>Acción</th><th>Datos normalizados</th></tr></thead>
                    <tbody>
                      {validation.preview.map((row) => (
                        <tr key={row.row}>
                          <td>{row.row}</td>
                          <td><StatusBadge status={row.valid ? row.action : 'Con error'} tone={row.valid ? 'green' : 'red'} dot={false} /></td>
                          <td><code className="preview-code">{JSON.stringify(row.data)}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <aside className="panel import-help-panel">
            <h3>Antes de importar</h3>
            <ol>
              <li><strong>Respeta el orden.</strong> Primero clientes, proveedores y productos; luego compras y ventas.</li>
              <li><strong>Usa las plantillas.</strong> Los encabezados y formatos deben coincidir.</li>
              <li><strong>Valida siempre.</strong> La previsualización te muestra las filas que se crearán o actualizarán.</li>
              <li><strong>Revisa las fechas.</strong> Usa AAAA-MM-DD o DD/MM/AAAA; el sistema las convierte a la zona de Colombia.</li>
              <li><strong>No edites el inventario directamente.</strong> Las compras y ventas generan sus movimientos contables.</li>
            </ol>
            <div className="inline-note-card"><ShieldAlert size={17} /><div><strong>Operación sensible</strong><span>La importación escribe datos en la base. Haz un respaldo antes de cargas grandes.</span></div></div>
          </aside>
        </div>
      )}

      {tab === 'backup' && isAdmin && (
        <div className="backup-layout">
          <div className="panel backup-main">
            <div className="panel-heading">
              <div><span className="eyebrow">Continuidad</span><h2>Respaldo de la base de datos</h2><p>Descarga una copia completa de la información y restáurala cuando la necesites.</p></div>
              <StatusBadge status={backupStatus?.enabled ? 'Respaldo automático activo' : 'Automático inactivo'} tone={backupStatus?.enabled ? 'green' : 'yellow'} />
            </div>
            <div className="backup-action-grid">
              <button type="button" className="backup-action" onClick={exportBackupJson}>
                <FileJson size={22} /><strong>Respaldo JSON</strong><span>Recomendado para restaurar.</span>
              </button>
              <button type="button" className="backup-action" onClick={exportBackupExcel}>
                <FileSpreadsheet size={22} /><strong>Respaldo Excel</strong><span>Ideal para revisar o auditar.</span>
              </button>
            </div>
            <div className="backup-actions-row">
              <button type="button" className="btn btn-primary" onClick={runBackup}><Archive size={16} /> Crear respaldo ahora</button>
              <button type="button" className="btn btn-secondary" onClick={loadBackups} disabled={backupLoading}><RefreshCw size={16} className={backupLoading ? 'spin' : ''} /> Actualizar lista</button>
              <span className="panel-meta">{backupStatus?.directory || 'data/backups'} · retención {backupStatus?.retention || 14} días</span>
            </div>
            <div className="panel-heading compact backup-list-heading"><div><span className="eyebrow">Historial</span><h3>Respaldos disponibles</h3></div></div>
            {backupLoading ? <div className="page-loader"><Spinner /></div> : (
              <div className="table-card">
                <div className="table-scroll">
                  <table className="data-table data-table-compact">
                    <thead><tr><th>Archivo</th><th>Creado</th><th className="align-right">Tamaño</th><th>Tipo</th><th /></tr></thead>
                    <tbody>
                      {(backupStatus?.backups || []).map((backup) => (
                        <tr key={backup.filename}>
                          <td><div className="table-primary-cell"><span className="invoice-code">{backup.filename}</span><small>Copia de seguridad</small></div></td>
                          <td>{formatDateTime(backup.createdAt)}</td>
                          <td className="align-right">{formatFileSize(backup.size)}</td>
                          <td><StatusBadge status={backup.automatic ? 'Automático' : 'Manual'} tone={backup.automatic ? 'blue' : 'neutral'} dot={false} /></td>
                          <td className="align-right"><button type="button" className="btn btn-small btn-ghost" onClick={() => download(`/export/backups/${encodeURIComponent(backup.filename)}`, backup.filename, backup.filename)}><DownloadIcon /> Descargar</button></td>
                        </tr>
                      ))}
                      {!(backupStatus?.backups || []).length && <tr><td colSpan={5} className="table-empty-cell">Aún no hay respaldos guardados.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          <aside className="panel restore-panel">
            <span className="restore-icon"><Upload size={24} /></span>
            <h3>Restaurar un respaldo</h3>
            <p>Reemplaza toda la base actual con el contenido de un archivo JSON exportado por CementoControl. Antes de restaurar se crea una copia de seguridad automática.</p>
            <label className="file-dropzone compact">
              <input ref={restoreInputRef} type="file" accept=".json" onChange={(event) => setRestoreFile(event.target.files?.[0] || null)} />
              <span className="dropzone-icon">{restoreFile ? <FileJson size={20} /> : <UploadCloud size={21} />}</span>
              <strong>{restoreFile ? restoreFile.name : 'Selecciona el archivo JSON'}</strong>
              <span>{restoreFile ? formatFileSize(restoreFile.size) : 'Máximo 30 MB'}</span>
            </label>
            <button type="button" className="btn btn-danger full-width" disabled={!restoreFile || restoring} onClick={() => setRestoreConfirmOpen(true)}>
              <Upload size={16} /> Restaurar respaldo
            </button>
            <div className="danger-warning">
              <ShieldAlert size={17} />
              <span>La restauración reemplaza clientes, productos, ventas, compras, caja y usuarios. Se cerrará la sesión al finalizar.</span>
            </div>
            <div className="backup-next">
              <strong>Recomendaciones</strong>
              <ul>
                <li>Descarga un respaldo JSON antes de restaurar.</li>
                <li>Verifica el tamaño y fecha del archivo.</li>
                <li>La restauración no se puede deshacer desde la interfaz.</li>
              </ul>
            </div>
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={restoreConfirmOpen}
        onClose={() => setRestoreConfirmOpen(false)}
        onConfirm={restoreBackup}
        busy={restoring}
        title="Restaurar respaldo completo"
        message={`¿Restaurar el archivo "${restoreFile?.name}"? Toda la información actual será reemplazada y se cerrará tu sesión.`}
        confirmLabel="Sí, restaurar"
      />
    </div>
  );
}

function DownloadIcon() {
  return <ArrowDownToLine size={14} />;
}
