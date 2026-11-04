# Referencia de API — CementoControl

Base URL: `http://127.0.0.1:8787/api`

La autenticación se basa en la cookie de sesión `cc_session`, emitida por el login. Todas las peticiones de navegador deben enviarse con `credentials: same-origin` (el cliente del proyecto lo hace automáticamente). El cuerpo JSON usa `Content-Type: application/json`.

## Autenticación y metadatos

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| GET | `/public/config` | Nombre comercial y logo para la pantalla de login. | Público |
| POST | `/auth/login` | Inicia sesión y emite la cookie. Body: `{username,password}`. | Público |
| GET | `/auth/me` | Usuario actual, permisos y configuración pública. | Sesión |
| POST | `/auth/logout` | Cierra la sesión. | Sesión |
| POST | `/auth/password` | Cambia la contraseña. Body: `{current_password,new_password}`. | Sesión |
| GET | `/meta` | Productos, clientes, proveedores, coteros, impuestos, umbrales y próximos consecutivos. | Sesión |
| GET | `/alerts` | Alertas calculadas de cartera, pagos, stock y márgenes. | Sesión |
| GET | `/health` | Estado del servicio. | Público |

Respuesta de login:

```json
{
  "user": {
    "id": 1,
    "username": "admin",
    "full_name": "Andrea Morales",
    "role": "administrador",
    "permissions": ["*"]
  },
  "business": { "name": "Cemento Andino S.A.S.", "shortName": "Cemento Andino" },
  "expiresAt": "2026-11-04T02:34:49.182Z"
}
```

## Ventas

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/sales?from=&to=&status=&search=&page=&limit=` | `ventas:view` |
| GET | `/sales/:id` | `ventas:view` |
| POST | `/sales` | `ventas:write` |
| PUT | `/sales/:id` | `ventas:write` |
| DELETE | `/sales/:id` | `ventas:write` |

Estados derivados del listado: `pagada`, `pendiente`, `por_vencer`, `vencida`.

Ejemplo de creación:

```json
{
  "invoice_number": "",
  "delivery_date": "2026-11-03",
  "customer_id": 1,
  "customer_name": null,
  "customer_nit": null,
  "customer_phone": null,
  "customer_address": null,
  "payment_condition": "credito",
  "due_date": "2026-12-03",
  "money_entry_date": "2026-11-03",
  "payment_method": "bancos",
  "courier_id": 2,
  "courier_name": null,
  "courier_phone": null,
  "loading_value": 90000,
  "loading_type": "contado",
  "loading_provider": "Transportes El Volcán",
  "product_id": 1,
  "quantity": 120,
  "unit_price": 31500,
  "notes": "Entrega en obra"
}
```

- Enviar `invoice_number` vacío usa el consecutivo automático.
- Para crear un cliente desde la venta, omite `customer_id` y envía `customer_name` (y opcionalmente NIT, teléfono, dirección).
- Para un cotero nuevo, omite `courier_id` y envía `courier_name`.

## Compras

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/purchases?from=&to=&status=&search=&supplier_id=&page=&limit=` | `compras:view` |
| GET | `/purchases/:id` | `compras:view` |
| POST | `/purchases` | `compras:write` |
| PUT | `/purchases/:id` | `compras:write` |
| DELETE | `/purchases/:id` | `compras:write` |

Ejemplo:

```json
{
  "doc_number": "",
  "arrival_date": "2026-11-03",
  "payment_date": "2026-11-03",
  "supplier_id": 1,
  "supplier_name": null,
  "product_id": 1,
  "product_code": null,
  "product_name": null,
  "new_product_sale_price": null,
  "quantity": 1500,
  "unit_cost": 22000,
  "purchase_type": "credito",
  "initial_payment": 3000000,
  "credit_due_date": "2026-12-03",
  "payment_method": "bancos",
  "freight_payer": "yo",
  "driver_name": "Jhon Ramírez",
  "freight_value": 550000,
  "freight_type": "contado",
  "freight_advance": 0,
  "freight_provider": "Transportes El Volcán",
  "unloading_value": 160000,
  "unloading_type": "credito",
  "unloading_advance": 0,
  "unloading_provider": "Servicios de Descargue Rápidos",
  "notes": "Llegada en dos viajes"
}
```

