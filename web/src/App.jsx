import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from './context/AuthContext.jsx';
import { AppLayout } from './components/AppLayout.jsx';
import { Spinner } from './components/DataDisplay.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Sales from './pages/Sales.jsx';
import Purchases from './pages/Purchases.jsx';
import Cash from './pages/Cash.jsx';
import Receivables from './pages/Receivables.jsx';
import Payables from './pages/Payables.jsx';
import Portfolio from './pages/Portfolio.jsx';
import Inventory from './pages/Inventory.jsx';
import Costing from './pages/Costing.jsx';
import CostAllocation from './pages/CostAllocation.jsx';
import Statements from './pages/Statements.jsx';
import DataCenter from './pages/DataCenter.jsx';
import Settings from './pages/Settings.jsx';
import FinanceExtra from './pages/FinanceExtra.jsx';
import NotFound from './pages/NotFound.jsx';

function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="app-boot">
        <Spinner size={26} />
        <span>Verificando sesión…</span>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <AppLayout />;
}

function AccessDenied() {
  const navigate = useNavigate();
  return (
    <div className="access-denied">
      <span><ShieldAlert size={28} /></span>
      <h1>Acceso restringido</h1>
      <p>Tu rol no tiene permisos para ver esta sección. Si necesitas acceso, contacta al administrador.</p>
      <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>Volver al panel</button>
    </div>
  );
}

function PermissionRoute({ permission, adminOnly = false, children }) {
  const { user, hasPermission } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== 'administrador') return <AccessDenied />;
  if (permission && !hasPermission(permission)) return <AccessDenied />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route index element={<PermissionRoute permission="dashboard:view"><Dashboard /></PermissionRoute>} />
        <Route path="ventas" element={<PermissionRoute permission="ventas:view"><Sales /></PermissionRoute>} />
        <Route path="compras" element={<PermissionRoute permission="compras:view"><Purchases /></PermissionRoute>} />
        <Route path="caja" element={<PermissionRoute permission="caja:view"><Cash /></PermissionRoute>} />
        <Route path="prestamos" element={<PermissionRoute permission="prestamos:view"><FinanceExtra mode="loans" /></PermissionRoute>} />
        <Route path="cotizaciones" element={<PermissionRoute permission="cotizaciones:view"><FinanceExtra mode="quotes" /></PermissionRoute>} />
        <Route path="deudas" element={<PermissionRoute permission="deudas:view"><FinanceExtra mode="debts" /></PermissionRoute>} />
        <Route path="cxc" element={<PermissionRoute permission="cxc:view"><Receivables /></PermissionRoute>} />
        <Route path="cxp" element={<PermissionRoute permission="cxp:view"><Payables /></PermissionRoute>} />
        <Route path="cartera" element={<PermissionRoute permission="cartera:view"><Portfolio /></PermissionRoute>} />
        <Route path="inventario" element={<PermissionRoute permission="inventario:view"><Inventory /></PermissionRoute>} />
        <Route path="costeo" element={<PermissionRoute permission="costos:view"><Costing /></PermissionRoute>} />
        <Route path="costos" element={<PermissionRoute permission="costos:view"><CostAllocation /></PermissionRoute>} />
        <Route path="estados" element={<PermissionRoute permission="estados:view"><Statements /></PermissionRoute>} />
        <Route path="datos" element={<PermissionRoute permission="reportes:export"><DataCenter /></PermissionRoute>} />
        <Route path="configuracion" element={<PermissionRoute adminOnly><Settings /></PermissionRoute>} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
