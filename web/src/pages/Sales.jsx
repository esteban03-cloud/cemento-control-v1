import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  Check,
  Eye,
  HandCoins,
  Loader2,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  UserPlus,
  WalletCards
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, DataTable, Pagination, StatusBadge, SummaryTile, ErrorPanel, Skeleton, DownloadMenu, IconButton, Avatar } from '../components/DataDisplay.jsx';
import { Modal, ConfirmDialog } from '../components/Modal.jsx';
import { Field, TextInput, Select, Textarea, Segmented, MoneyInput, FormSection, InlineNotice } from '../components/Forms.jsx';
import { DocumentModal, DocumentFacts, DocumentItems, DocumentTotals, DocumentSection, DocumentPayments } from '../components/DocumentModal.jsx';
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

export default function Sales() {
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
  const canWrite = hasPermission('ventas:write');
  const canExport = hasPermission('reportes:export');

  useEffect(() => {
    api.get('/meta').then((response) => setMeta(response)).catch((err) => toast.error(err.message));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 320);
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
      const response = await api.get(`/sales?${params.toString()}`);
      setData(response);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [month, status, search, page]);

  const refresh = async () => {
    await Promise.all([
      load(true),
      api.get('/meta').then(setMeta).catch(() => {})
    ]);
  };

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (row) => {
    if (row.payment_condition === 'credito' && Number(row.receivable_paid) > 0) {
      toast.warning('No se puede editar una venta a crédito con abonos registrados. Gestiona primero la cartera.');
      return;
    }
    setEditing(row);
    setFormOpen(true);
  };

  const openDetail = async (row) => {
    setDetailLoading(true);
    try {
      const response = await api.get(`/sales/${row.id}`);
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
      await api.delete(`/sales/${deleteTarget.id}`);
      toast.success(`Venta ${deleteTarget.invoice_number} eliminada.`);
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
      key: 'invoice_number',
      label: 'Factura',
      render: (row) => (
        <div className="table-primary-cell">
          <span className="invoice-code">{row.invoice_number}</span>
          <small>{formatDate(row.delivery_date)}</small>
        </div>
      )
    },
    {
      key: 'customer',
      label: 'Cliente',
      render: (row) => (
        <div className="person-cell">
          <Avatar name={row.customer_name} size={30} tone={row.id} />
          <div>
            <strong className="table-primary">{row.customer_name}</strong>
            <small>{row.customer_nit || 'Sin NIT'}</small>
          </div>
        </div>
      )
    },
    {
      key: 'product',
      label: 'Producto',
      hideOnMobile: false,
      render: (row) => (
        <div>
          <span className="table-primary">{row.product_name}</span>
          <small className="table-subline">{formatNumber(row.quantity)} {row.product_unit || 'bultos'} · {formatCurrency(row.unit_price)}</small>
        </div>
      )
    },
    {
      key: 'total',
      label: 'Total',
      align: 'right',
      render: (row) => <strong>{formatCurrency(row.total)}</strong>
    },
    {
      key: 'balance',
      label: 'Saldo',
      align: 'right',
      render: (row) => (
        <span className={classNames('amount', row.balance > 0 && 'amount-due')}>
          {formatCurrency(row.balance)}
          {row.payment_condition === 'credito' && <small>{formatDate(row.due_date)}</small>}
        </span>
      )
    },
    {
      key: 'status',
      label: 'Estado',
      render: (row) => <StatusBadge status={row.status} tone={row.status_key === 'por_vencer' ? 'yellow' : undefined} />
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        <div className="row-actions">
          <IconButton label="Ver factura" icon={Eye} onClick={() => openDetail(row)} />
          {canWrite && (
            <IconButton
              label={row.payment_condition === 'credito' && Number(row.receivable_paid) > 0 ? 'No editable: tiene abonos' : 'Editar venta'}
              icon={Pencil}
              onClick={() => openEdit(row)}
              disabled={row.payment_condition === 'credito' && Number(row.receivable_paid) > 0}
            />
          )}
          {canWrite && <IconButton label="Eliminar venta" icon={Trash2} variant="danger" onClick={() => setDeleteTarget(row)} />}
        </div>
      )
    }
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Operación comercial"
        title="Ventas"
        description="Facturas de despacho, condiciones de pago y control de cartera en una sola vista."
        actions={(
          <>
            {canExport && (
              <DownloadMenu
                label="Exportar"
                items={[
                  { label: 'Excel (.xlsx)', path: `/export/sales?format=xlsx&from=${bounds.start}&to=${bounds.end}` },
                  { label: 'CSV (.csv)', path: `/export/sales?format=csv&from=${bounds.start}&to=${bounds.end}` }
                ]}
              />
            )}
            {canWrite && <button type="button" className="btn btn-primary" onClick={openNew}><Plus size={17} /> Nueva venta</button>}
          </>
        )}
      />

      <div className="summary-grid summary-grid-4">
        <SummaryTile label="Facturado en el período" value={formatCurrency(data?.summary.total || 0)} icon={ReceiptText} hint={`${formatNumber(data?.summary.count || 0)} facturas`} />
        <SummaryTile label="Saldo por cobrar" value={formatCurrency(data?.summary.balance || 0)} icon={HandCoins} hint="Incluye ventas a crédito vigentes y vencidas" />
        <SummaryTile label="Facturas vencidas" value={formatNumber(data?.summary.overdue || 0)} icon={CalendarDays} tone={data?.summary.overdue ? 'red' : 'default'} hint="Requieren gestión de cobro" />
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
              <option value="pendiente">Pendientes</option>
              <option value="por_vencer">Por vencer</option>
              <option value="vencida">Vencidas</option>
            </select>
          </label>
        </div>
        <div className="search-box">
          <Search size={16} />
          <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar factura, cliente o producto⬦" aria-label="Buscar ventas" />
        </div>
      </div>

      {error && <ErrorPanel error={error} onRetry={load} />}

      {!error && (
        <DataTable
          columns={columns}
          rows={data?.data || []}
          loading={loading}
          emptyTitle="No hay ventas para este período"
          emptyDescription="Cambia el mes o registra una nueva factura de despacho."
          emptyAction={canWrite ? <button type="button" className="btn btn-small btn-primary" onClick={openNew}><Plus size={15} /> Registrar venta</button> : null}
          footer={data?.pagination ? (
            <Pagination
              page={data.pagination.page}
              pages={data.pagination.pages}
              total={data.pagination.total}
              limit={data.pagination.limit}
              onChange={setPage}
              label="facturas"
            />
          ) : null}
        />
      )}

      {detailLoading && (
        <div className="floating-loading"><Loader2 className="spin" size={18} /> Abriendo documento⬦</div>
      )}

      {meta && (
        <SaleFormModal
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
        title="Eliminar venta"
        message={`¿Seguro que deseas eliminar la factura ${deleteTarget?.invoice_number}? Se revertirán el inventario y los movimientos de caja asociados. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar venta"
      />

      {detail && (
        <SaleDocument detail={detail} open onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

function SaleDocument({ detail, open, onClose }) {
  const paymentsColumns = [
    { key: 'payment_date', label: 'Fecha', render: (row) => formatDate(row.payment_date) },
    { key: 'method', label: 'Medio', render: (row) => methodLabel(row.method) },
    { key: 'amount', label: 'Valor', align: 'right', render: (row) => formatCurrency(row.amount) },
    { key: 'fee', label: '4x1000', align: 'right', render: (row) => row.fee ? formatCurrency(row.fee) : '—' },
    { key: 'notes', label: 'Notas', render: (row) => row.notes || '—' }
  ];
  return (
    <DocumentModal
      open={open}
      onClose={onClose}
      kind="Factura de venta"
      number={detail.invoice_number}
      date={detail.delivery_date}
      status={detail.status}
      fileName={`venta-${detail.invoice_number}`}
      subtitle={`${detail.customer_name} · ${detail.product_name}`}
    >
      <div className="document-parties">
        <div>
          <span>Cliente</span>
          <strong>{detail.customer_name}</strong>
          <p>NIT {detail.customer_nit || '—'}</p>
          <p>{detail.customer_phone || 'Sin teléfono'} · {detail.customer_address || 'Sin dirección'}</p>
        </div>
        <div>
          <span>Entrega y pago</span>
          <strong>Entrega {formatDate(detail.delivery_date)}</strong>
          <p>Condición: {detail.payment_condition === 'credito' ? 'Crédito' : 'Contado'} · {methodLabel(detail.payment_method)}</p>
          {detail.payment_condition === 'credito' && <p>Vence {formatDate(detail.due_date)} · Saldo {formatCurrency(detail.balance)}</p>}
          {detail.payment_condition === 'contado' && <p>Dinero recibido el {formatDate(detail.money_entry_date)}</p>}
          <p>Cotero: {detail.courier_name || 'No asignado'}</p>
        </div>
      </div>
      <DocumentSection title="Detalle del despacho">
        <DocumentItems
          columns={[
            { key: 'product', label: 'Producto' },
            { key: 'quantity', label: 'Cantidad', align: 'right' },
            { key: 'price', label: 'Precio unitario', align: 'right' },
            { key: 'subtotal', label: 'Subtotal', align: 'right' }
          ]}
          rows={[{
            id: detail.id,
            product: `${detail.product_name} (${detail.product_code})`,
            quantity: `${formatNumber(detail.quantity)} ${detail.product_unit || 'bultos'}`,
            price: formatCurrency(detail.unit_price),
            subtotal: formatCurrency(detail.subtotal)
          }]}
        />
      </DocumentSection>
      <div className="document-bottom-grid">
        <div className="document-notes-block">
          <h3>Información logística</h3>
          <p><strong>Cargue:</strong> {formatCurrency(detail.loading_value)} · {detail.loading_type === 'credito' ? 'Crédito' : 'Contado'}</p>
          <p><strong>Proveedor de cargue:</strong> {detail.loading_provider || detail.courier_name || '—'}</p>
          <p><strong>Notas:</strong> {detail.notes || 'Sin observaciones.'}</p>
          <p><strong>Registrada por:</strong> {detail.created_by_name || '—'} · {formatDate(detail.delivery_date)}</p>
        </div>
        <DocumentTotals
          items={[
            { label: 'Subtotal producto', value: formatCurrency(detail.subtotal) },
            { label: 'Cargue', value: formatCurrency(detail.loading_value) },
            { label: 'Total factura', value: formatCurrency(detail.total), strong: true },
            { label: '4x1000', value: detail.four_per_mille ? `- ${formatCurrency(detail.four_per_mille)}` : '—' },
            { label: 'Abonos', value: formatCurrency(detail.receivable_paid || 0) },
            { label: 'Saldo pendiente', value: formatCurrency(detail.balance), strong: true, tone: detail.balance > 0 ? 'warn' : 'green' }
          ]}
          note={detail.payment_condition === 'credito' ? 'El saldo pendiente se administra en el módulo de cuentas por cobrar.' : 'Venta pagada en su totalidad.'}
        />
      </div>
      {detail.payments?.length > 0 && (
        <DocumentPayments payments={detail.payments} columns={paymentsColumns} />
      )}
    </DocumentModal>
  );
}

function SaleFormModal({ open, onClose, meta, initial, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const defaultProduct = meta.products?.[0];
    const today = meta.today || todayISO();
    if (initial) {
      setForm({
        invoice_number: initial.invoice_number || '',
        delivery_date: initial.delivery_date || today,
        customerMode: 'existing',
        customer_id: String(initial.customer_id || ''),
        customer_name: '',
        customer_nit: '',
        customer_phone: '',
        customer_address: '',
        payment_condition: initial.payment_condition || 'contado',
        due_date: initial.due_date || addDays(today, 30),
        money_entry_date: initial.money_entry_date || today,
        payment_method: initial.payment_method || 'efectivo',
        courierMode: initial.courier_id ? 'existing' : 'new',
        courier_id: initial.courier_id ? String(initial.courier_id) : '',
        courier_name: initial.courier_name || '',
        courier_phone: '',
        loading_value: String(initial.loading_value || 0),
        loading_type: initial.loading_type || 'contado',
        loading_provider: initial.loading_provider || '',
        product_id: String(initial.product_id || defaultProduct?.id || ''),
        quantity: String(initial.quantity || 1),
        unit_price: String(initial.unit_price || initial.product_avg_cost || ''),
        notes: initial.notes || ''
      });
    } else {
      setForm({
        invoice_number: '',
        delivery_date: today,
        customerMode: 'existing',
        customer_id: String(meta.customers?.[0]?.id || ''),
        customer_name: '',
        customer_nit: '',
        customer_phone: '',
        customer_address: '',
        payment_condition: 'contado',
        due_date: addDays(today, 30),
        money_entry_date: today,
        payment_method: 'efectivo',
        courierMode: 'existing',
        courier_id: String(meta.couriers?.[0]?.id || ''),
        courier_name: '',
        courier_phone: '',
        loading_value: '0',
        loading_type: 'contado',
        loading_provider: '',
        product_id: String(defaultProduct?.id || ''),
        quantity: '1',
        unit_price: String(defaultProduct?.sale_price || ''),
        notes: ''
      });
    }
    setErrors({});
  }, [open, initial, meta]);

  if (!form) return null;

  const product = meta.products.find((item) => String(item.id) === String(form.product_id));
  const quantity = Number(form.quantity) || 0;
  const unitPrice = Number(form.unit_price) || 0;
  const subtotal = quantity * unitPrice;
  const loading = Number(form.loading_value) || 0;
  const total = subtotal + loading;
  const gmf = form.payment_condition === 'contado' && form.payment_method === 'bancos'
    ? Math.round(total * (meta.fiscal?.gmfRate || 0))
    : 0;
  const margin = subtotal > 0 && product ? ((unitPrice - Number(product.avg_cost)) / unitPrice) * 100 : 0;
  const stock = Number(product?.stock || 0);

  const set = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const changeProduct = (value) => {
    const next = meta.products.find((item) => String(item.id) === String(value));
    setForm((current) => ({
      ...current,
      product_id: value,
      unit_price: next ? String(next.sale_price) : current.unit_price
    }));
  };

  const validate = () => {
    const next = {};
    if (!form.delivery_date) next.delivery_date = 'Selecciona la fecha de entrega.';
    if (form.customerMode === 'existing' && !form.customer_id) next.customer_id = 'Selecciona un cliente.';
    if (form.customerMode === 'new' && !form.customer_name.trim()) next.customer_name = 'Escribe el nombre del cliente.';
    if (form.payment_condition === 'credito' && !form.due_date) next.due_date = 'La fecha de vencimiento es obligatoria.';
    if (form.payment_condition === 'credito' && form.due_date && form.due_date < form.delivery_date) next.due_date = 'El vencimiento no puede ser anterior a la entrega.';
    if (form.payment_condition === 'contado' && !form.money_entry_date) next.money_entry_date = 'Indica la fecha de entrada del dinero.';
    if (form.courierMode === 'new' && !form.courier_name.trim()) next.courier_name = 'Escribe el nombre del cotero.';
    if (!form.product_id) next.product_id = 'Selecciona un producto.';
    if (!(quantity > 0)) next.quantity = 'La cantidad debe ser mayor que cero.';
    else if (product && quantity > stock) next.quantity = `Inventario insuficiente. Disponible: ${formatNumber(stock)} ${product.unit}.`;
    if (!(unitPrice > 0)) next.unit_price = 'El precio unitario debe ser mayor que cero.';
    if (loading < 0) next.loading_value = 'El cargue no puede ser negativo.';
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
        invoice_number: form.invoice_number.trim(),
        delivery_date: form.delivery_date,
        customer_id: form.customerMode === 'existing' ? Number(form.customer_id) : undefined,
        customer_name: form.customerMode === 'new' ? form.customer_name.trim() : undefined,
        customer_nit: form.customerMode === 'new' ? form.customer_nit : undefined,
        customer_phone: form.customerMode === 'new' ? form.customer_phone : undefined,
        customer_address: form.customerMode === 'new' ? form.customer_address : undefined,
        payment_condition: form.payment_condition,
        due_date: form.payment_condition === 'credito' ? form.due_date : undefined,
        money_entry_date: form.money_entry_date,
        payment_method: form.payment_method,
        courier_id: form.courierMode === 'existing' && form.courier_id ? Number(form.courier_id) : undefined,
        courier_name: form.courierMode === 'new' ? form.courier_name.trim() : undefined,
        courier_phone: form.courierMode === 'new' ? form.courier_phone : undefined,
        loading_value: loading,
        loading_type: form.loading_type,
        loading_provider: form.loading_provider || undefined,
        product_id: Number(form.product_id),
        quantity,
        unit_price: unitPrice,
        notes: form.notes
      };
      const response = initial
        ? await api.put(`/sales/${initial.id}`, payload)
        : await api.post('/sales', payload);
      toast.success(response.message || 'Venta guardada correctamente.');
      onSaved?.();
      onClose();
    } catch (err) {
      if (err.details?.errors) setErrors(err.details.errors);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? `Editar venta ${initial.invoice_number}` : 'Nueva venta'}
      subtitle="Registra el despacho, las condiciones de pago y el cargue en una sola operación."
      size="xl"
      busy={saving}
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" form="sale-form" className="btn btn-primary" disabled={saving}>
            {saving ? <><Loader2 size={16} className="spin" /> Guardando⬦</> : <><Check size={16} /> {initial ? 'Guardar cambios' : 'Registrar venta'}</>}
          </button>
        </>
      )}
    >
      <form id="sale-form" onSubmit={submit} className="transaction-layout">
        <div className="transaction-main">
          <FormSection number="01" title="Datos del cliente" description="Identifica la factura y la condición comercial.">
            <div className="form-grid cols-2">
              <Field label="Número de factura" hint={`Déjalo vacío para usar el consecutivo ${meta.nextSale}.`}>
                <TextInput
                  value={form.invoice_number}
                  onChange={(event) => set('invoice_number', event.target.value)}
                  placeholder={`Automático · ${meta.nextSale}`}
                />
              </Field>
              <Field label="Fecha de entrega" required error={errors.delivery_date}>
                <TextInput type="date" value={form.delivery_date} onChange={(event) => set('delivery_date', event.target.value)} />
              </Field>
            </div>
            <div className="form-grid cols-2">
              <Field label="Cliente" required error={errors.customer_id}>
                <Select value={form.customerMode === 'new' ? '__new__' : form.customer_id} onChange={(event) => {
                  if (event.target.value === '__new__') set('customerMode', 'new');
                  else {
                    setForm((current) => ({ ...current, customerMode: 'existing', customer_id: event.target.value }));
                    setErrors((current) => ({ ...current, customer_id: undefined }));
                  }
                }}>
                  <option value="">Selecciona un cliente</option>
                  {meta.customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.nit || 'sin NIT'}</option>)}
                  <option value="__new__">+ Registrar cliente nuevo</option>
                </Select>
              </Field>
              <Field label="Condición de pago" required>
                <Segmented
                  value={form.payment_condition}
                  onChange={(value) => set('payment_condition', value)}
                  options={[{ value: 'contado', label: 'Contado' }, { value: 'credito', label: 'Crédito' }]}
                />
              </Field>
            </div>
            {form.customerMode === 'new' && (
              <div className="conditional-block">
                <div className="form-grid cols-2">
                  <Field label="Nombre del cliente" required error={errors.customer_name}>
                    <TextInput value={form.customer_name} onChange={(event) => set('customer_name', event.target.value)} placeholder="Razón social o nombre" />
                  </Field>
                  <Field label="NIT / documento">
                    <TextInput value={form.customer_nit} onChange={(event) => set('customer_nit', event.target.value)} placeholder="Opcional" />
                  </Field>
                  <Field label="Teléfono">
                    <TextInput value={form.customer_phone} onChange={(event) => set('customer_phone', event.target.value)} placeholder="+57 ⬦" />
                  </Field>
                  <Field label="Dirección">
                    <TextInput value={form.customer_address} onChange={(event) => set('customer_address', event.target.value)} placeholder="Dirección de entrega" />
                  </Field>
                </div>
              </div>
            )}
            <div className="form-grid cols-2">
              {form.payment_condition === 'credito' ? (
                <Field label="Fecha de vencimiento" required error={errors.due_date} hint="Se usará para las alertas de cartera.">
                  <TextInput type="date" value={form.due_date} onChange={(event) => set('due_date', event.target.value)} />
                </Field>
              ) : (
                <Field label="Fecha de entrada del dinero" required error={errors.money_entry_date}>
                  <TextInput type="date" value={form.money_entry_date} onChange={(event) => set('money_entry_date', event.target.value)} />
                </Field>
              )}
              <Field label="Medio de pago" required hint={form.payment_method === 'bancos' && form.payment_condition === 'contado' ? `Se descontará 4x1000 estimado de ${formatCurrency(gmf)}.` : undefined}>
                <Segmented
                  value={form.payment_method}
                  onChange={(value) => set('payment_method', value)}
                  options={[
                    { value: 'efectivo', label: 'Efectivo', icon: <WalletCards size={15} /> },
                    { value: 'bancos', label: 'Bancos' }
                  ]}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection number="02" title="Logística de entrega" description="Asigna el cotero y define cómo se paga el cargue.">
            <div className="form-grid cols-2">
              <Field label="Cotero" error={errors.courier_name}>
                <Select value={form.courierMode === 'new' ? '__new__' : form.courier_id} onChange={(event) => {
                  if (event.target.value === '__new__') set('courierMode', 'new');
                  else setForm((current) => ({ ...current, courierMode: 'existing', courier_id: event.target.value }));
                }}>
                  <option value="">Sin asignar</option>
                  {meta.couriers.map((courier) => <option key={courier.id} value={courier.id}>{courier.name}</option>)}
                  <option value="__new__">+ Registrar cotero</option>
                </Select>
              </Field>
              <Field label="Valor del cargue" error={errors.loading_value}>
                <MoneyInput value={form.loading_value} onChange={(event) => set('loading_value', event.target.value)} />
              </Field>
            </div>
            {form.courierMode === 'new' && (
              <div className="conditional-block">
                <div className="form-grid cols-2">
                  <Field label="Nombre del cotero" required error={errors.courier_name}>
                    <TextInput value={form.courier_name} onChange={(event) => set('courier_name', event.target.value)} placeholder="Nombre completo" />
                  </Field>
                  <Field label="Teléfono del cotero">
                    <TextInput value={form.courier_phone} onChange={(event) => set('courier_phone', event.target.value)} placeholder="+57 ⬦" />
                  </Field>
                </div>
              </div>
            )}
            <div className="form-grid cols-2">
              <Field label="Tipo de cargue">
                <Segmented
                  value={form.loading_type}
                  onChange={(value) => set('loading_type', value)}
                  options={[{ value: 'contado', label: 'Contado' }, { value: 'credito', label: 'Crédito' }]}
                />
              </Field>
              <Field label="Proveedor del cargue" hint="Opcional. Se usa el cotero si se deja vacío.">
                <TextInput value={form.loading_provider} onChange={(event) => set('loading_provider', event.target.value)} placeholder="Empresa o persona que presta el cargue" />
              </Field>
            </div>
            {form.loading_type === 'credito' && (
              <InlineNotice tone="warning">
                El cargue a crédito se registrará automáticamente como una cuenta por pagar al proveedor del servicio.
              </InlineNotice>
            )}
          </FormSection>

          <FormSection number="03" title="Detalle del producto" description="El cargue se incluye en el desglose de la factura.">
            <div className="form-grid cols-2">
              <Field label="Producto" required error={errors.product_id}>
                <Select value={form.product_id} onChange={(event) => changeProduct(event.target.value)}>
                  <option value="">Selecciona un producto</option>
                  {meta.products.map((item) => (
                    <option key={item.id} value={item.id} disabled={Number(item.stock) <= 0}>
                      {item.name} · stock {formatNumber(item.stock)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Precio unitario" required error={errors.unit_price}>
                <MoneyInput value={form.unit_price} onChange={(event) => set('unit_price', event.target.value)} />
              </Field>
            </div>
            <div className="form-grid cols-2">
              <Field
                label="Cantidad"
                required
                error={errors.quantity}
                hint={product ? `Disponible: ${formatNumber(stock)} ${product.unit} · Margen estimado ${formatPercent(margin)}` : 'Selecciona un producto para ver el stock.'}
              >
                <TextInput type="number" min="1" step="1" value={form.quantity} onChange={(event) => set('quantity', event.target.value)} />
              </Field>
              <Field label="Notas del despacho" hint="Dirección, horario o instrucciones especiales.">
                <TextInput value={form.notes} onChange={(event) => set('notes', event.target.value)} placeholder="Observaciones de la entrega" />
              </Field>
            </div>
          </FormSection>
        </div>

        <aside className="transaction-aside">
          <div className="transaction-summary">
            <div className="summary-box-head">
              <span className="eyebrow">Resumen de la factura</span>
              <span className="summary-chip">{form.payment_condition === 'credito' ? 'Crédito' : 'Contado'}</span>
            </div>
            <div className="summary-customer">
              <UserPlus size={18} />
              <div>
                <strong>{form.customerMode === 'new' ? (form.customer_name || 'Cliente nuevo') : (meta.customers.find((c) => String(c.id) === String(form.customer_id))?.name || 'Sin cliente')}</strong>
                <small>{form.payment_condition === 'credito' ? `Vence ${formatDate(form.due_date)}` : `Cobro ${formatDate(form.money_entry_date)} · ${methodLabel(form.payment_method)}`}</small>
              </div>
            </div>
            <div className="summary-line"><span>Producto</span><strong>{formatNumber(quantity)} · {formatCurrency(unitPrice)}</strong></div>
            <div className="summary-line"><span>Subtotal producto</span><strong>{formatCurrency(subtotal)}</strong></div>
            <div className="summary-line"><span>Cargue {form.loading_type === 'credito' ? '(crédito)' : ''}</span><strong>{formatCurrency(loading)}</strong></div>
            <div className="summary-line divider"><span>Total factura</span><strong>{formatCurrency(total)}</strong></div>
            {gmf > 0 && <div className="summary-line subtle"><span>4x1000 estimado</span><strong>- {formatCurrency(gmf)}</strong></div>}
            <div className="summary-line subtle"><span>Neto estimado a caja</span><strong>{formatCurrency(total - gmf)}</strong></div>
            {form.payment_condition === 'credito' && (
              <div className="summary-line credit"><span>Saldo a cartera</span><strong>{formatCurrency(total)}</strong></div>
            )}
            <div className="summary-note">
              <span className="summary-note-icon"><ReceiptText size={15} /></span>
              <p>El inventario se descuenta de inmediato y el costo de ventas se calcula con el promedio ponderado actual.</p>
            </div>
          </div>
        </aside>
      </form>
    </Modal>
  );
}

