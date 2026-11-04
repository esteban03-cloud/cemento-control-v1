import { useEffect, useMemo, useState } from 'react';
import {
  Scale,
  Banknote,
  CalendarDays,
  FileBarChart,
  FileSpreadsheet,
  Landmark,
  TrendingUp
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { PageHeader, TabBar, SummaryTile, ErrorPanel, PageLoader, DownloadMenu, StatusBadge, Semaforo } from '../components/DataDisplay.jsx';
import { CashFlowChart } from '../components/Charts.jsx';
import {
  currentMonth,
  formatCurrency,
  formatPercent,
  monthLabel,
  monthOptions
} from '../utils.js';

export default function Statements() {
  const { business } = useAuth();
  const [month, setMonth] = useState(currentMonth());
  const [tab, setTab] = useState('income');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const months = useMemo(() => monthOptions(24), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.get(`/financial-statements?month=${month}`)
      .then((response) => { if (active) setData(response); })
      .catch((err) => { if (active) setError(err); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [month]);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Información financiera"
        title="Estados financieros"
        description="Estado de resultados, balance general y flujo de caja para la toma de decisiones."
        actions={(
          <>
            <label className="month-select">
              <CalendarDays size={16} />
              <select value={month} onChange={(event) => setMonth(event.target.value)}>
                {months.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <DownloadMenu
              label="Exportar informe"
              items={[
                { label: 'PDF ejecutivo', path: `/export/financial.pdf?month=${month}` },
                { label: 'Excel completo', path: `/export/financial?format=xlsx&month=${month}` }
              ]}
            />
          </>
        )}
      />

      {error && <ErrorPanel error={error} onRetry={() => setMonth(month)} />}
      {loading && !data && <PageLoader label="Preparando estados financieros⬦" />}

      {data && (
        <>
          <div className="summary-grid summary-grid-4">
            <SummaryTile label="Ingresos del período" value={formatCurrency(data.incomeStatement.lines.revenue)} icon={Banknote} hint={`Ventas facturadas · ${data.monthLabel}`} />
            <SummaryTile label="Utilidad neta" value={formatCurrency(data.incomeStatement.lines.netProfit)} icon={TrendingUp} tone={data.incomeStatement.lines.netProfit >= 0 ? 'green' : 'red'} hint={`Margen neto ${formatPercent(data.incomeStatement.margins.net)}`} />
            <SummaryTile label="Activos totales" value={formatCurrency(data.balanceSheet.assets.total)} icon={Landmark} hint={`Corte ${data.asOf}`} />
            <SummaryTile label="Patrimonio" value={formatCurrency(data.balanceSheet.equity.total)} icon={Scale} hint={`Capital + resultados acumulados`} />
          </div>

          <div className="statement-toolbar">
            <TabBar
              tabs={[
                { key: 'income', label: 'Estado de resultados', icon: <FileBarChart size={15} /> },
                { key: 'balance', label: 'Balance general', icon: <Scale size={15} /> },
                { key: 'cash', label: 'Flujo de caja', icon: <Banknote size={15} /> }
              ]}
              active={tab}
              onChange={setTab}
            />
            <div className="statement-meta">
              <StatusBadge status={data.balanceSheet.balanced ? 'Balance conciliado' : 'Revisar balance'} tone={data.balanceSheet.balanced ? 'green' : 'red'} />
              <span>{business?.name} · NIT {business?.nit}</span>
            </div>
          </div>

          {tab === 'income' && <IncomeStatement data={data} />}
          {tab === 'balance' && <BalanceSheet data={data} />}
          {tab === 'cash' && <CashFlow data={data} />}
        </>
      )}
    </div>
  );
}

function StatementHeader({ title, period, subtitle }) {
  return (
    <div className="statement-header">
      <div>
        <span className="eyebrow">{period}</span>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <span className="statement-currency">Cifras en COP</span>
    </div>
  );
}

function StatementRow({ label, value, strong, negative, indent, tone }) {
  return (
    <div className={`statement-row ${strong ? 'strong' : ''} ${indent ? 'indented' : ''} ${tone ? `row-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{negative ? `(${formatCurrency(Math.abs(value))})` : formatCurrency(value)}</strong>
    </div>
  );
}

function IncomeStatement({ data }) {
  const lines = data.incomeStatement.lines;
  return (
    <div className="statement-card">
      <StatementHeader
        period={data.monthLabel}
        title="Estado de resultados"
        subtitle="Resultados acumulados del período, calculados sobre ventas facturadas y costos devengados."
      />
      <div className="statement-body">
        <section>
          <h3>Ingresos operacionales</h3>
          <StatementRow label="Ventas de producto y cargue" value={lines.revenue} strong />
        </section>
        <section>
          <h3>Costo de ventas</h3>
          <StatementRow label="Costo del inventario vendido" value={lines.cogs} indent negative />
          <StatementRow label="Cargue de despachos" value={lines.loading} indent negative />
          <StatementRow label="Total costo de ventas" value={lines.costOfSales} strong negative />
        </section>
        <div className="statement-subtotal">
          <StatementRow label="Utilidad bruta" value={lines.grossProfit} strong />
          <span className="statement-subtotal-note">Margen bruto {formatPercent(data.incomeStatement.margins.gross)}</span>
        </div>
        <section>
          <h3>Gastos operativos</h3>
          {lines.expenseGroups.map((group) => (
            <StatementRow key={group.category} label={group.category} value={group.amount} indent negative />
          ))}
          <StatementRow label="Total gastos operativos" value={lines.operatingExpenses} strong negative />
        </section>
        <div className="statement-result">
          <div>
            <span>Utilidad neta del período</span>
            <strong>{formatCurrency(lines.netProfit)}</strong>
          </div>
          <div className="statement-result-side">
            <Semaforo tone={lines.netProfit >= 0 ? 'green' : 'red'} label={lines.netProfit >= 0 ? 'Resultado positivo' : 'Resultado negativo'} />
            <span>Margen neto {formatPercent(data.incomeStatement.margins.net)}</span>
          </div>
        </div>
        <p className="statement-footnote">Las cifras se calculan con las ventas y compras registradas en CementoControl. Los gastos operativos provienen de la asignación de costos indirectos y del 4x1000 registrado en caja.</p>
      </div>
    </div>
  );
}

function BalanceSheet({ data }) {
  const { assets, liabilities, equity } = data.balanceSheet;
  return (
    <div className="statement-card">
      <StatementHeader
        period={`Corte al ${data.asOf}`}
        title="Balance general"
        subtitle="Situación patrimonial a la fecha de cierre del período."
      />
      <div className="balance-grid">
        <section className="balance-column">
          <h3>Activos</h3>
          <StatementRow label="Efectivo en caja" value={assets.cash} />
          <StatementRow label="Bancos" value={assets.banks} />
          <StatementRow label="Cuentas por cobrar" value={assets.accountsReceivable} />
          <StatementRow label="Inventario de producto" value={assets.inventory} />
          <div className="balance-total"><span>Total activos</span><strong>{formatCurrency(assets.total)}</strong></div>
          <div className="balance-note-card">
            <Landmark size={17} />
            <p>Los activos incluyen disponibilidad, cartera pendiente de cobro e inventario valorizado al costo promedio.</p>
          </div>
        </section>
        <section className="balance-column">
          <h3>Pasivos y patrimonio</h3>
          <StatementRow label="Cuentas por pagar" value={liabilities.accountsPayable} />
          <div className="balance-total"><span>Total pasivos</span><strong>{formatCurrency(liabilities.total)}</strong></div>
          <div className="balance-spacer" />
          <StatementRow label="Capital inicial" value={equity.capital} />
          <StatementRow label="Resultados acumulados" value={equity.retained} />
          <div className="balance-total"><span>Total patrimonio</span><strong>{formatCurrency(equity.total)}</strong></div>
          <div className="balance-check">
            <div>
              <span>Total pasivo + patrimonio</span>
              <strong>{formatCurrency(liabilities.total + equity.total)}</strong>
            </div>
            <Semaforo tone={data.balanceSheet.balanced ? 'green' : 'red'} label={data.balanceSheet.balanced ? 'Balance conciliado' : `Diferencia ${formatCurrency(data.balanceSheet.checkDifference)}`} />
          </div>
        </section>
      </div>
      <p className="statement-footnote">Los resultados acumulados incluyen la utilidad del ejercicio y el ajuste de conciliación entre las cifras de caja y las cifras devengadas. Este balance es un reporte gerencial.</p>
    </div>
  );
}

function CashFlow({ data }) {
  return (
    <div className="statement-card">
      <StatementHeader
        period={data.monthLabel}
        title="Flujo de caja"
        subtitle="Movimientos reales de efectivo y bancos durante el período."
      />
      <div className="cash-statement-summary">
        <SummaryTile label="Saldo inicial" value={formatCurrency(data.cashFlow.opening)} />
        <SummaryTile label="Total ingresos" value={formatCurrency(data.cashFlow.totalIn)} tone="green" />
        <SummaryTile label="Total egresos" value={formatCurrency(data.cashFlow.totalOut)} tone="red" />
        <SummaryTile label="Saldo final" value={formatCurrency(data.cashFlow.closing)} tone={data.cashFlow.closing >= 0 ? 'green' : 'red'} />
      </div>
      <div className="cash-statement-grid">
        <section className="cash-statement-column">
          <h3>Ingresos</h3>
          {data.cashFlow.inflows.map((row) => <StatementRow key={row.category} label={row.category} value={row.amount} />)}
          <StatementRow label="Total ingresos" value={data.cashFlow.totalIn} strong />
        </section>
        <section className="cash-statement-column">
          <h3>Egresos</h3>
          {data.cashFlow.outflows.map((row) => <StatementRow key={row.category} label={row.category} value={-row.amount} negative />)}
          <StatementRow label="Total egresos" value={-data.cashFlow.totalOut} strong negative />
        </section>
      </div>
      <div className="cash-flow-result">
        <div><span>Flujo neto</span><strong>{formatCurrency(data.cashFlow.net)}</strong></div>
        <div><span>Variación de caja</span><strong>{formatCurrency(data.cashFlow.variation)}</strong></div>
        <div><span>Saldo de cierre</span><strong>{formatCurrency(data.cashFlow.closing)}</strong></div>
      </div>
      <div className="statement-chart">
        <div className="panel-heading"><div><span className="eyebrow">Tendencia</span><h3>Ingresos y egresos · 6 meses</h3></div></div>
        <CashFlowChart months={data.trend} height={260} />
      </div>
    </div>
  );
}
