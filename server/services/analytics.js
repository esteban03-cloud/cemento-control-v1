import { db } from '../db.js';
import { getConfig } from '../config.js';
import {
  addDays,
  addMonths,
  diffDays,
  monthBounds,
  monthLabel,
  monthOf,
  monthRange,
  shortMonthLabel,
  todayBogota
} from '../lib/dates.js';
import {
  addDaysToDate,
  daysBetweenInclusive,
  describePeriod,
  isoWeekInfo,
  monthDays,
  monthsInRange,
  overlapDays,
  periodOptions,
  previousPeriodDescriptor,
  resolvePeriod,
  resolvePeriodFromQuery
} from '../lib/periods.js';
import { money, pct, round2, roundStock } from '../lib/money.js';
import { cashBalances } from './operations.js';

const sum = (rows, key) => round2(rows.reduce((total, row) => total + (Number(row[key]) || 0), 0));
const share = (part, total) => (Number(total) ? round2((Number(part) / Number(total)) * 100) : 0);

function statusFor(condition, green, yellow, red) {
  if (condition === green) return 'green';
  if (condition === yellow) return 'yellow';
  return red;
}

function thresholdStatus(value, greenAt, yellowAt, direction = 'higher') {
  if (direction === 'higher') {
    if (value >= greenAt) return 'green';
    if (value >= yellowAt) return 'yellow';
    return 'red';
  }
  if (value <= greenAt) return 'green';
  if (value <= yellowAt) return 'yellow';
  return 'red';
}

function safeMonth(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || '')) ? value : monthOf(todayBogota());
}

const STATUS_LABELS = {
  green: 'Saludable',
  yellow: 'Atención',
  red: 'Crítico',
  neutral: 'Sin datos'
};

export function pnlForMonth(month) {
  const period = resolvePeriod('month', month);
  return pnlForPeriod(period);
}

export function indirectCostsForRange(start, end) {
  const months = monthsInRange(start, end);
  const rows = months.length
    ? db.prepare(`
      SELECT id, period, category, description, amount, allocation_method, is_fixed
      FROM indirect_costs WHERE period BETWEEN ? AND ?
      ORDER BY is_fixed DESC, amount DESC, id
    `).all(months[0], months[months.length - 1])
    : [];
  const byCategory = new Map();
  let total = 0;
  let fixedTotal = 0;
  const detailed = [];
  for (const row of rows) {
    const monthStart = `${row.period}-01`;
    const monthEnd = `${row.period}-${String(monthDays(row.period)).padStart(2, '0')}`;
    const overlap = overlapDays(start, end, monthStart, monthEnd);
    if (overlap <= 0) continue;
    const daysInMonth = monthDays(row.period);
    const prorated = money(Number(row.amount) * (overlap / daysInMonth));
    if (prorated <= 0.5) continue;
    total = money(total + prorated);
    if (Number(row.is_fixed) === 1) fixedTotal = money(fixedTotal + prorated);
    byCategory.set(row.category, money((byCategory.get(row.category) || 0) + prorated));
    detailed.push({ ...row, amount: prorated, proration_days: overlap, month_days: daysInMonth });
  }
  return {
    total,
    fixedTotal,
    byCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount),
    detailed
  };
}

export function pnlForPeriod(period) {
  const start = period.start;
  const end = period.end;
  const sales = db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS revenue,
      COALESCE(SUM(subtotal), 0) AS product_revenue,
      COALESCE(SUM(cost_of_goods), 0) AS cogs,
      COALESCE(SUM(loading_value), 0) AS loading_cost,
      COALESCE(SUM(quantity), 0) AS units,
      COUNT(*) AS sale_count
    FROM sales WHERE delivery_date BETWEEN ? AND ?
  `).get(start, end);
  const indirect = indirectCostsForRange(start, end);
  const gmf = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM cash_movements
    WHERE movement_date BETWEEN ? AND ? AND type = 'egreso' AND category = 'gmf'
  `).get(start, end);
  const revenue = money(sales.revenue);
  const cogs = money(sales.cogs);
  const loading = money(sales.loading_cost);
  const gmfTotal = money(gmf.total);
  const grossProfit = money(revenue - cogs - loading);
  const operatingExpenses = money(indirect.total + gmfTotal);
  const netProfit = money(grossProfit - operatingExpenses);
  const units = Number(sales.units) || 0;
  const contributionPerUnit = units > 0 ? money(grossProfit / units) : 0;
  return {
    periodType: period.type,
    periodKey: period.key,
    periodLabel: period.label,
    periodStart: start,
    periodEnd: end,
    periodDays: period.days,
    month: period.type === 'month' ? period.value : null,
    monthLabel: period.label,
    bounds: { start, end },
    revenue,
    productRevenue: money(sales.product_revenue),
    cogs,
    loadingCost: loading,
    grossProfit,
    grossMargin: revenue ? round2((grossProfit / revenue) * 100) : 0,
    indirectTotal: indirect.total,
    indirectByCategory: indirect.byCategory,
    fixedCosts: indirect.fixedTotal,
    gmf: gmfTotal,
    operatingExpenses,
    netProfit,
    netMargin: revenue ? round2((netProfit / revenue) * 100) : 0,
    units: roundStock(units),
    saleCount: Number(sales.sale_count) || 0,
    contributionPerUnit
  };
}

function salesWindow(month, count = 12) {
  const months = monthRange(month, count);
  const start = monthBounds(months[0]).start;
  const end = monthBounds(month).end;
  return { months, start, end };
}

function monthlySeries(month, count = 12) {
  const { months, start, end } = salesWindow(month, count);
  const sales = db.prepare(`
    SELECT substr(delivery_date, 1, 7) AS month,
      COALESCE(SUM(total), 0) AS sales,
      COALESCE(SUM(subtotal), 0) AS product_sales,
      COALESCE(SUM(cost_of_goods), 0) AS cogs,
      COALESCE(SUM(loading_value), 0) AS loading,
      COALESCE(SUM(quantity), 0) AS units
    FROM sales WHERE delivery_date BETWEEN ? AND ?
    GROUP BY substr(delivery_date, 1, 7)
  `).all(start, end);
  const indirect = db.prepare(`
    SELECT period AS month, COALESCE(SUM(amount), 0) AS amount
    FROM indirect_costs WHERE period BETWEEN ? AND ? GROUP BY period
  `).all(months[0], month);
  const gmf = db.prepare(`
    SELECT substr(movement_date, 1, 7) AS month, COALESCE(SUM(amount), 0) AS amount
    FROM cash_movements
    WHERE movement_date BETWEEN ? AND ? AND type = 'egreso' AND category = 'gmf'
    GROUP BY substr(movement_date, 1, 7)
  `).all(start, end);
  const cash = db.prepare(`
    SELECT substr(movement_date, 1, 7) AS month,
      COALESCE(SUM(CASE WHEN type = 'ingreso' THEN amount ELSE 0 END), 0) AS income,
      COALESCE(SUM(CASE WHEN type = 'egreso' THEN amount ELSE 0 END), 0) AS expense
    FROM cash_movements WHERE movement_date BETWEEN ? AND ?
    GROUP BY substr(movement_date, 1, 7)
  `).all(start, end);
  const byMonth = new Map(sales.map((row) => [row.month, row]));
  const indirectMap = new Map(indirect.map((row) => [row.month, row.amount]));
  const gmfMap = new Map(gmf.map((row) => [row.month, row.amount]));
  const cashMap = new Map(cash.map((row) => [row.month, row]));
  return months.map((entry) => {
    const row = byMonth.get(entry) || {};
    const rev = Number(row.sales) || 0;
    const cogs = Number(row.cogs) || 0;
    const loading = Number(row.loading) || 0;
    const expenses = (Number(indirectMap.get(entry)) || 0) + (Number(gmfMap.get(entry)) || 0);
    const profit = money(rev - cogs - loading - expenses);
    return {
      month: entry,
      label: shortMonthLabel(entry),
      fullLabel: monthLabel(entry),
      sales: money(rev),
      cogs: money(cogs),
      loading: money(loading),
      units: roundStock(Number(row.units) || 0),
      expenses: money(expenses),
      profit,
      margin: rev ? round2((profit / rev) * 100) : 0,
      cashIncome: money(cashMap.get(entry)?.income || 0),
      cashExpense: money(cashMap.get(entry)?.expense || 0)
    };
  });
}

function productPerformance(start, end) {
  return db.prepare(`
    SELECT p.id, p.code, p.name, p.unit, p.sale_price, p.avg_cost, p.stock,
      COALESCE(SUM(s.quantity), 0) AS quantity,
      COALESCE(SUM(s.subtotal), 0) AS product_revenue,
      COALESCE(SUM(s.total), 0) AS revenue,
      COALESCE(SUM(s.cost_of_goods), 0) AS cogs
    FROM sales s
    JOIN products p ON p.id = s.product_id
    WHERE s.delivery_date BETWEEN ? AND ?
    GROUP BY p.id
    ORDER BY revenue DESC
  `).all(start, end).map((row) => {
    const base = Number(row.product_revenue) || 0;
    const cogs = Number(row.cogs) || 0;
    const margin = base ? round2(((base - cogs) / base) * 100) : 0;
    return {
      ...row,
      product_revenue: money(base),
      revenue: money(row.revenue),
      cogs: money(cogs),
      margin,
      share: 0
    };
  });
}

