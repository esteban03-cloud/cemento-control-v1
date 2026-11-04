import { useEffect, useMemo, useState } from 'react';
import {
  Calculator,
  CircleDollarSign,
  Layers3,
  Pencil,
  Plus,
  Settings2,
  Trash2
} from 'lucide-react';
import { api } from '../api.js';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, SummaryTile, ErrorPanel, PageLoader, DataTable, IconButton, DownloadMenu, StatusBadge } from '../components/DataDisplay.jsx';
import { Modal, ConfirmDialog } from '../components/Modal.jsx';
import { Field, TextInput, Textarea, Select, MoneyInput, Checkbox, InlineNotice } from '../components/Forms.jsx';
import {
  currentMonth,
  formatCurrency,
  formatNumber,
  formatPercent,
  monthLabel,
  monthOptions
} from '../utils.js';

const CATEGORY_SUGGESTIONS = [
  'Arriendo bodega',
  'Nómina administrativa',
  'Energía y servicios',
  'Contabilidad y honorarios',
  'Seguros y otros',
  'Mantenimiento bodega',
  'Transporte administrativo',
  'Publicidad y ventas'
];

const ALLOCATION_METHODS = {
  volumen: 'Por volumen (bultos vendidos)',
  valor_venta: 'Por valor de venta'
};

