import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardList,
  Eye,
  History,
  Package,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Warehouse
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import {
  PageHeader,
  DataTable,
  TabBar,
  SummaryTile,
  StatusBadge,
  Semaforo,
  ErrorPanel,
  EmptyState,
  DownloadMenu,
  IconButton,
  ProgressBar
} from '../components/DataDisplay.jsx';
import { Modal, ConfirmDialog } from '../components/Modal.jsx';
import { Field, TextInput, Select, Textarea, Segmented, MoneyInput, Checkbox, InlineNotice } from '../components/Forms.jsx';
import {
  classNames,
  formatCurrency,
  formatDate,
  formatNumber,
  formatPercent,
  todayISO
} from '../utils.js';

export default function Inventory() {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('stock');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [adjustments, setAdjustments] = useState(null);
  const [adjustmentsLoading, setAdjustmentsLoading] = useState(false);
  const [productForm, setProductForm] = useState({ open: false, product: null });
  const [adjustmentFormOpen, setAdjustmentFormOpen] = useState(false);
  const [kardexProduct, setKardexProduct] = useState(null);
  const [deleteProduct, setDeleteProduct] = useState(null);
  const [deleteAdjustment, setDeleteAdjustment] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const canEdit = hasPermission('productos:write');
  const canAdjust = hasPermission('ajustes:write');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get('/inventory'));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  const loadAdjustments = async () => {
    setAdjustmentsLoading(true);
    try {
      setAdjustments(await api.get('/inventory/adjustments'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setAdjustmentsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (tab === 'adjustments' && !adjustments) loadAdjustments(); }, [tab]);

  const products = useMemo(() => {
    const list = data?.products || [];
    if (!search.trim()) return list;
    const term = search.toLowerCase();
    return list.filter((product) => `${product.code} ${product.name}`.toLowerCase().includes(term));
  }, [data, search]);

  const filteredAdjustments = useMemo(() => {
    const list = adjustments?.data || [];
    if (!search.trim()) return list;
    const term = search.toLowerCase();
    return list.filter((row) => `${row.product_name} ${row.product_code} ${row.reason}`.toLowerCase().includes(term));
  }, [adjustments, search]);

  const confirmDeleteProduct = async () => {
    if (!deleteProduct) return;
    setDeleting(true);
    try {
      await api.delete(`/products/${deleteProduct.id}`);
      toast.success(`Producto "${deleteProduct.name}" eliminado.`);
      setDeleteProduct(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const confirmDeleteAdjustment = async () => {
    if (!deleteAdjustment) return;
    setDeleting(true);
    try {
      await api.delete(`/inventory/adjustments/${deleteAdjustment.id}`);
      toast.success('Ajuste de inventario eliminado y stock recalculado.');
      setDeleteAdjustment(null);
      load();
      loadAdjustments();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const productColumns = [
    {
      key: 'product',
      label: 'Producto',
      render: (row) => (
        <div className="product-cell">
          <span className="product-thumb"><Package size={18} /></span>
          <div>
            <strong className="table-primary">{row.name}</strong>
            <small>{row.code} · {row.unit}</small>
          </div>
        </div>
      )
    },
    {
      key: 'stock',
      label: 'Stock',
      align: 'right',
      render: (row) => (
        <div>
          <strong className={row.stock <= row.min_stock ? 'text-danger' : ''}>{formatNumber(row.stock)}</strong>
          <small className="table-subline">Mín. {formatNumber(row.min_stock)}</small>
        </div>
      )
    },
    { key: 'avg_cost', label: 'Costo promedio', align: 'right', render: (row) => formatCurrency(row.avg_cost) },
    { key: 'sale_price', label: 'Precio venta', align: 'right', render: (row) => row.sale_price > 0 ? formatCurrency(row.sale_price) : <span className="muted">Por definir</span> },
    {
      key: 'margin',
      label: 'Margen',
      render: (row) => (
        <div className="margin-cell">
          <span>{formatPercent(row.margin)}</span>
          <ProgressBar value={Math.max(0, row.margin)} tone={row.margin < 10 ? 'red' : row.margin < 20 ? 'yellow' : 'green'} />
        </div>
      )
    },
    { key: 'inventory_value', label: 'Valor inventario', align: 'right', render: (row) => <strong>{formatCurrency(row.inventory_value)}</strong> },
    { key: 'eoq', label: 'EOQ', align: 'right', render: (row) => <div><span>{formatNumber(row.eoq)}</span><small className="table-subline">{formatPercent(row.stock / (row.eoq || 1) * 100)} del EOQ</small></div> },
    { key: 'status', label: 'Semáforo', render: (row) => <Semaforo tone={row.eoq_status} label={row.eoq_status === 'green' ? 'Equilibrado' : row.eoq_status === 'yellow' ? 'Vigilar' : 'Revisar'} /> },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        <div className="row-actions">
          <IconButton label="Ver kardex" icon={History} onClick={() => setKardexProduct(row)} />
          {canEdit && <IconButton label="Editar producto" icon={Pencil} onClick={() => setProductForm({ open: true, product: row })} />}
          {canEdit && <IconButton label="Borrar producto" icon={Trash2} variant="danger" onClick={() => setDeleteProduct(row)} />}
        </div>
      )
    }
  ];

  const adjustmentColumns = [
    { key: 'adjustment_date', label: 'Fecha', render: (row) => formatDate(row.adjustment_date) },
    {
      key: 'product',
      label: 'Producto',
      render: (row) => <div><strong className="table-primary">{row.product_name}</strong><small className="table-subline">{row.product_code}</small></div>
    },
    { key: 'type', label: 'Tipo', render: (row) => <StatusBadge status={row.type === 'entrada' ? 'Entrada' : 'Salida'} tone={row.type === 'entrada' ? 'green' : 'red'} /> },
    { key: 'quantity', label: 'Cantidad', align: 'right', render: (row) => `${formatNumber(row.quantity)} ${row.product_unit}` },
    { key: 'unit_cost', label: 'Costo unitario', align: 'right', render: (row) => formatCurrency(row.unit_cost) },
    { key: 'reason', label: 'Motivo', render: (row) => row.reason },
    { key: 'created_by_name', label: 'Registró', render: (row) => row.created_by_name || '—' },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => (
        canAdjust ? (
          <div className="row-actions">
            <IconButton label="Eliminar ajuste" icon={Trash2} variant="danger" onClick={() => setDeleteAdjustment(row)} />
          </div>
        ) : null
      )
    }
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Existencias"
        title="Inventario"
        description="Control de stock, costo promedio ponderado y cantidad económica de pedido."
        actions={(
          <>
            {hasPermission('reportes:export') && (
              <DownloadMenu
                label="Exportar"
                items={[
                  { label: 'Inventario Excel', path: '/export/inventory?format=xlsx' },
                  { label: 'Inventario CSV', path: '/export/inventory?format=csv' }
                ]}
              />
            )}
            {tab === 'stock' && canEdit && <button type="button" className="btn btn-primary" onClick={() => setProductForm({ open: true, product: null })}><Plus size={17} /> Nuevo producto</button>}
            {tab === 'adjustments' && canAdjust && <button type="button" className="btn btn-primary" onClick={() => setAdjustmentFormOpen(true)}><SlidersHorizontal size={17} /> Registrar ajuste</button>}
          </>
        )}
      />

      <div className="summary-grid summary-grid-4">
        <SummaryTile label="Valor del inventario" value={formatCurrency(data?.summary.value || 0)} icon={Warehouse} hint="Al costo promedio actual" />
        <SummaryTile label="Unidades en bodega" value={`${formatNumber(data?.summary.units || 0)} bultos`} icon={Package} hint={`${formatNumber(data?.summary.skuCount || 0)} referencias activas`} />
        <SummaryTile label="Alertas de stock" value={formatNumber(data?.summary.lowStock || 0)} icon={ArrowDownToLine} tone={data?.summary.lowStock ? 'red' : 'default'} hint="Productos en o bajo el mínimo" />
        <SummaryTile label="Productos a revisar" value={formatNumber(data?.summary.eoqAlerts || 0)} icon={SlidersHorizontal} tone={data?.summary.eoqAlerts ? 'amber' : 'default'} hint="Fuera de la política EOQ" />
      </div>

      <TabBar
        tabs={[
          { key: 'stock', label: 'Existencias', icon: <Warehouse size={15} /> },
          { key: 'adjustments', label: 'Ajustes', icon: <ClipboardList size={15} /> }
        ]}
        active={tab}
        onChange={(next) => { setTab(next); setSearch(''); }}
      />

      <div className="filter-bar">
        <div className="search-box">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tab === 'stock' ? 'Buscar producto o código…' : 'Buscar producto, código o motivo…'} aria-label="Buscar inventario" />
        </div>
        {tab === 'stock' && <span className="filter-note">El stock se actualiza al registrar compras, ventas y ajustes.</span>}
      </div>

      {tab === 'stock' && (
        <>
          {error && <ErrorPanel error={error} onRetry={load} />}
          {!error && (
            <DataTable
              columns={productColumns}
              rows={products}
              loading={loading}
              emptyTitle="No hay productos"
              emptyDescription="Crea tu primer producto para empezar a controlar inventario."
              emptyAction={canEdit ? <button type="button" className="btn btn-small btn-primary" onClick={() => setProductForm({ open: true, product: null })}><Plus size={15} /> Nuevo producto</button> : null}
            />
          )}
          {(data?.summary.lowStock > 0 || data?.summary.eoqAlerts > 0) && (
            <InlineNotice tone="warning" icon={SlidersHorizontal} className="inventory-alert">
              Hay {formatNumber(data.summary.lowStock)} producto(s) en o bajo el mínimo y {formatNumber(data.summary.eoqAlerts)} con política EOQ crítica. Revisa la tabla para priorizar el pedido.
            </InlineNotice>
          )}
        </>
      )}

      {tab === 'adjustments' && (
        <>
          <div className="summary-grid summary-grid-3">
            <SummaryTile label="Ajustes registrados" value={formatNumber(adjustments?.summary.count || 0)} icon={ClipboardList} />
            <SummaryTile label="Entradas por ajuste" value={`${formatNumber(adjustments?.summary.entries || 0)} bultos`} icon={ArrowDownToLine} tone="green" />
            <SummaryTile label="Salidas por ajuste" value={`${formatNumber(adjustments?.summary.exits || 0)} bultos`} icon={ArrowUpFromLine} tone="red" />
          </div>
          <DataTable
            columns={adjustmentColumns}
            rows={filteredAdjustments}
            loading={adjustmentsLoading}
            emptyTitle="Sin ajustes de inventario"
            emptyDescription="Registra mermas, daños o correcciones con su motivo."
            emptyAction={canAdjust ? <button type="button" className="btn btn-small btn-primary" onClick={() => setAdjustmentFormOpen(true)}><SlidersHorizontal size={15} /> Registrar ajuste</button> : null}
          />
          <div className="footnote-box">
            <History size={15} />
            <span>Los ajustes actualizan el stock y recalculan el costo promedio ponderado del producto. El motivo es obligatorio para conservar la trazabilidad.</span>
          </div>
        </>
      )}

      <ProductForm
        open={productForm.open}
        product={productForm.product}
        onClose={() => setProductForm({ open: false, product: null })}
        onSaved={() => { load(); setProductForm({ open: false, product: null }); }}
        onDelete={(p) => setDeleteProduct(p)}
      />

      <AdjustmentForm
        open={adjustmentFormOpen}
        products={data?.products || []}
        onClose={() => setAdjustmentFormOpen(false)}
        onSaved={() => { load(); loadAdjustments(); setAdjustmentFormOpen(false); }}
      />

      {kardexProduct && (
        <KardexModal product={kardexProduct} onClose={() => setKardexProduct(null)} />
      )}

      <ConfirmDialog
        open={Boolean(deleteProduct)}
        onClose={() => setDeleteProduct(null)}
        onConfirm={confirmDeleteProduct}
        busy={deleting}
        title="Borrar producto"
        message={`¿Eliminar "${deleteProduct?.name}"? Solo se puede borrar si no tiene compras, ventas ni movimientos registrados. Si ya tiene historial, el sistema lo protegerá.`}
        confirmLabel="Borrar producto"
      />

      <ConfirmDialog
        open={Boolean(deleteAdjustment)}
        onClose={() => setDeleteAdjustment(null)}
        onConfirm={confirmDeleteAdjustment}
        busy={deleting}
        title="Eliminar ajuste de inventario"
        message={`¿Eliminar el ajuste de ${deleteAdjustment?.type} por ${deleteAdjustment?.quantity} ${deleteAdjustment?.product_unit || 'unidades'} de "${deleteAdjustment?.product_name}"? El stock y el costo promedio del producto se recalcularán automáticamente.`}
        confirmLabel="Eliminar ajuste"
      />
    </div>
  );
}

function ProductForm({ open, product, onClose, onSaved, onDelete }) {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({
      code: product?.code || '',
      name: product?.name || '',
      unit: product?.unit || 'Bulto',
      sale_price: String(product?.sale_price ?? ''),
      min_stock: String(product?.min_stock ?? 0),
      ordering_cost: String(product?.ordering_cost ?? 120000),
      holding_rate: String(product?.holding_rate ?? 0.18),
      active: product?.active !== 0
    });
    setError('');
  }, [open, product]);

  if (!form) return null;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        ...form,
        sale_price: product ? (Number(form.sale_price) || 0) : 0,
        min_stock: Number(form.min_stock) || 0,
        ordering_cost: Number(form.ordering_cost) || 120000,
        holding_rate: Number(form.holding_rate) || 0.18
      };
      const response = product
        ? await api.put(`/products/${product.id}`, payload)
        : await api.post('/products', payload);
      toast.success(product ? 'Producto actualizado.' : 'Producto creado en existencias.');
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
      title={product ? `Editar ${product.name}` : 'Nuevo producto'}
      subtitle={product ? 'Actualiza los datos del producto y sus parámetros EOQ.' : 'Registra el nuevo producto en existencias. No se pide precio de venta inicial (se define al facturar o al editarlo).'}
      size="md"
      busy={saving}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          {product ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => { onClose(); onDelete?.(product); }}
              disabled={saving}
            >
              <Trash2 size={15} /> Borrar producto
            </button>
          ) : <span />}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" form="product-form" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar producto'}</button>
          </div>
        </div>
      )}
    >
      <form id="product-form" onSubmit={submit} className="stack-16">
        {error && <div className="inline-notice tone-danger">{error}</div>}
        <div className="form-grid cols-2">
          <Field label="Código" required>
            <TextInput value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} placeholder="CEM-006" required />
          </Field>
          <Field label="Unidad">
            <TextInput value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} placeholder="Bulto" />
          </Field>
        </div>
        <Field label="Nombre del producto" required>
          <TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Cemento gris 50 kg" required />
        </Field>
        <div className="form-grid cols-2">
          {product && (
            <Field label="Precio de venta" hint="Opcional. Puedes definirlo después al facturar o editar el producto.">
              <MoneyInput value={form.sale_price} onChange={(event) => setForm({ ...form, sale_price: event.target.value })} />
            </Field>
          )}
          <Field label="Stock mínimo">
            <TextInput type="number" min="0" value={form.min_stock} onChange={(event) => setForm({ ...form, min_stock: event.target.value })} />
          </Field>
          <Field label="Costo por pedido" hint="Usado en el cálculo EOQ.">
            <MoneyInput value={form.ordering_cost} onChange={(event) => setForm({ ...form, ordering_cost: event.target.value })} />
          </Field>
          <Field label="Tasa de mantenimiento" hint="Fracción anual, por ejemplo 0.18 para 18%.">
            <TextInput type="number" min="0" max="1" step="0.01" value={form.holding_rate} onChange={(event) => setForm({ ...form, holding_rate: event.target.value })} />
          </Field>
        </div>
        {!product && (
          <InlineNotice tone="info">El precio de venta no se pide al crear el producto. Podrás definirlo al editarlo o al registrar una venta.</InlineNotice>
        )}
        {product && <Checkbox label="Producto activo" description="Los productos inactivos no aparecen en los formularios de venta." checked={form.active} onChange={(value) => setForm({ ...form, active: value })} />}
        <InlineNotice tone="info">El stock no se edita manualmente: se actualiza con compras, ventas y ajustes de inventario.</InlineNotice>
      </form>
    </Modal>
  );
}

