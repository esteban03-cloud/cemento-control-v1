export class ApiError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function required(body, fields, labels = {}) {
  const missing = fields.filter((field) => {
    const value = body?.[field];
    return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
  });
  if (missing.length) {
    throw new ApiError(
      422,
      `Faltan campos obligatorios: ${missing.map((f) => labels[f] || f).join(', ')}.`
    );
  }
}

export function text(value, { max = 500, fallback = '', trim = true } = {}) {
  if (value === null || value === undefined) return fallback;
  const output = trim ? String(value).trim() : String(value);
  return output.slice(0, max);
}

export function integer(value, field = 'valor') {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) throw new ApiError(422, `El campo ${field} debe ser un número entero.`);
  return parsed;
}

export function bool(value, fallback = false) {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

export function pickEnum(value, options, field = 'valor', fallback = null) {
  if (options.includes(value)) return value;
  if (fallback !== null) return fallback;
  throw new ApiError(422, `El campo ${field} debe ser uno de: ${options.join(', ')}.`);
}
