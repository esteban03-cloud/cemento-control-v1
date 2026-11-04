import ExcelJS from 'exceljs';
import { db, logActivity } from '../db.js';
import { ApiError } from '../lib/http.js';
import { addDays, isValidDate, todayBogota } from '../lib/dates.js';
import { money, toNumber } from '../lib/money.js';
import { createPurchase, createSale } from './operations.js';

const TEMPLATES = {
  customers: {
    label: 'Clientes',
    headers: ['nombre', 'nit', 'telefono', 'direccion'],
    example: ['Ferretería Nueva Esperanza', '901.000.111-2', '+57 300 111 2233', 'Calle 10 # 20-30, Bogotá'],
    aliases: {
      nombre: 'name', name: 'name', razon_social: 'name',
      nit: 'nit', documento: 'nit',
      telefono: 'phone', phone: 'phone', celular: 'phone',
      direccion: 'address', address: 'address'
    }
  },
  suppliers: {
    label: 'Proveedores',
    headers: ['nombre', 'nit', 'telefono', 'direccion'],
    example: ['Cementos del Norte', '900.222.333-4', '+57 601 555 0000', 'Zona Industrial, Bogotá'],
    aliases: {
      nombre: 'name', name: 'name', razon_social: 'name',
      nit: 'nit', documento: 'nit',
      telefono: 'phone', phone: 'phone', celular: 'phone',
      direccion: 'address', address: 'address'
    }
  },
  products: {
    label: 'Productos',
    headers: ['codigo', 'nombre', 'unidad', 'precio_venta', 'stock_minimo', 'costo_pedido', 'tasa_mantenimiento'],
    example: ['CEM-099', 'Cemento de prueba 50 kg', 'Bulto', 30000, 100, 120000, 0.18],
    aliases: {
      codigo: 'code', code: 'code', sku: 'code',
      nombre: 'name', name: 'name', producto: 'name',
      unidad: 'unit', unit: 'unit',
      precio_venta: 'sale_price', precio: 'sale_price', sale_price: 'sale_price',
      stock_minimo: 'min_stock', minimo: 'min_stock', min_stock: 'min_stock',
      costo_pedido: 'ordering_cost', ordering_cost: 'ordering_cost',
      tasa_mantenimiento: 'holding_rate', holding_rate: 'holding_rate'
    }
  },
  purchases: {
    label: 'Compras',
    headers: [
      'documento', 'fecha_llegada', 'fecha_pago', 'proveedor', 'codigo_producto', 'cantidad',
      'costo_unitario', 'tipo_compra', 'abono_inicial', 'medio_pago', 'vencimiento_credito',
      'flete_pagado_por', 'conductor', 'valor_flete', 'tipo_flete', 'anticipo_flete',
      'valor_descargue', 'tipo_descargue', 'anticipo_descargue', 'proveedor_flete',
      'proveedor_descargue', 'notas'
    ],
    example: [
      '', '2026-10-15', '2026-10-15', 'Cementos Argos', 'CEM-001', 500,
      22500, 'credito', 1000000, 'bancos', '2026-11-14',
      'yo', 'Jhon Ramírez', 500000, 'contado', 0,
      180000, 'contado', 0, 'Transportes El Volcán', 'Servicios de Descargue Rápidos', 'Compra de ejemplo'
    ],
    aliases: {
      documento: 'doc_number', doc_number: 'doc_number', factura: 'doc_number',
      fecha_llegada: 'arrival_date', arrival_date: 'arrival_date', fecha_entrega: 'arrival_date',
      fecha_pago: 'payment_date', payment_date: 'payment_date',
      proveedor: 'supplier_name', supplier_name: 'supplier_name',
      codigo_producto: 'product_code', codigo: 'product_code', product_code: 'product_code',
      cantidad: 'quantity', quantity: 'quantity',
      costo_unitario: 'unit_cost', unit_cost: 'unit_cost',
      tipo_compra: 'purchase_type', condicion_pago: 'purchase_type',
      abono_inicial: 'initial_payment', initial_payment: 'initial_payment',
      medio_pago: 'payment_method', payment_method: 'payment_method',
      vencimiento_credito: 'credit_due_date', credit_due_date: 'credit_due_date',
      flete_pagado_por: 'freight_payer', freight_payer: 'freight_payer',
      conductor: 'driver_name', driver_name: 'driver_name',
      valor_flete: 'freight_value', freight_value: 'freight_value',
      tipo_flete: 'freight_type', freight_type: 'freight_type',
      anticipo_flete: 'freight_advance', freight_advance: 'freight_advance',
      valor_descargue: 'unloading_value', unloading_value: 'unloading_value',
      tipo_descargue: 'unloading_type', unloading_type: 'unloading_type',
      anticipo_descargue: 'unloading_advance', unloading_advance: 'unloading_advance',
      proveedor_flete: 'freight_provider', freight_provider: 'freight_provider',
      proveedor_descargue: 'unloading_provider', unloading_provider: 'unloading_provider',
      notas: 'notes', notes: 'notes'
    }
  },
  sales: {
    label: 'Ventas',
    headers: [
      'factura', 'fecha_entrega', 'cliente', 'condicion_pago', 'vencimiento', 'medio_pago',
      'fecha_dinero', 'producto', 'cantidad', 'precio_unitario', 'cotero', 'valor_cargue',
      'tipo_cargue', 'notas'
    ],
    example: [
      '', '2026-10-20', 'Ferretería El Constructor', 'credito', '2026-11-19', 'bancos',
      '2026-10-20', 'CEM-001', 120, 31500, 'Jhon Ramírez', 90000,
      'contado', 'Venta de ejemplo'
    ],
    aliases: {
      factura: 'invoice_number', invoice_number: 'invoice_number',
      fecha_entrega: 'delivery_date', delivery_date: 'delivery_date',
      cliente: 'customer_name', customer_name: 'customer_name',
      condicion_pago: 'payment_condition', payment_condition: 'payment_condition',
      vencimiento: 'due_date', due_date: 'due_date',
      medio_pago: 'payment_method', payment_method: 'payment_method',
      fecha_dinero: 'money_entry_date', money_entry_date: 'money_entry_date',
      producto: 'product_code', codigo_producto: 'product_code', product_code: 'product_code',
      cantidad: 'quantity', quantity: 'quantity',
      precio_unitario: 'unit_price', unit_price: 'unit_price',
      cotero: 'courier_name', courier_name: 'courier_name',
      valor_cargue: 'loading_value', loading_value: 'loading_value',
      tipo_cargue: 'loading_type', loading_type: 'loading_type',
      notas: 'notes', notes: 'notes'
    }
  }
};

