import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { db } from '../db.js';
import { getConfig } from '../config.js';
import {
  addDays,
  isValidDate,
  monthBounds,
  monthLabel,
  monthOf,
  todayBogota
} from '../lib/dates.js';
import { money } from '../lib/money.js';
import { getCosting, getFinancialStatements, getInventoryOverview, getPortfolio } from './analytics.js';
import { ApiError } from '../lib/http.js';

const NAVY = 'FF111D2B';
const GOLD = 'FFF5B301';
const LIGHT = 'FFF7F4EC';
const BORDER = 'FFE3E0D8';

function excelCellValue(value) {
  if (value === undefined || value === null) return '';
  return value;
}

export async function buildWorkbookBuffer({ title, company, sheets, meta = [] }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CementoControl';
  workbook.created = new Date();
  workbook.title = title || 'Reporte CementoControl';
  const cover = workbook.addWorksheet('Portada', { properties: { tabColor: { argb: GOLD } } });
  cover.columns = [{ width: 26 }, { width: 60 }];
  cover.mergeCells('A1:B1');
  cover.getCell('A1').value = 'CEMENTOCONTROL';
  cover.getCell('A1').font = { size: 20, bold: true, color: { argb: NAVY } };
  cover.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
  cover.getCell('A1').alignment = { vertical: 'middle' };
  cover.getRow(1).height = 38;
  cover.mergeCells('A3:B3');
  cover.getCell('A3').value = company?.name || 'Cemento Andino S.A.S.';
  cover.getCell('A3').font = { size: 14, bold: true, color: { argb: NAVY } };
  cover.getCell('A5').value = 'Reporte';
  cover.getCell('A5').font = { italic: true, color: { argb: 'FF6B7280' } };
  cover.getCell('B5').value = title || '';
  cover.getCell('A6').value = 'Generado';
  cover.getCell('A6').font = { italic: true, color: { argb: 'FF6B7280' } };
  cover.getCell('B6').value = new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'America/Bogota'
  }).format(new Date());
  meta.forEach(([label, value], index) => {
    const row = 8 + index;
    cover.getCell(`A${row}`).value = label;
    cover.getCell(`A${row}`).font = { bold: true, color: { argb: NAVY } };
    cover.getCell(`B${row}`).value = excelCellValue(value);
  });
  cover.getCell(`A${10 + meta.length}`).value = 'Sistema de control de ventas de cemento · Pesos colombianos (COP) · Zona horaria Colombia (UTC−5)';
  cover.getCell(`A${10 + meta.length}`).font = { size: 9, italic: true, color: { argb: 'FF6B7280' } };
  cover.mergeCells(`A${10 + meta.length}:B${10 + meta.length}`);

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(String(sheet.name).slice(0, 31), {
      properties: { tabColor: { argb: sheet.tabColor || NAVY } },
      views: [{ state: 'frozen', ySplit: 1 }]
    });
    ws.columns = (sheet.columns || []).map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width || 18,
      style: {
        numFmt: column.numFmt,
        alignment: column.align
      }
    }));
    ws.getRow(1).height = 24;
    ws.getRow(1).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: GOLD } } };
    });
    const rows = sheet.rows || [];
    rows.forEach((row, index) => {
      const inserted = ws.addRow(row);
      inserted.height = 19;
      inserted.eachCell((cell) => {
        cell.font = { size: 10, color: { argb: 'FF2A3440' } };
        cell.alignment = { vertical: 'middle', wrapText: false };
        if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF8F2' } };
        cell.border = { bottom: { style: 'hair', color: { argb: BORDER } } };
      });
    });
    if (sheet.columns?.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
    if (sheet.totalRow) {
      const total = ws.addRow(sheet.totalRow);
      total.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: NAVY } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
        cell.border = { top: { style: 'thin', color: { argb: NAVY } } };
      });
    }
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function csvFromRows(columns, rows) {
  const escapeCsv = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const header = columns.map((column) => escapeCsv(column.header)).join(';');
  const body = rows.map((row) => columns.map((column) => {
    const value = row[column.key];
    return escapeCsv(typeof value === 'number' ? String(value).replace('.', ',') : value);
  }).join(';'));
  return Buffer.from(`\uFEFF${[header, ...body].join('\r\n')}\r\n`, 'utf8');
}

function exportHeader(res, filename, contentType) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
}

