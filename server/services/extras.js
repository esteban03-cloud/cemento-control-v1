import { db, logActivity, nowIso, tx } from '../db.js';
import { getConfig, getSetting, setSetting } from '../config.js';
import { addDays, diffDays, isValidDate, todayBogota } from '../lib/dates.js';
import { shiftDateByMonthsPreserveDay } from '../lib/periods.js';
import { money, round2, roundStock } from '../lib/money.js';
import { cashMovement } from './operations.js';
import { ApiError } from '../lib/http.js';

function fail(message, status = 422) {
  throw new ApiError(status, message);
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function ensureDate(value, field) {
  if (!isValidDate(value)) fail(`${field} debe ser una fecha válida.`);
  return value;
}

/* ───────────────────────────── Préstamos ───────────────────────────── */

export function getLoanById(id) {
  const row = db.prepare(`
    SELECT l.*, u.full_name AS created_by_name,
      COALESCE((SELECT SUM(amount) FROM loan_payments WHERE loan_id = l.id), 0) AS paid,
      (SELECT COUNT(*) FROM loan_payments WHERE loan_id = l.id) AS payment_count
    FROM loans l LEFT JOIN users u ON u.id = l.created_by
    WHERE l.id = ?
  `).get(id);
  if (!row) return null;
  const paid = money(row.paid);
  const balance = money(row.amount - paid);
  const today = todayBogota();
  let status = 'Activo';
  if (balance <= 0.5) status = 'Pagado';
  else if (row.due_date && row.due_date < today) status = 'Vencido';
  return {
    ...row,
    amount: money(row.amount),
    paid,
    balance,
    status,
    payments: db.prepare(`
      SELECT lp.*, u.full_name AS created_by_name
      FROM loan_payments lp LEFT JOIN users u ON u.id = lp.created_by
      WHERE lp.loan_id = ? ORDER BY lp.payment_date DESC, lp.id DESC
    `).all(id)
  };
}

export function listLoans(filters = {}) {
  const conditions = [];
  const params = [];
  if (filters.search) {
    conditions.push('l.borrower_name LIKE ?');
    params.push(`%${String(filters.search).trim()}%`);
  }
  if (isValidDate(filters.from)) {
    conditions.push('l.loan_date >= ?');
    params.push(filters.from);
  }
  if (isValidDate(filters.to)) {
    conditions.push('l.loan_date <= ?');
    params.push(filters.to);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT l.*, u.full_name AS created_by_name,
      COALESCE((SELECT SUM(amount) FROM loan_payments WHERE loan_id = l.id), 0) AS paid
    FROM loans l LEFT JOIN users u ON u.id = l.created_by
    ${where}
    ORDER BY l.loan_date DESC, l.id DESC
  `).all(...params);
  const today = todayBogota();
  const data = rows.map((row) => {
    const balance = money(row.amount - row.paid);
    let status = 'Activo';
    if (balance <= 0.5) status = 'Pagado';
    else if (row.due_date && row.due_date < today) status = 'Vencido';
    return { ...row, amount: money(row.amount), paid: money(row.paid), balance, status };
  });
  return {
    data,
    summary: {
      total: money(sumRows(data, 'amount')),
      paid: money(sumRows(data, 'paid')),
      balance: money(sumRows(data, 'balance')),
      count: data.length,
      overdue: data.filter((row) => row.status === 'Vencido').length
    }
  };
}

function sumRows(rows, key) {
  return round2(rows.reduce((total, row) => total + Number(row[key] || 0), 0));
}

export function createLoan(input, user) {
  return tx(() => {
    const borrowerName = clean(input.borrower_name);
    if (!borrowerName) fail('El nombre de la persona es obligatorio.');
    const amount = money(input.amount);
    if (!(amount > 0)) fail('El valor prestado debe ser mayor que cero.');
    const loanDate = ensureDate(input.loan_date || todayBogota(), 'La fecha del préstamo');
    const dueDate = input.due_date ? ensureDate(input.due_date, 'La fecha de devolución') : null;
    if (dueDate && dueDate < loanDate) fail('La fecha de devolución no puede ser anterior al préstamo.');
    const method = input.method === 'bancos' ? 'bancos' : 'efectivo';
    const info = db.prepare(`
      INSERT INTO loans (borrower_name, borrower_phone, amount, loan_date, due_date, description, payment_method, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      borrowerName,
      clean(input.borrower_phone),
      amount,
      loanDate,
      dueDate,
      clean(input.description) || 'Préstamo a tercero',
      method,
      user.id,
      nowIso()
    );
    const loanId = Number(info.lastInsertRowid);
    cashMovement({
      date: loanDate,
      type: 'egreso',
      category: 'prestamos',
      amount,
      method,
      description: `Préstamo a ${borrowerName}`,
      referenceType: 'prestamo',
      referenceId: loanId,
      userId: user.id
    });
    logActivity(user, 'crear', 'prestamo', loanId, `${borrowerName} · $${amount}`);
    return getLoanById(loanId);
  });
}