export const IMPORT_ENTITIES = Object.keys(TEMPLATES);

export function getTemplate(entity) {
  const template = TEMPLATES[entity];
  if (!template) throw new ApiError(404, 'Entidad de importación no válida.');
  return template;
}

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function cleanValue(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if ('text' in value) return value.text;
    if ('result' in value) return value.result;
    if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
    if ('hyperlink' in value) return value.hyperlink;
  }
  return value;
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 20000 && value < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    return date.toISOString().slice(0, 10);
  }
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && isValidDate(raw)) return raw;
  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const date = `${match[3]}-${month}-${day}`;
    return isValidDate(date) ? date : '';
  }
  return '';
}

export function parseCsv(buffer) {
  let text = Buffer.from(buffer).toString('utf8').replace(/^\uFEFF/, '');
  if (!text.trim()) return [];
  const firstLine = text.split(/\r?\n/)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(value.trim());
      value = '';
    } else if (char === '\n') {
      row.push(value.trim());
      rows.push(row);
      row = [];
      value = '';
    } else if (char === '\r') {
      // Ignored; line feed closes the row.
    } else {
      value += char;
    }
  }
  if (value !== '' || row.length) {
    row.push(value.trim());
    rows.push(row);
  }
  const nonEmpty = rows.filter((entry) => entry.some((cell) => String(cell).trim() !== ''));
  if (nonEmpty.length < 2) return [];
  const headers = nonEmpty[0].map((header) => normalizeHeader(header));
  return nonEmpty.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