function AdjustmentForm({ open, products, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    product_id: '',
    adjustment_date: todayISO(),
    type: 'entrada',
    quantity: '',
    unit_cost: '',
    reason: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm({
      product_id: String(products[0]?.id || ''),
      adjustment_date: todayISO(),
      type: 'entrada',
      quantity: '',
      unit_cost: '',
      reason: ''
    });
    setError('');
  }, [open, products]);

  const product = products.find((item) => String(item.id) === String(form.product_id));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const qty = parseInt(form.quantity, 10);
    if (!Number.isInteger(qty) || qty <= 0) {
      setError('La cantidad debe ser un número entero mayor que cero (ej. 1, 5, 20).');
      return;
    }
    if (!form.reason.trim()) {
      setError('El motivo del ajuste es obligatorio.');
      return;
    }
    setSaving(true);
    try {
      const response = await api.post('/inventory/adjustments', {
        ...form,
        product_id: Number(form.product_id),
        quantity: qty,
        unit_cost: form.unit_cost ? Number(form.unit_cost) : undefined
      });
      toast.success(response.message || 'Ajuste registrado.');
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
      title="Registrar ajuste de inventario"
      subtitle="Mermas, daños, correcciones o reposiciones que no corresponden a compra o venta."
      size="sm"
      busy={saving}
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" form="adjustment-form" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Registrar ajuste'}</button>
        </>
      )}
    >
      <form id="adjustment-form" onSubmit={submit} className="stack-16">
        {error && <div className="inline-notice tone-danger">{error}</div>}
        <Field label="Producto" required>
          <Select value={form.product_id} onChange={(event) => setForm({ ...form, product_id: event.target.value })}>
            {products.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name} (stock {formatNumber(item.stock)})</option>)}
          </Select>
        </Field>
        <Field label="Tipo de ajuste">
          <Segmented value={form.type} onChange={(value) => setForm({ ...form, type: value })} options={[{ value: 'entrada', label: 'Entrada' }, { value: 'salida', label: 'Salida' }]} />
        </Field>
        <div className="form-grid cols-2">
          <Field label="Cantidad (número entero)" required hint="Solo números enteros.">
            <TextInput type="number" min="1" step="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} placeholder="Ej. 10" required />
          </Field>
          <Field label="Fecha" required>
            <TextInput type="date" value={form.adjustment_date} max={todayISO()} onChange={(event) => setForm({ ...form, adjustment_date: event.target.value })} />
          </Field>
        </div>
        {form.type === 'entrada' && (
          <Field label="Costo unitario" hint="Opcional. Si se omite se usa el costo promedio actual.">
            <MoneyInput value={form.unit_cost} onChange={(event) => setForm({ ...form, unit_cost: event.target.value })} />
          </Field>
        )}
        <Field label="Motivo del ajuste" required>
          <Textarea rows={3} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Ej. bultos averiados por humedad en bodega" />
        </Field>
        {product && (
          <div className="form-hint-card">
            <span>Stock actual</span>
            <strong>{formatNumber(product.stock)} {product.unit}</strong>
            <span>Costo promedio</span>
            <strong>{formatCurrency(product.avg_cost)}</strong>
          </div>
        )}
      </form>
    </Modal>
  );
}

