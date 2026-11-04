import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Boxes,
  CalendarDays,
  ChartPie,
  CircleDollarSign,
  Clock3,
  Coins,
  Gauge,
  HandCoins,
  PackageCheck,
  Percent,
  Plus,
  RefreshCw,
  Scale,
  ShoppingCart,
  Target,
  TrendingUp,
  Users,
  WalletCards
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { PageHeader, Semaforo, StatusBadge, ErrorPanel, Skeleton, ProgressBar, Avatar } from '../components/DataDisplay.jsx';
import { KpiCard } from '../components/KpiCard.jsx';
import { RevenueProfitChart, CostBreakdownChart } from '../components/Charts.jsx';
import {
  classNames,
  currentMonth,
  formatCurrency,
  formatCurrencyCompact,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  greeting,
  monthOptions
} from '../utils.js';

const STATUS_TEXT = {
  green: 'Saludable',
  yellow: 'Atención',
  red: 'Crítico',
  neutral: 'Sin datos'
};

export default function Dashboard() {
  const { user, hasPermission } = useAuth();
  const [periodType, setPeriodType] = useState('month');
  const [periodValue, setPeriodValue] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchDashboard = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ periodType, value: periodValue });
      const response = await api.get(`/dashboard?${params.toString()}`);
      setData(response);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [periodType, periodValue]);

  const kpis = data?.kpis;
  const topAlert = data?.alerts?.find((alert) => alert.severity === 'red') || data?.alerts?.[0];
  const criticalCount = data?.alerts?.filter((alert) => alert.severity === 'red').length || 0;
  const optionKey = `${periodType}s`;
  const periodChoiceList = data?.periodOptions?.[optionKey]?.length
    ? data.periodOptions[optionKey]
    : (periodType === 'month' ? monthOptions(18) : []);
  const comparisonNoun = data?.period?.type === 'year' ? 'año' : data?.period?.type === 'week' ? 'semana' : 'mes';

  const changePeriodType = (nextType) => {
    const list = data?.periodOptions?.[`${nextType}s`] || [];
    const currentOption = list.find((option) => option.current) || list[0];
    const fallback = nextType === 'year' ? currentMonth().slice(0, 4) : currentMonth();
    setPeriodType(nextType);
    setPeriodValue(currentOption?.value || fallback);
  };

  return (
    <div className="page dashboard-page">
      <PageHeader
        eyebrow={`${greeting()}, ${user?.full_name?.split(' ')[0] || ''}`}
        title="Panel de control"
        description="Una lectura completa de la operación: ventas, caja, cartera e inventario en un solo lugar."
        actions={(
          <>
            <div className="period-picker">
              <div className="period-type-switch" role="group" aria-label="Tipo de período">
                {[
                  ['month', 'Mes'],
                  ['week', 'Semana'],
                  ['year', 'Año']
                ].map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={classNames('period-type-button', periodType === value && 'active')}
                    onClick={() => changePeriodType(value)}
                    aria-pressed={periodType === value}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="month-select">
                <CalendarDays size={16} />
                <select value={periodValue} onChange={(event) => setPeriodValue(event.target.value)} aria-label="Seleccionar período">
                  {periodChoiceList.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => fetchDashboard(true)} disabled={refreshing}>
              <RefreshCw size={16} className={refreshing ? 'spin' : ''} />
              {refreshing ? 'Actualizando' : 'Actualizar'}
            </button>
          </>
        )}
      >
        <div className="dashboard-meta">
          <span><span className="live-dot" /> Datos en tiempo real</span>
          {data?.generatedAt && <span>Actualizado {formatDateTime(data.generatedAt)}</span>}
          {data?.period && (
            <span className="period-range">
              {data.period.label}
              {data.period.dataStart !== data.period.start || data.period.dataEnd !== data.period.end
                ? ` · ${formatDate(data.period.dataStart)} — ${formatDate(data.period.dataEnd)}`
                : ''}
            </span>
          )}
        </div>
      </PageHeader>

      {error && <ErrorPanel error={error} onRetry={() => fetchDashboard()} />}

      {topAlert && !loading && (
        <div className={classNames('attention-banner', `attention-${topAlert.severity}`)}>
          <span className="attention-icon"><AlertTriangle size={19} /></span>
          <div>
            <strong>{criticalCount > 0 ? `${criticalCount} asunto${criticalCount === 1 ? '' : 's'} requiere${criticalCount === 1 ? '' : 'n'} tu atención` : 'Revisión recomendada'}</strong>
            <span>{topAlert.title} · {topAlert.message}</span>
          </div>
          <Link to={topAlert.link || '/'} className="attention-link">Revisar <ArrowRight size={15} /></Link>
        </div>
      )}

      {loading && !data && <DashboardSkeleton />}

      {data && (
        <>
          <section className="hero-kpis" aria-label="Indicadores principales">
            <KpiCard
              label="Ventas del período"
              value={formatCurrency(data.summary.revenue)}
              status={kpis.salesGrowth.status}
              statusText={kpis.salesGrowth.value >= 0 ? `${formatPercent(kpis.salesGrowth.value)} vs. ${comparisonNoun} anterior` : `${formatPercent(Math.abs(kpis.salesGrowth.value))} de caída`}
              detail={`${formatNumber(data.summary.saleCount)} facturas · ${formatNumber(data.summary.units)} bultos`}
              formula={kpis.salesGrowth.formula}
              action={kpis.salesGrowth.action}
              icon={TrendingUp}
              variant="dark"
              trend={kpis.salesGrowth.value}
              sparkline={data.chart.sales}
              className="hero-kpi"
            />
            <KpiCard
              label="Efectivo + bancos"
              value={formatCurrency(kpis.cash.value)}
              status={kpis.cash.status}
              detail={`Caja ${formatCurrencyCompact(kpis.cash.cash)} · Bancos ${formatCurrencyCompact(kpis.cash.bank)}`}
              formula={kpis.cash.formula}
              action={kpis.cash.action}
              icon={WalletCards}
              sparkline={data.chart.months.map((entry) => entry.cashIncome - entry.cashExpense)}
              trendLabel={kpis.cash.coverageDays !== null ? `${formatNumber(kpis.cash.coverageDays)} días de cobertura` : undefined}
              trend={undefined}
            />
            <KpiCard
              label="Utilidad del mes"
              value={formatCurrency(kpis.monthlyProfit.value)}
              status={kpis.monthlyProfit.status}
              detail={`Margen neto ${formatPercent(kpis.netMargin.value)} · ${formatCurrencyCompact(kpis.monthlyProfit.previous)} el período anterior`}
              formula={kpis.monthlyProfit.formula}
              action={kpis.monthlyProfit.action}
              icon={CircleDollarSign}
              trend={kpis.monthlyProfit.change}
              sparkline={data.chart.profit}
            />
            <KpiCard
              label="Cartera vencida"
              value={formatCurrency(kpis.overdueAR.value)}
              status={kpis.overdueAR.status}
              statusText={`${formatPercent(kpis.overdueAR.ratio)} de las ventas`}
              detail={`${formatNumber(kpis.overdueAR.count)} factura${kpis.overdueAR.count === 1 ? '' : 's'} con saldo vencido`}
              formula={kpis.overdueAR.formula}
              action={kpis.overdueAR.action}
              icon={HandCoins}
              sparkline={data.chart.months.map((entry, index) => entry.sales - entry.profit * 2 + index)}
              sparklineTone="red"
            />
          </section>

          <section className="dashboard-section">
            <div className="section-heading-inline">
              <div>
                <span className="eyebrow">Salud del negocio</span>
                <h2>Indicadores para decidir hoy</h2>
              </div>
              <span className="section-note">Semáforos configurables desde Ajustes</span>
            </div>
            <div className="kpi-grid">
              <KpiCard
                label={`Ventas vs. ${comparisonNoun} anterior`}
                value={formatPercent(kpis.monthVsPrevious.value)}
                status={kpis.monthVsPrevious.status}
                statusText={STATUS_TEXT[kpis.monthVsPrevious.status]}
                detail={`${formatCurrencyCompact(kpis.monthVsPrevious.current)} este mes · ${formatCurrencyCompact(kpis.monthVsPrevious.previous)} anterior`}
                formula={kpis.monthVsPrevious.formula}
                action={kpis.monthVsPrevious.action}
                icon={TrendingUp}
              />
              <KpiCard
                label="Margen por producto"
                value={formatPercent(kpis.productMargin.value)}
                status={kpis.productMargin.status}
                detail={`${kpis.productMargin.negativeCount} producto(s) con pérdida · ${kpis.productMargin.lowCount} bajo la meta`}
                formula={kpis.productMargin.formula}
                action={kpis.productMargin.action}
                icon={Percent}
              />
              <KpiCard
                label="Días de caja"
                value={kpis.cashDays.value === null ? '—' : `${formatNumber(kpis.cashDays.value)} días`}
                status={kpis.cashDays.status}
                detail="Cobertura de los egresos operativos con el efectivo disponible."
                formula={kpis.cashDays.formula}
                action={kpis.cashDays.action}
                icon={Clock3}
              />
              <KpiCard
                label="CxP próximas 15 días"
                value={formatCurrency(kpis.upcomingAP.value)}
                status={kpis.upcomingAP.status}
                detail={`${formatNumber(kpis.upcomingAP.count)} obligación(es) por pagar · Caja ${formatCurrencyCompact(kpis.upcomingAP.cash)}`}
                formula={kpis.upcomingAP.formula}
                action={kpis.upcomingAP.action}
                icon={Banknote}
              />
              <KpiCard
                label="Punto de equilibrio"
                value={kpis.breakEven.units === null ? '—' : `${formatNumber(kpis.breakEven.units)} bultos`}
                status={kpis.breakEven.status}
                detail={`${formatNumber(kpis.breakEven.currentUnits)} bultos vendidos · Costos fijos ${formatCurrencyCompact(kpis.breakEven.fixedCosts)}`}
                formula={kpis.breakEven.formula}
                action={kpis.breakEven.action}
                icon={Target}
              />
              <KpiCard
                label="Rentabilidad sobre ventas"
                value={formatPercent(kpis.netMargin.value)}
                status={kpis.netMargin.status}
                detail={`Utilidad neta de ${formatCurrencyCompact(kpis.monthlyProfit.value)} sobre ventas del período`}
                formula={kpis.netMargin.formula}
                action={kpis.netMargin.action}
                icon={Gauge}
              />
              <KpiCard
                label="Valor del inventario"
                value={formatCurrency(kpis.inventoryValue.value)}
                status={kpis.inventoryValue.status}
                detail={`${formatNumber(kpis.inventoryValue.units)} bultos · ${kpis.inventoryValue.coverageMonths === null ? 'sin histórico' : `${formatNumber(kpis.inventoryValue.coverageMonths, 1)} meses de venta`}`}
                formula={kpis.inventoryValue.formula}
                action={kpis.inventoryValue.action}
                icon={Boxes}
              />
              <KpiCard
                label="Utilidad acumulada del año"
                value={formatCurrencyCompact(kpis.ytdProfit.value)}
                status={kpis.ytdProfit.status}
                detail={`Resultado acumulado al ${formatDate(data.period.dataEnd)}`}
                formula={kpis.ytdProfit.formula}
                action={kpis.ytdProfit.action}
                icon={Coins}
              />
              <KpiCard
                label="Pedido económico · EOQ"
                value={`${formatNumber(kpis.eoq.redCount)} alerta${kpis.eoq.redCount === 1 ? '' : 's'}`}
                status={kpis.eoq.status}
                statusText={kpis.eoq.redCount > 0 ? `${kpis.eoq.redCount} crítico${kpis.eoq.redCount === 1 ? '' : 's'}` : `${kpis.eoq.yellowCount} en vigilancia`}
                detail={`${formatNumber(kpis.eoq.products?.length || 0)} productos analizados con demanda de 90 días`}
                formula={kpis.eoq.formula}
                action={kpis.eoq.action}
                icon={ShoppingCart}
              />
              <KpiCard
                label="Rotación del inventario"
                value={kpis.inventoryValue.coverageMonths === null ? '—' : `${formatNumber(kpis.inventoryValue.coverageMonths, 1)} meses`}
                status={kpis.inventoryValue.status === 'red' ? 'red' : kpis.inventoryValue.coverageMonths !== null && kpis.inventoryValue.coverageMonths > 2 ? 'yellow' : 'green'}
                detail="Inventario actual medido contra el costo promedio de los últimos 3 meses."
                formula="Valor del inventario ÷ costo de ventas mensual promedio"
                action={kpis.inventoryValue.action}
                icon={PackageCheck}
              />
            </div>
          </section>

          <section className="dashboard-charts">
            <div className="panel chart-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Tendencia</span>
                  <h3>Ventas y utilidad · {data.chart.title.toLowerCase()}</h3>
                </div>
                <div className="panel-legend-note">
                  <span><i className="legend-dot amber" /> Ventas</span>
                  <span><i className="legend-dot teal" /> Utilidad</span>
                </div>
              </div>
              <RevenueProfitChart months={data.chart.months} height={320} />
            </div>
            <div className="panel chart-panel cost-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Estructura</span>
                  <h3>Participación de costos</h3>
                </div>
                <Semaforo tone={kpis.costShareKpi.status} label={`Material ${formatPercent(kpis.costShareKpi.value)}`} />
              </div>
              <CostBreakdownChart rows={data.tables.costShare} total={data.tables.costShareTotal} height={270} />
              <div className="cost-mini-list">
                {data.tables.costShare.slice(0, 4).map((row) => (
                  <div key={row.key}>
                    <span><i style={{ backgroundColor: row.color }} /> {row.label}</span>
                    <strong>{formatPercent(row.share)}</strong>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="dashboard-tables">
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Productos</span>
                  <h3>Ventas por producto</h3>
                </div>
                <span className="panel-meta">{formatPercent(kpis.productMargin.value)} margen promedio</span>
              </div>
              <div className="mini-table-scroll">
                <table className="mini-table">
                  <thead>
                    <tr><th>Producto</th><th className="align-right">Bolsas</th><th className="align-right">Ventas</th><th>Margen</th><th>Estado</th></tr>
                  </thead>
                  <tbody>
                    {data.tables.salesByProduct.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <div className="table-primary">{row.name}</div>
                          <small>{row.code} · {formatPercent(row.share)} participación</small>
                        </td>
                        <td className="align-right">{formatNumber(row.quantity)}</td>
                        <td className="align-right"><strong>{formatCurrencyCompact(row.product_revenue)}</strong></td>
                        <td>
                          <div className="margin-cell">
                            <span>{formatPercent(row.margin)}</span>
                            <ProgressBar value={Math.max(0, row.margin)} tone={row.status === 'red' ? 'red' : row.status === 'yellow' ? 'yellow' : 'green'} />
                          </div>
                        </td>
                        <td><Semaforo tone={row.status} label={row.status === 'green' ? 'Sano' : row.status === 'yellow' ? 'Vigilar' : 'Revisar'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Concentración</span>
                  <h3>Ventas por cliente</h3>
                </div>
                <Semaforo tone={kpis.salesByCustomerKpi.status} label={`Mayor ${formatPercent(kpis.salesByCustomerKpi.value)}`} />
              </div>
              <div className="mini-table-scroll">
                <table className="mini-table">
                  <thead>
                    <tr><th>Cliente</th><th className="align-right">Ventas</th><th>Participación</th><th>Estado</th></tr>
                  </thead>
                  <tbody>
                    {data.tables.salesByCustomer.slice(0, 6).map((row, index) => (
                      <tr key={row.id}>
                        <td>
                          <div className="person-cell">
                            <Avatar name={row.name} size={28} tone={index} />
                            <div>
                              <strong className="table-primary">{row.name}</strong>
                              <small>{formatNumber(row.sale_count)} facturas</small>
                            </div>
                          </div>
                        </td>
                        <td className="align-right"><strong>{formatCurrencyCompact(row.revenue)}</strong></td>
                        <td><ProgressBar value={row.share} tone={row.status === 'red' ? 'red' : row.status === 'yellow' ? 'yellow' : 'teal'} label={formatPercent(row.share)} /></td>
                        <td><Semaforo tone={row.status} showLabel={false} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="panel eoq-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Política de compra</span>
                <h3>Inventario y EOQ</h3>
                <p>La cantidad económica de pedido equilibra el costo de pedir con el costo de mantener inventario. Cada semáforo evalúa stock, frecuencia de pedido, costo total y faltantes.</p>
              </div>
              <span className="panel-meta">{kpis.eoq.redCount} crítico(s) · {kpis.eoq.yellowCount} por vigilar</span>
            </div>
            <div className="mini-table-scroll">
              <table className="mini-table eoq-table">
                <thead>
                  <tr><th>Producto</th><th className="align-right">Stock actual</th><th className="align-right">EOQ</th><th>Stock / EOQ</th><th>Pedidos/mes</th><th>Costo vs. óptimo</th><th>Faltantes</th><th>Acción sugerida</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {data.tables.eoq.map((row) => (
                    <tr key={row.id}>
                      <td><div className="table-primary">{row.name}</div><small>{row.code}</small></td>
                      <td className="align-right">{formatNumber(row.stock)}</td>
                      <td className="align-right">{formatNumber(row.eoq)}</td>
                      <td><Semaforo tone={row.stock_status} label={formatPercent(row.stock_ratio)} /></td>
                      <td><Semaforo tone={row.order_status} label={`${formatNumber(row.monthly_orders, 1)} / ${formatNumber(row.optimal_monthly_orders, 1)}`} /></td>
                      <td><Semaforo tone={row.cost_status} label={row.excess_cost_pct === null ? 'Sin datos' : formatPercent(row.excess_cost_pct)} /></td>
                      <td><Semaforo tone={row.stockout_days > 2 ? 'red' : row.stockout_days > 0 ? 'yellow' : 'green'} label={`${formatNumber(row.stockout_days)} d`} /></td>
                      <td className="action-cell-copy">{row.action}</td>
                      <td><Semaforo tone={row.status} showLabel={false} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className="eoq-guide">
              <summary>Guía de acciones según la situación</summary>
              <div className="eoq-guide-grid">
                <div><strong>Stock muy bajo</strong><span>Pedir ya, aunque el flete cueste más.</span></div>
                <div><strong>Stock muy alto</strong><span>No pedir: usar existencias y ofrecer descuento por volumen.</span></div>
                <div><strong>Muchos pedidos pequeños</strong><span>Agrupar pedidos y negociar un flete fijo.</span></div>
                <div><strong>Pocos pedidos grandes</strong><span>Revisar costo de bodega y riesgo de daño.</span></div>
                <div><strong>El proveedor tarda</strong><span>Aumentar el stock de seguridad.</span></div>
                <div><strong>El precio sube</strong><span>Adelantar compra si el ahorro supera el costo de bodega.</span></div>
              </div>
            </details>
          </section>

          <section className="quick-actions">
            <div>
              <span className="eyebrow">Atajos</span>
              <h3>¿Qué quieres registrar?</h3>
            </div>
            <div className="quick-action-buttons">
              {hasPermission('ventas:write') && <Link to="/ventas" className="quick-action"><ReceiptIcon /><span><strong>Nueva venta</strong><small>Factura y entrega</small></span><ArrowRight size={15} /></Link>}
              {hasPermission('compras:write') && <Link to="/compras" className="quick-action"><ShoppingCart size={18} /><span><strong>Nueva compra</strong><small>Entrada de inventario</small></span><ArrowRight size={15} /></Link>}
              {hasPermission('caja:write') && <Link to="/caja" className="quick-action"><WalletCards size={18} /><span><strong>Movimiento de caja</strong><small>Ingreso o egreso manual</small></span><ArrowRight size={15} /></Link>}
              {hasPermission('cxc:pay') && <Link to="/cxc" className="quick-action"><HandCoins size={18} /><span><strong>Registrar cobro</strong><small>Abono de cartera</small></span><ArrowRight size={15} /></Link>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function ReceiptIcon() {
  return <Coins size={18} />;
}

function DashboardSkeleton() {
  return (
    <div className="dashboard-skeleton">
      <div className="hero-kpis">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="kpi-skeleton" key={index}>
            <Skeleton height={13} width="45%" />
            <Skeleton height={32} width="75%" />
            <Skeleton height={13} width="58%" />
            <Skeleton height={28} width="100%" />
          </div>
        ))}
      </div>
      <div className="skeleton-grid">
        {Array.from({ length: 8 }).map((_, index) => <div className="kpi-skeleton" key={index}><Skeleton height={13} width="48%" /><Skeleton height={26} width="68%" /><Skeleton height={12} width="80%" /></div>)}
      </div>
    </div>
  );
}
