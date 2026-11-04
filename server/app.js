import express from 'express';
import compression from 'compression';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { authenticate } from './auth.js';
import { ApiError } from './lib/http.js';
import authRoutes from './routes/auth.js';
import operationRoutes from './routes/operations.js';
import financeRoutes from './routes/finance.js';
import inventoryRoutes from './routes/inventory.js';
import settingsRoutes from './routes/settings.js';
import dataRoutes from './routes/data.js';
import extrasRoutes from './routes/extras.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webDist = path.join(projectRoot, 'web', 'dist');

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(compression());
  app.use(express.json({ limit: '3mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
    );
    next();
  });
  app.use(authenticate);

  app.get('/api/health', (req, res) => {
    const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
    res.json({
      status: 'ok',
      app: 'CementoControl',
      version: '1.0.0',
      database: 'sqlite',
      users: userCount,
      uptimeSeconds: Math.round(process.uptime()),
      time: new Date().toISOString()
    });
  });

  app.use('/api', authRoutes);
  app.use('/api', operationRoutes);
  app.use('/api', financeRoutes);
  app.use('/api', inventoryRoutes);
  app.use('/api', settingsRoutes);
  app.use('/api', dataRoutes);
  app.use('/api', extrasRoutes);

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Ruta de API no encontrada.' });
  });

  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist, {
      index: false,
      setHeaders: (res, filePath) => {
        if (/[\\/]assets[\\/]/.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      const indexFile = path.join(webDist, 'index.html');
      if (!fs.existsSync(indexFile)) return next();
      res.setHeader('Cache-Control', 'no-cache');
      return res.sendFile(indexFile);
    });
  } else {
    app.get('/', (req, res) => {
      res.status(503).type('html').send(`
        <!doctype html><html lang="es"><head><meta charset="utf-8"><title>CementoControl</title>
        <style>body{font-family:system-ui;background:#f7f4ec;color:#111d2b;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:620px;background:white;border-radius:18px;padding:36px;box-shadow:0 18px 60px rgba(17,29,43,.12)}code{background:#f2eee3;padding:4px 8px;border-radius:6px}</style>
        </head><body><main><h1>Falta compilar la interfaz</h1>
        <p>El API está funcionando, pero no existe <code>web/dist</code>. Ejecuta <code>npm run build</code> y vuelve a cargar esta página.</p></main></body></html>
      `);
    });
  }

  app.use((req, res) => {
    res.status(404).json({ error: 'No encontrado.' });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'El archivo supera el tamaño máximo permitido (12 MB para importaciones, 30 MB para respaldos).'
        : 'No se pudo procesar el archivo cargado.';
      return res.status(422).json({ error: message });
    }
    if (error instanceof ApiError) {
      return res.status(error.status).json({ error: error.message, details: error.details });
    }
    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'El cuerpo de la solicitud no contiene JSON válido.' });
    }
    if (String(error?.message || '').includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'El registro ya existe o entra en conflicto con otro registro.' });
    }
    console.error(error);
    res.status(500).json({ error: 'Ocurrió un error inesperado. Revisa los registros del servidor.' });
  });

  return app;
}
