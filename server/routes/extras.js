import { Router } from 'express';
import { asyncRoute, required } from '../lib/http.js';
import { requireAuth, requirePermission } from '../auth.js';
import {
  createDebt,
  createLoan,
  createQuote,
  deleteDebt,
  deleteDebtPayment,
  deleteLoan,
  deleteLoanPayment,
  deleteQuote,
  getDebtById,
  getLoanById,
  getQuoteById,
  getQuoteOverview,
  listDebts,
  listLoans,
  listQuotes,
  payDebtInstallment,
  registerLoanPayment,
  updateQuote
} from '../services/extras.js';

const router = Router();
router.use(requireAuth);

/* Préstamos */

router.get('/loans', requirePermission('prestamos:view'), asyncRoute(async (req, res) => {
  res.json(listLoans(req.query));
}));

router.get('/loans/:id', requirePermission('prestamos:view'), asyncRoute(async (req, res) => {
  const data = getLoanById(Number(req.params.id));
  if (!data) return res.status(404).json({ error: 'El préstamo no existe.' });
  res.json({ data });
}));

router.post('/loans', requirePermission('prestamos:write'), asyncRoute(async (req, res) => {
  required(req.body, ['borrower_name', 'amount', 'loan_date'], {
    borrower_name: 'nombre de la persona',
    amount: 'valor prestado',
    loan_date: 'fecha del préstamo'
  });
  res.status(201).json({ data: createLoan(req.body, req.user), message: 'Préstamo registrado y salida de caja generada.' });
}));

router.post('/loans/:id/payments', requirePermission('prestamos:pay'), asyncRoute(async (req, res) => {
  required(req.body, ['amount', 'payment_date'], {
    amount: 'valor del pago',
    payment_date: 'fecha del pago'
  });
  res.status(201).json({ data: registerLoanPayment(Number(req.params.id), req.body, req.user), message: 'Pago de préstamo registrado en caja.' });
}));

router.delete('/loans/:id/payments/:paymentId', requirePermission('prestamos:pay'), asyncRoute(async (req, res) => {
  const data = deleteLoanPayment(Number(req.params.id), Number(req.params.paymentId), req.user);
  res.json({ data, message: 'Pago de préstamo anulado.' });
}));

router.delete('/loans/:id', requirePermission('prestamos:write'), asyncRoute(async (req, res) => {
  deleteLoan(Number(req.params.id), req.user);
  res.json({ message: 'Préstamo eliminado.' });
}));

/* Cotizaciones */

router.get('/quotes/overview', requirePermission('cotizaciones:view'), asyncRoute(async (req, res) => {
  res.json(getQuoteOverview());
}));

router.get('/quotes', requirePermission('cotizaciones:view'), asyncRoute(async (req, res) => {
  res.json(listQuotes(req.query));
}));

router.get('/quotes/:id', requirePermission('cotizaciones:view'), asyncRoute(async (req, res) => {
  const data = getQuoteById(Number(req.params.id));
  if (!data) return res.status(404).json({ error: 'La cotización no existe.' });
  res.json({ data });
}));

router.post('/quotes', requirePermission('cotizaciones:write'), asyncRoute(async (req, res) => {
  required(req.body, ['customer_name', 'items'], {
    customer_name: 'cliente',
    items: 'productos o servicios'
  });
  res.status(201).json({ data: createQuote(req.body, req.user), message: 'Cotización creada correctamente.' });
}));

router.put('/quotes/:id', requirePermission('cotizaciones:write'), asyncRoute(async (req, res) => {
  res.json({ data: updateQuote(Number(req.params.id), req.body, req.user), message: 'Cotización actualizada.' });
}));

router.delete('/quotes/:id', requirePermission('cotizaciones:write'), asyncRoute(async (req, res) => {
  await deleteQuote(Number(req.params.id), req.user);
  res.json({ message: 'Cotización eliminada.' });
}));

/* Deudas */

router.get('/debts', requirePermission('deudas:view'), asyncRoute(async (req, res) => {
  res.json(listDebts(req.query));
}));

router.get('/debts/:id', requirePermission('deudas:view'), asyncRoute(async (req, res) => {
  const data = getDebtById(Number(req.params.id));
  if (!data) return res.status(404).json({ error: 'La deuda no existe.' });
  res.json({ data });
}));

router.post('/debts', requirePermission('deudas:write'), asyncRoute(async (req, res) => {
  required(req.body, ['creditor_name', 'principal', 'term_months', 'monthly_interest_rate'], {
    creditor_name: 'acreedor',
    principal: 'capital',
    term_months: 'plazo',
    monthly_interest_rate: 'tasa mensual'
  });
  res.status(201).json({ data: createDebt(req.body, req.user), message: 'Deuda registrada y cronograma generado.' });
}));

router.post('/debts/:id/installments/:installmentId/pay', requirePermission('deudas:pay'), asyncRoute(async (req, res) => {
  res.status(201).json({
    data: payDebtInstallment(Number(req.params.id), Number(req.params.installmentId), req.body, req.user),
    message: 'Cuota pagada y egreso registrado en caja.'
  });
}));

router.delete('/debts/:id/payments/:paymentId', requirePermission('deudas:pay'), asyncRoute(async (req, res) => {
  const data = deleteDebtPayment(Number(req.params.id), Number(req.params.paymentId), req.user);
  res.json({ data, message: 'Pago de cuota anulado.' });
}));

router.delete('/debts/:id', requirePermission('deudas:write'), asyncRoute(async (req, res) => {
  await deleteDebt(Number(req.params.id), req.user);
  res.json({ message: 'Deuda eliminada.' });
}));

export default router;