export function registerLoanPayment(loanId, input, user) {
  return tx(() => {
    const config = getConfig();
    const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(loanId);
    if (!loan) fail('El préstamo no existe.', 404);
    const paid = money(db.prepare('SELECT COALESCE(SUM(amount),0) AS total FROM loan_payments WHERE loan_id = ?').get(loanId).total);
    const balance = money(loan.amount - paid);
    if (balance <= 0.5) fail('Este préstamo ya está pagado en su totalidad.', 409);
    const amount = money(input.amount);
    if (!(amount > 0)) fail('El valor del pago debe ser mayor que cero.');
    if (amount > balance + 0.5) fail(`El pago supera el saldo pendiente (${balance}).`);
    const method = input.method === 'bancos' ? 'bancos' : 'efectivo';
    const paymentDate = ensureDate(input.payment_date || todayBogota(), 'La fecha del pago');
    if (paymentDate > todayBogota()) fail('La fecha del pago no puede ser futura.');
    const fee = method === 'bancos' ? money(amount * (Number(config.fiscal.gmfRate) || 0)) : 0;
    const info = db.prepare(`
      INSERT INTO loan_payments (loan_id, amount, payment_date, method, fee, notes, cash_movement_id, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `).run(loanId, amount, paymentDate, method, fee, clean(input.notes), user.id, nowIso());
    const paymentId = Number(info.lastInsertRowid);
    const cashId = cashMovement({
      date: paymentDate,
      type: 'ingreso',
      category: 'cobro_prestamo',
      amount,
      method,
      description: `Pago de préstamo · ${loan.borrower_name}`,
      referenceType: 'prestamo_cobro',
      referenceId: paymentId,
      userId: user.id
    });
    if (fee > 0) {
      cashMovement({
        date: paymentDate,
        type: 'egreso',
        category: 'gmf',
        amount: fee,
        method,
        description: `4x1000 pago préstamo · ${loan.borrower_name}`,
        referenceType: 'prestamo_gmf',
        referenceId: paymentId,
        userId: user.id
      });
    }
    db.prepare('UPDATE loan_payments SET cash_movement_id = ? WHERE id = ?').run(cashId, paymentId);
    logActivity(user, 'pago', 'prestamo', loanId, `${loan.borrower_name} · $${amount}`);
    return getLoanById(loanId);
  });
}

/* ───────────────────────────── Cotizaciones ───────────────────────────── */

function nextQuoteNumber() {
  const next = Number(getSetting('seq_quote_next', 1)) || 1;
  return `COT-${String(next).padStart(4, '0')}`;
}

export function quoteNextNumberPreview() {
  return nextQuoteNumber();
}

function normalizeQuoteItems(items) {
  if (!Array.isArray(items) || items.length === 0) fail('Agrega al menos un producto o servicio a la cotización.');
  return items.map((item, index) => {
    const description = clean(item.description);
    const quantity = Number(item.quantity);
    const unitPrice = money(item.unit_price);
    if (!description) fail(`El detalle de la línea ${index + 1} es obligatorio.`);
    if (!(quantity > 0)) fail(`La cantidad de la línea ${index + 1} debe ser mayor que cero.`);
    if (!(unitPrice >= 0)) fail(`El precio de la línea ${index + 1} no puede ser negativo.`);
    return {
      product_id: item.product_id ? Number(item.product_id) : null,
      description,
      quantity: roundStock(quantity),
      unit_price: unitPrice,
      line_total: money(quantity * unitPrice),
      position: index + 1
    };
  });
}

