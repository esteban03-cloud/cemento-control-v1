import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  Check,
  Landmark,
  LockKeyhole,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  WalletCards
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, DataTable, Pagination, SummaryTile, ErrorPanel, DownloadMenu, IconButton, StatusBadge } from '../components/DataDisplay.jsx';
import { Modal, ConfirmDialog } from '../components/Modal.jsx';
import { Field, TextInput, Select, Textarea, Segmented, MoneyInput, InlineNotice } from '../components/Forms.jsx';
import {
  categoryLabel,
  classNames,
  currentMonth,
  formatCurrency,
  formatDate,
  formatNumber,
  methodLabel,
  monthBounds,
  monthLabel,
  monthOptions,
  todayISO
} from '../utils.js';

const DEFAULT_CATEGORIES = {
  ingreso: ['ventas', 'cobros', 'aportes', 'otros'],
  egreso: ['compras', 'flete', 'descargue', 'cargue', 'nómina', 'arriendo', 'servicios', 'gmf', 'impuestos', 'otros']
};

export default function Cash() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [type, setType] = useState('');
  const [method, setMethod] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingMovement, setEditingMovement] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const months = useMemo(() => monthOptions(18), []);
  const bounds = monthBounds(month);
  const canWrite = hasPermission('caja:write');
  const categories = data?.categories?.length ? data.categories : DEFAULT_CATEGORIES.egreso;

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        from: bounds.start,
        to: bounds.end,
        page: String(page),
        limit: '30'
      });
      if (type) params.set('type', type);
      if (method) params.set('method', method);
      if (category) params.set('category', category);
      setData(await api.get(`/cash?${params.toString()}`));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [month, type, method, category, page]);

  const clearFilters = () => {
    setType('');
    setMethod('');
    setCategory('');
    setPage(1);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/cash/${deleteTarget.id}`);
      toast.success('Movimiento de caja eliminado.');
      setDeleteTarget(null);
      if (page > 1 && data?.data?.length === 1) setPage(page - 1);
      else load(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      key: 'movement_date',
      label: 'Fecha',
      render: (row) => <div className="table-primary-cell"><span>{formatDate(row.movement_date)}</span><small>#{row.id}</small></div>
    },
    {
      key: 'description',
      label: 'Descripción',
      render: (row) => (
        <div>
          <span className="table-primary">{row.description || 'Sin descripción'}</span>
          <small className="table-subline">{categoryLabel(row.category)} · {methodLabel(row.method)}</small>
        </div>
      )
    },
    {
      key: 'type',
      label: 'Tipo',
      render: (row) => <StatusBadge status={row.type === 'ingreso' ? 'Ingreso' : 'Egreso'} tone={row.type === 'ingreso' ? 'green' : 'red'} />
    },
    {
      key: 'amount',
      label: 'Valor',
      align: 'right',
      render: (row) => (
        <strong className={classNames('amount-sign', row.type === 'ingreso' ? 'positive' : 'negative')}>
          {row.type === 'ingreso' ? '+' : '−'} {formatCurrency(row.amount)}
        </strong>
      )
    },
    {
      key: 'origin',
      label: 'Origen',
      hideOnMobile: true,
      render: (row) => (
        <div className="table-primary-cell">
          <span>{row.auto ? 'Automático' : 'Manual'}</span>
          <small>{row.created_by_name || 'Sistema'}</small>
        </div>
      )
    },
    {
      key: 'actions',
      label: 'Acciones',
      align: 'right',
      render: (row) => (
        canWrite ? (
          row.auto ? (
            <div className="row-actions">
              <IconButton
                label="Movimiento automático vinculado a su origen (Venta, Compra, Cartera)"
                icon={LockKeyhole}
                onClick={() => toast.info('Este movimiento se originó automáticamente por una venta, compra, cobro o pago. Si deseas corregirlo o eliminarlo, hazlo desde su respectivo registro.')}
              />
            </div>
          ) : (
            <div className="row-actions">
              <IconButton label="Editar movimiento" icon={Pencil} onClick={() => { setEditingMovement(row); setFormOpen(true); }} />
              <IconButton label="Eliminar movimiento" icon={Trash2} variant="danger" onClick={() => setDeleteTarget(row)} />
            </div>
          )
        ) : null
      )
    }
  ];

  const summary = data?.summary;
  const opening = summary?.opening;
  const closing = summary?.closing;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Tesorería"
        title="Caja y bancos"
        description="Disponibilidad, ingresos y egresos de la operación con saldo en tiempo real."
        actions={(
          <>
            {hasPermission('reportes:export') && (
              <DownloadMenu
                label="Exportar"
                items={[
                  { label: 'Excel (.xlsx)', path: `/export/cash?format=xlsx&from=${bounds.start}&to=${bounds.end}` },
                  { label: 'CSV (.csv)', path: `/export/cash?format=csv&from=${bounds.start}&to=${bounds.end}` }
                ]}
              />
            )}
            {canWrite && <button type="button" className="btn btn-primary" onClick={() => { setEditingMovement(null); setFormOpen(true); }}><Plus size={17} /> Nuevo movimiento</button>}
          </>
        )}
      />

      <div className="cash-hero">
        <div className="cash-hero-main">
          <span className="eyebrow">Disponibilidad total</span>
          <strong>{formatCurrency(closing || 0)}</strong>
          <span className="cash-hero-caption">Saldo de cierre del período consultado</span>
          <div className="cash-split">
            <div><span><WalletCards size={15} /> Efectivo</span><strong>{formatCurrency(summary?.closingCash || 0)}</strong></div>
            <div><span><Landmark size={15} /> Bancos</span><strong>{formatCurrency(summary?.closingBank || 0)}</strong></div>
          </div>
        </div>
        <div className="cash-hero-aside">
          <span className="eyebrow">Movimiento del período</span>
          <div className="cash-flow-line income"><ArrowDownLeft size={16} /><span>Ingresos</span><strong>{formatCurrency(summary?.income || 0)}</strong></div>
          <div className="cash-flow-line expense"><ArrowUpRight size={16} /><span>Egresos</span><strong>{formatCurrency(summary?.expense || 0)}</strong></div>
          <div className="cash-flow-line net"><span>Flujo neto</span><strong>{formatCurrency(summary?.net || 0)}</strong></div>
          <small>{formatNumber(summary?.count || 0)} movimientos en {monthLabel(month).toLowerCase()}</small>
        </div>
      </div>

      <div className="summary-grid summary-grid-4">
        <SummaryTile label="Saldo inicial" value={formatCurrency(opening || 0)} icon={CalendarDays} />
        <SummaryTile label="Caja al cierre" value={formatCurrency(summary?.closingCash || 0)} icon={WalletCards} />
        <SummaryTile label="Bancos al cierre" value={formatCurrency(summary?.closingBank || 0)} icon={Landmark} />
        <SummaryTile label="Flujo neto" value={formatCurrency(summary?.net || 0)} icon={summary?.net >= 0 ? ArrowDownLeft : ArrowUpRight} tone={summary?.net >= 0 ? 'green' : 'red'} />
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
            <ArrowDownLeft size={15} />
            <select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}>
              <option value="">Todos los tipos</option>
              <option value="ingreso">Ingresos</option>
              <option value="egreso">Egresos</option>
            </select>
          </label>
          <label className="filter-control">
            <Landmark size={15} />
            <select value={method} onChange={(event) => { setMethod(event.target.value); setPage(1); }}>
              <option value="">Todos los medios</option>
              <option value="efectivo">Efectivo</option>
              <option value="bancos">Bancos</option>
            </select>
          </label>
          <label className="filter-control">
            <Banknote size={15} />
            <select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }}>
              <option value="">Todas las categorías</option>
              {categories.map((item) => <option key={item} value={item}>{categoryLabel(item)}</option>)}
            </select>
          </label>
        </div>
        <button type="button" className="btn btn-ghost btn-small" onClick={clearFilters}><RotateCcw size={14} /> Limpiar</button>
      </div>

      {error && <ErrorPanel error={error} onRetry={load} />}
      {!error && (
        <DataTable
          columns={columns}
          rows={data?.data || []}
          loading={loading}
          emptyTitle="No hay movimientos con estos filtros"
          emptyDescription="Prueba con otro período o registra un movimiento manual."
          emptyAction={canWrite ? <button type="button" className="btn btn-small btn-primary" onClick={() => setFormOpen(true)}><Plus size={15} /> Nuevo movimiento</button> : null}
          footer={data?.pagination ? <Pagination page={data.pagination.page} pages={data.pagination.pages} total={data.pagination.total} limit={data.pagination.limit} onChange={setPage} label="movimientos" /> : null}
        />
      )}

      <div className="footnote-box">
        <LockKeyhole size={15} />
        <span>Los movimientos generados por ventas, compras, abonos y pagos se editan desde su operación de origen para mantener la trazabilidad.</span>
      </div>

      <CashFormModal
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditingMovement(null); }}
        categories={categories}
        initial={editingMovement}
        onSaved={() => load(true)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        busy={deleting}
        title="Eliminar movimiento de caja"
        message={`¿Eliminar el movimiento "${deleteTarget?.description}" por ${formatCurrency(deleteTarget?.amount || 0)}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar movimiento"
      />
    </div>
  );
}

