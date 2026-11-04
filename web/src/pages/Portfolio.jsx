import { useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  HandCoins,
  RefreshCw,
  WalletCards
} from 'lucide-react';
import { api } from '../api.js';
import { useToast } from '../context/ToastContext.jsx';
import { PageHeader, SummaryTile, ErrorPanel, PageLoader, Semaforo, StatusBadge, ProgressBar } from '../components/DataDisplay.jsx';
import { AgingChart, ProjectionChart } from '../components/Charts.jsx';
import {
  formatCurrency,
  formatCurrencyCompact,
  formatDate,
  formatNumber,
  formatPercent
} from '../utils.js';

export default function Portfolio() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.get('/portfolio'));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading && !data) return <div className="page"><PageLoader label="Consolidando cartera…" /></div>;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Cartera consolidada"
        title="Cartera y flujo de caja"
        description="Antigüedad de saldos, concentración por tercero y proyección de liquidez para las próximas 8 semanas."
        actions={<button type="button" className="btn btn-secondary" onClick={load}><RefreshCw size={16} /> Actualizar</button>}
      >
        <div className="dashboard-meta"><span>Corte al {formatDate(data?.asOf)}</span><span>Incluye cartera vencida y vigente</span></div>
      </PageHeader>

      {error && <ErrorPanel error={error} onRetry={load} />}

      {data && (
        <>
          <div className="summary-grid summary-grid-4">
            <SummaryTile label="Por cobrar" value={formatCurrency(data.totalAR)} icon={HandCoins} hint={`${formatNumber(data.counts.receivables)} facturas abiertas`} />
            <SummaryTile label="Por pagar" value={formatCurrency(data.totalAP)} icon={Banknote} hint={`${formatNumber(data.counts.payables)} obligaciones abiertas`} />
            <SummaryTile label="Caja disponible" value={formatCurrency(data.cash.total)} icon={WalletCards} hint={`Caja ${formatCurrencyCompact(data.cash.cash)} · Bancos ${formatCurrencyCompact(data.cash.bank)}`} />
            <SummaryTile label="Capital de trabajo neto" value={formatCurrency(data.netWorkingCapital)} icon={data.netWorkingCapital >= 0 ? ArrowUpRight : ArrowDownLeft} tone={data.netWorkingCapital >= 0 ? 'green' : 'red'} hint="CxC + caja − CxP" />
          </div>

          <div className="portfolio-alert-grid">
            <div className="panel portfolio-kpi">
              <span className="eyebrow">Cartera vencida</span>
              <strong>{formatCurrency(data.overdueAR)}</strong>
              <Semaforo tone={data.overdueAR > 0 ? 'red' : 'green'} label={data.overdueAR > 0 ? 'Gestionar cobro' : 'Sin vencimientos'} />
              <p>Facturas con fecha de vencimiento superada y saldo pendiente.</p>
            </div>
            <div className="panel portfolio-kpi">
              <span className="eyebrow">Pagos vencidos</span>
              <strong>{formatCurrency(data.overdueAP)}</strong>
              <Semaforo tone={data.overdueAP > 0 ? 'yellow' : 'green'} label={data.overdueAP > 0 ? 'Priorizar pago' : 'Al día'} />
              <p>Obligaciones que ya superaron su fecha de pago.</p>
            </div>
            <div className="panel portfolio-projection-summary">
              <div>
                <span className="eyebrow">Proyección a 8 semanas</span>
                <strong>{formatCurrency(data.projection[data.projection.length - 1]?.cumulative || data.cash.total)}</strong>
                <p>Caja estimada al final del horizonte si se cumplen los vencimientos.</p>
              </div>
              <div className="projection-mini-stats">
                <div><span>Cobros estimados</span><strong>{formatCurrencyCompact(data.projection.reduce((sum, week) => sum + week.collect, 0))}</strong></div>
                <div><span>Pagos estimados</span><strong>{formatCurrencyCompact(data.projection.reduce((sum, week) => sum + week.pay, 0))}</strong></div>
              </div>
            </div>
          </div>

          <div className="dashboard-charts">
            <div className="panel chart-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Riesgo de cartera</span>
                  <h3>Antigüedad de saldos</h3>
                </div>
                <span className="panel-meta">CxC vs. CxP</span>
              </div>
              <AgingChart labels={data.aging.labels} receivable={data.aging.receivable} payable={data.aging.payable} height={310} />
            </div>
            <div className="panel chart-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Liquidez</span>
                  <h3>Flujo de caja proyectado</h3>
                </div>
                <span className="panel-meta">Próximas 8 semanas</span>
              </div>
              <ProjectionChart projection={data.projection} height={310} />
            </div>
          </div>

          <div className="dashboard-tables">
            <div className="panel">
              <div className="panel-heading">
                <div><span className="eyebrow">Concentración</span><h3>Principales deudores</h3></div>
                <span className="panel-meta">{formatCurrencyCompact(data.totalAR)} en total</span>
              </div>
              <div className="mini-table-scroll">
                <table className="mini-table">
                  <thead><tr><th>Cliente</th><th className="align-right">Saldo</th><th className="align-right">Vencido</th><th>Participación</th></tr></thead>
                  <tbody>
                    {data.topCustomers.map((row) => (
                      <tr key={row.name}>
                        <td><div className="table-primary">{row.name}</div><small>{row.invoices} factura(s) · {row.phone || 'Sin contacto'}</small></td>
                        <td className="align-right"><strong>{formatCurrency(row.balance)}</strong></td>
                        <td className="align-right text-danger">{row.overdue ? formatCurrency(row.overdue) : '—'}</td>
                        <td><ProgressBar value={formatPercent(row.balance / (data.totalAR || 1) * 100)} tone="teal" label={formatPercent(row.balance / (data.totalAR || 1) * 100)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="panel">
              <div className="panel-heading">
                <div><span className="eyebrow">Compromisos</span><h3>Principales acreedores</h3></div>
                <span className="panel-meta">{formatCurrencyCompact(data.totalAP)} en total</span>
              </div>
              <div className="mini-table-scroll">
                <table className="mini-table">
                  <thead><tr><th>Proveedor</th><th className="align-right">Saldo</th><th className="align-right">Vencido</th><th>Participación</th></tr></thead>
                  <tbody>
                    {data.topProviders.map((row) => (
                      <tr key={row.name}>
                        <td><div className="table-primary">{row.name}</div><small>{row.items} obligación(es)</small></td>
                        <td className="align-right"><strong>{formatCurrency(row.balance)}</strong></td>
                        <td className="align-right text-danger">{row.overdue ? formatCurrency(row.overdue) : '—'}</td>
                        <td><ProgressBar value={formatPercent(row.balance / (data.totalAP || 1) * 100)} tone="yellow" label={formatPercent(row.balance / (data.totalAP || 1) * 100)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="panel projection-table-panel">
            <div className="panel-heading">
              <div><span className="eyebrow">Semana a semana</span><h3>Calendario proyectado</h3><p>Los saldos vencidos se programan en la primera semana.</p></div>
              <StatusBadge status="Escenario base" tone="blue" dot={false} />
            </div>
            <div className="mini-table-scroll">
              <table className="mini-table">
                <thead><tr><th>Semana</th><th>Rango</th><th className="align-right">Cobros</th><th className="align-right">Pagos</th><th className="align-right">Flujo neto</th><th className="align-right">Caja proyectada</th></tr></thead>
                <tbody>
                  {data.projection.map((week) => (
                    <tr key={week.week}>
                      <td><strong>Semana {week.week}</strong></td>
                      <td>{formatDate(week.start)} — {formatDate(week.end)}</td>
                      <td className="align-right text-success">+ {formatCurrency(week.collect)}</td>
                      <td className="align-right text-danger">− {formatCurrency(week.pay)}</td>
                      <td className={`align-right ${week.net >= 0 ? 'text-success' : 'text-danger'}`}><strong>{week.net >= 0 ? '+' : '−'} {formatCurrency(Math.abs(week.net))}</strong></td>
                      <td className="align-right"><strong>{formatCurrency(week.cumulative)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="footnote-box">
            <CalendarClock size={15} />
            <span>Proyección de gestión basada en vencimientos de cartera. Los saldos vencidos se estiman en la primera semana; los pagos y cobros posteriores a 8 semanas no se incluyen.</span>
          </div>
        </>
      )}
    </div>
  );
}
