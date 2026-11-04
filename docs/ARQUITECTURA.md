# Arquitectura y reglas de negocio — CementoControl

## 1. Visión general

CementoControl es una aplicación web autocontenida para una distribuidora de cemento. El sistema está compuesto por:

```
Navegador (PC / móvil)
   │ HTTPS/HTTP
   ▼
SPA React + Vite (web/dist)
   │ fetch /api (misma origen, cookie HttpOnly)
   ▼
API Node.js + Express
   ├── Autenticación y permisos
   ├── Servicios transaccionales
   ├── Analítica y KPI
   ├── Reportes, importación y exportación
   └── Programador de respaldos
   ▼
SQLite embebida (node:sqlite) — data/cemento.db
```

### Por qué SQLite

La especificación original sugiere PostgreSQL/MySQL, pero se eligió SQLite por las siguientes razones operativas:

- Instalación en una sola máquina sin administrar un motor de base de datos.
- Respaldo atómico en un archivo.
- Modelo relacional completo, transacciones ACID, claves foráneas e índices.
- Rendimiento más que suficiente para una distribuidora pequeña o mediana y un único nodo.
- Menos puntos de falla y despliegue reproducible con Docker.

La lógica de negocio está aislada en `server/services/` y el esquema es explícito, de modo que una migración futura a PostgreSQL puede hacerse reemplazando la capa de almacenamiento y conservando los servicios y las rutas.

## 2. Estructura del código

```
server/
  app.js                    Configuración de Express, cabeceras, SPA y errores
  index.js                  Arranque, semilla inicial y programador de backups
  db.js                     Conexión SQLite, esquema y helper tx()
  config.js                 Configuración por defecto y persistida
  auth.js                   Hash scrypt, sesiones, cookie y permisos
  permissions.js            Matriz de permisos por rol
  seed.js                   Semilla de 12 meses de demostración
  lib/
    dates.js                Fechas de Colombia (UTC−5), meses y rangos
    money.js                Redondeo y formato de pesos
    http.js                 ApiError, validaciones y asyncRoute
  services/
    operations.js           Ventas, compras, caja, cartera, ajustes, inventario
    analytics.js            KPI, dashboard, cartera, costeo y estados financieros
    reports.js              Excel, CSV, PDF de estados financieros
    importer.js             Validación e importación CSV/XLSX
    backup.js               Exportación/restauración y programación de respaldos
  routes/
    auth.js                 Login, sesión, contraseña, metadatos y alertas
    operations.js           CRUD de ventas y compras
    finance.js              Dashboard, caja, CxC, CxP, cartera, costos y estados
    inventory.js            Inventario, kardex, productos y ajustes
    settings.js             Configuración, terceros y usuarios
    data.js                 Exportaciones, importaciones y respaldos
web/src/
  api.js                    Cliente fetch, descargas y subida de archivos
  utils.js                  Formato COP/fechas y helpers de interfaz
  context/                  Sesión y notificaciones tipo toast
  components/               Layout, tablas, formularios, gráficas, documentos
  pages/                    Una página por módulo funcional
  styles.css                Sistema visual responsive
```

## 3. Modelo de datos

### Núcleo comercial

| Tabla | Propósito |
|---|---|
| `users` | Usuarios, rol, estado y hash de contraseña. |
| `sessions` | Tokens de sesión con expiración. |
| `settings` | Configuración JSON (empresa, impuestos, umbrales, secuencias). |
| `customers` | Clientes. |
| `suppliers` | Proveedores de producto, flete, descargue o cargue. |
| `couriers` | Coteros. |
| `products` | Producto, stock, costo promedio, precio, mínimos y parámetros EOQ. |
| `purchases` | Cabecera de compra y condiciones de producto/flete/descargue. |
| `sales` | Factura de venta, logística, costos y estado de pago. |

### Inventario y caja

