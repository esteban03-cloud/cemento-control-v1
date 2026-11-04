import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
} from 'chart.js';
import { Bar, Chart, Doughnut, Line } from 'react-chartjs-2';
import { formatCurrency, formatCurrencyCompact, formatNumber } from '../utils.js';

ChartJS.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip
);

ChartJS.defaults.font.family = "'Manrope Variable', 'Segoe UI', sans-serif";
ChartJS.defaults.color = '#6d7580';
ChartJS.defaults.font.size = 11;

const COLORS = {
  navy: '#1d3348',
  amber: '#f5b301',
  amberSoft: 'rgba(245, 179, 1, 0.16)',
  teal: '#1f6f8b',
  tealSoft: 'rgba(31, 111, 139, 0.12)',
  green: '#28a745',
  greenSoft: 'rgba(40, 167, 69, 0.12)',
  red: '#dc3545',
  muted: '#9aa1a9',
  grid: 'rgba(17, 29, 43, 0.07)'
};

const baseTooltip = {
  backgroundColor: '#111d2b',
  titleColor: '#fffdf8',
  bodyColor: '#f6e8bc',
  borderColor: 'rgba(245, 179, 1, 0.35)',
  borderWidth: 1,
  padding: 11,
  cornerRadius: 10,
  displayColors: true,
  boxWidth: 8,
  boxHeight: 8,
  usePointStyle: true,
  titleFont: { family: "'Manrope Variable', sans-serif", size: 11, weight: '600' },
  bodyFont: { family: "'Manrope Variable', sans-serif", size: 12, weight: '600' }
};

const baseLegend = {
  position: 'bottom',
  align: 'start',
  labels: {
    usePointStyle: true,
    pointStyle: 'circle',
    boxWidth: 8,
    boxHeight: 8,
    padding: 18,
    color: '#6d7580',
    font: { size: 11, family: "'Manrope Variable', sans-serif" }
  }
};

function currencyTooltip(context) {
  const value = context.parsed?.y ?? context.parsed?.x ?? context.raw;
  if (typeof value === 'number') return ` ${formatCurrency(value)}`;
  return ` ${value}`;
}

function axisCurrency(value) {
  return formatCurrencyCompact(value);
}

const baseScales = {
  x: {
    grid: { display: false },
    border: { display: false },
    ticks: {
      color: '#79808a',
      font: { size: 10.5 },
      maxRotation: 0
    }
  },
  y: {
    beginAtZero: true,
    border: { display: false },
    grid: { color: COLORS.grid, drawTicks: false },
    ticks: {
      color: '#79808a',
      font: { size: 10.5 },
      callback: (value) => axisCurrency(value),
      padding: 8
    }
  }
};

const wrap = (children, height = 300) => (
  <div className="chart-wrap" style={{ height }}>
    {children}
  </div>
);

export function RevenueProfitChart({ months = [], height = 330 }) {
  const labels = months.map((month) => month.label);
  const data = {
    labels,
    datasets: [
      {
        type: 'bar',
        label: 'Ventas',
        data: months.map((month) => month.sales),
        backgroundColor: COLORS.amber,
        hoverBackgroundColor: '#e8a600',
        borderRadius: 6,
        maxBarThickness: 24,
        order: 2
      },
      {
        type: 'line',
        label: 'Utilidad',
        data: months.map((month) => month.profit),
        borderColor: COLORS.teal,
        backgroundColor: COLORS.tealSoft,
        borderWidth: 2.3,
        pointRadius: 2.6,
        pointHoverRadius: 5,
        pointBackgroundColor: '#fffdf8',
        pointBorderWidth: 2,
        tension: 0.35,
        fill: false,
        order: 1
      }
    ]
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: baseLegend,
      tooltip: { ...baseTooltip, callbacks: { label: currencyTooltip } }
    },
    scales: {
      ...baseScales,
      x: { ...baseScales.x, grid: { display: false } }
    }
  };
  return wrap(<Chart type="bar" data={data} options={options} />, height);
}