function CashFormModal({ open, onClose, categories, initial, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    movement_date: todayISO(),
    type: 'ingreso',
    amount: '',
    method: 'efectivo',
    category: '',
    description: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(initial ? {
      movement_date: initial.movement_date || todayISO(),
      type: initial.type || 'ingreso',
      amount: String(initial.amount ?? ''),
      method: initial.method || 'efectivo',
      category: initial.category || '',
      description: initial.description || ''
    } : {
      movement_date: todayISO(),
      type: 'ingreso',
      amount: '',
      method: 'efectivo',
      category: '',
      description: ''
    });
    setError('');
  }, [open, initial]);

  const setType = (value) => setForm((current) => ({ ...current, type: value }));
  const suggestionList = [...new Set([
    ...DEFAULT_CATEGORIES.ingreso,
    ...DEFAULT_CATEGORIES.egreso,
    ...(categories || []),
    form.category
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!(Number(form.amount) > 0)) {
      setError('Ingresa un valor mayor que cero.');
      return;
    }
    if (!form.description.trim()) {
      setError('Escribe una descripción para identificar el movimiento.');
      return;
    }
    if (!form.category.trim()) {
      setError('Escribe o selecciona una categoría.');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, amount: Number(form.amount), category: form.category.trim().toLowerCase() };
      if (initial) {
        await api.put(`/cash/${initial.id}`, payload);
        toast.success('Movimiento de caja actualizado.');
      } else {
        await api.post('/cash', payload);
        toast.success('Movimiento de caja registrado.');
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Editar movimiento de caja' : 'Nuevo movimiento de caja'}
      subtitle={initial ? 'Corrige la fecha, el valor, la categoría o la descripción del movimiento manual.' : 'Registra un ingreso o egreso que no provenga de una venta, compra o abono.'}
      size="sm"
      busy={saving}
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" form="cash-form" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : <><Check size={16} /> {initial ? 'Guardar cambios' : 'Registrar movimiento'}</>}</button>
        </>
      )}
    >
      <form id="cash-form" onSubmit={submit} className="stack-16">
        {error && <div className="inline-notice tone-danger">{error}</div>}
        <Field label="Tipo de movimiento">
          <Segmented value={form.type} onChange={setType} options={[{ value: 'ingreso', label: 'Ingreso' }, { value: 'egreso', label: 'Egreso' }]} />
        </Field>
        <Field label="Valor" required>
          <MoneyInput value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} autoFocus />
        </Field>
        <div className="form-grid cols-2">
          <Field label="Fecha" required>
            <TextInput type="date" value={form.movement_date} max={todayISO()} onChange={(event) => setForm({ ...form, movement_date: event.target.value })} />
          </Field>
          <Field label="Medio">
            <Select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}>
              <option value="efectivo">Efectivo</option>
              <option value="bancos">Bancos</option>
            </Select>
          </Field>
        </div>
        <div className="form-grid cols-2">
          <Field
            label="Categoría"
            required
            hint="Selecciona una categoría registrada o ingresa una nueva."
          >
            <Select
              value={suggestionList.includes(form.category?.toLowerCase()) ? form.category.toLowerCase() : '__custom__'}
              onChange={(event) => {
                if (event.target.value === '__custom__') {
                  setForm({ ...form, category: '' });
                } else {
                  setForm({ ...form, category: event.target.value });
                }
              }}
            >
              <option value="" disabled>Selecciona una categoría…</option>
              {suggestionList.map((item) => (
                <option key={item} value={item.toLowerCase()}>
                  {categoryLabel(item)}
                </option>
              ))}
              <option value="__custom__">➕ Registrar nueva categoría…</option>
            </Select>
          </Field>
          {(!suggestionList.includes(form.category?.toLowerCase()) || form.category === '') && (
            <Field label="Nombre de la nueva categoría" required hint="Escribe el nombre de la categoría para registrarla.">
              <TextInput
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                placeholder="Ej. donación, combustible, viáticos…"
                autoFocus
                required
              />
            </Field>
          )}
        </div>
        <Field label="Descripción" required hint="Indica el concepto para facilitar la conciliación.">
          <Textarea rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Ej. pago de arriendo de bodega" />
        </Field>
        <InlineNotice tone="info">Los movimientos manuales no se vinculan a inventario ni cartera. Los movimientos automáticos se editan desde su operación de origen.</InlineNotice>
      </form>
    </Modal>
  );
}
