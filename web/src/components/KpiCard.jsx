import { useId, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Info, Minus, Sparkles } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { Semaforo } from './DataDisplay.jsx';
import { classNames, formatPercent } from '../utils.js';

export function Sparkline({ values = [], tone = 'green', height = 42, className }) {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gradientId = `spark-${rawId}`;
  const normalized = values.map((value) => Number(value) || 0);
  if (normalized.length < 2) return <div className={classNames('sparkline', className)} style={{ height }} />;
  const width = 180;
  const min = Math.min(...normalized);
  const max = Math.max(...normalized);
  const span = max - min || 1;
  const points = normalized.map((value, index) => {
    const x = (index / (normalized.length - 1)) * width;
    const y = height - 6 - ((value - min) / span) * (height - 12);
    return [x, y];
  });
  const path = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${path} L${width},${height} L0,${height} Z`;
  const color = tone === 'red' ? '#dc3545' : tone === 'amber' || tone === 'yellow' ? '#f5b301' : '#28a745';
  return (
    <svg className={classNames('sparkline', className)} viewBox={`0 0 ${width} ${height}`} style={{ height }} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="3" fill={color} stroke="#fffdf8" strokeWidth="1.5" />
    </svg>
  );
}

const STATUS_COPY = {
  green: 'Saludable',
  yellow: 'Requiere atención',
  red: 'Nivel crítico',
  neutral: 'Sin datos'
};

export function KpiCard({
  label,
  value,
  status = 'neutral',
  statusText,
  detail,
  action,
  formula,
  icon: Icon,
  variant = 'default',
  trend,
  trendLabel,
  sparkline,
  sparklineTone,
  children,
  className,
  onClick
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const trendValue = typeof trend === 'number' && Number.isFinite(trend) ? trend : null;
  const TrendIcon = trendValue === null ? Minus : trendValue >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <>
      <article
        className={classNames('kpi-card', `kpi-${status}`, `kpi-variant-${variant}`, onClick && 'is-clickable', className)}
        onClick={onClick}
      >
        <div className="kpi-head">
          <span className="kpi-label">
            {Icon && <span className="kpi-icon"><Icon size={17} /></span>}
            {label}
          </span>
          <button
            type="button"
            className="kpi-info"
            onClick={(event) => {
              event.stopPropagation();
              setInfoOpen(true);
            }}
            aria-label={`Ver fórmula y acción de ${label}`}
          >
            <Info size={14} />
          </button>
        </div>
        <div className="kpi-value-row">
          <strong className="kpi-value">{value}</strong>
          {trendValue !== null && (
            <span className={classNames('kpi-trend', trendValue >= 0 ? 'up' : 'down')}>
              <TrendIcon size={14} />
              {trendLabel || formatPercent(Math.abs(trendValue))}
            </span>
          )}
        </div>
        {detail && <p className="kpi-detail">{detail}</p>}
        {children}
        {sparkline && <Sparkline values={sparkline} tone={sparklineTone || (status === 'red' ? 'red' : status === 'yellow' ? 'amber' : 'green')} />}
        <div className="kpi-foot">
          <Semaforo tone={status} label={statusText || STATUS_COPY[status]} />
          {action && <span className="kpi-action-hint">{action}</span>}
        </div>
      </article>

      <Modal
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title={label}
        eyebrow="Cómo se calcula"
        size="sm"
        footer={<button type="button" className="btn btn-primary" onClick={() => setInfoOpen(false)}>Entendido</button>}
      >
        <div className="metric-info">
          <div className="metric-info-status">
            <Semaforo tone={status} label={statusText || STATUS_COPY[status]} />
          </div>
          {formula && (
            <div className="metric-formula">
              <span>Fórmula</span>
              <code>{formula}</code>
            </div>
          )}
          {action && (
            <div className="metric-action">
              <span><Sparkles size={14} /> Acción recomendada</span>
              <p>{action}</p>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
