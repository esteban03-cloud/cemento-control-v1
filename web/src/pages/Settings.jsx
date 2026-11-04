import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Archive,
  Building2,
  Check,
  Clock3,
  Database,
  Gauge,
  ImagePlus,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
  UsersRound
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  PageHeader,
  TabBar,
  DataTable,
  StatusBadge,
  Semaforo,
  SummaryTile,
  ErrorPanel,
  PageLoader,
  IconButton,
  Avatar,
  DownloadMenu
} from '../components/DataDisplay.jsx';
import { Modal, ConfirmDialog } from '../components/Modal.jsx';
import { Field, TextInput, Select, Textarea, Checkbox, MoneyInput, InlineNotice, Segmented } from '../components/Forms.jsx';
import { CompanyLogo } from '../components/Brand.jsx';
import {
  classNames,
  formatCurrency,
  formatDateTime,
  formatFileSize,
  formatNumber,
  formatPercent,
  roleLabel
} from '../utils.js';

const TABS = [
  { key: 'business', label: 'Empresa', icon: <Building2 size={15} /> },
  { key: 'operation', label: 'Operación e impuestos', icon: <SlidersHorizontal size={15} /> },
  { key: 'thresholds', label: 'Semáforos', icon: <Gauge size={15} /> },
  { key: 'partners', label: 'Terceros', icon: <UsersRound size={15} /> },
  { key: 'users', label: 'Usuarios', icon: <KeyRound size={15} /> },
  { key: 'backup', label: 'Respaldo', icon: <Database size={15} /> }
];

