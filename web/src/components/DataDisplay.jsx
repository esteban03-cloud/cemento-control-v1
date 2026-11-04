import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Inbox,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { api } from '../api.js';
import { useToast } from '../context/ToastContext.jsx';
import {
  classNames,
  formatNumber,
  initials,
  statusTone
} from '../utils.js';

export function PageHeader({ eyebrow, title, description, actions, children }) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
        {children}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}

export function SectionHeader({ eyebrow, title, description, action, className }) {
  return (
    <div className={classNames('section-header', className)}>
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

const STATUS_LABELS = {
  green: 'Saludable',
  yellow: 'Atención',
  red: 'Crítico',
  neutral: 'Sin datos'
};

export function Semaforo({ tone = 'neutral', label, showLabel = true, className }) {
  const normalized = tone || 'neutral';
  return (
    <span className={classNames('semaforo', `semaforo-${normalized}`, className)}>
      <span className="semaforo-dot" aria-hidden="true" />
      {showLabel && <span>{label || STATUS_LABELS[normalized] || normalized}</span>}
    </span>
  );
}

export function StatusBadge({ status, tone, label, dot = true, className }) {
  const resolvedTone = tone || statusTone(status);
  return (
    <span className={classNames('status-badge', `status-${resolvedTone}`, className)}>
      {dot && <span className="status-dot" aria-hidden="true" />}
      {label || status}
    </span>
  );
}

export function Avatar({ name, size = 36, tone = 0, className }) {
  return (
    <span
      className={classNames('avatar', `avatar-tone-${tone % 5}`, className)}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.33) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function IconButton({ label, icon: Icon, onClick, className, variant = 'default', disabled, type = 'button' }) {
  return (
    <button
      type={type}
      className={classNames('icon-button', `icon-button-${variant}`, className)}
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
    >
      <Icon size={17} />
    </button>
  );
}

export function Spinner({ size = 18, className }) {
  return <Loader2 size={size} className={classNames('spin', className)} aria-label="Cargando" />;
}

export function PageLoader({ label = 'Cargando información…' }) {
  return (
    <div className="page-loader">
      <Spinner size={28} />
      <span>{label}</span>
    </div>
  );
}

export function Skeleton({ height = 16, width = '100%', className, rounded = 8 }) {
  return (
    <span
      className={classNames('skeleton', className)}
      style={{ height, width, borderRadius: rounded }}
      aria-hidden="true"
    />
  );
}

export function EmptyState({ icon: Icon = Inbox, title = 'No hay registros', description, action, compact = false }) {
  return (
    <div className={classNames('empty-state', compact && 'compact')}>
      <span className="empty-icon"><Icon size={compact ? 22 : 28} /></span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function ErrorPanel({ error, onRetry, title = 'No pudimos cargar la información' }) {
  return (
    <div className="error-panel" role="alert">
      <span className="error-panel-icon"><AlertCircle size={22} /></span>
      <div>
        <h3>{title}</h3>
        <p>{error?.message || 'Ocurrió un error inesperado.'}</p>
        {onRetry && (
          <button type="button" className="btn btn-small btn-secondary" onClick={onRetry}>
            <RefreshCw size={14} /> Reintentar
          </button>
        )}
      </div>
    </div>
  );
}

export function DataTable({
  columns,
  rows,
  rowKey = 'id',
  loading = false,
  emptyTitle,
  emptyDescription,
  emptyAction,
  emptyIcon,
  className,
  rowClassName,
  footer,
  compact = false
}) {
  const getKey = typeof rowKey === 'function' ? rowKey : (row) => row[rowKey];
  return (
    <div className={classNames('table-card', className)}>
      <div className="table-scroll">
        <table className={classNames('data-table', compact && 'data-table-compact')}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={classNames(column.align && `align-${column.align}`, column.hideOnMobile && 'hide-mobile', column.className)}
                  style={column.width ? { width: column.width } : undefined}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 5 }).map((_, index) => (
              <tr key={`skeleton-${index}`} className="skeleton-row">
                {columns.map((column) => (
                  <td key={column.key} data-label={column.label}><Skeleton height={13} width={`${55 + ((index * 17) % 35)}%`} /></td>
                ))}
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="table-empty-cell">
                  <EmptyState
                    icon={emptyIcon}
                    title={emptyTitle || 'Sin resultados'}
                    description={emptyDescription || 'Ajusta los filtros o crea el primer registro.'}
                    action={emptyAction}
                    compact
                  />
                </td>
              </tr>
            )}
            {!loading && rows.map((row, index) => (
              <tr key={getKey(row)} className={classNames(rowClassName?.(row), row._className)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    data-label={column.label}
                    className={classNames(column.align && `align-${column.align}`, column.hideOnMobile && 'hide-mobile', column.cellClassName)}
                  >
                    {column.render ? column.render(row, index) : row[column.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer}
    </div>
  );
}

export function Pagination({ page, pages, total, limit, onChange, label = 'registros' }) {
  if (!total) return null;
  const start = (page - 1) * limit + 1;
  const end = Math.min(total, page * limit);
  return (
    <div className="table-pagination">
      <span>Mostrando <strong>{formatNumber(start)}–{formatNumber(end)}</strong> de <strong>{formatNumber(total)}</strong> {label}</span>
      <div className="pagination-controls">
        <button type="button" className="pagination-button" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Página anterior">
          <ChevronLeft size={16} />
        </button>
        <span className="pagination-page">Página {page} de {pages}</span>
        <button type="button" className="pagination-button" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Página siguiente">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export function DownloadMenu({ items = [], label = 'Exportar', className, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const containerRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    if (!open) return undefined;
    const clickOutside = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', clickOutside);
    return () => document.removeEventListener('mousedown', clickOutside);
  }, [open]);

  const handleItem = async (item) => {
    if (item.onClick) {
      await item.onClick();
      setOpen(false);
      return;
    }
    setBusy(item.label);
    try {
      await api.download(item.path, item.filename || 'reporte');
      toast.success('Reporte descargado correctamente.');
      setOpen(false);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(null);
    }
  };

  if (!items.length) return null;
  return (
    <div className={classNames('download-menu', className)} ref={containerRef}>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen((value) => !value)} disabled={disabled}>
        <Download size={16} />
        {label}
        <ChevronDown size={14} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div className="download-menu-list" role="menu">
          {items.map((item) => (
            <button
              type="button"
              key={item.label}
              className="download-menu-item"
              onClick={() => handleItem(item)}
              disabled={Boolean(busy)}
              role="menuitem"
            >
              {item.icon || <Download size={15} />}
              <span>
                {busy === item.label ? 'Generando…' : item.label}
                {busy === item.label && <Spinner size={13} />}
              </span>
              {item.hint && <small>{item.hint}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SummaryTile({ label, value, hint, tone = 'default', icon: Icon, className }) {
  return (
    <div className={classNames('summary-tile', `tile-${tone}`, className)}>
      <div className="summary-tile-top">
        <span>{label}</span>
        {Icon && <span className="summary-tile-icon"><Icon size={17} /></span>}
      </div>
      <strong>{value}</strong>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function ProgressBar({ value = 0, tone = 'accent', label, className }) {
  const safe = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={classNames('progress', className)}>
      <div className="progress-track">
        <div className={classNames('progress-value', `tone-${tone}`)} style={{ width: `${safe}%` }} />
      </div>
      {label && <span className="progress-label">{label}</span>}
    </div>
  );
}

export function SuccessBanner({ children, className }) {
  return (
    <div className={classNames('success-banner', className)}>
      <CheckCircle2 size={18} />
      <div>{children}</div>
    </div>
  );
}

export function TabBar({ tabs, active, onChange, className }) {
  return (
    <div className={classNames('tab-bar', className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          className={classNames('tab', active === tab.key && 'active')}
          onClick={() => onChange(tab.key)}
        >
          {tab.icon}
          {tab.label}
          {tab.badge !== undefined && <span className="tab-badge">{tab.badge}</span>}
        </button>
      ))}
    </div>
  );
}