function KardexModal({ product, onClose }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.get(`/inventory/${product.id}/movements`)
      .then((response) => { if (active) setData(response.data); })
      .catch((err) => toast.error(err.message))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [product.id]);

  return (
    <Modal open onClose={onClose} title={`Kardex · ${product.name}`} subtitle={`${product.code} · ${formatNumber(product.stock)} ${product.unit} disponibles`} size="lg">
      {loading ? <div className="page-loader"><span>Cargando movimientos…</span></div> : (
        <>
          <div className="summary-grid summary-grid-3">
            <SummaryTile label="Stock actual" value={formatNumber(data?.product.stock || 0)} icon={Package} />
            <SummaryTile label="Costo promedio" value={formatCurrency(data?.product.avg_cost || 0)} icon={Warehouse} />
            <SummaryTile label="Saldo valorizado" value={formatCurrency((data?.product.stock || 0) * (data?.product.avg_cost || 0))} icon={ArrowDownToLine} />
          </div>
          {data?.movements?.length ? (
            <div className="table-card">
              <div className="table-scroll">
                <table className="data-table data-table-compact">
                  <thead><tr><th>Fecha</th><th>Tipo</th><th>Referencia</th><th className="align-right">Cantidad</th><th className="align-right">Costo</th><th className="align-right">Saldo</th></tr></thead>
                  <tbody>
                    {data.movements.map((row) => (
                      <tr key={row.id}>
                        <td>{formatDate(row.movement_date)}</td>
                        <td><StatusBadge status={row.type.replaceAll('_', ' ')} tone={row.quantity >= 0 ? 'green' : 'red'} /></td>
                        <td>{row.note || row.type}</td>
                        <td className={`align-right ${row.quantity >= 0 ? 'text-success' : 'text-danger'}`}>{row.quantity >= 0 ? '+' : ''}{formatNumber(row.quantity)}</td>
                        <td className="align-right">{formatCurrency(row.unit_cost)}</td>
                        <td className="align-right"><strong>{formatNumber(row.running_balance)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : <EmptyState title="Sin movimientos" description="Este producto aún no tiene movimientos en el último año." />}
          <div className="modal-inline-actions"><button type="button" className="btn btn-primary" onClick={onClose}>Cerrar</button></div>
        </>
      )}
    </Modal>
  );
}