- Enviar `supplier_id` o `supplier_name`; si no existe, se crea.
- Enviar `product_id` o los campos `product_code`, `product_name` y `new_product_sale_price`.
- Los saldos a crédito crean automáticamente cuentas por pagar por concepto.

## Dashboard, caja y cartera

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/dashboard?month=YYYY-MM` | `dashboard:view` |
| GET | `/cash?from=&to=&type=&method=&category=&search=&page=&limit=` | `caja:view` |
| POST | `/cash` | `caja:write` |
| DELETE | `/cash/:id` | `caja:write` (solo manuales) |
| GET | `/receivables?status=&customer_id=&search=&due_from=&due_to=&page=&limit=` | `cxc:view` |
| GET | `/receivables/:id/payments` | `cxc:view` |
| POST | `/receivables/:id/payments` | `cxc:pay` |
| GET | `/payables?status=&concept=&provider=&search=&due_from=&due_to=&page=&limit=` | `cxp:view` |
| GET | `/payables/:id/payments` | `cxp:view` |
| POST | `/payables/:id/payments` | `cxp:pay` |
| GET | `/portfolio` | `cartera:view` |

Ejemplo de abono:

```json
{
  "amount": 2500000,
  "payment_date": "2026-11-03",
  "method": "bancos",
  "notes": "Transferencia Bancolombia 1145"
}
```

El campo `method` acepta `efectivo` o `bancos`. En cobros por bancos se calcula automáticamente el 4x1000, se registra como egreso y se devuelve el valor del descuento.

Estados de cartera: `pagada`, `pendiente`, `por_vencer`, `vencida`, `proxima` (CxP).

## Inventario

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/inventory` | `inventario:view` |
| GET | `/inventory/adjustments?from=&to=&search=` | `inventario:view` |
| POST | `/inventory/adjustments` | `ajustes:write` |
| GET | `/inventory/:id/movements?from=&to=` | `inventario:view` |
| GET | `/products?all=true` | `inventario:view` |
| POST | `/products` | `productos:write` |
| PUT | `/products/:id` | `productos:write` |
| DELETE | `/products/:id` | `productos:write` (desactiva) |

Ejemplo de ajuste:

```json
{
  "product_id": 1,
  "adjustment_date": "2026-11-03",
  "type": "salida",
  "quantity": 2,
  "unit_cost": 0,
  "reason": "Bultos averiados por humedad en bodega"
}
```

