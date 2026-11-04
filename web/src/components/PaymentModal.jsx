import { useEffect, useMemo, useState } from 'react';
import { Banknote, Landmark, Loader2, WalletCards } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { Field, MoneyInput, Segmented, Textarea } from './Forms.jsx';
import { api } from '../api.js';
import { useToast } from '../context/ToastContext.jsx';
import {
  formatCurrency,
  formatDate,
  formatPercent,
  todayISO
} from '../utils.js';

export default function PaymentModal({
  open,
  onClose,
  onSaved,
  type = 'receivable',
  record,
  gmfRate = 0.004
}) {
  const toast = useToast();
  const isReceivable = type === 'receivable';
  const [form, setForm] = useState({ amount: '', payment_date: todayISO(), method: 'efectivo', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const balance = Number(record?.balance) || 0;
  const amount = Number(form.amount) || 0;
  const fee = isReceivable && form.method === 'bancos' ? Math.round(amount * Number(gmfRate || 0)) : 0;

  useEffect(() => {
    if (!open) return;
    setForm({
      amount: balance ? String(balance) : '',
      payment_date: todayISO(),
      method: 'efectivo',
      notes: ''
    });
    setError('');
  }, [open, record?.id, balance]);

  const title = useMemo(() => (isReceivable ? 'Registrar cobro' : 'Registrar pago'), [isReceivable]);
  const party = isReceivable ? record?.customer_name : record?.provider_name;
  const document = isReceivable ? record?.invoice_number : (record?.doc_number || record?.invoice_number || record?.description);
  const endpoint = isReceivable ? `/receivables/${record?.id}/payments` : `/payables/${record?.id}/payments`;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!(amount > 0)) {
      setError('Ingresa un valor mayor que cero.');
      return;
    }
    if (amount > balance + 0.5) {
      setError(`El valor no puede superar el saldo pendiente de ${formatCurrency(balance)}.`);
      return;
    }
    setSaving(true);
    try {
      await api.post(endpoint, {
        amount,
        payment_date: form.payment_date,
        method: form.method,
        notes: form.notes
      });
      toast.success(isReceivable ? 'Cobro registrado correctamente.' : 'Pago registrado correctamente.');
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!record) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={isReceivable ? 'El abono se refleja en caja y reduce la cartera.' : 'El pago se descuenta de la caja y reduce la obligación.'}
      size="sm"
      busy={saving}
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" form="payment-form" className="btn btn-primary" disabled={saving || balance <= 0}>
            {saving ? <><Loader2 size={16} className="spin" /> Guardando…</> : <><Banknote size={16} /> {isReceivable ? 'Guardar cobro' : 'Guardar pago'}</>}
          </button>
        </>
      )}
    >
      <form id="payment-form" onSubmit={submit} className="stack-16">
        <div className="payment-summary-card">
          <div>
            <span className="eyebrow">{isReceivable ? 'Cuenta por cobrar' : 'Cuenta por pagar'}</span>
            <strong>{party}</strong>
            <small>{document || 'Sin documento'} · vence {formatDate(record.due_date)}</small>
          </div>
          <div>
            <span>Saldo pendiente</span>
            <strong>{formatCurrency(balance)}</strong>
          </div>
        </div>
        {error && <div className="inline-notice tone-danger">{error}</div>}
        <Field label="Valor del abono" required>
          <MoneyInput
            value={form.amount}
            onChange={(event) => setForm({ ...form, amount: event.target.value })}
            placeholder="0"
            min="1"
            max={balance}
            step="any"
            autoFocus
          />
        </Field>
        <Field label="Fecha del movimiento" required>
          <input
            className="input"
            type="date"
            value={form.payment_date}
            max={todayISO()}
            onChange={(event) => setForm({ ...form, payment_date: event.target.value })}
          />
        </Field>
        <Field label="Medio de pago" required>
          <Segmented
            value={form.method}
            onChange={(value) => setForm({ ...form, method: value })}
            options={[
              { value: 'efectivo', label: 'Efectivo', icon: <WalletCards size={15} /> },
              { value: 'bancos', label: 'Bancos', icon: <Landmark size={15} /> }
            ]}
          />
        </Field>
        {isReceivable && form.method === 'bancos' && (
          <div className="payment-fee-note">
            <span>4x1000 estimado ({formatPercent(Number(gmfRate) * 100, 1)})</span>
            <strong>- {formatCurrency(fee)}</strong>
            <small>Se registra como egreso en caja.</small>
          </div>
        )}
        <Field label="Notas" hint="Opcional. Número de transferencia, observaciones, etc.">
          <Textarea
            rows={3}
            value={form.notes}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            placeholder="Ej. transferencia Bancolombia 1145"
          />
        </Field>
      </form>
    </Modal>
  );
}