export function CostBreakdownChart({ rows = [], total = 0, height = 280 }) {
  if (!rows.length) return <div className="chart-empty">Sin costos registrados en el período.</div>;
  const data = {
    labels: rows.map((row) => row.label),
    datasets: [{
      data: rows.map((row) => row.amount),
      backgroundColor: rows.map((row) => row.color || COLORS.amber),
      borderColor: '#fffdf8',
      borderWidth: 3,
      hoverOffset: 5
    }]
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: { ...baseLegend, position: 'bottom' },
      tooltip: {
        ...baseTooltip,
        callbacks: {
          label: (context) => {
            const row = rows[context.dataIndex];
            return ` ${row.label}: ${formatCurrency(row.amount)} (${row.share.toFixed(1)}%)`;
          }
        }
      }
    }
  };
  return (
    <div className="donut-wrap" style={{ height }}>
      <Doughnut data={data} options={options} />
      <div className="donut-center">
        <span>Costo total</span>
        <strong>{formatCurrencyCompact(total)}</strong>
      </div>
    </div>
  );
}

export function CashFlowChart({ months = [], height = 280 }) {
  const data = {
    labels: months.map((month) => month.label),
    datasets: [
      {
        label: 'Ingresos',
        data: months.map((month) => month.cashIncome),
        backgroundColor: COLORS.teal,
        borderRadius: 4,
        maxBarThickness: 18
      },
      {
        label: 'Egresos',
        data: months.map((month) => month.cashExpense),
        backgroundColor: COLORS.amber,
        borderRadius: 4,
        maxBarThickness: 18
      }
    ]
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: baseLegend,
      tooltip: { ...baseTooltip, callbacks: { label: currencyTooltip } }
    },
    scales: {
      ...baseScales,
      x: { ...baseScales.x, stacked: false }
    }
  };
  return wrap(<Bar data={data} options={options} />, height);
}

export function AgingChart({ labels = [], receivable = [], payable = [], height = 300 }) {
  const data = {
    labels,
    datasets: [
      {
        label: 'Por cobrar',
        data: receivable,
        backgroundColor: COLORS.teal,
        borderRadius: 5,
        maxBarThickness: 24
      },
      {
        label: 'Por pagar',
        data: payable,
        backgroundColor: COLORS.amber,
        borderRadius: 5,
        maxBarThickness: 24
      }
    ]
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: baseLegend,
      tooltip: { ...baseTooltip, callbacks: { label: currencyTooltip } }
    },
    scales: {
      x: {
        beginAtZero: true,
        border: { display: false },
        grid: { color: COLORS.grid, drawTicks: false },
        ticks: { callback: (value) => formatCurrencyCompact(value), color: '#79808a', font: { size: 10.5 } }
      },
      y: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: '#54606b', font: { size: 11, weight: '600' } }
      }
    }
  };
  return wrap(<Bar data={data} options={options} />, height);
}

export function ProjectionChart({ projection = [], height = 310 }) {
  const data = {
    labels: projection.map((week) => `Sem ${week.week}`),
    datasets: [
      {
        type: 'line',
        label: 'Caja proyectada',
        data: projection.map((week) => week.cumulative),
        borderColor: COLORS.navy,
        backgroundColor: 'rgba(29, 51, 72, 0.08)',
        fill: true,
        tension: 0.32,
        pointRadius: 3,
        pointBackgroundColor: COLORS.amber,
        pointBorderColor: COLORS.navy,
        pointBorderWidth: 1.5,
        borderWidth: 2.4,
        order: 1
      },
      {
        type: 'bar',
        label: 'Cobros',
        data: projection.map((week) => week.collect),
        backgroundColor: COLORS.green,
        borderRadius: 4,
        maxBarThickness: 14,
        order: 2
      },
      {
        type: 'bar',
        label: 'Pagos',
        data: projection.map((week) => week.pay),
        backgroundColor: '#e47e67',
        borderRadius: 4,
        maxBarThickness: 14,
        order: 2
      }
    ]
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: baseLegend,
      tooltip: { ...baseTooltip, callbacks: { label: currencyTooltip } }
    },
    scales: baseScales
  };
  return wrap(<Chart type="bar" data={data} options={options} />, height);
}

export function SimpleLineChart({ labels = [], values = [], label = 'Valor', color = COLORS.teal, height = 260 }) {
  const data = {
    labels,
    datasets: [{
      label,
      data: values,
      borderColor: color,
      backgroundColor: `${color}20`,
      fill: true,
      tension: 0.35,
      pointRadius: 2,
      borderWidth: 2
    }]
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { ...baseTooltip, callbacks: { label: currencyTooltip } }
    },
    scales: baseScales
  };
  return wrap(<Line data={data} options={options} />, height);
}

export const chartColors = COLORS;
