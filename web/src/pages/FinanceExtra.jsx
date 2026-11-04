import { useEffect, useState } from 'react';
import { Eye, FileText, HandCoins, Landmark, Plus, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, SummaryTile, DataTable, IconButton, StatusBadge, ErrorPanel } from '../components/DataDisplay.jsx';
import { DocumentModal, DocumentItems, DocumentTotals, DocumentSection } from '../components/DocumentModal.jsx';
import { Field, TextInput, MoneyInput, Select, Textarea } from '../components/Forms.jsx';
import { formatCurrency, formatDate, formatNumber, todayISO } from '../utils.js';

const money = (value) => formatCurrency(Number(value || 0));
const paymentMethod = (value) => value === 'bancos' ? 'Bancos' : 'Efectivo';

export default function FinanceExtra({ mode }) {
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState(null);
  const [detail, setDetail] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loanForm, setLoanForm] = useState({ borrower_name: '', borrower_phone: '', amount: '', loan_date: todayISO(), due_date: '', description: '', method: 'efectivo' });
  const [paymentForm, setPaymentForm] = useState({ amount: '', payment_date: todayISO(), method: 'efectivo', notes: '' });
  const [quoteForm, setQuoteForm] = useState({ customer_name: '', customer_nit: '', customer_phone: '', customer_address: '', quote_date: todayISO(), valid_until: '', notes: '', terms: '', items: [{ product_id: '', description: '', quantity: '1', unit_price: '' }] });
  const [debtForm, setDebtForm] = useState({ creditor_name: '', creditor_type: 'banco', principal: '', monthly_interest_rate: '', term_months: '12', start_date: todayISO(), first_payment_date: '', description: '', notes: '' });

  const endpoint = mode === 'loans' ? '/loans' : mode === 'quotes' ? '/quotes' : '/debts';
  const title = mode === 'loans' ? 'Préstamos a personas' : mode === 'quotes' ? 'Cotizaciones' : 'Deudas';
  const permission = mode === 'loans' ? 'prestamos:write' : mode === 'quotes' ? 'cotizaciones:write' : 'deudas:write';
  const canWrite = hasPermission(permission);
  const canPay = hasPermission(mode === 'loans' ? 'prestamos:pay' : 'deudas:pay');

  const load = async () => {
    setError(null);
    try {
      const response = await api.get(endpoint);
      setData(response);
      if (mode === 'quotes' && !meta) {
        const [overview, options] = await Promise.all([api.get('/quotes/overview'), api.get('/meta')]);
        setMeta({ ...options, quoteOverview: overview });
      }
    } catch (err) { setError(err); }
  };

  useEffect(() => { load(); }, [mode]);

  const openDetail = async (row) => {
    try {
      const response = await api.get(`${endpoint}/${row.id}`);
      setDetail(response.data);
    } catch (err) { toast.error(err.message); }
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === 'loans') {
        await api.post('/loans', { ...loanForm, amount: Number(loanForm.amount) });
        setLoanForm({ borrower_name: '', borrower_phone: '', amount: '', loan_date: todayISO(), due_date: '', description: '', method: 'efectivo' });
      } else if (mode === 'quotes') {
        const items = quoteForm.items.map((item) => ({ ...item, product_id: item.product_id ? Number(item.product_id) : null, quantity: Number(item.quantity), unit_price: Number(item.unit_price) }));
        const response = await api.post('/quotes', quoteForm && { ...quoteForm, items });
        setDetail(response.data);
        setQuoteForm({ customer_name: '', customer_nit: '', customer_phone: '', customer_address: '', quote_date: todayISO(), valid_until: '', notes: '', terms: '', items: [{ product_id: '', description: '', quantity: '1', unit_price: '' }] });
      } else {
        await api.post('/debts', { ...debtForm, principal: Number(debtForm.principal), monthly_interest_rate: Number(debtForm.monthly_interest_rate), term_months: Number(debtForm.term_months) });
        setDebtForm({ creditor_name: '', creditor_type: 'banco', principal: '', monthly_interest_rate: '', term_months: '12', start_date: todayISO(), first_payment_date: '', description: '', notes: '' });
      }
      setFormOpen(false);
      toast.success(mode === 'loans' ? 'Préstamo registrado y salida de caja generada.' : mode === 'quotes' ? 'Cotización creada.' : 'Deuda registrada y cronograma generado.');
      await load();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  };

  const registerPayment = async (event) => {
    event.preventDefault();
    if (!paymentTarget) return;
    setBusy(true);
    try {
      if (mode === 'loans') {
        const response = await api.post(`/loans/${paymentTarget.id}/payments`, { ...paymentForm, amount: Number(paymentForm.amount) });
        setDetail(response.data);
      } else {
        const response = await api.post(`/debts/${paymentTarget.debtId}/installments/${paymentTarget.installmentId}/pay`, paymentForm);
        setDetail(response.data);
      }
      setPaymentTarget(null);
      setPaymentForm({ amount: '', payment_date: todayISO(), method: 'efectivo', notes: '' });
      toast.success('Pago registrado en Caja y Bancos.');
      await load();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  };

  const remove = async (row) => {
    if (!window.confirm(`¿Eliminar este registro: ${row.borrower_name || row.quote_number || row.creditor_name}? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`${endpoint}/${row.id}`);
      toast.success('Registro eliminado.');
      await load();
    } catch (err) { toast.error(err.message); }
  };

  const loanColumns = [
    { key: 'borrower_name', label: 'Persona', render: (row) => <strong>{row.borrower_name}</strong> },
    { key: 'loan_date', label: 'Fecha', render: (row) => formatDate(row.loan_date) },
    { key: 'amount', label: 'Prestado', align: 'right', render: (row) => money(row.amount) },
    { key: 'paid', label: 'Devuelto', align: 'right', render: (row) => money(row.paid) },
    { key: 'balance', label: 'Pendiente', align: 'right', render: (row) => <strong>{money(row.balance)}</strong> },
    { key: 'status', label: 'Estado', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'actions', label: '', align: 'right', render: (row) => <div className="row-actions"><IconButton label="Ver comprobante" icon={Eye} onClick={() => openDetail(row)} />{canPay && row.balance > 0 && <button className="btn btn-small btn-secondary" onClick={() => { setPaymentTarget(row); setPaymentForm({ amount: String(row.balance), payment_date: todayISO(), method: 'efectivo', notes: '' }); }}>Registrar pago</button>}{canWrite && <IconButton label="Eliminar" icon={Trash2} variant="danger" onClick={() => remove(row)} />}</div> }
  ];
  const quoteColumns = [
    { key: 'quote_number', label: 'Cotización', render: (row) => <strong>{row.quote_number}</strong> },
    { key: 'customer_name', label: 'Cliente' },
    { key: 'quote_date', label: 'Fecha', render: (row) => formatDate(row.quote_date) },
    { key: 'valid_until', label: 'Vigencia', render: (row) => formatDate(row.valid_until) },
    { key: 'total', label: 'Total', align: 'right', render: (row) => money(row.total) },
    { key: 'status', label: 'Estado', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'actions', label: '', align: 'right', render: (row) => <div className="row-actions"><IconButton label="Ver y descargar" icon={Eye} onClick={() => openDetail(row)} /><IconButton label="Eliminar" icon={Trash2} variant="danger" onClick={() => remove(row)} /></div> }
  ];
  const debtColumns = [
    { key: 'creditor_name', label: 'Acreedor', render: (row) => <div><strong>{row.creditor_name}</strong><small>{row.creditor_type === 'banco' ? 'Bancaria' : 'Personal'}</small></div> },
    { key: 'principal', label: 'Capital', align: 'right', render: (row) => money(row.principal) },
    { key: 'monthly_interest_rate', label: 'Interés mensual', align: 'right', render: (row) => `${Number(row.monthly_interest_rate).toFixed(2)}%` },
    { key: 'next_due_date', label: 'Próximo pago', render: (row) => formatDate(row.next_due_date) },
    { key: 'pending_balance', label: 'Capital pendiente', align: 'right', render: (row) => money(row.pending_balance) },
    { key: 'status', label: 'Estado', render: (row) => <StatusBadge status={row.status === 'activa' ? 'Activa' : 'Pagada'} /> },
    { key: 'actions', label: '', align: 'right', render: (row) => <div className="row-actions"><IconButton label="Ver cronograma" icon={Eye} onClick={() => openDetail(row)} /><IconButton label="Eliminar" icon={Trash2} variant="danger" onClick={() => remove(row)} /></div> }
  ];

  return (
    <div className="page">
      <PageHeader eyebrow="Gestión financiera" title={title} description={mode === 'loans' ? 'Controla el dinero prestado a terceros, sus devoluciones y el saldo pendiente.' : mode === 'quotes' ? 'Prepara propuestas comerciales descargables antes de convertirlas en ventas.' : 'Controla obligaciones bancarias y personales con intereses y vencimientos.'} actions={canWrite && <button className="btn btn-primary" onClick={() => setFormOpen(!formOpen)}><Plus size={16} /> {mode === 'loans' ? 'Nuevo préstamo' : mode === 'quotes' ? 'Nueva cotización' : 'Registrar deuda'}</button>} />
      {error && <ErrorPanel error={error} onRetry={load} />}
      {data?.summary && <div className="summary-grid summary-grid-3">
        {mode === 'loans' ? <><SummaryTile label="Capital prestado" value={money(data.summary.total)} icon={HandCoins} /><SummaryTile label="Recuperado" value={money(data.summary.paid)} /><SummaryTile label="Por recuperar" value={money(data.summary.balance)} /></> :
        mode === 'quotes' ? <><SummaryTile label="Cotizaciones" value={formatNumber(data.summary.count)} icon={FileText} /><SummaryTile label="Valor cotizado" value={money(data.summary.total)} /><SummaryTile label="Aceptadas" value={formatNumber(data.summary.accepted)} /></> :
        <><SummaryTile label="Deudas activas" value={formatNumber(data.summary.active)} icon={Landmark} /><SummaryTile label="Capital registrado" value={money(data.summary.principal)} /><SummaryTile label="Interés mensual estimado" value={money(data.summary.monthlyInterest)} /></>}
      </div>}
      {formOpen && <div className="panel settings-panel">
        <div className="panel-heading"><div><span className="eyebrow">Nuevo registro</span><h3>{mode === 'loans' ? 'Datos del préstamo' : mode === 'quotes' ? 'Datos de la cotización' : 'Datos de la deuda'}</h3></div></div>
        <form className="stack-16" onSubmit={submit}>
          {mode === 'loans' && <>
            <div className="form-grid cols-2"><Field label="Nombre de la persona" required><TextInput value={loanForm.borrower_name} onChange={e => setLoanForm({ ...loanForm, borrower_name: e.target.value })} required /></Field><Field label="Teléfono"><TextInput value={loanForm.borrower_phone} onChange={e => setLoanForm({ ...loanForm, borrower_phone: e.target.value })} /></Field><Field label="Valor prestado" required><MoneyInput value={loanForm.amount} onChange={e => setLoanForm({ ...loanForm, amount: e.target.value })} required /></Field><Field label="Fecha del préstamo" required><TextInput type="date" value={loanForm.loan_date} onChange={e => setLoanForm({ ...loanForm, loan_date: e.target.value })} required /></Field><Field label="Fecha pactada de devolución"><TextInput type="date" value={loanForm.due_date} onChange={e => setLoanForm({ ...loanForm, due_date: e.target.value })} /></Field><Field label="Sale de"><Select value={loanForm.method} onChange={e => setLoanForm({ ...loanForm, method: e.target.value })}><option value="efectivo">Caja</option><option value="bancos">Banco</option></Select></Field></div>
            <Field label="Descripción"><Textarea value={loanForm.description} onChange={e => setLoanForm({ ...loanForm, description: e.target.value })} /></Field>
          </>}
          {mode === 'quotes' && <>
            <div className="form-grid cols-2"><Field label="Cliente" required><TextInput value={quoteForm.customer_name} onChange={e => setQuoteForm({ ...quoteForm, customer_name: e.target.value })} required /></Field><Field label="NIT / Cédula"><TextInput value={quoteForm.customer_nit} onChange={e => setQuoteForm({ ...quoteForm, customer_nit: e.target.value })} /></Field><Field label="Teléfono"><TextInput value={quoteForm.customer_phone} onChange={e => setQuoteForm({ ...quoteForm, customer_phone: e.target.value })} /></Field><Field label="Dirección"><TextInput value={quoteForm.customer_address} onChange={e => setQuoteForm({ ...quoteForm, customer_address: e.target.value })} /></Field><Field label="Fecha"><TextInput type="date" value={quoteForm.quote_date} onChange={e => setQuoteForm({ ...quoteForm, quote_date: e.target.value })} /></Field><Field label="Válida hasta"><TextInput type="date" value={quoteForm.valid_until} onChange={e => setQuoteForm({ ...quoteForm, valid_until: e.target.value })} /></Field></div>
            <DocumentSection title="Productos y cantidades"><div className="stack-12">{quoteForm.items.map((item, index) => <div className="form-grid cols-4" key={index}><Field label="Producto / descripción"><TextInput value={item.description} onChange={e => setQuoteForm({ ...quoteForm, items: quoteForm.items.map((x,i) => i===index ? { ...x, description: e.target.value } : x) })} required /></Field><Field label="Cantidad"><TextInput type="number" min="1" step="1" value={item.quantity} onChange={e => setQuoteForm({ ...quoteForm, items: quoteForm.items.map((x,i) => i===index ? { ...x, quantity: e.target.value } : x) })} required /></Field><Field label="Precio unitario"><MoneyInput value={item.unit_price} onChange={e => setQuoteForm({ ...quoteForm, items: quoteForm.items.map((x,i) => i===index ? { ...x, unit_price: e.target.value } : x) })} required /></Field><button type="button" className="btn btn-ghost" onClick={() => setQuoteForm({ ...quoteForm, items: quoteForm.items.length > 1 ? quoteForm.items.filter((_,i) => i!==index) : quoteForm.items })}>Quitar línea</button></div>)}</div><button type="button" className="btn btn-small btn-secondary" onClick={() => setQuoteForm({ ...quoteForm, items: [...quoteForm.items, { product_id: '', description: '', quantity: '1', unit_price: '' }] })}><Plus size={14} /> Agregar producto</button></DocumentSection>
            <Field label="Observaciones"><Textarea value={quoteForm.notes} onChange={e => setQuoteForm({ ...quoteForm, notes: e.target.value })} /></Field><Field label="Condiciones comerciales"><Textarea value={quoteForm.terms} onChange={e => setQuoteForm({ ...quoteForm, terms: e.target.value })} /></Field>
          </>}
          {mode === 'debts' && <>
            <div className="form-grid cols-2"><Field label="Acreedor" required><TextInput value={debtForm.creditor_name} onChange={e => setDebtForm({ ...debtForm, creditor_name: e.target.value })} required /></Field><Field label="Tipo de deuda"><Select value={debtForm.creditor_type} onChange={e => setDebtForm({ ...debtForm, creditor_type: e.target.value })}><option value="banco">Bancaria</option><option value="persona">Personal</option></Select></Field><Field label="Capital inicial" required><MoneyInput value={debtForm.principal} onChange={e => setDebtForm({ ...debtForm, principal: e.target.value })} required /></Field><Field label="Interés mensual (%)" required><TextInput type="number" min="0" step="0.01" value={debtForm.monthly_interest_rate} onChange={e => setDebtForm({ ...debtForm, monthly_interest_rate: e.target.value })} required /></Field><Field label="Plazo (meses)" required><TextInput type="number" min="1" step="1" value={debtForm.term_months} onChange={e => setDebtForm({ ...debtForm, term_months: e.target.value })} required /></Field><Field label="Fecha de inicio"><TextInput type="date" value={debtForm.start_date} onChange={e => setDebtForm({ ...debtForm, start_date: e.target.value })} /></Field><Field label="Primer vencimiento"><TextInput type="date" value={debtForm.first_payment_date} onChange={e => setDebtForm({ ...debtForm, first_payment_date: e.target.value })} /></Field></div>
            <Field label="Descripción"><Textarea value={debtForm.description} onChange={e => setDebtForm({ ...debtForm, description: e.target.value })} /></Field><Field label="Notas"><Textarea value={debtForm.notes} onChange={e => setDebtForm({ ...debtForm, notes: e.target.value })} /></Field>
            <p className="muted">{debtForm.creditor_type === 'banco' ? 'Deuda bancaria: cuota calculada con abono a capital e intereses sobre saldo.' : 'Deuda personal: se programan pagos mensuales de intereses y el capital al vencimiento.'}</p>
          </>}
          <div className="row-actions"><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar registro'}</button><button className="btn btn-ghost" type="button" onClick={() => setFormOpen(false)}>Cancelar</button></div>
        </form>
      </div>}
      <DataTable columns={mode === 'loans' ? loanColumns : mode === 'quotes' ? quoteColumns : debtColumns} rows={data?.data || []} loading={!data && !error} emptyTitle={`No hay ${title.toLowerCase()}`} emptyDescription="Los registros que crees aparecerán aquí." />
      {paymentTarget && <div className="panel settings-panel"><h3>{mode === 'loans' ? `Registrar devolución · ${paymentTarget.borrower_name}` : 'Pagar cuota'}</h3><form className="form-grid cols-2" onSubmit={registerPayment}>{mode === 'loans' && <Field label="Valor recibido" required><MoneyInput value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} required /></Field>}<Field label="Fecha del pago"><TextInput type="date" value={paymentForm.payment_date} onChange={e => setPaymentForm({ ...paymentForm, payment_date: e.target.value })} /></Field><Field label="Recibido / pagado por"><Select value={paymentForm.method} onChange={e => setPaymentForm({ ...paymentForm, method: e.target.value })}><option value="efectivo">Caja</option><option value="bancos">Banco</option></Select></Field><Field label="Notas"><TextInput value={paymentForm.notes} onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })} /></Field><div className="row-actions"><button className="btn btn-primary" disabled={busy}>Confirmar pago</button><button type="button" className="btn btn-ghost" onClick={() => setPaymentTarget(null)}>Cancelar</button></div></form></div>}
      {detail && <FinanceDocument mode={mode} detail={detail} canPay={canPay} onClose={() => setDetail(null)} onPayInstallment={(installment) => { setPaymentTarget({ debtId: detail.id, installmentId: installment.id }); setPaymentForm({ amount: '', payment_date: todayISO(), method: 'efectivo', notes: '' }); setDetail(null); }} />}
    </div>
  );
}

function FinanceDocument({ mode, detail, onClose, onPayInstallment, canPay }) {
  if (mode === 'quotes') return <DocumentModal open onClose={onClose} kind="Cotización" number={detail.quote_number} date={detail.quote_date} status={detail.status} fileName={`cotizacion-${detail.quote_number}`} subtitle={detail.customer_name}>
    <div className="document-parties"><div><span>Cliente</span><strong>{detail.customer_name}</strong><p>{detail.customer_nit || 'Sin identificación'}</p><p>{detail.customer_phone || ''}</p><p>{detail.customer_address || ''}</p></div><div><span>Vigencia</span><strong>{formatDate(detail.valid_until)}</strong><p>{detail.notes || ''}</p></div></div>
    <DocumentSection title="Detalle de productos"><DocumentItems columns={[{ key: 'description', label: 'Producto' }, { key: 'quantity', label: 'Cantidad', align: 'right' }, { key: 'unit_price', label: 'Precio unitario', align: 'right' }, { key: 'line_total', label: 'Total', align: 'right' }]} rows={detail.items.map(item => ({ ...item, unit_price: money(item.unit_price), line_total: money(item.line_total) }))} /></DocumentSection>
    <DocumentTotals items={[{ label: 'Subtotal', value: money(detail.subtotal) }, { label: 'Total cotizado', value: money(detail.total), strong: true }]} note={detail.terms} />
  </DocumentModal>;

  if (mode === 'loans') return <DocumentModal open onClose={onClose} kind="Comprobante de préstamo" number={`PRE-${detail.id}`} date={detail.loan_date} status={detail.status} fileName={`prestamo-${detail.id}`} subtitle={detail.borrower_name}>
    <div className="document-parties"><div><span>Persona</span><strong>{detail.borrower_name}</strong><p>{detail.borrower_phone || 'Sin teléfono'}</p><p>{detail.description || 'Préstamo a tercero'}</p></div><div><span>Desembolso</span><strong>{money(detail.amount)}</strong><p>Medio: {paymentMethod(detail.payment_method)}</p><p>Devolución pactada: {formatDate(detail.due_date)}</p></div></div>
    <DocumentTotals items={[{ label: 'Capital prestado', value: money(detail.amount) }, { label: 'Total devuelto', value: money(detail.paid) }, { label: 'Saldo por recuperar', value: money(detail.balance), strong: true }]} />
    <DocumentSection title="Historial de devoluciones"><DocumentItems columns={[{ key: 'payment_date', label: 'Fecha', render: row => formatDate(row.payment_date) }, { key: 'amount', label: 'Valor', align: 'right', render: row => money(row.amount) }, { key: 'method', label: 'Medio', render: row => paymentMethod(row.method) }, { key: 'notes', label: 'Notas' }]} rows={detail.payments || []} /></DocumentSection>
  </DocumentModal>;

  return <DocumentModal open onClose={onClose} kind="Estado de deuda" number={`DEU-${detail.id}`} date={detail.start_date} status={detail.status === 'activa' ? 'Activa' : 'Pagada'} fileName={`deuda-${detail.id}`} subtitle={detail.creditor_name}>
    <div className="document-parties"><div><span>Acreedor</span><strong>{detail.creditor_name}</strong><p>{detail.creditor_type === 'banco' ? 'Deuda bancaria' : 'Deuda personal'}</p><p>{detail.description || ''}</p></div><div><span>Capital</span><strong>{money(detail.principal)}</strong><p>Interés mensual: {`${(detail.monthly_interest_rate * 100).toFixed(2)}%`}</p><p>Plazo: {detail.term_months} meses</p></div></div>
    <DocumentSection title="Cronograma de pagos"><DocumentItems columns={[{ key: 'installment_number', label: 'N.º' }, { key: 'kind', label: 'Concepto' }, { key: 'due_date', label: 'Vencimiento', render: row => formatDate(row.due_date) }, { key: 'principal_amount', label: 'Capital', align: 'right', render: row => money(row.principal_amount) }, { key: 'interest_amount', label: 'Interés', align: 'right', render: row => money(row.interest_amount) }, { key: 'total_amount', label: 'Cuota', align: 'right', render: row => money(row.total_amount) }, { key: 'status', label: 'Estado' }, { key: 'actions', label: 'Acción', render: row => row.status === 'pagada' ? 'Pagada' : canPay ? <button type="button" className="btn btn-small btn-secondary" onClick={() => onPayInstallment?.(row)}>Registrar pago</button> : 'Pendiente' }]} rows={detail.installments || []} /></DocumentSection>
    <DocumentSection title="Pagos realizados"><DocumentItems columns={[{ key: 'payment_date', label: 'Fecha', render: row => formatDate(row.payment_date) }, { key: 'amount', label: 'Valor', align: 'right', render: row => money(row.amount) }, { key: 'principal_paid', label: 'Capital', align: 'right', render: row => money(row.principal_paid) }, { key: 'interest_paid', label: 'Interés', align: 'right', render: row => money(row.interest_paid) }]} rows={detail.payments || []} /></DocumentSection>
  </DocumentModal>;
}