| Tabla | Propósito |
|---|---|
| `inventory_movements` | Kardex: compras (+), ventas (−), ajustes (+/−), con costo unitario. |
| `inventory_adjustments` | Ajustes con motivo obligatorio. |
| `cash_movements` | Ingresos y egresos con medio efectivo/bancos y referencia al origen. |
| `accounts_receivable` | Cuenta por cobrar por factura de venta. |
| `receivable_payments` | Abonos de clientes y 4x1000 asociado. |
| `accounts_payable` | Obligaciones por producto, flete, descargue o cargue. |
| `payable_payments` | Pagos a proveedores. |

### Análisis y auditoría

| Tabla | Propósito |
|---|---|
| `indirect_costs` | Arriendo, nómina, servicios y otros gastos indirectos por período. |
| `activity_log` | Trazabilidad de operaciones y acciones. |

### Convenciones

- Fechas de negocio: `YYYY-MM-DD` en zona `America/Bogota`.
- Dinero: `REAL` en base de datos; los cálculos pasan por `money()` con redondeo a dos decimales.
- Cantidades: `REAL` con hasta 3 decimales (`roundStock`).
- Estados de cartera y compras se derivan de fechas y saldos; no se guardan como estado mutable duplicado, excepto el estado simple de una venta.
- Todas las operaciones compuestas usan `tx()` con `BEGIN IMMEDIATE` y rollback ante error.

## 4. Flujos transaccionales

### 4.1 Compra

1. Resolver/crear proveedor y producto si la interfaz los envía nuevos.
2. Validar fechas, cantidades y costos.
3. Calcular:
   - `costo_producto = cantidad × costo_unitario`
   - `flete = valor_flete` si el negocio paga; 0 si paga el proveedor.
   - `descargue = valor_descargue`
   - `costo_landed = producto + flete + descargue`
4. Crear la compra con consecutivo automático `FC-####` (editable).
5. Generar cuentas por pagar por cada saldo a crédito (`producto`, `flete`, `descargue`), con su proveedor y vencimiento.
6. Registrar los pagos/abonos iniciales en caja o bancos.
7. Crear un movimiento positivo de inventario con costo unitario landed y recalcular el promedio ponderado.
8. Registrar auditoría.

### 4.2 Venta

1. Validar cliente, producto, stock, precio, entrega y condición.
2. Calcular subtotal, cargue, total y costo de ventas con el costo promedio vigente.
3. Si es contado, registrar ingreso en caja/bancos. Si el medio es bancos, calcular 4x1000 y registrarlo como egreso separado.
4. Si el cargue es a crédito, crear una cuenta por pagar al proveedor de cargue. Si es contado, registrar el egreso del cargue.
5. Si la venta es a crédito, crear la cuenta por cobrar con vencimiento.
6. Descontar inventario y recalcular promedio ponderado.
7. Registrar auditoría.

### 4.3 Abono de cartera

1. Validar que el valor no supere el saldo.
2. Registrar el abono y el ingreso en caja/bancos.
3. Si es bancos, calcular y registrar el 4x1000 sobre el valor recibido.
4. Actualizar saldo de la cuenta y `sales.paid_amount`.
5. Registrar auditoría.

### 4.4 Pago a proveedor

1. Validar saldo y fecha.
2. Registrar el egreso en caja/bancos con la categoría del concepto de la CxP.
3. Actualizar el saldo de la cuenta por pagar.
4. Registrar auditoría.

### 4.5 Ajuste de inventario

1. Exigir producto, tipo, cantidad, fecha y motivo.
2. Validar stock suficiente en una salida.
3. Registrar el movimiento (entrada a costo indicado o promedio actual; salida al promedio).
4. Recalcular stock y costo promedio.
5. Registrar auditoría.

### 4.6 Promedio ponderado

`recalcProduct()` recorre los movimientos de inventario del producto en orden cronológico:

- Entrada: `stock += cantidad; valor += cantidad × costo`.
- Salida: se descuenta el costo promedio vigente y se reduce el stock.
- Costo promedio resultante: `valor / stock` cuando hay existencias.