export default function CostAllocation() {
  const toast = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [costs, setCosts] = useState([]);
  const [costing, setCosting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const months = useMemo(() => monthOptions(18), []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [costsResponse, costingResponse] = await Promise.all([
        api.get(`/indirect-costs?month=${month}`),
        api.get(`/costing?month=${month}`)
      ]);
      setCosts(costsResponse.data || []);
      setCosting(costingResponse);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [month]);

  const totals = costing?.totals;
  const fixed = costs.filter((row) => row.is_fixed).reduce((sum, row) => sum + Number(row.amount), 0);
  const variable = costs.filter((row) => !row.is_fixed).reduce((sum, row) => sum + Number(row.amount), 0);
  const autoGmf = costing?.indirect?.find((row) => row.is_auto)?.amount || 0;

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/indirect-costs/${deleteTarget.id}`);
      toast.success('Costo indirecto eliminado.');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      key: 'category',
      label: 'Concepto',
      render: (row) => <div><strong className="table-primary">{row.category}</strong><small className="table-subline">{row.description || 'Sin descripción'}</small></div>
    },
    { key: 'amount', label: 'Valor', align: 'right', render: (row) => <strong>{formatCurrency(row.amount)}</strong> },
    { key: 'allocation_method', label: 'Método', render: (row) => ALLOCATION_METHODS[row.allocation_method] || row.allocation_method },
    { key: 'is_fixed', label: 'Tipo', render: (row) => <StatusBadge status={row.is_fixed ? 'Fijo' : 'Variable'} tone={row.is_fixed ? 'blue' : 'neutral'} dot={false} /> },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        <div className="row-actions">
          <IconButton label="Editar costo" icon={Pencil} onClick={() => { setEditing(row); setFormOpen(true); }} />
          <IconButton label="Eliminar costo" icon={Trash2} variant="danger" onClick={() => setDeleteTarget(row)} />
        </div>
      )
    }
  ];

  if (loading && !costing) return <div className="page"><PageLoader label="Cargando costos indirectos…" /></div>;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Distribución de gastos"
        title="Asignación de costos"
        description="Distribuye arriendo, nómina, energía y otros gastos indirectos entre los productos vendidos."
        actions={(
          <>
            <label className="month-select">
              <CircleDollarSign size={16} />
              <select value={month} onChange={(event) => setMonth(event.target.value)}>
                {months.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <button type="button" className="btn btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={17} /> Agregar costo</button>
          </>
        )}
      />

      {error && <ErrorPanel error={error} onRetry={load} />}

      <div className="summary-grid summary-grid-4">
        <SummaryTile label="Costos indirectos del mes" value={formatCurrency(totals?.indirect || 0)} icon={Layers3} hint={`${formatNumber(costs.length)} conceptos configurados`} />
        <SummaryTile label="Costos fijos" value={formatCurrency(fixed + autoGmf)} icon={CircleDollarSign} hint="Base del punto de equilibrio" />
        <SummaryTile label="Costos variables" value={formatCurrency(variable)} icon={Calculator} hint="Asignados por actividad" />
        <SummaryTile label="Margen después de indirectos" value={formatPercent(totals?.margin || 0)} icon={Settings2} tone={(totals?.margin || 0) >= 15 ? 'green' : 'amber'} hint={`Utilidad ${formatCurrency(totals?.profit || 0)}`} />
      </div>

      <div className="two-column-layout">
        <div className="panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Configuración</span><h3>Costos indirectos de {monthLabel(month).toLowerCase()}</h3><p>Cada concepto se distribuye automáticamente entre los productos.</p></div>
          </div>
          <DataTable
            columns={columns}
            rows={costs}
            loading={false}
            compact
            emptyTitle="Sin costos indirectos"
            emptyDescription="Agrega arriendo, nómina y otros gastos del período para completar el costeo."
            emptyAction={<button type="button" className="btn btn-small btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={15} /> Agregar costo</button>}
          />
          {autoGmf > 0 && (
            <InlineNotice tone="info">
              El 4x1000 de {formatCurrency(autoGmf)} se agrega automáticamente a la asignación por valor de venta.
            </InlineNotice>
          )}
        </div>

        <div className="panel allocation-summary-panel">
          <div className="panel-heading">
            <div><span className="eyebrow">Resultado</span><h3>Costos indirectos por producto</h3></div>
          </div>
          <div className="mini-table-scroll">
            <table className="mini-table">
              <thead><tr><th>Producto</th><th className="align-right">Ingresos</th><th className="align-right">Indirectos</th><th className="align-right">Margen</th></tr></thead>
              <tbody>
                {costing?.rows?.map((row) => (
                  <tr key={row.product_id}>
                    <td><div className="table-primary">{row.name}</div><small>{formatNumber(row.quantity)} bultos</small></td>
                    <td className="align-right">{formatCurrency(row.revenue)}</td>
                    <td className="align-right">{formatCurrency(row.indirect_total)}</td>
                    <td className="align-right"><strong>{formatPercent(row.margin)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="allocation-methods">
            <h4>Métodos disponibles</h4>
            <p><strong>Por volumen:</strong> reparte el costo según los bultos vendidos de cada producto. Ideal para gastos logísticos.</p>
            <p><strong>Por valor de venta:</strong> reparte el costo según los ingresos generados. Ideal para gastos administrativos y financieros.</p>
          </div>
        </div>
      </div>

      <CostForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        month={month}
        initial={editing}
        onSaved={() => { load(); setFormOpen(false); }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        busy={deleting}
        title="Eliminar costo indirecto"
        message={`¿Eliminar "${deleteTarget?.category}" por ${formatCurrency(deleteTarget?.amount || 0)}? El costeo del período se recalculará.`}
        confirmLabel="Eliminar costo"
      />
    </div>
  );
}

function CostForm({ open, onClose, month, initial, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({
      category: initial?.category || '',
      description: initial?.description || '',
      amount: String(initial?.amount || ''),
      allocation_method: initial?.allocation_method || 'volumen',
      is_fixed: initial ? Boolean(initial.is_fixed) : true
    });
    setError('');
  }, [open, initial]);

  if (!form) return null;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.category.trim()) {
      setError('Escribe la categoría del costo.');
      return;
    }
    if (!(Number(form.amount) > 0)) {
      setError('El valor debe ser mayor que cero.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        month,
        category: form.category.trim(),
        description: form.description,
        amount: Number(form.amount),
        allocation_method: form.allocation_method,
        is_fixed: form.is_fixed
      };
      if (initial) await api.put(`/indirect-costs/${initial.id}`, payload);
      else await api.post('/indirect-costs', payload);
      toast.success(initial ? 'Costo indirecto actualizado.' : 'Costo indirecto agregado.');
      onSaved?.();
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
      title={initial ? 'Editar costo indirecto' : 'Agregar costo indirecto'}
      subtitle={`Se aplicará al período ${monthLabel(month)}.`}
      size="sm"
      busy={saving}
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" form="cost-form" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar costo'}</button>
        </>
      )}
    >
      <form id="cost-form" onSubmit={submit} className="stack-16">
        {error && <div className="inline-notice tone-danger">{error}</div>}
        <Field label="Categoría / concepto" required>
          <TextInput list="cost-category-options" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Ej. Arriendo bodega" autoFocus />
          <datalist id="cost-category-options">
            {CATEGORY_SUGGESTIONS.map((item) => <option value={item} key={item} />)}
          </datalist>
        </Field>
        <Field label="Descripción">
          <Textarea rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Detalle del gasto" />
        </Field>
        <Field label="Valor mensual" required>
          <MoneyInput value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} />
        </Field>
        <Field label="Método de asignación">
          <Select value={form.allocation_method} onChange={(event) => setForm({ ...form, allocation_method: event.target.value })}>
            {Object.entries(ALLOCATION_METHODS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Select>
        </Field>
        <Checkbox label="Costo fijo" description="Se usa para calcular el punto de equilibrio del negocio." checked={form.is_fixed} onChange={(value) => setForm({ ...form, is_fixed: value })} />
      </form>
    </Modal>
  );
}