export function getQuoteById(id) {
  const quote = db.prepare(`
    SELECT q.*, u.full_name AS created_by_name
    FROM quotes q LEFT JOIN users u ON u.id = q.created_by
    WHERE q.id = ?
  `).get(id);
  if (!quote) return null;
  const items = db.prepare('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY position, id').all(id);
  return {
    ...quote,
    subtotal: money(quote.subtotal),
    total: money(quote.total),
    items: items.map((item) => ({ ...item, quantity: roundStock(item.quantity), unit_price: money(item.unit_price), line_total: money(item.line_total) }))
  };
}

export function listQuotes(filters = {}) {
  const conditions = [];
  const params = [];
  if (filters.search) {
    conditions.push('(q.quote_number LIKE ? OR q.customer_name LIKE ?)');
    const term = `%${String(filters.search).trim()}%`;
    params.push(term, term);
  }
  if (['borrador', 'enviada', 'aceptada', 'rechazada', 'vencida'].includes(filters.status)) {
    conditions.push('q.status = ?');
    params.push(filters.status);
  }
  if (isValidDate(filters.from)) {
    conditions.push('q.quote_date >= ?');
    params.push(filters.from);
  }
  if (isValidDate(filters.to)) {
    conditions.push('q.quote_date <= ?');
    params.push(filters.to);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const data = db.prepare(`
    SELECT q.*, u.full_name AS created_by_name,
      (SELECT COUNT(*) FROM quote_items WHERE quote_id = q.id) AS item_count
    FROM quotes q LEFT JOIN users u ON u.id = q.created_by
    ${where}
    ORDER BY q.quote_date DESC, q.id DESC
  `).all(...params).map((row) => ({
    ...row,
    subtotal: money(row.subtotal),
    total: money(row.total)
  }));
  return {
    data,
    summary: {
      count: data.length,
      total: money(sumRows(data, 'total')),
      accepted: data.filter((row) => row.status === 'aceptada').length,
      draft: data.filter((row) => row.status === 'borrador').length
    }
  };
}

export function createQuote(input, user) {
  return tx(() => {
    const items = normalizeQuoteItems(input.items);
    const quoteDate = ensureDate(input.quote_date || todayBogota(), 'La fecha de la cotización');
    const validUntil = input.valid_until ? ensureDate(input.valid_until, 'La vigencia') : null;
    if (validUntil && validUntil < quoteDate) fail('La vigencia no puede ser anterior a la fecha de la cotización.');
    const customerName = clean(input.customer_name);
    if (!customerName) fail('El nombre del cliente es obligatorio para la cotización.');
    const status = ['borrador', 'enviada', 'aceptada', 'rechazada', 'vencida'].includes(input.status) ? input.status : 'borrador';
    const providedNumber = clean(input.quote_number);
    const subtotal = money(items.reduce((total, item) => total + item.line_total, 0));
    let quoteNumber = providedNumber;
    if (!quoteNumber) {
      quoteNumber = nextQuoteNumber();
      setSetting('seq_quote_next', Number(getSetting('seq_quote_next', 1)) + 1);
    }
    if (db.prepare('SELECT id FROM quotes WHERE quote_number = ? COLLATE NOCASE').get(quoteNumber)) {
      fail('Ya existe una cotización con ese número.', 409);
    }
    const info = db.prepare(`
      INSERT INTO quotes (
        quote_number, quote_date, valid_until, customer_id, customer_name, customer_nit, customer_phone,
        customer_address, status, subtotal, total, notes, terms, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      quoteNumber,
      quoteDate,
      validUntil,
      input.customer_id ? Number(input.customer_id) : null,
      customerName,
      clean(input.customer_nit),
      clean(input.customer_phone),
      clean(input.customer_address),
      status,
      subtotal,
      subtotal,
      clean(input.notes),
      clean(input.terms) || 'Precios sujetos a cambio sin previo aviso. Cotización válida hasta la fecha indicada. El valor no incluye flete ni descargue salvo que se especifique.',
      user.id,
      nowIso()
    );
    const quoteId = Number(info.lastInsertRowid);
    const itemStatement = db.prepare(`
      INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, line_total, position)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      itemStatement.run(quoteId, item.product_id, item.description, item.quantity, item.unit_price, item.line_total, item.position);
    }
    logActivity(user, 'crear', 'cotizacion', quoteId, `${quoteNumber} · ${customerName}`);
    return getQuoteById(quoteId);
  });
}