function saleState(row, today) {
  const balance = row.condition === 'credito'
    ? money(Math.max(0, Number(row.receivable_amount || 0) - Number(row.receivable_paid || 0)))
    : 0;
  if (balance <= 0.5) return { balance, status: 'Pagada' };
  if (row.due_date < today) return { balance, status: 'Vencida' };
  if (row.due_date <= addDays(today, 7)) return { balance, status: 'Por vencer' };
  return { balance, status: 'Pendiente' };
}

function payableState(row, today) {
  const balance = money(Math.max(0, Number(row.amount) - Number(row.paid)));
  if (balance <= 0.5) return { balance, status: 'Pagada' };
  if (row.due_date < today) return { balance, status: 'Vencida' };
  if (row.due_date <= addDays(today, 15)) return { balance, status: 'Próxima' };
  return { balance, status: 'Pendiente' };
}

function dateFilters(query, dateColumn) {
  const conditions = [];
  const params = [];
  if (isValidDate(query.from)) {
    conditions.push(`${dateColumn} >= ?`);
    params.push(query.from);
  }
  if (isValidDate(query.to)) {
    conditions.push(`${dateColumn} <= ?`);
    params.push(query.to);
  }
  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

function buildSalesDataset(query) {
  const today = todayBogota();
  const { where, params } = dateFilters(query, 's.delivery_date');
  const records = db.prepare(`
    SELECT s.*, c.name AS customer_name, p.name AS product_name, co.name AS courier_name,
      u.full_name AS seller_name, ar.amount AS receivable_amount, ar.paid AS receivable_paid
    FROM sales s
    JOIN customers c ON c.id = s.customer_id
    JOIN products p ON p.id = s.product_id
    LEFT JOIN couriers co ON co.id = s.courier_id
    LEFT JOIN users u ON u.id = s.created_by
    LEFT JOIN accounts_receivable ar ON ar.sale_id = s.id
    ${where}
    ORDER BY s.delivery_date DESC, s.id DESC
  `).all(...params).map((row) => {
    const state = saleState(row, today);
    return {
      invoice_number: row.invoice_number,
      delivery_date: row.delivery_date,
      customer_name: row.customer_name,
      product_name: row.product_name,
      quantity: row.quantity,
      unit_price: money(row.unit_price),
      subtotal: money(row.subtotal),
      loading_value: money(row.loading_value),
      total: money(row.total),
      payment_condition: row.payment_condition,
      due_date: row.due_date || '',
      paid: row.payment_condition === 'credito' ? money(row.receivable_paid) : money(row.total),
      balance: state.balance,
      status: state.status,
      seller_name: row.seller_name || '',
      notes: row.notes || ''
    };
  });
  const columns = [
    { header: 'Factura', key: 'invoice_number', width: 14 },
    { header: 'Fecha entrega', key: 'delivery_date', width: 14 },
    { header: 'Cliente', key: 'customer_name', width: 30 },
    { header: 'Producto', key: 'product_name', width: 32 },
    { header: 'Cantidad', key: 'quantity', width: 11, numFmt: '#,##0' },
    { header: 'Precio unitario', key: 'unit_price', width: 16, numFmt: '$#,##0' },
    { header: 'Subtotal', key: 'subtotal', width: 16, numFmt: '$#,##0' },
    { header: 'Cargue', key: 'loading_value', width: 13, numFmt: '$#,##0' },
    { header: 'Total', key: 'total', width: 16, numFmt: '$#,##0' },
    { header: 'Condición', key: 'payment_condition', width: 12 },
    { header: 'Vencimiento', key: 'due_date', width: 14 },
    { header: 'Cobrado', key: 'paid', width: 15, numFmt: '$#,##0' },
    { header: 'Saldo', key: 'balance', width: 15, numFmt: '$#,##0' },
    { header: 'Estado', key: 'status', width: 13 },
    { header: 'Vendedor', key: 'seller_name', width: 22 },
    { header: 'Notas', key: 'notes', width: 30 }
  ];
  return {
    title: 'Reporte de ventas',
    filename: `ventas-${query.from || 'inicio'}-${query.to || today}`,
    columns,
    rows: records,
    sheets: [{
      name: 'Ventas',
      columns,
      rows: records,
      totalRow: ['', '', '', '', '', '', '', 'TOTAL', money(records.reduce((sum, row) => sum + row.total, 0)), '', '', money(records.reduce((sum, row) => sum + row.paid, 0)), money(records.reduce((sum, row) => sum + row.balance, 0))]
    }],
    csv: { columns, rows: records }
  };
}

function buildPurchasesDataset(query) {
  const today = todayBogota();
  const { where, params } = dateFilters(query, 'p.arrival_date');
  const records = db.prepare(`
    SELECT p.*, s.name AS supplier_name, pr.name AS product_name,
      COALESCE((SELECT SUM(paid) FROM accounts_payable WHERE purchase_id = p.id), 0) AS ap_paid
    FROM purchases p
    JOIN suppliers s ON s.id = p.supplier_id
    JOIN products pr ON pr.id = p.product_id
    ${where}
    ORDER BY p.arrival_date DESC, p.id DESC
  `).all(...params).map((row) => {
    const paid = money(Number(row.total_paid_at_creation) + Number(row.ap_paid));
    const balance = money(row.total_cost - paid);
    return {
      doc_number: row.doc_number,
      arrival_date: row.arrival_date,
      supplier_name: row.supplier_name,
      product_name: row.product_name,
      quantity: row.quantity,
      unit_cost: money(row.unit_cost),
      freight_value: money(row.freight_value),
      unloading_value: money(row.unloading_value),
      total_cost: money(row.total_cost),
      paid,
      balance,
      purchase_type: row.purchase_type,
      credit_due_date: row.credit_due_date || '',
      status: balance <= 0.5 ? 'Pagada' : row.credit_due_date && row.credit_due_date < today ? 'Vencida' : 'Crédito'
    };
  });
  const columns = [
    { header: 'Documento', key: 'doc_number', width: 14 },
    { header: 'Fecha llegada', key: 'arrival_date', width: 14 },
    { header: 'Proveedor', key: 'supplier_name', width: 28 },
    { header: 'Producto', key: 'product_name', width: 32 },
    { header: 'Cantidad', key: 'quantity', width: 11, numFmt: '#,##0' },
    { header: 'Costo unitario', key: 'unit_cost', width: 16, numFmt: '$#,##0' },
    { header: 'Flete', key: 'freight_value', width: 14, numFmt: '$#,##0' },
    { header: 'Descargue', key: 'unloading_value', width: 14, numFmt: '$#,##0' },
    { header: 'Costo total', key: 'total_cost', width: 16, numFmt: '$#,##0' },
    { header: 'Pagado', key: 'paid', width: 16, numFmt: '$#,##0' },
    { header: 'Saldo', key: 'balance', width: 16, numFmt: '$#,##0' },
    { header: 'Condición', key: 'purchase_type', width: 12 },
    { header: 'Vencimiento', key: 'credit_due_date', width: 14 },
    { header: 'Estado', key: 'status', width: 13 }
  ];
  return {
    title: 'Reporte de compras',
    filename: `compras-${query.from || 'inicio'}-${query.to || today}`,
    columns,
    rows: records,
    sheets: [{
      name: 'Compras',
      columns,
      rows: records,
      totalRow: ['', '', '', '', '', '', 'TOTAL', '', money(records.reduce((sum, row) => sum + row.total_cost, 0)), money(records.reduce((sum, row) => sum + row.paid, 0)), money(records.reduce((sum, row) => sum + row.balance, 0))]
    }],
    csv: { columns, rows: records }
  };
}

function buildInventoryDataset(query) {
  const data = getInventoryOverview();
  const records = data.products.map((row) => ({
    code: row.code,
    name: row.name,
    unit: row.unit,
    stock: row.stock,
    min_stock: row.min_stock,
    avg_cost: row.avg_cost,
    sale_price: money(row.sale_price),
    margin: row.margin,
    inventory_value: row.inventory_value,
    eoq: row.eoq,
    status: row.eoq_status === 'red' ? 'Revisar pedido' : row.eoq_status === 'yellow' ? 'Vigilar' : 'Saludable'
  }));
  const columns = [
    { header: 'Código', key: 'code', width: 14 },
    { header: 'Producto', key: 'name', width: 34 },
    { header: 'Unidad', key: 'unit', width: 11 },
    { header: 'Stock', key: 'stock', width: 11, numFmt: '#,##0' },
    { header: 'Stock mínimo', key: 'min_stock', width: 14, numFmt: '#,##0' },
    { header: 'Costo promedio', key: 'avg_cost', width: 16, numFmt: '$#,##0' },
    { header: 'Precio venta', key: 'sale_price', width: 16, numFmt: '$#,##0' },
    { header: 'Margen %', key: 'margin', width: 12, numFmt: '0.0' },
    { header: 'Valor inventario', key: 'inventory_value', width: 18, numFmt: '$#,##0' },
    { header: 'EOQ', key: 'eoq', width: 12, numFmt: '#,##0' },
    { header: 'Semáforo EOQ', key: 'status', width: 16 }
  ];
  return {
    title: 'Inventario de productos',
    filename: `inventario-${todayBogota()}`,
    columns,
    rows: records,
    sheets: [{
      name: 'Inventario',
      columns,
      rows: records,
      totalRow: ['', 'TOTAL', '', records.reduce((sum, row) => sum + row.stock, 0), '', '', '', '', money(records.reduce((sum, row) => sum + row.inventory_value, 0))]
    }],
    csv: { columns, rows: records },
    summary: data.summary
  };
}

function buildCashDataset(query) {
  const today = todayBogota();
  const from = isValidDate(query.from) ? query.from : monthBounds(monthOf(today)).start;
  const to = isValidDate(query.to) ? query.to : today;
  const records = db.prepare(`
    SELECT c.*, u.full_name AS created_by_name
    FROM cash_movements c LEFT JOIN users u ON u.id = c.created_by
    WHERE c.movement_date BETWEEN ? AND ?
    ORDER BY c.movement_date DESC, c.id DESC
  `).all(from, to).map((row) => ({
    movement_date: row.movement_date,
    type: row.type,
    category: row.category,
    description: row.description || '',
    method: row.method,
    amount: money(row.amount),
    reference: row.reference_type ? `${row.reference_type} #${row.reference_id || ''}` : '',
    created_by_name: row.created_by_name || 'Sistema'
  }));
  const columns = [
    { header: 'Fecha', key: 'movement_date', width: 14 },
    { header: 'Tipo', key: 'type', width: 12 },
    { header: 'Categoría', key: 'category', width: 16 },
    { header: 'Descripción', key: 'description', width: 40 },
    { header: 'Medio', key: 'method', width: 12 },
    { header: 'Valor', key: 'amount', width: 16, numFmt: '$#,##0' },
    { header: 'Referencia', key: 'reference', width: 22 },
    { header: 'Registrado por', key: 'created_by_name', width: 24 }
  ];
  return {
    title: `Movimientos de caja · ${from} a ${to}`,
    filename: `caja-${from}-${to}`,
    columns,
    rows: records,
    sheets: [{ name: 'Caja', columns, rows: records }],
    csv: { columns, rows: records }
  };
}

function buildReceivablesDataset() {
  const today = todayBogota();
  const records = db.prepare(`
    SELECT ar.*, c.name AS customer_name, s.invoice_number, s.delivery_date,
      (SELECT MAX(payment_date) FROM receivable_payments rp WHERE rp.receivable_id = ar.id) AS last_payment
    FROM accounts_receivable ar
    JOIN customers c ON c.id = ar.customer_id
    JOIN sales s ON s.id = ar.sale_id
    ORDER BY ar.due_date ASC
  `).all().map((row) => {
    const balance = money(row.amount - row.paid);
    const days = row.due_date < today ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${row.due_date}T12:00:00Z`)) / 86400000) : 0;
    return {
      invoice_number: row.invoice_number,
      delivery_date: row.delivery_date,
      customer_name: row.customer_name,
      due_date: row.due_date,
      amount: money(row.amount),
      paid: money(row.paid),
      balance,
      overdue_days: days,
      status: balance <= 0.5 ? 'Pagada' : days > 0 ? 'Vencida' : 'Pendiente',
      last_payment: row.last_payment || ''
    };
  });
  const columns = [
    { header: 'Factura', key: 'invoice_number', width: 14 },
    { header: 'Fecha entrega', key: 'delivery_date', width: 14 },
    { header: 'Cliente', key: 'customer_name', width: 30 },
    { header: 'Vence', key: 'due_date', width: 13 },
    { header: 'Total', key: 'amount', width: 16, numFmt: '$#,##0' },
    { header: 'Abonado', key: 'paid', width: 16, numFmt: '$#,##0' },
    { header: 'Saldo', key: 'balance', width: 16, numFmt: '$#,##0' },
    { header: 'Días vencida', key: 'overdue_days', width: 14 },
    { header: 'Estado', key: 'status', width: 13 },
    { header: 'Último abono', key: 'last_payment', width: 14 }
  ];
  return {
    title: 'Cartera por cobrar',
    filename: `cartera-cxc-${today}`,
    columns,
    rows: records,
    sheets: [{ name: 'CxC', columns, rows: records }],
    csv: { columns, rows: records }
  };
}

function buildPayablesDataset() {
  const today = todayBogota();
  const records = db.prepare(`
    SELECT ap.*, p.doc_number, s.invoice_number,
      (SELECT MAX(payment_date) FROM payable_payments pp WHERE pp.payable_id = ap.id) AS last_payment
    FROM accounts_payable ap
    LEFT JOIN purchases p ON p.id = ap.purchase_id
    LEFT JOIN sales s ON s.id = ap.sale_id
    ORDER BY ap.due_date ASC
  `).all().map((row) => {
    const balance = money(row.amount - row.paid);
    const days = row.due_date < today ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${row.due_date}T12:00:00Z`)) / 86400000) : 0;
    return {
      provider_name: row.provider_name,
      concept: row.concept,
      description: row.description || '',
      due_date: row.due_date,
      amount: money(row.amount),
      paid: money(row.paid),
      balance,
      overdue_days: days,
      status: balance <= 0.5 ? 'Pagada' : days > 0 ? 'Vencida' : 'Pendiente',
      last_payment: row.last_payment || ''
    };
  });
  const columns = [
    { header: 'Proveedor', key: 'provider_name', width: 28 },
    { header: 'Concepto', key: 'concept', width: 14 },
    { header: 'Descripción', key: 'description', width: 38 },
    { header: 'Vence', key: 'due_date', width: 13 },
    { header: 'Valor', key: 'amount', width: 16, numFmt: '$#,##0' },
    { header: 'Pagado', key: 'paid', width: 16, numFmt: '$#,##0' },
    { header: 'Saldo', key: 'balance', width: 16, numFmt: '$#,##0' },
    { header: 'Días vencida', key: 'overdue_days', width: 14 },
    { header: 'Estado', key: 'status', width: 13 },
    { header: 'Último pago', key: 'last_payment', width: 14 }
  ];
  return {
    title: 'Cartera por pagar',
    filename: `cartera-cxp-${today}`,
    columns,
    rows: records,
    sheets: [{ name: 'CxP', columns, rows: records }],
    csv: { columns, rows: records }
  };
}