async function parseExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets.find((entry) => entry.rowCount > 1) || workbook.worksheets[0];
  if (!sheet) return [];
  const headerRow = sheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = normalizeHeader(cleanValue(cell.value));
  });
  const rows = [];
  for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    const values = {};
    let hasValue = false;
    headers.forEach((header, colNumber) => {
      if (!header) return;
      const value = cleanValue(row.getCell(colNumber).value);
      if (value !== '' && value !== null && value !== undefined) hasValue = true;
      values[header] = value;
    });
    if (hasValue) rows.push(values);
  }
  return rows;
}

export async function parseImportFile(buffer, filename) {
  const extension = String(filename || '').toLowerCase().split('.').pop();
  if (extension === 'csv') return parseCsv(buffer);
  if (extension === 'xlsx' || extension === 'xlsm') return parseExcel(buffer);
  throw new ApiError(422, 'Formato no soportado. Usa un archivo .csv o .xlsx.');
}

function canonicalRows(entity, rawRows) {
  const template = getTemplate(entity);
  return rawRows.map((row, index) => {
    const output = {};
    for (const [key, value] of Object.entries(row)) {
      const canonical = template.aliases[key] || key;
      output[canonical] = value;
    }
    return { rowNumber: index + 2, data: output, raw: row };
  });
}

function dateValue(value, label, errors, required = false) {
  if (value === '' || value === undefined || value === null) {
    if (required) errors.push(`${label} es obligatorio.`);
    return '';
  }
  const parsed = parseDate(value);
  if (!parsed) errors.push(`${label} no tiene una fecha válida (usa AAAA-MM-DD o DD/MM/AAAA).`);
  return parsed;
}

function numberValue(value, label, errors, { required = false, min = 0 } = {}) {
  if (value === '' || value === undefined || value === null) {
    if (required) errors.push(`${label} es obligatorio.`);
    return 0;
  }
  const parsed = toNumber(value, NaN);
  if (!Number.isFinite(parsed)) {
    errors.push(`${label} debe ser numérico.`);
    return 0;
  }
  if (parsed < min) errors.push(`${label} no puede ser menor que ${min}.`);
  return parsed;
}

function validateCustomers(rows) {
  return rows.map((entry) => {
    const errors = [];
    const name = String(entry.data.name || '').trim();
    if (!name) errors.push('nombre es obligatorio.');
    const existing = name
      ? db.prepare('SELECT id FROM customers WHERE name = ? COLLATE NOCASE').get(name)
      : null;
    return {
      rowNumber: entry.rowNumber,
      errors,
      normalized: {
        name,
        nit: String(entry.data.nit || '').trim(),
        phone: String(entry.data.phone || '').trim(),
        address: String(entry.data.address || '').trim()
      },
      action: existing ? 'actualizar' : 'crear'
    };
  });
}

function validateSuppliers(rows) {
  return rows.map((entry) => {
    const errors = [];
    const name = String(entry.data.name || '').trim();
    if (!name) errors.push('nombre es obligatorio.');
    const existing = name
      ? db.prepare('SELECT id FROM suppliers WHERE name = ? COLLATE NOCASE').get(name)
      : null;
    return {
      rowNumber: entry.rowNumber,
      errors,
      normalized: {
        name,
        nit: String(entry.data.nit || '').trim(),
        phone: String(entry.data.phone || '').trim(),
        address: String(entry.data.address || '').trim()
      },
      action: existing ? 'actualizar' : 'crear'
    };
  });
}

