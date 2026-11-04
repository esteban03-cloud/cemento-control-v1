import { useEffect, useState } from 'react';
import {
  Banknote,
  CalendarClock,
  Check,
  Clock3,
  Eye,
  Landmark,
  Plus,
  Search,
  Truck
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, DataTable, Pagination, SummaryTile, StatusBadge, ErrorPanel, DownloadMenu, IconButton, Avatar } from '../components/DataDisplay.jsx';
import { DocumentModal, DocumentItems, DocumentTotals, DocumentPayments } from '../components/DocumentModal.jsx';
import PaymentModal from '../components/PaymentModal.jsx';
import {
  classNames,
  conceptLabel,
  formatCurrency,
  formatDate,
  formatNumber,
  methodLabel
} from '../utils.js';

const STATUS_OPTIONS = [
  ['todas', 'Todos los estados'],
  ['pendiente', 'Pendientes'],
  ['proxima', 'Próximas a vencer'],
  ['vencida', 'Vencidas'],
  ['pagada', 'Pagadas']
];

const CONCEPTS = [
  ['', 'Todos los conceptos'],
  ['producto', 'Producto'],
  ['flete', 'Flete'],
  ['descargue', 'Descargue'],
  ['cargue', 'Cargue']
];

export default function Payables() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState('todas');
  const [concept, setConcept] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [detail, setDetail] = useState(null);
  const canPay = hasPermission('cxp:pay');
  const canExport = hasPermission('reportes:export');

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status, page: String(page), limit: '20' });
      if (concept) params.set('concept', concept);
      if (search) params.set('search', search);
      setData(await api.get(`/payables?${params.toString()}`));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [status, concept, search, page]);

  const openDetail = async (row) => {
    try {
      const response = await api.get(`/payables/${row.id}/payments`);
      setDetail(response.data);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const columns = [
    {
      key: 'provider_name',
      label: 'Proveedor',
      render: (row) => (
        <div className="person-cell">
          <Avatar name={row.provider_name} size={30} tone={row.id + 2} />
          <div>
            <strong className="table-primary">{row.provider_name}</strong>
            <small>{conceptLabel(row.concept)} · {row.description || row.doc_number || row.invoice_number || 'Sin documento'}</small>
          </div>
        </div>
      )
    },
    {
      key: 'due_date',
      label: 'Vencimiento',
      render: (row) => (
        <div>
          <span className={classNames(row.overdue_days > 0 && 'text-danger')}>{formatDate(row.due_date)}</span>
          <small className="table-subline">{row.overdue_days > 0 ? `${row.overdue_days} días vencida` : row.status === 'Próxima' ? 'Vence pronto' : 'Vigente'}</small>
        </div>
      )
    },
    {
      key: 'concept',
      label: 'Concepto',
      render: (row) => <StatusBadge status={conceptLabel(row.concept)} tone="blue" dot={false} />
    },
    {
      key: 'amount',
      label: 'Monto',
      align: 'right',
      render: (row) => (
        <div>
          <strong>{formatCurrency(row.amount)}</strong>
          <small className="table-subline">Pagado {formatCurrency(row.paid)}</small>
        </div>
      )
    },
    {
      key: 'balance',
      label: 'Saldo',
      align: 'right',
      render: (row) => <strong className="amount amount-due">{formatCurrency(row.balance)}</strong>
    },
    { key: 'status', label: 'Estado', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        <div className="row-actions">
          <IconButton label="Ver obligación" icon={Eye} onClick={() => openDetail(row)} />
          {canPay && row.balance > 0 && (
            <button type="button" className="btn btn-small btn-secondary" onClick={() => setPaymentTarget(row)}>
              <Plus size={14} /> Pagar
            </button>
          )}
        </div>
      )
    }
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Obligaciones"
        title="Cuentas por pagar"
        description="Controla el producto, flete, descargue y cargue pendiente. Prioriza los vencimientos que presionan la caja."
        actions={canExport && (
          <DownloadMenu
            label="Exportar cartera"
            items={[
              { label: 'Excel (.xlsx)', path: '/export/payables?format=xlsx' },
              { label: 'CSV (.csv)', path: '/export/payables?format=csv' }
            ]}
          />
        )}
      />

      <div className="summary-grid summary-grid-4">
        <SummaryTile label="Total por pagar" value={formatCurrency(data?.summary.pending || 0)} icon={Banknote} hint="Obligaciones vigentes" />
        <SummaryTile label="Vencidas" value={formatCurrency(data?.summary.overdue || 0)} icon={Clock3} tone={data?.summary.overdue ? 'red' : 'default'} hint={`${formatNumber(data?.summary.overdueCount || 0)} obligaciones`} />
        <SummaryTile label="Próximas (≤15 días)" value={formatCurrency(data?.summary.upcoming || 0)} icon={CalendarClock} tone={data?.summary.upcoming ? 'amber' : 'default'} hint="Programa los pagos de la quincena" />
        <SummaryTile label="Pagado este mes" value={formatCurrency(data?.summary.paidMonth || 0)} icon={Check} tone="green" hint="Incluye abonos parciales" />
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
            <Truck size={15} />
            <select value={concept} onChange={(event) => { setConcept(event.target.value); setPage(1); }}>
              {CONCEPTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <div className="search-box">
          <Search size={16} />
          <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar proveedor o descripción…" aria-label="Buscar cartera por pagar" />
        </div>
      </div>

      {error && <ErrorPanel error={error} onRetry={load} />}
      {!error && (
        <DataTable
          columns={columns}
          rows={data?.data || []}
          loading={loading}
          emptyTitle="No hay cuentas por pagar"
          emptyDescription="Las obligaciones a crédito de compras y cargues aparecen aquí."
          footer={data?.pagination ? <Pagination page={data.pagination.page} pages={data.pagination.pages} total={data.pagination.total} limit={data.pagination.limit} onChange={setPage} label="obligaciones" /> : null}
        />
      )}

      <div className="footnote-box">
        <Landmark size={15} />
        <span>El pago se registra como egreso en caja o bancos. Cada concepto conserva su proveedor y su vencimiento para facilitar la conciliación.</span>
      </div>

      <PaymentModal
        open={Boolean(paymentTarget)}
        onClose={() => setPaymentTarget(null)}
        onSaved={() => load(true)}
        type="payable"
        record={paymentTarget}
      />

      {detail && <PayableDocument detail={detail} open onClose={() => setDetail(null)} />}
    </div>
  );
}

function PayableDocument({ detail, open, onClose }) {
  const columns = [
    { key: 'payment_date', label: 'Fecha', render: (row) => formatDate(row.payment_date) },
    { key: 'method', label: 'Medio', render: (row) => methodLabel(row.method) },
    { key: 'amount', label: 'Valor', align: 'right', render: (row) => formatCurrency(row.amount) },
    { key: 'notes', label: 'Notas', render: (row) => row.notes || '—' }
  ];
  return (
    <DocumentModal
      open={open}
      onClose={onClose}
      kind="Cuenta por pagar"
      number={detail.doc_number || detail.invoice_number || detail.id}
      date={detail.due_date}
      status={detail.amount - detail.paid <= 0.5 ? 'Pagada' : 'Pendiente'}
      fileName={`cxp-${detail.id}`}
      subtitle={detail.provider_name}
    >
      <div className="document-parties">
        <div>
          <span>Proveedor</span>
          <strong>{detail.provider_name}</strong>
          <p>Concepto: {conceptLabel(detail.concept)}</p>
          <p>{detail.description || 'Sin descripción'}</p>
        </div>
        <div>
          <span>Obligación</span>
          <strong>{formatCurrency(detail.balance)} pendientes</strong>
          <p>Monto original: {formatCurrency(detail.amount)}</p>
          <p>Vencimiento: {formatDate(detail.due_date)}</p>
        </div>
      </div>
      <DocumentItems
        columns={[
          { key: 'concept', label: 'Concepto' },
          { key: 'description', label: 'Descripción' },
          { key: 'amount', label: 'Monto', align: 'right' },
          { key: 'paid', label: 'Pagado', align: 'right' },
          { key: 'balance', label: 'Saldo', align: 'right' }
        ]}
        rows={[{
          id: detail.id,
          concept: conceptLabel(detail.concept),
          description: detail.description || 'Obligación',
          amount: formatCurrency(detail.amount),
          paid: formatCurrency(detail.paid),
          balance: formatCurrency(detail.balance)
        }]}
      />
      <DocumentTotals
        items={[
          { label: 'Monto de la obligación', value: formatCurrency(detail.amount) },
          { label: 'Pagado', value: formatCurrency(detail.paid) },
          { label: 'Saldo pendiente', value: formatCurrency(detail.balance), strong: true, tone: detail.balance > 0 ? 'warn' : 'green' }
        ]}
        note="Documento de control interno de cuentas por pagar."
      />
      {detail.payments?.length > 0 && <DocumentPayments payments={detail.payments} columns={columns} />}
    </DocumentModal>
  );
}
