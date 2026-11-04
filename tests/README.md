# Pruebas y QA

## Suite automática de API

```powershell
npm test
```

`tests/api.test.mjs` crea una base temporal, carga la semilla y valida los flujos principales sin tocar la base de trabajo. Es la suite que debe pasar antes de entregar cambios.

## Pruebas de navegador (opcionales)

Estos scripts usan `playwright-core` y el Chrome instalado en Windows. Se ejecutan contra una instancia que debe estar en ejecución.

### Preparar una base aislada

```powershell
$env:DB_FILE="$PWD\tests\e2e.db"
node server/seed.js --reset
$env:PORT="8788"
node server/index.js
```

En otra terminal:

```powershell
node tests/e2e-ui.mjs          # flujo de venta, compra, caja, cartera, PDF/PNG y estados
node tests/page-audit.mjs      # recorre todos los módulos y detecta errores de consola
node tests/check-overflow.mjs  # mide desbordamiento horizontal en móvil
node tests/import-role-test.mjs # prueba importación, backups y roles
```

`e2e-ui.mjs`, `page-audit.mjs`, `check-overflow.mjs` e `import-role-test.mjs` esperan la instancia aislada en `http://127.0.0.1:8788`.

### Capturas del manual

Con la aplicación real en `http://127.0.0.1:8787` y datos de demostración:

```powershell
node tests/capture-manual.mjs
npm run manual
```

Las capturas se guardan en `docs/capturas` y el manual PDF se regenera en `docs/manual-usuario.pdf`. El script `build-manual.mjs` usa Chrome en la ruta estándar de Windows; si tu instalación está en otra ruta, ajusta `executablePath`.

## Notas

- No ejecutes los scripts de importación/restauración sobre la base de producción.
- Los scripts de navegador requieren Google Chrome; si usas Edge, cambia la ruta de `executablePath` en el script.
- `tests/artifacts` y `tests/*.db` están excluidos del control de versiones.
