import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound, Wifi, WalletCards } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api.js';
import { BrandMark, CementIllustration } from '../components/Brand.jsx';
import { Field, TextInput } from '../components/Forms.jsx';
import { Spinner } from '../components/DataDisplay.jsx';
import { classNames, formatDate, todayISO } from '../utils.js';

const DEMO_ACCOUNTS = [
  { username: 'admin', password: 'admin123', role: 'Administrador', tone: 'amber' },
  { username: 'vendedor', password: 'venta123', role: 'Vendedor', tone: 'teal' },
  { username: 'contador', password: 'contador123', role: 'Contador', tone: 'green' }
];

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [business, setBusiness] = useState(null);
  const [form, setForm] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [year, setYear] = useState('');

  useEffect(() => {
    api.get('/public/config')
      .then((data) => {
        setBusiness(data.business);
        setYear(String(data.today || todayISO()).slice(0, 4));
      })
      .catch(() => setBusiness({ shortName: 'CementoControl', name: 'CementoControl' }));
  }, []);

  if (loading) {
    return (
      <div className="app-boot">
        <BrandMark size={52} />
        <Spinner size={24} />
        <span>Cargando CementoControl…</span>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(form.username.trim(), form.password);
      const destination = location.state?.from?.pathname || '/';
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const useDemo = (account) => {
    setForm({ username: account.username, password: account.password });
    setError('');
  };

  return (
    <div className="login-page">
      <section className="login-visual">
        <div className="login-grid" aria-hidden="true" />
        <div className="login-visual-top">
          <div className="login-brand">
            <BrandMark size={42} />
            <div>
              <strong>{business?.shortName || 'CementoControl'}</strong>
              <span>Control de ventas</span>
            </div>
          </div>
          <span className="login-year">{year || '2026'}</span>
        </div>
        <div className="login-visual-copy">
          <span className="login-kicker"><span className="live-dot" /> Operación en tiempo real</span>
          <h1>El control de tu operación, del primer bulto al último peso.</h1>
          <p>Ventas, compras, inventario y cartera conectados en un solo tablero para tomar decisiones con datos, no con suposiciones.</p>
          <div className="login-features">
            <span><WalletCards size={16} /> Caja y márgenes al día</span>
            <span><ShieldCheck size={16} /> Cartera bajo control</span>
            <span><Wifi size={16} /> Listo para PC y móvil</span>
          </div>
        </div>
        <div className="login-visual-art">
          <CementIllustration />
        </div>
        <div className="login-visual-footer">
          <span>Diseñado para distribuidores y ferreterías</span>
          <span>Bogotá · Colombia</span>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-panel-inner">
          <div className="login-mobile-brand">
            <BrandMark size={34} />
            <strong>{business?.shortName || 'CementoControl'}</strong>
          </div>
          <div className="login-heading">
            <span className="eyebrow">Acceso seguro</span>
            <h2>Bienvenido de nuevo</h2>
            <p>Ingresa con tu usuario para administrar la operación de {business?.shortName || 'tu negocio'}.</p>
          </div>
          <form onSubmit={submit} className="login-form">
            {error && <div className="login-error">{error}</div>}
            <Field label="Usuario">
              <div className="input-with-icon">
                <UserRound size={17} />
                <TextInput
                  value={form.username}
                  onChange={(event) => setForm({ ...form, username: event.target.value })}
                  placeholder="Ej. admin"
                  autoComplete="username"
                  autoCapitalize="none"
                  required
                />
              </div>
            </Field>
            <Field label="Contraseña">
              <div className="input-with-icon">
                <LockKeyhole size={17} />
                <TextInput
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  placeholder="Tu contraseña"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="input-icon-button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </Field>
            <button type="submit" className="btn btn-primary btn-login" disabled={submitting}>
              {submitting ? <><Spinner size={18} /> Ingresando…</> : <>Ingresar al tablero <ArrowRight size={17} /></>}
            </button>
          </form>

          <div className="demo-box">
            <div className="demo-box-head">
              <span className="eyebrow">Ambiente de demostración</span>
              <span className="demo-badge">Datos de prueba</span>
            </div>
            <p>Prueba el sistema con cualquiera de estos perfiles. La contraseña se completa automáticamente.</p>
            <div className="demo-accounts">
              {DEMO_ACCOUNTS.map((account) => (
                <button type="button" key={account.username} className="demo-account" onClick={() => useDemo(account)}>
                  <span className={classNames('demo-avatar', `tone-${account.tone}`)}>{account.role[0]}</span>
                  <span>
                    <strong>{account.role}</strong>
                    <small>{account.username} / {account.password}</small>
                  </span>
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
          </div>

          <div className="login-footnote">
            <ShieldCheck size={15} />
            <span>Acceso con roles y sesión protegida. Datos alojados en tu instalación.</span>
          </div>
          <div className="login-footer">
            <span>© {year || '2026'} {business?.name || 'CementoControl'}</span>
            <span>{formatDate(todayISO(), { long: true })}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