export function updateQuote(id, input, user) {
  return tx(() => {
    const existing = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
    if (!existing) fail('La cotización no existe.', 404);
    const items = normalizeQuoteItems(input.items);
    const quoteDate = ensureDate(input.quote_date || existing.quote_date, 'La fecha de la cotización');
    const validUntil = input.valid_until ? ensureDate(input.valid_until, 'La vigencia') : null;
    if (validUntil && validUntil < quoteDate) fail('La vigencia no puede ser anterior a la fecha de la cotización.');
    const customerName = clean(input.customer_name);
    if (!customerName) fail('El nombre del cliente es obligatorio.');
    const status = ['borrador', 'enviada', 'aceptada', 'rechazada', 'vencida'].includes(input.status) ? input.status : existing.status;
    const quoteNumber = clean(input.quote_number) || existing.quote_number;
    if (db.prepare('SELECT id FROM quotes WHERE quote_number = ? COLLATE NOCASE AND id <> ?').get(quoteNumber, id)) {
      fail('Ya existe otra cotización con ese número.', 409);
    }
    const subtotal = money(items.reduce((total, item) => total + item.line_total, 0));
    db.prepare(`
      UPDATE quotes SET quote_number = ?, quote_date = ?, valid_until = ?, customer_id = ?, customer_name = ?,
        customer_nit = ?, customer_phone = ?, customer_address = ?, status = ?, subtotal = ?, total = ?, notes = ?, terms = ?
      WHERE id = ?
    `).run(
      quoteNumber,
      quoteDate,
      validUntil,
      input.customer_id ? Number(input.customer_id) : null,
      customerName,
      clean(input.customer_nit),
      clean(input.customer_phone),
      clean(input.customer_address),
      status,
      subtotal,
      subtotal,
      clean(input.notes),
      clean(input.terms),
      id
    );
    db.prepare('DELETE FROM quote_items WHERE quote_id = ?').run(id);
    const itemStatement = db.prepare(`
      INSERT INTO quote_items (quote_id, product_id, description, quantity, unit_price, line_total, position)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      itemStatement.run(id, item.product_id, item.description, item.quantity, item.unit_price, item.line_total, item.position);
    }
    logActivity(user, 'editar', 'cotizacion', id, quoteNumber);
    return getQuoteById(id);
  });
}

export function deleteQuote(id, user) {
  return tx(() => {
    const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(id);
    if (!quote) fail('La cotización no existe.', 404);
    db.prepare('DELETE FROM quote_items WHERE quote_id = ?').run(id);
    db.prepare('DELETE FROM quotes WHERE id = ?').run(id);
    logActivity(user, 'eliminar', 'cotizacion', id, quote.quote_number);
    return { ok: true };
  });
}

/* ───────────────────────────── Deudas ───────────────────────────── */

function addMonthsDate(dateValue, months) {
  return shiftDateByMonthsPreserveDay(dateValue, months);
}

export function buildDebtSchedule({ principal, monthlyRate, termMonths, firstPaymentDate, creditorType }) {
  const rows = [];
  if (creditorType === 'banco') {
    const n = termMonths;
    const rate = Number(monthlyRate) || 0;
    const installment = n > 0
      ? (rate > 0 ? principal * rate / (1 - Math.pow(1 + rate, -n)) : principal / n)
      : 0;
    let balance = principal;
    for (let index = 0; index < n; index += 1) {
      const interest = money(balance * rate);
      let principalPart = index === n - 1 ? balance : money(installment - interest);
      if (principalPart < 0) principalPart = 0;
      if (principalPart > balance) principalPart = balance;
      balance = money(balance - principalPart);
      rows.push({
        installment_number: index + 1,
        kind: 'cuota',
        due_date: addMonthsDate(firstPaymentDate, index),
        principal_amount: principalPart,
        interest_amount: interest,
        total_amount: money(principalPart + interest),
        paid_amount: 0,
        status: 'pendiente'
      });
    }
    return { rows, installmentAmount: money(installment) };
  }
  const rate = Number(monthlyRate) || 0;
  for (let index = 0; index < termMonths; index += 1) {
    const interest = money(principal * rate);
    if (interest <= 0) continue;
    rows.push({
      installment_number: index + 1,
      kind: 'interes',
      due_date: addMonthsDate(firstPaymentDate, index),
      principal_amount: 0,
      interest_amount: interest,
      total_amount: interest,
      paid_amount: 0,
      status: 'pendiente'
    });
  }
  rows.push({
    installment_number: rows.length + 1,
    kind: 'capital',
    due_date: addMonthsDate(firstPaymentDate, termMonths),
    principal_amount: principal,
    interest_amount: 0,
    total_amount: principal,
    paid_amount: 0,
    status: 'pendiente'
  });
  return { rows, installmentAmount: money(principal * rate) };
}

export function getDebtById(id) {
  const debt = db.prepare(`
    SELECT d.*, u.full_name AS created_by_name
    FROM debts d LEFT JOIN users u ON u.id = d.created_by
    WHERE d.id = ?
  `).get(id);
  if (!debt) return null;
  const installments = db.prepare(`
    SELECT * FROM debt_installments WHERE debt_id = ? ORDER BY due_date, installment_number, id
  `).all(id).map((row) => ({
    ...row,
    principal_amount: money(row.principal_amount),
    interest_amount: money(row.interest_amount),
    total_amount: money(row.total_amount),
    paid_amount: money(row.paid_amount)
  }));
  const payments = db.prepare(`
    SELECT dp.*, u.full_name AS created_by_name
    FROM debt_payments dp LEFT JOIN users u ON u.id = dp.created_by
    WHERE dp.debt_id = ? ORDER BY dp.payment_date DESC, dp.id DESC
  `).all(id).map((row) => ({ ...row, amount: money(row.amount), principal_paid: money(row.principal_paid), interest_paid: money(row.interest_paid) }));
  const paidPrincipal = money(installments.filter((row) => row.paid_amount >= row.total_amount - 0.5).reduce((total, row) => total + row.principal_amount, 0));
  const totalPrincipal = money(installments.reduce((total, row) => total + row.principal_amount, 0));
  const paidInterest = money(installments.filter((row) => row.paid_amount >= row.total_amount - 0.5).reduce((total, row) => total + row.interest_amount, 0));
  const next = installments.find((row) => row.paid_amount < row.total_amount - 0.5) || null;
  return {
    ...debt,
    principal: money(debt.principal),
    monthly_interest_rate: Number(debt.monthly_interest_rate),
    installment_amount: money(debt.installment_amount),
    installments,
    payments,
    summary: {
      totalPrincipal,
      paidPrincipal,
      remainingPrincipal: money(totalPrincipal - paidPrincipal),
      paidInterest,
      remainingInterest: money(installments.reduce((total, row) => total + Math.max(0, row.total_amount - row.paid_amount), 0) - (totalPrincipal - paidPrincipal)),
      nextInstallment: next,
      paidInstallments: installments.filter((row) => row.paid_amount >= row.total_amount - 0.5).length,
      totalInstallments: installments.length
    }
  };
}

export function listDebts(filters = {}) {
  const conditions = [];
  const params = [];
  if (filters.search) {
    conditions.push('d.creditor_name LIKE ?');
    params.push(`%${String(filters.search).trim()}%`);
  }
  if (['banco', 'persona'].includes(filters.creditor_type)) {
    conditions.push('d.creditor_type = ?');
    params.push(filters.creditor_type);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT d.*,
      (SELECT COUNT(*) FROM debt_installments di WHERE di.debt_id = d.id) AS installment_count,
      (SELECT COUNT(*) FROM debt_installments di WHERE di.debt_id = d.id AND di.paid_amount >= di.total_amount - 0.5) AS paid_count,
      (SELECT MIN(di.due_date) FROM debt_installments di WHERE di.debt_id = d.id AND di.paid_amount < di.total_amount - 0.5) AS next_due_date,
      COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = d.id), 0) AS total_paid,
      COALESCE((SELECT SUM(dp.principal_paid) FROM debt_payments dp WHERE dp.debt_id = d.id), 0) AS principal_paid
    FROM debts d ${where}
    ORDER BY CASE WHEN d.status = 'activa' THEN 0 ELSE 1 END, d.created_at DESC
  `).all(...params);
  const data = rows.map((row) => ({
    ...row,
    principal: money(row.principal),
    monthly_interest_rate: Number(row.monthly_interest_rate),
    installment_amount: money(row.installment_amount),
    total_paid: money(row.total_paid),
    principal_paid: money(row.principal_paid),
    paid_count: Number(row.paid_count),
    installment_count: Number(row.installment_count),
    pending_balance: money(row.principal - Math.min(row.principal, Number(row.principal_paid || 0)))
  }));
  return {
    data,
    summary: {
      count: data.length,
      active: data.filter((row) => row.status === 'activa').length,
      principal: money(sumRows(data, 'principal')),
      totalPaid: money(sumRows(data, 'total_paid')),
      monthlyInterest: money(data.filter((row) => row.status === 'activa').reduce((total, row) => total + row.pending_balance * row.monthly_interest_rate, 0)),
      nextDue: data.filter((row) => row.next_due_date).sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))[0]?.next_due_date || null
    }
  };
}

