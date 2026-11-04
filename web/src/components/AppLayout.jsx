import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Banknote,
  Bell,
  Building2,
  Calculator,
  ChartNoAxesCombined,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Database,
  FileBarChart,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  UserRound,
  WalletCards,
  X
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../api.js';
import { Logo, BrandMark } from './Brand.jsx';
import { Avatar, Spinner } from './DataDisplay.jsx';
import { Modal } from './Modal.jsx';
import { Field, TextInput } from './Forms.jsx';
import {
  classNames,
  formatDate,
  formatDateTime,
  roleLabel,
  todayISO
} from '../utils.js';

const NAV_GROUPS = [
  {
    label: 'Operación',
    items: [
      { to: '/', label: 'Panel de control', icon: LayoutDashboard, permission: 'dashboard:view', end: true },
      { to: '/ventas', label: 'Ventas', icon: ReceiptText, permission: 'ventas:view' },
      { to: '/compras', label: 'Compras', icon: ShoppingCart, permission: 'compras:view' },
      { to: '/inventario', label: 'Inventario', icon: Package, permission: 'inventario:view' }
    ]
  },
  {
    label: 'Finanzas',
    items: [
      { to: '/caja', label: 'Caja y bancos', icon: WalletCards, permission: 'caja:view' },
      { to: '/cxc', label: 'Cuentas por cobrar', icon: HandCoins, permission: 'cxc:view' },
      { to: '/cxp', label: 'Cuentas por pagar', icon: Banknote, permission: 'cxp:view' },
      { to: '/cartera', label: 'Cartera y flujo', icon: ChartNoAxesCombined, permission: 'cartera:view' }
    ]
  },
  {
    label: 'Análisis',
    items: [
      { to: '/costeo', label: 'Costeo mensual', icon: Calculator, permission: 'costos:view' },
      { to: '/costos', label: 'Asignación de costos', icon: CircleDollarSign, permission: 'costos:view' },
      { to: '/estados', label: 'Estados financieros', icon: FileBarChart, permission: 'estados:view' }
    ]
  },
  {
    label: 'Sistema',
    items: [
      { to: '/datos', label: 'Datos y respaldos', icon: Database, permission: 'reportes:export' },
      { to: '/configuracion', label: 'Configuración', icon: Settings, permission: 'admin:access' }
    ]
  }
];

const MOBILE_PRIORITY = ['/', '/ventas', '/inventario', '/caja', '/cxc', '/compras', '/cxp'];