function customerPerformance(start, end) {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.nit,
      COALESCE(SUM(s.total), 0) AS revenue,
      COALESCE(SUM(s.quantity), 0) AS quantity,
      COUNT(*) AS sale_count
    FROM sales s
    JOIN customers c ON c.id = s.customer_id
    WHERE s.delivery_date BETWEEN ? AND ?
    GROUP BY c.id
    ORDER BY revenue DESC
  `).all(start, end);
  const total = sum(rows, 'revenue');
  return rows.map((row) => ({
    ...row,
    revenue: money(row.revenue),
    share: share(row.revenue, total)
  }));
}

function costParticipation(start, end) {
  const purchases = db.prepare(`
    SELECT COALESCE(SUM(quantity * unit_cost), 0) AS material,
      COALESCE(SUM(freight_value), 0) AS freight,
      COALESCE(SUM(unloading_value), 0) AS unloading
    FROM purchases WHERE arrival_date BETWEEN ? AND ?
  `).get(start, end);
  const indirect = indirectCostsForRange(start, end);
  const gmf = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS amount FROM cash_movements
    WHERE movement_date BETWEEN ? AND ? AND type = 'egreso' AND category = 'gmf'
  `).get(start, end);
  const rows = [
    { key: 'material', label: 'Material (cemento)', amount: money(purchases.material), color: '#1f6f8b' },
    { key: 'freight', label: 'Flete', amount: money(purchases.freight), color: '#e7a21c' },
    { key: 'unloading', label: 'Descargue', amount: money(purchases.unloading), color: '#6c8a5e' },
    { key: 'indirect', label: 'Costos indirectos', amount: money(indirect.total), color: '#8b6f9e' },
    { key: 'gmf', label: '4x1000', amount: money(gmf.amount), color: '#c96b4b' }
  ].filter((row) => row.amount > 0);
  const total = sum(rows, 'amount');
  const withShare = rows.map((row) => ({ ...row, share: share(row.amount, total) }));
  const materialShare = share(withShare.find((row) => row.key === 'material')?.amount || 0, total);
  return { rows: withShare, total, materialShare };
}

function receivablesOutstanding(asOf = todayBogota()) {
  return db.prepare(`
    SELECT ar.*, c.name AS customer_name, s.invoice_number, s.delivery_date,
      (ar.amount - ar.paid) AS balance,
      CASE WHEN ar.due_date < ? THEN CAST(julianday(?) - julianday(ar.due_date) AS INTEGER) ELSE 0 END AS overdue_days
    FROM accounts_receivable ar
    JOIN customers c ON c.id = ar.customer_id
    JOIN sales s ON s.id = ar.sale_id
    WHERE ar.amount - ar.paid > 0.5
    ORDER BY ar.due_date ASC
  `).all(asOf, asOf);
}

function payablesOutstanding(asOf = todayBogota()) {
  return db.prepare(`
    SELECT ap.*, (ap.amount - ap.paid) AS balance,
      CASE WHEN ap.due_date < ? THEN CAST(julianday(?) - julianday(ap.due_date) AS INTEGER) ELSE 0 END AS overdue_days
    FROM accounts_payable ap
    WHERE ap.amount - ap.paid > 0.5
    ORDER BY ap.due_date ASC
  `).all(asOf, asOf);
}

function inventoryCurrent() {
  const products = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY name').all();
  const items = products.map((product) => ({
    ...product,
    stock: roundStock(product.stock),
    avg_cost: money(product.avg_cost),
    inventory_value: money(product.stock * product.avg_cost)
  }));
  return {
    items,
    total: sum(items, 'inventory_value'),
    units: roundStock(sum(items, 'stock')),
    lowStock: items.filter((item) => Number(item.min_stock) > 0 && item.stock <= item.min_stock).length
  };
}

function eoqRows() {
  const config = getConfig();
  const today = todayBogota();
  const start = addDays(today, -90);
  const products = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY name').all();
  const sold = db.prepare(`
    SELECT product_id, COALESCE(SUM(quantity), 0) AS quantity
    FROM sales WHERE delivery_date BETWEEN ? AND ?
    GROUP BY product_id
  `).all(start, today);
  const purchaseCounts = db.prepare(`
    SELECT product_id, COUNT(*) AS orders, COALESCE(SUM(quantity), 0) AS quantity
    FROM purchases WHERE arrival_date BETWEEN ? AND ?
    GROUP BY product_id
  `).all(start, today);
  const soldMap = new Map(sold.map((row) => [row.product_id, Number(row.quantity) || 0]));
  const purchaseMap = new Map(purchaseCounts.map((row) => [row.product_id, row]));
  const rows = products.map((product) => {
    const quantity90 = soldMap.get(product.id) || 0;
    const annualDemand = quantity90 / 90 * 365;
    const orderingCost = Number(product.ordering_cost) || config.inventory.defaultOrderingCost;
    const holdingRate = Number(product.holding_rate) || config.inventory.defaultHoldingRate;
    const holdingCost = Math.max(1, money(Number(product.avg_cost) * holdingRate));
    const eoq = annualDemand > 0 ? Math.sqrt((2 * annualDemand * orderingCost) / holdingCost) : 0;
    const monthlyOrders = (Number(purchaseMap.get(product.id)?.orders) || 0) / 3;
    const optimalMonthlyOrders = eoq > 0 ? annualDemand / eoq / 12 : 0;
    const stock = Number(product.stock) || 0;
    const ratio = eoq > 0 ? stock / eoq : (stock > 0 ? 2 : 0);
    let stockStatus = 'neutral';
    if (eoq > 0) {
      if (ratio >= 0.5 && ratio <= 1) stockStatus = 'green';
      else if (ratio > 1 && ratio <= 2) stockStatus = 'yellow';
      else stockStatus = 'red';
    }
    const diffOrders = optimalMonthlyOrders > 0 ? monthlyOrders - optimalMonthlyOrders : 0;
    let orderStatus = 'neutral';
    if (optimalMonthlyOrders > 0) {
      const tolerance = Math.max(0.5, optimalMonthlyOrders * 0.25);
      if (Math.abs(diffOrders) <= tolerance) orderStatus = 'green';
      else if (Math.abs(diffOrders) <= 1.5) orderStatus = 'yellow';
      else orderStatus = 'red';
    }
    const optimalCost = eoq > 0
      ? (annualDemand / eoq) * orderingCost + (eoq / 2) * holdingCost
      : 0;
    const annualOrders = monthlyOrders * 12;
    const actualCost = annualOrders * orderingCost + (stock / 2) * holdingCost;
    const excessPct = optimalCost > 0 ? round2(((actualCost - optimalCost) / optimalCost) * 100) : null;
    let costStatus = 'neutral';
    if (excessPct !== null) {
      if (excessPct <= 10) costStatus = 'green';
      else if (excessPct <= 25) costStatus = 'yellow';
      else costStatus = 'red';
    }
    const worst = [stockStatus, orderStatus, costStatus].includes('red')
      ? 'red'
      : [stockStatus, orderStatus, costStatus].includes('yellow')
        ? 'yellow'
        : stockStatus === 'green' ? 'green' : 'neutral';
    let action = 'Mantener la política de pedido actual.';
    if (eoq > 0 && ratio < 0.5) action = 'Pedir ya, aunque el flete cueste más.';
    else if (eoq > 0 && ratio > 1.5) action = 'No pedir: usar existencias y ofrecer descuento por volumen.';
    else if (excessPct !== null && excessPct > 25) action = 'Revisar el costo de bodega y agrupar pedidos pequeños.';
    else if (optimalMonthlyOrders > 0 && diffOrders > 1) action = 'Agrupar pedidos pequeños y negociar un flete fijo.';
    else if (optimalMonthlyOrders > 0 && diffOrders < -1) action = 'Revisar el costo de bodega y el riesgo de daño.';
    return {
      id: product.id,
      code: product.code,
      name: product.name,
      unit: product.unit,
      stock: roundStock(stock),
      eoq: roundStock(eoq),
      stock_ratio: round2(ratio * 100),
      annual_demand: roundStock(annualDemand),
      ordering_cost: money(orderingCost),
      holding_cost: holdingCost,
      monthly_orders: round2(monthlyOrders),
      optimal_monthly_orders: round2(optimalMonthlyOrders),
      excess_cost_pct: excessPct,
      stock_status: stockStatus,
      order_status: orderStatus,
      cost_status: costStatus,
      status: worst,
      action,
      stockout_days: 0
    };
  });
  return rows;
}

function inventorySnapshot(asOf = todayBogota()) {
  const rows = db.prepare(`
    SELECT im.product_id, im.quantity, im.unit_cost, p.avg_cost
    FROM inventory_movements im
    JOIN products p ON p.id = im.product_id
    WHERE im.movement_date <= ?
    ORDER BY im.product_id, im.movement_date, im.id
  `).all(asOf);
  const map = new Map();
  for (const row of rows) {
    const state = map.get(row.product_id) || { stock: 0, value: 0 };
    if (Number(row.quantity) >= 0) {
      state.stock += Number(row.quantity);
      state.value += Number(row.quantity) * Number(row.unit_cost);
    } else {
      const average = state.stock > 0.000001 ? state.value / state.stock : Number(row.avg_cost) || 0;
      state.stock += Number(row.quantity);
      state.value -= Math.abs(Number(row.quantity)) * average;
      if (state.stock <= 0.000001) {
        state.stock = 0;
        state.value = 0;
      }
    }
    map.set(row.product_id, state);
  }
  let total = 0;
  let units = 0;
  for (const state of map.values()) {
    total += Math.max(0, state.value);
    units += Math.max(0, state.stock);
  }
  return { total: money(total), units: roundStock(units), products: map.size };
}