function validateProducts(rows) {
  return rows.map((entry) => {
    const errors = [];
    const code = String(entry.data.code || '').trim().toUpperCase();
    const name = String(entry.data.name || '').trim();
    if (!code) errors.push('codigo es obligatorio.');
    if (!name) errors.push('nombre es obligatorio.');
    const salePrice = numberValue(entry.data.sale_price, 'precio_venta', errors, { required: true, min: 1 });
    const minStock = numberValue(entry.data.min_stock, 'stock_minimo', errors, { min: 0 });
    const orderingCost = numberValue(entry.data.ordering_cost, 'costo_pedido', errors, { min: 0 });
    const holdingRate = numberValue(entry.data.holding_rate, 'tasa_mantenimiento', errors, { min: 0 });
    if (holdingRate > 1) errors.push('tasa_mantenimiento debe estar entre 0 y 1 (por ejemplo, 0.18 para 18%).');
    const existing = code
      ? db.prepare('SELECT id FROM products WHERE code = ? COLLATE NOCASE').get(code)
      : null;
    return {
      rowNumber: entry.rowNumber,
      errors,
      normalized: {
        code,
        name,
        unit: String(entry.data.unit || 'Bulto').trim() || 'Bulto',
        sale_price: money(salePrice),
        min_stock: minStock,
        ordering_cost: orderingCost || 120000,
        holding_rate: holdingRate || 0.18
      },
      action: existing ? 'actualizar' : 'crear'
    };
  });
}

function validatePurchases(rows) {
  return rows.map((entry) => {
    const errors = [];
    const supplierName = String(entry.data.supplier_name || '').trim();
    const productCode = String(entry.data.product_code || '').trim().toUpperCase();
    const supplier = supplierName
      ? db.prepare('SELECT * FROM suppliers WHERE name = ? COLLATE NOCASE').get(supplierName)
      : null;
    const product = productCode
      ? db.prepare('SELECT * FROM products WHERE code = ? COLLATE NOCASE').get(productCode)
      : null;
    if (!supplier) errors.push(`El proveedor "${supplierName || ''}" no existe. Impórtalo o créalo primero.`);
    if (!product) errors.push(`El producto "${productCode || ''}" no existe. Impórtalo o créalo primero.`);
    const arrivalDate = dateValue(entry.data.arrival_date, 'fecha_llegada', errors, true);
    const paymentDate = dateValue(entry.data.payment_date, 'fecha_pago', errors) || arrivalDate;
    const creditDue = dateValue(entry.data.credit_due_date, 'vencimiento_credito', errors);
    const quantity = numberValue(entry.data.quantity, 'cantidad', errors, { required: true, min: 0.001 });
    const unitCost = numberValue(entry.data.unit_cost, 'costo_unitario', errors, { required: true, min: 0 });
    const initialPayment = numberValue(entry.data.initial_payment, 'abono_inicial', errors, { min: 0 });
    const freightValue = numberValue(entry.data.freight_value, 'valor_flete', errors, { min: 0 });
    const freightAdvance = numberValue(entry.data.freight_advance, 'anticipo_flete', errors, { min: 0 });
    const unloadingValue = numberValue(entry.data.unloading_value, 'valor_descargue', errors, { min: 0 });
    const unloadingAdvance = numberValue(entry.data.unloading_advance, 'anticipo_descargue', errors, { min: 0 });
    const purchaseType = ['contado', 'credito'].includes(String(entry.data.purchase_type).toLowerCase())
      ? String(entry.data.purchase_type).toLowerCase()
      : 'contado';
    const paymentMethod = ['efectivo', 'bancos'].includes(String(entry.data.payment_method).toLowerCase())
      ? String(entry.data.payment_method).toLowerCase()
      : 'efectivo';
    const freightPayer = ['yo', 'proveedor'].includes(String(entry.data.freight_payer).toLowerCase())
      ? String(entry.data.freight_payer).toLowerCase()
      : 'yo';
    const freightType = String(entry.data.freight_type).toLowerCase() === 'credito' ? 'credito' : 'contado';
    const unloadingType = String(entry.data.unloading_type).toLowerCase() === 'credito' ? 'credito' : 'contado';
    if (purchaseType === 'credito' && initialPayment > quantity * unitCost + 1) {
      errors.push('El abono inicial no puede superar el costo del producto.');
    }
    return {
      rowNumber: entry.rowNumber,
      errors,
      normalized: {
        doc_number: String(entry.data.doc_number || '').trim(),
        arrival_date: arrivalDate,
        payment_date: paymentDate,
        supplier_id: supplier?.id,
        product_id: product?.id,
        quantity,
        unit_cost: money(unitCost),
        purchase_type: purchaseType,
        initial_payment: money(initialPayment),
        credit_due_date: creditDue,
        payment_method: paymentMethod,
        freight_payer: freightPayer,
        driver_name: String(entry.data.driver_name || '').trim(),
        freight_value: money(freightValue),
        freight_type: freightType,
        freight_advance: money(freightAdvance),
        freight_provider: String(entry.data.freight_provider || '').trim(),
        unloading_value: money(unloadingValue),
        unloading_type: unloadingType,
        unloading_advance: money(unloadingAdvance),
        unloading_provider: String(entry.data.unloading_provider || '').trim(),
        notes: String(entry.data.notes || '').trim()
      },
      action: 'crear'
    };
  });
}