function datasetFromCosting(monthOrQuery) {
  const data = getCosting(monthOrQuery);
  const columns = [
    { header: 'Código', key: 'code', width: 14 },
    { header: 'Producto', key: 'name', width: 32 },
    { header: 'Bultos vendidos', key: 'quantity', width: 16, numFmt: '#,##0' },
    { header: 'Ingresos', key: 'revenue', width: 16, numFmt: '$#,##0' },
    { header: 'Material', key: 'material', width: 16, numFmt: '$#,##0' },
    { header: 'Flete', key: 'freight', width: 16, numFmt: '$#,##0' },
    { header: 'Descargue', key: 'unloading', width: 16, numFmt: '$#,##0' },
    { header: 'Cargue', key: 'cargue', width: 16, numFmt: '$#,##0' },
    { header: 'Indirectos', key: 'indirect_total', width: 16, numFmt: '$#,##0' },
    { header: 'Costo total', key: 'total_cost', width: 18, numFmt: '$#,##0' },
    { header: 'Utilidad', key: 'profit', width: 16, numFmt: '$#,##0' },
    { header: 'Margen %', key: 'margin', width: 12, numFmt: '0.0' }
  ];
  const summaryColumns = [
    { header: 'Concepto', key: 'concept', width: 30 },
    { header: 'Valor', key: 'amount', width: 20, numFmt: '$#,##0' }
  ];
  const summaryRows = [
    { concept: 'Ingresos del período', amount: data.totals.revenue },
    { concept: 'Costo de ventas (material, flete y descargue)', amount: data.totals.cogs },
    { concept: 'Cargue de despachos', amount: data.totals.cargue },
    { concept: 'Costos indirectos asignados', amount: data.totals.indirect },
    { concept: 'Costo total', amount: data.totals.totalCost },
    { concept: 'Utilidad del período', amount: data.totals.profit },
    { concept: 'Margen neto sobre ventas', amount: data.totals.margin }
  ];
  return {
    title: `Costeo · ${data.periodLabel}`,
    filename: `costeo-${data.period.type}-${data.period.value}`.replaceAll(':', '-'),
    columns,
    rows: data.rows,
    sheets: [
      { name: 'Resumen', columns: summaryColumns, rows: summaryRows },
      { name: 'Costeo por producto', columns, rows: data.rows },
      { name: 'Costos indirectos', columns: [
        { header: 'Categoría', key: 'category', width: 26 },
        { header: 'Descripción', key: 'description', width: 38 },
        { header: 'Método', key: 'allocation_method', width: 20 },
        { header: 'Fijo', key: 'fixed_label', width: 10 },
        { header: 'Valor', key: 'amount', width: 18, numFmt: '$#,##0' }
      ], rows: data.indirect.map((row) => ({
        ...row,
        fixed_label: row.is_fixed ? 'Sí' : 'No'
      })) }
    ],
    csv: { columns, rows: data.rows }
  };
}

