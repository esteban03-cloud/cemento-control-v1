import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { classNames } from '../utils.js';

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  eyebrow,
  children,
  footer,
  size = 'md',
  className = '',
  closeOnOverlay = true,
  busy = false
}) {
  const closeRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy && closeOnOverlay) onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    const timeout = setTimeout(() => closeRef.current?.focus?.(), 60);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
      clearTimeout(timeout);
    };
  }, [open, onClose, closeOnOverlay, busy]);

  if (!open) return null;

  return createPortal(
    <div
      className={classNames('modal-root', `modal-${size}`, className)}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && closeOnOverlay && !busy) onClose?.();
      }}
    >
      <div className="modal-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        {(title || eyebrow) && (
          <header className="modal-header">
            <div>
              {eyebrow && <span className="eyebrow">{eyebrow}</span>}
              <h2 id={titleId}>{title}</h2>
              {subtitle && <p>{subtitle}</p>}
            </div>
            <button
              ref={closeRef}
              type="button"
              className="icon-button modal-close"
              onClick={() => !busy && onClose?.()}
              aria-label="Cerrar"
              disabled={busy}
            >
              <X size={20} />
            </button>
          </header>
        )}
        <div className="modal-content">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Confirmar acción',
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  busy = false
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      busy={busy}
      footer={(
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{cancelLabel}</button>
          <button
            type="button"
            className={classNames('btn', tone === 'danger' ? 'btn-danger' : 'btn-primary')}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Procesando…' : confirmLabel}
          </button>
        </>
      )}
    >
      <div className="confirm-copy">
        <div className={classNames('confirm-icon', `tone-${tone}`)} aria-hidden="true">!</div>
        <p>{message}</p>
      </div>
    </Modal>
  );
}
