import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  Eye,
  Loader2,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Truck,
  UserPlus
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, DataTable, Pagination, StatusBadge, SummaryTile, ErrorPanel, DownloadMenu, IconButton, Avatar } from '../components/DataDisplay.jsx';
import { Modal, ConfirmDialog } from '../components/Modal.jsx';
import { Field, TextInput, Select, Textarea, Segmented, MoneyInput, FormSection, InlineNotice } from '../components/Forms.jsx';
import { DocumentModal, DocumentItems, DocumentTotals, DocumentSection, DocumentPayments } from '../components/DocumentModal.jsx';
import {
  addDays,
  classNames,
  currentMonth,
  formatCurrency,
  formatCurrencyCompact,
  formatDate,
  formatNumber,
  formatPercent,
  methodLabel,
  monthBounds,
  monthLabel,
  monthOptions,
  todayISO
} from '../utils.js';

export default function Purchases() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [meta, setMeta] = useState(null);
  const [month, setMonth] = useState(currentMonth());
  const [status, setStatus] = useState('todas');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const months = useMemo(() => monthOptions(18), []);
  const bounds = monthBounds(month);
  const canWrite = hasPermission('compras:write');
  const canExport = hasPermission('reportes:export');

  useEffect(() => {
    api.get('/meta').then(setMeta).catch((err) => toast.error(err.message));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 320);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        from: bounds.start,
        to: bounds.end,
        status,
        page: String(page),
        limit: '15'
      });
      if (search) params.set('search', search);
      setData(await api.get(`/purchases?${params.toString()}`));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [month, status, search, page]);

  const refresh = async () => {
    await Promise.all([
      load(true),
      api.get('/meta').then(setMeta).catch(() => {})
    ]);
  };

  const openDetail = async (row) => {
    setDetailLoading(true);
    try {
      const response = await api.get(`/purchases/${row.id}`);
      setDetail(response.data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/purchases/${deleteTarget.id}`);
      toast.success(`Compra ${deleteTarget.doc_number} eliminada.`);
      setDeleteTarget(null);
      if (page > 1 && data?.data?.length === 1) setPage(page - 1);
      else refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      key: 'doc_number',
      label: 'Documento',
      render: (row) => (
        <div className="table-primary-cell">
          <span className="invoice-code">{row.doc_number}</span>
          <small>{formatDate(row.arrival_date)}</small>
        </div>
      )
    },
    {
      key: 'supplier',
      label: 'Proveedor',
      render: (row) => (
        <div className="person-cell">
          <Avatar name={row.supplier_name} size={30} tone={row.id + 1} />
          <div>
            <strong className="table-primary">{row.supplier_name}</strong>
            <small>{row.driver_name ? `Conductor: ${row.driver_name}` : 'Sin conductor registrado'}</small>
          </div>
        </div>
      )
    },
    {
      key: 'product',
      label: 'Producto',
      render: (row) => (
        <div>
          <span className="table-primary">{row.product_name}</span>
          <small className="table-subline">{formatNumber(row.quantity)} {row.product_unit} · {formatCurrency(row.unit_cost)} / unidad</small>
        </div>
      )
    },
    {
      key: 'total_cost',
      label: 'Costo total',
      align: 'right',
      render: (row) => <strong>{formatCurrency(row.total_cost)}</strong>
    },
    {
      key: 'balance',
      label: 'Saldo',
      align: 'right',
      render: (row) => (
        <span className={classNames('amount', row.balance > 0 && 'amount-due')}>
          {formatCurrency(row.balance)}
          {row.balance > 0 && <small>{row.credit_due_date ? formatDate(row.credit_due_date) : 'Sin vencimiento'}</small>}
        </span>
      )
    },
    {
      key: 'status',
      label: 'Estado',
      render: (row) => <StatusBadge status={row.status} />
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        <div className="row-actions">
          <IconButton label="Ver compra" icon={Eye} onClick={() => openDetail(row)} />
          {canWrite && <IconButton label="Editar compra" icon={Pencil} onClick={() => { setEditing(row); setFormOpen(true); }} />}
          {canWrite && <IconButton label="Eliminar compra" icon={Trash2} variant="danger" onClick={() => setDeleteTarget(row)} />}
        </div>
      )
    }
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Abastecimiento"
        title="Compras"
        description="Entradas de producto con flete y descargue capitalizados en el costo real."
        actions={(
          <>
            {canExport && (
              <DownloadMenu
                label="Exportar"
                items={[
                  { label: 'Excel (.xlsx)', path: `/export/purchases?format=xlsx&from=${bounds.start}&to=${bounds.end}` },
                  { label: 'CSV (.csv)', path: `/export/purchases?format=csv&from=${bounds.start}&to=${bounds.end}` }
                ]}
              />
            )}
            {canWrite && <button type="button" className="btn btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={17} /> Nueva compra</button>}
          </>
        )}
      />

      <div className="summary-grid summary-grid-4">
        <SummaryTile label="Compras del período" value={formatCurrency(data?.summary.total || 0)} icon={ShoppingCart} hint={`${formatNumber(data?.summary.count || 0)} documentos registrados`} />
        <SummaryTile label="Saldo por pagar" value={formatCurrency(data?.summary.balance || 0)} icon={PackagePlus} hint="Producto, flete y descargue pendientes" />
        <SummaryTile label="Obligaciones vencidas" value={formatNumber(data?.summary.overdue || 0)} icon={CalendarDays} tone={data?.summary.overdue ? 'red' : 'default'} hint="Requieren priorización de pago" />
        <SummaryTile label="Período consultado" value={monthLabel(month)} icon={CalendarDays} hint={`${formatDate(bounds.start)} — ${formatDate(bounds.end)}`} />
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          <label className="filter-control">
            <CalendarDays size={15} />
            <select value={month} onChange={(event) => { setMonth(event.target.value); setPage(1); }}>
              {months.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="filter-control">
            <Check size={15} />
            <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="todas">Todos los estados</option>
              <option value="pagada">Pagadas</option>
              <option value="credito">A crédito</option>
              <option value="por_vencer">Por vencer</option>
              <option value="vencida">Vencidas</option>
            </select>
          </label>
        </div>
        <div className="search-box">
          <Search size={16} />
          <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar documento, proveedor o producto…" aria-label="Buscar compras" />
        </div>
      </div>

      {error && <ErrorPanel error={error} onRetry={load} />}
      {!error && (
        <DataTable
          columns={columns}
          rows={data?.data || []}
          loading={loading}
          emptyTitle="No hay compras para este período"
          emptyDescription="Cambia el mes o registra una entrada de inventario."
          emptyAction={canWrite ? <button type="button" className="btn btn-small btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={15} /> Registrar compra</button> : null}
          footer={data?.pagination ? <Pagination page={data.pagination.page} pages={data.pagination.pages} total={data.pagination.total} limit={data.pagination.limit} onChange={setPage} label="compras" /> : null}
        />
      )}

      {detailLoading && <div className="floating-loading"><Loader2 className="spin" size={18} /> Abriendo documento…</div>}

      {meta && (
        <PurchaseFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          meta={meta}
          initial={editing}
          onSaved={refresh}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        busy={deleting}
        title="Eliminar compra"
        message={`¿Eliminar la compra ${deleteTarget?.doc_number}? Se revertirá el inventario, las cuentas por pagar y los pagos asociados. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar compra"
      />

      {detail && <PurchaseDocument detail={detail} open onClose={() => setDetail(null)} />}
    </div>
  );
}

function PurchaseDocument({ detail, open, onClose }) {
  const paymentColumns = [
    { key: 'payment_date', label: 'Fecha', render: (row) => formatDate(row.payment_date) },
    { key: 'method', label: 'Medio', render: (row) => methodLabel(row.method) },
    { key: 'amount', label: 'Valor', align: 'right', render: (row) => formatCurrency(row.amount) },
    { key: 'notes', label: 'Notas', render: (row) => row.notes || '—' }
  ];
  return (
    <DocumentModal
      open={open}
      onClose={onClose}
      kind="Compra de producto"
      number={detail.doc_number}
      date={detail.arrival_date}
      status={detail.status}
      fileName={`compra-${detail.doc_number}`}
      subtitle={`${detail.supplier_name} · ${detail.product_name}`}
    >
      <div className="document-parties">
        <div>
          <span>Proveedor</span>
          <strong>{detail.supplier_name}</strong>
          <p>NIT {detail.supplier_nit || '—'}</p>
          <p>{detail.supplier_phone || 'Sin teléfono'} · {detail.payment_method === 'bancos' ? 'Pago bancario' : 'Pago en efectivo'}</p>
        </div>
        <div>
          <span>Recepción y pago</span>
          <strong>Llegada {formatDate(detail.arrival_date)}</strong>
          <p>Fecha de abono/pago: {formatDate(detail.payment_date)}</p>
          <p>Condición: {detail.purchase_type === 'credito' ? 'Crédito' : 'Contado'} {detail.credit_due_date ? `· vence ${formatDate(detail.credit_due_date)}` : ''}</p>
          <p>Conductor: {detail.driver_name || 'No aplica'}</p>
        </div>
      </div>
      <DocumentSection title="Producto recibido">
        <DocumentItems
          columns={[
            { key: 'product', label: 'Producto' },
            { key: 'quantity', label: 'Cantidad', align: 'right' },
            { key: 'unit_cost', label: 'Costo unitario', align: 'right' },
            { key: 'subtotal', label: 'Subtotal', align: 'right' }
          ]}
          rows={[{
            id: detail.id,
            product: `${detail.product_name} (${detail.product_code})`,
            quantity: `${formatNumber(detail.quantity)} ${detail.product_unit}`,
            unit_cost: formatCurrency(detail.unit_cost),
            subtotal: formatCurrency(Number(detail.quantity) * Number(detail.unit_cost))
          }]}
        />
      </DocumentSection>
      <div className="document-bottom-grid">
        <div className="document-notes-block">
          <h3>Detalles de la compra</h3>
          <p><strong>Flete:</strong> {detail.freight_payer === 'proveedor' ? 'Asumido por el proveedor' : `${formatCurrency(detail.freight_value)} · ${detail.freight_type} · proveedor ${detail.freight_provider || '—'}`}</p>
          <p><strong>Costo unitario producto:</strong> {formatCurrency(detail.unit_cost)} por {detail.product_unit}</p>
          <p><strong>Notas:</strong> {detail.notes || 'Sin observaciones adicionales.'}</p>
        </div>
        <DocumentTotals
          items={[
            { label: 'Costo producto', value: formatCurrency(Number(detail.quantity) * Number(detail.unit_cost)) },
            ...(detail.freight_payer !== 'proveedor' && Number(detail.freight_value) > 0 ? [{ label: 'Flete', value: formatCurrency(detail.freight_value) }] : []),
            { label: 'Total factura de compra', value: formatCurrency(Number(detail.quantity) * Number(detail.unit_cost) + (detail.freight_payer !== 'proveedor' ? Number(detail.freight_value || 0) : 0)), strong: true },
            { label: 'Abono realizado', value: formatCurrency(Number(detail.total_paid_at_creation || 0) + Number(detail.credit_paid || 0)), strong: true, tone: 'green' },
            { label: 'Saldo pendiente', value: formatCurrency(detail.balance), strong: true, tone: detail.balance > 0 ? 'warn' : 'green' }
          ]}
          note="Factura de compra de producto. El descargue se gestiona por aparte como cuenta por pagar de logística."
        />
      </div>
      {detail.payments?.length > 0 && <DocumentPayments payments={detail.payments} columns={paymentColumns} />}
    </DocumentModal>
  );
}

function PurchaseFormModal({ open, onClose, meta, initial, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const today = meta.today || todayISO();
    const firstSupplier = meta.suppliers?.[0];
    const firstProduct = meta.products?.[0];
    if (initial) {
      setForm({
        doc_number: initial.doc_number || '',
        arrival_date: initial.arrival_date || today,
        payment_date: initial.payment_date || today,
        supplierMode: 'existing',
        supplier_id: String(initial.supplier_id || ''),
        supplier_name: '',
        supplier_nit: '',
        supplier_phone: '',
        productMode: 'existing',
        product_id: String(initial.product_id || ''),
        product_code: '',
        product_name: '',
        new_product_sale_price: '',
        quantity: String(initial.quantity || 1),
        unit_cost: String(initial.unit_cost || ''),
        purchase_type: initial.purchase_type || 'contado',
        initial_payment: String(initial.initial_payment || 0),
        credit_due_date: initial.credit_due_date || addDays(today, 30),
        payment_method: initial.payment_method || 'efectivo',
        freight_payer: initial.freight_payer || 'yo',
        driver_name: initial.driver_name || '',
        freight_value: String(initial.freight_value || 0),
        freight_type: initial.freight_type || 'contado',
        freight_advance: String(initial.freight_advance || 0),
        freight_provider: initial.freight_provider || '',
        unloading_value: String(initial.unloading_value || 0),
        unloading_type: initial.unloading_type || 'contado',
        unloading_advance: String(initial.unloading_advance || 0),
        unloading_provider: initial.unloading_provider || '',
        notes: initial.notes || ''
      });
    } else {
      setForm({
        doc_number: '',
        arrival_date: today,
        payment_date: today,
        supplierMode: 'existing',
        supplier_id: String(firstSupplier?.id || ''),
        supplier_name: '',
        supplier_nit: '',
        supplier_phone: '',
        productMode: 'existing',
        product_id: String(firstProduct?.id || ''),
        product_code: '',
        product_name: '',
        new_product_sale_price: String(firstProduct?.sale_price || ''),
        quantity: '1',
        unit_cost: String(firstProduct?.avg_cost || ''),
        purchase_type: 'contado',
        initial_payment: '0',
        credit_due_date: addDays(today, 30),
        payment_method: 'efectivo',
        freight_payer: 'yo',
        driver_name: '',
        freight_value: '0',
        freight_type: 'contado',
        freight_advance: '0',
        freight_provider: '',
        unloading_value: '0',
        unloading_type: 'contado',
        unloading_advance: '0',
        unloading_provider: '',
        notes: ''
      });
    }
    setErrors({});
  }, [open, initial, meta]);

  if (!form) return null;

  const quantity = Number(form.quantity) || 0;
  const unitCost = Number(form.unit_cost) || 0;
  const productCost = quantity * unitCost;
  const freight = form.freight_payer === 'yo' ? Number(form.freight_value) || 0 : 0;
  const unloading = Number(form.unloading_value) || 0;
  const totalCost = productCost + freight + unloading;
  const productPaid = form.purchase_type === 'contado' ? productCost : Math.min(productCost, Number(form.initial_payment) || 0);
  const freightPaid = freight > 0
    ? (form.freight_type === 'contado' ? freight : Math.min(freight, Number(form.freight_advance) || 0))
    : 0;
  const unloadingPaid = unloading > 0
    ? (form.unloading_type === 'contado' ? unloading : Math.min(unloading, Number(form.unloading_advance) || 0))
    : 0;
  const paidNow = productPaid + freightPaid + unloadingPaid;
  const creditBalance = totalCost - paidNow;
  const landedUnit = quantity > 0 ? totalCost / quantity : 0;
  const selectedProduct = meta.products.find((item) => String(item.id) === String(form.product_id));
  const hasCredit = creditBalance > 0.5;

  const set = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const validate = () => {
    const next = {};
    if (!form.arrival_date) next.arrival_date = 'Indica la fecha de llegada.';
    if (!form.payment_date) next.payment_date = 'Indica la fecha de pago o abono.';
    if (form.supplierMode === 'existing' && !form.supplier_id) next.supplier_id = 'Selecciona un proveedor.';
    if (form.supplierMode === 'new' && !form.supplier_name.trim()) next.supplier_name = 'Escribe el nombre del proveedor.';
    if (form.productMode === 'existing' && !form.product_id) next.product_id = 'Selecciona un producto.';
    if (form.productMode === 'new' && !form.product_code.trim()) next.product_code = 'Escribe el código del producto.';
    if (form.productMode === 'new' && !form.product_name.trim()) next.product_name = 'Escribe el nombre del producto.';
    if (!(quantity > 0)) next.quantity = 'La cantidad debe ser mayor que cero.';
    if (!(unitCost >= 0)) next.unit_cost = 'El costo unitario no puede ser negativo.';
    if (hasCredit && !form.credit_due_date) next.credit_due_date = 'Indica el vencimiento del crédito.';
    if (form.freight_payer === 'yo' && freight < 0) next.freight_value = 'El flete no puede ser negativo.';
    if (form.freight_type === 'credito' && Number(form.freight_advance) > freight) next.freight_advance = 'El anticipo no puede superar el flete.';
    if (Number(form.unloading_advance) > unloading) next.unloading_advance = 'El anticipo no puede superar el descargue.';
    if (form.purchase_type === 'credito' && Number(form.initial_payment) > productCost) next.initial_payment = 'El abono no puede superar el costo del producto.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!validate()) {
      toast.warning('Revisa los campos marcados antes de guardar.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        doc_number: form.doc_number.trim(),
        arrival_date: form.arrival_date,
        payment_date: form.payment_date,
        supplier_id: form.supplierMode === 'existing' ? Number(form.supplier_id) : undefined,
        supplier_name: form.supplierMode === 'new' ? form.supplier_name.trim() : undefined,
        supplier_nit: form.supplierMode === 'new' ? form.supplier_nit : undefined,
        supplier_phone: form.supplierMode === 'new' ? form.supplier_phone : undefined,
        product_id: form.productMode === 'existing' ? Number(form.product_id) : undefined,
        product_code: form.productMode === 'new' ? form.product_code.trim() : undefined,
        product_name: form.productMode === 'new' ? form.product_name.trim() : undefined,
        new_product_sale_price: form.productMode === 'new' ? Number(form.new_product_sale_price) || 0 : undefined,
        quantity,
        unit_cost: unitCost,
        purchase_type: form.purchase_type,
        initial_payment: form.purchase_type === 'credito' ? Number(form.initial_payment) || 0 : 0,
        credit_due_date: hasCredit ? form.credit_due_date : undefined,
        payment_method: form.payment_method,
        freight_payer: form.freight_payer,
        driver_name: form.driver_name,
        freight_value: freight,
        freight_type: form.freight_type,
        freight_advance: form.freight_type === 'credito' ? Number(form.freight_advance) || 0 : 0,
        freight_provider: form.freight_provider,
        unloading_value: unloading,
        unloading_type: form.unloading_type,
        unloading_advance: form.unloading_type === 'credito' ? Number(form.unloading_advance) || 0 : 0,
        unloading_provider: form.unloading_provider,
        notes: form.notes
      };
      const response = initial
        ? await api.put(`/purchases/${initial.id}`, payload)
        : await api.post('/purchases', payload);
      toast.success(response.message || 'Compra guardada correctamente.');
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? `Editar compra ${initial.doc_number}` : 'Nueva compra'}
      subtitle="Registra producto, flete y descargue. El costo landed actualiza el inventario."
      size="xl"
      busy={saving}
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" form="purchase-form" className="btn btn-primary" disabled={saving}>
            {saving ? <><Loader2 size={16} className="spin" /> Guardando…</> : <><Check size={16} /> {initial ? 'Guardar cambios' : 'Registrar compra'}</>}
          </button>
        </>
      )}
    >
      <form id="purchase-form" onSubmit={submit} className="transaction-layout">
        <div className="transaction-main">
          <FormSection number="01" title="Documento y origen" description="Proveedor, producto y cantidades de la operación.">
            <div className="form-grid cols-2">
              <Field label="Documento / factura" hint={`Vacío = consecutivo automático ${meta.nextPurchase}.`}>
                <TextInput value={form.doc_number} onChange={(event) => set('doc_number', event.target.value)} placeholder={`Automático · ${meta.nextPurchase}`} />
              </Field>
              <Field label="Fecha de llegada del producto" required error={errors.arrival_date}>
                <TextInput type="date" value={form.arrival_date} onChange={(event) => set('arrival_date', event.target.value)} />
              </Field>
              <Field label="Fecha de abono / pago" required error={errors.payment_date} hint="Separada de la fecha de llegada.">
                <TextInput type="date" value={form.payment_date} onChange={(event) => set('payment_date', event.target.value)} />
              </Field>
              <Field label="Medio de pago">
                <Segmented
                  value={form.payment_method}
                  onChange={(value) => set('payment_method', value)}
                  options={[{ value: 'efectivo', label: 'Efectivo' }, { value: 'bancos', label: 'Bancos' }]}
                />
              </Field>
            </div>
            <div className="form-grid cols-2">
              <Field label="Proveedor" required error={errors.supplier_id}>
                <Select value={form.supplierMode === 'new' ? '__new__' : form.supplier_id} onChange={(event) => {
                  if (event.target.value === '__new__') set('supplierMode', 'new');
                  else setForm((current) => ({ ...current, supplierMode: 'existing', supplier_id: event.target.value }));
                }}>
                  <option value="">Selecciona un proveedor</option>
                  {meta.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  <option value="__new__">+ Registrar proveedor nuevo</option>
                </Select>
              </Field>
              <Field label="Producto" required error={errors.product_id}>
                <Select value={form.productMode === 'new' ? '__new__' : form.product_id} onChange={(event) => {
                  if (event.target.value === '__new__') set('productMode', 'new');
                  else {
                    const product = meta.products.find((item) => String(item.id) === String(event.target.value));
                    setForm((current) => ({
                      ...current,
                      productMode: 'existing',
                      product_id: event.target.value,
                      unit_cost: product ? String(product.avg_cost || '') : current.unit_cost
                    }));
                  }
                }}>
                  <option value="">Selecciona un producto</option>
                  {meta.products.map((product) => <option key={product.id} value={product.id}>{product.code} · {product.name}</option>)}
                  <option value="__new__">+ Crear producto nuevo</option>
                </Select>
              </Field>
            </div>
            {form.supplierMode === 'new' && (
              <div className="conditional-block">
                <div className="form-grid cols-3">
                  <Field label="Nombre del proveedor" required error={errors.supplier_name}>
                    <TextInput value={form.supplier_name} onChange={(event) => set('supplier_name', event.target.value)} placeholder="Razón social" />
                  </Field>
                  <Field label="NIT">
                    <TextInput value={form.supplier_nit} onChange={(event) => set('supplier_nit', event.target.value)} placeholder="Opcional" />
                  </Field>
                  <Field label="Teléfono">
                    <TextInput value={form.supplier_phone} onChange={(event) => set('supplier_phone', event.target.value)} placeholder="+57 …" />
                  </Field>
                </div>
              </div>
            )}
            {form.productMode === 'new' && (
              <div className="conditional-block">
                <div className="form-grid cols-3">
                  <Field label="Código del producto" required error={errors.product_code}>
                    <TextInput value={form.product_code} onChange={(event) => set('product_code', event.target.value)} placeholder="Ej. CEM-006" />
                  </Field>
                  <Field label="Nombre del producto" required error={errors.product_name}>
                    <TextInput value={form.product_name} onChange={(event) => set('product_name', event.target.value)} placeholder="Ej. Cemento especial 50 kg" />
                  </Field>
                  <Field label="Precio de venta sugerido">
                    <MoneyInput value={form.new_product_sale_price} onChange={(event) => set('new_product_sale_price', event.target.value)} />
                  </Field>
                </div>
              </div>
            )}
            <div className="form-grid cols-3">
              <Field label="Cantidad comprada" required error={errors.quantity}>
                <TextInput type="number" min="1" step="1" value={form.quantity} onChange={(event) => set('quantity', event.target.value)} />
              </Field>
              <Field label="Costo unitario" required error={errors.unit_cost}>
                <MoneyInput value={form.unit_cost} onChange={(event) => set('unit_cost', event.target.value)} />
              </Field>
              <Field label="Valor producto">
                <div className="readonly-value">{formatCurrency(productCost)}</div>
              </Field>
            </div>
          </FormSection>

          <FormSection number="02" title="Condiciones de pago" description="El crédito se registra automáticamente en cuentas por pagar.">
            <div className="form-grid cols-2">
              <Field label="Tipo de compra">
                <Segmented
                  value={form.purchase_type}
                  onChange={(value) => set('purchase_type', value)}
                  options={[{ value: 'contado', label: 'Contado' }, { value: 'credito', label: 'Crédito' }]}
                />
              </Field>
              <Field label="Vencimiento del crédito" error={errors.credit_due_date} hint={hasCredit ? 'Obligatorio cuando queda saldo pendiente.' : 'Solo aplica si hay saldo a crédito.'}>
                <TextInput type="date" value={form.credit_due_date} onChange={(event) => set('credit_due_date', event.target.value)} disabled={!hasCredit} />
              </Field>
            </div>
            {form.purchase_type === 'credito' && (
              <div className="form-grid cols-2">
                <Field label="Abono inicial del producto" error={errors.initial_payment} hint={`Saldo a crédito: ${formatCurrency(Math.max(0, productCost - (Number(form.initial_payment) || 0)))}`}>
                  <MoneyInput value={form.initial_payment} onChange={(event) => set('initial_payment', event.target.value)} />
                </Field>
                <div className="inline-note-card">
                  <Truck size={17} />
                  <div><strong>Se creará una cuenta por pagar</strong><span>Por el saldo del producto y cada concepto a crédito.</span></div>
                </div>
              </div>
            )}
          </FormSection>

          <FormSection number="03" title="Flete y descargue" description="Cada concepto puede tener su propio proveedor y condiciones.">
            <div className="form-grid cols-2">
              <Field label="Flete">
                <Segmented
                  value={form.freight_payer}
                  onChange={(value) => set('freight_payer', value)}
                  options={[{ value: 'yo', label: 'Yo pago el flete' }, { value: 'proveedor', label: 'Lo paga el proveedor' }]}
                />
              </Field>
              <Field label="Proveedor del flete">
                <TextInput value={form.freight_provider} onChange={(event) => set('freight_provider', event.target.value)} placeholder="Transportadora o conductor" disabled={form.freight_payer !== 'yo'} />
              </Field>
            </div>
            {form.freight_payer === 'yo' && (
              <div className="conditional-block">
                <div className="form-grid cols-3">
                  <Field label="Nombre del conductor">
                    <TextInput value={form.driver_name} onChange={(event) => set('driver_name', event.target.value)} placeholder="Opcional" />
                  </Field>
                  <Field label="Valor del flete" error={errors.freight_value}>
                    <MoneyInput value={form.freight_value} onChange={(event) => set('freight_value', event.target.value)} />
                  </Field>
                  <Field label="Tipo de flete">
                    <Segmented value={form.freight_type} onChange={(value) => set('freight_type', value)} options={[{ value: 'contado', label: 'Contado' }, { value: 'credito', label: 'Crédito' }]} />
                  </Field>
                </div>
                {form.freight_type === 'credito' && (
                  <Field label="Anticipo del flete" error={errors.freight_advance} hint="Opcional. Se descuenta del saldo a crédito.">
                    <MoneyInput value={form.freight_advance} onChange={(event) => set('freight_advance', event.target.value)} />
                  </Field>
                )}
              </div>
            )}
            <div className="form-divider" />
            <div className="form-grid cols-2">
              <Field label="Valor del descargue">
                <MoneyInput value={form.unloading_value} onChange={(event) => set('unloading_value', event.target.value)} />
              </Field>
              <Field label="Tipo de descargue">
                <Segmented value={form.unloading_type} onChange={(value) => set('unloading_type', value)} options={[{ value: 'contado', label: 'Contado' }, { value: 'credito', label: 'Crédito' }]} />
              </Field>
            </div>
            <div className="form-grid cols-2">
              <Field label="Proveedor del descargue">
                <TextInput value={form.unloading_provider} onChange={(event) => set('unloading_provider', event.target.value)} placeholder="Persona o empresa de descargue" />
              </Field>
              {form.unloading_type === 'credito' && (
                <Field label="Anticipo del descargue" error={errors.unloading_advance}>
                  <MoneyInput value={form.unloading_advance} onChange={(event) => set('unloading_advance', event.target.value)} />
                </Field>
              )}
            </div>
          </FormSection>
        </div>

        <aside className="transaction-aside">
          <div className="transaction-summary">
            <div className="summary-box-head">
              <span className="eyebrow">Costo de la compra</span>
              <span className="summary-chip">{form.purchase_type === 'credito' ? 'Crédito' : 'Contado'}</span>
            </div>
            <div className="summary-customer">
              <PackagePlus size={18} />
              <div>
                <strong>{form.productMode === 'new' ? (form.product_name || 'Producto nuevo') : (selectedProduct?.name || 'Sin producto')}</strong>
                <small>{formatNumber(quantity)} {selectedProduct?.unit || 'unidades'} · costo landed {formatCurrency(landedUnit)}</small>
              </div>
            </div>
            <div className="summary-line"><span>Costo producto</span><strong>{formatCurrency(productCost)}</strong></div>
            <div className="summary-line"><span>Flete</span><strong>{formatCurrency(freight)}</strong></div>
            <div className="summary-line"><span>Descargue</span><strong>{formatCurrency(unloading)}</strong></div>
            <div className="summary-line divider"><span>Costo total</span><strong>{formatCurrency(totalCost)}</strong></div>
            <div className="summary-line subtle"><span>Costo landed por unidad</span><strong>{formatCurrency(landedUnit)}</strong></div>
            <div className="summary-line"><span>Pagado al registrar</span><strong>{formatCurrency(paidNow)}</strong></div>
            <div className="summary-line credit"><span>Saldo a crédito</span><strong>{formatCurrency(Math.max(0, creditBalance))}</strong></div>
            {selectedProduct && form.productMode === 'existing' && (
              <div className="summary-line subtle">
                <span>Stock después de compra</span>
                <strong>{formatNumber(Number(selectedProduct.stock) + quantity)} {selectedProduct.unit}</strong>
              </div>
            )}
            <div className="summary-note">
              <span className="summary-note-icon"><Truck size={15} /></span>
              <p>El inventario entra al costo total (producto + flete + descargue), actualizando el promedio ponderado.</p>
            </div>
          </div>
        </aside>
      </form>
    </Modal>
  );
}