function datasetFromFinancials(month) {
  const data = getFinancialStatements(month);
  const incomeColumns = [
    { header: 'Concepto', key: 'concept', width: 36 },
    { header: 'Valor', key: 'value', width: 22, numFmt: '$#,##0' }
  ];
  const incomeRows = [
    { concept: 'Ingresos operacionales', value: data.incomeStatement.lines.revenue },
    { concept: '  Costo de ventas (inventario)', value: data.incomeStatement.lines.cogs },
    { concept: '  Cargue de despachos', value: data.incomeStatement.lines.loading },
    { concept: 'Utilidad bruta', value: data.incomeStatement.lines.grossProfit },
    ...data.incomeStatement.lines.expenseGroups.map((row) => ({ concept: `  ${row.category}`, value: row.amount })),
    { concept: 'Total gastos operativos', value: data.incomeStatement.lines.operatingExpenses },
    { concept: 'Utilidad neta', value: data.incomeStatement.lines.netProfit }
  ];
  const balanceColumns = [
    { header: 'Concepto', key: 'concept', width: 40 },
    { header: 'Valor', key: 'value', width: 22, numFmt: '$#,##0' }
  ];
  const balanceRows = [
    { concept: 'ACTIVOS', value: data.balanceSheet.assets.total },
    { concept: '  Efectivo en caja', value: data.balanceSheet.assets.cash },
    { concept: '  Bancos', value: data.balanceSheet.assets.banks },
    { concept: '  Cuentas por cobrar', value: data.balanceSheet.assets.accountsReceivable },
    { concept: '  Inventario', value: data.balanceSheet.assets.inventory },
    { concept: 'PASIVOS', value: data.balanceSheet.liabilities.total },
    { concept: '  Cuentas por pagar', value: data.balanceSheet.liabilities.accountsPayable },
    { concept: 'PATRIMONIO', value: data.balanceSheet.equity.total },
    { concept: '  Capital', value: data.balanceSheet.equity.capital },
    { concept: '  Resultados acumulados', value: data.balanceSheet.equity.retained }
  ];
  const cashColumns = [
    { header: 'Concepto', key: 'concept', width: 34 },
    { header: 'Tipo', key: 'type', width: 14 },
    { header: 'Valor', key: 'value', width: 22, numFmt: '$#,##0' }
  ];
  const cashRows = [
    { concept: 'Saldo inicial', type: 'Apertura', value: data.cashFlow.opening },
    ...data.cashFlow.inflows.map((row) => ({ concept: row.category, type: 'Ingreso', value: row.amount })),
    ...data.cashFlow.outflows.map((row) => ({ concept: row.category, type: 'Egreso', value: row.amount })),
    { concept: 'Flujo neto del período', type: 'Neto', value: data.cashFlow.net },
    { concept: 'Saldo final', type: 'Cierre', value: data.cashFlow.closing }
  ];
  return {
    title: `Estados financieros · ${data.monthLabel}`,
    filename: `estados-financieros-${month}`,
    columns: incomeColumns,
    rows: incomeRows,
    sheets: [
      { name: 'Estado de resultados', columns: incomeColumns, rows: incomeRows },
      { name: 'Balance general', columns: balanceColumns, rows: balanceRows },
      { name: 'Flujo de caja', columns: cashColumns, rows: cashRows }
    ],
    csv: { columns: incomeColumns, rows: incomeRows },
    financial: data
  };
}

