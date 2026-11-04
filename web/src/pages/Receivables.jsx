import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clock3,
  Download,
  Eye,
  HandCoins,
  Landmark,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Search,
  UserRound
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, DataTable, Pagination, SummaryTile, StatusBadge, ErrorPanel, DownloadMenu, IconButton, Avatar } from '../components/DataDisplay.jsx';
import { DocumentModal, DocumentFacts, DocumentItems, DocumentTotals, DocumentSection, DocumentPayments } from '../components/DocumentModal.jsx';
import PaymentModal from '../components/PaymentModal.jsx';
import {
  classNames,
  formatCurrency,
  formatDate,
  formatNumber,
  methodLabel,
  todayISO
} from '../utils.js';

const STATUS_OPTIONS = [
  ['todas', 'Todos los estados'],
  ['pendiente', 'Pendientes'],
  ['por_vencer', 'Por vencer'],
  ['vencida', 'Vencidas'],
  ['pagada', 'Pagadas']
];

export default function Receivables() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState('todas');
  const [customerId, setCustomerId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState('oldest');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editingPayment, setEditingPayment] = useState(null);
  const canPay = hasPermission('cxc:pay');
  const canExport = hasPermission('reportes:export');

  useEffect(() => {
    api.get('/meta').then(setMeta).catch((err) => toast.error(err.message));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status, page: String(page), limit: '20', sort });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      if (customerId) params.set('customer_id', customerId);
      if (search) params.set('search', search);
      setData(await api.get(`/receivables?${params.toString()}`));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [status, customerId, search, page, from, to, sort]);

  const openDetail = async (row) => {
    try {
      const response = await api.get(`/receivables/${row.id}/payments`);
      setDetail(response.data);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const refreshDetail = async () => {
    if (!detail) return;
    try {
      const response = await api.get(`/receivables/${detail.id}/payments`);
      setDetail(response.data);
      await load(true);
    } catch (err) { toast.error(err.message); }
  };

  const deletePayment = async (payment) => {
    if (!detail || !window.confirm('¿Eliminar este abono? El saldo y los movimientos de caja se recalcularán.')) return;
    try {
      await api.delete(`/receivables/${detail.id}/payments/${payment.id}`);
      toast.success('Abono eliminado y caja recalculada.');
      await refreshDetail();
    } catch (err) { toast.error(err.message); }
  };

  const columns = [
    {
      key: 'invoice_number',
      label: 'Factura',
      render: (row) => (
        <div className="table-primary-cell">
          <span className="invoice-code">{row.invoice_number}</span>
          <small>Entrega {formatDate(row.delivery_date)}</small>
        </div>
      )
    },
    {
      key: 'customer_name',
      label: 'Cliente',
      render: (row) => (
        <div className="person-cell">
          <Avatar name={row.customer_name} size={30} tone={row.id} />
          <div><strong className="table-primary">{row.customer_name}</strong><small>{row.customer_phone || row.customer_nit || 'Sin contacto'}</small></div>
        </div>
      )
    },
    {
      key: 'due_date',
      label: 'Vencimiento',
      render: (row) => (
        <div>
          <span className={classNames(row.overdue_days > 0 && 'text-danger')}>{formatDate(row.due_date)}</span>
          <small className="table-subline">{row.overdue_days > 0 ? `${row.overdue_days} días vencida` : 'Vigente'}</small>
        </div>
      )
    },
    { key: 'amount', label: 'Total', align: 'right', render: (row) => formatCurrency(row.amount) },
    {
      key: 'balance',
      label: 'Saldo',
      align: 'right',
      render: (row) => <strong className={classNames('amount', row.balance > 0 && 'amount-due')}>{formatCurrency(row.balance)}</strong>
    },
    { key: 'status', label: 'Estado', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        <div className="row-actions">
          <IconButton label="Ver cuenta" icon={Eye} onClick={() => openDetail(row)} />
          {canPay && row.balance > 0 && (
            <button type="button" className="btn btn-small btn-secondary" onClick={() => setPaymentTarget(row)}>
              <Plus size={14} /> Abonar
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Cartera"
        title="Cuentas por cobrar"
        description="Facturas pendientes, vencimientos y abonos. Prioriza el recaudo y protege la caja."
        actions={canExport && (
          <DownloadMenu
            label="Exportar cartera"
            items={[
              { label: 'Excel (.xlsx)', path: '/export/receivables?format=xlsx' },
              { label: 'CSV (.csv)', path: '/export/receivables?format=csv' }
            ]}
          />
        )}
      />

      <div className="summary-grid summary-grid-4">
        <SummaryTile label="Cartera pendiente" value={formatCurrency(data?.summary.pending || 0)} icon={HandCoins} hint="Saldo de facturas a crédito" />
        <SummaryTile label="Cartera vencida" value={formatCurrency(data?.summary.overdue || 0)} icon={Clock3} tone={data?.summary.overdue ? 'red' : 'default'} hint={`${formatNumber(data?.summary.overdueCount || 0)} facturas requieren cobro`} />
        <SummaryTile label="Por vencer en 7 días" value={formatCurrency(data?.summary.upcoming || 0)} icon={Landmark} hint="Programa recordatorios" />
        <SummaryTile label="Recaudado este mes" value={formatCurrency(data?.summary.collectedMonth || 0)} icon={Check} tone="green" hint="Incluye abonos parciales" />
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          <label className="filter-control">
            <Check size={15} />
            <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="filter-control">
            <UserRound size={15} />
            <select value={customerId} onChange={(event) => { setCustomerId(event.target.value); setPage(1); }}>
              <option value="">Todos los clientes</option>
              {meta?.customers?.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </label>
        </div>
        <div className="filter-group">
          <label className="filter-control"><span>Desde</span><input type="date" value={from} max={to || undefined} onChange={(event) => { setFrom(event.target.value); setPage(1); }} /></label>
          <label className="filter-control"><span>Hasta</span><input type="date" value={to} min={from || undefined} onChange={(event) => { setTo(event.target.value); setPage(1); }} /></label>
          <label className="filter-control"><span>Orden</span><select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="oldest">Más antiguas primero</option><option value="newest">Más recientes primero</option></select></label>
        </div>
        <div className="search-box">
          <Search size={16} />
          <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar factura o cliente…" aria-label="Buscar cartera" />
        </div>
      </div>

      {error && <ErrorPanel error={error} onRetry={load} />}
      {!error && (
        <DataTable
          columns={columns}
          rows={data?.data || []}
          loading={loading}
          emptyTitle="No hay cuentas por cobrar con estos filtros"
          emptyDescription="Las ventas a crédito aparecen aquí automáticamente."
          footer={data?.pagination ? <Pagination page={data.pagination.page} pages={data.pagination.pages} total={data.pagination.total} limit={data.pagination.limit} onChange={setPage} label="cuentas" /> : null}
        />
      )}

      <div className="footnote-box">
        <HandCoins size={15} />
        <span>Un abono se registra como ingreso en caja o bancos y actualiza el saldo de la factura en tiempo real. Si el medio es bancos, se descuenta automáticamente el 4x1000.</span>
      </div>

      {meta && (
        <PaymentModal
          open={Boolean(paymentTarget)}
          onClose={() => setPaymentTarget(null)}
          onSaved={() => load(true)}
          type="receivable"
          record={paymentTarget}
          gmfRate={meta.fiscal?.gmfRate}
        />
      )}

      {detail && editingPayment && <PaymentModal open onClose={() => setEditingPayment(null)} onSaved={refreshDetail} type="receivable" record={detail} payment={editingPayment} gmfRate={meta?.fiscal?.gmfRate} />
      )}

      {detail && <ReceivableDocument detail={detail} open onClose={() => setDetail(null)} onEditPayment={setEditingPayment} onDeletePayment={deletePayment} />}
    </div>
  );
}

function ReceivableDocument({ detail, open, onClose, onEditPayment, onDeletePayment }) {
  const columns = [
    { key: 'payment_date', label: 'Fecha', render: (row) => formatDate(row.payment_date) },
    { key: 'method', label: 'Medio', render: (row) => methodLabel(row.method) },
    { key: 'amount', label: 'Valor', align: 'right', render: (row) => formatCurrency(row.amount) },
    { key: 'fee', label: '4x1000', align: 'right', render: (row) => row.fee ? formatCurrency(row.fee) : '—' },
    { key: 'notes', label: 'Notas', render: (row) => row.notes || '—' },
    { key: 'actions', label: 'Acciones', className: 'document-no-export', render: (row) => <div className="row-actions"><IconButton label="Editar abono" icon={Pencil} onClick={() => onEditPayment?.(row)} /><IconButton label="Eliminar abono" icon={Trash2} variant="danger" onClick={() => onDeletePayment?.(row)} /></div> }
  ];
  return (
    <DocumentModal
      open={open}
      onClose={onClose}
      kind="Cuenta por cobrar"
      number={detail.invoice_number}
      date={detail.due_date}
      status={detail.amount - detail.paid <= 0.5 ? 'Pagada' : 'Pendiente'}
      fileName={`cxc-${detail.invoice_number}`}
      subtitle={detail.customer_name}
    >
      <div className="document-parties">
        <div>
          <span>Cliente</span>
          <strong>{detail.customer_name}</strong>
          <p>Factura {detail.invoice_number}</p>
          <p>Vencimiento original: {formatDate(detail.due_date)}</p>
        </div>
        <div>
          <span>Estado de la obligación</span>
          <strong>{formatCurrency(detail.balance)} pendientes</strong>
          <p>Total facturado: {formatCurrency(detail.amount)}</p>
          <p>Abonado: {formatCurrency(detail.paid)}</p>
        </div>
      </div>
      <DocumentSection title="Detalle de la factura">
        <DocumentItems
          columns={[
            { key: 'product', label: 'Producto' },
            { key: 'quantity', label: 'Cantidad', align: 'right' },
            { key: 'unit_price', label: 'Precio unitario', align: 'right' },
            { key: 'subtotal', label: 'Subtotal', align: 'right' }
          ]}
          rows={[{
            id: detail.sale_id,
            product: detail.product_name,
            quantity: `${formatNumber(detail.quantity)} ${detail.product_unit || 'unidades'}`,
            unit_price: formatCurrency(detail.unit_price),
            subtotal: formatCurrency(detail.subtotal)
          }]}
        />
      </DocumentSection>
      <DocumentTotals
        items={[
          { label: 'Valor factura', value: formatCurrency(detail.amount) },
          { label: 'Abonos recibidos', value: formatCurrency(detail.paid) },
          { label: 'Saldo pendiente', value: formatCurrency(detail.balance), strong: true, tone: detail.balance > 0 ? 'warn' : 'green' }
        ]}
        note="El documento refleja los abonos registrados en CementoControl."
      />
      {detail.payments?.length > 0
        ? <DocumentPayments payments={detail.payments} columns={columns} />
        : <DocumentSection title="Abonos registrados"><p className="document-empty-note">Aún no hay abonos registrados para esta factura.</p></DocumentSection>}
    </DocumentModal>
  );
}