export default function Settings() {
  const { refresh, user } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('business');
  const [config, setConfig] = useState(null);
  const [forms, setForms] = useState(null);
  const [saving, setSaving] = useState(false);
  const [partners, setPartners] = useState(null);
  const [partnerType, setPartnerType] = useState('customers');
  const [partnerSearch, setPartnerSearch] = useState('');
  const [partnerModal, setPartnerModal] = useState(null);
  const [partnerDelete, setPartnerDelete] = useState(null);
  const [deletingPartner, setDeletingPartner] = useState(false);
  const [users, setUsers] = useState(null);
  const [userModal, setUserModal] = useState(null);
  const [backupStatus, setBackupStatus] = useState(null);

  const hydrate = (nextConfig) => {
    setConfig(nextConfig);
    setForms({
      business: {
        name: nextConfig.business.name || '',
        shortName: nextConfig.business.shortName || '',
        nit: nextConfig.business.nit || '',
        address: nextConfig.business.address || '',
        city: nextConfig.business.city || '',
        phone: nextConfig.business.phone || '',
        email: nextConfig.business.email || '',
        logo: nextConfig.business.logo || ''
      },
      operation: {
        cash: String(nextConfig.openingBalances.cash ?? ''),
        bank: String(nextConfig.openingBalances.bank ?? ''),
        capital: String(nextConfig.openingBalances.capital ?? ''),
        gmfPct: String((Number(nextConfig.fiscal.gmfRate) * 100).toFixed(3)),
        ivaEnabled: Boolean(nextConfig.fiscal.ivaEnabled),
        ivaPct: String((Number(nextConfig.fiscal.ivaRate) * 100).toFixed(2)),
        salePrefix: nextConfig.sequences.salePrefix,
        purchasePrefix: nextConfig.sequences.purchasePrefix,
        defaultOrderingCost: String(nextConfig.inventory.defaultOrderingCost),
        defaultHoldingPct: String((Number(nextConfig.inventory.defaultHoldingRate) * 100).toFixed(2))
      },
      thresholds: Object.fromEntries(Object.entries(nextConfig.thresholds).map(([key, value]) => [key, String(value)])),
      backup: {
        enabled: Boolean(nextConfig.backup.enabled),
        hour: String(nextConfig.backup.hour),
        retention: String(nextConfig.backup.retention)
      }
    });
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsResponse, partnerResponse, userResponse, backupResponse] = await Promise.all([
        api.get('/settings'),
        api.get('/partners'),
        api.get('/users'),
        api.get('/backup/status')
      ]);
      hydrate(settingsResponse.config);
      setPartners(partnerResponse);
      setUsers(userResponse.data);
      setBackupStatus(backupResponse);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const savePatch = async (patch, message = 'Configuración guardada correctamente.') => {
    setSaving(true);
    try {
      const response = await api.put('/settings', patch);
      hydrate(response.config);
      toast.success(message);
      await refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const saveBusiness = () => {
    if (!forms.business.name.trim()) {
      toast.warning('El nombre de la empresa es obligatorio.');
      return;
    }
    savePatch({ business: forms.business }, 'Datos de la empresa actualizados.');
  };

  const saveOperation = () => {
    savePatch({
      openingBalances: {
        cash: Number(forms.operation.cash) || 0,
        bank: Number(forms.operation.bank) || 0,
        capital: Number(forms.operation.capital) || 0
      },
      fiscal: {
        gmfRate: (Number(forms.operation.gmfPct) || 0) / 100,
        ivaEnabled: forms.operation.ivaEnabled,
        ivaRate: (Number(forms.operation.ivaPct) || 0) / 100
      },
      sequences: {
        salePrefix: forms.operation.salePrefix,
        purchasePrefix: forms.operation.purchasePrefix
      },
      inventory: {
        defaultOrderingCost: Number(forms.operation.defaultOrderingCost) || 120000,
        defaultHoldingRate: (Number(forms.operation.defaultHoldingPct) || 0) / 100
      }
    }, 'Parámetros de operación e impuestos guardados.');
  };

  const saveThresholds = () => {
    const values = Object.fromEntries(Object.entries(forms.thresholds).map(([key, value]) => [key, Number(value) || 0]));
    savePatch({ thresholds: values }, 'Umbrales de semáforos actualizados.');
  };

  const saveBackup = async () => {
    await savePatch({
      backup: {
        enabled: forms.backup.enabled,
        hour: Number(forms.backup.hour) || 0,
        retention: Number(forms.backup.retention) || 14
      }
    }, 'Configuración de respaldo guardada.');
    loadBackupStatus();
  };

  const onLogoFile = (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) {
      toast.warning('Usa una imagen PNG, JPG, WEBP o SVG.');
      return;
    }
    if (file.size > 900_000) {
      toast.warning('El logo debe pesar menos de 900 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForms((current) => ({ ...current, business: { ...current.business, logo: String(reader.result) } }));
    reader.readAsDataURL(file);
  };

  const loadPartners = async () => {
    const response = await api.get('/partners');
    setPartners(response);
  };

  const deletePartner = async () => {
    if (!partnerDelete) return;
    setDeletingPartner(true);
    try {
      await api.delete(`/partners/${partnerDelete.type}/${partnerDelete.record.id}`);
      toast.success('Tercero eliminado.');
      setPartnerDelete(null);
      loadPartners();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeletingPartner(false);
    }
  };

  const loadUsers = async () => {
    const response = await api.get('/users');
    setUsers(response.data);
  };

  const loadBackupStatus = async () => {
    try {
      setBackupStatus(await api.get('/backup/status'));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const filteredPartners = useMemo(() => {
    const list = partners?.[partnerType] || [];
    if (!partnerSearch.trim()) return list;
    const term = partnerSearch.toLowerCase();
    return list.filter((row) => `${row.name} ${row.nit || ''} ${row.phone || ''}`.toLowerCase().includes(term));
  }, [partners, partnerType, partnerSearch]);

  if (loading) return <div className="page"><PageLoader label="Cargando configuración…" /></div>;
  if (error || !forms) return <div className="page"><ErrorPanel error={error} onRetry={load} /></div>;

  const partnerColumns = [
    {
      key: 'name',
      label: 'Nombre',
      render: (row) => (
        <div className="person-cell">
          <Avatar name={row.name} size={30} tone={row.id} />
          <div><strong className="table-primary">{row.name}</strong><small>{partnerType === 'couriers' ? 'Cotero' : row.nit || 'Sin NIT'}</small></div>
        </div>
      )
    },
    { key: 'phone', label: 'Teléfono', render: (row) => row.phone || '—' },
    ...(partnerType !== 'couriers' ? [{ key: 'address', label: 'Dirección', render: (row) => row.address || '—' }] : []),
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        <div className="row-actions">
          <IconButton label="Editar" icon={Pencil} onClick={() => setPartnerModal({ type: partnerType, record: row })} />
          <IconButton label="Eliminar" icon={Trash2} variant="danger" onClick={() => setPartnerDelete({ type: partnerType, record: row })} />
        </div>
      )
    }
  ];

  const userColumns = [
    {
      key: 'name',
      label: 'Usuario',
      render: (row) => (
        <div className="person-cell">
          <Avatar name={row.full_name} size={30} tone={row.id + 2} />
          <div><strong className="table-primary">{row.full_name}</strong><small>@{row.username}</small></div>
        </div>
      )
    },
    { key: 'role', label: 'Rol', render: (row) => <StatusBadge status={roleLabel(row.role)} tone="blue" dot={false} /> },
    { key: 'active', label: 'Estado', render: (row) => <Semaforo tone={row.active ? 'green' : 'neutral'} label={row.active ? 'Activo' : 'Inactivo'} /> },
    { key: 'created_at', label: 'Creado', render: (row) => formatDateTime(row.created_at) },
    { key: 'actions', label: '', align: 'right', render: (row) => <IconButton label="Editar usuario" icon={Pencil} onClick={() => setUserModal({ record: row })} /> }
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Administración"
        title="Configuración"
        description="Datos comerciales, impuestos, umbrales, usuarios y continuidad de la operación."
        actions={<StatusBadge status="Acceso administrador" tone="blue" dot={false} />}
      />

      <div className="settings-shell">
        <aside className="settings-tabs">
          {TABS.map((item) => (
            <button type="button" key={item.key} className={classNames('settings-tab', tab === item.key && 'active')} onClick={() => setTab(item.key)}>
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </aside>
        <div className="settings-content">
          {tab === 'business' && (
            <div className="panel settings-panel">
              <div className="settings-header">
                <div><span className="eyebrow">Identidad</span><h2>Datos comerciales</h2><p>Esta información aparece en los documentos PDF, reportes y la pantalla de acceso.</p></div>
                <button type="button" className="btn btn-primary" onClick={saveBusiness} disabled={saving}><Save size={16} /> {saving ? 'Guardando…' : 'Guardar cambios'}</button>
              </div>
              <div className="logo-settings">
                <div className="logo-preview"><CompanyLogo business={{ ...config.business, logo: forms.business.logo }} size={64} /></div>
                <div>
                  <strong>Logo de la empresa</strong>
                  <p>PNG, JPG, WEBP o SVG. Máximo 900 KB. Se muestra en los documentos exportados.</p>
                  <div className="logo-actions">
                    <label className="btn btn-small btn-secondary"><ImagePlus size={14} /> Subir logo<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => onLogoFile(event.target.files?.[0])} hidden /></label>
                    {forms.business.logo && <button type="button" className="btn btn-small btn-ghost danger-text" onClick={() => setForms({ ...forms, business: { ...forms.business, logo: '' } })}>Quitar</button>}
                  </div>
                </div>
              </div>
              <div className="form-grid cols-2">
                <Field label="Razón social" required><TextInput value={forms.business.name} onChange={(event) => setForms({ ...forms, business: { ...forms.business, name: event.target.value } })} /></Field>
                <Field label="Nombre comercial"><TextInput value={forms.business.shortName} onChange={(event) => setForms({ ...forms, business: { ...forms.business, shortName: event.target.value } })} /></Field>
                <Field label="NIT"><TextInput value={forms.business.nit} onChange={(event) => setForms({ ...forms, business: { ...forms.business, nit: event.target.value } })} /></Field>
                <Field label="Ciudad"><TextInput value={forms.business.city} onChange={(event) => setForms({ ...forms, business: { ...forms.business, city: event.target.value } })} /></Field>
                <Field label="Dirección" className="span-2"><TextInput value={forms.business.address} onChange={(event) => setForms({ ...forms, business: { ...forms.business, address: event.target.value } })} /></Field>
                <Field label="Teléfono"><TextInput value={forms.business.phone} onChange={(event) => setForms({ ...forms, business: { ...forms.business, phone: event.target.value } })} /></Field>
                <Field label="Correo electrónico"><TextInput type="email" value={forms.business.email} onChange={(event) => setForms({ ...forms, business: { ...forms.business, email: event.target.value } })} /></Field>
              </div>
            </div>
          )}

          {tab === 'operation' && (
            <div className="settings-panels">
              <div className="panel settings-panel">
                <div className="settings-header">
                  <div><span className="eyebrow">Parámetros</span><h2>Operación, impuestos y numeración</h2><p>Los cambios de saldos iniciales afectan la disponibilidad y el balance general.</p></div>
                  <button type="button" className="btn btn-primary" onClick={saveOperation} disabled={saving}><Save size={16} /> {saving ? 'Guardando…' : 'Guardar cambios'}</button>
                </div>
                <h3 className="settings-subtitle">Saldos iniciales</h3>
                <div className="form-grid cols-3">
                  <Field label="Caja inicial"><MoneyInput value={forms.operation.cash} onChange={(event) => setForms({ ...forms, operation: { ...forms.operation, cash: event.target.value } })} /></Field>
                  <Field label="Bancos inicial"><MoneyInput value={forms.operation.bank} onChange={(event) => setForms({ ...forms, operation: { ...forms.operation, bank: event.target.value } })} /></Field>
                  <Field label="Capital aportado" hint="Se usa como capital base del balance."><MoneyInput value={forms.operation.capital} onChange={(event) => setForms({ ...forms, operation: { ...forms.operation, capital: event.target.value } })} /></Field>
                </div>
                <h3 className="settings-subtitle">Impuestos y numeración</h3>
                <div className="form-grid cols-2">
                  <Field label="4x1000 (%)" hint="Ejemplo: 0.4 equivale a 0,4%."><TextInput type="number" step="0.001" min="0" value={forms.operation.gmfPct} onChange={(event) => setForms({ ...forms, operation: { ...forms.operation, gmfPct: event.target.value } })} /></Field>
                  <Field label="IVA (%)" hint={forms.operation.ivaEnabled ? 'Activo para configuraciones tributarias.' : 'Desactivado: la operación no aplica IVA en este momento.'}><TextInput type="number" step="0.01" min="0" value={forms.operation.ivaPct} onChange={(event) => setForms({ ...forms, operation: { ...forms.operation, ivaPct: event.target.value } })} /></Field>
                  <Field label="Prefijo factura de venta"><TextInput value={forms.operation.salePrefix} onChange={(event) => setForms({ ...forms, operation: { ...forms.operation, salePrefix: event.target.value.toUpperCase() } })} /></Field>
                  <Field label="Prefijo compra"><TextInput value={forms.operation.purchasePrefix} onChange={(event) => setForms({ ...forms, operation: { ...forms.operation, purchasePrefix: event.target.value.toUpperCase() } })} /></Field>
                </div>
                <Checkbox label="Habilitar IVA" description="Si se activa, queda disponible para futuras facturas y configuraciones tributarias." checked={forms.operation.ivaEnabled} onChange={(value) => setForms({ ...forms, operation: { ...forms.operation, ivaEnabled: value } })} />
                <h3 className="settings-subtitle">Parámetros de inventario</h3>
                <div className="form-grid cols-2">
                  <Field label="Costo por pedido por defecto"><MoneyInput value={forms.operation.defaultOrderingCost} onChange={(event) => setForms({ ...forms, operation: { ...forms.operation, defaultOrderingCost: event.target.value } })} /></Field>
                  <Field label="Tasa de mantenimiento (%)" hint="Costo anual de mantener una unidad en bodega."><TextInput type="number" step="0.1" min="0" value={forms.operation.defaultHoldingPct} onChange={(event) => setForms({ ...forms, operation: { ...forms.operation, defaultHoldingPct: event.target.value } })} /></Field>
                </div>
                <InlineNotice tone="warning">Cambiar los saldos iniciales modifica el disponible actual y la conciliación del balance. Hazlo solo con el cierre contable a mano.</InlineNotice>
              </div>
            </div>
          )}

          {tab === 'thresholds' && (
            <div className="panel settings-panel">
              <div className="settings-header">
                <div><span className="eyebrow">Alertas</span><h2>Umbrales de los semáforos</h2><p>Ajusta los límites que definen verde, amarillo y rojo en el dashboard y las alertas.</p></div>
                <button type="button" className="btn btn-primary" onClick={saveThresholds} disabled={saving}><Save size={16} /> {saving ? 'Guardando…' : 'Guardar umbrales'}</button>
              </div>
              <div className="threshold-grid">
                <ThresholdGroup title="Crecimiento de ventas" description="Porcentaje de crecimiento contra el período anterior.">
                  <Field label="Verde desde (%)"><TextInput type="number" step="0.1" value={forms.thresholds.salesGrowthGreen} onChange={(event) => setForms({ ...forms, thresholds: { ...forms.thresholds, salesGrowthGreen: event.target.value } })} /></Field>
                  <Field label="Amarillo desde (%)"><TextInput type="number" step="0.1" value={forms.thresholds.salesGrowthYellow} onChange={(event) => setForms({ ...forms, thresholds: { ...forms.thresholds, salesGrowthYellow: event.target.value } })} /></Field>
                </ThresholdGroup>
                <ThresholdGroup title="Margen por producto" description="Margen bruto sobre el precio de venta.">
                  <Field label="Verde desde (%)"><TextInput type="number" step="0.1" value={forms.thresholds.marginGreen} onChange={(event) => setForms({ ...forms, thresholds: { ...forms.thresholds, marginGreen: event.target.value } })} /></Field>
                  <Field label="Amarillo desde (%)"><TextInput type="number" step="0.1" value={forms.thresholds.marginYellow} onChange={(event) => setForms({ ...forms, thresholds: { ...forms.thresholds, marginYellow: event.target.value } })} /></Field>
                </ThresholdGroup>
                <ThresholdGroup title="Cobertura de caja" description="Días de gastos cubiertos con efectivo y bancos.">
                  <Field label="Verde desde (días)"><TextInput type="number" value={forms.thresholds.cashCoverageGreen} onChange={(event) => setForms({ ...forms, thresholds: { ...forms.thresholds, cashCoverageGreen: event.target.value } })} /></Field>
                  <Field label="Amarillo desde (días)"><TextInput type="number" value={forms.thresholds.cashCoverageYellow} onChange={(event) => setForms({ ...forms, thresholds: { ...forms.thresholds, cashCoverageYellow: event.target.value } })} /></Field>
                </ThresholdGroup>
                <ThresholdGroup title="Días de caja" description="Indicador específico de días de caja.">
                  <Field label="Verde desde (días)"><TextInput type="number" value={forms.thresholds.cashDaysGreen} onChange={(event) => setForms({ ...forms, thresholds: { ...forms.thresholds, cashDaysGreen: event.target.value } })} /></Field>
                  <Field label="Amarillo desde (días)"><TextInput type="number" value={forms.thresholds.cashDaysYellow} onChange={(event) => setForms({ ...forms, thresholds: { ...forms.thresholds, cashDaysYellow: event.target.value } })} /></Field>
                </ThresholdGroup>
                <ThresholdGroup title="Cartera vencida" description="Porcentaje de la cartera vencida sobre las ventas.">
                  <Field label="Verde hasta (%)"><TextInput type="number" step="0.1" value={forms.thresholds.receivablesGreen} onChange={(event) => setForms({ ...forms, thresholds: { ...forms.thresholds, receivablesGreen: event.target.value } })} /></Field>
                  <Field label="Amarillo hasta (%)"><TextInput type="number" step="0.1" value={forms.thresholds.receivablesYellow} onChange={(event) => setForms({ ...forms, thresholds: { ...forms.thresholds, receivablesYellow: event.target.value } })} /></Field>
                </ThresholdGroup>
                <ThresholdGroup title="Rentabilidad neta" description="Utilidad neta sobre ventas.">
                  <Field label="Verde desde (%)"><TextInput type="number" step="0.1" value={forms.thresholds.profitabilityGreen} onChange={(event) => setForms({ ...forms, thresholds: { ...forms.thresholds, profitabilityGreen: event.target.value } })} /></Field>
                  <Field label="Amarillo desde (%)"><TextInput type="number" step="0.1" value={forms.thresholds.profitabilityYellow} onChange={(event) => setForms({ ...forms, thresholds: { ...forms.thresholds, profitabilityYellow: event.target.value } })} /></Field>
                </ThresholdGroup>
                <ThresholdGroup title="Participación del material" description="Peso del material dentro del costo total.">
                  <Field label="Verde debajo de (%)"><TextInput type="number" step="0.1" value={forms.thresholds.materialGreen} onChange={(event) => setForms({ ...forms, thresholds: { ...forms.thresholds, materialGreen: event.target.value } })} /></Field>
                  <Field label="Rojo por encima de (%)"><TextInput type="number" step="0.1" value={forms.thresholds.materialRed} onChange={(event) => setForms({ ...forms, thresholds: { ...forms.thresholds, materialRed: event.target.value } })} /></Field>
                </ThresholdGroup>
                <ThresholdGroup title="Concentración de clientes" description="Participación del mayor cliente en ventas.">
                  <Field label="Verde hasta (%)"><TextInput type="number" step="0.1" value={forms.thresholds.customerGreen} onChange={(event) => setForms({ ...forms, thresholds: { ...forms.thresholds, customerGreen: event.target.value } })} /></Field>
                  <Field label="Rojo por encima de (%)"><TextInput type="number" step="0.1" value={forms.thresholds.customerRed} onChange={(event) => setForms({ ...forms, thresholds: { ...forms.thresholds, customerRed: event.target.value } })} /></Field>
                </ThresholdGroup>
                <ThresholdGroup title="Cobertura del inventario" description="Meses de venta cubiertos por inventario.">
                  <Field label="Verde debajo de (meses)"><TextInput type="number" step="0.1" value={forms.thresholds.inventoryGreenMonths} onChange={(event) => setForms({ ...forms, thresholds: { ...forms.thresholds, inventoryGreenMonths: event.target.value } })} /></Field>
                  <Field label="Rojo por encima de (meses)"><TextInput type="number" step="0.1" value={forms.thresholds.inventoryRedMonths} onChange={(event) => setForms({ ...forms, thresholds: { ...forms.thresholds, inventoryRedMonths: event.target.value } })} /></Field>
                </ThresholdGroup>
              </div>
            </div>
          )}

          {tab === 'partners' && partners && (
            <div className="panel settings-panel">
              <div className="settings-header">
                <div><span className="eyebrow">Directorio</span><h2>Terceros</h2><p>Clientes, proveedores y coteros disponibles en los formularios de operación.</p></div>
                <button type="button" className="btn btn-primary" onClick={() => setPartnerModal({ type: partnerType, record: null })}><Plus size={16} /> Nuevo {partnerType === 'customers' ? 'cliente' : partnerType === 'suppliers' ? 'proveedor' : 'cotero'}</button>
              </div>
              <div className="filter-bar compact">
                <div className="segmented">
                  {[['customers', 'Clientes'], ['suppliers', 'Proveedores'], ['couriers', 'Coteros']].map(([key, label]) => (
                    <button type="button" key={key} className={classNames('segmented-option', partnerType === key && 'active')} onClick={() => setPartnerType(key)}>{label}</button>
                  ))}
                </div>
                <div className="search-box"><input value={partnerSearch} onChange={(event) => setPartnerSearch(event.target.value)} placeholder="Buscar tercero…" aria-label="Buscar tercero" /></div>
              </div>
              <DataTable
                columns={partnerColumns}
                rows={filteredPartners}
                compact
                emptyTitle="No hay terceros"
                emptyDescription="Agrega el primer registro de este directorio."
              />
            </div>
          )}

          {tab === 'users' && users && (
            <div className="panel settings-panel">
              <div className="settings-header">
                <div><span className="eyebrow">Equipo</span><h2>Usuarios y roles</h2><p>Administra quién puede vender, cobrar, revisar finanzas o configurar el sistema.</p></div>
                <button type="button" className="btn btn-primary" onClick={() => setUserModal({ record: null })}><Plus size={16} /> Nuevo usuario</button>
              </div>
              <DataTable columns={userColumns} rows={users} compact emptyTitle="Sin usuarios" emptyDescription="Crea el primer usuario del sistema." />
              <div className="role-explainer">
                <div><strong>Administrador</strong><span>Acceso total, configuración y respaldos.</span></div>
                <div><strong>Vendedor</strong><span>Ventas, CxC, clientes e inventario de consulta.</span></div>
                <div><strong>Contador</strong><span>Compras, caja, cartera, costos y reportes.</span></div>
              </div>
            </div>
          )}

          {tab === 'backup' && (
            <div className="settings-panels">
              <div className="panel settings-panel">
                <div className="settings-header">
                  <div><span className="eyebrow">Continuidad</span><h2>Respaldo automático</h2><p>El sistema guarda una copia diaria en <code>data/backups</code> cuando la hora configurada ya pasó.</p></div>
                  <button type="button" className="btn btn-primary" onClick={saveBackup} disabled={saving}><Save size={16} /> {saving ? 'Guardando…' : 'Guardar respaldo'}</button>
                </div>
                <div className="form-grid cols-2">
                  <Field label="Hora del respaldo (0–23)"><TextInput type="number" min="0" max="23" value={forms.backup.hour} onChange={(event) => setForms({ ...forms, backup: { ...forms.backup, hour: event.target.value } })} /></Field>
                  <Field label="Retención (días)"><TextInput type="number" min="1" max="365" value={forms.backup.retention} onChange={(event) => setForms({ ...forms, backup: { ...forms.backup, retention: event.target.value } })} /></Field>
                </div>
                <Checkbox label="Respaldo automático habilitado" description="Se ejecuta una vez al día después de la hora configurada." checked={forms.backup.enabled} onChange={(value) => setForms({ ...forms, backup: { ...forms.backup, enabled: value } })} />
                <div className="backup-status-row">
                  <div><span className="eyebrow">Estado</span><Semaforo tone={backupStatus?.enabled ? 'green' : 'yellow'} label={backupStatus?.enabled ? 'Activo' : 'Inactivo'} /></div>
                  <div><span className="eyebrow">Último respaldo</span><strong>{backupStatus?.latest ? formatDateTime(backupStatus.latest.createdAt) : 'Aún no hay copias'}</strong></div>
                  <div><span className="eyebrow">Copias guardadas</span><strong>{formatNumber(backupStatus?.count || 0)}</strong></div>
                </div>
                <Link to="/datos" className="btn btn-secondary"><Database size={16} /> Ir a datos y respaldos</Link>
              </div>
              <div className="panel settings-panel">
                <div className="settings-header"><div><span className="eyebrow">Historial</span><h2>Últimos respaldos</h2></div><button type="button" className="btn btn-small btn-ghost" onClick={loadBackupStatus}>Actualizar</button></div>
                {backupStatus?.backups?.length ? backupStatus.backups.slice(0, 5).map((backup) => (
                  <div className="backup-list-row" key={backup.filename}>
                    <span className="backup-list-icon"><Archive size={16} /></span>
                    <div><strong>{backup.filename}</strong><small>{formatDateTime(backup.createdAt)} · {formatFileSize(backup.size)}</small></div>
                    <button type="button" className="btn btn-small btn-ghost" onClick={() => api.download(`/export/backups/${encodeURIComponent(backup.filename)}`, backup.filename).catch((err) => toast.error(err.message))}>Descargar</button>
                  </div>
                )) : <p className="muted">Todavía no hay copias. Puedes crear una manual desde Datos y respaldos.</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      <PartnerModal
        open={Boolean(partnerModal)}
        type={partnerModal?.type}
        record={partnerModal?.record}
        onClose={() => setPartnerModal(null)}
        onSaved={() => { setPartnerModal(null); loadPartners(); }}
      />

      <UserModal
        open={Boolean(userModal)}
        record={userModal?.record}
        currentUserId={user?.id}
        onClose={() => setUserModal(null)}
        onSaved={() => { setUserModal(null); loadUsers(); }}
      />

      <ConfirmDialog
        open={Boolean(partnerDelete)}
        onClose={() => setPartnerDelete(null)}
        onConfirm={deletePartner}
        busy={deletingPartner}
        title="Eliminar tercero"
        message={`¿Eliminar a "${partnerDelete?.record?.name}"? Si tiene movimientos asociados, el sistema no permitirá la eliminación.`}
        confirmLabel="Eliminar"
      />
    </div>
  );
}

function ThresholdGroup({ title, description, children }) {
  return (
    <div className="threshold-group">
      <div><h3>{title}</h3><p>{description}</p></div>
      <div className="threshold-fields">{children}</div>
    </div>
  );
}

function PartnerModal({ open, type = 'customers', record, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({
      name: record?.name || '',
      nit: record?.nit || '',
      phone: record?.phone || '',
      address: record?.address || ''
    });
    setError('');
  }, [open, record]);

  if (!form) return null;
  const label = type === 'customers' ? 'cliente' : type === 'suppliers' ? 'proveedor' : 'cotero';

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('El nombre es obligatorio.'); return; }
    setSaving(true);
    try {
      const payload = type === 'couriers' ? { name: form.name, phone: form.phone } : form;
      if (record) await api.put(`/partners/${type}/${record.id}`, payload);
      else await api.post(`/partners/${type}`, payload);
      toast.success(`El ${label} fue guardado correctamente.`);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`${record ? 'Editar' : 'Nuevo'} ${label}`} size="sm" busy={saving}
      footer={<><button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" form="partner-form" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></>}
    >
      <form id="partner-form" onSubmit={submit} className="stack-16">
        {error && <div className="inline-notice tone-danger">{error}</div>}
        <Field label="Nombre" required><TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoFocus /></Field>
        {type !== 'couriers' && <Field label="NIT / documento"><TextInput value={form.nit} onChange={(event) => setForm({ ...form, nit: event.target.value })} /></Field>}
        <Field label="Teléfono"><TextInput value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
        {type !== 'couriers' && <Field label="Dirección"><TextInput value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></Field>}
      </form>
    </Modal>
  );
}

function UserModal({ open, record, currentUserId, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({
      username: record?.username || '',
      full_name: record?.full_name || '',
      role: record?.role || 'vendedor',
      password: '',
      active: record ? Boolean(record.active) : true
    });
    setError('');
  }, [open, record]);

  if (!form) return null;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.full_name.trim()) { setError('El nombre es obligatorio.'); return; }
    if (!record && form.password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (record && form.password && form.password.length < 8) { setError('La nueva contraseña debe tener al menos 8 caracteres.'); return; }
    setSaving(true);
    try {
      if (record) {
        await api.put(`/users/${record.id}`, {
          full_name: form.full_name,
          role: form.role,
          active: form.active,
          ...(form.password ? { password: form.password } : {})
        });
      } else {
        await api.post('/users', {
          username: form.username,
          full_name: form.full_name,
          role: form.role,
          password: form.password
        });
      }
      toast.success(record ? 'Usuario actualizado.' : 'Usuario creado correctamente.');
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={record ? 'Editar usuario' : 'Nuevo usuario'} size="sm" busy={saving}
      footer={<><button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" form="user-form" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar usuario'}</button></>}
    >
      <form id="user-form" onSubmit={submit} className="stack-16">
        {error && <div className="inline-notice tone-danger">{error}</div>}
        <div className="form-grid cols-2">
          <Field label="Usuario" required hint={record ? 'El nombre de usuario no cambia.' : 'Mínimo 3 caracteres.'}>
            <TextInput value={form.username} disabled={Boolean(record)} onChange={(event) => setForm({ ...form, username: event.target.value.toLowerCase() })} placeholder="jperez" />
          </Field>
          <Field label="Rol" required>
            <Select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
              <option value="vendedor">Vendedor</option>
              <option value="contador">Contador</option>
              <option value="administrador">Administrador</option>
            </Select>
          </Field>
        </div>
        <Field label="Nombre completo" required><TextInput value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></Field>
        <Field label={record ? 'Nueva contraseña (opcional)' : 'Contraseña'} required={!record} hint="Mínimo 8 caracteres. En edición se deja vacía para conservarla.">
          <TextInput type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" />
        </Field>
        {record && (
          <Checkbox
            label="Usuario activo"
            description={record.id === currentUserId ? 'No puedes desactivar tu propio usuario.' : 'Los usuarios inactivos no pueden iniciar sesión.'}
            checked={form.active}
            disabled={record.id === currentUserId}
            onChange={(value) => setForm({ ...form, active: value })}
          />
        )}
      </form>
    </Modal>
  );
}
