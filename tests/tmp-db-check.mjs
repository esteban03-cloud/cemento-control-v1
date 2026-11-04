import { db } from '../server/db.js';

console.log('activity latest', db.prepare(`
  SELECT id, action, entity, entity_id, details, created_at
  FROM activity_log ORDER BY id DESC LIMIT 30
`).all());
console.log('logs by action', db.prepare(`
  SELECT action, entity, COUNT(*) AS n FROM activity_log GROUP BY action, entity ORDER BY n DESC
`).all());
console.log('sale invoices latest', db.prepare(`
  SELECT id, invoice_number, delivery_date, total, created_at FROM sales ORDER BY id DESC LIMIT 8
`).all());
console.log('cash latest', db.prepare(`
  SELECT id, movement_date, type, category, amount, description, created_at FROM cash_movements ORDER BY id DESC LIMIT 10
`).all());