export function createDebt(input, user) {
  return tx(() => {
    const creditorName = clean(input.creditor_name);
    if (!creditorName) fail('El nombre del acreedor es obligatorio.');
    const creditorType = input.creditor_type === 'persona' ? 'persona' : 'banco';
    const principal = money(input.principal);
    if (!(principal > 0)) fail('El valor de la deuda debe ser mayor que cero.');
    const ratePercent = Number(input.monthly_interest_rate);
    if (!Number.isFinite(ratePercent) || ratePercent < 0) fail('La tasa de interés mensual no es válida.');
    const rate = ratePercent / 100;
    const termMonths = Number(input.term_months);
    if (!Number.isInteger(termMonths) || termMonths <= 0 || termMonths > 600) fail('El plazo en meses debe ser un entero entre 1 y 600.');
    const startDate = ensureDate(input.start_date || todayBogota(), 'La fecha de inicio');
    const firstPaymentDate = ensureDate(input.first_payment_date || addDays(startDate, 30), 'La fecha del primer pago');
    if (firstPaymentDate < startDate) fail('La primera cuota no puede ser anterior al desembolso.');
    const schedule = buildDebtSchedule({ principal, monthlyRate: rate, termMonths, firstPaymentDate, creditorType });
    const info = db.prepare(`
      INSERT INTO debts (
        creditor_name, creditor_type, description, principal, monthly_interest_rate, start_date,
        first_payment_date, term_months, installment_amount, status, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'activa', ?, ?, ?)
    `).run(
      creditorName,
      creditorType,
      clean(input.description),
      principal,
      rate,
      startDate,
      firstPaymentDate,
      termMonths,
      schedule.installmentAmount,
      clean(input.notes),
      user.id,
      nowIso()
    );
    const debtId = Number(info.lastInsertRowid);
    const statement = db.prepare(`
      INSERT INTO debt_installments
        (debt_id, installment_number, kind, due_date, principal_amount, interest_amount, total_amount, paid_amount, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'pendiente', ?)
    `);
    for (const row of schedule.rows) {
      statement.run(debtId, row.installment_number, row.kind, row.due_date, row.principal_amount, row.interest_amount, row.total_amount, nowIso());
    }
    logActivity(user, 'crear', 'deuda', debtId, `${creditorName} · $${principal}`);
    return getDebtById(debtId);
  });
}

