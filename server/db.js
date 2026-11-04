import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configuredFile = process.env.DB_FILE || path.join(projectRoot, 'data', 'cemento.db');
const dbFile = configuredFile === ':memory:' ? configuredFile : path.resolve(configuredFile);

if (dbFile !== ':memory:') {
  mkdirSync(path.dirname(dbFile), { recursive: true });
}

export const db = new DatabaseSync(dbFile);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('administrador', 'vendedor', 'contador')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    nit TEXT,
    phone TEXT,
    address TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    nit TEXT,
    phone TEXT,
    address TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS couriers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    phone TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL COLLATE NOCASE UNIQUE,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'Bulto',
    stock REAL NOT NULL DEFAULT 0,
    avg_cost REAL NOT NULL DEFAULT 0,
    sale_price REAL NOT NULL DEFAULT 0,
    min_stock REAL NOT NULL DEFAULT 0,
    ordering_cost REAL NOT NULL DEFAULT 120000,
    holding_rate REAL NOT NULL DEFAULT 0.18,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_number TEXT NOT NULL COLLATE NOCASE UNIQUE,
    arrival_date TEXT NOT NULL,
    payment_date TEXT NOT NULL,
    supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity REAL NOT NULL,
    unit_cost REAL NOT NULL,
    purchase_type TEXT NOT NULL CHECK (purchase_type IN ('contado', 'credito')),
    initial_payment REAL NOT NULL DEFAULT 0,
    credit_due_date TEXT,
    payment_method TEXT NOT NULL DEFAULT 'efectivo',
    freight_payer TEXT NOT NULL DEFAULT 'yo',
    driver_name TEXT,
    freight_value REAL NOT NULL DEFAULT 0,
    freight_type TEXT NOT NULL DEFAULT 'contado',
    freight_advance REAL NOT NULL DEFAULT 0,
    freight_provider TEXT,
    unloading_value REAL NOT NULL DEFAULT 0,
    unloading_type TEXT NOT NULL DEFAULT 'contado',
    unloading_advance REAL NOT NULL DEFAULT 0,
    unloading_provider TEXT,
    notes TEXT,
    total_cost REAL NOT NULL,
    total_paid_at_creation REAL NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT NOT NULL COLLATE NOCASE UNIQUE,
    delivery_date TEXT NOT NULL,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    payment_condition TEXT NOT NULL CHECK (payment_condition IN ('contado', 'credito')),
    due_date TEXT,
    money_entry_date TEXT,
    payment_method TEXT NOT NULL DEFAULT 'efectivo',
    four_per_mille REAL NOT NULL DEFAULT 0,
    courier_id INTEGER REFERENCES couriers(id),
    loading_value REAL NOT NULL DEFAULT 0,
    loading_type TEXT NOT NULL DEFAULT 'contado',
    loading_provider TEXT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    subtotal REAL NOT NULL,
    total REAL NOT NULL,
    cost_of_goods REAL NOT NULL DEFAULT 0,
    loading_cost REAL NOT NULL DEFAULT 0,
    paid_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pendiente',
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS accounts_receivable (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER NOT NULL UNIQUE REFERENCES sales(id),
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    amount REAL NOT NULL,
    paid REAL NOT NULL DEFAULT 0,
    due_date TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS receivable_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    receivable_id INTEGER NOT NULL REFERENCES accounts_receivable(id),
    amount REAL NOT NULL,
    payment_date TEXT NOT NULL,
    method TEXT NOT NULL,
    fee REAL NOT NULL DEFAULT 0,
    notes TEXT,
    cash_movement_id INTEGER,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS accounts_payable (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER REFERENCES purchases(id),
    sale_id INTEGER REFERENCES sales(id),
    supplier_id INTEGER REFERENCES suppliers(id),
    provider_name TEXT NOT NULL,
    concept TEXT NOT NULL,
    description TEXT,
    amount REAL NOT NULL,
    paid REAL NOT NULL DEFAULT 0,
    due_date TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payable_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payable_id INTEGER NOT NULL REFERENCES accounts_payable(id),
    amount REAL NOT NULL,
    payment_date TEXT NOT NULL,
    method TEXT NOT NULL,
    notes TEXT,
    cash_movement_id INTEGER,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cash_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movement_date TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('ingreso', 'egreso')),
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    method TEXT NOT NULL CHECK (method IN ('efectivo', 'bancos')),
    description TEXT,
    reference_type TEXT,
    reference_id INTEGER,
    auto INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    movement_date TEXT NOT NULL,
    type TEXT NOT NULL,
    reference_type TEXT,
    reference_id INTEGER,
    quantity REAL NOT NULL,
    unit_cost REAL NOT NULL DEFAULT 0,
    note TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS inventory_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    adjustment_date TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('entrada', 'salida')),
    quantity REAL NOT NULL,
    unit_cost REAL NOT NULL DEFAULT 0,
    reason TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS indirect_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    period TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    amount REAL NOT NULL,
    allocation_method TEXT NOT NULL DEFAULT 'volumen',
    is_fixed INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    user_name TEXT,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    details TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    borrower_name TEXT NOT NULL,
    borrower_phone TEXT,
    amount REAL NOT NULL,
    loan_date TEXT NOT NULL,
    due_date TEXT,
    description TEXT,
    payment_method TEXT NOT NULL DEFAULT 'efectivo',
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS loan_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_id INTEGER NOT NULL REFERENCES loans(id),
    amount REAL NOT NULL,
    payment_date TEXT NOT NULL,
    method TEXT NOT NULL,
    fee REAL NOT NULL DEFAULT 0,
    notes TEXT,
    cash_movement_id INTEGER,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_number TEXT NOT NULL COLLATE NOCASE UNIQUE,
    quote_date TEXT NOT NULL,
    valid_until TEXT,
    customer_id INTEGER REFERENCES customers(id),
    customer_name TEXT NOT NULL,
    customer_nit TEXT,
    customer_phone TEXT,
    customer_address TEXT,
    status TEXT NOT NULL DEFAULT 'borrador',
    subtotal REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    notes TEXT,
    terms TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quote_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id INTEGER NOT NULL REFERENCES quotes(id),
    product_id INTEGER REFERENCES products(id),
    description TEXT NOT NULL,
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    line_total REAL NOT NULL,
    position INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS debts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creditor_name TEXT NOT NULL,
    creditor_type TEXT NOT NULL CHECK (creditor_type IN ('banco', 'persona')),
    description TEXT,
    principal REAL NOT NULL,
    monthly_interest_rate REAL NOT NULL DEFAULT 0,
    start_date TEXT NOT NULL,
    first_payment_date TEXT NOT NULL,
    term_months INTEGER NOT NULL,
    installment_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'activa',
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS debt_installments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    debt_id INTEGER NOT NULL REFERENCES debts(id),
    installment_number INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'cuota',
    due_date TEXT NOT NULL,
    principal_amount REAL NOT NULL DEFAULT 0,
    interest_amount REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    paid_amount REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pendiente',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS debt_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    debt_id INTEGER NOT NULL REFERENCES debts(id),
    installment_id INTEGER REFERENCES debt_installments(id),
    amount REAL NOT NULL,
    principal_paid REAL NOT NULL DEFAULT 0,
    interest_paid REAL NOT NULL DEFAULT 0,
    payment_date TEXT NOT NULL,
    method TEXT NOT NULL,
    cash_movement_id INTEGER,
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_loans_date ON loans(loan_date);
  CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON loan_payments(loan_id, payment_date);
  CREATE INDEX IF NOT EXISTS idx_quotes_date ON quotes(quote_date);
  CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quote_items(quote_id);
  CREATE INDEX IF NOT EXISTS idx_debts_status ON debts(status);
  CREATE INDEX IF NOT EXISTS idx_debt_installments_debt ON debt_installments(debt_id, due_date);
  CREATE INDEX IF NOT EXISTS idx_debt_payments_debt ON debt_payments(debt_id, payment_date);

  CREATE INDEX IF NOT EXISTS idx_sales_delivery ON sales(delivery_date);
  CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
  CREATE INDEX IF NOT EXISTS idx_purchases_arrival ON purchases(arrival_date);
  CREATE INDEX IF NOT EXISTS idx_purchases_product ON purchases(product_id);
  CREATE INDEX IF NOT EXISTS idx_cash_date ON cash_movements(movement_date);
  CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_movements(product_id, movement_date);
  CREATE INDEX IF NOT EXISTS idx_receivable_due ON accounts_receivable(due_date);
  CREATE INDEX IF NOT EXISTS idx_payable_due ON accounts_payable(due_date);
  CREATE INDEX IF NOT EXISTS idx_indirect_period ON indirect_costs(period);
  CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
`);

export const projectRootDir = projectRoot;

export function tx(work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // The transaction may have been closed by SQLite after a fatal error.
    }
    throw error;
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function logActivity(user, action, entity, entityId, details = '') {
  db.prepare(`
    INSERT INTO activity_log (user_id, user_name, action, entity, entity_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    user?.id ?? null,
    user?.full_name ?? user?.username ?? 'Sistema',
    action,
    entity,
    entityId == null ? null : String(entityId),
    details,
    nowIso()
  );
}
