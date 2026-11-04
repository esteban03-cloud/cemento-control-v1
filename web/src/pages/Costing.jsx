import { useEffect, useState } from 'react';
import { Calculator, PieChart, ReceiptText, Settings2, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { PageHeader, SummaryTile, ErrorPanel, PageLoader, StatusBadge, DownloadMenu, ProgressBar } from '../components/DataDisplay.jsx';
import { CostBreakdownChart } from '../components/Charts.jsx';
import {
  classNames,
  currentMonth,
  formatCurrency,
  formatCurrencyCompact,
  formatNumber,
  formatPercent,
  monthOptions
} from '../utils.js';

const COLORS = {
  material: '#1f6f8b',
  freight: '#e7a21c',
  unloading: '#6c8a5e',
  cargue: '#c96b4b',
  indirect: '#8b6f9e'
};

export default function Costing() {
  const { hasPermission } = useAuth();
  const [periodType, setPeriodType] = useState('month');
  const [periodValue, setPeriodValue] = useState(currentMonth());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ periodType, value: periodValue });
    api.get(`/costing?${params.toString()}`)
      .then((response) => { if (active) setData(response); })
      .catch((err) => { if (active) setError(err); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [periodType, periodValue]);

  if (loading && !data) return <div className="page"><PageLoader label="Calculando costos del período…" /></div>;

  const totals = data?.totals;
  const optionKey = `${periodType}s`;
  const periodChoiceList = data?.periodOptions?.[optionKey]?.length
    ? data.periodOptions[optionKey]
    : (periodType === 'month' ? monthOptions(18) : []);
  const changePeriodType = (nextType) => {
    const list = data?.periodOptions?.[`${nextType}s`] || [];
    const currentOption = list.find((option) => option.current) || list[0];
    const fallback = nextType === 'year' ? currentMonth().slice(0, 4) : currentMonth();
    setPeriodType(nextType);
    setPeriodValue(currentOption?.value || fallback);
  };
  const compositionRows = totals ? [
    { key: 'material', label: 'Material', amount: totals.material, color: COLORS.material },
    { key: 'freight', label: 'Flete', amount: totals.freight, color: COLORS.freight },
    { key: 'unloading', label: 'Descargue', amount: totals.unloading, color: COLORS.unloading },
    { key: 'cargue', label: 'Cargue', amount: totals.cargue, color: COLORS.cargue },
    { key: 'indirect', label: 'Indirectos', amount: totals.indirect, color: COLORS.indirect }
  ].map((row) => ({ ...row, share: totals.totalCost ? (row.amount / totals.totalCost) * 100 : 0 })) : [];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Análisis de rentabilidad"
        title="Costeo"
        description="Costo real por producto: material, flete, descargue, cargue y costos indirectos asignados."
        actions={(
          <>
            <div className="period-picker">
              <div className="period-type-switch" role="group" aria-label="Tipo de período">
                {[['month', 'Mes'], ['week', 'Semana'], ['year', 'Año']].map(([value, label]) => (
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
                <Calculator size={16} />
                <select value={periodValue} onChange={(event) => setPeriodValue(event.target.value)} aria-label="Seleccionar período">
                  {periodChoiceList.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>
            {hasPermission('reportes:export') && (
              <DownloadMenu
                label="Exportar"
                items={[
                  { label: 'Excel (.xlsx)', path: `/export/costing?format=xlsx&periodType=${periodType}&value=${encodeURIComponent(periodValue)}` },
                  { label: 'CSV (.csv)', path: `/export/costing?format=csv&periodType=${periodType}&value=${encodeURIComponent(periodValue)}` }
                ]}
              />
            )}
          </>
        )}
      >
        {data?.period && (
          <div className="dashboard-meta">
            <span>{data.period.label}</span>
            <span>{data.period.dataStart} — {data.period.dataEnd}</span>
          </div>
        )}
      </PageHeader>

      {error && <ErrorPanel error={error} onRetry={() => setPeriodValue(periodValue)} />}

      {data && (
        <>
          <div className="summary-grid summary-grid-4">
            <SummaryTile label="Ingresos del período" value={formatCurrency(totals.revenue)} icon={ReceiptText} hint={`${formatNumber(totals.quantity)} bultos vendidos`} />
            <SummaryTile label="Costo total" value={formatCurrency(totals.totalCost)} icon={Calculator} hint={`${formatPercent(totals.revenue ? totals.totalCost / totals.revenue * 100 : 0)} de las ventas`} />
            <SummaryTile label="Utilidad del período" value={formatCurrency(totals.profit)} icon={TrendingUp} tone={totals.profit >= 0 ? 'green' : 'red'} hint="Después de costos directos e indirectos" />
            <SummaryTile label="Margen neto" value={formatPercent(totals.margin)} icon={PieChart} tone={totals.margin >= 15 ? 'green' : totals.margin >= 8 ? 'amber' : 'red'} hint={`Costos indirectos ${formatCurrencyCompact(totals.indirect)}`} />
          </div>

          <div className="dashboard-charts costing-charts">
            <div className="panel chart-panel">
              <div className="panel-heading">
                <div><span className="eyebrow">Estructura del costo</span><h3>Composición del costo total</h3></div>
                <Link to="/costos" className="btn btn-small btn-secondary"><Settings2 size={14} /> Asignar costos</Link>
              </div>
              <CostBreakdownChart rows={compositionRows} total={totals.totalCost} height={285} />
            </div>
            <div className="panel cost-detail-panel">
              <div className="panel-heading"><div><span className="eyebrow">Resumen</span><h3>Del costo a la utilidad</h3></div><StatusBadge status={data.monthLabel} tone="blue" dot={false} /></div>
              <div className="cost-waterfall">
                <div><span>Ingresos</span><strong>{formatCurrency(totals.revenue)}</strong><ProgressBar value={100} tone="teal" /></div>
                <div><span>Material</span><strong>{formatCurrency(totals.material)}</strong><ProgressBar value={totals.revenue ? totals.material / totals.revenue * 100 : 0} tone="teal" /></div>
                <div><span>Flete y descargue</span><strong>{formatCurrency(totals.freight + totals.unloading)}</strong><ProgressBar value={totals.revenue ? (totals.freight + totals.unloading) / totals.revenue * 100 : 0} tone="yellow" /></div>
                <div><span>Cargue</span><strong>{formatCurrency(totals.cargue)}</strong><ProgressBar value={totals.revenue ? totals.cargue / totals.revenue * 100 : 0} tone="yellow" /></div>
                <div><span>Indirectos</span><strong>{formatCurrency(totals.indirect)}</strong><ProgressBar value={totals.revenue ? totals.indirect / totals.revenue * 100 : 0} tone="purple" /></div>
                <div className="cost-result"><span>Utilidad</span><strong>{formatCurrency(totals.profit)}</strong><span>{formatPercent(totals.margin)} margen</span></div>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div><span className="eyebrow">Producto por producto</span><h3>Costeo del período</h3><p>{data.notes}</p></div>
              <span className="panel-meta">{formatCurrencyCompact(totals.revenue)} facturados</span>
            </div>
            <div className="table-scroll">
              <table className="data-table cost-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="align-right">Cantidad</th>
                    <th className="align-right">Ingresos</th>
                    <th className="align-right">Material</th>
                    <th className="align-right">Flete</th>
                    <th className="align-right">Descargue</th>
                    <th className="align-right">Cargue</th>
                    <th className="align-right">Indirectos</th>
                    <th className="align-right">Costo total</th>
                    <th className="align-right">Utilidad</th>
                    <th className="align-right">Margen</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.product_id}>
                      <td><div className="table-primary">{row.name}</div><small>{row.code}</small></td>
                      <td className="align-right">{formatNumber(row.quantity)}</td>
                      <td className="align-right">{formatCurrency(row.revenue)}</td>
                      <td className="align-right">{formatCurrency(row.material)}</td>
                      <td className="align-right">{formatCurrency(row.freight)}</td>
                      <td className="align-right">{formatCurrency(row.unloading)}</td>
                      <td className="align-right">{formatCurrency(row.cargue)}</td>
                      <td className="align-right">{formatCurrency(row.indirect_total)}</td>
                      <td className="align-right"><strong>{formatCurrency(row.total_cost)}</strong></td>
                      <td className="align-right"><strong className={row.profit >= 0 ? 'text-success' : 'text-danger'}>{formatCurrency(row.profit)}</strong></td>
                      <td className="align-right"><span className={`margin-pill ${row.margin >= 15 ? 'green' : row.margin >= 8 ? 'yellow' : 'red'}`}>{formatPercent(row.margin)}</span></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Totales</td>
                    <td className="align-right">{formatNumber(totals.quantity)}</td>
                    <td className="align-right">{formatCurrency(totals.revenue)}</td>
                    <td className="align-right">{formatCurrency(totals.material)}</td>
                    <td className="align-right">{formatCurrency(totals.freight)}</td>
                    <td className="align-right">{formatCurrency(totals.unloading)}</td>
                    <td className="align-right">{formatCurrency(totals.cargue)}</td>
                    <td className="align-right">{formatCurrency(totals.indirect)}</td>
                    <td className="align-right">{formatCurrency(totals.totalCost)}</td>
                    <td className="align-right">{formatCurrency(totals.profit)}</td>
                    <td className="align-right">{formatPercent(totals.margin)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-heading">
              <div><span className="eyebrow">Indirectos aplicados</span><h3>Distribución de costos indirectos</h3></div>
              <span className="panel-meta">{formatCurrency(totals.indirect)} en {data.indirect.length} conceptos</span>
            </div>
            <div className="mini-table-scroll">
              <table className="mini-table">
                <thead><tr><th>Concepto</th><th>Método de asignación</th><th>Tipo</th><th className="align-right">Valor</th></tr></thead>
                <tbody>
                  {data.indirect.map((row) => (
                    <tr key={row.id}>
                      <td><div className="table-primary">{row.category}</div><small>{row.description || 'Sin descripción'}</small></td>
                      <td>{row.allocation_method === 'valor_venta' ? 'Por valor de venta' : 'Por volumen (bultos)'}</td>
                      <td><StatusBadge status={row.is_fixed ? 'Fijo' : 'Variable'} tone={row.is_fixed ? 'blue' : 'neutral'} dot={false} /></td>
                      <td className="align-right"><strong>{formatCurrency(row.amount)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