## Costeo y estados financieros

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/costing?month=YYYY-MM` | `costos:view` |
| GET | `/indirect-costs?month=YYYY-MM` | `costos:view` |
| POST | `/indirect-costs` | `costos:write` |
| PUT | `/indirect-costs/:id` | `costos:write` |
| DELETE | `/indirect-costs/:id` | `costos:write` |
| GET | `/financial-statements?month=YYYY-MM` | `estados:view` |
| GET | `/financial-years` | `estados:view` |

Ejemplo de costo indirecto:

```json
{
  "month": "2026-11",
  "category": "Arriendo bodega",
  "description": "Arriendo del mes",
  "amount": 2500000,
  "allocation_method": "volumen",
  "is_fixed": true
}
```

`allocation_method`: `volumen` o `valor_venta`.

## Configuración, terceros y usuarios

| Método | Ruta | Permiso |
|---|---|---|
| GET | `/settings` | Solo administrador |
| PUT | `/settings` | Solo administrador |
| GET | `/partners` | `terceros:view` |
| POST | `/partners/:type` | `terceros:write` |
| PUT | `/partners/:type/:id` | `terceros:write` |
| DELETE | `/partners/:type/:id` | `terceros:write` |
| GET | `/users` | Solo administrador |
| POST | `/users` | Solo administrador |
| PUT | `/users/:id` | Solo administrador |
| DELETE | `/users/:id` | Solo administrador (desactiva) |

`type` de tercero: `customers`, `suppliers` o `couriers`.

Ejemplo de actualización de configuración (parcial):

```json
{
  "business": {
    "name": "Cemento Andino S.A.S.",
    "shortName": "Cemento Andino",
    "nit": "901.482.763-5",
    "address": "Km 4 Vía Soacha – Bogotá",
    "city": "Bogotá D.C.",
    "phone": "+57 320 458 7721",
    "email": "ventas@cementoandino.co",
    "logo": ""
  },
  "fiscal": {
    "gmfRate": 0.004,
    "ivaEnabled": false,
    "ivaRate": 0.19
  },
  "thresholds": {
    "marginGreen": 20,
    "marginYellow": 10
  }
}
```

## Exportaciones

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/export/:entity?format=xlsx\|csv` | Reporte Excel/CSV. Entidades: `sales`, `purchases`, `inventory`, `cash`, `receivables`, `payables`, `costing`, `financial`. |
| GET | `/export/financial.pdf?month=YYYY-MM` | PDF de estados financieros. |
| GET | `/export/template/:entity?format=xlsx\|csv` | Plantilla de importación. |
| GET | `/export/backup.json` | Respaldo JSON completo. |
| GET | `/export/backup.xlsx` | Respaldo técnico en Excel. |
| GET | `/export/backups/:filename` | Descarga de un respaldo guardado. |

Las exportaciones requieren `reportes:export`; los respaldos requieren administrador.

## Importaciones

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/import/catalog` | Entidades, encabezados y plantillas disponibles. |
| POST | `/import/:entity/validate` | Valida el archivo y devuelve previsualización sin escribir. |
| POST | `/import/:entity` | Valida y escribe los datos. |

Entidades: `customers`, `suppliers`, `products`, `purchases`, `sales`. Archivos `.csv` o `.xlsx`, máximo 12 MB. Las rutas de importación requieren administrador y usan `multipart/form-data` con el campo `file`.

Flujo recomendado:

1. Descargar la plantilla del módulo.
2. Completar y guardar en CSV o Excel.
3. Validar el archivo y corregir los errores reportados.
4. Importar solo cuando la validación no tenga errores.

## Respaldos

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/backup/status` | Configuración, historial y último respaldo. |
| POST | `/backup/run` | Crea un respaldo manual. |
| POST | `/backup/restore` | Restaura un JSON con `multipart/form-data` campo `file`. |

La restauración valida el archivo, crea una copia previa, reemplaza la base y cierra las sesiones.

## Formato de errores

Los errores usan el formato:

```json
{
  "error": "Mensaje legible para el usuario",
  "details": {
    "errors": [{ "row": 4, "message": "El proveedor no existe." }]
  }
}
```

Códigos usados:

| Código | Significado |
|---|---|
| 400 | Solicitud mal formada / JSON inválido |
| 401 | Sin sesión o sesión expirada |
| 403 | Sin permiso para el módulo/acción |
| 404 | Recurso no encontrado |
| 409 | Conflicto de integridad o duplicado |
| 422 | Datos inválidos o archivo inválido |
| 429 | Demasiados intentos de login |
| 500 | Error inesperado del servidor |

## Fechas, moneda y zona horaria

- Las fechas se envían y reciben como `YYYY-MM-DD`.
- Los meses se envían como `YYYY-MM`.
- El servidor determina el día de negocio en `America/Bogota` (UTC−5).
- Los valores monetarios se expresan en pesos colombianos (COP) y no incluyen símbolo en las peticiones.
- En respuestas financieras, los valores están redondeados a dos decimales.