function validateSales(rows) {
  const remainingStock = new Map();
  return rows.map((entry) => {
    const errors = [];
    const customerName = String(entry.data.customer_name || '').trim();
    const productCode = String(entry.data.product_code || '').trim().toUpperCase();
    const customer = customerName
      ? db.prepare('SELECT * FROM customers WHERE name = ? COLLATE NOCASE').get(customerName)
      : null;
    const product = productCode
      ? db.prepare('SELECT * FROM products WHERE code = ? COLLATE NOCASE').get(productCode)
      : null;
    if (!customer) errors.push(`El cliente "${customerName || ''}" no existe. Impórtalo primero.`);
    if (!product) errors.push(`El producto "${productCode || ''}" no existe. Impórtalo primero.`);
    const deliveryDate = dateValue(entry.data.delivery_date, 'fecha_entrega', errors, true);
    const moneyEntryDate = dateValue(entry.data.money_entry_date, 'fecha_dinero', errors) || deliveryDate;
    const condition = String(entry.data.payment_condition || '').trim().toLowerCase() === 'credito' ? 'credito' : 'contado';
    const rawDue = dateValue(entry.data.due_date, 'vencimiento', errors);
    const dueDate = rawDue || (condition === 'credito' ? (deliveryDate ? addDays(deliveryDate, 30) : '') : '');
    if (condition === 'credito' && !dueDate) errors.push('vencimiento es obligatorio para ventas a crédito.');
    const quantity = numberValue(entry.data.quantity, 'cantidad', errors, { required: true, min: 0.001 });
    const unitPrice = numberValue(entry.data.unit_price, 'precio_unitario', errors, { required: true, min: 0 });
    const loadingValue = numberValue(entry.data.loading_value, 'valor_cargue', errors, { min: 0 });
    const paymentMethod = ['efectivo', 'bancos'].includes(String(entry.data.payment_method).toLowerCase())
      ? String(entry.data.payment_method).toLowerCase()
      : 'efectivo';
    const loadingType = String(entry.data.loading_type).toLowerCase() === 'credito' ? 'credito' : 'contado';
    if (product) {
      const available = remainingStock.has(product.id) ? remainingStock.get(product.id) : Number(product.stock);
      if (quantity > available + 0.0001) {
        errors.push(`Inventario insuficiente de ${product.code}: disponible ${available}, solicitado ${quantity} (incluye filas anteriores del archivo).`);
      } else {
        remainingStock.set(product.id, available - quantity);
      }
    }
    return {
      rowNumber: entry.rowNumber,
      errors,
      normalized: {
        invoice_number: String(entry.data.invoice_number || '').trim(),
        delivery_date: deliveryDate,
        customer_id: customer?.id,
        payment_condition: condition,
        due_date: dueDate,
        money_entry_date: moneyEntryDate,
        payment_method: paymentMethod,
        product_id: product?.id,
        quantity,
        unit_price: money(unitPrice),
        courier_name: String(entry.data.courier_name || '').trim(),
        loading_value: money(loadingValue),
        loading_type: loadingType,
        notes: String(entry.data.notes || '').trim()
      },
      action: 'crear'
    };
  });
}