export function payDebtInstallment(debtId, installmentId, input, user) {
  return tx(() => {
    const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(debtId);
    if (!debt) fail('La deuda no existe.', 404);
    const installment = db.prepare('SELECT * FROM debt_installments WHERE id = ? AND debt_id = ?').get(installmentId, debtId);
    if (!installment) fail('La cuota no existe.', 404);
    if (installment.paid_amount >= installment.total_amount - 0.5) fail('Esta cuota ya está pagada.', 409);
    const amount = money(installment.total_amount - installment.paid_amount);
    const method = input.method === 'bancos' ? 'bancos' : 'efectivo';
    const paymentDate = ensureDate(input.payment_date || todayBogota(), 'La fecha del pago');
    if (paymentDate > todayBogota()) fail('La fecha del pago no puede ser futura.');
    const cashId = cashMovement({
      date: paymentDate,
      type: 'egreso',
      category: 'deudas',
      amount,
      method,
      description: `Pago cuota ${installment.kind} · ${debt.creditor_name}`,
      referenceType: 'deuda_pago',
      referenceId: installment.id,
      userId: user.id
    });
    const info = db.prepare(`
      INSERT INTO debt_payments
        (debt_id, installment_id, amount, principal_paid, interest_paid, payment_date, method, cash_movement_id, notes, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      debtId,
      installmentId,
      amount,
      installment.principal_amount,
      installment.interest_amount,
      paymentDate,
      method,
      cashId,
      clean(input.notes),
      user.id,
      nowIso()
    );
    db.prepare('UPDATE debt_installments SET paid_amount = total_amount, status = ? WHERE id = ?').run('pagada', installmentId);
    const pending = db.prepare(`
      SELECT COUNT(*) AS count FROM debt_installments WHERE debt_id = ? AND paid_amount < total_amount - 0.5
    `).get(debtId).count;
    if (pending === 0) db.prepare('UPDATE debts SET status = ? WHERE id = ?').run('pagada', debtId);
    logActivity(user, 'pago', 'deuda', debtId, `${debt.creditor_name} · cuota ${installment.installment_number} · $${amount}`);
    return { ...getDebtById(debtId), payment_id: Number(info.lastInsertRowid) };
  });
}

export function deleteDebt(id, user) {
  return tx(() => {
    const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(id);
    if (!debt) fail('La deuda no existe.', 404);
    const paid = db.prepare('SELECT COUNT(*) AS count FROM debt_installments WHERE debt_id = ? AND paid_amount > 0.5').get(id).count;
    if (paid > 0) fail('La deuda ya tiene pagos registrados. No se puede eliminar; conserva el historial.', 409);
    db.prepare('DELETE FROM debt_installments WHERE debt_id = ?').run(id);
    db.prepare('DELETE FROM debts WHERE id = ?').run(id);
    logActivity(user, 'eliminar', 'deuda', id, debt.creditor_name);
    return { ok: true };
  });
}

export function deleteDebtPayment(debtId, paymentId, user) {
  return tx(() => {
    const payment = db.prepare('SELECT * FROM debt_payments WHERE id = ? AND debt_id = ?').get(paymentId, debtId);
    if (!payment) fail('El pago no existe.', 404);
    if (payment.cash_movement_id) {
      db.prepare('DELETE FROM cash_movements WHERE id = ?').run(payment.cash_movement_id);
    }
    db.prepare('UPDATE debt_installments SET paid_amount = 0, status = ? WHERE id = ?').run('pendiente', payment.installment_id);
    db.prepare('UPDATE debts SET status = ? WHERE id = ?').run('activa', debtId);
    db.prepare('DELETE FROM debt_payments WHERE id = ?').run(paymentId);
    logActivity(user, 'eliminar', 'pago_deuda', paymentId, `$${payment.amount}`);
    return getDebtById(debtId);
  });
}

export function deleteLoan(loanId, user) {
  return tx(() => {
    const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(loanId);
    if (!loan) fail('El préstamo no existe.', 404);
    const paymentsCount = db.prepare('SELECT COUNT(*) AS count FROM loan_payments WHERE loan_id = ?').get(loanId).count;
    if (paymentsCount > 0) fail('No se puede eliminar un préstamo con pagos registrados. Anula primero los pagos.', 409);
    db.prepare("DELETE FROM cash_movements WHERE reference_type = 'prestamo' AND reference_id = ?").run(loanId);
    db.prepare('DELETE FROM loans WHERE id = ?').run(loanId);
    logActivity(user, 'eliminar', 'prestamo', loanId, loan.borrower_name);
    return { ok: true };
  });
}

export function deleteLoanPayment(loanId, paymentId, user) {
  return tx(() => {
    const payment = db.prepare('SELECT * FROM loan_payments WHERE id = ? AND loan_id = ?').get(paymentId, loanId);
    if (!payment) fail('El pago no existe.', 404);
    if (payment.cash_movement_id) {
      db.prepare('DELETE FROM cash_movements WHERE id = ?').run(payment.cash_movement_id);
    }
    db.prepare("DELETE FROM cash_movements WHERE reference_type = 'prestamo_gmf' AND reference_id = ?").run(paymentId);
    db.prepare('DELETE FROM loan_payments WHERE id = ?').run(paymentId);
    logActivity(user, 'eliminar', 'pago_prestamo', paymentId, `$${payment.amount}`);
    return getLoanById(loanId);
  });
}

export function getQuoteOverview() {
  return {
    nextNumber: nextQuoteNumberPreview(),
    statuses: ['borrador', 'enviada', 'aceptada', 'rechazada', 'vencida']
  };
}
