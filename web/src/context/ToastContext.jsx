import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X, XCircle } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const remove = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const toast = useCallback((message, type = 'success', options = {}) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((current) => [...current.slice(-3), { id, message, type, title: options.title }]);
    const timer = setTimeout(() => remove(id), options.duration || 4800);
    timers.current.set(id, timer);
    return id;
  }, [remove]);

  const value = useMemo(() => ({
    toast,
    success: (message, options) => toast(message, 'success', options),
    error: (message, options) => toast(message, 'error', options),
    warning: (message, options) => toast(message, 'warning', options),
    info: (message, options) => toast(message, 'info', options),
    remove
  }), [toast, remove]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((item) => {
          const Icon = ICONS[item.type] || Info;
          return (
            <div className={`toast toast-${item.type}`} key={item.id}>
              <Icon size={19} />
              <div className="toast-body">
                {item.title && <strong>{item.title}</strong>}
                <span>{item.message}</span>
              </div>
              <button type="button" className="toast-close" onClick={() => remove(item.id)} aria-label="Cerrar notificación">
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast debe usarse dentro de ToastProvider');
  return context;
}