const VALIDATORS = {
  customers: validateCustomers,
  suppliers: validateSuppliers,
  products: validateProducts,
  purchases: validatePurchases,
  sales: validateSales
};

export async function validateImport(entity, buffer, filename) {
  if (!TEMPLATES[entity]) throw new ApiError(404, 'Entidad de importación no válida.');
  const rawRows = await parseImportFile(buffer, filename);
  if (!rawRows.length) throw new ApiError(422, 'El archivo no contiene filas de datos. Verifica los encabezados y vuelve a intentarlo.');
  const rows = canonicalRows(entity, rawRows);
  const validated = VALIDATORS[entity](rows);
  const errors = validated.flatMap((entry) => entry.errors.map((message) => ({
    row: entry.rowNumber,
    message
  })));
  const counts = validated.reduce((acc, row) => {
    if (row.errors.length) acc.invalid += 1;
    else acc.valid += 1;
    acc.actions[row.action] = (acc.actions[row.action] || 0) + 1;
    return acc;
  }, { valid: 0, invalid: 0, actions: {} });
  return {
    entity,
    rows: validated,
    errors,
    counts,
    preview: validated.slice(0, 8).map((row) => ({
      row: row.rowNumber,
      action: row.action,
      valid: row.errors.length === 0,
      errors: row.errors,
      data: row.normalized
    }))
  };
}