### 4.7 Reversión de operaciones

- Eliminar una venta revierte inventario, caja, CxC y CxP de cargue en una transacción.
- Una venta a crédito con abonos registrados no se puede editar ni eliminar; protege el historial de recaudo.
- Editar una compra o venta elimina y vuelve a crear sus dependencias dentro de la misma transacción.
- Una compra no se puede eliminar si el lote ya fue vendido y el stock resultante sería negativo.
- La eliminación de compras está disponible para administrador/contador y muestra una confirmación explícita.

## 5. KPIs del dashboard

Todos los macros se calculan con datos del período seleccionado (por defecto el mes actual).

| KPI | Fórmula implementada | Semáforo |
|---|---|---|
| Crecimiento de ventas | `(ventas_actual − ventas_anterior) / ventas_anterior × 100` | verde > 0, amarillo 0, rojo < 0 |
| Efectivo + bancos | saldo inicial + ingresos cobrados − egresos pagados | verde > 30 días de gastos, amarillo 15–30, rojo < 15 |
| Margen por producto | `(precio venta − costo vendido) / precio venta × 100` | verde ≥ 20 %, amarillo 10–20 %, rojo < 10 % / pérdida |
| Días de caja | efectivo ÷ (egresos del mes ÷ 30) | verde > 45, amarillo 20–45, rojo < 20 |
| CxC vencidas | suma de saldos con vencimiento anterior al corte ÷ ventas del período | verde < 10 %, amarillo 10–25 %, rojo > 25 % |
| CxP próximas | saldos con vencimiento en ≤ 15 días | verde < caja, rojo > caja |
| Utilidad del mes | ingresos devengados − costo de ventas − gastos operativos | verde positiva y creciente, amarillo positiva decreciente, rojo negativa |
| Punto de equilibrio | costos fijos ÷ margen de contribución por bulto | verde ventas sobre el punto, rojo por debajo |
| Rentabilidad sobre ventas | utilidad neta ÷ ventas × 100 | verde ≥ 15 %, amarillo 8–15 %, rojo < 8 % |
| Ventas vs. mes anterior | misma fórmula de crecimiento, umbral de dos dígitos | verde > 10 %, amarillo 0–10 %, rojo negativo |
| Valor del inventario | Σ(stock × costo promedio) | verde < 2 meses de costo de ventas, rojo > 4 meses |
| Utilidad acumulada | Σ utilidades mensuales del año | verde positiva y creciente, rojo negativa |
| EOQ | `√(2 × D × S ÷ H)` | verde 50–100 % del EOQ, amarillo 100–200 %, rojo < 50 % o > 200 % |
| Clientes | participación del cliente en ventas | verde ≤ 30 %, amarillo 30–50 %, rojo > 50 % |
| Costos | participación del material en el costo total | verde < 60 %, amarillo 60–75 %, rojo > 75 % |

**Nota sobre utilidad:** el sistema usa utilidad devengada (ventas facturadas menos costo de ventas y gastos del período) en lugar de una resta directa de caja. Esto evita distorsiones cuando se compra inventario en un mes y se vende en otro; la caja se muestra de forma independiente en los KPI de liquidez.

**EOQ:** la demanda anual se estima con las ventas de los últimos 90 días; el costo de pedido y la tasa de mantenimiento por producto se configuran en la ficha del producto. Se calculan además cuatro semáforos: stock/EOQ, pedidos por mes, costo total frente al óptimo y días de faltantes.

## 6. Costeo y estados financieros

