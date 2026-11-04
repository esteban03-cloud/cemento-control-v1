export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

const API_BASE = '/api';

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  const text = await response.text();
  return text ? { message: text } : {};
}

async function request(path, options = {}) {
  const { method = 'GET', body, headers = {}, signal } = options;
  const init = { method, headers: { ...headers }, credentials: 'same-origin', signal };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, init);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('No se pudo conectar con el servidor. Verifica que la aplicación esté en ejecución.', 0);
  }
  const data = await parseResponse(response);
  if (!response.ok) {
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('cc:unauthorized'));
    }
    throw new ApiError(data?.error || data?.message || 'La operación no se pudo completar.', response.status, data?.details);
  }
  return data;
}

function filenameFromDisposition(header) {
  if (!header) return null;
  const utf = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf) return decodeURIComponent(utf[1]);
  const basic = header.match(/filename="?([^";]+)"?/i);
  return basic ? basic[1] : null;
}

async function download(path, fallbackName = 'descarga') {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { credentials: 'same-origin' });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor para descargar el archivo.', 0);
  }
  if (!response.ok) {
    const data = await parseResponse(response);
    throw new ApiError(data?.error || 'No se pudo generar la descarga.', response.status);
  }
  const filename = filenameFromDisposition(response.headers.get('content-disposition')) || fallbackName;
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return filename;
}

async function upload(path, file, fields = {}, method = 'POST') {
  const form = new FormData();
  form.append('file', file);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) form.append(key, value);
  }
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      body: form,
      credentials: 'same-origin'
    });
  } catch {
    throw new ApiError('No se pudo cargar el archivo. Revisa la conexión con el servidor.', 0);
  }
  const data = await parseResponse(response);
  if (!response.ok) {
    throw new ApiError(data?.error || 'No se pudo procesar el archivo.', response.status, data?.details);
  }
  return data;
}

function queryString(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
}

export const api = {
  get: (path, options) => request(path, options),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
  download,
  upload,
  queryString
};