function applyReferenceRows(entity, rows) {
  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;
  for (const entry of rows) {
    if (entry.errors.length) continue;
    const data = entry.normalized;
    if (entity === 'customers') {
      const existing = db.prepare('SELECT id FROM customers WHERE name = ? COLLATE NOCASE').get(data.name);
      if (existing) {
        db.prepare('UPDATE customers SET nit = ?, phone = ?, address = ? WHERE id = ?')
          .run(data.nit, data.phone, data.address, existing.id);
        updated += 1;
      } else {
        db.prepare('INSERT INTO customers (name, nit, phone, address, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(data.name, data.nit, data.phone, data.address, now);
        created += 1;
      }
    } else if (entity === 'suppliers') {
      const existing = db.prepare('SELECT id FROM suppliers WHERE name = ? COLLATE NOCASE').get(data.name);
      if (existing) {
        db.prepare('UPDATE suppliers SET nit = ?, phone = ?, address = ? WHERE id = ?')
          .run(data.nit, data.phone, data.address, existing.id);
        updated += 1;
      } else {
        db.prepare('INSERT INTO suppliers (name, nit, phone, address, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(data.name, data.nit, data.phone, data.address, now);
        created += 1;
      }
    } else if (entity === 'products') {
      const existing = db.prepare('SELECT id FROM products WHERE code = ? COLLATE NOCASE').get(data.code);
      if (existing) {
        db.prepare(`
          UPDATE products SET name = ?, unit = ?, sale_price = ?, min_stock = ?, ordering_cost = ?, holding_rate = ?
          WHERE id = ?
        `).run(data.name, data.unit, data.sale_price, data.min_stock, data.ordering_cost, data.holding_rate, existing.id);
        updated += 1;
      } else {
        db.prepare(`
          INSERT INTO products (code, name, unit, stock, avg_cost, sale_price, min_stock, ordering_cost, holding_rate, active, created_at)
          VALUES (?, ?, ?, 0, 0, ?, ?, ?, ?, 1, ?)
        `).run(data.code, data.name, data.unit, data.sale_price, data.min_stock, data.ordering_cost, data.holding_rate, now);
        created += 1;
      }
    }
  }
  return { created, updated };
}

export async function runImport(entity, buffer, filename, user) {
  const validation = await validateImport(entity, buffer, filename);
  if (validation.errors.length) {
    throw new ApiError(422, 'La validación encontró errores. Corrige el archivo y vuelve a intentarlo.', {
      errors: validation.errors,
      counts: validation.counts
    });
  }
  let result;
  if (['customers', 'suppliers', 'products'].includes(entity)) {
    result = applyReferenceRows(entity, validation.rows);
  } else {
    let imported = 0;
    const errors = [];
    for (const entry of validation.rows) {
      if (entry.errors.length) continue;
      try {
        if (entity === 'purchases') {
          createPurchase(entry.normalized, user);
        } else if (entity === 'sales') {
          createSale(entry.normalized, user);
        }
        imported += 1;
      } catch (error) {
        errors.push({ row: entry.rowNumber, message: error.message });
        break;
      }
    }
    if (errors.length) {
      throw new ApiError(422, `Se importaron ${imported} filas antes de encontrar un error. Revisa la fila ${errors[0].row}.`, {
        imported,
        errors
      });
    }
    result = { created: imported, updated: 0 };
  }
  logActivity(user, 'importar', entity, null, `${validation.rows.length} filas procesadas`);
  return {
    imported: validation.rows.length,
    ...result,
    entity
  };
}

export async function createTemplateBuffer(entity, format) {
  const template = getTemplate(entity);
  const example = Object.fromEntries(template.headers.map((header, index) => [header, template.example[index] ?? '']));
  if (format === 'csv') {
    const escape = (value) => {
      const text = String(value ?? '');
      return /[;\n"]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    const lines = [
      template.headers.join(';'),
      template.headers.map((header) => escape(example[header])).join(';')
    ];
    return {
      buffer: Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8'),
      filename: `plantilla-${entity}.csv`,
      contentType: 'text/csv; charset=utf-8'
    };
  }
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CementoControl';
  const sheet = workbook.addWorksheet(template.label);
  sheet.columns = template.headers.map((header) => ({
    header,
    key: header,
    width: Math.max(16, Math.min(32, header.length + 8))
  }));
  sheet.addRow(example);
  sheet.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111D2B' } };
    cell.alignment = { vertical: 'middle' };
  });
  sheet.getRow(1).height = 24;
  sheet.autoFilter = { from: 'A1', to: sheet.getRow(1).lastCell.address };
  const instructions = workbook.addWorksheet('Instrucciones');
  instructions.columns = [{ width: 28 }, { width: 80 }];
  instructions.addRow(['CementoControl · Importación de ' + template.label.toLowerCase()]);
  instructions.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF111D2B' } };
  instructions.addRow([]);
  instructions.addRow(['Campo', 'Indicaciones']);
  instructions.getRow(3).font = { bold: true };
  for (const header of template.headers) {
    instructions.addRow([header, 'Obligatorio según las reglas del sistema. Usa el formato mostrado en la plantilla.']);
  }
  instructions.addRow([]);
  instructions.addRow(['Fechas', 'Usa AAAA-MM-DD o DD/MM/AAAA.']);
  instructions.addRow(['Moneda', 'Valores numéricos en pesos colombianos, sin símbolos.']);
  instructions.addRow(['Importante', 'Primero importa clientes, proveedores y productos. Luego compras y ventas.']);
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(buffer),
    filename: `plantilla-${entity}.xlsx`,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  };
}