function cashSnapshot(asOf, start, end, days) {
  const balances = cashBalances(asOf);
  const expenses = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM cash_movements
    WHERE type = 'egreso' AND movement_date BETWEEN ? AND ?
  `).get(start, end);
  const periodDays = Math.max(1, Number(days) || 1);
  const dailyExpense = round2((Number(expenses.total) || 0) / periodDays);
  const coverageDays = dailyExpense > 0 ? round2(balances.total / dailyExpense) : null;
  return {
    ...balances,
    periodExpenses: money(expenses.total),
    monthExpenses: money(expenses.total),
    dailyExpense,
    coverageDays
  };
}

function customerKpi(rows, thresholds) {
  const maxShare = rows.length ? Math.max(...rows.map((row) => row.share)) : 0;
  const top = rows[0] || null;
  let status = 'neutral';
  if (rows.length) {
    if (maxShare > thresholds.customerRed) status = 'red';
    else if (maxShare > thresholds.customerGreen) status = 'yellow';
    else status = 'green';
  }
  return { maxShare, top, status };
}

function dashboardSeries(period) {
  if (period.type === 'week') {
    const output = [];
    for (let index = 11; index >= 0; index -= 1) {
      const date = addDaysToDate(period.start, -index * 7);
      const week = resolvePeriod('week', isoWeekInfo(date).key);
      const pnl = pnlForPeriod(week);
      const cash = db.prepare(`
        SELECT COALESCE(SUM(CASE WHEN type = 'ingreso' THEN amount ELSE 0 END), 0) AS income,
          COALESCE(SUM(CASE WHEN type = 'egreso' THEN amount ELSE 0 END), 0) AS expense
        FROM cash_movements WHERE movement_date BETWEEN ? AND ?
      `).get(week.start, week.end);
      output.push({
        month: week.key,
        key: week.key,
        label: week.shortLabel,
        fullLabel: week.label,
        sales: pnl.revenue,
        cogs: pnl.cogs,
        loading: pnl.loadingCost,
        units: pnl.units,
        expenses: money(pnl.indirectTotal + pnl.gmf),
        profit: pnl.netProfit,
        margin: pnl.netMargin,
        cashIncome: money(cash.income),
        cashExpense: money(cash.expense)
      });
    }
    return output;
  }
  if (period.type === 'year') {
    return monthlySeries(`${period.value}-12`, 12);
  }
  return monthlySeries(period.value, 12);
}

function ytdProfitTo(end) {
  const year = end.slice(0, 4);
  const start = `${year}-01-01`;
  if (start > end) return 0;
  return pnlForRange(start, end).netProfit;
}

function pnlForRange(start, end) {
  return pnlForPeriod({
    type: 'range',
    key: `${start}/${end}`,
    label: `${start} – ${end}`,
    start,
    end,
    days: daysBetweenInclusive(start, end),
    year: Number(start.slice(0, 4))
  });
}

export function computeAlerts() {
  const today = todayBogota();
  const alerts = [];
  const config = getConfig();
  const receivables = receivablesOutstanding(today);
  for (const item of receivables.filter((row) => row.overdue_days > 0).slice(0, 4)) {
    alerts.push({
      id: `ar-${item.id}`,
      type: 'cartera',
      severity: item.overdue_days > 15 ? 'red' : 'yellow',
      title: `Cartera vencida · ${item.customer_name}`,
      message: `Factura ${item.invoice_number} con ${item.overdue_days} días de vencimiento y saldo de $${Math.round(item.balance).toLocaleString('es-CO')}.`,
      link: '/cxc'
    });
  }
  const payables = payablesOutstanding(today);
  const upcoming = payables.filter((row) => diffDays(today, row.due_date) <= 15);
  for (const item of upcoming.slice(0, 3)) {
    alerts.push({
      id: `ap-${item.id}`,
      type: 'pagos',
      severity: item.due_date < today ? 'red' : 'yellow',
      title: `Pago próximo · ${item.provider_name}`,
      message: `${item.concept} por $${Math.round(item.balance).toLocaleString('es-CO')} vence el ${item.due_date}.`,
      link: '/cxp'
    });
  }
  const eoq = eoqRows();
  for (const item of eoq.filter((row) => row.stock_status === 'red').slice(0, 4)) {
    alerts.push({
      id: `stock-${item.id}`,
      type: 'inventario',
      severity: 'red',
      title: `Stock crítico · ${item.name}`,
      message: `${item.stock} ${item.unit} disponibles frente a un EOQ de ${item.eoq}. ${item.action}`,
      link: '/inventario'
    });
  }
  const lowMargins = db.prepare(`
    SELECT * FROM products WHERE active = 1 AND sale_price > 0
      AND ((sale_price - avg_cost) / sale_price) * 100 < ?
  `).all(Number(config.thresholds.marginYellow) || 10);
  for (const product of lowMargins.slice(0, 3)) {
    const margin = product.sale_price > 0 ? round2(((product.sale_price - product.avg_cost) / product.sale_price) * 100) : 0;
    alerts.push({
      id: `margin-${product.id}`,
      type: 'margen',
      severity: margin < 0 ? 'red' : 'yellow',
      title: `Margen bajo · ${product.name}`,
      message: `El margen actual es ${margin}% (${margin < 0 ? 'el producto genera pérdida' : 'por debajo de la meta'}).`,
      link: '/dashboard'
    });
  }
  const order = { red: 0, yellow: 1 };
  return alerts.sort((a, b) => order[a.severity] - order[b.severity]);
}

function legacyDashboard(rawMonth) {
  const month = safeMonth(rawMonth);
  const bounds = monthBounds(month);
  const today = todayBogota();
  const asOf = bounds.end < today ? bounds.end : today;
  const previousMonth = addMonths(month, -1);
  const config = getConfig();
  const thresholds = config.thresholds;

  const current = db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS revenue,
      COALESCE(SUM(subtotal), 0) AS product_revenue,
      COALESCE(SUM(cost_of_goods), 0) AS cogs,
      COALESCE(SUM(loading_value), 0) AS loading,
      COALESCE(SUM(quantity), 0) AS units,
      COUNT(*) AS count
    FROM sales WHERE delivery_date BETWEEN ? AND ?
  `).get(bounds.start, bounds.end);
  const previous = db.prepare(`
    SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS count
    FROM sales WHERE delivery_date BETWEEN ? AND ?
  `).get(monthBounds(previousMonth).start, monthBounds(previousMonth).end);
  const currentRevenue = money(current.revenue);
  const previousRevenue = money(previous.revenue);
  const growth = previousRevenue > 0 ? round2(((currentRevenue - previousRevenue) / previousRevenue) * 100) : (currentRevenue > 0 ? 100 : 0);

  const pnl = pnlForMonth(month);
  const prevPnl = pnlForMonth(previousMonth);
  const profitChange = prevPnl.netProfit !== 0
    ? round2(((pnl.netProfit - prevPnl.netProfit) / Math.abs(prevPnl.netProfit)) * 100)
    : (pnl.netProfit > 0 ? 100 : 0);

  const cash = cashSnapshot(asOf);
  const coverageDays = cash.coverageDays;
  const cashStatus = coverageDays === null
    ? 'neutral'
    : coverageDays > thresholds.cashCoverageGreen
      ? 'green'
      : coverageDays >= thresholds.cashCoverageYellow ? 'yellow' : 'red';
  const cashDaysStatus = coverageDays === null
    ? 'neutral'
    : coverageDays > thresholds.cashDaysGreen
      ? 'green'
      : coverageDays >= thresholds.cashDaysYellow ? 'yellow' : 'red';

  const products = productPerformance(month);
  const productRevenueTotal = sum(products, 'product_revenue');
  for (const product of products) product.share = share(product.product_revenue, productRevenueTotal);
  const avgProductMargin = productRevenueTotal > 0
    ? round2(products.reduce((total, row) => total + row.margin * (row.product_revenue / productRevenueTotal), 0))
    : 0;
  const negativeProducts = products.filter((row) => row.margin < 0);
  const productMarginStatus = negativeProducts.length
    ? 'red'
    : avgProductMargin >= thresholds.marginGreen
      ? 'green'
      : avgProductMargin >= thresholds.marginYellow ? 'yellow' : 'red';
  const lowMarginProducts = products.filter((row) => row.margin < thresholds.marginYellow);
  for (const product of products) {
    product.status = product.margin < 0
      ? 'red'
      : product.margin >= thresholds.marginGreen
        ? 'green'
        : product.margin >= thresholds.marginYellow ? 'yellow' : 'red';
  }

  const customers = customerPerformance(month);
  const customerSummary = customerKpi(customers, thresholds);
  for (const customer of customers) {
    customer.status = customer.share > thresholds.customerRed
      ? 'red'
      : customer.share > thresholds.customerGreen ? 'yellow' : 'green';
  }

  const costShare = costParticipation(month);
  const materialStatus = costShare.total === 0
    ? 'neutral'
    : costShare.materialShare < thresholds.materialGreen
      ? 'green'
      : costShare.materialShare > thresholds.materialRed ? 'red' : 'yellow';

  const inventory = inventoryCurrent();
  const last3 = monthRange(month, 3);
  const cogs3 = db.prepare(`
    SELECT COALESCE(SUM(cost_of_goods), 0) AS cogs FROM sales
    WHERE delivery_date BETWEEN ? AND ?
  `).get(monthBounds(last3[0]).start, bounds.end);
  const avgMonthlyCogs = round2((Number(cogs3.cogs) / 3) || 0);
  const inventoryMonths = avgMonthlyCogs > 0 ? round2(inventory.total / avgMonthlyCogs) : null;
  const inventoryStatus = inventoryMonths === null
    ? 'neutral'
    : inventoryMonths < thresholds.inventoryGreenMonths
      ? 'green'
      : inventoryMonths > thresholds.inventoryRedMonths ? 'red' : 'yellow';

  const receivables = receivablesOutstanding(asOf);
  const overdueRows = receivables.filter((row) => row.overdue_days > 0);
  const overdueTotal = sum(overdueRows, 'balance');
  const overdueRatio = currentRevenue > 0 ? share(overdueTotal, currentRevenue) : (overdueTotal > 0 ? 100 : 0);
  const overdueStatus = overdueTotal === 0
    ? 'green'
    : overdueRatio < thresholds.receivablesGreen
      ? 'green'
      : overdueRatio <= thresholds.receivablesYellow ? 'yellow' : 'red';

  const payables = payablesOutstanding(asOf);
  const upcomingRows = payables.filter((row) => diffDays(asOf, row.due_date) <= 15);
  const upcomingTotal = sum(upcomingRows, 'balance');
  const upcomingStatus = upcomingTotal === 0 ? 'green' : upcomingTotal <= cash.total ? 'green' : 'red';

  const profitStatus = pnl.netProfit < 0
    ? 'red'
    : pnl.netProfit >= prevPnl.netProfit ? 'green' : 'yellow';

  const fixedCosts = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM indirect_costs WHERE period = ? AND is_fixed = 1
  `).get(month).total;
  const breakEvenUnits = pnl.contributionPerUnit > 0 ? round2(Number(fixedCosts) / pnl.contributionPerUnit) : null;
  const breakEvenStatus = breakEvenUnits === null
    ? 'neutral'
    : pnl.units >= breakEvenUnits ? 'green' : 'red';

  const netMarginStatus = pnl.revenue === 0
    ? 'neutral'
    : pnl.netMargin >= thresholds.profitabilityGreen
      ? 'green'
      : pnl.netMargin >= thresholds.profitabilityYellow ? 'yellow' : 'red';

  const monthGrowthStatus = growth > thresholds.salesGrowthGreen
    ? 'green'
    : growth >= thresholds.salesGrowthYellow ? 'yellow' : 'red';
  const salesTrendStatus = growth > 0 ? 'green' : growth === 0 ? 'yellow' : 'red';

  const monthsYtd = monthRange(month, Number(month.slice(5, 7))).filter((entry) => entry.startsWith(month.slice(0, 4)));
  const ytd = monthsYtd.reduce((total, entry) => total + pnlForMonth(entry).netProfit, 0);
  const prevYtd = monthsYtd.reduce((total, entry) => total + pnlForMonth(entry).netProfit, 0) - pnl.netProfit;
  const ytdStatus = ytd < 0 ? 'red' : ytd >= prevYtd ? 'green' : 'yellow';

  const series = monthlySeries(month, 12);
  const eoq = eoqRows();
  const eoqRed = eoq.filter((row) => row.status === 'red').length;
  const eoqYellow = eoq.filter((row) => row.status === 'yellow').length;
  const eoqStatus = eoqRed > 0 ? 'red' : eoqYellow > 0 ? 'yellow' : 'green';
  const reorder = eoq.filter((row) => Number(row.stock) < Number(row.eoq) * 0.5);
  const firstEoqAlert = eoq.find((row) => row.status === 'red') || eoq.find((row) => row.status === 'yellow');

  const kpis = {
    salesGrowth: {
      value: growth,
      status: salesTrendStatus,
      current: currentRevenue,
      previous: previousRevenue,
      formula: '[(Ventas del período − Ventas del período anterior) ÷ Ventas del período anterior] × 100',
      action: growth < 0
        ? 'La facturación cae. Revisa precios, clientes inactivos y entregas pendientes.'
        : 'Mantén el impulso comercial y documenta qué clientes explican el crecimiento.'
    },
    cash: {
      value: cash.total,
      cash: cash.cash,
      bank: cash.bank,
      coverageDays,
      status: cashStatus,
      formula: 'Saldo inicial + ingresos cobrados − egresos pagados',
      action: cashStatus === 'red'
        ? 'Cobra facturas vencidas y aplaza compras no urgentes.'
        : cashStatus === 'yellow'
          ? 'Vigila la cobertura de caja: refuerza el recaudo esta semana.'
          : 'La caja cubre más de un mes de gastos. Mantén la disciplina de cobro.'
    },
    productMargin: {
      value: avgProductMargin,
      status: productMarginStatus,
      products: products,
      lowCount: lowMarginProducts.length,
      negativeCount: negativeProducts.length,
      formula: '[(Precio de venta − costo total) ÷ Precio de venta] × 100',
      action: negativeProducts.length
        ? `Revisa precios de ${negativeProducts.map((row) => row.name).slice(0, 2).join(' y ')}: están generando pérdida.`
        : lowMarginProducts.length
          ? 'Hay productos con margen por debajo de la meta. Negocia costo de flete o ajusta precio.'
          : 'Los márgenes están sanos. Protege el costo de compra y flete.'
    },
    cashDays: {
      value: coverageDays,
      status: cashDaysStatus,
      formula: 'Efectivo disponible ÷ (Egresos del mes ÷ 30)',
      action: coverageDays !== null && coverageDays < thresholds.cashDaysYellow
        ? 'Acelera cobros o negocia plazos con proveedores.'
        : 'La cobertura de caja está bajo control.'
    },
    overdueAR: {
      value: overdueTotal,
      ratio: overdueRatio,
      count: overdueRows.length,
      status: overdueStatus,
      formula: 'Suma de saldos con fecha vencida ÷ Ventas del período × 100',
      action: overdueStatus === 'red'
        ? 'Llama y cobra hoy. No despaches más a los clientes morosos hasta regularizar.'
        : 'Programa recordatorios de cobro para las facturas próximas a vencer.'
    },
    upcomingAP: {
      value: upcomingTotal,
      count: upcomingRows.length,
      cash: cash.total,
      status: upcomingStatus,
      formula: 'Suma de cuentas por pagar con vencimiento en los próximos 15 días',
      action: upcomingTotal > cash.total
        ? 'Prioriza los pagos y negocia plazos con los proveedores.'
        : 'Las obligaciones próximas están cubiertas por la caja disponible.'
    },
    monthlyProfit: {
      value: pnl.netProfit,
      previous: prevPnl.netProfit,
      change: profitChange,
      status: profitStatus,
      formula: 'Ingresos del período − costo de ventas − gastos operativos',
      action: pnl.netProfit < 0
        ? 'Revisa precios, costo de compra y gastos fijos: el mes cierra en pérdida.'
        : profitStatus === 'yellow'
          ? 'La utilidad es positiva pero cae frente al mes anterior. Revisa el margen.'
          : 'Utilidad positiva y en mejora. Conserva las acciones comerciales.'
    },
    breakEven: {
      units: breakEvenUnits,
      currentUnits: pnl.units,
      fixedCosts: money(Number(fixedCosts)),
      contribution: pnl.contributionPerUnit,
      status: breakEvenStatus,
      formula: 'Costos fijos ÷ margen de contribución por bolsa',
      action: breakEvenUnits !== null && pnl.units < breakEvenUnits
        ? `Faltan ${round2(breakEvenUnits - pnl.units)} bolsas para cubrir los costos fijos.`
        : 'El volumen vendido supera el punto de equilibrio.'
    },
    netMargin: {
      value: pnl.netMargin,
      status: netMarginStatus,
      formula: '(Utilidad neta ÷ Ventas totales) × 100',
      action: netMarginStatus === 'red'
        ? 'La rentabilidad neta está por debajo de la meta. Revisa costos indirectos y precios.'
        : 'La rentabilidad sobre ventas está en rango.'
    },
    monthVsPrevious: {
      value: growth,
      current: currentRevenue,
      previous: previousRevenue,
      status: monthGrowthStatus,
      formula: '[(Ventas mes actual − Ventas mes anterior) ÷ Ventas mes anterior] × 100',
      action: growth < 0
        ? 'Las ventas cayeron. Reactiva clientes y revisa la conversión de cotizaciones.'
        : growth > thresholds.salesGrowthGreen
          ? 'Crecimiento de dos dígitos frente al mes anterior.'
          : 'El crecimiento es moderado. Busca nuevas oportunidades comerciales.'
    },
    inventoryValue: {
      value: inventory.total,
      units: inventory.units,
      coverageMonths: inventoryMonths,
      status: inventoryStatus,
      formula: 'Suma de (unidades × costo promedio)',
      action: inventoryStatus === 'red'
        ? 'El inventario supera 4 meses de ventas. Pausa compras y ofrece rotación.'
        : inventoryStatus === 'yellow'
          ? 'Vigila la rotación: el inventario se acerca a 4 meses de ventas.'
          : 'El nivel de inventario es saludable.'
    },
    ytdProfit: {
      value: money(ytd),
      status: ytdStatus,
      formula: 'Suma de utilidades mensuales del año',
      action: ytd < 0
        ? 'El acumulado del año es negativo. Prioriza la recuperación del margen.'
        : 'La utilidad acumulada del año es positiva.'
    },
    eoq: {
      value: eoqRed,
      reorderCount: reorder.length,
      redCount: eoqRed,
      yellowCount: eoqYellow,
      status: eoqStatus,
      products: eoq,
      formula: 'EOQ = √(2 × D × S ÷ H)',
      action: firstEoqAlert
        ? `${firstEoqAlert.name}: ${firstEoqAlert.action}`
        : 'La política de pedido está equilibrada con la demanda reciente.'
    },
    salesByProductKpi: {
      value: productRevenueTotal,
      status: productMarginStatus,
      products,
      formula: 'Ventas del período agrupadas por producto',
      action: 'Impulsa los productos de mayor margen y mayor rotación.'
    },
    salesByCustomerKpi: {
      value: customerSummary.maxShare,
      status: customerSummary.status,
      customers,
      top: customerSummary.top,
      formula: 'Participación de cada cliente en las ventas del período',
      action: customerSummary.status === 'red'
        ? 'Un cliente concentra más de la mitad de las ventas. Diversifica la cartera comercial.'
        : 'La concentración de clientes se mantiene en un rango manejable.'
    },
    costShareKpi: {
      value: costShare.materialShare,
      status: materialStatus,
      rows: costShare.rows,
      total: costShare.total,
      formula: 'Participación de cada categoría en el costo total del período',
      action: materialStatus === 'red'
        ? 'El material supera el 75% del costo total. Renegocia compras o revisa fletes.'
        : 'La estructura de costos se mantiene en el rango esperado.'
    }
  };

  const alerts = computeAlerts();
  return {
    month,
    monthLabel: monthLabel(month),
    generatedAt: new Date().toISOString(),
    statusLabels: STATUS_LABELS,
    kpis,
    summary: {
      revenue: currentRevenue,
      saleCount: Number(current.count) || 0,
      units: roundStock(current.units),
      profit: pnl.netProfit,
      cash: cash.total,
      cashCash: cash.cash,
      cashBank: cash.bank,
      inventory: inventory.total,
      overdueAR: overdueTotal,
      upcomingAP: upcomingTotal
    },
    chart: {
      months: series,
      sales: series.map((row) => row.sales),
      profit: series.map((row) => row.profit),
      cashIncome: series.map((row) => row.cashIncome),
      cashExpense: series.map((row) => row.cashExpense)
    },
    tables: {
      salesByProduct: products,
      salesByCustomer: customers,
      costShare: costShare.rows,
      costShareTotal: costShare.total,
      eoq
    },
    alerts
  };
}

export function getDashboard(input) {
  const today = todayBogota();
  const period = typeof input === 'string'
    ? resolvePeriod('month', input)
    : resolvePeriodFromQuery(input || {}, today);
  const previousPeriod = previousPeriodDescriptor(period);
  const dataEnd = period.end > today ? today : period.end;
  const dataStart = period.start > dataEnd ? dataEnd : period.start;
  const dataDays = daysBetweenInclusive(dataStart, dataEnd);
  const analysisPeriod = { ...period, start: dataStart, end: dataEnd, days: dataDays };
  const config = getConfig();
  const thresholds = config.thresholds;

  const pnl = pnlForPeriod(analysisPeriod);
  const previousPnl = pnlForPeriod(previousPeriod);
  const currentRevenue = pnl.revenue;
  const previousRevenue = previousPnl.revenue;
  const growth = previousRevenue > 0
    ? round2(((currentRevenue - previousRevenue) / previousRevenue) * 100)
    : (currentRevenue > 0 ? 100 : 0);
  const profitChange = previousPnl.netProfit !== 0
    ? round2(((pnl.netProfit - previousPnl.netProfit) / Math.abs(previousPnl.netProfit)) * 100)
    : (pnl.netProfit > 0 ? 100 : 0);

  const cash = cashSnapshot(dataEnd, dataStart, dataEnd, dataDays);
  const coverageDays = cash.coverageDays;
  const cashStatus = coverageDays === null
    ? 'neutral'
    : coverageDays > thresholds.cashCoverageGreen
      ? 'green'
      : coverageDays >= thresholds.cashCoverageYellow ? 'yellow' : 'red';
  const cashDaysStatus = coverageDays === null
    ? 'neutral'
    : coverageDays > thresholds.cashDaysGreen
      ? 'green'
      : coverageDays >= thresholds.cashDaysYellow ? 'yellow' : 'red';

  const products = productPerformance(dataStart, dataEnd);
  const productRevenueTotal = sum(products, 'product_revenue');
  for (const product of products) product.share = share(product.product_revenue, productRevenueTotal);
  const avgProductMargin = productRevenueTotal > 0
    ? round2(products.reduce((total, row) => total + row.margin * (row.product_revenue / productRevenueTotal), 0))
    : 0;
  const negativeProducts = products.filter((row) => row.margin < 0);
  const productMarginStatus = negativeProducts.length
    ? 'red'
    : avgProductMargin >= thresholds.marginGreen
      ? 'green'
      : avgProductMargin >= thresholds.marginYellow ? 'yellow' : 'red';
  const lowMarginProducts = products.filter((row) => row.margin < thresholds.marginYellow);
  for (const product of products) {
    product.status = product.margin < 0
      ? 'red'
      : product.margin >= thresholds.marginGreen
        ? 'green'
        : product.margin >= thresholds.marginYellow ? 'yellow' : 'red';
  }

  const customers = customerPerformance(dataStart, dataEnd);
  const customerSummary = customerKpi(customers, thresholds);
  for (const customer of customers) {
    customer.status = customer.share > thresholds.customerRed
      ? 'red'
      : customer.share > thresholds.customerGreen ? 'yellow' : 'green';
  }

  const costShare = costParticipation(dataStart, dataEnd);
  const materialStatus = costShare.total === 0
    ? 'neutral'
    : costShare.materialShare < thresholds.materialGreen
      ? 'green'
      : costShare.materialShare > thresholds.materialRed ? 'red' : 'yellow';

  const inventory = inventoryCurrent();
  const cogs3 = db.prepare(`
    SELECT COALESCE(SUM(cost_of_goods), 0) AS cogs FROM sales
    WHERE delivery_date BETWEEN ? AND ?
  `).get(addDays(dataEnd, -89), dataEnd);
  const avgMonthlyCogs = round2((Number(cogs3.cogs) / 3) || 0);
  const inventoryMonths = avgMonthlyCogs > 0 ? round2(inventory.total / avgMonthlyCogs) : null;
  const inventoryStatus = inventoryMonths === null
    ? 'neutral'
    : inventoryMonths < thresholds.inventoryGreenMonths
      ? 'green'
      : inventoryMonths > thresholds.inventoryRedMonths ? 'red' : 'yellow';

  const receivables = receivablesOutstanding(dataEnd);
  const overdueRows = receivables.filter((row) => row.overdue_days > 0);
  const overdueTotal = sum(overdueRows, 'balance');
  const overdueRatio = currentRevenue > 0 ? share(overdueTotal, currentRevenue) : (overdueTotal > 0 ? 100 : 0);
  const overdueStatus = overdueTotal === 0
    ? 'green'
    : overdueRatio < thresholds.receivablesGreen
      ? 'green'
      : overdueRatio <= thresholds.receivablesYellow ? 'yellow' : 'red';

  const payables = payablesOutstanding(dataEnd);
  const upcomingRows = payables.filter((row) => diffDays(dataEnd, row.due_date) <= 15);
  const upcomingTotal = sum(upcomingRows, 'balance');
  const upcomingStatus = upcomingTotal === 0 ? 'green' : upcomingTotal <= cash.total ? 'green' : 'red';

  const profitStatus = pnl.netProfit < 0
    ? 'red'
    : pnl.netProfit >= previousPnl.netProfit ? 'green' : 'yellow';

  const fixedCosts = pnl.fixedCosts;
  const breakEvenUnits = pnl.contributionPerUnit > 0 ? round2(fixedCosts / pnl.contributionPerUnit) : null;
  const breakEvenStatus = breakEvenUnits === null
    ? 'neutral'
    : pnl.units >= breakEvenUnits ? 'green' : 'red';

  const netMarginStatus = pnl.revenue === 0
    ? 'neutral'
    : pnl.netMargin >= thresholds.profitabilityGreen
      ? 'green'
      : pnl.netMargin >= thresholds.profitabilityYellow ? 'yellow' : 'red';

  const growthStatus = growth > thresholds.salesGrowthGreen
    ? 'green'
    : growth >= thresholds.salesGrowthYellow ? 'yellow' : 'red';
  const salesTrendStatus = growth > 0 ? 'green' : growth === 0 ? 'yellow' : 'red';

  const ytd = ytdProfitTo(dataEnd);
  const previousYtd = money(ytd - pnl.netProfit);
  const ytdStatus = ytd < 0 ? 'red' : ytd >= previousYtd ? 'green' : 'yellow';

  const series = dashboardSeries(period);
  const eoq = eoqRows();
  const eoqRed = eoq.filter((row) => row.status === 'red').length;
  const eoqYellow = eoq.filter((row) => row.status === 'yellow').length;
  const eoqStatus = eoqRed > 0 ? 'red' : eoqYellow > 0 ? 'yellow' : 'green';
  const reorder = eoq.filter((row) => Number(row.stock) < Number(row.eoq) * 0.5);
  const firstEoqAlert = eoq.find((row) => row.status === 'red') || eoq.find((row) => row.status === 'yellow');
  const inProgress = period.end > today;
  const periodLabel = `${period.label}${inProgress ? ' · en curso' : ''}`;
  const comparisonLabel = previousPeriod.label;
  const chartTitle = period.type === 'week'
    ? 'Últimas 12 semanas'
    : period.type === 'year'
      ? `Año ${period.value}`
      : 'Últimos 12 meses';

  const earliestYear = db.prepare(`
    SELECT MIN(year_value) AS year_value FROM (
      SELECT MIN(substr(delivery_date, 1, 4)) AS year_value FROM sales
      UNION ALL
      SELECT MIN(substr(arrival_date, 1, 4)) AS year_value FROM purchases
    )
  `).get()?.year_value;
  const periodChoices = periodOptions(period, {
    minYear: Number(earliestYear) || Number(today.slice(0, 4)) - 4
  });

  const kpis = {
    salesGrowth: {
      value: growth,
      status: salesTrendStatus,
      current: currentRevenue,
      previous: previousRevenue,
      formula: '[(Ventas del período − Ventas del período anterior) ÷ Ventas del período anterior] × 100',
      action: growth < 0
        ? 'La facturación cae. Revisa precios, clientes inactivos y entregas pendientes.'
        : 'Mantén el impulso comercial y documenta qué clientes explican el crecimiento.'
    },
    cash: {
      value: cash.total,
      cash: cash.cash,
      bank: cash.bank,
      coverageDays,
      status: cashStatus,
      formula: 'Saldo inicial + ingresos cobrados − egresos pagados',
      action: cashStatus === 'red'
        ? 'Cobra facturas vencidas y aplaza compras no urgentes.'
        : cashStatus === 'yellow'
          ? 'Vigila la cobertura de caja: refuerza el recaudo esta semana.'
          : 'La caja cubre el período con holgura. Mantén la disciplina de cobro.'
    },
    productMargin: {
      value: avgProductMargin,
      status: productMarginStatus,
      products,
      lowCount: lowMarginProducts.length,
      negativeCount: negativeProducts.length,
      formula: '[(Precio de venta − costo total) ÷ Precio de venta] × 100',
      action: negativeProducts.length
        ? `Revisa precios de ${negativeProducts.map((row) => row.name).slice(0, 2).join(' y ')}: están generando pérdida.`
        : lowMarginProducts.length
          ? 'Hay productos con margen por debajo de la meta. Negocia costo de flete o ajusta precio.'
          : 'Los márgenes están sanos. Protege el costo de compra y flete.'
    },
    cashDays: {
      value: coverageDays,
      status: cashDaysStatus,
      formula: 'Efectivo disponible ÷ (Egresos del período ÷ días del período)',
      action: coverageDays !== null && coverageDays < thresholds.cashDaysYellow
        ? 'Acelera cobros o negocia plazos con proveedores.'
        : 'La cobertura de caja está bajo control.'
    },
    overdueAR: {
      value: overdueTotal,
      ratio: overdueRatio,
      count: overdueRows.length,
      status: overdueStatus,
      formula: 'Suma de saldos con fecha vencida ÷ Ventas del período × 100',
      action: overdueStatus === 'red'
        ? 'Llama y cobra hoy. No despaches más a los clientes morosos hasta regularizar.'
        : 'Programa recordatorios de cobro para las facturas próximas a vencer.'
    },
    upcomingAP: {
      value: upcomingTotal,
      count: upcomingRows.length,
      cash: cash.total,
      status: upcomingStatus,
      formula: 'Suma de cuentas por pagar con vencimiento en los próximos 15 días',
      action: upcomingTotal > cash.total
        ? 'Prioriza los pagos y negocia plazos con los proveedores.'
        : 'Las obligaciones próximas están cubiertas por la caja disponible.'
    },
    monthlyProfit: {
      value: pnl.netProfit,
      previous: previousPnl.netProfit,
      change: profitChange,
      status: profitStatus,
      formula: 'Ingresos del período − costo de ventas − gastos operativos',
      action: pnl.netProfit < 0
        ? 'Revisa precios, costo de compra y gastos fijos: el período cierra en pérdida.'
        : profitStatus === 'yellow'
          ? 'La utilidad es positiva pero cae frente al período anterior. Revisa el margen.'
          : 'Utilidad positiva y en mejora. Conserva las acciones comerciales.'
    },
    breakEven: {
      units: breakEvenUnits,
      currentUnits: pnl.units,
      fixedCosts: money(fixedCosts),
      contribution: pnl.contributionPerUnit,
      status: breakEvenStatus,
      formula: 'Costos fijos ÷ margen de contribución por bolsa',
      action: breakEvenUnits !== null && pnl.units < breakEvenUnits
        ? `Faltan ${round2(breakEvenUnits - pnl.units)} bolsas para cubrir los costos fijos.`
        : 'El volumen vendido supera el punto de equilibrio.'
    },
    netMargin: {
      value: pnl.netMargin,
      status: netMarginStatus,
      formula: '(Utilidad neta ÷ Ventas totales) × 100',
      action: netMarginStatus === 'red'
        ? 'La rentabilidad neta está por debajo de la meta. Revisa costos indirectos y precios.'
        : 'La rentabilidad sobre ventas está en rango.'
    },
    monthVsPrevious: {
      value: growth,
      current: currentRevenue,
      previous: previousRevenue,
      status: growthStatus,
      formula: '[(Ventas período actual − Ventas período anterior) ÷ Ventas período anterior] × 100',
      action: growth < 0
        ? 'Las ventas cayeron. Reactiva clientes y revisa la conversión de cotizaciones.'
        : growth > thresholds.salesGrowthGreen
          ? 'Crecimiento de dos dígitos frente al período anterior.'
          : 'El crecimiento es moderado. Busca nuevas oportunidades comerciales.'
    },
    inventoryValue: {
      value: inventory.total,
      units: inventory.units,
      coverageMonths: inventoryMonths,
      status: inventoryStatus,
      formula: 'Suma de (unidades × costo promedio)',
      action: inventoryStatus === 'red'
        ? 'El inventario supera 4 meses de ventas. Pausa compras y ofrece rotación.'
        : inventoryStatus === 'yellow'
          ? 'Vigila la rotación: el inventario se acerca a 4 meses de ventas.'
          : 'El nivel de inventario es saludable.'
    },
    ytdProfit: {
      value: money(ytd),
      status: ytdStatus,
      formula: 'Suma de utilidades desde el 1 de enero hasta la fecha de corte',
      action: ytd < 0
        ? 'El acumulado del año es negativo. Prioriza la recuperación del margen.'
        : 'La utilidad acumulada del año es positiva.'
    },
    eoq: {
      value: eoqRed,
      reorderCount: reorder.length,
      redCount: eoqRed,
      yellowCount: eoqYellow,
      status: eoqStatus,
      products: eoq,
      formula: 'EOQ = √(2 × D × S ÷ H)',
      action: firstEoqAlert
        ? `${firstEoqAlert.name}: ${firstEoqAlert.action}`
        : 'La política de pedido está equilibrada con la demanda reciente.'
    },
    salesByProductKpi: {
      value: productRevenueTotal,
      status: productMarginStatus,
      products,
      formula: 'Ventas del período agrupadas por producto',
      action: 'Impulsa los productos de mayor margen y mayor rotación.'
    },
    salesByCustomerKpi: {
      value: customerSummary.maxShare,
      status: customerSummary.status,
      customers,
      top: customerSummary.top,
      formula: 'Participación de cada cliente en las ventas del período',
      action: customerSummary.status === 'red'
        ? 'Un cliente concentra más de la mitad de las ventas. Diversifica la cartera comercial.'
        : 'La concentración de clientes se mantiene en un rango manejable.'
    },
    costShareKpi: {
      value: costShare.materialShare,
      status: materialStatus,
      rows: costShare.rows,
      total: costShare.total,
      formula: 'Participación de cada categoría en el costo total del período',
      action: materialStatus === 'red'
        ? 'El material supera el 75% del costo total. Renegocia compras o revisa fletes.'
        : 'La estructura de costos se mantiene en el rango esperado.'
    }
  };

  const alerts = computeAlerts();
  return {
    month: period.type === 'month' ? period.value : null,
    monthLabel: period.label,
    period: {
      ...describePeriod(period),
      dataStart,
      dataEnd,
      dataDays,
      inProgress,
      label: periodLabel
    },
    comparison: {
      ...describePeriod(previousPeriod),
      label: comparisonLabel
    },
    generatedAt: new Date().toISOString(),
    statusLabels: STATUS_LABELS,
    periodOptions: periodChoices,
    kpis,
    summary: {
      revenue: currentRevenue,
      saleCount: pnl.saleCount,
      units: pnl.units,
      profit: pnl.netProfit,
      cash: cash.total,
      cashCash: cash.cash,
      cashBank: cash.bank,
      inventory: inventory.total,
      overdueAR: overdueTotal,
      upcomingAP: upcomingTotal
    },
    chart: {
      title: chartTitle,
      months: series,
      sales: series.map((row) => row.sales),
      profit: series.map((row) => row.profit),
      cashIncome: series.map((row) => row.cashIncome),
      cashExpense: series.map((row) => row.cashExpense)
    },
    tables: {
      salesByProduct: products,
      salesByCustomer: customers,
      costShare: costShare.rows,
      costShareTotal: costShare.total,
      eoq
    },
    alerts
  };
}

function ageBucket(days) {
  if (days <= 0) return 'Corriente';
  if (days <= 30) return '1–30 días';
  if (days <= 60) return '31–60 días';
  if (days <= 90) return '61–90 días';
  return 'Más de 90 días';
}

export function getPortfolio() {
  const today = todayBogota();
  const cash = cashBalances(today);
  const receivables = db.prepare(`
    SELECT ar.*, c.name AS customer_name, c.phone AS customer_phone, s.invoice_number, s.delivery_date,
      (ar.amount - ar.paid) AS balance,
      CASE WHEN ar.due_date < ? THEN CAST(julianday(?) - julianday(ar.due_date) AS INTEGER) ELSE 0 END AS overdue_days
    FROM accounts_receivable ar
    JOIN customers c ON c.id = ar.customer_id
    JOIN sales s ON s.id = ar.sale_id
    WHERE ar.amount - ar.paid > 0.5
    ORDER BY ar.due_date ASC
  `).all(today, today);
  const payables = db.prepare(`
    SELECT ap.*, (ap.amount - ap.paid) AS balance,
      CASE WHEN ap.due_date < ? THEN CAST(julianday(?) - julianday(ap.due_date) AS INTEGER) ELSE 0 END AS overdue_days
    FROM accounts_payable ap
    WHERE ap.amount - ap.paid > 0.5
    ORDER BY ap.due_date ASC
  `).all(today, today);
  const buckets = ['Corriente', '1–30 días', '31–60 días', '61–90 días', 'Más de 90 días'];
  const arAging = Object.fromEntries(buckets.map((label) => [label, 0]));
  const apAging = Object.fromEntries(buckets.map((label) => [label, 0]));
  for (const row of receivables) arAging[ageBucket(row.overdue_days)] += row.balance;
  for (const row of payables) apAging[ageBucket(row.overdue_days)] += row.balance;

  const weekly = [];
  let cumulative = cash.total;
  for (let week = 0; week < 8; week += 1) {
    const start = addDays(today, week * 7 + (week === 0 ? 0 : 1));
    const end = addDays(today, (week + 1) * 7);
    const collect = receivables
      .filter((row) => (week === 0 ? row.due_date <= end : row.due_date > start && row.due_date <= end))
      .reduce((total, row) => total + row.balance, 0);
    const pay = payables
      .filter((row) => (week === 0 ? row.due_date <= end : row.due_date > start && row.due_date <= end))
      .reduce((total, row) => total + row.balance, 0);
    cumulative = money(cumulative + collect - pay);
    weekly.push({
      week: week + 1,
      start,
      end,
      collect: money(collect),
      pay: money(pay),
      net: money(collect - pay),
      cumulative
    });
  }
  const customerDebt = new Map();
  for (const row of receivables) {
    const key = row.customer_name;
    const existing = customerDebt.get(key) || { name: key, phone: row.customer_phone, balance: 0, invoices: 0, overdue: 0 };
    existing.balance += row.balance;
    existing.invoices += 1;
    if (row.overdue_days > 0) existing.overdue += row.balance;
    customerDebt.set(key, existing);
  }
  const providerDebt = new Map();
  for (const row of payables) {
    const existing = providerDebt.get(row.provider_name) || { name: row.provider_name, balance: 0, items: 0, overdue: 0 };
    existing.balance += row.balance;
    existing.items += 1;
    if (row.overdue_days > 0) existing.overdue += row.balance;
    providerDebt.set(row.provider_name, existing);
  }
  const totalAR = sum(receivables, 'balance');
  const totalAP = sum(payables, 'balance');
  return {
    asOf: today,
    cash,
    totalAR,
    totalAP,
    netWorkingCapital: money(totalAR + cash.total - totalAP),
    overdueAR: money(sum(receivables.filter((row) => row.overdue_days > 0), 'balance')),
    overdueAP: money(sum(payables.filter((row) => row.overdue_days > 0), 'balance')),
    counts: { receivables: receivables.length, payables: payables.length },
    aging: {
      labels: buckets,
      receivable: buckets.map((label) => money(arAging[label])),
      payable: buckets.map((label) => money(apAging[label]))
    },
    projection: weekly,
    topCustomers: [...customerDebt.values()]
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 6)
      .map((row) => ({ ...row, balance: money(row.balance), overdue: money(row.overdue) })),
    topProviders: [...providerDebt.values()]
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 6)
      .map((row) => ({ ...row, balance: money(row.balance), overdue: money(row.overdue) })),
    receivables: receivables.map((row) => ({ ...row, balance: money(row.balance), amount: money(row.amount), paid: money(row.paid) })),
    payables: payables.map((row) => ({ ...row, balance: money(row.balance), amount: money(row.amount), paid: money(row.paid) }))
  };
}

export function getIndirectCosts(period) {
  const month = safeMonth(period);
  return db.prepare(`
    SELECT * FROM indirect_costs WHERE period = ? ORDER BY is_fixed DESC, amount DESC, id
  `).all(month);
}

function legacyCosting(rawMonth) {
  const month = safeMonth(rawMonth);
  const bounds = monthBounds(month);
  const config = getConfig();
  const sales = db.prepare(`
    SELECT p.id AS product_id, p.code, p.name, p.unit, p.sale_price, p.avg_cost,
      SUM(s.quantity) AS quantity,
      SUM(s.total) AS revenue,
      SUM(s.subtotal) AS product_revenue,
      SUM(s.cost_of_goods) AS cogs,
      SUM(s.loading_value) AS loading
    FROM sales s JOIN products p ON p.id = s.product_id
    WHERE s.delivery_date BETWEEN ? AND ?
    GROUP BY p.id ORDER BY revenue DESC
  `).all(bounds.start, bounds.end);
  const indirectManual = getIndirectCosts(month);
  const gmfRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS amount FROM cash_movements
    WHERE movement_date BETWEEN ? AND ? AND type = 'egreso' AND category = 'gmf'
  `).get(bounds.start, bounds.end);
  const indirect = indirectManual.map((row) => ({
    ...row,
    amount: money(row.amount),
    is_auto: false
  }));
  if (Number(gmfRow.amount) > 0) {
    indirect.push({
      id: 'gmf-auto',
      period: month,
      category: '4x1000',
      description: 'Gravamen 4x1000 registrado en caja',
      amount: money(gmfRow.amount),
      allocation_method: 'valor_venta',
      is_fixed: 0,
      is_auto: true
    });
  }
  const totalRevenue = sum(sales, 'revenue');
  const totalQty = sum(sales, 'quantity');
  const rows = sales.map((sale) => {
    const purchases = db.prepare(`
      SELECT * FROM purchases WHERE product_id = ? AND arrival_date <= ?
      ORDER BY arrival_date DESC, id DESC LIMIT 3
    `).all(sale.product_id, bounds.end);
    let materialUnit = 0;
    let freightUnit = 0;
    let unloadingUnit = 0;
    const totalQtyBought = purchases.reduce((total, row) => total + Number(row.quantity), 0);
    if (totalQtyBought > 0) {
      materialUnit = purchases.reduce((total, row) => total + Number(row.quantity) * Number(row.unit_cost), 0) / totalQtyBought;
      freightUnit = purchases.reduce((total, row) => total + Number(row.freight_value), 0) / totalQtyBought;
      unloadingUnit = purchases.reduce((total, row) => total + Number(row.unloading_value), 0) / totalQtyBought;
    } else {
      materialUnit = Number(sale.avg_cost) || 0;
    }
    const landedUnit = materialUnit + freightUnit + unloadingUnit;
    const cogs = money(sale.cogs);
    const material = landedUnit > 0 ? money(cogs * (materialUnit / landedUnit)) : cogs;
    const freight = landedUnit > 0 ? money(cogs * (freightUnit / landedUnit)) : 0;
    const unloading = money(cogs - material - freight);
    const cargue = money(sale.loading);
    return {
      ...sale,
      revenue: money(sale.revenue),
      product_revenue: money(sale.product_revenue),
      quantity: roundStock(sale.quantity),
      cogs,
      material,
      freight,
      unloading,
      cargue,
      direct_cost: money(cogs + cargue),
      allocated: 0,
      indirect_total: 0,
      total_cost: 0,
      profit: 0,
      margin: 0,
      cost_share: 0
    };
  });
  const revenueTotal = sum(rows, 'revenue') || 1;
  const qtyTotal = sum(rows, 'quantity') || 1;
  for (const cost of indirect) {
    for (const row of rows) {
      const basis = cost.allocation_method === 'valor_venta'
        ? (Number(row.revenue) || 0) / revenueTotal
        : (Number(row.quantity) || 0) / qtyTotal;
      row.allocated = money(row.allocated + Number(cost.amount) * basis);
    }
  }
  for (const row of rows) {
    row.indirect_total = money(row.allocated);
    row.total_cost = money(row.direct_cost + row.indirect_total);
    row.profit = money(row.revenue - row.total_cost);
    row.margin = row.revenue ? round2((row.profit / row.revenue) * 100) : 0;
    row.cost_share = round2((row.total_cost / (revenueTotal || 1)) * 100);
  }
  const indirectTotal = sum(indirect, 'amount');
  const totals = {
    revenue: sum(rows, 'revenue'),
    cogs: sum(rows, 'cogs'),
    material: sum(rows, 'material'),
    freight: sum(rows, 'freight'),
    unloading: sum(rows, 'unloading'),
    cargue: sum(rows, 'cargue'),
    directCost: sum(rows, 'direct_cost'),
    indirect: indirectTotal,
    totalCost: sum(rows, 'total_cost'),
    profit: sum(rows, 'profit'),
    margin: 0,
    quantity: roundStock(sum(rows, 'quantity'))
  };
  totals.margin = totals.revenue ? round2((totals.profit / totals.revenue) * 100) : 0;
  return {
    month,
    monthLabel: monthLabel(month),
    rows,
    indirect,
    totals,
    config,
    methods: { volumen: 'Por volumen (bultos)', valor_venta: 'Por valor de venta' },
    notes: 'El costo directo parte del costo de ventas (que ya incluye flete y descargue capitalizados). La proporción material/flete/descargue se estima con las últimas 3 compras del producto.'
  };
}