export function getExportDataset(entity, query = {}) {
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(query.month || '')) ? query.month : monthOf(todayBogota());
  switch (entity) {
    case 'sales': return buildSalesDataset(query);
    case 'purchases': return buildPurchasesDataset(query);
    case 'inventory': return buildInventoryDataset(query);
    case 'cash': return buildCashDataset(query);
    case 'receivables': return buildReceivablesDataset();
    case 'payables': return buildPayablesDataset();
    case 'costing': return datasetFromCosting(query);
    case 'financial': return datasetFromFinancials(month);
    default: throw new ApiError(404, 'Tipo de reporte no válido.');
  }
}

export async function sendExcelExport(res, dataset, extraMeta = []) {
  const company = getConfig().business;
  const buffer = await buildWorkbookBuffer({
    title: dataset.title,
    company,
    sheets: dataset.sheets,
    meta: [
      ['Empresa', company.name],
      ['NIT', company.nit],
      ...extraMeta
    ]
  });
  exportHeader(res, `${dataset.filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buffer);
}

export function sendCsvExport(res, dataset) {
  const buffer = csvFromRows(dataset.csv.columns, dataset.csv.rows);
  exportHeader(res, `${dataset.filename}.csv`, 'text/csv; charset=utf-8');
  res.send(buffer);
}

function pdfMoney(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function pdfSection(doc, title, rows, color = NAVY) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - 140) doc.addPage();
  doc.moveDown(0.7);
  doc.roundedRect(doc.page.margins.left, doc.y, doc.page.width - doc.page.margins.left - doc.page.margins.right, 24, 4)
    .fill(color);
  const y = doc.y + 5;
  doc.fillColor('white').font('Helvetica-Bold').fontSize(11).text(title.toUpperCase(), doc.page.margins.left + 10, y);
  doc.fillColor('black').font('Helvetica').fontSize(9);
  doc.y = y + 24;
  let index = 0;
  for (const row of rows) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 30) {
      doc.addPage();
      doc.fontSize(9);
    }
    const rowY = doc.y;
    if (row.bold) {
      doc.font('Helvetica-Bold');
    } else {
      doc.font('Helvetica');
    }
    doc.fillColor(row.color || '#23303c').text(String(row.label), doc.page.margins.left + 4, rowY, { width: 330 });
    doc.text(String(row.value), doc.page.margins.left + 350, rowY, { width: 160, align: 'right' });
    if (row.bold) {
      doc.moveTo(doc.page.margins.left, doc.y + 2).lineTo(doc.page.width - doc.page.margins.right, doc.y + 2)
        .strokeColor('#d8d3c5').lineWidth(0.5).stroke();
    }
    doc.moveDown(0.25);
    index += 1;
  }
}

export function buildFinancialPdf(month) {
  const data = getFinancialStatements(month);
  const company = getConfig().business;
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Estados financieros ${data.monthLabel}`, Author: company.name } });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.rect(0, 0, doc.page.width, 8).fill(GOLD.replace('FF', '#'));
  doc.fillColor('#111d2b').font('Helvetica-Bold').fontSize(20).text(company.name, 48, 42);
  doc.font('Helvetica').fontSize(9).fillColor('#5d6670').text(`NIT ${company.nit} · ${company.address} · ${company.phone}`, 48, 68);
  doc.moveTo(48, 86).lineTo(doc.page.width - 48, 86).strokeColor('#ded8ca').lineWidth(1).stroke();
  doc.moveDown(2);
  doc.fillColor('#111d2b').font('Helvetica-Bold').fontSize(16).text(`Estados financieros · ${data.monthLabel}`);
  doc.font('Helvetica').fontSize(9).fillColor('#5d6670').text(`Corte al ${data.asOf} · Expresado en pesos colombianos (COP) · Generado en zona horaria Colombia (UTC−5)`);
  doc.moveDown(1.2);

  pdfSection(doc, 'Estado de resultados', [
    { label: 'Ingresos operacionales', value: pdfMoney(data.incomeStatement.lines.revenue) },
    { label: 'Costo de ventas (inventario)', value: pdfMoney(-data.incomeStatement.lines.cogs) },
    { label: 'Cargue de despachos', value: pdfMoney(-data.incomeStatement.lines.loading) },
    { label: 'Utilidad bruta', value: pdfMoney(data.incomeStatement.lines.grossProfit), bold: true },
    ...data.incomeStatement.lines.expenseGroups.map((row) => ({ label: row.category, value: pdfMoney(-row.amount) })),
    { label: 'Total gastos operativos', value: pdfMoney(-data.incomeStatement.lines.operatingExpenses), bold: true },
    { label: 'Utilidad neta', value: pdfMoney(data.incomeStatement.lines.netProfit), bold: true, color: data.incomeStatement.lines.netProfit >= 0 ? '#1f6f8b' : '#b23a3a' },
    { label: 'Margen bruto / neto', value: `${data.incomeStatement.margins.gross.toFixed(1)}% / ${data.incomeStatement.margins.net.toFixed(1)}%` }
  ]);

  doc.addPage();
  doc.fillColor('#111d2b').font('Helvetica-Bold').fontSize(15).text('Balance general');
  doc.font('Helvetica').fontSize(9).fillColor('#5d6670').text(`Corte al ${data.asOf}`);
  doc.moveDown(0.8);
  pdfSection(doc, 'Activos', [
    { label: 'Efectivo en caja', value: pdfMoney(data.balanceSheet.assets.cash) },
    { label: 'Bancos', value: pdfMoney(data.balanceSheet.assets.banks) },
    { label: 'Cuentas por cobrar', value: pdfMoney(data.balanceSheet.assets.accountsReceivable) },
    { label: 'Inventario de producto', value: pdfMoney(data.balanceSheet.assets.inventory) },
    { label: 'Total activos', value: pdfMoney(data.balanceSheet.assets.total), bold: true }
  ]);
  pdfSection(doc, 'Pasivos y patrimonio', [
    { label: 'Cuentas por pagar', value: pdfMoney(data.balanceSheet.liabilities.accountsPayable) },
    { label: 'Total pasivos', value: pdfMoney(data.balanceSheet.liabilities.total), bold: true },
    { label: 'Capital', value: pdfMoney(data.balanceSheet.equity.capital) },
    { label: 'Resultados acumulados', value: pdfMoney(data.balanceSheet.equity.retained) },
    { label: 'Total patrimonio', value: pdfMoney(data.balanceSheet.equity.total), bold: true },
    { label: 'Total pasivo + patrimonio', value: pdfMoney(data.balanceSheet.liabilities.total + data.balanceSheet.equity.total), bold: true }
  ]);

  pdfSection(doc, 'Flujo de caja', [
    { label: 'Saldo inicial', value: pdfMoney(data.cashFlow.opening) },
    ...data.cashFlow.inflows.map((row) => ({ label: `Ingreso · ${row.category}`, value: pdfMoney(row.amount) })),
    ...data.cashFlow.outflows.map((row) => ({ label: `Egreso · ${row.category}`, value: pdfMoney(-row.amount) })),
    { label: 'Flujo neto del período', value: pdfMoney(data.cashFlow.net), bold: true },
    { label: 'Saldo final', value: pdfMoney(data.cashFlow.closing), bold: true }
  ]);

  doc.moveDown(1);
  doc.font('Helvetica').fontSize(8).fillColor('#7a7468').text(
    'Documento de gestión generado automáticamente. Las cifras corresponden a los registros operativos de CementoControl. El balance incluye una cuenta de resultados acumulados que concilia activos, pasivos y patrimonio.',
    { align: 'left' }
  );
  doc.end();
  return done;
}

export function sendFinancialPdf(res, month) {
  exportHeader(res, `estados-financieros-${month}.pdf`, 'application/pdf');
  const pdf = buildFinancialPdf(month);
  pdf.then((buffer) => res.send(buffer)).catch((error) => {
    console.error(error);
    if (!res.headersSent) res.status(500).json({ error: 'No se pudo generar el PDF.' });
  });
}

export function buildFinancialWorkbook(month) {
  const dataset = datasetFromFinancials(month);
  return buildWorkbookBuffer({
    title: dataset.title,
    company: getConfig().business,
    sheets: dataset.sheets,
    meta: [['Período', monthLabel(month)], ['Corte', getFinancialStatements(month).asOf]]
  });
}

export function monthName(month) {
  return monthLabel(month);
}
