import { db, nowIso } from './db.js';

export const DEFAULT_CONFIG = {
  business: {
    name: 'Cemento Andino S.A.S.',
    shortName: 'Cemento Andino',
    nit: '901.482.763-5',
    address: 'Km 4 Vía Soacha – Bogotá, Bodega 12',
    city: 'Bogotá D.C.',
    phone: '+57 320 458 7721',
    email: 'ventas@cementoandino.co',
    logo: ''
  },
  fiscal: {
    gmfRate: 0.004,
    ivaEnabled: false,
    ivaRate: 0.19
  },
  openingBalances: {
    cash: 15000000,
    bank: 70000000,
    capital: 85000000
  },
  sequences: {
    salePrefix: 'FV',
    purchasePrefix: 'FC',
    saleNext: 1001,
    purchaseNext: 1
  },
  thresholds: {
    salesGrowthGreen: 10,
    salesGrowthYellow: 0,
    marginGreen: 20,
    marginYellow: 10,
    cashCoverageGreen: 30,
    cashCoverageYellow: 15,
    cashDaysGreen: 45,
    cashDaysYellow: 20,
    receivablesGreen: 10,
    receivablesYellow: 25,
    profitabilityGreen: 15,
    profitabilityYellow: 8,
    materialGreen: 60,
    materialRed: 75,
    customerGreen: 30,
    customerRed: 50,
    inventoryGreenMonths: 2,
    inventoryRedMonths: 4
  },
  inventory: {
    defaultOrderingCost: 120000,
    defaultHoldingRate: 0.18
  },
  backup: {
    enabled: true,
    hour: 23,
    retention: 14
  }
};

function deepMerge(base, patch) {
  if (patch === null || patch === undefined) return base;
  if (Array.isArray(base) || Array.isArray(patch)) return patch;
  if (typeof base !== 'object' || typeof patch !== 'object') return patch;
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    result[key] = key in base ? deepMerge(base[key], value) : value;
  }
  return result;
}

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

export function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, JSON.stringify(value));
}

export function getConfig() {
  return deepMerge(DEFAULT_CONFIG, getSetting('config', {}));
}

export function saveConfig(patch) {
  const next = deepMerge(getConfig(), patch);
  setSetting('config', next);
  setSetting('config_updated_at', nowIso());
  return next;
}

export function getNextSequence(kind) {
  const config = getConfig();
  const key = kind === 'sale' ? 'seq_sale_next' : 'seq_purchase_next';
  const fallback = kind === 'sale' ? config.sequences.saleNext : config.sequences.purchaseNext;
  const current = Number(getSetting(key, fallback) || fallback);
  const prefix = kind === 'sale' ? config.sequences.salePrefix : config.sequences.purchasePrefix;
  return { number: current, label: `${prefix}-${String(current).padStart(4, '0')}` };
}

export function consumeSequence(kind, usedLabel) {
  const key = kind === 'sale' ? 'seq_sale_next' : 'seq_purchase_next';
  const current = getNextSequence(kind).number;
  setSetting(key, current + 1);
  return usedLabel;
}
