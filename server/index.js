import { createApp } from './app.js';
import { ensureSeed } from './seed.js';
import { startBackupScheduler } from './services/backup.js';

const port = Number(process.env.PORT) || 8787;
const host = process.env.HOST || '127.0.0.1';

async function main() {
  const seed = await ensureSeed();
  if (seed.seeded) {
    console.log('Base de datos inicializada con datos de demostración.');
  }
  startBackupScheduler();
  const app = createApp();
  const server = app.listen(port, host, () => {
    console.log('');
    console.log('  CementoControl · Sistema de ventas de cemento');
    console.log(`  Servidor: http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    console.log('  Presiona Ctrl+C para detenerlo.');
    console.log('');
  });
  const shutdown = () => {
    console.log('\nCerrando CementoControl…');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('No se pudo iniciar CementoControl:', error);
  process.exit(1);
});