export function getCosting(input) {
  const today = todayBogota();
  const period = typeof input === 'string'
    ? resolvePeriod('month', input)
    : resolvePeriodFromQuery(input || {}, today);
  const dataEnd = period.end > today ? today : period.end;
  const dataStart = period.start > dataEnd ? dataEnd : period.start;
  const dataDays = daysBetweenInclusive(dataStart, dataEnd);
  const config = getConfig();
  const sales = db.prepare(`
    SELECT p.id AS product_id, p.code, p.name, p.unit, p.sale_price, p.avg_cost,
      SUM(s.quantity) AS quantity,
      SUM(s.total) AS revenue,
      SUM(s.subtotal) AS product_revenue,
      SUM(s.cost_of_goods) AS cogs,
      SUM(s.loading_value) AS loading
    FROM sales s JOIN products p ON p.id = s.product_id
    WHERE s.delivery_date BETWEEN ? AND ?
    GROUP BY p.id ORDER BY revenue DESC
  `).all(dataStart, dataEnd);
  const indirectBreakdown = indirectCostsForRange(dataStart, dataEnd);
  const gmfRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS amount FROM cash_movements
    WHERE movement_date BETWEEN ? AND ? AND type = 'egreso' AND category = 'gmf'
  `).get(dataStart, dataEnd);
  const indirect = indirectBreakdown.detailed.map((row) => ({
    ...row,
    amount: money(row.amount),
    is_auto: false
  }));
  if (Number(gmfRow.amount) > 0) {
    indirect.push({
      id: 'gmf-auto',
      period: period.key,
      category: '4x1000',
      description: 'Gravamen 4x1000 registrado en caja',
      amount: money(gmfRow.amount),
      allocation_method: 'valor_venta',
      is_fixed: 0,
      is_auto: true
    });
  }
  const rows = sales.map((sale) => {
    const purchases = db.prepare(`
      SELECT * FROM purchases WHERE product_id = ? AND arrival_date <= ?
      ORDER BY arrival_date DESC, id DESC LIMIT 3
    `).all(sale.product_id, dataEnd);
    let materialUnit = 0;
    let freightUnit = 0;
    let unloadingUnit = 0;
    const totalQtyBought = purchases.reduce((total, row) => total + Number(row.quantity), 0);
    if (totalQtyBought > 0) {
      materialUnit = purchases.reduce((total, row) => total + Number(row.quantity) * Number(row.unit_cost), 0) / totalQtyBought;
      freightUnit = purchases.reduce((total, row) => total + Number(row.freight_value), 0) / totalQtyBought;
      unloadingUnit = purchases.reduce((total, row) => total + Number(row.unloading_value), 0) / totalQtyBought;
    } else {
      materialUnit = Number(sale.avg_cost) || 0;
    }
    const landedUnit = materialUnit + freightUnit + unloadingUnit;
    const cogs = money(sale.cogs);
    const material = landedUnit > 0 ? money(cogs * (materialUnit / landedUnit)) : cogs;
    const freight = landedUnit > 0 ? money(cogs * (freightUnit / landedUnit)) : 0;
    const unloading = money(cogs - material - freight);
    const cargue = money(sale.loading);
    return {
      ...sale,
      revenue: money(sale.revenue),
      product_revenue: money(sale.product_revenue),
      quantity: roundStock(sale.quantity),
      cogs,
      material,
      freight,
      unloading,
      cargue,
      direct_cost: money(cogs + cargue),
      allocated: 0,
      indirect_total: 0,
      total_cost: 0,
      profit: 0,
      margin: 0,
      cost_share: 0
    };
  });
  const revenueTotal = sum(rows, 'revenue') || 1;
  const qtyTotal = sum(rows, 'quantity') || 1;
  for (const cost of indirect) {
    for (const row of rows) {
      const basis = cost.allocation_method === 'valor_venta'
        ? (Number(row.revenue) || 0) / revenueTotal
        : (Number(row.quantity) || 0) / qtyTotal;
      row.allocated = money(row.allocated + Number(cost.amount) * basis);
    }
  }
  for (const row of rows) {
    row.indirect_total = money(row.allocated);
    row.total_cost = money(row.direct_cost + row.indirect_total);
    row.profit = money(row.revenue - row.total_cost);
    row.margin = row.revenue ? round2((row.profit / row.revenue) * 100) : 0;
    row.cost_share = round2((row.total_cost / (revenueTotal || 1)) * 100);
  }
  const indirectTotal = sum(indirect, 'amount');
  const totals = {
    revenue: sum(rows, 'revenue'),
    cogs: sum(rows, 'cogs'),
    material: sum(rows, 'material'),
    freight: sum(rows, 'freight'),
    unloading: sum(rows, 'unloading'),
    cargue: sum(rows, 'cargue'),
    directCost: sum(rows, 'direct_cost'),
    indirect: indirectTotal,
    totalCost: sum(rows, 'total_cost'),
    profit: sum(rows, 'profit'),
    margin: 0,
    quantity: roundStock(sum(rows, 'quantity'))
  };
  totals.margin = totals.revenue ? round2((totals.profit / totals.revenue) * 100) : 0;
  const inProgress = period.end > today;
  const earliestYear = db.prepare(`
    SELECT MIN(year_value) AS year_value FROM (
      SELECT MIN(substr(delivery_date, 1, 4)) AS year_value FROM sales
      UNION ALL
      SELECT MIN(substr(arrival_date, 1, 4)) AS year_value FROM purchases
    )
  `).get()?.year_value;
  const availablePeriods = periodOptions(period, {
    minYear: Number(earliestYear) || Number(today.slice(0, 4)) - 4
  });
  return {
    period: {
      ...describePeriod(period),
      dataStart,
      dataEnd,
      dataDays,
      inProgress,
      label: `${period.label}${inProgress ? ' · en curso' : ''}`
    },
    periodOptions: availablePeriods,
    month: period.type === 'month' ? period.value : null,
    monthLabel: `${period.label}${inProgress ? ' · en curso' : ''}`,
    periodLabel: `${period.label}${inProgress ? ' · en curso' : ''}`,
    rows,
    indirect,
    totals,
    config,
    methods: { volumen: 'Por volumen (bultos)', valor_venta: 'Por valor de venta' },
    notes: 'El costo directo parte del costo de ventas (que ya incluye flete y descargue capitalizados). La proporción material/flete/descargue se estima con las últimas 3 compras del producto. Los costos indirectos se prorratean por días cuando el período es una semana o un año en curso.'
  };
}

function paymentsAsOf(table, linkedField, asOf) {
  return db.prepare(`
    SELECT ${linkedField} AS linked_id, COALESCE(SUM(amount),0) AS paid
    FROM ${table}
    WHERE payment_date <= ?
    GROUP BY ${linkedField}
  `).all(asOf);
}

export function getFinancialStatements(rawMonth) {
  const month = safeMonth(rawMonth);
  const bounds = monthBounds(month);
  const pnl = pnlForMonth(month);
  const config = getConfig();
  const cash = cashBalances(bounds.end);
  const inventory = inventorySnapshot(bounds.end);

  const arPaidMap = new Map(paymentsAsOf('receivable_payments', 'receivable_id', bounds.end).map((row) => [row.linked_id, row.paid]));
  const arRows = db.prepare(`
    SELECT ar.*, s.delivery_date FROM accounts_receivable ar
    JOIN sales s ON s.id = ar.sale_id
    WHERE s.delivery_date <= ?
  `).all(bounds.end);
  const accountsReceivable = arRows.reduce((total, row) => {
    const paid = Number(arPaidMap.get(row.id) || 0);
    return total + Math.max(0, Number(row.amount) - paid);
  }, 0);

  const apPaidMap = new Map(paymentsAsOf('payable_payments', 'payable_id', bounds.end).map((row) => [row.linked_id, row.paid]));
  const apRows = db.prepare(`
    SELECT * FROM accounts_payable WHERE date(created_at) <= ?
  `).all(bounds.end);
  const accountsPayable = apRows.reduce((total, row) => {
    const paid = Number(apPaidMap.get(row.id) || 0);
    return total + Math.max(0, Number(row.amount) - paid);
  }, 0);

  const assets = {
    cash: money(cash.cash),
    banks: money(cash.bank),
    accountsReceivable: money(accountsReceivable),
    inventory: inventory.total,
    total: money(cash.total + accountsReceivable + inventory.total)
  };
  const liabilities = {
    accountsPayable: money(accountsPayable),
    total: money(accountsPayable)
  };
  const capital = money(config.openingBalances.capital);
  const ytdMonths = monthRange(month, Number(month.slice(5, 7)));
  const resultsYtd = money(ytdMonths.reduce((total, entry) => total + pnlForMonth(entry).netProfit, 0));
  const balancing = money(assets.total - liabilities.total - capital - resultsYtd);
  const retained = money(resultsYtd + balancing);
  const equity = {
    capital,
    resultsYtd,
    balancing,
    retained,
    total: money(capital + retained)
  };
  const balanced = Math.abs(assets.total - (liabilities.total + equity.total)) < 1;

  const expenseGroups = pnl.indirectByCategory.map((row) => ({
    category: row.category,
    amount: money(row.amount)
  }));
  if (pnl.gmf > 0) expenseGroups.push({ category: 'Gravamen 4x1000', amount: pnl.gmf });
  const incomeStatement = {
    heading: `Estado de resultados · ${monthLabel(month)}`,
    revenue: pnl.revenue,
    lines: {
      revenue: pnl.revenue,
      costOfSales: money(pnl.cogs + pnl.loadingCost),
      cogs: pnl.cogs,
      loading: pnl.loadingCost,
      grossProfit: pnl.grossProfit,
      operatingExpenses: pnl.operatingExpenses,
      expenseGroups,
      netProfit: pnl.netProfit
    },
    margins: { gross: pnl.grossMargin, net: pnl.netMargin }
  };

  const cashMovementRows = db.prepare(`
    SELECT type, category, COALESCE(SUM(amount),0) AS amount
    FROM cash_movements
    WHERE movement_date BETWEEN ? AND ?
    GROUP BY type, category
    ORDER BY type DESC, amount DESC
  `).all(bounds.start, bounds.end);
  const inflows = cashMovementRows.filter((row) => row.type === 'ingreso').map((row) => ({ category: row.category, amount: money(row.amount) }));
  const outflows = cashMovementRows.filter((row) => row.type === 'egreso').map((row) => ({ category: row.category, amount: money(row.amount) }));
  const openingCash = cashBalances(addDays(bounds.start, -1)).total;
  const totalIn = sum(inflows, 'amount');
  const totalOut = sum(outflows, 'amount');
  const closingCash = money(openingCash + totalIn - totalOut);
  const cashFlow = {
    opening: money(openingCash),
    inflows,
    outflows,
    totalIn: money(totalIn),
    totalOut: money(totalOut),
    net: money(totalIn - totalOut),
    closing: closingCash,
    variation: money(closingCash - openingCash)
  };

  const trend = monthlySeries(month, 6).map((row) => ({
    month: row.month,
    label: row.label,
    sales: row.sales,
    profit: row.profit,
    cashIncome: row.cashIncome,
    cashExpense: row.cashExpense
  }));

  return {
    month,
    monthLabel: monthLabel(month),
    company: config.business,
    asOf: bounds.end,
    incomeStatement,
    balanceSheet: {
      heading: `Balance general · corte ${bounds.end}`,
      assets,
      liabilities,
      equity,
      balanced,
      checkDifference: money(assets.total - liabilities.total - equity.total)
    },
    cashFlow,
    trend,
    pnl
  };
}

export function getDashboardDefinitions() {
  return {
    statusLabels: STATUS_LABELS,
    note: 'Todos los valores están expresados en pesos colombianos (COP). La fecha de corte se calcula en la zona horaria de Colombia (UTC−5).'
  };
}

export function getInventoryOverview() {
  const inventory = inventoryCurrent();
  const eoq = eoqRows();
  const eoqMap = new Map(eoq.map((row) => [row.id, row]));
  const products = inventory.items.map((item) => {
    const eoqRow = eoqMap.get(item.id);
    const margin = item.sale_price > 0
      ? round2(((item.sale_price - item.avg_cost) / item.sale_price) * 100)
      : 0;
    return {
      ...item,
      inventory_value: item.inventory_value,
      margin,
      margin_status: margin < 0 ? 'red' : margin >= getConfig().thresholds.marginGreen ? 'green' : margin >= getConfig().thresholds.marginYellow ? 'yellow' : 'red',
      eoq: eoqRow?.eoq ?? 0,
      stock_status: eoqRow?.stock_status || 'neutral',
      eoq_status: eoqRow?.status || 'neutral',
      action: eoqRow?.action || 'Sin datos suficientes de demanda para calcular EOQ.'
    };
  });
  const lowStock = products.filter((product) => product.stock <= product.min_stock);
  return {
    products,
    summary: {
      skuCount: products.length,
      units: inventory.units,
      value: inventory.total,
      lowStock: lowStock.length,
      negativeMargin: products.filter((product) => product.margin < 0).length,
      eoqAlerts: products.filter((product) => product.eoq_status === 'red').length
    },
    eoq
  };
}