export function AppLayout() {
  const { user, business, logout, loading } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const notifRef = useRef(null);
  const userRef = useRef(null);

  const navGroups = useMemo(() => NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!user) return false;
        if (item.permission === 'admin:access') return user.role === 'administrador';
        return user.permissions?.includes('*') || user.permissions?.includes(item.permission);
      })
    }))
    .filter((group) => group.items.length), [user]);

  const flatItems = useMemo(() => navGroups.flatMap((group) => group.items), [navGroups]);
  const mobileItems = useMemo(() => {
    const prioritized = MOBILE_PRIORITY
      .map((path) => flatItems.find((item) => item.to === path))
      .filter(Boolean)
      .slice(0, 4);
    return prioritized;
  }, [flatItems]);
  const activeItem = flatItems
    .slice()
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)));

  const loadAlerts = async () => {
    setAlertsLoading(true);
    try {
      const data = await api.get('/alerts');
      setAlerts(data.alerts || []);
    } catch (error) {
      if (error.status !== 401) console.error(error);
    } finally {
      setAlertsLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
    const timer = setInterval(loadAlerts, 120000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
    setNotificationsOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handler = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) setNotificationsOpen(false);
      if (userRef.current && !userRef.current.contains(event.target)) setUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = async () => {
    await logout();
    toast.info('Sesión cerrada. Hasta pronto.');
    navigate('/login', { replace: true });
  };

  if (loading) {
    return (
      <div className="app-boot">
        <BrandMark size={52} />
        <Spinner size={24} />
        <span>Preparando tu tablero…</span>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <NavLink to="/" className="sidebar-brand" aria-label="Ir al panel de control">
            <Logo />
          </NavLink>
          <span className="sidebar-company">{business?.city || 'Colombia'} · UTC−5</span>
        </div>
        <nav className="sidebar-nav" aria-label="Navegación principal">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-group-label">{group.label}</span>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => classNames('nav-link', isActive && 'active')}
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                  <ChevronRight size={14} className="nav-chevron" />
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-help">
            <span className="sidebar-help-icon"><TrendingUp size={17} /></span>
            <div>
              <strong>Datos al día</strong>
              <span>Actualización en tiempo real</span>
            </div>
          </div>
          <div className="sidebar-user">
            <button type="button" className="sidebar-user-button" onClick={() => setPasswordOpen(true)} title="Seguridad de la cuenta">
              <Avatar name={user?.full_name} size={37} tone={2} />
              <span>
                <strong>{user?.full_name}</strong>
                <small>{roleLabel(user?.role)}</small>
              </span>
              <ShieldCheck size={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <button type="button" className="mobile-brand-button" onClick={() => setDrawerOpen(true)} aria-label="Abrir menú">
              <Menu size={20} />
            </button>
            <div className="mobile-brand"><BrandMark size={30} /><span>{business?.shortName || 'CementoControl'}</span></div>
            <div className="topbar-context">
              <span className="topbar-eyebrow">Hoy</span>
              <strong>{formatDate(todayISO(), { long: true })}</strong>
            </div>
          </div>
          <div className="topbar-right">
            <span className="topbar-live"><span className="live-dot" /> En línea</span>
            <div className="notif-wrap" ref={notifRef}>
              <button
                type="button"
                className="topbar-icon-button"
                onClick={() => setNotificationsOpen((value) => !value)}
                aria-label={`Notificaciones${alerts.length ? `, ${alerts.length} pendientes` : ''}`}
              >
                <Bell size={19} />
                {alerts.length > 0 && <span className="notif-dot">{alerts.length > 9 ? '9+' : alerts.length}</span>}
              </button>
              {notificationsOpen && (
                <div className="notification-panel">
                  <div className="notification-head">
                    <div>
                      <span className="eyebrow">Centro de alertas</span>
                      <h3>Pendientes de hoy</h3>
                    </div>
                    <button type="button" className="icon-button" onClick={loadAlerts} aria-label="Actualizar alertas">
                      <TrendingUp size={16} />
                    </button>
                  </div>
                  <div className="notification-list">
                    {alertsLoading && <div className="notification-loading"><Spinner size={16} /> Consultando…</div>}
                    {!alertsLoading && alerts.length === 0 && (
                      <div className="notification-empty"><ShieldCheck size={22} /><span>Todo en orden, sin alertas críticas.</span></div>
                    )}
                    {!alertsLoading && alerts.slice(0, 8).map((alert) => (
                      <button
                        type="button"
                        className={classNames('notification-item', `severity-${alert.severity}`)}
                        key={alert.id}
                        onClick={() => {
                          setNotificationsOpen(false);
                          navigate(alert.link || '/');
                        }}
                      >
                        <span className="notification-severity" />
                        <span>
                          <strong>{alert.title}</strong>
                          <small>{alert.message}</small>
                        </span>
                        <ArrowRight size={14} />
                      </button>
                    ))}
                  </div>
                  <NavLink to="/cartera" className="notification-footer" onClick={() => setNotificationsOpen(false)}>
                    Ver cartera y vencimientos <ChevronRight size={14} />
                  </NavLink>
                </div>
              )}
            </div>
            <div className="profile-menu-anchor" ref={userRef}>
              <button type="button" className="topbar-profile" onClick={() => setUserMenuOpen((value) => !value)}>
                <Avatar name={user?.full_name} size={34} tone={1} />
                <span>
                  <strong>{user?.full_name?.split(' ')[0]}</strong>
                  <small>{roleLabel(user?.role)}</small>
                </span>
              </button>
              {userMenuOpen && (
                <div className="topbar-user-menu">
                  <div className="topbar-user-summary">
                    <Avatar name={user?.full_name} size={40} tone={2} />
                    <div><strong>{user?.full_name}</strong><span>{user?.username} · {roleLabel(user?.role)}</span></div>
                  </div>
                  <button type="button" onClick={() => { setPasswordOpen(true); setUserMenuOpen(false); }}>
                    <ShieldCheck size={16} /> Seguridad de la cuenta
                  </button>
                  <button type="button" onClick={handleLogout} className="danger"><LogOut size={16} /> Cerrar sesión</button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="app-content">
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>CementoControl v1.0 · <strong>{business?.name}</strong></span>
          <span>Zona horaria Colombia (UTC−5) · Pesos colombianos</span>
        </footer>
      </div>

      <nav className="mobile-nav" aria-label="Navegación móvil">
        {mobileItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => classNames('mobile-nav-link', isActive && 'active')}>
            <item.icon size={20} />
            <span>{item.label.split(' ')[0]}</span>
          </NavLink>
        ))}
        <button type="button" className={classNames('mobile-nav-link', drawerOpen && 'active')} onClick={() => setDrawerOpen(true)}>
          <Menu size={20} />
          <span>Más</span>
        </button>
      </nav>

      {drawerOpen && (
        <div className="mobile-drawer-root" onClick={(event) => { if (event.target === event.currentTarget) setDrawerOpen(false); }}>
          <div className="mobile-drawer">
            <div className="mobile-drawer-head">
              <Logo />
              <button type="button" className="icon-button" onClick={() => setDrawerOpen(false)} aria-label="Cerrar menú">
                <X size={20} />
              </button>
            </div>
            <div className="mobile-drawer-user">
              <Avatar name={user?.full_name} size={42} tone={2} />
              <div><strong>{user?.full_name}</strong><span>{roleLabel(user?.role)}</span></div>
            </div>
            <nav className="mobile-drawer-nav">
              {navGroups.map((group) => (
                <div key={group.label}>
                  <span className="nav-group-label">{group.label}</span>
                  {group.items.map((item) => (
                    <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => classNames('drawer-link', isActive && 'active')}>
                      <item.icon size={18} /> {item.label}
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>
            <div className="mobile-drawer-footer">
              <button type="button" className="btn btn-secondary" onClick={() => { setDrawerOpen(false); setPasswordOpen(true); }}>
                <ShieldCheck size={16} /> Mi cuenta
              </button>
              <button type="button" className="btn btn-ghost danger-text" onClick={handleLogout}><LogOut size={16} /> Salir</button>
            </div>
          </div>
        </div>
      )}

      <PasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </div>
  );
}

function PasswordModal({ open, onClose }) {
  const toast = useToast();
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setForm({ current_password: '', new_password: '', confirm_password: '' }); setError(''); }
  }, [open]);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (form.new_password.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (form.new_password !== form.confirm_password) {
      setError('La confirmación no coincide con la nueva contraseña.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/password', { current_password: form.current_password, new_password: form.new_password });
      toast.success('Contraseña actualizada correctamente.');
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cambiar contraseña"
      subtitle="Actualiza tu clave de acceso personal."
      size="sm"
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" form="password-form" className="btn btn-primary" disabled={saving}>{saving ? 'Guardando…' : 'Guardar contraseña'}</button>
        </>
      )}
    >
      <form id="password-form" onSubmit={submit} className="stack-16">
        {error && <div className="inline-notice tone-danger">{error}</div>}
        <Field label="Contraseña actual" required>
          <TextInput type="password" autoComplete="current-password" value={form.current_password} onChange={(event) => setForm({ ...form, current_password: event.target.value })} required />
        </Field>
        <Field label="Nueva contraseña" required hint="Mínimo 8 caracteres.">
          <TextInput type="password" autoComplete="new-password" value={form.new_password} onChange={(event) => setForm({ ...form, new_password: event.target.value })} required />
        </Field>
        <Field label="Confirmar nueva contraseña" required>
          <TextInput type="password" autoComplete="new-password" value={form.confirm_password} onChange={(event) => setForm({ ...form, confirm_password: event.target.value })} required />
        </Field>
      </form>
    </Modal>
  );
}