- **Costo directo:** costo de ventas del producto (que ya incluye flete y descargue capitalizados) más cargue. La proporción de material/flete/descargue se estima con las últimas compras del producto.
- **Indirectos:** los gastos del período se asignan por volumen de bultos o por valor de venta. El 4x1000 se incorpora automáticamente por valor de venta.
- **Estado de resultados:** ingresos − costo de ventas (inventario + cargue) − gastos operativos (indirectos + 4x1000).
- **Balance general:** efectivo + bancos + cartera + inventario = pasivos + patrimonio. La cuenta de resultados acumulados incluye el resultado del período y el ajuste de conciliación de gestión.
- **Flujo de caja:** movimientos reales de caja y bancos agrupados por ingreso/egreso, con saldo inicial y final.
- Los estados son reportes gerenciales; no sustituyen una contabilidad formal con impuestos, depreciaciones o facturación electrónica.

## 7. Roles y permisos

| Módulo | Administrador | Vendedor | Contador |
|---|---|---|---|
| Dashboard | ✓ | ✓ | ✓ |
| Ventas | ✓ | ✓ | ver |
| Compras | ✓ | — | ✓ |
| Inventario | ✓ | ver | ✓ |
| Ajustes | ✓ | — | ✓ |
| Caja | ✓ | — | ✓ |
| CxC / cobros | ✓ | ✓ | ✓ |
| CxP / pagos | ✓ | — | ✓ |
| Cartera | ✓ | — | ✓ |
| Costeo / asignación | ✓ | — | ✓ |
| Estados financieros | ✓ | — | ✓ |
| Exportaciones | ✓ | — | ✓ |
| Importaciones | ✓ | — | — |
| Configuración / usuarios | ✓ | — | — |

La matriz se define en `server/permissions.js` y se aplica en cada ruta. La interfaz oculta los módulos no permitidos y el servidor rechaza la operación con HTTP 403.

## 8. Seguridad

- Contraseñas con `scryptSync` y sal aleatoria.
- Cookie de sesión `cc_session` HttpOnly, SameSite=Lax, expiración 12 h.
- Mensajes de login genéricos y límite de intentos por IP/usuario.
- Consultas parametrizadas en SQLite.
- Validación de cuerpos y control de tipo de archivo en importaciones.
- Cabeceras CSP, X-Frame-Options, nosniff y Permissions-Policy.
- Restauración de respaldo con copia pre-restauración y cierre de sesiones.
- El servidor no debe exponerse a Internet sin HTTPS y proxy inverso.

## 9. Importación, exportación y respaldos

- **Importar:** clientes, proveedores, productos, compras y ventas desde CSV/XLSX; primero se valida todo el archivo y se muestra la previsualización. Si hay errores no se escribe nada.
- **Exportar:** Excel o CSV por módulo, PDF de estados financieros, JSON completo, Excel completo.
- **Respaldos automáticos:** un chequeo cada hora crea un archivo diario después de la hora configurada; retiene N días (excluyendo copias pre-restauración).
- **Restauración:** valida el JSON, exige un administrador activo, crea `pre-restauracion-*.json`, reemplaza las tablas y cierra sesiones.

## 10. Pruebas

- `npm test`: suite de API con base temporal; cubre auth, dashboard, permisos, ventas, CxC, compras, caja, ajustes, configuración, reportes y respaldos.
- `tests/e2e-ui.mjs`: flujo completo en navegador con Playwright (requiere servidor y base de pruebas).
- `tests/page-audit.mjs`: recorrido de todos los módulos y revisión de errores de consola.
- `tests/check-overflow.mjs`: valida que no exista scroll horizontal en móvil.
- `tests/capture-manual.mjs`: genera las capturas de este manual.

## 11. Deuda técnica y extensiones sugeridas

- Migrar a PostgreSQL si se requiere multiusuario intensivo o múltiples sedes.
- Añadir facturación electrónica DIAN, retenciones e IVA detallado.
- Añadir autenticación de dos factores y política de expiración de contraseñas.
- Implementar PWA/offline con cola de sincronización.
- Añadir conciliación bancaria, activos fijos y depreciación.
- Incorporar historial de stock diario para días de faltantes reales.
- Exportar nómina y programar recordatorios por correo/WhatsApp.
