export const ROLE_LABELS = {
  administrador: 'Administrador',
  vendedor: 'Vendedor',
  contador: 'Contador'
};

const BASE = [
  'dashboard:view',
  'ventas:view',
  'inventario:view',
  'cxc:view',
  'terceros:view'
];

export const ROLE_PERMISSIONS = {
  administrador: ['*'],
  vendedor: [
    ...BASE,
    'ventas:write',
    'cxc:pay',
    'terceros:write',
    'cotizaciones:view',
    'cotizaciones:write'
  ],
  contador: [
    ...BASE,
    'ventas:write',
    'compras:view',
    'compras:write',
    'productos:write',
    'caja:view',
    'caja:write',
    'cxc:pay',
    'cxp:view',
    'cxp:pay',
    'ajustes:write',
    'cartera:view',
    'costos:view',
    'costos:write',
    'estados:view',
    'reportes:export',
    'cotizaciones:view',
    'prestamos:view',
    'prestamos:write',
    'prestamos:pay',
    'deudas:view',
    'deudas:write',
    'deudas:pay'
  ]
};

export function permissionsFor(role) {
  return ROLE_PERMISSIONS[role] || [];
}

export function hasPermission(role, permission) {
  const perms = permissionsFor(role);
  return perms.includes('*') || perms.includes(permission);
}
